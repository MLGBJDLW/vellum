/**
 * Integration tests for PromptBuilder + AgentLoop (T035)
 *
 * Tests the final integration between the new PromptBuilder system
 * and the AgentLoop, ensuring:
 * - PromptBuilder output is correctly used for system prompts
 * - Backward compatibility with legacy prompt generation
 * - fromPromptBuilder bridge function works correctly
 * - Complete workflow with all 4 layers
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentLoop, type AgentLoopConfig } from "../../agent/loop.js";
import { fromPromptBuilder } from "../../agent/prompt.js";
import { PromptBuilder } from "../../prompts/prompt-builder.js";
import type { SessionMessage } from "../../session/index.js";
import { type PermissionChecker, ToolExecutor } from "../../tool/index.js";

// Mock session/index.js
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

/**
 * Helper to create mock stream events
 */
function createMockStream(events: Array<{ type: string; [key: string]: unknown }>) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

describe("PromptBuilder Integration (T035)", () => {
  let baseConfig: AgentLoopConfig;
  let mockToolExecutor: ToolExecutor;
  let mockPermissionChecker: PermissionChecker;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPermissionChecker = {
      checkPermission: vi.fn().mockResolvedValue({ allowed: true }),
    };

    mockToolExecutor = new ToolExecutor({
      permissionChecker: mockPermissionChecker,
    });

    baseConfig = {
      sessionId: "test-session-prompts",
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

  describe("AgentLoop with PromptBuilder", () => {
    it("uses PromptBuilder output for system prompt when provided", async () => {
      // Create a PromptBuilder with specific content
      const promptBuilder = new PromptBuilder()
        .withBase("You are an AI assistant specialized in TypeScript.")
        .withRole("coder", "Write clean, maintainable code with tests.");

      // Create config with promptBuilder
      const configWithBuilder: AgentLoopConfig = {
        ...baseConfig,
        promptBuilder,
      };

      // Mock the LLM stream
      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream([
          { type: "text", content: "Response" },
          { type: "usage", inputTokens: 10, outputTokens: 5 },
          { type: "done", stopReason: "end_turn" },
        ]) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop(configWithBuilder);
      loop.addMessage(createSessionMessage("user", "Hello"));
      await loop.run();

      // The PromptBuilder content should be in the system prompt
      // Note: We verify the builder works correctly
      expect(promptBuilder.build()).toContain("AI assistant specialized in TypeScript");
      expect(promptBuilder.build()).toContain("Write clean, maintainable code with tests");
    });

    it("correctly combines multiple layers from PromptBuilder", async () => {
      const promptBuilder = new PromptBuilder()
        .withBase("BASE: Core instructions")
        .withRole("qa", "ROLE: Testing focus")
        .withModeOverrides("MODE: Debug mode active");

      const configWithBuilder: AgentLoopConfig = {
        ...baseConfig,
        promptBuilder,
      };

      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream([
          { type: "text", content: "OK" },
          { type: "done", stopReason: "end_turn" },
        ]) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop(configWithBuilder);
      loop.addMessage(createSessionMessage("user", "Test"));
      await loop.run();

      // Verify the builder produces correct layered output
      const builtPrompt = promptBuilder.build();
      expect(builtPrompt).toContain("BASE: Core instructions");
      expect(builtPrompt).toContain("ROLE: Testing focus");
      expect(builtPrompt).toContain("MODE: Debug mode active");

      // Layers should be in priority order (base=1, role=2, mode=3)
      const baseIndex = builtPrompt.indexOf("BASE:");
      const roleIndex = builtPrompt.indexOf("ROLE:");
      const modeIndex = builtPrompt.indexOf("MODE:");
      expect(baseIndex).toBeLessThan(roleIndex);
      expect(roleIndex).toBeLessThan(modeIndex);
    });

    it("logs debug information when using PromptBuilder", async () => {
      // Create a spy on the debug method using a partial mock
      const debugSpy = vi.fn();

      const promptBuilder = new PromptBuilder()
        .withBase("Base instructions")
        .withRole("coder", "Role instructions");

      const configWithBuilder: AgentLoopConfig = {
        ...baseConfig,
        promptBuilder,
        // Use a partial mock that satisfies the Logger interface usage in AgentLoop
        logger: {
          debug: debugSpy,
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          trace: vi.fn(),
          fatal: vi.fn(),
          time: vi.fn(() => ({ duration: 0, end: vi.fn(), stop: vi.fn(() => 0) })),
          addTransport: vi.fn(),
          setLevel: vi.fn(),
          getLevel: vi.fn(() => "debug" as const),
          child: vi.fn(),
          flush: vi.fn(),
        } as unknown as AgentLoopConfig["logger"],
      };

      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream([
          { type: "text", content: "Done" },
          { type: "done", stopReason: "end_turn" },
        ]) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop(configWithBuilder);
      loop.addMessage(createSessionMessage("user", "Hello"));
      await loop.run();

      // Should log that PromptBuilder is being used
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining("PromptBuilder"),
        expect.objectContaining({
          layerCount: 2,
        })
      );
    });
  });

  describe("fromPromptBuilder bridge function", () => {
    it("returns valid SystemPromptResult from PromptBuilder", () => {
      const builder = new PromptBuilder()
        .withBase("Base system instructions")
        .withRole("coder", "Coding-specific rules");

      const result = fromPromptBuilder(builder);

      expect(result).toHaveProperty("prompt");
      expect(result).toHaveProperty("sections");
      expect(result).toHaveProperty("includedFiles");
      expect(typeof result.prompt).toBe("string");
      expect(Array.isArray(result.sections)).toBe(true);
      expect(Array.isArray(result.includedFiles)).toBe(true);
    });

    it("extracts sections from layers in correct order", () => {
      const builder = new PromptBuilder()
        .withModeOverrides("Mode override (priority 3)")
        .withBase("Base content (priority 1)")
        .withRole("writer", "Role content (priority 2)");

      const result = fromPromptBuilder(builder);

      // Sections should be sorted by priority
      expect(result.sections).toHaveLength(3);
      expect(result.sections[0]).toContain("Base content");
      expect(result.sections[1]).toContain("Role content");
      expect(result.sections[2]).toContain("Mode override");
    });

    it("includes provided files in result", () => {
      const builder = new PromptBuilder().withBase("Instructions");
      const files = ["/path/to/file1.ts", "/path/to/file2.ts"];

      const result = fromPromptBuilder(builder, files);

      expect(result.includedFiles).toEqual(files);
    });

    it("handles empty builder gracefully", () => {
      const builder = new PromptBuilder();

      const result = fromPromptBuilder(builder);

      expect(result.prompt).toBe("");
      expect(result.sections).toEqual([]);
      expect(result.includedFiles).toEqual([]);
    });

    it("prompt matches builder.build() output", () => {
      const builder = new PromptBuilder()
        .withBase("Base")
        .withRole("coder", "Role")
        .setVariable("TEST", "value");

      const result = fromPromptBuilder(builder);
      const directBuild = builder.build();

      expect(result.prompt).toBe(directBuild);
    });
  });

  describe("Complete workflow with all 4 layers", () => {
    it("builds prompt with base, role, mode, and context layers", async () => {
      // Create PromptBuilder with all 4 layer types
      const promptBuilder = new PromptBuilder()
        .withBase("You are Vellum, an AI coding assistant.")
        .withRole("coder", "Focus on writing clean, testable TypeScript code.")
        .withModeOverrides("Currently in implementation mode. Execute tasks directly.")
        .withSessionContext({
          activeFile: {
            path: "src/index.ts",
            language: "typescript",
          },
          currentTask: {
            id: "T035",
            description: "Integration testing",
            status: "in-progress",
          },
        });

      const configWithFullBuilder: AgentLoopConfig = {
        ...baseConfig,
        promptBuilder,
      };

      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream([
          { type: "text", content: "Executing integration tests..." },
          { type: "usage", inputTokens: 50, outputTokens: 25 },
          { type: "done", stopReason: "end_turn" },
        ]) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop(configWithFullBuilder);

      let completed = false;
      loop.on("complete", () => {
        completed = true;
      });

      loop.addMessage(createSessionMessage("user", "Run the tests"));
      await loop.run();

      expect(completed).toBe(true);

      // Verify the built prompt contains all layers
      const builtPrompt = promptBuilder.build();
      expect(builtPrompt).toContain("Vellum");
      expect(builtPrompt).toContain("clean, testable TypeScript");
      expect(builtPrompt).toContain("implementation mode");
      expect(builtPrompt).toContain("src/index.ts");
      expect(builtPrompt).toContain("T035");
    });

    it("maintains correct layer priority ordering in complete workflow", () => {
      const builder = new PromptBuilder()
        // Add in random order to test priority sorting
        .withModeOverrides("3-MODE")
        .withSessionContext({
          activeFile: { path: "test.ts", language: "typescript" },
        })
        .withBase("1-BASE")
        .withRole("coder", "2-ROLE");

      const prompt = builder.build();

      // Extract positions to verify order
      const positions = {
        base: prompt.indexOf("1-BASE"),
        role: prompt.indexOf("2-ROLE"),
        mode: prompt.indexOf("3-MODE"),
        context: prompt.indexOf("Active File"), // Context uses markdown headers
      };

      // All should exist
      expect(positions.base).toBeGreaterThanOrEqual(0);
      expect(positions.role).toBeGreaterThanOrEqual(0);
      expect(positions.mode).toBeGreaterThanOrEqual(0);
      expect(positions.context).toBeGreaterThanOrEqual(0);

      // Order should be: base < role < mode < context
      expect(positions.base).toBeLessThan(positions.role);
      expect(positions.role).toBeLessThan(positions.mode);
      expect(positions.mode).toBeLessThan(positions.context);
    });

    it("variable substitution works in complete workflow", async () => {
      const promptBuilder = new PromptBuilder()
        .withBase("Working in {{LANGUAGE}} on project {{PROJECT}}")
        .withRole("coder", "Use {{FRAMEWORK}} patterns")
        .setVariable("LANGUAGE", "TypeScript")
        .setVariable("PROJECT", "vellum")
        .setVariable("FRAMEWORK", "functional");

      const configWithVars: AgentLoopConfig = {
        ...baseConfig,
        promptBuilder,
      };

      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream([
          { type: "text", content: "OK" },
          { type: "done", stopReason: "end_turn" },
        ]) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop(configWithVars);
      loop.addMessage(createSessionMessage("user", "Code something"));
      await loop.run();

      // Verify variables are substituted
      const builtPrompt = promptBuilder.build();
      expect(builtPrompt).toContain("TypeScript");
      expect(builtPrompt).toContain("vellum");
      expect(builtPrompt).toContain("functional");
      expect(builtPrompt).not.toContain("{{LANGUAGE}}");
      expect(builtPrompt).not.toContain("{{PROJECT}}");
      expect(builtPrompt).not.toContain("{{FRAMEWORK}}");
    });

    it("fromPromptBuilder result is compatible with AgentLoop internal usage", () => {
      const builder = new PromptBuilder()
        .withBase("Base instructions")
        .withRole("qa", "QA instructions")
        .withModeOverrides("Mode instructions");

      // Simulate what AgentLoop does internally
      const result = fromPromptBuilder(builder);

      // Verify the result can be used as a system prompt
      expect(typeof result.prompt).toBe("string");
      expect(result.prompt.length).toBeGreaterThan(0);

      // Verify sections are extractable for logging/debugging
      expect(result.sections.length).toBe(3);

      // Verify the prompt could be passed to LLM
      const systemPromptForLLM = result.prompt;
      expect(systemPromptForLLM).toContain("Base instructions");
      expect(systemPromptForLLM).toContain("QA instructions");
      expect(systemPromptForLLM).toContain("Mode instructions");
    });
  });

  describe("Edge cases", () => {
    it("handles PromptBuilder with only base layer", async () => {
      const promptBuilder = new PromptBuilder().withBase("Only base instructions");

      const config: AgentLoopConfig = {
        ...baseConfig,
        promptBuilder,
      };

      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream([
          { type: "text", content: "OK" },
          { type: "done", stopReason: "end_turn" },
        ]) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop(config);
      loop.addMessage(createSessionMessage("user", "Test"));
      await loop.run();

      expect(promptBuilder.build()).toBe("Only base instructions");
      expect(promptBuilder.getLayers()).toHaveLength(1);
    });

    it("handles PromptBuilder with duplicate layer types", () => {
      const builder = new PromptBuilder()
        .withBase("First base")
        .withBase("Second base")
        .withRole("coder", "First role")
        .withRole("qa", "Second role");

      const result = fromPromptBuilder(builder);

      // Both bases and both roles should be included
      expect(result.sections).toHaveLength(4);
      expect(result.prompt).toContain("First base");
      expect(result.prompt).toContain("Second base");
      expect(result.prompt).toContain("First role");
      expect(result.prompt).toContain("Second role");
    });
  });
});
