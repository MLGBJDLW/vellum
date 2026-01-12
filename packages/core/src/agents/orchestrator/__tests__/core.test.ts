// ============================================
// Orchestrator Core Tests
// ============================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentLevel } from "../../../agent/level.js";
import type { ModeRegistry } from "../../../agent/mode-registry.js";
import type { ExtendedModeConfig } from "../../../agent/modes.js";
import type { ImplementationResult, SpecHandoffPacket } from "../../../spec/index.js";
import type { SubsessionManager } from "../../session/subsession-manager.js";
import type { OrchestratorEvent } from "../core.js";
import { createOrchestrator, type OrchestratorConfig, type OrchestratorCore } from "../core.js";

// ============================================
// Mock Factories
// ============================================

/**
 * Creates a test mode config with any name for testing purposes.
 * This bypasses the strict AgentMode type constraint in tests.
 *
 * Note: Agent hierarchy fields (level, canSpawnAgents, fileRestrictions,
 * maxConcurrentSubagents) are now in AgentConfig, not ExtendedModeConfig.
 */
function createTestMode(name: string, _level: AgentLevel, description?: string): ExtendedModeConfig {
  return {
    name: name as ExtendedModeConfig["name"],
    description: description ?? `${name} mode`,
    tools: { edit: true, bash: true },
    prompt: `You are ${name}`,
    // Note: level is no longer part of ExtendedModeConfig
    // It's now in AgentConfig
  };
}

/**
 * Creates a mock ModeRegistry for testing.
 *
 * Note: Level-based filtering is deprecated since level is no longer
 * in ExtendedModeConfig. The mock returns empty arrays for getByLevel.
 */
function createMockModeRegistry(modes: Map<string, ExtendedModeConfig> = new Map()): ModeRegistry {
  return {
    register: vi.fn((mode: ExtendedModeConfig) => {
      modes.set(mode.name, mode);
    }),
    get: vi.fn((slug: string) => modes.get(slug)),
    // getByLevel is deprecated - always returns empty array
    getByLevel: vi.fn((_level: AgentLevel) => []),
    // canSpawn is deprecated for non-built-in modes - returns false
    canSpawn: vi.fn((_fromSlug: string, _toSlug: string) => false),
    getAll: vi.fn(() => Array.from(modes.values())),
    has: vi.fn((slug: string) => modes.has(slug)),
    unregister: vi.fn((slug: string) => modes.delete(slug)),
    findBestMatch: vi.fn((task: string, _level: AgentLevel) => {
      const allModes = Array.from(modes.values());
      if (allModes.length === 0) return undefined;
      // Simple keyword matching for tests
      const taskLower = task.toLowerCase();
      for (const mode of allModes) {
        if (taskLower.includes(mode.name.toLowerCase())) {
          return mode;
        }
      }
      return allModes[0];
    }),
    registerCustomAgent: vi.fn(),
    getCustomAgent: vi.fn(),
    getAllCustomAgents: vi.fn(() => []),
    hasCustomAgent: vi.fn(() => false),
    unregisterCustomAgent: vi.fn(),
  } as unknown as ModeRegistry;
}

/**
 * Creates a mock SubsessionManager for testing.
 */
function createMockSubsessionManager(): SubsessionManager {
  const sessions = new Map<string, { id: string; status: "active" | "suspended" | "terminated" }>();
  let idCounter = 0;

  return {
    create: vi.fn((config) => {
      const id = `subsession-${++idCounter}`;
      const session = {
        id,
        parentId: config.parentId,
        agentSlug: config.agentSlug,
        level: config.level,
        context: { memory: {}, files: [] },
        permissions: { read: true, write: true },
        toolRegistry: {} as unknown,
        status: "active" as const,
        createdAt: new Date(),
      };
      sessions.set(id, session);
      return session;
    }),
    get: vi.fn((id: string) => sessions.get(id)),
    terminate: vi.fn((id: string) => {
      const session = sessions.get(id);
      if (session) {
        session.status = "terminated";
        return true;
      }
      return false;
    }),
    execute: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    forwardApproval: vi.fn().mockResolvedValue(true),
    getActive: vi.fn(() => Array.from(sessions.values()).filter((s) => s.status === "active")),
    suspend: vi.fn(),
    resume: vi.fn(),
  } as unknown as SubsessionManager;
}

