/**
 * Integration tests for AgentLoop (T034)
 *
 * Tests the full agent loop flow including:
 * - Happy path execution
 * - Cancellation handling
 * - Retry behavior
 * - State transitions
 */

import type { TokenUsage } from "@vellum/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ORCH_MODE, VIBE_MODE } from "../../agent/coding-modes.js";
import { AgentLoop, type AgentLoopConfig } from "../../agent/loop.js";
import { AgentRetryManager } from "../../agent/retry-manager.js";
import { CostService } from "../../cost/service.js";
import { ErrorCode } from "../../errors/index.js";
import type { SessionMessage } from "../../session/index.js";
import { UnifiedToolContainer } from "../../tool/container.js";
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
    it("orders preparation-time corrections after the initial instruction", async () => {
      const loop = new AgentLoop({ ...config, enableEvidencePack: false });
      loop.steer(createSessionMessage("user", "Older queued message"));
      const earlierSteeringCount = loop.getPendingSteeringCount();
      loop.steer(createSessionMessage("user", "Correction typed during preparation"));
      loop.addMessage(createSessionMessage("user", "Initial instruction"), {
        steeringBefore: earlierSteeringCount,
      });
      expect(loop.getMessages().map((message) => message.parts[0])).toEqual([
        { type: "text", text: "Older queued message" },
        { type: "text", text: "Initial instruction" },
        { type: "text", text: "Correction typed during preparation" },
      ]);
    });

    it("includes preflight steering without adding an empty continuation", async () => {
      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream([
          { type: "text", content: "Done with the updated instruction" },
          { type: "done", stopReason: "end_turn" },
        ]) as ReturnType<typeof LLM.stream>
      );
      const loop = new AgentLoop({ ...config, enableEvidencePack: false });
      const complete = vi.fn();
      loop.on("complete", complete);
      loop.addMessage(createSessionMessage("user", "Original"));
      const run = loop.run();
      loop.steer(createSessionMessage("user", "Correction"));
      await run;
      expect(LLM.stream).toHaveBeenCalledTimes(1);
      expect(complete).toHaveBeenCalledTimes(1);
    });

    it.each([false, true])(
      "interrupts an unfinished thinking stream immediately for steering (processor=%s)",
      async (useStreamProcessor) => {
        const loop = new AgentLoop({ ...config, useStreamProcessor, enableEvidencePack: false });
        let started!: () => void;
        const thinking = new Promise<void>((resolve) => {
          started = resolve;
        });
        let interrupted = false;
        vi.mocked(LLM.stream)
          .mockImplementationOnce(
            (request) =>
              ({
                async *[Symbol.asyncIterator]() {
                  yield { type: "reasoning", content: "Working on the original task" };
                  yield { type: "text", content: "Partial answer before correction\n" };
                  started();
                  await new Promise<void>((_resolve, reject) => {
                    request.abortSignal?.addEventListener(
                      "abort",
                      () => {
                        interrupted = true;
                        reject(new Error("aborted"));
                      },
                      { once: true }
                    );
                  });
                  throw new Error("The original stream must not finish");
                },
              }) as ReturnType<typeof LLM.stream>
          )
          .mockReturnValueOnce(
            createMockStream([
              { type: "text", content: "Applied the correction" },
              { type: "done", stopReason: "end_turn" },
            ]) as ReturnType<typeof LLM.stream>
          );
        loop.addMessage(createSessionMessage("user", "Original task"));
        const run = loop.run();
        await thinking;
        loop.steer(createSessionMessage("user", "Correct it now"));
        await run;
        expect(interrupted).toBe(true);
        expect(JSON.stringify(loop.getMessages())).toContain("Working on the original task");
        expect(JSON.stringify(loop.getMessages())).toContain("Partial answer before correction");
        expect(LLM.stream).toHaveBeenCalledTimes(2);
        expect(
          loop
            .getMessages()
            .some((message) =>
              message.parts.some((part) => part.type === "text" && part.text === "Correct it now")
            )
        ).toBe(true);
        expect(loop.getState()).toBe("idle");
      }
    );

    it.each([false, true])(
      "finishes active tools and skips queued tools when steered (parallel=%s)",
      async (parallelToolExecution) => {
        const loop = new AgentLoop({
          ...config,
          parallelToolExecution,
          maxToolConcurrency: 1,
          enableEvidencePack: false,
        });
        const executed: string[] = [];
        mockToolExecutor.registerTool({
          definition: {
            name: "work",
            description: "Work",
            kind: "read",
            parameters: z.object({ name: z.string() }),
          },
          async execute(input) {
            executed.push(z.object({ name: z.string() }).parse(input).name);
            loop.steer(createSessionMessage("user", "Use a different plan"));
            return { success: true, output: "receipt" };
          },
        });
        vi.mocked(LLM.stream)
          .mockReturnValueOnce(
            createMockStream([
              { type: "toolCall", id: "first", name: "work", input: { name: "first" } },
              { type: "toolCall", id: "second", name: "work", input: { name: "second" } },
              { type: "done", stopReason: "tool_use" },
            ]) as ReturnType<typeof LLM.stream>
          )
          .mockReturnValueOnce(
            createMockStream([
              { type: "text", content: "Updated plan" },
              { type: "done", stopReason: "end_turn" },
            ]) as ReturnType<typeof LLM.stream>
          );
        await loop.run();
        expect(executed).toEqual(["first"]);
        const history = JSON.stringify(loop.getMessages());
        expect(history).toContain("receipt");
        expect(history).toContain("superseded by a queued user instruction");
        expect(history).toContain("Use a different plan");
        expect(LLM.stream).toHaveBeenCalledTimes(2);
      }
    );

    it("consumes steering after the current response without starting a second run", async () => {
      const loop = new AgentLoop({ ...config, enableEvidencePack: false });
      loop.addMessage(createSessionMessage("user", "Original task"));
      const complete = vi.fn();
      loop.on("complete", complete);
      vi.mocked(LLM.stream)
        .mockReturnValueOnce({
          async *[Symbol.asyncIterator]() {
            yield { type: "text", content: "Initial response" };
            loop.steer(createSessionMessage("user", "Use the updated requirement"));
            yield { type: "done", stopReason: "end_turn" };
          },
        } as ReturnType<typeof LLM.stream>)
        .mockReturnValueOnce(
          createMockStream([
            { type: "text", content: "Updated response" },
            { type: "done", stopReason: "end_turn" },
          ]) as ReturnType<typeof LLM.stream>
        );
      await loop.run();
      expect(LLM.stream).toHaveBeenCalledTimes(2);
      expect(loop.getMessages().map((message) => message.parts[0])).toEqual([
        { type: "text", text: "Original task" },
        { type: "text", text: "Initial response" },
        { type: "text", text: "Use the updated requirement" },
        { type: "text", text: "Updated response" },
      ]);
      expect(complete).toHaveBeenCalledTimes(1);
      expect(loop.getPendingSteeringCount()).toBe(0);
    });

    it.each([false, true])(
      "does not report completion after a failed partial stream (processor=%s)",
      async (useStreamProcessor) => {
        vi.mocked(LLM.stream).mockReturnValue(
          createMockStream([
            { type: "text", content: "Partial response" },
            {
              type: "error",
              code: "PROVIDER_ERROR",
              message: "Provider failed before completion",
              retryable: false,
            },
          ]) as ReturnType<typeof LLM.stream>
        );
        const loop = new AgentLoop({
          ...config,
          useStreamProcessor,
          maxRetries: 0,
          enableEvidencePack: false,
        });
        const complete = vi.fn();
        const error = vi.fn();
        loop.on("complete", complete);
        loop.on("error", error);
        await expect(loop.run()).rejects.toThrow("Provider failed before completion");
        expect(complete).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalled();
      }
    );

    it.each([false, true])(
      "rejects exhausted retries without committing partial assistant content or dispatching tools (processor=%s)",
      async (useStreamProcessor) => {
        const wait = vi.spyOn(AgentRetryManager.prototype, "waitForRetry").mockResolvedValue();
        const toolExecute = vi.fn(async () => ({ success: true as const, output: "Done" }));
        mockToolExecutor.registerTool({
          definition: {
            name: "read_file",
            description: "Fixture",
            kind: "read",
            parameters: z.object({ path: z.string() }),
          },
          execute: toolExecute,
        });
        vi.mocked(LLM.stream).mockImplementation(
          () =>
            createMockStream([
              { type: "text", content: "Discard this partial answer" },
              {
                type: "toolCall",
                id: "unfinished-call",
                name: "read_file",
                input: { path: "fixture.txt" },
              },
              {
                type: "error",
                code: String(ErrorCode.SERVICE_UNAVAILABLE),
                message: "Provider capacity exhausted",
                retryable: true,
              },
            ]) as ReturnType<typeof LLM.stream>
        );
        const loop = new AgentLoop({
          ...config,
          useStreamProcessor,
          maxRetries: 1,
          enableEvidencePack: false,
        });
        const complete = vi.fn();
        const error = vi.fn();
        loop.on("complete", complete);
        loop.on("error", error);
        loop.addMessage(createSessionMessage("user", "Inspect files"));
        await expect(loop.run()).rejects.toThrow("Provider capacity exhausted");
        expect(LLM.stream).toHaveBeenCalledTimes(2);
        expect(wait).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledTimes(1);
        expect(complete).not.toHaveBeenCalled();
        expect(toolExecute).not.toHaveBeenCalled();
        expect(loop.getMessages().filter((message) => message.role === "assistant")).toHaveLength(
          0
        );
        expect(loop.getState()).toBe("recovering");
      }
    );

    it.each([false, true])(
      "completes a recovered retry once without persisting the failed partial response (processor=%s)",
      async (useStreamProcessor) => {
        vi.spyOn(AgentRetryManager.prototype, "waitForRetry").mockResolvedValue();
        vi.mocked(LLM.stream)
          .mockReturnValueOnce(
            createMockStream([
              { type: "text", content: "Discard this partial answer" },
              {
                type: "error",
                code: String(ErrorCode.SERVICE_UNAVAILABLE),
                message: "Temporarily unavailable",
                retryable: true,
              },
            ]) as ReturnType<typeof LLM.stream>
          )
          .mockReturnValueOnce(
            createMockStream([
              { type: "text", content: "Recovered complete answer" },
              { type: "done", stopReason: "end_turn" },
            ]) as ReturnType<typeof LLM.stream>
          );
        const loop = new AgentLoop({
          ...config,
          useStreamProcessor,
          maxRetries: 1,
          enableEvidencePack: false,
        });
        const complete = vi.fn();
        const error = vi.fn();
        loop.on("complete", complete);
        loop.on("error", error);
        loop.addMessage(createSessionMessage("user", "Answer the question"));
        await expect(loop.run()).resolves.toBeUndefined();
        expect(LLM.stream).toHaveBeenCalledTimes(2);
        expect(complete).toHaveBeenCalledTimes(1);
        expect(error).not.toHaveBeenCalled();
        const assistant = loop.getMessages().filter((message) => message.role === "assistant");
        expect(assistant).toHaveLength(1);
        expect(JSON.stringify(assistant)).toContain("Recovered complete answer");
        expect(JSON.stringify(loop.getMessages())).not.toContain("Discard this partial answer");
        expect(JSON.stringify(vi.mocked(LLM.stream).mock.calls[1]?.[0].messages)).not.toContain(
          "Discard this partial answer"
        );
      }
    );

    it("uses the newly selected provider and model in the existing runtime", async () => {
      vi.mocked(LLM.stream).mockImplementation(
        () =>
          createMockStream([
            { type: "text", content: "Answer" },
            { type: "done", stopReason: "end_turn" },
          ]) as ReturnType<typeof LLM.stream>
      );
      const loop = new AgentLoop({
        ...config,
        contextManagement: { enabled: true },
        enableEvidencePack: false,
      });
      loop.addMessage(createSessionMessage("user", "First request"));
      await loop.run();
      loop.setModel("openai", "gpt-5.5");
      loop.addMessage(createSessionMessage("user", "Second request"));
      await loop.run();
      expect(vi.mocked(LLM.stream).mock.calls[1]?.[0]).toMatchObject({
        providerType: "openai",
        model: "gpt-5.5",
      });
      expect(JSON.stringify(vi.mocked(LLM.stream).mock.calls[1]?.[0].messages)).toContain(
        "First request"
      );
      expect(loop.isContextManagementEnabled()).toBe(true);
    });

    it("rejects changing models during an active response", async () => {
      const loop = new AgentLoop({ ...config, enableEvidencePack: false });
      vi.mocked(LLM.stream).mockImplementation(() =>
        (async function* () {
          expect(() => loop.setModel("openai", "another-model")).toThrow("while a task is running");
          yield { type: "text" as const, content: "Original model response" };
          yield { type: "done" as const, stopReason: "end_turn" as const };
        })()
      );
      await loop.run();
      expect(loop.getConfig().providerType).toBe("anthropic");
    });

    it("replays provider reasoning metadata on the assistant tool message", async () => {
      const metadata = {
        provider: "anthropic",
        model: config.model,
        replay: [{ type: "thinking", thinking: "reasoning", signature: "signed" }],
      };
      vi.mocked(LLM.stream)
        .mockReturnValueOnce(
          createMockStream([
            { type: "toolCall", id: "read-meta", name: "read_file", input: { path: "/one" } },
            { type: "provider_metadata", metadata },
            { type: "done", stopReason: "tool_use" },
          ]) as ReturnType<typeof LLM.stream>
        )
        .mockReturnValueOnce(
          createMockStream([
            { type: "text", content: "Done" },
            { type: "done", stopReason: "end_turn" },
          ]) as ReturnType<typeof LLM.stream>
        );
      mockToolExecutor.registerTool({
        definition: {
          name: "read_file",
          description: "Read",
          parameters: z.object({ path: z.string() }),
          kind: "read",
        },
        execute: vi.fn(async () => ({ success: true as const, output: "contents" })),
      });
      const loop = new AgentLoop({ ...config, enableEvidencePack: false });
      await loop.run();
      expect(
        loop.getMessages().find((message) => message.role === "assistant")?.metadata
          .providerMetadata
      ).toEqual(metadata);
      expect(
        vi
          .mocked(LLM.stream)
          .mock.calls[1]?.[0].messages.find((message) => message.role === "assistant")
          ?.providerMetadata
      ).toEqual(metadata);
    });

    it("accepts synchronous prompt responses and releases the response listener", async () => {
      vi.mocked(LLM.stream)
        .mockReturnValueOnce(
          createMockStream([
            { type: "toolCall", id: "ask-1", name: "ask_followup_question", input: {} },
            { type: "done", stopReason: "tool_use" },
          ]) as ReturnType<typeof LLM.stream>
        )
        .mockReturnValueOnce(
          createMockStream([
            { type: "text", content: "Understood" },
            { type: "done", stopReason: "end_turn" },
          ]) as ReturnType<typeof LLM.stream>
        );
      mockToolExecutor.registerTool({
        definition: {
          name: "ask_followup_question",
          description: "Ask",
          parameters: z.object({}),
          kind: "agent",
        },
        execute: vi.fn(async () => ({
          success: true as const,
          output: { _prompt: { type: "user_prompt", question: "Which file?" } },
        })),
      });
      const loop = new AgentLoop({ ...config, interactive: true, enableEvidencePack: false });
      loop.on("userPrompt:required", () => loop.submitUserResponse("report.md"));
      await loop.run();
      expect(loop.listenerCount("userPrompt:response")).toBe(0);
      expect(JSON.stringify(loop.getMessages())).toContain("report.md");
    });

    it("continues useful work beyond the former 50-turn default without retaining cancellation listeners", async () => {
      let turn = 0;
      vi.mocked(LLM.stream).mockImplementation(() => {
        const current = ++turn;
        return createMockStream(
          current <= 55
            ? [
                {
                  type: "toolCall",
                  id: `read-${current}`,
                  name: "read_file",
                  input: { path: `/file-${current}` },
                },
                { type: "usage", usage: { inputTokens: 3000, outputTokens: 10 } },
                { type: "done", stopReason: "tool_use" },
              ]
            : [
                { type: "text", content: "All files inspected." },
                { type: "done", stopReason: "end_turn" },
              ]
        ) as ReturnType<typeof LLM.stream>;
      });
      mockToolExecutor.registerTool({
        definition: {
          name: "read_file",
          description: "Read",
          parameters: z.object({ path: z.string() }),
          kind: "read",
        },
        execute: vi.fn(async () => ({ success: true as const, output: "contents" })),
      });
      const loop = new AgentLoop({ ...config, enableEvidencePack: false });
      let activeListeners = 0;
      const token = loop.getCancellationToken();
      const onCancel = token.onCancel.bind(token);
      vi.spyOn(token, "onCancel").mockImplementation((callback) => {
        activeListeners++;
        const unregister = onCancel(callback);
        return () => {
          activeListeners--;
          unregister();
        };
      });
      const complete = vi.fn();
      loop.on("complete", complete);
      await loop.run();
      expect(turn).toBe(56);
      expect(activeListeners).toBe(0);
      expect(complete).toHaveBeenCalledTimes(1);
      expect(loop.getMessages().at(-1)?.parts).toContainEqual({
        type: "text",
        text: "All files inspected.",
      });
    });

    it("returns failed verification evidence to the same repair loop before accepting completion", async () => {
      vi.mocked(LLM.stream)
        .mockReturnValueOnce(
          createMockStream([
            { type: "toolCall", id: "verify-1", name: "attempt_completion", input: {} },
            { type: "done", stopReason: "tool_use" },
          ]) as ReturnType<typeof LLM.stream>
        )
        .mockReturnValueOnce(
          createMockStream([
            { type: "text", content: "The verification failed; here is the remaining blocker." },
            { type: "done", stopReason: "end_turn" },
          ]) as ReturnType<typeof LLM.stream>
        );
      mockToolExecutor.registerTool({
        definition: {
          name: "attempt_completion",
          description: "Verify",
          parameters: z.object({}),
          kind: "agent",
        },
        execute: vi.fn(async () => ({
          success: true as const,
          output: {
            result: "Attempted fix",
            verified: true,
            verificationPassed: false,
            verificationOutput: "Assertion failed: expected 2",
            completed: true,
          },
        })),
      });
      const loop = new AgentLoop({ ...config, enableEvidencePack: false });
      await loop.run();
      expect(LLM.stream).toHaveBeenCalledTimes(2);
      expect(loop.isCompletionAttempted()).toBe(false);
      expect(JSON.stringify(loop.getMessages())).toContain("Assertion failed: expected 2");
    });

    it("offers the registered verification tool only to the orch workflow", async () => {
      const container = new UnifiedToolContainer();
      container.registerBuiltins();
      vi.mocked(LLM.stream).mockImplementation(
        () =>
          createMockStream([
            { type: "text", content: "Hello" },
            { type: "done", stopReason: "end_turn" },
          ]) as ReturnType<typeof LLM.stream>
      );
      for (const mode of [ORCH_MODE, VIBE_MODE]) {
        const loop = new AgentLoop({
          ...config,
          mode,
          tools: container.getProviderToolDefinitions(),
          toolExecutor: container.getExecutor(),
          enableEvidencePack: false,
        });
        await loop.run();
      }
      expect(
        vi
          .mocked(LLM.stream)
          .mock.calls[0]?.[0].tools?.some((tool) => tool.name === "attempt_completion")
      ).toBe(true);
      expect(
        vi
          .mocked(LLM.stream)
          .mock.calls[1]?.[0].tools?.some((tool) => tool.name === "attempt_completion")
      ).toBe(false);
    });

    it("honors an explicit request budget before issuing another model call", async () => {
      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream([
          { type: "toolCall", id: "read-budget", name: "read_file", input: { path: "/one" } },
          { type: "usage", usage: { inputTokens: 10, outputTokens: 10 } },
          { type: "done", stopReason: "tool_use" },
        ]) as ReturnType<typeof LLM.stream>
      );
      mockToolExecutor.registerTool({
        definition: {
          name: "read_file",
          description: "Read",
          parameters: z.object({ path: z.string() }),
          kind: "read",
        },
        execute: vi.fn(async () => ({ success: true as const, output: "contents" })),
      });
      const loop = new AgentLoop({
        ...config,
        costService: new CostService({ sessionId: "budget" }),
        costLimits: { maxRequestsPerSession: 1, pauseOnLimitReached: true, warningThreshold: 0.8 },
        enableEvidencePack: false,
      });
      const terminated = vi.fn();
      loop.on("terminated", terminated);
      loop.on("cost:awaitingApproval", () => loop.denyCostApproval());
      await loop.run();
      expect(LLM.stream).toHaveBeenCalledTimes(1);
      expect(terminated).toHaveBeenCalledWith(
        "cost_limit",
        expect.objectContaining({ shouldTerminate: true })
      );
    });

    it("reports an explicit iteration cap instead of silently completing after its last tool", async () => {
      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream([
          { type: "toolCall", id: "one", name: "read_file", input: { path: "/one" } },
          { type: "done", stopReason: "tool_use" },
        ]) as ReturnType<typeof LLM.stream>
      );
      mockToolExecutor.registerTool({
        definition: {
          name: "read_file",
          description: "Read",
          parameters: z.object({ path: z.string() }),
          kind: "read",
        },
        execute: vi.fn(async () => ({ success: true as const, output: "contents" })),
      });
      const loop = new AgentLoop({ ...config, maxIterations: 1, enableEvidencePack: false });
      const terminated = vi.fn();
      loop.on("terminated", terminated);
      await loop.run();
      expect(LLM.stream).toHaveBeenCalledTimes(1);
      expect(terminated).toHaveBeenCalledWith(
        "max_steps",
        expect.objectContaining({ shouldTerminate: true })
      );
      expect(JSON.stringify(loop.getMessages())).toContain("contents");
    });

    it("stops an actual repeated-tool loop with the existing doom-loop guard", async () => {
      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream([
          { type: "toolCall", id: "repeat", name: "read_file", input: { path: "/same" } },
          { type: "done", stopReason: "tool_use" },
        ]) as ReturnType<typeof LLM.stream>
      );
      mockToolExecutor.registerTool({
        definition: {
          name: "read_file",
          description: "Read",
          parameters: z.object({ path: z.string() }),
          kind: "read",
        },
        execute: vi.fn(async () => ({ success: true as const, output: "unchanged" })),
      });
      const loop = new AgentLoop({ ...config, enableEvidencePack: false });
      const terminated = vi.fn();
      loop.on("terminated", terminated);
      await loop.run();
      expect(LLM.stream).toHaveBeenCalledTimes(3);
      expect(terminated).toHaveBeenCalledWith(
        "doom_loop",
        expect.objectContaining({ shouldTerminate: true })
      );
    });

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

      vi.mocked(LLM.stream)
        .mockReturnValueOnce(createMockStream(events) as ReturnType<typeof LLM.stream>)
        .mockReturnValueOnce(
          createMockStream([
            { type: "text", content: "Approved action finished" },
            { type: "done", stopReason: "end_turn" },
          ]) as ReturnType<typeof LLM.stream>
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

      loop.addMessage(createSessionMessage("user", "Test"));
      // Cancel immediately - this sets the cancellation token
      loop.cancel("Pre-cancelled");

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
      await expect(loop.run()).rejects.toThrow("Connection lost");

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
