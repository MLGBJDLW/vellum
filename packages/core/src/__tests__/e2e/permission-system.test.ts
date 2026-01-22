/**
 * End-to-End Permission System Tests (T042)
 *
 * Integration tests for the complete permission system flow:
 * - Permission checking through ToolExecutor
 * - Allow/Ask/Deny flows with mock handler
 * - Trust presets and pattern matching
 * - Session permission persistence
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  createDefaultPermissionChecker,
  type DefaultPermissionChecker,
  type PermissionAskHandler,
  PermissionAskService,
  type PermissionInfo,
  type PermissionResponse,
  SessionPermissionManager,
  TrustManager,
} from "../../permission/index.js";
import { PermissionDeniedError, ToolExecutor } from "../../tool/executor.js";
import type { Tool, ToolContext, ToolKind } from "../../types/tool.js";

describe("Permission System E2E (T042)", { timeout: 60000 }, () => {
  let checker: DefaultPermissionChecker;
  let executor: ToolExecutor;
  let ctx: ToolContext;
  let mockAskHandler: PermissionAskHandler;
  let askResponses: PermissionResponse[];

  // Create mock tools for testing
  const createMockTool = (
    name: string,
    kind: ToolKind = "read"
  ): Tool<
    z.ZodObject<{ value: z.ZodOptional<z.ZodString>; command: z.ZodOptional<z.ZodString> }>,
    string
  > => ({
    definition: {
      name,
      description: `Mock ${name} tool`,
      parameters: z.object({ value: z.string().optional(), command: z.string().optional() }),
      kind,
    },
    execute: async () => ({ success: true, output: `${name} executed` }),
  });

  const readTool = createMockTool("read_file", "read");
  const writeTool = createMockTool("write_file", "write");
  const bashTool = createMockTool("bash", "shell");

  /**
   * Helper to execute a tool and catch permission errors.
   * Returns a normalized result regardless of whether it threw.
   */
  const safeExecute = async (
    exec: ToolExecutor,
    name: string,
    params: unknown,
    context: ToolContext
  ): Promise<{ success: boolean; output?: string; error?: string }> => {
    try {
      const result = await exec.execute(name, params, context);
      if (result.result.success) {
        return { success: true, output: String(result.result.output) };
      }
      return { success: false, error: result.result.error };
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        return { success: false, error: error.message };
      }
      throw error;
    }
  };

  beforeEach(() => {
    askResponses = [];

    // Mock ask handler that returns pre-configured responses
    mockAskHandler = vi.fn(async (_info: PermissionInfo) => {
      const response = askResponses.shift();
      return response;
    });

    // Create permission checker with mock handler
    checker = createDefaultPermissionChecker({
      askHandler: mockAskHandler,
    }) as DefaultPermissionChecker;

    // Create executor with permission checker
    executor = new ToolExecutor({
      permissionChecker: checker,
    });

    // Register mock tools
    executor.registerTool(readTool);
    executor.registerTool(writeTool);
    executor.registerTool(bashTool);

    // Create test context
    ctx = {
      workingDir: process.cwd(),
      sessionId: "test-session",
      messageId: "test-message",
      callId: "test-call",
      abortSignal: new AbortController().signal,
      checkPermission: vi.fn().mockResolvedValue(true),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("ToolExecutor → PermissionChecker Integration", () => {
    it("should execute tool when permission is allowed by config", async () => {
      // Use relaxed preset which allows most operations
      const relaxedChecker = createDefaultPermissionChecker({
        trustManager: new TrustManager({ configPreset: "relaxed" }),
      });

      const relaxedExecutor = new ToolExecutor({
        permissionChecker: relaxedChecker,
      });
      relaxedExecutor.registerTool(writeTool);

      const result = await relaxedExecutor.execute("write_file", { value: "test" }, ctx);

      expect(result.result.success).toBe(true);
      if (result.result.success) {
        expect(result.result.output).toBe("write_file executed");
      }
    });

    it("should deny tool execution when permission is denied by config", async () => {
      // Use paranoid preset which denies all
      const paranoidChecker = createDefaultPermissionChecker({
        trustManager: new TrustManager({ configPreset: "paranoid" }),
      });

      const paranoidExecutor = new ToolExecutor({
        permissionChecker: paranoidChecker,
      });
      paranoidExecutor.registerTool(writeTool);

      const result = await safeExecute(paranoidExecutor, "write_file", { value: "test" }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Permission denied");
    });
  });

  describe("Allow Flow", () => {
    it("should allow execution with 'once' response", async () => {
      // Configure cautious mode (all ask) and provide 'once' response
      const cautiousChecker = createDefaultPermissionChecker({
        trustManager: new TrustManager({ configPreset: "cautious" }),
        askHandler: mockAskHandler,
      }) as DefaultPermissionChecker;

      const cautiousExecutor = new ToolExecutor({
        permissionChecker: cautiousChecker,
      });
      cautiousExecutor.registerTool(writeTool);

      askResponses.push("once");

      const result = await cautiousExecutor.execute("write_file", { value: "test" }, ctx);

      expect(mockAskHandler).toHaveBeenCalledTimes(1);
      expect(result.result.success).toBe(true);
    });

    it("should allow execution with 'always' response and remember", async () => {
      const sessionManager = new SessionPermissionManager();
      const cautiousChecker = createDefaultPermissionChecker({
        trustManager: new TrustManager({ configPreset: "cautious" }),
        sessionManager,
        askHandler: mockAskHandler,
      }) as DefaultPermissionChecker;

      const cautiousExecutor = new ToolExecutor({
        permissionChecker: cautiousChecker,
      });
      cautiousExecutor.registerTool(writeTool);

      // First execution - should ask
      askResponses.push("always");
      const result1 = await cautiousExecutor.execute("write_file", { value: "test1" }, ctx);

      expect(mockAskHandler).toHaveBeenCalledTimes(1);
      expect(result1.result.success).toBe(true);

      // Second execution - should NOT ask (remembered)
      const result2 = await cautiousExecutor.execute("write_file", { value: "test2" }, ctx);

      // Ask handler should still be called only once
      expect(mockAskHandler).toHaveBeenCalledTimes(1);
      expect(result2.result.success).toBe(true);
    });
  });

  describe("Ask Flow", () => {
    it("should prompt user when config says 'ask'", async () => {
      const cautiousChecker = createDefaultPermissionChecker({
        trustManager: new TrustManager({ configPreset: "cautious" }),
        askHandler: mockAskHandler,
      });

      const cautiousExecutor = new ToolExecutor({
        permissionChecker: cautiousChecker,
      });
      cautiousExecutor.registerTool(bashTool);

      askResponses.push("once");

      await cautiousExecutor.execute("bash", { command: "ls" }, ctx);

      expect(mockAskHandler).toHaveBeenCalledTimes(1);
      const calls = (mockAskHandler as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]).toBeDefined();
      const callArg = calls[0]?.[0] as PermissionInfo;
      expect(callArg.type).toBe("bash");
    });

    it("should deny on timeout (no handler response)", async () => {
      // Create ask service with very short timeout
      const askService = new PermissionAskService({
        defaultTimeoutMs: 10, // 10ms timeout
        handler: async () => {
          // Simulate slow response
          await new Promise((resolve) => setTimeout(resolve, 100));
          return "once";
        },
      });

      const timeoutChecker = createDefaultPermissionChecker({
        trustManager: new TrustManager({ configPreset: "cautious" }),
        askService,
      });

      const timeoutExecutor = new ToolExecutor({
        permissionChecker: timeoutChecker,
      });
      timeoutExecutor.registerTool(writeTool);

      const result = await safeExecute(timeoutExecutor, "write_file", { value: "test" }, ctx);

      // Should be denied due to timeout
      expect(result.success).toBe(false);
    });
  });

  describe("Deny Flow", () => {
    it("should deny execution with 'reject' response", async () => {
      const cautiousChecker = createDefaultPermissionChecker({
        trustManager: new TrustManager({ configPreset: "cautious" }),
        askHandler: mockAskHandler,
      });

      const cautiousExecutor = new ToolExecutor({
        permissionChecker: cautiousChecker,
      });
      cautiousExecutor.registerTool(writeTool);

      askResponses.push("reject");

      const result = await safeExecute(cautiousExecutor, "write_file", { value: "test" }, ctx);

      expect(mockAskHandler).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Permission denied");
    });

    it("should auto-deny dangerous commands", async () => {
      // Default preset should deny 'rm -rf' commands
      const defaultChecker = createDefaultPermissionChecker({
        trustManager: new TrustManager({ configPreset: "default" }),
        askHandler: mockAskHandler,
      });

      const defaultExecutor = new ToolExecutor({
        permissionChecker: defaultChecker,
      });
      defaultExecutor.registerTool(bashTool);

      const result = await safeExecute(defaultExecutor, "bash", { command: "rm -rf /" }, ctx);

      // Should be denied without even asking
      expect(mockAskHandler).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    });
  });

  describe("Trust Presets", () => {
    it("should honor paranoid preset (deny all)", async () => {
      const paranoidChecker = createDefaultPermissionChecker({
        trustManager: new TrustManager({ configPreset: "paranoid" }),
      });

      const paranoidExecutor = new ToolExecutor({
        permissionChecker: paranoidChecker,
      });
      paranoidExecutor.registerTool(readTool);
      paranoidExecutor.registerTool(writeTool);
      paranoidExecutor.registerTool(bashTool);

      // All should be denied
      const readResult = await safeExecute(paranoidExecutor, "read_file", {}, ctx);
      const writeResult = await safeExecute(paranoidExecutor, "write_file", {}, ctx);
      const bashResult = await safeExecute(paranoidExecutor, "bash", { command: "ls" }, ctx);

      expect(readResult.success).toBe(false);
      expect(writeResult.success).toBe(false);
      expect(bashResult.success).toBe(false);
    });

    it("should honor yolo preset (allow all)", async () => {
      const yoloChecker = createDefaultPermissionChecker({
        trustManager: new TrustManager({ configPreset: "yolo" }),
      });

      const yoloExecutor = new ToolExecutor({
        permissionChecker: yoloChecker,
      });
      yoloExecutor.registerTool(readTool);
      yoloExecutor.registerTool(writeTool);
      yoloExecutor.registerTool(bashTool);

      // All should be allowed
      const readResult = await yoloExecutor.execute("read_file", {}, ctx);
      const writeResult = await yoloExecutor.execute("write_file", {}, ctx);
      const bashResult = await yoloExecutor.execute("bash", { command: "ls" }, ctx);

      expect(readResult.result.success).toBe(true);
      expect(writeResult.result.success).toBe(true);
      expect(bashResult.result.success).toBe(true);
    });

    it("should honor default preset (balanced)", async () => {
      const defaultChecker = createDefaultPermissionChecker({
        trustManager: new TrustManager({ configPreset: "default" }),
        askHandler: mockAskHandler,
      });

      const defaultExecutor = new ToolExecutor({
        permissionChecker: defaultChecker,
      });
      defaultExecutor.registerTool(writeTool);
      defaultExecutor.registerTool(bashTool);

      // Edit should be allowed
      const writeResult = await defaultExecutor.execute("write_file", {}, ctx);
      expect(writeResult.result.success).toBe(true);

      // Bash with git status should be allowed
      const gitResult = await defaultExecutor.execute("bash", { command: "git status" }, ctx);
      expect(gitResult.result.success).toBe(true);

      // Regular bash should ask
      askResponses.push("once");
      await defaultExecutor.execute("bash", { command: "echo hello" }, ctx);
      expect(mockAskHandler).toHaveBeenCalled();
    });
  });

  describe("Pattern Matching", () => {
    it("should match wildcard patterns for bash commands", async () => {
      // Create checker with custom patterns
      const trustManager = new TrustManager({
        config: {
          preset: "cautious",
          bash: {
            "npm *": "allow",
            "pnpm *": "allow",
            "*": "ask",
          },
        },
      });

      const patternChecker = createDefaultPermissionChecker({
        trustManager,
        askHandler: mockAskHandler,
      });

      const patternExecutor = new ToolExecutor({
        permissionChecker: patternChecker,
      });
      patternExecutor.registerTool(bashTool);

      // npm commands should be allowed without asking
      const npmResult = await patternExecutor.execute("bash", { command: "npm install" }, ctx);
      expect(npmResult.result.success).toBe(true);
      expect(mockAskHandler).not.toHaveBeenCalled();

      // pnpm commands should be allowed without asking
      const pnpmResult = await patternExecutor.execute("bash", { command: "pnpm test" }, ctx);
      expect(pnpmResult.result.success).toBe(true);
      expect(mockAskHandler).not.toHaveBeenCalled();

      // Other commands should ask
      askResponses.push("once");
      await patternExecutor.execute("bash", { command: "ls -la" }, ctx);
      expect(mockAskHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Session Permission Persistence", () => {
    it("should remember permissions within a session", async () => {
      const sessionManager = new SessionPermissionManager();

      const sessionChecker = createDefaultPermissionChecker({
        trustManager: new TrustManager({ configPreset: "cautious" }),
        sessionManager,
        askHandler: mockAskHandler,
      }) as DefaultPermissionChecker;

      const sessionExecutor = new ToolExecutor({
        permissionChecker: sessionChecker,
      });
      sessionExecutor.registerTool(writeTool);

      // First call - should ask
      askResponses.push("always");
      await sessionExecutor.execute("write_file", { value: "first" }, ctx);
      expect(mockAskHandler).toHaveBeenCalledTimes(1);

      // Second call - should use cached permission
      await sessionExecutor.execute("write_file", { value: "second" }, ctx);
      expect(mockAskHandler).toHaveBeenCalledTimes(1); // Still 1, not asked again

      // Verify session has the permission
      const hasPermission = sessionManager.has({ type: "edit" });
      expect(hasPermission.hasPermission).toBe(true);
    });

    it("should reset permissions on session clear", async () => {
      const sessionManager = new SessionPermissionManager();

      const sessionChecker = createDefaultPermissionChecker({
        trustManager: new TrustManager({ configPreset: "cautious" }),
        sessionManager,
        askHandler: mockAskHandler,
      }) as DefaultPermissionChecker;

      const sessionExecutor = new ToolExecutor({
        permissionChecker: sessionChecker,
      });
      sessionExecutor.registerTool(writeTool);

      // Grant permission
      askResponses.push("always");
      await sessionExecutor.execute("write_file", {}, ctx);
      expect(sessionManager.has({ type: "edit" }).hasPermission).toBe(true);

      // Clear session
      sessionManager.clear();

      // Should need to ask again
      expect(sessionManager.has({ type: "edit" }).hasPermission).toBe(false);

      askResponses.push("once");
      await sessionExecutor.execute("write_file", {}, ctx);
      expect(mockAskHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe("Event Bus Integration", () => {
    it("should emit permission events during flow", async () => {
      const events: string[] = [];

      const eventChecker = createDefaultPermissionChecker({
        trustManager: new TrustManager({ configPreset: "cautious" }),
        askHandler: mockAskHandler,
      }) as DefaultPermissionChecker;

      // Subscribe to events
      eventChecker.eventBus.on("permissionCheck", () => events.push("check"));
      eventChecker.eventBus.on("permissionGranted", () => events.push("granted"));
      eventChecker.eventBus.on("permissionDenied", () => events.push("denied"));

      const eventExecutor = new ToolExecutor({
        permissionChecker: eventChecker,
      });
      eventExecutor.registerTool(writeTool);

      // Execute with permission granted
      askResponses.push("once");
      await eventExecutor.execute("write_file", {}, ctx);

      expect(events).toContain("check");
      expect(events).toContain("granted");

      // Reset and test denial
      events.length = 0;
      askResponses.push("reject");
      await safeExecute(eventExecutor, "write_file", {}, ctx);

      expect(events).toContain("check");
      expect(events).toContain("denied");
    });
  });
});
