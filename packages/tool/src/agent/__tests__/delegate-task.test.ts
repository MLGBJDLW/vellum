// ============================================
// delegate_task Integration Tests - T024
// ============================================
// REQ-014: delegate_task tool tests
// REQ-037: Anti-recursion tests

import { AgentLevel, type DelegationTarget, type TaskPacket } from "@vellum/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canDelegate,
  DEFAULT_DELEGATION_TIMEOUT,
  type DelegateTaskContext,
  type DelegateTaskParams,
  type DelegateTaskResult,
  type DelegationHandler,
  delegateTaskTool,
  executeDelegateTask,
  getDelegationHandler,
  setDelegationHandler,
  WorkerDelegationError,
} from "../delegate-task.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock DelegateTaskContext for testing.
 */
function createMockContext(overrides: Partial<DelegateTaskContext> = {}): DelegateTaskContext {
  return {
    workingDir: "/test/project",
    sessionId: "test-session-123",
    messageId: "msg-456",
    callId: "call-789",
    abortSignal: new AbortController().signal,
    agentLevel: AgentLevel.workflow,
    agentSlug: "test-orchestrator",
    checkPermission: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

/**
 * Create a mock DelegationHandler for testing.
 */
function createMockHandler(
  processImpl?: (packet: TaskPacket, timeout: number) => Promise<DelegateTaskResult>
): DelegationHandler {
  return {
    process:
      processImpl ??
      vi.fn().mockImplementation(async (packet: TaskPacket) => ({
        success: true,
        taskPacketId: packet.id,
        agentId: `agent-${packet.id.slice(0, 8)}`,
      })),
  };
}

/**
 * Create a builtin target for testing.
 */
function createBuiltinTarget(slug: string): DelegationTarget {
  return { kind: "builtin", slug };
}

/**
 * Create a custom target with ExtendedModeConfig for testing.
 */
function createCustomTarget(slug: string): DelegationTarget {
  return {
    kind: "custom",
    slug,
    modeConfig: {
      name: "code" as const,
      description: `Custom ${slug} agent`,
      tools: { edit: true, bash: true },
      prompt: `You are a custom ${slug} agent.`,
      level: AgentLevel.worker,
    },
  };
}

/**
 * Create an MCP target for testing.
 */
function createMcpTarget(serverId: string, toolName: string): DelegationTarget {
  return {
    kind: "mcp",
    serverId,
    toolName,
    params: { key: "value" },
  };
}

// =============================================================================
// Store original handler for restoration
// =============================================================================

let originalHandler: DelegationHandler;

// =============================================================================
// T024: canDelegate Function Tests
// =============================================================================

describe("canDelegate", () => {
  it("should allow orchestrator to delegate", () => {
    expect(canDelegate(AgentLevel.orchestrator)).toBe(true);
  });

  it("should allow workflow to delegate", () => {
    expect(canDelegate(AgentLevel.workflow)).toBe(true);
  });

  it("should reject worker delegation (anti-recursion)", () => {
    expect(canDelegate(AgentLevel.worker)).toBe(false);
  });
});

// =============================================================================
// T024: WorkerDelegationError Tests
// =============================================================================

describe("WorkerDelegationError", () => {
  it("should create error with correct message", () => {
    const error = new WorkerDelegationError("coder");
    expect(error.message).toBe(
      "Worker agents cannot delegate tasks. Agent 'coder' is at level 2 (worker)."
    );
    expect(error.name).toBe("WorkerDelegationError");
  });

  it("should be an instance of Error", () => {
    const error = new WorkerDelegationError("qa");
    expect(error).toBeInstanceOf(Error);
  });
});

// =============================================================================
// T024: executeDelegateTask Tests
// =============================================================================

describe("executeDelegateTask", () => {
  beforeEach(() => {
    // Store original handler
    originalHandler = getDelegationHandler();
    // Reset to a mock handler for testing
    setDelegationHandler(createMockHandler());
  });

  afterEach(() => {
    // Restore original handler
    setDelegationHandler(originalHandler);
  });

  // ---------------------------------------------------------------------------
  // Target Routing Tests
  // ---------------------------------------------------------------------------

  describe("target routing", () => {
    it("should successfully delegate to builtin target", async () => {
      const params: DelegateTaskParams = {
        target: createBuiltinTarget("coder"),
        task: "Implement the authentication module",
      };
      const context = createMockContext();

      const result = await executeDelegateTask(params, context);

      expect(result.success).toBe(true);
      expect(result.taskPacketId).toBeDefined();
      expect(result.taskPacketId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it("should successfully delegate to custom target with ExtendedModeConfig", async () => {
      const params: DelegateTaskParams = {
        target: createCustomTarget("specialized-analyzer"),
        task: "Analyze code for patterns",
      };
      const context = createMockContext();

      const result = await executeDelegateTask(params, context);

      expect(result.success).toBe(true);
      expect(result.taskPacketId).toBeDefined();
    });

    it("should successfully delegate to MCP target", async () => {
      const params: DelegateTaskParams = {
        target: createMcpTarget("github-server", "create_pull_request"),
        task: "Create a pull request for the feature branch",
      };
      const context = createMockContext();

      const result = await executeDelegateTask(params, context);

      expect(result.success).toBe(true);
      expect(result.taskPacketId).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Anti-Recursion Tests (REQ-037)
  // ---------------------------------------------------------------------------

  describe("anti-recursion (REQ-037)", () => {
    it("should reject level 2 worker delegation", async () => {
      const params: DelegateTaskParams = {
        target: createBuiltinTarget("coder"),
        task: "This should be rejected",
      };
      const context = createMockContext({
        agentLevel: AgentLevel.worker,
        agentSlug: "worker-agent",
      });

      const result = await executeDelegateTask(params, context);

      expect(result.success).toBe(false);
      expect(result.taskPacketId).toBe("");
      expect(result.error).toContain("Worker agents cannot delegate tasks");
      expect(result.error).toContain("worker-agent");
      expect(result.error).toContain("level 2");
    });

    it("should allow orchestrator (level 0) to delegate", async () => {
      const params: DelegateTaskParams = {
        target: createBuiltinTarget("coder"),
        task: "Implement feature X",
      };
      const context = createMockContext({
        agentLevel: AgentLevel.orchestrator,
        agentSlug: "main-orchestrator",
      });

      const result = await executeDelegateTask(params, context);

      expect(result.success).toBe(true);
    });

    it("should allow workflow (level 1) to delegate", async () => {
      const params: DelegateTaskParams = {
        target: createBuiltinTarget("coder"),
        task: "Implement feature Y",
      };
      const context = createMockContext({
        agentLevel: AgentLevel.workflow,
        agentSlug: "workflow-manager",
      });

      const result = await executeDelegateTask(params, context);

      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Task Packet ID Tests
  // ---------------------------------------------------------------------------

  describe("task packet id", () => {
    it("should return a proper UUID taskPacketId", async () => {
      const params: DelegateTaskParams = {
        target: createBuiltinTarget("coder"),
        task: "Test task",
      };
      const context = createMockContext();

      const result = await executeDelegateTask(params, context);

      expect(result.success).toBe(true);
      expect(result.taskPacketId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it("should return unique taskPacketIds for each delegation", async () => {
      const params: DelegateTaskParams = {
        target: createBuiltinTarget("coder"),
        task: "Test task",
      };
      const context = createMockContext();

      const result1 = await executeDelegateTask(params, context);
      const result2 = await executeDelegateTask(params, context);

      expect(result1.taskPacketId).not.toBe(result2.taskPacketId);
    });
  });

  // ---------------------------------------------------------------------------
  // Timeout Tests
  // ---------------------------------------------------------------------------

  describe("timeout parameter", () => {
    it("should use default timeout when not specified", async () => {
      const mockHandler = createMockHandler();
      const processSpy = vi.spyOn(mockHandler, "process");
      setDelegationHandler(mockHandler);

      const params: DelegateTaskParams = {
        target: createBuiltinTarget("coder"),
        task: "Test task",
      };
      const context = createMockContext();

      await executeDelegateTask(params, context);

      expect(processSpy).toHaveBeenCalledWith(expect.any(Object), DEFAULT_DELEGATION_TIMEOUT);
    });

    it("should respect custom timeout parameter", async () => {
      const mockHandler = createMockHandler();
      const processSpy = vi.spyOn(mockHandler, "process");
      setDelegationHandler(mockHandler);

      const customTimeout = 60000;
      const params: DelegateTaskParams = {
        target: createBuiltinTarget("coder"),
        task: "Test task",
        timeout: customTimeout,
      };
      const context = createMockContext();

      await executeDelegateTask(params, context);

      expect(processSpy).toHaveBeenCalledWith(expect.any(Object), customTimeout);
    });
  });

  // ---------------------------------------------------------------------------
  // Context Tests
  // ---------------------------------------------------------------------------

  describe("context with files", () => {
    it("should pass files in context correctly", async () => {
      let capturedPacket: TaskPacket | null = null;
      const mockHandler = createMockHandler(async (packet) => {
        capturedPacket = packet;
        return { success: true, taskPacketId: packet.id };
      });
      setDelegationHandler(mockHandler);

      const files = ["src/auth/login.ts", "src/auth/logout.ts"];
      const params: DelegateTaskParams = {
        target: createBuiltinTarget("coder"),
        task: "Review authentication files",
        context: { files },
      };
      const context = createMockContext();

      await executeDelegateTask(params, context);

      expect(capturedPacket).not.toBeNull();
      // biome-ignore lint/style/noNonNullAssertion: verified not null above
      expect(capturedPacket!.context?.files).toEqual(files);
    });

    it("should pass memory in context correctly", async () => {
      let capturedPacket: TaskPacket | null = null;
      const mockHandler = createMockHandler(async (packet) => {
        capturedPacket = packet;
        return { success: true, taskPacketId: packet.id };
      });
      setDelegationHandler(mockHandler);

      const memory = { previousResult: "success", iteration: 1 };
      const params: DelegateTaskParams = {
        target: createBuiltinTarget("coder"),
        task: "Continue from previous work",
        context: { memory },
      };
      const context = createMockContext();

      await executeDelegateTask(params, context);

      expect(capturedPacket).not.toBeNull();
      // biome-ignore lint/style/noNonNullAssertion: verified not null above
      expect(capturedPacket!.context?.memory).toEqual(memory);
    });

    it("should include sessionId in packet context", async () => {
      let capturedPacket: TaskPacket | null = null;
      const mockHandler = createMockHandler(async (packet) => {
        capturedPacket = packet;
        return { success: true, taskPacketId: packet.id };
      });
      setDelegationHandler(mockHandler);

      const params: DelegateTaskParams = {
        target: createBuiltinTarget("coder"),
        task: "Test task",
      };
      const context = createMockContext({ sessionId: "session-xyz" });

      await executeDelegateTask(params, context);

      expect(capturedPacket).not.toBeNull();
      // biome-ignore lint/style/noNonNullAssertion: verified not null above
      expect(capturedPacket!.context?.sessionId).toBe("session-xyz");
    });
  });

  // ---------------------------------------------------------------------------
  // Abort Signal Tests
  // ---------------------------------------------------------------------------

  describe("abort signal", () => {
    it("should return error when already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      const params: DelegateTaskParams = {
        target: createBuiltinTarget("coder"),
        task: "Test task",
      };
      const context = createMockContext({ abortSignal: controller.signal });

      const result = await executeDelegateTask(params, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Delegation aborted");
    });
  });

  // ---------------------------------------------------------------------------
  // Handler Error Tests
  // ---------------------------------------------------------------------------

  describe("handler errors", () => {
    it("should handle handler throwing an error", async () => {
      const mockHandler = createMockHandler(async () => {
        throw new Error("Handler failed unexpectedly");
      });
      setDelegationHandler(mockHandler);

      const params: DelegateTaskParams = {
        target: createBuiltinTarget("coder"),
        task: "Test task",
      };
      const context = createMockContext();

      const result = await executeDelegateTask(params, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Handler failed unexpectedly");
    });

    it("should handle non-Error thrown objects", async () => {
      const mockHandler = createMockHandler(async () => {
        throw "String error"; // eslint-disable-line @typescript-eslint/only-throw-error
      });
      setDelegationHandler(mockHandler);

      const params: DelegateTaskParams = {
        target: createBuiltinTarget("coder"),
        task: "Test task",
      };
      const context = createMockContext();

      const result = await executeDelegateTask(params, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown delegation error");
    });
  });
});

// =============================================================================
// T024: delegateTaskTool Tests
// =============================================================================

describe("delegateTaskTool", () => {
  beforeEach(() => {
    originalHandler = getDelegationHandler();
    setDelegationHandler(createMockHandler());
  });

  afterEach(() => {
    setDelegationHandler(originalHandler);
  });

  // ---------------------------------------------------------------------------
  // Definition Tests
  // ---------------------------------------------------------------------------

  describe("definition", () => {
    it("should have correct name", () => {
      expect(delegateTaskTool.definition.name).toBe("delegate_task");
    });

    it("should have description mentioning delegation", () => {
      expect(delegateTaskTool.definition.description).toContain("Delegate");
    });

    it("should be in orchestration category", () => {
      expect(delegateTaskTool.definition.category).toBe("orchestration");
    });

    it("should be of agent kind", () => {
      expect(delegateTaskTool.definition.kind).toBe("agent");
    });

    it("should be enabled", () => {
      expect(delegateTaskTool.definition.enabled).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Execute Tests
  // ---------------------------------------------------------------------------

  describe("execute", () => {
    it("should return success output on successful delegation", async () => {
      const input = {
        target: { kind: "builtin" as const, slug: "coder" },
        task: "Test task",
        timeout: 300000,
      };
      const context = createMockContext();

      const result = await delegateTaskTool.execute(input, context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.success).toBe(true);
        expect(result.output.taskPacketId).toBeDefined();
      }
    });

    it("should return error on failed delegation", async () => {
      const input = {
        target: { kind: "builtin" as const, slug: "coder" },
        task: "Test task",
        timeout: 300000,
      };
      const context = createMockContext({
        agentLevel: AgentLevel.worker,
        agentSlug: "worker-agent",
      });

      const result = await delegateTaskTool.execute(input, context);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Worker agents cannot delegate");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // shouldConfirm Tests
  // ---------------------------------------------------------------------------

  describe("shouldConfirm", () => {
    it("should require confirmation for MCP targets", () => {
      const input = {
        target: { kind: "mcp" as const, serverId: "github", toolName: "create_pr" },
        task: "Create PR",
        timeout: 300000,
      };

      expect(delegateTaskTool.shouldConfirm(input)).toBe(true);
    });

    it("should not require confirmation for builtin targets", () => {
      const input = {
        target: { kind: "builtin" as const, slug: "coder" },
        task: "Implement feature",
        timeout: 300000,
      };

      expect(delegateTaskTool.shouldConfirm(input)).toBe(false);
    });

    it("should not require confirmation for custom targets", () => {
      const input = {
        target: {
          kind: "custom" as const,
          slug: "analyzer",
          modeConfig: {
            name: "code" as const,
            description: "Analyzer agent",
            tools: { edit: true, bash: true as const },
            prompt: "You analyze code.",
            level: AgentLevel.worker,
            maxConcurrentSubagents: 3,
          },
        },
        task: "Analyze code",
        timeout: 300000,
      };

      expect(delegateTaskTool.shouldConfirm(input)).toBe(false);
    });
  });
});

// =============================================================================
// T024: Schema Validation Tests
// =============================================================================

import { DelegateTaskParamsSchema, DelegateTaskResultSchema } from "../delegate-task.js";

describe("schema validation", () => {
  describe("DelegateTaskParamsSchema", () => {
    it("should reject empty task", () => {
      const result = DelegateTaskParamsSchema.safeParse({
        target: { kind: "builtin", slug: "coder" },
        task: "",
      });

      expect(result.success).toBe(false);
    });

    it("should reject invalid target kind", () => {
      const result = DelegateTaskParamsSchema.safeParse({
        target: { kind: "invalid", slug: "test" },
        task: "Test task",
      });

      expect(result.success).toBe(false);
    });

    it("should reject missing required fields", () => {
      // Missing target
      const result1 = DelegateTaskParamsSchema.safeParse({
        task: "Test task",
      });
      expect(result1.success).toBe(false);

      // Missing task
      const result2 = DelegateTaskParamsSchema.safeParse({
        target: { kind: "builtin", slug: "coder" },
      });
      expect(result2.success).toBe(false);
    });

    it("should accept valid params with optional fields", () => {
      const result = DelegateTaskParamsSchema.safeParse({
        target: { kind: "builtin", slug: "coder" },
        task: "Test task",
        context: {
          files: ["src/index.ts"],
          memory: { key: "value" },
        },
        timeout: 60000,
      });

      expect(result.success).toBe(true);
    });

    it("should reject negative timeout", () => {
      const result = DelegateTaskParamsSchema.safeParse({
        target: { kind: "builtin", slug: "coder" },
        task: "Test task",
        timeout: -1000,
      });

      expect(result.success).toBe(false);
    });

    it("should reject non-integer timeout", () => {
      const result = DelegateTaskParamsSchema.safeParse({
        target: { kind: "builtin", slug: "coder" },
        task: "Test task",
        timeout: 1000.5,
      });

      expect(result.success).toBe(false);
    });
  });

  describe("DelegateTaskResultSchema", () => {
    it("should validate successful result", () => {
      const result = DelegateTaskResultSchema.safeParse({
        success: true,
        taskPacketId: "550e8400-e29b-41d4-a716-446655440000",
        agentId: "coder-agent-123",
      });

      expect(result.success).toBe(true);
    });

    it("should validate failed result with error", () => {
      const result = DelegateTaskResultSchema.safeParse({
        success: false,
        taskPacketId: "550e8400-e29b-41d4-a716-446655440000",
        error: "Delegation failed due to timeout",
      });

      expect(result.success).toBe(true);
    });

    it("should reject invalid UUID taskPacketId", () => {
      const result = DelegateTaskResultSchema.safeParse({
        success: true,
        taskPacketId: "not-a-uuid",
      });

      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// T024: Handler Management Tests
// =============================================================================

describe("handler management", () => {
  it("should allow setting and getting delegation handler", () => {
    const originalHandler = getDelegationHandler();
    const customHandler = createMockHandler();

    setDelegationHandler(customHandler);
    expect(getDelegationHandler()).toBe(customHandler);

    // Restore
    setDelegationHandler(originalHandler);
  });

  it("should use custom handler when set", async () => {
    const originalHandler = getDelegationHandler();
    const customResult: DelegateTaskResult = {
      success: true,
      taskPacketId: "custom-uuid-12345678-1234-1234-1234-123456789012",
      agentId: "custom-agent",
      result: { customData: true },
    };

    const customHandler = createMockHandler(async () => customResult);
    setDelegationHandler(customHandler);

    const params: DelegateTaskParams = {
      target: createBuiltinTarget("coder"),
      task: "Test task",
    };
    const context = createMockContext();

    const result = await executeDelegateTask(params, context);

    expect(result.agentId).toBe("custom-agent");
    expect(result.result).toEqual({ customData: true });

    // Restore
    setDelegationHandler(originalHandler);
  });
});

// =============================================================================
// T024: Integration Tests with Different Agent Levels
// =============================================================================

describe("agent level integration", () => {
  beforeEach(() => {
    originalHandler = getDelegationHandler();
    setDelegationHandler(createMockHandler());
  });

  afterEach(() => {
    setDelegationHandler(originalHandler);
  });

  it("should include createdBy from context agentSlug", async () => {
    let capturedPacket: TaskPacket | null = null;
    const mockHandler = createMockHandler(async (packet) => {
      capturedPacket = packet;
      return { success: true, taskPacketId: packet.id };
    });
    setDelegationHandler(mockHandler);

    const params: DelegateTaskParams = {
      target: createBuiltinTarget("coder"),
      task: "Test task",
    };
    const context = createMockContext({ agentSlug: "spec-orchestrator" });

    await executeDelegateTask(params, context);

    expect(capturedPacket).not.toBeNull();
    // biome-ignore lint/style/noNonNullAssertion: verified not null above
    expect(capturedPacket!.createdBy).toBe("spec-orchestrator");
  });

  it("should create proper task packet with all delegation target types", async () => {
    const capturedPackets: TaskPacket[] = [];
    const mockHandler = createMockHandler(async (packet) => {
      capturedPackets.push(packet);
      return { success: true, taskPacketId: packet.id };
    });
    setDelegationHandler(mockHandler);

    const context = createMockContext();

    // Test builtin target
    await executeDelegateTask(
      { target: createBuiltinTarget("coder"), task: "Builtin task" },
      context
    );

    // Test custom target
    await executeDelegateTask(
      { target: createCustomTarget("analyzer"), task: "Custom task" },
      context
    );

    // Test MCP target
    await executeDelegateTask(
      { target: createMcpTarget("github", "create_pr"), task: "MCP task" },
      context
    );

    expect(capturedPackets).toHaveLength(3);
    // biome-ignore lint/style/noNonNullAssertion: array length verified above
    expect(capturedPackets[0]!.target.kind).toBe("builtin");
    // biome-ignore lint/style/noNonNullAssertion: array length verified above
    expect(capturedPackets[1]!.target.kind).toBe("custom");
    // biome-ignore lint/style/noNonNullAssertion: array length verified above
    expect(capturedPackets[2]!.target.kind).toBe("mcp");
  });
});

// =============================================================================
// T024: Edge Cases
// =============================================================================

describe("edge cases", () => {
  beforeEach(() => {
    originalHandler = getDelegationHandler();
    setDelegationHandler(createMockHandler());
  });

  afterEach(() => {
    setDelegationHandler(originalHandler);
  });

  it("should handle very long task descriptions", async () => {
    const longTask = "A".repeat(10000);
    const params: DelegateTaskParams = {
      target: createBuiltinTarget("coder"),
      task: longTask,
    };
    const context = createMockContext();

    const result = await executeDelegateTask(params, context);

    expect(result.success).toBe(true);
  });

  it("should handle empty context fields", async () => {
    const params: DelegateTaskParams = {
      target: createBuiltinTarget("coder"),
      task: "Test task",
      context: {},
    };
    const context = createMockContext();

    const result = await executeDelegateTask(params, context);

    expect(result.success).toBe(true);
  });

  it("should handle multiple concurrent delegations", async () => {
    const params: DelegateTaskParams = {
      target: createBuiltinTarget("coder"),
      task: "Concurrent task",
    };
    const context = createMockContext();

    const results = await Promise.all([
      executeDelegateTask(params, context),
      executeDelegateTask(params, context),
      executeDelegateTask(params, context),
    ]);

    expect(results.every((r) => r.success)).toBe(true);
    const ids = results.map((r) => r.taskPacketId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });
});

// Import afterEach for cleanup
import { afterEach } from "vitest";