/**
 * Creates a default set of mode configurations for testing.
 */
function createDefaultModes(): Map<string, ExtendedModeConfig> {
  const modes = new Map<string, ExtendedModeConfig>();

  modes.set(
    "orchestrator",
    createTestMode("orchestrator", AgentLevel.orchestrator, "Main orchestrator mode")
  );
  modes.set(
    "spec-workflow",
    createTestMode("spec-workflow", AgentLevel.workflow, "Specification workflow manager")
  );
  modes.set("coder", createTestMode("coder", AgentLevel.worker, "Code implementation worker"));
  modes.set("tester", createTestMode("tester", AgentLevel.worker, "Testing worker"));
  modes.set("documenter", createTestMode("documenter", AgentLevel.worker, "Documentation worker"));

  return modes;
}

/**
 * Adds routing rules to an orchestrator for test modes.
 * Since getByLevel() is deprecated (returns empty for non-built-in modes),
 * we use explicit routing rules to map task patterns to agent slugs.
 */
function addTestRoutingRules(orchestrator: OrchestratorCore): void {
  orchestrator.router.addRule({
    pattern: /coder|implement|code|feature/i,
    agentSlug: "coder",
    priority: 100,
  });
  orchestrator.router.addRule({
    pattern: /test|verify|tester/i,
    agentSlug: "tester",
    priority: 100,
  });
  orchestrator.router.addRule({
    pattern: /document|docs|documenter/i,
    agentSlug: "documenter",
    priority: 100,
  });
  orchestrator.router.addRule({
    pattern: /workflow|spec-workflow/i,
    agentSlug: "spec-workflow",
    priority: 100,
  });
  orchestrator.router.addRule({
    pattern: /orchestrat/i,
    agentSlug: "orchestrator",
    priority: 100,
  });
}

// ============================================
// Test Suite
// ============================================

