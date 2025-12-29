/**
 * T035: Integration tests for ToolExecutor snapshot hooks.
 *
 * Tests that the ToolExecutor properly integrates with GitSnapshotService
 * to track file changes before and after tool execution.
 *
 * @see packages/core/src/tool/executor.ts
 * @see packages/core/src/git/types.ts
 */

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { z } from "zod";
import { ErrorCode, VellumError } from "../../errors/types.js";
import type { GitPatch, IGitSnapshotService } from "../../git/types.js";
import { Err, Ok } from "../../types/result.js";
import { defineTool, ok, type ToolContext } from "../../types/tool.js";
import { ToolExecutor } from "../executor.js";

// =============================================================================
// Mock GitSnapshotService
// =============================================================================

/**
 * Creates a mock GitSnapshotService for testing.
 */
function createMockSnapshotService(): {
  track: Mock;
  patch: Mock;
  diff: Mock;
  diffFull: Mock;
  restore: Mock;
  revert: Mock;
} {
  return {
    track: vi.fn().mockResolvedValue(Ok("a".repeat(40))),
    patch: vi.fn().mockResolvedValue(
      Ok({
        files: [],
        commitHash: "a".repeat(40),
        timestamp: Date.now(),
      } as GitPatch)
    ),
    diff: vi.fn().mockResolvedValue(Ok("")),
    diffFull: vi.fn().mockResolvedValue(Ok([])),
    restore: vi.fn().mockResolvedValue(Ok(undefined)),
    revert: vi.fn().mockResolvedValue(Ok(undefined)),
  };
}

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    workingDir: "/test",
    sessionId: "test-session",
    messageId: "msg-123",
    callId: "call-456",
    abortSignal: new AbortController().signal,
    checkPermission: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

/**
 * A simple echo tool for testing.
 */
const echoTool = defineTool({
  name: "echo",
  description: "Returns the input message",
  parameters: z.object({
    message: z.string(),
  }),
  kind: "read",
  async execute(input) {
    return ok({ echoed: input.message });
  },
});

/**
 * A tool that simulates file modifications.
 */
const fileModifyTool = defineTool({
  name: "file_modify",
  description: "Simulates file modification",
  parameters: z.object({
    path: z.string(),
    content: z.string(),
  }),
  kind: "write",
  async execute(input) {
    // In real usage this would write to filesystem
    return ok({ written: input.path });
  },
});

// =============================================================================
// T035: ToolExecutor Snapshot Hooks Tests
// =============================================================================

