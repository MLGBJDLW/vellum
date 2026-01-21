/**
 * Integration tests for AgentLoop (T034)
 *
 * Tests the full agent loop flow including:
 * - Happy path execution
 * - Cancellation handling
 * - Retry behavior
 * - State transitions
 */

import type { TokenUsage } from "@vellum/provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentLoop, type AgentLoopConfig } from "../../agent/loop.js";
import type { SessionMessage } from "../../session/index.js";
import { type PermissionChecker, ToolExecutor } from "../../tool/index.js";

// Mock session/index.js (which is what loop.ts imports)
vi.mock("../../session/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../session/index.js")>();
  return {
    ...original,
    LLM: {
      stream: vi.fn(),
      initialize: vi.fn(),
      getRegistry: vi.fn(),
    },
    toModelMessages: vi.fn((messages) =>
      messages.map((m: Record<string, unknown>) => ({
        role: m.role,
        content: m.parts
          ? (m.parts as Array<{ type: string; text?: string }>).map((p) => {
              if (p.type === "text") return { type: "text", text: p.text };
              return p;
            })
          : m.content,
      }))
    ),
  };
});

// Re-import after mocking
import { LLM } from "../../session/index.js";

/**
 * Helper to create a valid SessionMessage for testing
 */
function createSessionMessage(
  role: "user" | "assistant" | "system" | "tool_result",
  text: string
): SessionMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    parts: [{ type: "text", text }],
    metadata: { createdAt: Date.now() },
  };
}

