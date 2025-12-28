// ============================================
// ToolExecutor Tests - T016
// ============================================

import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";

import {
  ToolExecutor,
  PermissionDeniedError,
  ToolNotFoundError,
  type PermissionChecker,
  type PermissionDecision,
} from "../executor.js";
import { defineTool, ok, fail, type ToolContext } from "../../types/tool.js";

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
      await expect(executor.execute("nonexistent", {}, ctx)).rejects.toThrow(
        ToolNotFoundError
      );
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
      expect(result.timing.durationMs).toBe(
        result.timing.completedAt - result.timing.startedAt
      );
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

      expect(mockChecker.checkPermission).toHaveBeenCalledWith(
        "echo",
        { message: "test" },
        ctx
      );
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

        const result = await executor.executeWithPermissionCheck(
          "echo",
          { message: "test" },
          ctx
        );

        expect(result.status).toBe("completed");
        if (result.status === "completed") {
          expect(result.result.result.success).toBe(true);
        }
      });

      it("should return not_found status for unknown tool", async () => {
        const executor = new ToolExecutor();
        const ctx = createMockContext();

        const result = await executor.executeWithPermissionCheck(
          "unknown",
          {},
          ctx
        );

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

        const result = await executor.executeWithPermissionCheck(
          "echo",
          { message: "test" },
          ctx
        );

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

        const result = await executor.executeWithPermissionCheck(
          "echo",
          { message: "test" },
          ctx
        );

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
});