describe("ToolExecutor Snapshot Hooks", () => {
  let mockSnapshotService: ReturnType<typeof createMockSnapshotService>;
  let executor: ToolExecutor;
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSnapshotService = createMockSnapshotService();
    ctx = createMockContext();
  });

  // ===========================================================================
  // T035.1: Snapshot created before tool execution
  // ===========================================================================

  describe("pre-tool snapshot", () => {
    it("should call track() before tool execution when snapshot service is provided", async () => {
      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(echoTool);

      await executor.execute("echo", { message: "hello" }, ctx);

      expect(mockSnapshotService.track).toHaveBeenCalledTimes(1);
    });

    it("should not call track() when snapshot service is not provided", async () => {
      executor = new ToolExecutor({ enableLogging: false });
      executor.registerTool(echoTool);

      await executor.execute("echo", { message: "hello" }, ctx);

      expect(mockSnapshotService.track).not.toHaveBeenCalled();
    });

    it("should call track() before the tool's execute function", async () => {
      const callOrder: string[] = [];

      mockSnapshotService.track.mockImplementation(async () => {
        callOrder.push("track");
        return Ok("a".repeat(40));
      });

      const trackingTool = defineTool({
        name: "tracking",
        description: "Tracks call order",
        parameters: z.object({}),
        kind: "read",
        async execute() {
          callOrder.push("execute");
          return ok({});
        },
      });

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(trackingTool);

      await executor.execute("tracking", {}, ctx);

      expect(callOrder).toEqual(["track", "execute"]);
    });
  });

  // ===========================================================================
  // T035.2: Changes detected after tool execution
  // ===========================================================================

  describe("post-tool change detection", () => {
    it("should call patch() after tool execution with the pre-tool snapshot hash", async () => {
      const snapshotHash = "b".repeat(40);
      mockSnapshotService.track.mockResolvedValue(Ok(snapshotHash));

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(echoTool);

      await executor.execute("echo", { message: "hello" }, ctx);

      expect(mockSnapshotService.patch).toHaveBeenCalledWith(snapshotHash);
    });

    it("should call patch() after the tool's execute function", async () => {
      const callOrder: string[] = [];

      mockSnapshotService.patch.mockImplementation(async () => {
        callOrder.push("patch");
        return Ok({ files: [], commitHash: "a".repeat(40), timestamp: Date.now() });
      });

      const trackingTool = defineTool({
        name: "tracking",
        description: "Tracks call order",
        parameters: z.object({}),
        kind: "read",
        async execute() {
          callOrder.push("execute");
          return ok({});
        },
      });

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(trackingTool);

      await executor.execute("tracking", {}, ctx);

      // track -> execute -> patch
      expect(callOrder).toEqual(["execute", "patch"]);
    });

    it("should not call patch() if track() returned undefined", async () => {
      mockSnapshotService.track.mockResolvedValue(Ok(undefined));

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(echoTool);

      await executor.execute("echo", { message: "hello" }, ctx);

      expect(mockSnapshotService.patch).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // T035.3: preToolSnapshot field populated in result
  // ===========================================================================

  describe("preToolSnapshot field", () => {
    it("should populate preToolSnapshot in result when snapshot succeeds", async () => {
      const snapshotHash = "c".repeat(40);
      mockSnapshotService.track.mockResolvedValue(Ok(snapshotHash));

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(echoTool);

      const result = await executor.execute("echo", { message: "hello" }, ctx);

      expect(result.preToolSnapshot).toBe(snapshotHash);
    });

    it("should not populate preToolSnapshot when track() returns undefined", async () => {
      mockSnapshotService.track.mockResolvedValue(Ok(undefined));

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(echoTool);

      const result = await executor.execute("echo", { message: "hello" }, ctx);

      expect(result.preToolSnapshot).toBeUndefined();
    });

    it("should not populate preToolSnapshot when snapshot service is not provided", async () => {
      executor = new ToolExecutor({ enableLogging: false });
      executor.registerTool(echoTool);

      const result = await executor.execute("echo", { message: "hello" }, ctx);

      expect(result.preToolSnapshot).toBeUndefined();
    });
  });

  // ===========================================================================
  // T035.4: changedFiles field populated in result
  // ===========================================================================

  describe("changedFiles field", () => {
    it("should populate changedFiles with file paths from patch", async () => {
      const snapshotHash = "d".repeat(40);
      mockSnapshotService.track.mockResolvedValue(Ok(snapshotHash));
      mockSnapshotService.patch.mockResolvedValue(
        Ok({
          files: [
            { path: "src/index.ts", type: "modified" },
            { path: "src/utils.ts", type: "added" },
            { path: "old-file.ts", type: "deleted" },
          ],
          commitHash: snapshotHash,
          timestamp: Date.now(),
        } as GitPatch)
      );

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(fileModifyTool);

      const result = await executor.execute(
        "file_modify",
        { path: "src/index.ts", content: "new content" },
        ctx
      );

      expect(result.changedFiles).toBeDefined();
      expect(result.changedFiles).toEqual(["src/index.ts", "src/utils.ts", "old-file.ts"]);
    });

    it("should return empty changedFiles array when no files changed", async () => {
      const snapshotHash = "e".repeat(40);
      mockSnapshotService.track.mockResolvedValue(Ok(snapshotHash));
      mockSnapshotService.patch.mockResolvedValue(
        Ok({
          files: [],
          commitHash: snapshotHash,
          timestamp: Date.now(),
        } as GitPatch)
      );

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(echoTool);

      const result = await executor.execute("echo", { message: "hello" }, ctx);

      expect(result.changedFiles).toBeDefined();
      expect(result.changedFiles).toEqual([]);
    });

    it("should not populate changedFiles when snapshot service is not provided", async () => {
      executor = new ToolExecutor({ enableLogging: false });
      executor.registerTool(echoTool);

      const result = await executor.execute("echo", { message: "hello" }, ctx);

      expect(result.changedFiles).toBeUndefined();
    });
  });

  // ===========================================================================
  // T035.5: Graceful handling when snapshot service unavailable/errors
  // ===========================================================================

  describe("graceful error handling", () => {
    it("should execute tool successfully when track() fails", async () => {
      mockSnapshotService.track.mockResolvedValue(
        Err(
          new VellumError("Git operation failed", ErrorCode.GIT_OPERATION_FAILED, {
            isRetryable: false,
          })
        )
      );

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(echoTool);

      const result = await executor.execute("echo", { message: "hello" }, ctx);

      // Tool should still succeed
      expect(result.result.success).toBe(true);
      if (result.result.success) {
        expect(result.result.output).toEqual({ echoed: "hello" });
      }
      // Snapshot fields should be undefined due to error
      expect(result.preToolSnapshot).toBeUndefined();
      expect(result.changedFiles).toBeUndefined();
    });

    it("should execute tool successfully when track() throws exception", async () => {
      mockSnapshotService.track.mockRejectedValue(new Error("Git not available"));

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(echoTool);

      const result = await executor.execute("echo", { message: "hello" }, ctx);

      // Tool should still succeed
      expect(result.result.success).toBe(true);
      if (result.result.success) {
        expect(result.result.output).toEqual({ echoed: "hello" });
      }
    });

    it("should not set preToolSnapshot or changedFiles when patch() returns Err", async () => {
      const snapshotHash = "f".repeat(40);
      mockSnapshotService.track.mockResolvedValue(Ok(snapshotHash));
      mockSnapshotService.patch.mockResolvedValue(
        Err(
          new VellumError("Git operation failed", ErrorCode.GIT_OPERATION_FAILED, {
            isRetryable: false,
          })
        )
      );

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(echoTool);

      const result = await executor.execute("echo", { message: "hello" }, ctx);

      // Tool should still succeed
      expect(result.result.success).toBe(true);
      // When patch() returns Err (not throws), preToolSnapshot is not set
      // because the code only sets it in the catch block for exceptions
      expect(result.preToolSnapshot).toBeUndefined();
      expect(result.changedFiles).toBeUndefined();
    });

    it("should return preToolSnapshot when patch() throws exception", async () => {
      const snapshotHash = "g".repeat(40);
      mockSnapshotService.track.mockResolvedValue(Ok(snapshotHash));
      mockSnapshotService.patch.mockRejectedValue(new Error("Patch failed"));

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(echoTool);

      const result = await executor.execute("echo", { message: "hello" }, ctx);

      // Tool should still succeed
      expect(result.result.success).toBe(true);
      // preToolSnapshot should still be set
      expect(result.preToolSnapshot).toBe(snapshotHash);
    });

    it("should not block tool execution when snapshot operations are slow", async () => {
      const startTime = Date.now();

      // Simulate slow track operation
      mockSnapshotService.track.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return Ok("h".repeat(40));
      });

      // Simulate slow patch operation
      mockSnapshotService.patch.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return Ok({ files: [], commitHash: "h".repeat(40), timestamp: Date.now() });
      });

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(echoTool);

      const result = await executor.execute("echo", { message: "hello" }, ctx);

      const elapsedTime = Date.now() - startTime;

      // Tool should complete (including snapshot overhead)
      expect(result.result.success).toBe(true);
      // Should take at least 100ms (track + patch delays)
      expect(elapsedTime).toBeGreaterThanOrEqual(100);
    });
  });

  // ===========================================================================
  // T035.6: Snapshot integration with different tool types
  // ===========================================================================

  describe("integration with tool types", () => {
    it("should track snapshots for read tools", async () => {
      const readTool = defineTool({
        name: "read_file",
        description: "Reads a file",
        parameters: z.object({ path: z.string() }),
        kind: "read",
        async execute() {
          return ok({ content: "file content" });
        },
      });

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(readTool);

      await executor.execute("read_file", { path: "/test.txt" }, ctx);

      expect(mockSnapshotService.track).toHaveBeenCalled();
    });

    it("should track snapshots for write tools", async () => {
      const writeTool = defineTool({
        name: "write_file",
        description: "Writes a file",
        parameters: z.object({ path: z.string(), content: z.string() }),
        kind: "write",
        async execute() {
          return ok({ written: true });
        },
      });

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(writeTool);

      await executor.execute("write_file", { path: "/test.txt", content: "new" }, ctx);

      expect(mockSnapshotService.track).toHaveBeenCalled();
      expect(mockSnapshotService.patch).toHaveBeenCalled();
    });

    it("should track snapshots for shell tools", async () => {
      const shellTool = defineTool({
        name: "run_command",
        description: "Runs a shell command",
        parameters: z.object({ command: z.string() }),
        kind: "shell",
        async execute() {
          return ok({ output: "command output" });
        },
      });

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(shellTool);

      await executor.execute("run_command", { command: "ls" }, ctx);

      expect(mockSnapshotService.track).toHaveBeenCalled();
      expect(mockSnapshotService.patch).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // T035.7: Multiple executions
  // ===========================================================================

  describe("multiple executions", () => {
    it("should create new snapshot for each tool execution", async () => {
      let callCount = 0;
      mockSnapshotService.track.mockImplementation(async () => {
        callCount++;
        return Ok(`${"a".repeat(39)}${callCount}`);
      });

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(echoTool);

      const result1 = await executor.execute("echo", { message: "first" }, ctx);
      const result2 = await executor.execute("echo", { message: "second" }, ctx);
      const result3 = await executor.execute("echo", { message: "third" }, ctx);

      expect(mockSnapshotService.track).toHaveBeenCalledTimes(3);
      expect(result1.preToolSnapshot).not.toBe(result2.preToolSnapshot);
      expect(result2.preToolSnapshot).not.toBe(result3.preToolSnapshot);
    });

    it("should detect different changes for each execution", async () => {
      const snapshotHash = "i".repeat(40);
      mockSnapshotService.track.mockResolvedValue(Ok(snapshotHash));

      let executionCount = 0;
      mockSnapshotService.patch.mockImplementation(async () => {
        executionCount++;
        return Ok({
          files: [{ path: `file${executionCount}.ts`, type: "modified" }],
          commitHash: snapshotHash,
          timestamp: Date.now(),
        } as GitPatch);
      });

      executor = new ToolExecutor({
        gitSnapshotService: mockSnapshotService as unknown as IGitSnapshotService,
        enableLogging: false,
      });
      executor.registerTool(echoTool);

      const result1 = await executor.execute("echo", { message: "first" }, ctx);
      const result2 = await executor.execute("echo", { message: "second" }, ctx);

      expect(result1.changedFiles).toEqual(["file1.ts"]);
      expect(result2.changedFiles).toEqual(["file2.ts"]);
    });
  });
});
