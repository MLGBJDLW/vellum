/**
 * Batch Executor Tests (T-048)
 *
 * @module cli/commands/__tests__/batch.test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { BatchExecutor, BatchScriptParser, createBatchScript } from "../batch/index.js";
import type { CommandExecutor } from "../executor.js";
import type { CommandResult } from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockExecutor(results: Map<string, CommandResult> = new Map()): CommandExecutor {
  return {
    execute: vi.fn(async (input: string): Promise<CommandResult> => {
      const result = results.get(input.trim());
      if (result) return result;
      return { kind: "success", message: `Executed: ${input}` };
    }),
  } as unknown as CommandExecutor;
}

// =============================================================================
// BatchScriptParser Tests
// =============================================================================

describe("BatchScriptParser", () => {
  describe("parse", () => {
    it("should parse simple newline-separated commands", () => {
      const script = "/help\n/clear\n/exit";
      const commands = BatchScriptParser.parse(script);

      expect(commands).toEqual(["/help", "/clear", "/exit"]);
    });

    it("should skip empty lines by default", () => {
      const script = "/help\n\n/clear\n\n/exit";
      const commands = BatchScriptParser.parse(script);

      expect(commands).toEqual(["/help", "/clear", "/exit"]);
    });

    it("should skip comment lines by default", () => {
      const script = "# This is a comment\n/help\n# Another comment\n/clear";
      const commands = BatchScriptParser.parse(script);

      expect(commands).toEqual(["/help", "/clear"]);
    });

    it("should trim whitespace", () => {
      const script = "  /help  \n  /clear  ";
      const commands = BatchScriptParser.parse(script);

      expect(commands).toEqual(["/help", "/clear"]);
    });

    it("should include all lines when skipComments is false", () => {
      const script = "# Comment\n/help\n\n/clear";
      const commands = BatchScriptParser.parse(script, false);

      expect(commands).toEqual(["# Comment", "/help", "", "/clear"]);
    });

    it("should handle Windows line endings", () => {
      const script = "/help\r\n/clear\r\n/exit";
      const commands = BatchScriptParser.parse(script);

      expect(commands).toEqual(["/help", "/clear", "/exit"]);
    });
  });

  describe("isComment", () => {
    it("should identify comment lines", () => {
      expect(BatchScriptParser.isComment("# comment")).toBe(true);
      expect(BatchScriptParser.isComment("  # indented comment")).toBe(true);
    });

    it("should not identify non-comments", () => {
      expect(BatchScriptParser.isComment("/help")).toBe(false);
      expect(BatchScriptParser.isComment("")).toBe(false);
    });
  });

  describe("isEmpty", () => {
    it("should identify empty lines", () => {
      expect(BatchScriptParser.isEmpty("")).toBe(true);
      expect(BatchScriptParser.isEmpty("   ")).toBe(true);
      expect(BatchScriptParser.isEmpty("\t")).toBe(true);
    });

    it("should not identify non-empty lines", () => {
      expect(BatchScriptParser.isEmpty("/help")).toBe(false);
      expect(BatchScriptParser.isEmpty("# comment")).toBe(false);
    });
  });

  describe("validate", () => {
    it("should validate a valid script", () => {
      const result = BatchScriptParser.validate("/help\n/clear");

      expect(result.valid).toBe(true);
      expect(result.commandCount).toBe(2);
      expect(result.warnings).toHaveLength(0);
    });

    it("should warn about commands without / prefix", () => {
      const result = BatchScriptParser.validate("/help\nhelp");

      expect(result.valid).toBe(true);
      expect(result.commandCount).toBe(2);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("should start with /");
    });

    it("should be invalid for empty script", () => {
      const result = BatchScriptParser.validate("");

      expect(result.valid).toBe(false);
      expect(result.commandCount).toBe(0);
    });

    it("should be invalid for only comments", () => {
      const result = BatchScriptParser.validate("# just comments\n# more comments");

      expect(result.valid).toBe(false);
      expect(result.commandCount).toBe(0);
    });
  });
});

// =============================================================================
// BatchExecutor Tests
// =============================================================================

describe("BatchExecutor", () => {
  let mockExecutor: CommandExecutor;
  let batch: BatchExecutor;

  beforeEach(() => {
    mockExecutor = createMockExecutor();
    batch = new BatchExecutor(mockExecutor);
  });

  describe("execute", () => {
    it("should execute all commands in sequence", async () => {
      const script = "/help\n/clear\n/exit";
      const result = await batch.execute(script);

      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.completed).toBe(true);
      expect(mockExecutor.execute).toHaveBeenCalledTimes(3);
    });

    it("should skip comments and empty lines", async () => {
      const script = "# Comment\n/help\n\n/clear";
      const result = await batch.execute(script);

      expect(result.total).toBe(2);
      expect(result.skipped).toBe(2);
      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    });

    it("should stop on error by default", async () => {
      const errorResult: CommandResult = {
        kind: "error",
        code: "INTERNAL_ERROR",
        message: "Command failed",
      };
      mockExecutor = createMockExecutor(new Map([["/fail", errorResult]]));
      batch = new BatchExecutor(mockExecutor);

      const script = "/help\n/fail\n/clear";
      const result = await batch.execute(script);

      expect(result.completed).toBe(false);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.abortError).toBeDefined();
      // /clear should not have been called
      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    });

    it("should continue on error when configured", async () => {
      const errorResult: CommandResult = {
        kind: "error",
        code: "INTERNAL_ERROR",
        message: "Command failed",
      };
      mockExecutor = createMockExecutor(new Map([["/fail", errorResult]]));
      batch = new BatchExecutor(mockExecutor);

      const script = "/help\n/fail\n/clear";
      const result = await batch.execute(script, { continueOnError: true });

      expect(result.completed).toBe(true);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(mockExecutor.execute).toHaveBeenCalledTimes(3);
    });

    it("should call callbacks", async () => {
      const onBeforeCommand = vi.fn();
      const onAfterCommand = vi.fn();

      const script = "/help\n/clear";
      await batch.execute(script, { onBeforeCommand, onAfterCommand });

      expect(onBeforeCommand).toHaveBeenCalledTimes(2);
      expect(onAfterCommand).toHaveBeenCalledTimes(2);
      expect(onBeforeCommand).toHaveBeenCalledWith("/help", 0);
      expect(onAfterCommand).toHaveBeenCalledWith("/help", 0, expect.any(Object));
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      const script = "/help\n/clear";
      const result = await batch.execute(script, { signal: controller.signal });

      expect(result.completed).toBe(false);
      expect(result.abortError?.message).toContain("aborted");
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it("should handle thrown exceptions", async () => {
      mockExecutor.execute = vi.fn().mockRejectedValueOnce(new Error("Unexpected error"));
      batch = new BatchExecutor(mockExecutor);

      const script = "/help";
      const result = await batch.execute(script);

      expect(result.completed).toBe(false);
      expect(result.failed).toBe(1);
      expect(result.commands).toHaveLength(1);
      // biome-ignore lint/style/noNonNullAssertion: Test assertion
      const firstCommand = result.commands[0]!;
      expect(firstCommand.result.kind).toBe("error");
    });
  });

  describe("executeCommands", () => {
    it("should execute commands from array", async () => {
      const commands = ["/help", "/clear"];
      const result = await batch.executeCommands(commands);

      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(2);
    });
  });
});

// =============================================================================
// createBatchScript Tests
// =============================================================================

describe("createBatchScript", () => {
  it("should create script from commands", () => {
    const script = createBatchScript(["/help", "/clear"]);

    expect(script).toBe("/help\n/clear");
  });

  it("should include header", () => {
    const script = createBatchScript(["/help"], { header: "Setup script" });

    expect(script).toContain("# Setup script");
    expect(script).toContain("/help");
  });

  it("should include inline comments", () => {
    const script = createBatchScript(["/help", "/clear"], {
      comments: { 0: "Show help", 1: "Clear screen" },
    });

    expect(script).toContain("# Show help");
    expect(script).toContain("/help");
    expect(script).toContain("# Clear screen");
    expect(script).toContain("/clear");
  });
});