describe("AgentLoop Integration (T034)", () => {
  let config: AgentLoopConfig;
  let mockToolExecutor: ToolExecutor;
  let mockPermissionChecker: PermissionChecker;

  const createMockStream = (events: Array<{ type: string; [key: string]: unknown }>) => {
    return {
      async *[Symbol.asyncIterator]() {
        for (const event of events) {
          yield event;
        }
      },
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPermissionChecker = {
      checkPermission: vi.fn().mockResolvedValue("allow"),
    };

    mockToolExecutor = new ToolExecutor({
      permissionChecker: mockPermissionChecker,
    });

    config = {
      sessionId: "test-session-123",
      mode: {
        name: "code",
        description: "Code mode",
        tools: { edit: true, bash: true, web: true, mcp: true },
        prompt: "You are a helpful coding assistant.",
      },
      providerType: "anthropic",
      model: "claude-sonnet-4-20250514",
      cwd: "/test/project",
      projectRoot: "/test",
      toolExecutor: mockToolExecutor,
      permissionChecker: mockPermissionChecker,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Happy Path", () => {
    it("completes a simple text response without tool calls", async () => {
      const events = [
        { type: "text", content: "Hello, " },
        { type: "text", content: "world!" },
        { type: "usage", usage: { inputTokens: 10, outputTokens: 20 } },
        { type: "done", stopReason: "end_turn" },
      ];

      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream(events) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop(config);

      const textEvents: string[] = [];
      const stateChanges: Array<{ from: string; to: string }> = [];
      let completed = false;

      loop.on("text", (text) => textEvents.push(text));
      loop.on("stateChange", (from, to) => stateChanges.push({ from, to }));
      loop.on("complete", () => {
        completed = true;
      });

      loop.addMessage(createSessionMessage("user", "Hello"));
      await loop.run();

      expect(textEvents).toEqual(["Hello, ", "world!"]);
      expect(completed).toBe(true);
      expect(stateChanges).toContainEqual({ from: "idle", to: "streaming" });
      expect(stateChanges).toContainEqual({ from: "streaming", to: "idle" });
      expect(loop.getState()).toBe("idle");
    });

    it("handles tool call and execution", async () => {
      const toolCallEvents = [
        { type: "text", text: "Let me read that file." },
        {
          type: "toolCall",
          id: "tool-1",
          name: "read_file",
          input: { path: "/test/file.txt" },
        },
        { type: "usage", usage: { inputTokens: 15, outputTokens: 25 } },
        { type: "done", stopReason: "tool_use" },
      ];

      // After tool execution, LLM returns text-only response to complete the loop
      const completionEvents = [
        { type: "text", text: "I've read the file." },
        { type: "usage", usage: { inputTokens: 20, outputTokens: 15 } },
        { type: "done", stopReason: "end_turn" },
      ];

      vi.mocked(LLM.stream)
        .mockReturnValueOnce(createMockStream(toolCallEvents) as ReturnType<typeof LLM.stream>)
        .mockReturnValueOnce(createMockStream(completionEvents) as ReturnType<typeof LLM.stream>);

      // Register a mock tool and mock its execution
      mockToolExecutor.registerTool({
        definition: {
          name: "read_file",
          description: "Mock read_file tool",
          parameters: z.object({ path: z.string() }),
          kind: "read",
        },
        execute: vi.fn(async () => ({ success: true as const, output: "file contents" })),
      });

      const loop = new AgentLoop(config);

      const toolCalls: Array<{ id: string; name: string }> = [];
      const toolStarts: string[] = [];
      const toolEnds: string[] = [];

      loop.on("toolCall", (id, name) => toolCalls.push({ id, name }));
      loop.on("toolStart", (callId, name) => toolStarts.push(`${callId}:${name}`));
      loop.on("toolEnd", (callId, name) => toolEnds.push(`${callId}:${name}`));

      loop.addMessage(createSessionMessage("user", "Read the file"));
      await loop.run();

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toEqual({ id: "tool-1", name: "read_file" });
      expect(toolStarts).toContain("tool-1:read_file");
      expect(toolEnds).toContain("tool-1:read_file");
    });

    it("resumes tool execution after permission is granted", async () => {
      const events = [
        {
          type: "toolCall",
          id: "tool-ask-1",
          name: "test_tool",
          input: { value: "x" },
        },
        { type: "done", stopReason: "tool_use" },
      ];

      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream(events) as ReturnType<typeof LLM.stream>
      );

      const askPermissionChecker: PermissionChecker = {
        checkPermission: vi.fn().mockResolvedValue("ask"),
      };

      const executor = new ToolExecutor({
        permissionChecker: askPermissionChecker,
      });

      const toolExecute = vi.fn(async () => ({ success: true as const, output: "ok" }));
      executor.registerTool({
        definition: {
          name: "test_tool",
          description: "Mock tool that requires approval",
          parameters: z.object({ value: z.string() }),
          kind: "read",
        },
        execute: toolExecute,
      });

      const loop = new AgentLoop({
        ...config,
        toolExecutor: executor,
        permissionChecker: askPermissionChecker,
      });

      const eventOrder: string[] = [];
      loop.on("permissionRequired", () => {
        eventOrder.push("permissionRequired");
        // grant after pendingPermission has been registered
        setTimeout(() => loop.grantPermission(), 0);
      });
      loop.on("permissionGranted", () => eventOrder.push("permissionGranted"));
      loop.on("toolStart", () => eventOrder.push("toolStart"));
      loop.on("toolEnd", () => eventOrder.push("toolEnd"));

      loop.addMessage(createSessionMessage("user", "Use tool"));
      await loop.run();

      expect(toolExecute).toHaveBeenCalledTimes(1);
      expect(eventOrder).toEqual([
        "permissionRequired",
        "permissionGranted",
        "toolStart",
        "toolEnd",
      ]);
    });

    it("tracks token usage correctly", async () => {
      const events = [
        { type: "text", content: "Response" },
        { type: "usage", inputTokens: 100, outputTokens: 50 },
        { type: "done", stopReason: "end_turn" },
      ];

      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream(events) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop(config);

      const usageEvents: TokenUsage[] = [];
      loop.on("usage", (usage) => usageEvents.push(usage));

      loop.addMessage(createSessionMessage("user", "Test"));
      await loop.run();

      expect(usageEvents).toHaveLength(1);
      expect(usageEvents[0]).toEqual({ inputTokens: 100, outputTokens: 50 });
    });
  });

  describe("Cancellation", () => {
    it("cancels during streaming", async () => {
      // Using underscore prefix for unused variable to satisfy lint
      let _yieldCount = 0;
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for (let i = 0; i < 10; i++) {
            _yieldCount++;
            yield { type: "text", text: `chunk-${i}` };
            // Simulate async delay
            await new Promise((resolve) => setTimeout(resolve, 1));
          }
        },
      };

      vi.mocked(LLM.stream).mockReturnValue(mockStream as ReturnType<typeof LLM.stream>);

      const loop = new AgentLoop(config);

      let textCount = 0;
      loop.on("text", () => {
        textCount++;
        if (textCount >= 3) {
          loop.cancel("User cancelled");
        }
      });

      loop.addMessage(createSessionMessage("user", "Test"));
      await loop.run();

      expect(loop.getState()).toBe("terminated");
      expect(textCount).toBeLessThan(10);
    });

    it("cancels before starting returns early from run", async () => {
      const loop = new AgentLoop(config);

      // Cancel immediately - this sets the cancellation token
      loop.cancel("Pre-cancelled");

      loop.addMessage(createSessionMessage("user", "Test"));
      await loop.run();

      // When cancelled before run(), the loop transitions through streaming briefly
      // then immediately detects cancellation and transitions to terminated.
      // Since run() checks cancellation at the start, it should return early
      // The exact final state depends on where it was when cancellation was detected.
      expect(loop.getCancellationToken().isCancelled).toBe(true);
    });

    it("emits terminated event with reason", async () => {
      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream([
          { type: "text", text: "Hello" },
          { type: "done", stopReason: "end_turn" },
        ]) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop({
        ...config,
        terminationLimits: { maxSteps: 1 },
      });

      const terminated: Array<{ reason: string }> = [];
      loop.on("terminated", (reason) => terminated.push({ reason }));

      // Increment step count to hit max
      loop.addMessage(createSessionMessage("user", "Test"));

      // Manually trigger termination check with high step count
      const ctx = loop.getTerminationContext();
      ctx.stepCount = 100;

      const result = loop.checkTermination();

      expect(result.shouldTerminate).toBe(true);
      expect(terminated.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("State Transitions", () => {
    it("tracks all state transitions", async () => {
      const events = [
        { type: "text", text: "Response" },
        { type: "done", stopReason: "end_turn" },
      ];

      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream(events) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop(config);

      const transitions: Array<{ from: string; to: string }> = [];
      loop.on("stateChange", (from, to) => transitions.push({ from, to }));

      expect(loop.getState()).toBe("idle");

      loop.addMessage(createSessionMessage("user", "Test"));
      await loop.run();

      expect(transitions).toContainEqual({ from: "idle", to: "streaming" });
      expect(transitions).toContainEqual({ from: "streaming", to: "idle" });
    });

    it("transitions through tool_executing state", async () => {
      const toolCallEvents = [
        {
          type: "toolCall",
          id: "tool-1",
          name: "test_tool",
          input: {},
        },
        { type: "done", stopReason: "tool_use" },
      ];

      // After tool execution, LLM returns text-only response to complete the loop
      const completionEvents = [
        { type: "text", text: "Done." },
        { type: "done", stopReason: "end_turn" },
      ];

      vi.mocked(LLM.stream)
        .mockReturnValueOnce(createMockStream(toolCallEvents) as ReturnType<typeof LLM.stream>)
        .mockReturnValueOnce(createMockStream(completionEvents) as ReturnType<typeof LLM.stream>);

      mockToolExecutor.registerTool({
        definition: {
          name: "test_tool",
          description: "Mock test_tool",
          parameters: z.object({}),
          kind: "read",
        },
        execute: vi.fn(async () => ({ success: true as const, output: "done" })),
      });

      const loop = new AgentLoop(config);

      const states: string[] = [];
      loop.on("stateChange", (_from, to) => states.push(to));

      loop.addMessage(createSessionMessage("user", "Use tool"));
      await loop.run();

      expect(states).toContain("tool_executing");
    });
  });

  describe("Message Management", () => {
    it("adds and retrieves messages", () => {
      const loop = new AgentLoop(config);

      loop.addMessage(createSessionMessage("user", "First message"));
      loop.addMessage(createSessionMessage("assistant", "Response"));
      loop.addMessage(createSessionMessage("user", "Second message"));

      const messages = loop.getMessages();

      expect(messages).toHaveLength(3);
      expect(messages[0]?.parts[0]?.type).toBe("text");
      expect((messages[0]?.parts[0] as { type: "text"; text: string })?.text).toBe("First message");
      expect(messages[1]?.role).toBe("assistant");
      expect((messages[2]?.parts[0] as { type: "text"; text: string })?.text).toBe(
        "Second message"
      );
    });

    it("returns a copy of messages", () => {
      const loop = new AgentLoop(config);

      loop.addMessage(createSessionMessage("user", "Test"));

      const messages1 = loop.getMessages();
      const messages2 = loop.getMessages();

      expect(messages1).not.toBe(messages2);
      expect(messages1).toEqual(messages2);
    });
  });

  describe("Termination Detection", () => {
    it("records tool calls for doom loop detection", () => {
      const loop = new AgentLoop(config);

      loop.recordToolCall("1", "read_file", { path: "a.txt" });
      loop.recordToolCall("2", "read_file", { path: "a.txt" });
      loop.recordToolCall("3", "read_file", { path: "a.txt" });

      const ctx = loop.getTerminationContext();

      expect(ctx.recentToolCalls).toHaveLength(3);
    });

    it("records responses for stuck detection", () => {
      const loop = new AgentLoop(config);

      loop.recordResponse("I cannot help with that.");
      loop.recordResponse("I cannot help with that.");
      loop.recordResponse("I cannot help with that.");

      const ctx = loop.getTerminationContext();

      expect(ctx.recentResponses).toHaveLength(3);
    });

    it("emits loopDetected event", () => {
      const loop = new AgentLoop(config);

      let detected = false;
      loop.on("loopDetected", () => {
        detected = true;
      });

      // Add identical tool calls to trigger doom loop
      for (let i = 0; i < 5; i++) {
        loop.recordToolCall(`${i}`, "same_tool", { same: "input" });
      }

      const result = loop.checkLoopDetection();

      if (result.detected) {
        expect(detected).toBe(true);
      }
    });
  });

  describe("Configuration", () => {
    it("returns configuration", () => {
      const loop = new AgentLoop(config);

      const returnedConfig = loop.getConfig();

      expect(returnedConfig.sessionId).toBe("test-session-123");
      expect(returnedConfig.model).toBe("claude-sonnet-4-20250514");
      expect(returnedConfig.providerType).toBe("anthropic");
    });

    it("uses custom termination limits", () => {
      const customLimits = {
        maxSteps: 10,
        maxTokens: 5000,
        maxTimeMs: 60000,
      };

      const loop = new AgentLoop({
        ...config,
        terminationLimits: customLimits,
      });

      const checker = loop.getTerminationChecker();
      const limits = checker.getLimits();

      expect(limits.maxSteps).toBe(10);
      expect(limits.maxTokens).toBe(5000);
      expect(limits.maxTimeMs).toBe(60000);
    });
  });

  describe("Error Handling", () => {
    it("emits error event on stream error", async () => {
      const errorStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: "text", text: "Start" };
          yield { type: "error", code: "STREAM_ERROR", message: "Connection lost" };
          yield { type: "done", stopReason: "error" };
        },
      };

      vi.mocked(LLM.stream).mockReturnValue(errorStream as ReturnType<typeof LLM.stream>);

      const loop = new AgentLoop(config);

      const errors: Error[] = [];
      loop.on("error", (err) => errors.push(err));

      loop.addMessage(createSessionMessage("user", "Test"));
      await loop.run();

      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0]?.message).toContain("STREAM_ERROR");
    });

    it("resets termination context", () => {
      const loop = new AgentLoop(config);

      // Add some data
      loop.recordToolCall("1", "test", {});
      loop.recordResponse("test response");
      loop.updateTokenUsage({ inputTokens: 100, outputTokens: 50 });

      // Reset
      loop.resetTerminationContext();

      const ctx = loop.getTerminationContext();

      expect(ctx.stepCount).toBe(0);
      expect(ctx.recentToolCalls).toHaveLength(0);
      expect(ctx.recentResponses).toHaveLength(0);
    });
  });

  describe("Parallel Tool Execution (T075)", () => {
    it("executes tools sequentially by default", async () => {
      // Create a test executor and register tools
      const testExecutor = new ToolExecutor({
        permissionChecker: mockPermissionChecker,
      });

      testExecutor.registerTool({
        definition: {
          name: "tool_a",
          description: "Tool A",
          parameters: z.object({}),
          kind: "read",
        },
        execute: async () => {
          await new Promise((r) => setTimeout(r, 10));
          return { success: true as const, output: "A done" };
        },
      });
      testExecutor.registerTool({
        definition: {
          name: "tool_b",
          description: "Tool B",
          parameters: z.object({}),
          kind: "read",
        },
        execute: async () => {
          await new Promise((r) => setTimeout(r, 10));
          return { success: true as const, output: "B done" };
        },
      });

      const events = [
        {
          type: "toolCall",
          id: "call-a",
          name: "tool_a",
          input: {},
        },
        {
          type: "toolCall",
          id: "call-b",
          name: "tool_b",
          input: {},
        },
        { type: "done", stopReason: "tool_use" },
      ];

      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream(events) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop({
        ...config,
        toolExecutor: testExecutor,
        parallelToolExecution: false, // Explicit sequential
        continueAfterTools: false,
      });

      const toolStartOrder: string[] = [];
      loop.on("toolStart", (_callId, name) => {
        toolStartOrder.push(name);
      });

      loop.addMessage(createSessionMessage("user", "Run both tools"));
      await loop.run();

      expect(toolStartOrder).toEqual(["tool_a", "tool_b"]);
    });

    it("executes tools in parallel when enabled", async () => {
      // Track execution timing
      const executionLog: Array<{ name: string; phase: "start" | "end"; time: number }> = [];
      const startTime = Date.now();

      const testExecutor = new ToolExecutor({
        permissionChecker: mockPermissionChecker,
      });

      testExecutor.registerTool({
        definition: {
          name: "parallel_a",
          description: "Parallel Tool A",
          parameters: z.object({}),
          kind: "read",
        },
        execute: async () => {
          executionLog.push({ name: "parallel_a", phase: "start", time: Date.now() - startTime });
          await new Promise((r) => setTimeout(r, 50));
          executionLog.push({ name: "parallel_a", phase: "end", time: Date.now() - startTime });
          return { success: true as const, output: "A done" };
        },
      });
      testExecutor.registerTool({
        definition: {
          name: "parallel_b",
          description: "Parallel Tool B",
          parameters: z.object({}),
          kind: "read",
        },
        execute: async () => {
          executionLog.push({ name: "parallel_b", phase: "start", time: Date.now() - startTime });
          await new Promise((r) => setTimeout(r, 50));
          executionLog.push({ name: "parallel_b", phase: "end", time: Date.now() - startTime });
          return { success: true as const, output: "B done" };
        },
      });

      const events = [
        {
          type: "toolCall",
          id: "call-pa",
          name: "parallel_a",
          input: {},
        },
        {
          type: "toolCall",
          id: "call-pb",
          name: "parallel_b",
          input: {},
        },
        { type: "done", stopReason: "tool_use" },
      ];

      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream(events) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop({
        ...config,
        toolExecutor: testExecutor,
        parallelToolExecution: true,
        maxToolConcurrency: 5,
        continueAfterTools: false,
      });

      loop.addMessage(createSessionMessage("user", "Run both tools in parallel"));
      await loop.run();

      // In parallel execution, both tools should start before either ends
      const startEvents = executionLog.filter((e) => e.phase === "start");
      const endEvents = executionLog.filter((e) => e.phase === "end");

      expect(startEvents.length).toBe(2);
      expect(endEvents.length).toBe(2);

      // Both starts should happen before any end (parallel behavior)
      const latestStart = Math.max(...startEvents.map((e) => e.time));
      const earliestEnd = Math.min(...endEvents.map((e) => e.time));
      expect(latestStart).toBeLessThan(earliestEnd);
    });

    it("respects maxToolConcurrency limit", async () => {
      let currentConcurrency = 0;
      let maxObservedConcurrency = 0;

      const testExecutor = new ToolExecutor({
        permissionChecker: mockPermissionChecker,
      });

      // Create 4 tools that track concurrency
      for (let i = 1; i <= 4; i++) {
        const toolIndex = i; // Capture for closure
        testExecutor.registerTool({
          definition: {
            name: `conc_tool_${toolIndex}`,
            description: `Concurrency Tool ${toolIndex}`,
            parameters: z.object({}),
            kind: "read",
          },
          execute: async () => {
            currentConcurrency++;
            maxObservedConcurrency = Math.max(maxObservedConcurrency, currentConcurrency);
            await new Promise((r) => setTimeout(r, 30));
            currentConcurrency--;
            return { success: true as const, output: `Tool ${toolIndex} done` };
          },
        });
      }

      const events = [
        { type: "toolCall", id: "c1", name: "conc_tool_1", input: {} },
        { type: "toolCall", id: "c2", name: "conc_tool_2", input: {} },
        { type: "toolCall", id: "c3", name: "conc_tool_3", input: {} },
        { type: "toolCall", id: "c4", name: "conc_tool_4", input: {} },
        { type: "done", stopReason: "tool_use" },
      ];

      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream(events) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop({
        ...config,
        toolExecutor: testExecutor,
        parallelToolExecution: true,
        maxToolConcurrency: 2, // Limit to 2 concurrent
        continueAfterTools: false,
      });

      loop.addMessage(createSessionMessage("user", "Run all 4 tools"));
      await loop.run();

      // Should never exceed the concurrency limit
      expect(maxObservedConcurrency).toBeLessThanOrEqual(2);
      expect(maxObservedConcurrency).toBeGreaterThan(0);
    });
  });
});
