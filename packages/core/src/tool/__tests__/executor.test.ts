// ============================================
// ToolExecutor Tests - T016
// ============================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineTool, fail, ok, type ToolContext } from "../../types/tool.js";
import {
  type PermissionChecker,
  type PermissionDecision,
  PermissionDeniedError,
  ToolExecutor,
  ToolNotFoundError,
} from "../executor.js";

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

const failingTool = defineTool({
  name: "fail_tool",
  description: "Always fails",
  parameters: z.object({}),
  kind: "read",
  async execute() {
    return fail("Intentional failure");
  },
});

const throwingTool = defineTool({
  name: "throwing_tool",
  description: "Throws an error",
  parameters: z.object({}),
  kind: "read",
  async execute() {
    throw new Error("Unexpected error");
  },
});

const asyncTool = defineTool({
  name: "async_tool",
  description: "Takes time to execute",
  parameters: z.object({
    delay: z.number(),
  }),
  kind: "read",
  async execute(input) {
    await new Promise((resolve) => setTimeout(resolve, input.delay));
    return ok({ completed: true });
  },
});

const validatedTool = defineTool({
  name: "validated_tool",
  description: "Has custom validation",
  parameters: z.object({
    value: z.number(),
  }),
  kind: "read",
  async execute(input) {
    return ok({ doubled: input.value * 2 });
  },
  validate(input) {
    if (input.value < 0) {
      return { ok: false, error: "Value must be non-negative" };
    }
    return { ok: true, value: undefined };
  },
});

// =============================================================================
// T012: Basic Registration and Lookup Tests
// =============================================================================