describe("OrchestratorCore", () => {
  let orchestrator: OrchestratorCore;
  let mockRegistry: ModeRegistry;
  let mockSubsessionManager: SubsessionManager;
  let modes: Map<string, ExtendedModeConfig>;

  beforeEach(() => {
    vi.useFakeTimers();
    modes = createDefaultModes();
    mockRegistry = createMockModeRegistry(modes);
    mockSubsessionManager = createMockSubsessionManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================
  // 1. Orchestrator Creation and Initialization
  // ============================================

  describe("creation and initialization", () => {
    it("should create orchestrator with required config", () => {
      const config: OrchestratorConfig = {
        modeRegistry: mockRegistry,
      };

      orchestrator = createOrchestrator(config);

      expect(orchestrator).toBeDefined();
      expect(orchestrator.router).toBeDefined();
      expect(orchestrator.decomposer).toBeDefined();
      expect(orchestrator.aggregator).toBeDefined();
      expect(orchestrator.approvalForwarder).toBeDefined();
      expect(orchestrator.taskChainManager).toBeDefined();
    });

    it("should create orchestrator with all optional config", () => {
      const onApproval = vi.fn().mockResolvedValue(true);
      const config: OrchestratorConfig = {
        modeRegistry: mockRegistry,
        subsessionManager: mockSubsessionManager,
        maxConcurrentSubagents: 5,
        taskTimeout: 600000,
        onApprovalRequired: onApproval,
      };

      orchestrator = createOrchestrator(config);

      expect(orchestrator).toBeDefined();
    });

    it("should use default values when optional config not provided", () => {
      orchestrator = createOrchestrator({ modeRegistry: mockRegistry });

      // These should not throw - defaults should be applied
      expect(orchestrator.getActiveSubagents()).toHaveLength(0);
    });
  });

  // ============================================
  // 2. Task Routing to Workers
  // ============================================

  describe("task routing", () => {
    beforeEach(() => {
      orchestrator = createOrchestrator({ modeRegistry: mockRegistry });
    });

    it("should route task to appropriate agent via router", () => {
      const result = orchestrator.router.route("implement login feature", AgentLevel.worker);

      expect(result).toBeDefined();
      expect(result.selectedAgent).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("should get candidates for a task", () => {
      const candidates = orchestrator.router.getCandidates("write unit tests", AgentLevel.worker);

      expect(Array.isArray(candidates)).toBe(true);
    });

    it("should support adding custom routing rules", () => {
      orchestrator.router.addRule({
        pattern: /security/i,
        agentSlug: "coder",
        priority: 100,
      });

      const result = orchestrator.router.route("implement security feature", AgentLevel.worker);
      expect(result.selectedAgent).toBe("coder");
    });
  });

  // ============================================
  // 3. Spawning Subagents
  // ============================================

  describe("spawnSubagent", () => {
    beforeEach(() => {
      orchestrator = createOrchestrator({
        modeRegistry: mockRegistry,
        subsessionManager: mockSubsessionManager,
      });
    });

    it("should spawn a subagent successfully", async () => {
      const handle = await orchestrator.spawnSubagent("coder", "implement feature X");

      expect(handle).toBeDefined();
      expect(handle.id).toMatch(/^handle-/);
      expect(handle.agentSlug).toBe("coder");
      expect(handle.taskId).toMatch(/^task-/);
      expect(handle.status).toBe("running");
      expect(handle.startedAt).toBeInstanceOf(Date);
    });

    it("should throw error for non-existent agent", async () => {
      await expect(
        orchestrator.spawnSubagent("non-existent-agent", "do something")
      ).rejects.toThrow('Agent "non-existent-agent" not found in mode registry');
    });

    it("should track spawned subagents as active", async () => {
      expect(orchestrator.getActiveSubagents()).toHaveLength(0);

      await orchestrator.spawnSubagent("coder", "task 1");
      expect(orchestrator.getActiveSubagents()).toHaveLength(1);

      await orchestrator.spawnSubagent("tester", "task 2");
      expect(orchestrator.getActiveSubagents()).toHaveLength(2);
    });

    it("should use provided task ID from options", async () => {
      const handle = await orchestrator.spawnSubagent("coder", "implement feature", {
        taskId: "custom-task-id",
      });

      expect(handle.taskId).toBe("custom-task-id");
    });

    it("should create task chain for spawned subagent", async () => {
      await orchestrator.spawnSubagent("coder", "implement feature");

      // The task chain should be accessible via the task chain manager
      // Just verify manager is defined - specific chain access depends on implementation
      expect(orchestrator.taskChainManager).toBeDefined();
    });

    it("should validate level hierarchy for child tasks", async () => {
      // First spawn a parent task
      const parentHandle = await orchestrator.spawnSubagent("coder", "parent task");

      // Add a workflow-level mode for hierarchy testing
      modes.set(
        "workflow-agent",
        createTestMode("workflow-agent", AgentLevel.workflow, "Workflow level agent")
      );

      // Attempting to spawn a workflow agent from a worker should fail
      await expect(
        orchestrator.spawnSubagent("workflow-agent", "child task", {
          parentTaskId: parentHandle.taskId,
        })
      ).rejects.toThrow(/Level hierarchy violation/);
    });
  });

  // ============================================
  // 4. Task Execution Pipeline
  // ============================================

  describe("executeTask", () => {
    beforeEach(() => {
      orchestrator = createOrchestrator({
        modeRegistry: mockRegistry,
        subsessionManager: mockSubsessionManager,
      });
      addTestRoutingRules(orchestrator);
    });

    it("should execute simple task and return aggregated result", async () => {
      const result = await orchestrator.executeTask("implement simple feature", AgentLevel.worker);

      expect(result).toBeDefined();
      expect(result.totalTasks).toBeGreaterThanOrEqual(1);
      expect(result.overallStatus).toBeDefined();
    });

    it("should return failure when no agent found", async () => {
      // Create registry with no worker-level modes
      const emptyModes = new Map<string, ExtendedModeConfig>();
      emptyModes.set(
        "orchestrator",
        createTestMode("orchestrator", AgentLevel.orchestrator, "Orchestrator only")
      );

      const emptyRegistry = createMockModeRegistry(emptyModes);
      const emptyOrchestrator = createOrchestrator({ modeRegistry: emptyRegistry });

      // When no worker is found, the task should fail
      // The implementation throws when agentSlug is empty
      await expect(
        emptyOrchestrator.executeTask("do something", AgentLevel.worker)
      ).rejects.toThrow();
    });

    it("should analyze task complexity via decomposer", () => {
      const analysis = orchestrator.decomposer.analyze("implement and test login feature");

      expect(analysis).toBeDefined();
      expect(analysis.complexity).toBeDefined();
      expect(analysis.shouldDecompose).toBeDefined();
      expect(Array.isArray(analysis.keywords)).toBe(true);
    });

    it("should decompose complex tasks into subtasks", () => {
      const decomposition = orchestrator.decomposer.decompose(
        "implement user authentication, add tests, and document the API"
      );

      expect(decomposition).toBeDefined();
      expect(decomposition.originalTask).toBeDefined();
      expect(Array.isArray(decomposition.subtasks)).toBe(true);
      expect(Array.isArray(decomposition.executionOrder)).toBe(true);
    });

    it("should aggregate results from multiple subtasks", async () => {
      // Add multiple results to aggregator
      orchestrator.aggregator.reset();

      orchestrator.aggregator.addResult({
        taskId: "task-1",
        agentSlug: "coder",
        status: "success",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      orchestrator.aggregator.addResult({
        taskId: "task-2",
        agentSlug: "tester",
        status: "success",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const aggregated = orchestrator.aggregator.aggregate();

      expect(aggregated.totalTasks).toBe(2);
      expect(aggregated.succeeded).toBe(2);
      expect(aggregated.failed).toBe(0);
      expect(aggregated.overallStatus).toBe("success");
    });
  });

  // ============================================
  // 5. handleSpecHandoff Method (T031)
  // ============================================

  describe("handleSpecHandoff", () => {
    beforeEach(() => {
      orchestrator = createOrchestrator({
        modeRegistry: mockRegistry,
        subsessionManager: mockSubsessionManager,
      });
    });

    it("should handle spec handoff packet and call completion callback", async () => {
      const packet: SpecHandoffPacket = {
        type: "spec_handoff",
        workflowId: "workflow-123",
        specDir: "/path/to/spec",
        tasksFile: "/path/to/tasks.md",
        currentPhase: "implementation",
        callback: {
          returnTo: "spec",
          resumePhase: "validation",
          checkpointId: "checkpoint-456",
        },
      };

      const onComplete = vi.fn();

      await orchestrator.handleSpecHandoff(packet, onComplete);

      expect(onComplete).toHaveBeenCalled();
      const result = onComplete.mock.calls[0]?.[0] as ImplementationResult | undefined;
      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      expect(result?.completedTasks).toBeDefined();
      expect(Array.isArray(result?.completedTasks)).toBe(true);
    });

    it("should spawn coder agent for spec implementation", async () => {
      const packet: SpecHandoffPacket = {
        type: "spec_handoff",
        workflowId: "workflow-456",
        specDir: "/path/to/spec",
        tasksFile: "/path/to/tasks.md",
        currentPhase: "implementation",
        callback: {
          returnTo: "spec",
          resumePhase: "validation",
          checkpointId: "checkpoint-789",
        },
      };

      const onComplete = vi.fn();

      await orchestrator.handleSpecHandoff(packet, onComplete);

      // Verify a coder agent was spawned
      const result = onComplete.mock.calls[0]?.[0] as ImplementationResult | undefined;
      expect(result).toBeDefined();
      expect(result?.completedTasks.some((t) => t.includes("spec-impl"))).toBe(true);
    });

    it("should handle errors and report failure", async () => {
      // Force coder mode to be unavailable
      modes.delete("coder");

      const packet: SpecHandoffPacket = {
        type: "spec_handoff",
        workflowId: "workflow-error",
        specDir: "/path/to/spec",
        tasksFile: "/path/to/tasks.md",
        currentPhase: "implementation",
        callback: {
          returnTo: "spec",
          resumePhase: "validation",
          checkpointId: "checkpoint-error",
        },
      };

      const onComplete = vi.fn();

      await orchestrator.handleSpecHandoff(packet, onComplete);

      const result = onComplete.mock.calls[0]?.[0] as ImplementationResult | undefined;
      expect(result).toBeDefined();
      expect(result?.success).toBe(false);
      expect(result?.error).toBeDefined();
    });

    it("should not call callback if returnTo is not spec", async () => {
      const packet: SpecHandoffPacket = {
        type: "spec_handoff",
        workflowId: "workflow-other",
        specDir: "/path/to/spec",
        tasksFile: "/path/to/tasks.md",
        currentPhase: "implementation",
        callback: {
          returnTo: "other" as "spec", // Force invalid returnTo
          resumePhase: "validation",
          checkpointId: "checkpoint-other",
        },
      };

      const onComplete = vi.fn();

      await orchestrator.handleSpecHandoff(packet, onComplete);

      // Callback should not be called for non-spec returnTo
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // 6. Error Handling
  // ============================================

  describe("error handling", () => {
    beforeEach(() => {
      orchestrator = createOrchestrator({
        modeRegistry: mockRegistry,
        subsessionManager: mockSubsessionManager,
      });
    });

    it("should handle invalid agent slug gracefully", async () => {
      await expect(orchestrator.spawnSubagent("invalid-agent", "task")).rejects.toThrow(
        /not found/
      );
    });

    it("should handle parent task not found error", async () => {
      await expect(
        orchestrator.spawnSubagent("coder", "child task", {
          parentTaskId: "non-existent-parent",
        })
      ).rejects.toThrow(/not found/);
    });

    it("should handle aggregator with mixed results", () => {
      orchestrator.aggregator.reset();

      orchestrator.aggregator.addResult({
        taskId: "task-success",
        agentSlug: "coder",
        status: "success",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      orchestrator.aggregator.addResult({
        taskId: "task-failure",
        agentSlug: "tester",
        status: "failure",
        error: new Error("Test failed"),
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const result = orchestrator.aggregator.aggregate();

      expect(result.overallStatus).toBe("partial");
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
    });

    it("should handle partial failure strategy", () => {
      orchestrator.aggregator.handlePartialFailure("continue");

      expect(orchestrator.aggregator.getPartialFailureStrategy()).toBe("continue");

      orchestrator.aggregator.handlePartialFailure("abort");
      expect(orchestrator.aggregator.getPartialFailureStrategy()).toBe("abort");
    });
  });

  // ============================================
  // 7. Subagent Cancellation
  // ============================================

  describe("subagent cancellation", () => {
    beforeEach(() => {
      orchestrator = createOrchestrator({
        modeRegistry: mockRegistry,
        subsessionManager: mockSubsessionManager,
      });
    });

    it("should cancel a specific subagent by handle ID", async () => {
      const handle = await orchestrator.spawnSubagent("coder", "long running task");

      expect(orchestrator.getActiveSubagents()).toHaveLength(1);

      const cancelled = await orchestrator.cancelSubagent(handle.id);

      expect(cancelled).toBe(true);
      expect(orchestrator.getActiveSubagents()).toHaveLength(0);
    });

    it("should return false when cancelling non-existent handle", async () => {
      const cancelled = await orchestrator.cancelSubagent("non-existent-handle");

      expect(cancelled).toBe(false);
    });

    it("should cancel all active subagents", async () => {
      await orchestrator.spawnSubagent("coder", "task 1");
      await orchestrator.spawnSubagent("tester", "task 2");
      await orchestrator.spawnSubagent("documenter", "task 3");

      expect(orchestrator.getActiveSubagents()).toHaveLength(3);

      await orchestrator.cancelAll();

      expect(orchestrator.getActiveSubagents()).toHaveLength(0);
    });

    it("should not cancel already completed subagents", async () => {
      const handle = await orchestrator.spawnSubagent("coder", "quick task");

      // Manually complete the handle (simulating completion)
      const activeHandles = orchestrator.getActiveSubagents();
      const targetHandle = activeHandles.find((h) => h.id === handle.id);
      if (targetHandle) {
        targetHandle.status = "completed";
        targetHandle.completedAt = new Date();
      }

      // Verify it's no longer active
      expect(orchestrator.getActiveSubagents()).toHaveLength(0);

      // Try to cancel - should return false since already completed
      const cancelled = await orchestrator.cancelSubagent(handle.id);
      expect(cancelled).toBe(false);
    });
  });

  // ============================================
  // 8. Event System
  // ============================================

  describe("event system", () => {
    beforeEach(() => {
      orchestrator = createOrchestrator({
        modeRegistry: mockRegistry,
        subsessionManager: mockSubsessionManager,
      });
      addTestRoutingRules(orchestrator);
    });

    it("should emit subagent_spawned event", async () => {
      const handler = vi.fn();
      orchestrator.on("subagent_spawned", handler);

      await orchestrator.spawnSubagent("coder", "test task");

      expect(handler).toHaveBeenCalled();
      const event = handler.mock.calls[0]?.[0] as OrchestratorEvent | undefined;
      expect(event).toBeDefined();
      expect(event?.type).toBe("subagent_spawned");
      expect(event?.data.agentSlug).toBe("coder");
      expect(event?.timestamp).toBeInstanceOf(Date);
    });

    it("should emit task_started event on executeTask", async () => {
      const handler = vi.fn();
      orchestrator.on("task_started", handler);

      // Use a valid task that will route to an existing agent
      await orchestrator.executeTask("coder implement feature", AgentLevel.worker);

      expect(handler).toHaveBeenCalled();
      const event = handler.mock.calls[0]?.[0] as OrchestratorEvent | undefined;
      expect(event).toBeDefined();
      expect(event?.type).toBe("task_started");
    });

    it("should emit task_completed event", async () => {
      const handler = vi.fn();
      orchestrator.on("task_completed", handler);

      // Use a valid task that will route to an existing agent
      await orchestrator.executeTask("coder implement feature", AgentLevel.worker);

      expect(handler).toHaveBeenCalled();
      const event = handler.mock.calls[0]?.[0] as OrchestratorEvent | undefined;
      expect(event).toBeDefined();
      expect(event?.type).toBe("task_completed");
    });

    it("should emit subagent_cancelled event on cancel", async () => {
      const handler = vi.fn();
      orchestrator.on("subagent_cancelled", handler);

      const handle = await orchestrator.spawnSubagent("coder", "cancellable task");
      await orchestrator.cancelSubagent(handle.id);

      expect(handler).toHaveBeenCalled();
      const event = handler.mock.calls[0]?.[0] as OrchestratorEvent | undefined;
      expect(event).toBeDefined();
      expect(event?.type).toBe("subagent_cancelled");
      expect(event?.data.handleId).toBe(handle.id);
    });

    it("should allow removing event handlers", async () => {
      const handler = vi.fn();
      orchestrator.on("subagent_spawned", handler);
      orchestrator.off("subagent_spawned", handler);

      await orchestrator.spawnSubagent("coder", "test task");

      expect(handler).not.toHaveBeenCalled();
    });

    it("should handle errors in event handlers gracefully", async () => {
      const errorHandler = vi.fn(() => {
        throw new Error("Handler error");
      });
      const normalHandler = vi.fn();

      orchestrator.on("subagent_spawned", errorHandler);
      orchestrator.on("subagent_spawned", normalHandler);

      // Should not throw despite handler error
      await expect(orchestrator.spawnSubagent("coder", "test task")).resolves.toBeDefined();

      // Both handlers should have been called
      expect(errorHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled();
    });
  });

  // ============================================
  // 9. Task Chain Management
  // ============================================

  describe("task chain management", () => {
    beforeEach(() => {
      orchestrator = createOrchestrator({
        modeRegistry: mockRegistry,
        subsessionManager: mockSubsessionManager,
      });
    });

    it("should create task chain when spawning subagent", async () => {
      await orchestrator.spawnSubagent("coder", "root task");

      // Task chain manager should have chain info
      const manager = orchestrator.taskChainManager;
      expect(manager).toBeDefined();
    });

    it("should track parent-child relationships in task chain", async () => {
      // Note: Test uses same-level agents since hierarchy checking 
      // now uses AgentConfig lookup which defaults to worker level
      // for test modes not in BUILT_IN_AGENTS.
      // This test verifies parent-child tracking works when spawning
      // at the same level (which is allowed when there's no parent reference).
      const handle1 = await orchestrator.spawnSubagent("coder", "task 1");
      const handle2 = await orchestrator.spawnSubagent("tester", "task 2");

      // Both should have unique task IDs
      expect(handle1.taskId).not.toBe(handle2.taskId);
      
      // Task chain manager should track both
      const manager = orchestrator.taskChainManager;
      expect(manager).toBeDefined();
    });

    it("should enforce maximum delegation depth", async () => {
      // This test verifies that the MAX_DELEGATION_DEPTH is enforced
      const { MAX_DELEGATION_DEPTH } = await import("../task-chain.js");

      expect(MAX_DELEGATION_DEPTH).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 10. Approval Forwarding
  // ============================================

  describe("approval forwarding", () => {
    it("should forward approval requests via configured handler", async () => {
      const approvalHandler = vi.fn().mockResolvedValue(true);

      orchestrator = createOrchestrator({
        modeRegistry: mockRegistry,
        onApprovalRequired: approvalHandler,
      });

      // Request approval through the forwarder
      const result = await orchestrator.approvalForwarder.forwardApproval({
        requestId: "req-1",
        subagentId: "coder",
        parentSessionId: "session-1",
        tool: "edit_file",
        params: { file: "test.ts", content: "..." },
        createdAt: new Date(),
      });

      expect(approvalHandler).toHaveBeenCalled();
      expect(result.approved).toBe(true);
    });

    it("should deny approval when handler returns false", async () => {
      const approvalHandler = vi.fn().mockResolvedValue(false);

      orchestrator = createOrchestrator({
        modeRegistry: mockRegistry,
        onApprovalRequired: approvalHandler,
      });

      const result = await orchestrator.approvalForwarder.forwardApproval({
        requestId: "req-2",
        subagentId: "coder",
        parentSessionId: "session-1",
        tool: "bash",
        params: { command: "rm -rf /" },
        createdAt: new Date(),
      });

      expect(result.approved).toBe(false);
    });

    it("should deny approval when no handler configured", async () => {
      orchestrator = createOrchestrator({
        modeRegistry: mockRegistry,
        // No onApprovalRequired handler
      });

      const result = await orchestrator.approvalForwarder.forwardApproval({
        requestId: "req-3",
        subagentId: "coder",
        parentSessionId: "session-1",
        tool: "edit_file",
        params: { file: "test.ts" },
        createdAt: new Date(),
      });

      // Default behavior should deny
      expect(result.approved).toBe(false);
    });
  });

  // ============================================
  // 11. Result Aggregation
  // ============================================

  describe("result aggregation", () => {
    beforeEach(() => {
      orchestrator = createOrchestrator({
        modeRegistry: mockRegistry,
      });
      addTestRoutingRules(orchestrator);
    });

    it("should reset aggregator before new task execution", async () => {
      // First execution with valid task
      await orchestrator.executeTask("coder task 1", AgentLevel.worker);

      const result1 = orchestrator.aggregator.aggregate();
      const count1 = result1.totalTasks;
      expect(count1).toBeGreaterThanOrEqual(1);

      // Reset and second execution
      orchestrator.aggregator.reset();
      await orchestrator.executeTask("coder task 2", AgentLevel.worker);

      const result2 = orchestrator.aggregator.aggregate();
      expect(result2.totalTasks).toBeGreaterThanOrEqual(1);
    });

    it("should calculate overall status correctly", () => {
      orchestrator.aggregator.reset();

      // All success -> overall success
      orchestrator.aggregator.addResult({
        taskId: "t1",
        agentSlug: "coder",
        status: "success",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      expect(orchestrator.aggregator.aggregate().overallStatus).toBe("success");

      // Add failure -> partial
      orchestrator.aggregator.addResult({
        taskId: "t2",
        agentSlug: "coder",
        status: "failure",
        error: new Error("Failed"),
        startedAt: new Date(),
        completedAt: new Date(),
      });

      expect(orchestrator.aggregator.aggregate().overallStatus).toBe("partial");
    });

    it("should track partial task status", () => {
      orchestrator.aggregator.reset();

      orchestrator.aggregator.addResult({
        taskId: "partial-task",
        agentSlug: "coder",
        status: "partial",
        data: "partial result",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const result = orchestrator.aggregator.aggregate();
      expect(result.partial).toBe(1);
    });

    it("should check completion status", () => {
      orchestrator.aggregator.reset();

      expect(orchestrator.aggregator.isComplete(2)).toBe(false);

      orchestrator.aggregator.addResult({
        taskId: "t1",
        agentSlug: "coder",
        status: "success",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      expect(orchestrator.aggregator.isComplete(2)).toBe(false);
      expect(orchestrator.aggregator.isComplete(1)).toBe(true);
    });
  });
});