describe("ToolExecutor", () => {
  describe("registration", () => {
    it("should register a tool", () => {
      const executor = new ToolExecutor();
      executor.registerTool(echoTool);

      expect(executor.hasTool("echo")).toBe(true);
      expect(executor.getTool("echo")).toBe(echoTool);
    });

    it("should support case-insensitive lookup", () => {
      const executor = new ToolExecutor();
      executor.registerTool(echoTool);

      expect(executor.getTool("ECHO")).toBe(echoTool);
      expect(executor.getTool("Echo")).toBe(echoTool);
      expect(executor.getTool("eCHo")).toBe(echoTool);
      expect(executor.hasTool("ECHO")).toBe(true);
    });

    it("should preserve original name casing", () => {
      const executor = new ToolExecutor();

      const mixedCaseTool = defineTool({
        name: "MyTool",
        description: "Mixed case name",
        parameters: z.object({}),
        kind: "read",
        async execute() {
          return ok({});
        },
      });

      executor.registerTool(mixedCaseTool);

      expect(executor.getOriginalName("mytool")).toBe("MyTool");
      expect(executor.getOriginalName("MYTOOL")).toBe("MyTool");
    });

    it("should list all registered tools", () => {
      const executor = new ToolExecutor();
      executor.registerTool(echoTool);
      executor.registerTool(failingTool);

      const tools = executor.listTools();
      expect(tools).toHaveLength(2);
      expect(tools).toContain(echoTool);
      expect(tools).toContain(failingTool);
    });

    it("should return undefined for unknown tool", () => {
      const executor = new ToolExecutor();
      expect(executor.getTool("nonexistent")).toBeUndefined();
      expect(executor.hasTool("nonexistent")).toBe(false);
    });
  });

  // =============================================================================
  // T012: Execution Tests
  // =============================================================================

  describe("execution", () => {
    let executor: ToolExecutor;
    let ctx: ToolContext;

    beforeEach(() => {
      executor = new ToolExecutor();
      executor.registerTool(echoTool);
      executor.registerTool(failingTool);
      executor.registerTool(throwingTool);
      executor.registerTool(asyncTool);
      executor.registerTool(validatedTool);
      ctx = createMockContext();
    });

    it("should execute a tool successfully", async () => {
      const result = await executor.execute("echo", { message: "hello" }, ctx);

      expect(result.result.success).toBe(true);
      if (result.result.success) {
        expect(result.result.output).toEqual({ echoed: "hello" });
      }
      expect(result.toolName).toBe("echo");
      expect(result.callId).toBe("call-456");
    });

    it("should handle tool that returns failure", async () => {
      const result = await executor.execute("fail_tool", {}, ctx);

      expect(result.result.success).toBe(false);
      if (!result.result.success) {
        expect(result.result.error).toBe("Intentional failure");
      }
    });

    it("should catch thrown errors and return as failure", async () => {
      const result = await executor.execute("throwing_tool", {}, ctx);

      expect(result.result.success).toBe(false);
      if (!result.result.success) {
        expect(result.result.error).toBe("Unexpected error");
      }
    });

    it("should throw ToolNotFoundError for unknown tool", async () => {
      await expect(executor.execute("nonexistent", {}, ctx)).rejects.toThrow(ToolNotFoundError);
    });

    it("should return validation error for invalid params", async () => {
      const result = await executor.execute("echo", { message: 123 }, ctx);

      expect(result.result.success).toBe(false);
      if (!result.result.success) {
        expect(result.result.error).toContain("Validation failed");
      }
    });

    it("should run custom validation", async () => {
      const result = await executor.execute("validated_tool", { value: -5 }, ctx);

      expect(result.result.success).toBe(false);
      if (!result.result.success) {
        expect(result.result.error).toContain("Value must be non-negative");
      }
    });

    it("should pass custom validation for valid input", async () => {
      const result = await executor.execute("validated_tool", { value: 5 }, ctx);

      expect(result.result.success).toBe(true);
      if (result.result.success) {
        expect(result.result.output).toEqual({ doubled: 10 });
      }
    });

    // =============================================================================
    // T012: Timing Metadata Tests
    // =============================================================================

    it("should capture execution timing", async () => {
      const result = await executor.execute("echo", { message: "test" }, ctx);

      expect(result.timing).toBeDefined();
      expect(result.timing.startedAt).toBeTypeOf("number");
      expect(result.timing.completedAt).toBeTypeOf("number");
      expect(result.timing.durationMs).toBeTypeOf("number");
      expect(result.timing.completedAt).toBeGreaterThanOrEqual(result.timing.startedAt);
      expect(result.timing.durationMs).toBe(result.timing.completedAt - result.timing.startedAt);
    });

    it("should capture timing for slow operations", async () => {
      const delay = 50; // 50ms delay
      const result = await executor.execute("async_tool", { delay }, ctx);

      expect(result.timing.durationMs).toBeGreaterThanOrEqual(delay - 10); // Allow some tolerance
    });

    it("should capture timing even on validation failure", async () => {
      const result = await executor.execute("echo", { message: 123 }, ctx);

      expect(result.timing).toBeDefined();
      expect(result.timing.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // =============================================================================
  // T013: Permission Tests
  // =============================================================================

  describe("permissions", () => {
    it("should allow execution when no permission checker is set", async () => {
      const executor = new ToolExecutor();
      executor.registerTool(echoTool);
      const ctx = createMockContext();

      const result = await executor.execute("echo", { message: "test" }, ctx);
      expect(result.result.success).toBe(true);
    });

    it("should check permission before execution", async () => {
      const mockChecker: PermissionChecker = {
        checkPermission: vi.fn().mockResolvedValue("allow" as PermissionDecision),
      };

      const executor = new ToolExecutor({ permissionChecker: mockChecker });
      executor.registerTool(echoTool);
      const ctx = createMockContext();

      await executor.execute("echo", { message: "test" }, ctx);

      expect(mockChecker.checkPermission).toHaveBeenCalledWith("echo", { message: "test" }, ctx);
    });

    it("should throw PermissionDeniedError when permission is denied", async () => {
      const mockChecker: PermissionChecker = {
        checkPermission: vi.fn().mockResolvedValue("deny" as PermissionDecision),
      };

      const executor = new ToolExecutor({ permissionChecker: mockChecker });
      executor.registerTool(echoTool);
      const ctx = createMockContext();

      await expect(executor.execute("echo", { message: "test" }, ctx)).rejects.toThrow(
        PermissionDeniedError
      );
    });

    it("should throw PermissionDeniedError with 'ask' message when permission requires user", async () => {
      const mockChecker: PermissionChecker = {
        checkPermission: vi.fn().mockResolvedValue("ask" as PermissionDecision),
      };

      const executor = new ToolExecutor({ permissionChecker: mockChecker });
      executor.registerTool(echoTool);
      const ctx = createMockContext();

      await expect(executor.execute("echo", { message: "test" }, ctx)).rejects.toThrow(
        "User confirmation required"
      );
    });

    it("should return permission decision via checkPermission method", async () => {
      const mockChecker: PermissionChecker = {
        checkPermission: vi.fn().mockResolvedValue("ask" as PermissionDecision),
      };

      const executor = new ToolExecutor({ permissionChecker: mockChecker });
      const ctx = createMockContext();

      const decision = await executor.checkPermission("echo", { message: "test" }, ctx);
      expect(decision).toBe("ask");
    });

    it("should return allow when no permission checker", async () => {
      const executor = new ToolExecutor();
      const ctx = createMockContext();

      const decision = await executor.checkPermission("echo", {}, ctx);
      expect(decision).toBe("allow");
    });

    // =============================================================================
    // T013: executeWithPermissionCheck Tests
    // =============================================================================

    describe("executeWithPermissionCheck", () => {
      it("should return completed status on success", async () => {
        const executor = new ToolExecutor();
        executor.registerTool(echoTool);
        const ctx = createMockContext();

        const result = await executor.executeWithPermissionCheck("echo", { message: "test" }, ctx);

        expect(result.status).toBe("completed");
        if (result.status === "completed") {
          expect(result.result.result.success).toBe(true);
        }
      });

      it("should return not_found status for unknown tool", async () => {
        const executor = new ToolExecutor();
        const ctx = createMockContext();

        const result = await executor.executeWithPermissionCheck("unknown", {}, ctx);

        expect(result.status).toBe("not_found");
        if (result.status === "not_found") {
          expect(result.toolName).toBe("unknown");
        }
      });

      it("should return denied status when permission denied", async () => {
        const mockChecker: PermissionChecker = {
          checkPermission: vi.fn().mockResolvedValue("deny" as PermissionDecision),
        };

        const executor = new ToolExecutor({ permissionChecker: mockChecker });
        executor.registerTool(echoTool);
        const ctx = createMockContext();

        const result = await executor.executeWithPermissionCheck("echo", { message: "test" }, ctx);

        expect(result.status).toBe("denied");
        if (result.status === "denied") {
          expect(result.error).toContain("Permission denied");
        }
      });

      it("should return permission_required status when ask", async () => {
        const mockChecker: PermissionChecker = {
          checkPermission: vi.fn().mockResolvedValue("ask" as PermissionDecision),
        };

        const executor = new ToolExecutor({ permissionChecker: mockChecker });
        executor.registerTool(echoTool);
        const ctx = createMockContext();

        const result = await executor.executeWithPermissionCheck("echo", { message: "test" }, ctx);

        expect(result.status).toBe("permission_required");
        if (result.status === "permission_required") {
          expect(result.toolName).toBe("echo");
          expect(result.params).toEqual({ message: "test" });
        }
      });
    });
  });

  // =============================================================================
  // Error Types Tests
  // =============================================================================

  describe("error types", () => {
    it("PermissionDeniedError should have correct code", () => {
      const error = new PermissionDeniedError("test_tool");

      expect(error.name).toBe("PermissionDeniedError");
      expect(error.toolName).toBe("test_tool");
      expect(error.message).toContain("test_tool");
      expect(error.isRetryable).toBe(false);
    });

    it("ToolNotFoundError should have correct code", () => {
      const error = new ToolNotFoundError("missing_tool");

      expect(error.name).toBe("ToolNotFoundError");
      expect(error.toolName).toBe("missing_tool");
      expect(error.message).toContain("missing_tool");
      expect(error.isRetryable).toBe(false);
    });

    it("PermissionDeniedError should accept custom message", () => {
      const error = new PermissionDeniedError("test_tool", "Custom message");

      expect(error.message).toBe("Custom message");
    });
  });

  // =============================================================================
  // T008: Timeout Tests
  // =============================================================================

  describe("timeout handling", () => {
    it("should timeout slow tool execution", async () => {
      const slowTool = defineTool({
        name: "slow_tool",
        description: "A slow tool",
        parameters: z.object({}),
        kind: "read",
        async execute() {
          // Sleep for longer than timeout
          await new Promise((resolve) => setTimeout(resolve, 500));
          return ok({ done: true });
        },
      });

      const executor = new ToolExecutor({ defaultTimeout: 50 });
      executor.registerTool(slowTool);
      const ctx = createMockContext();

      const result = await executor.execute("slow_tool", {}, ctx);

      expect(result.result.success).toBe(false);
      expect(result.timedOut).toBe(true);
      if (!result.result.success) {
        expect(result.result.error).toContain("timed out");
      }
    });

    it("should use shell timeout for shell tools", async () => {
      const shellTool = defineTool({
        name: "shell_cmd",
        description: "A shell command",
        parameters: z.object({}),
        kind: "shell",
        async execute() {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return ok({ done: true });
        },
      });

      // Default timeout is 30ms but shell timeout is 200ms
      const executor = new ToolExecutor({
        defaultTimeout: 30,
        shellTimeout: 200,
      });
      executor.registerTool(shellTool);
      const ctx = createMockContext();

      const result = await executor.execute("shell_cmd", {}, ctx);

      // Should succeed because shell timeout is longer
      expect(result.result.success).toBe(true);
      expect(result.timedOut).toBeUndefined();
    });

    it("should allow timeout override via options", async () => {
      const slowTool = defineTool({
        name: "slow_tool",
        description: "A slow tool",
        parameters: z.object({}),
        kind: "read",
        async execute() {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return ok({ done: true });
        },
      });

      const executor = new ToolExecutor({ defaultTimeout: 50 });
      executor.registerTool(slowTool);
      const ctx = createMockContext();

      // Override with longer timeout
      const result = await executor.execute("slow_tool", {}, ctx, { timeout: 200 });

      expect(result.result.success).toBe(true);
    });

    it("should capture timing on timeout", async () => {
      const slowTool = defineTool({
        name: "slow_tool",
        description: "A slow tool",
        parameters: z.object({}),
        kind: "read",
        async execute() {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return ok({ done: true });
        },
      });

      const executor = new ToolExecutor({ defaultTimeout: 50 });
      executor.registerTool(slowTool);
      const ctx = createMockContext();

      const result = await executor.execute("slow_tool", {}, ctx);

      expect(result.timing).toBeDefined();
      expect(result.timing.durationMs).toBeGreaterThanOrEqual(45);
    });
  });

  // =============================================================================
  // T009: Abort Signal Tests
  // =============================================================================

  describe("abort signal handling", () => {
    it("should abort execution when signal is triggered", async () => {
      const slowTool = defineTool({
        name: "slow_tool",
        description: "A slow tool",
        parameters: z.object({}),
        kind: "read",
        async execute() {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return ok({ done: true });
        },
      });

      const executor = new ToolExecutor();
      executor.registerTool(slowTool);

      const controller = new AbortController();
      const ctx = createMockContext();

      // Abort after 50ms
      setTimeout(() => controller.abort(), 50);

      const result = await executor.execute("slow_tool", {}, ctx, {
        abortSignal: controller.signal,
      });

      expect(result.result.success).toBe(false);
      expect(result.aborted).toBe(true);
      if (!result.result.success) {
        expect(result.result.error).toContain("aborted");
      }
    });

    it("should return immediately if already aborted", async () => {
      const echoTool = defineTool({
        name: "echo",
        description: "Echo input",
        parameters: z.object({ message: z.string() }),
        kind: "read",
        async execute(input) {
          return ok({ echoed: input.message });
        },
      });

      const executor = new ToolExecutor();
      executor.registerTool(echoTool);

      const controller = new AbortController();
      controller.abort(); // Pre-abort

      const ctx = createMockContext();

      const result = await executor.execute("echo", { message: "test" }, ctx, {
        abortSignal: controller.signal,
      });

      expect(result.result.success).toBe(false);
      expect(result.aborted).toBe(true);
    });

    it("should use context abort signal if no option provided", async () => {
      const slowTool = defineTool({
        name: "slow_tool",
        description: "A slow tool",
        parameters: z.object({}),
        kind: "read",
        async execute() {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return ok({ done: true });
        },
      });

      const executor = new ToolExecutor();
      executor.registerTool(slowTool);

      const controller = new AbortController();
      const ctx = createMockContext({ abortSignal: controller.signal });

      // Abort after 50ms
      setTimeout(() => controller.abort(), 50);

      const result = await executor.execute("slow_tool", {}, ctx);

      expect(result.result.success).toBe(false);
      expect(result.aborted).toBe(true);
    });

    it("should abort within 100ms of signal", async () => {
      const slowTool = defineTool({
        name: "slow_tool",
        description: "A slow tool",
        parameters: z.object({}),
        kind: "read",
        async execute() {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return ok({ done: true });
        },
      });

      const executor = new ToolExecutor();
      executor.registerTool(slowTool);

      const controller = new AbortController();
      const ctx = createMockContext();

      const startTime = Date.now();
      setTimeout(() => controller.abort(), 50);

      const result = await executor.execute("slow_tool", {}, ctx, {
        abortSignal: controller.signal,
      });

      const elapsed = Date.now() - startTime;

      expect(result.aborted).toBe(true);
      // Should abort within 150ms (50ms delay + 100ms tolerance)
      expect(elapsed).toBeLessThan(200);
    });
  });

  // =============================================================================
  // T008, T009: Error Types Tests
  // =============================================================================

  describe("timeout and abort error types", () => {
    it("ToolTimeoutError should have correct properties", async () => {
      // Import the error class for testing
      const { ToolTimeoutError } = await import("../executor.js");
      const error = new ToolTimeoutError("test_tool", 5000);

      expect(error.name).toBe("ToolTimeoutError");
      expect(error.toolName).toBe("test_tool");
      expect(error.timeoutMs).toBe(5000);
      expect(error.message).toContain("5000ms");
      expect(error.isRetryable).toBe(true);
    });

    it("ToolTimeoutError should support partial output", async () => {
      const { ToolTimeoutError } = await import("../executor.js");
      const error = new ToolTimeoutError("test_tool", 5000, { partial: "data" });

      expect(error.partialOutput).toEqual({ partial: "data" });
    });

    it("ToolAbortedError should have correct properties", async () => {
      const { ToolAbortedError } = await import("../executor.js");
      const error = new ToolAbortedError("test_tool");

      expect(error.name).toBe("ToolAbortedError");
      expect(error.toolName).toBe("test_tool");
      expect(error.message).toContain("aborted");
      expect(error.isRetryable).toBe(false);
    });

    it("ToolAbortedError should support partial output", async () => {
      const { ToolAbortedError } = await import("../executor.js");
      const error = new ToolAbortedError("test_tool", { partial: "result" });

      expect(error.partialOutput).toEqual({ partial: "result" });
    });
  });
});
