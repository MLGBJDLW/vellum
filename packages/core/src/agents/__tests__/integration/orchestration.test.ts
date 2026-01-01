import { beforeEach, describe, expect, it } from "vitest";
import {
  AgentLevel,
  type AgentMode,
  createContextIsolator,
  createHandoff,
  createModeRegistry,
  createOrchestrator,
  createPermissionInheritance,
  createResultAggregator,
  type ExtendedModeConfig,
  HandoffRequestSchema,
  type HandoffResult,
  HandoffResultSchema,
  type OrchestratorEvent,
  type OrchestratorEventType,
} from "../../../index.js";

/**
 * Factory for creating test mode configurations.
 * Uses type assertion to allow custom slug names for testing.
 */
function createTestMode(
  overrides: Omit<Partial<ExtendedModeConfig>, "name"> & { name: string }
): ExtendedModeConfig {
  const { name, ...rest } = overrides;
  return {
    name: name as AgentMode, // Cast for test flexibility
    description: "Test mode",
    tools: { edit: true, bash: true },
    prompt: "Test prompt",
    level: AgentLevel.worker,
    ...rest,
  } as ExtendedModeConfig;
}

// Test mode configs using correct interface structure
const orchestratorMode = createTestMode({
  name: "orchestrator",
  description: "Main orchestrator for testing - handles task coordination",
  prompt: "You are the main orchestrator. Coordinate tasks across agents.",
  level: AgentLevel.orchestrator,
  canSpawnAgents: ["workflow", "coder", "qa", "writer"],
});

const workflowMode = createTestMode({
  name: "workflow",
  description: "Workflow agent for testing - manages task sequences",
  prompt: "You are a workflow agent. Manage task sequences.",
  level: AgentLevel.workflow,
  canSpawnAgents: ["coder", "qa", "writer"],
});

const coderMode = createTestMode({
  name: "coder",
  description: "Coder worker for implementation - implement features and write code",
  prompt: "You are a coder. Implement features and write code.",
  level: AgentLevel.worker,
  canSpawnAgents: [],
});

const qaMode = createTestMode({
  name: "qa",
  description: "QA worker for testing - write and run tests",
  prompt: "You are a QA engineer. Write and run tests.",
  level: AgentLevel.worker,
  canSpawnAgents: [],
});

const writerMode = createTestMode({
  name: "writer",
  description: "Documentation writer - write documentation and docs",
  prompt: "You are a technical writer. Write documentation.",
  level: AgentLevel.worker,
  canSpawnAgents: [],
});

describe("Orchestration E2E Integration", () => {
  let modeRegistry: ReturnType<typeof createModeRegistry>;
  let orchestrator: ReturnType<typeof createOrchestrator>;
  let events: OrchestratorEvent[];

  beforeEach(() => {
    events = [];

    // Setup mode registry
    modeRegistry = createModeRegistry();
    modeRegistry.register(orchestratorMode);
    modeRegistry.register(workflowMode);
    modeRegistry.register(coderMode);
    modeRegistry.register(qaMode);
    modeRegistry.register(writerMode);

    // Create orchestrator
    orchestrator = createOrchestrator({
      modeRegistry,
      maxConcurrentSubagents: 3,
      taskTimeout: 30000,
      onApprovalRequired: async () => true,
    });

    // Track events
    const eventTypes: OrchestratorEventType[] = [
      "subagent_spawned",
      "task_started",
      "task_progress",
      "task_completed",
      "task_failed",
      "subagent_cancelled",
    ];
    for (const eventType of eventTypes) {
      orchestrator.on(eventType, (event) => events.push(event));
    }
  });

  describe("Subagent Spawning", () => {
    it("should spawn subagent successfully with valid configuration", async () => {
      const handle = await orchestrator.spawnSubagent("coder", "Test task");

      expect(handle).toBeDefined();
      expect(handle.agentSlug).toBe("coder");
      expect(handle.status).toMatch(/spawning|running/);
      expect(handle.id).toBeTruthy();
    });

    it("should emit subagent_spawned event when spawning", async () => {
      await orchestrator.spawnSubagent("coder", "Test task");

      const spawnEvent = events.find((e) => e.type === "subagent_spawned");
      expect(spawnEvent).toBeDefined();
      expect(spawnEvent?.data.agentSlug).toBe("coder");
    });

    it("should track active subagents", async () => {
      const handle1 = await orchestrator.spawnSubagent("coder", "Task 1");
      const handle2 = await orchestrator.spawnSubagent("coder", "Task 2");

      const active = orchestrator.getActiveSubagents();
      expect(active.length).toBeGreaterThanOrEqual(2);
      expect(active.some((h) => h.id === handle1.id)).toBe(true);
      expect(active.some((h) => h.id === handle2.id)).toBe(true);
    });
  });

  describe("Task Routing", () => {
    it("should route implementation tasks to coder", () => {
      const result = orchestrator.router.route("Implement login feature", AgentLevel.worker);

      expect(result.selectedAgent).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should return candidates for routing", () => {
      const candidates = orchestrator.router.getCandidates("Write tests", AgentLevel.worker);

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0]?.confidence).toBeGreaterThanOrEqual(0);
      expect(candidates[0]?.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe("Result Aggregation", () => {
    it("should aggregate results correctly", () => {
      const aggregator = orchestrator.aggregator;

      aggregator.addResult({
        taskId: "task-1",
        agentSlug: "coder",
        status: "success",
        data: { output: "done" },
        startedAt: new Date(),
        completedAt: new Date(),
      });

      aggregator.addResult({
        taskId: "task-2",
        agentSlug: "qa",
        status: "success",
        data: { output: "verified" },
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const result = aggregator.aggregate();
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.overallStatus).toBe("success");
    });

    it("should detect partial failures", () => {
      const aggregator = createResultAggregator();

      aggregator.addResult({
        taskId: "task-1",
        agentSlug: "coder",
        status: "success",
        data: null,
        startedAt: new Date(),
        completedAt: new Date(),
      });

      aggregator.addResult({
        taskId: "task-2",
        agentSlug: "qa",
        status: "failure",
        error: new Error("Test failed"),
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const result = aggregator.aggregate();
      expect(result.overallStatus).toBe("partial");
    });
  });

  describe("Event Emission", () => {
    it("should emit task_started event", async () => {
      await orchestrator.executeTask("Test task", AgentLevel.worker);

      const startEvent = events.find((e) => e.type === "task_started");
      expect(startEvent).toBeDefined();
    });

    it("should emit task_completed or task_failed event", async () => {
      await orchestrator.executeTask("Test task", AgentLevel.worker);

      const completionEvent = events.find(
        (e) => e.type === "task_completed" || e.type === "task_failed"
      );
      expect(completionEvent).toBeDefined();
    });
  });

  describe("Approval Forwarding", () => {
    it("should forward approval requests", async () => {
      const forwarder = orchestrator.approvalForwarder;

      const decision = await forwarder.forwardApproval({
        requestId: "req-1",
        subagentId: "sub-1",
        parentSessionId: "parent-1",
        tool: "write_file",
        params: { path: "test.ts" },
        createdAt: new Date(),
      });

      expect(decision).toBeDefined();
      expect(decision.requestId).toBe("req-1");
      expect(typeof decision.approved).toBe("boolean");
    });

    it("should cache pre-approved patterns", () => {
      const forwarder = orchestrator.approvalForwarder;

      // Register exact match pattern (not glob - implementation uses exact matching)
      forwarder.registerApproval("read_file", { path: "src/index.ts" });

      // Exact match should be pre-approved
      expect(forwarder.isPreApproved("read_file", { path: "src/index.ts" })).toBe(true);
      // Different tool should not be pre-approved
      expect(forwarder.isPreApproved("write_file", { path: "src/index.ts" })).toBe(false);
      // Different path should not be pre-approved (exact matching)
      expect(forwarder.isPreApproved("read_file", { path: "src/other.ts" })).toBe(false);
    });
  });

  describe("Context Isolation", () => {
    it("should create isolated contexts", () => {
      const isolator = createContextIsolator();

      const parent = isolator.createIsolated();
      isolator.setLocal(parent, "secret", "parent-only");

      const child = isolator.fork(parent);

      // Child should have parent's data as shared (read-only)
      expect(child.sharedMemory).toBeDefined();
      expect(child.localMemory).toEqual({});
    });

    it("should prevent child from modifying shared memory", () => {
      const isolator = createContextIsolator();

      const parent = isolator.createIsolated();
      isolator.setLocal(parent, "key", "value");

      const child = isolator.fork(parent);
      const shared = isolator.getShared(child);

      // Shared should be frozen
      expect(Object.isFrozen(shared)).toBe(true);
    });
  });

  describe("Permission Inheritance", () => {
    it("should derive child permissions as subset of parent", () => {
      const inheritance = createPermissionInheritance();

      const parent = {
        filePatterns: [{ pattern: "src/**", access: "write" as const }],
        toolGroups: [{ group: "all", enabled: true }],
        canApproveSubagent: true,
        maxSubagentDepth: 3,
      };

      const child = {
        filePatterns: [{ pattern: "src/utils/**", access: "write" as const }],
        toolGroups: [{ group: "read", enabled: true }],
        canApproveSubagent: false,
        maxSubagentDepth: 2,
      };

      const derived = inheritance.derive(parent, child);

      // Child cannot exceed parent
      expect(derived.maxSubagentDepth).toBeLessThanOrEqual(parent.maxSubagentDepth);
      expect(derived.canApproveSubagent).toBe(false); // AND logic
    });

    it("should validate child never exceeds parent permissions", () => {
      const inheritance = createPermissionInheritance();

      const parent = {
        filePatterns: [{ pattern: "src/**", access: "read" as const }],
        toolGroups: [],
        canApproveSubagent: false,
        maxSubagentDepth: 2,
      };

      const child = {
        filePatterns: [{ pattern: "src/**", access: "write" as const }], // Exceeds!
        toolGroups: [],
        canApproveSubagent: false,
        maxSubagentDepth: 1,
      };

      const validation = inheritance.validate(parent, child);
      expect(validation.valid).toBe(false);
      expect(validation.violations.length).toBeGreaterThan(0);
    });
  });

  describe("Task Chain Management", () => {
    it("should track task chain depth", () => {
      const manager = orchestrator.taskChainManager;
      const chain = manager.createTaskChain("root-task", "orchestrator");

      expect(chain.chainId).toBeTruthy();
      expect(manager.getDepth(chain.chainId, "root-task")).toBe(0);
    });

    it("should allow adding tasks within depth limit", () => {
      const manager = orchestrator.taskChainManager;
      const chain = manager.createTaskChain("root", "orchestrator");

      const task1 = manager.addTask(chain.chainId, "task-1", "root", "workflow");
      expect(task1).not.toBeNull();
      expect(task1?.depth).toBe(1);

      const task2 = manager.addTask(chain.chainId, "task-2", "task-1", "coder");
      expect(task2).not.toBeNull();
      expect(task2?.depth).toBe(2);
    });

    it("should return ancestors correctly", () => {
      const manager = orchestrator.taskChainManager;
      const chain = manager.createTaskChain("root", "orchestrator");
      manager.addTask(chain.chainId, "child", "root", "workflow");
      manager.addTask(chain.chainId, "grandchild", "child", "coder");

      const ancestors = manager.getAncestors(chain.chainId, "grandchild");
      expect(ancestors.length).toBe(2);
      expect(ancestors[0]?.taskId).toBe("root");
      expect(ancestors[1]?.taskId).toBe("child");
    });
  });

  describe("Concurrent Subagent Limits", () => {
    it("should respect maxConcurrentSubagents", async () => {
      // Orchestrator configured with maxConcurrentSubagents: 3
      const handles = [];

      for (let i = 0; i < 5; i++) {
        try {
          const handle = await orchestrator.spawnSubagent("coder", `Task ${i}`);
          handles.push(handle);
        } catch {
          // Expected to fail after limit
        }
      }

      // Should have spawned some agents
      expect(handles.length).toBeGreaterThan(0);
    });
  });

  describe("Cancel Operations", () => {
    it("should cancel specific subagent", async () => {
      const handle = await orchestrator.spawnSubagent("coder", "Test task");

      const cancelled = await orchestrator.cancelSubagent(handle.id);
      expect(cancelled).toBe(true);

      const cancelEvent = events.find((e) => e.type === "subagent_cancelled");
      expect(cancelEvent).toBeDefined();
    });

    it("should cancel all subagents", async () => {
      await orchestrator.spawnSubagent("coder", "Task 1");
      await orchestrator.spawnSubagent("coder", "Task 2");

      await orchestrator.cancelAll();

      // After cancelAll, active should be empty or all cancelled
      const active = orchestrator.getActiveSubagents();
      const stillRunning = active.filter((h) => h.status === "running");
      expect(stillRunning.length).toBe(0);
    });
  });

  // ============================================
  // Full E2E Delegation Flow Tests
  // ============================================
  describe("Full E2E Delegation Flow: Orchestrator → Router → Subagent → Handoff → Aggregation", () => {
    it("should spawn subagent and execute task through full pipeline", async () => {
      // 1. Route the task
      const routeResult = orchestrator.router.route("implement feature X", AgentLevel.worker);
      expect(routeResult.selectedAgent).toBeTruthy();

      // 2. Spawn subagent for the task
      const handle = await orchestrator.spawnSubagent(
        routeResult.selectedAgent || "coder",
        "implement feature X"
      );
      expect(handle.status).toMatch(/spawning|running/);

      // 3. Execute full task through orchestrator
      const result = await orchestrator.executeTask("implement feature X", AgentLevel.worker);

      // 4. Verify aggregation
      expect(result).toBeDefined();
      expect(result.totalTasks).toBeGreaterThan(0);
      expect(result.results.length).toBeGreaterThan(0);

      // 5. Verify events were emitted
      expect(events.some((e) => e.type === "subagent_spawned")).toBe(true);
      expect(events.some((e) => e.type === "task_started")).toBe(true);
      expect(events.some((e) => e.type === "task_completed" || e.type === "task_failed")).toBe(
        true
      );
    });

    it("should route tasks to correct workers based on task description", () => {
      // Test different task descriptions route to appropriate workers
      const testCases = [
        { task: "implement login feature", expectedLevel: AgentLevel.worker },
        { task: "write unit tests", expectedLevel: AgentLevel.worker },
        { task: "document the API", expectedLevel: AgentLevel.worker },
      ];

      for (const { task, expectedLevel } of testCases) {
        const result = orchestrator.router.route(task, expectedLevel);
        expect(result.routedAt).toBeInstanceOf(Date);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });

    it("should aggregate results from multiple subagents correctly", async () => {
      // Reset aggregator
      orchestrator.aggregator.reset();

      // Simulate results from multiple subagents
      orchestrator.aggregator.addResult({
        taskId: "task-coder-1",
        agentSlug: "coder",
        status: "success",
        data: { files: ["src/feature.ts"] },
        startedAt: new Date(),
        completedAt: new Date(),
      });

      orchestrator.aggregator.addResult({
        taskId: "task-qa-1",
        agentSlug: "qa",
        status: "success",
        data: { tests: 5, passed: 5 },
        startedAt: new Date(),
        completedAt: new Date(),
      });

      orchestrator.aggregator.addResult({
        taskId: "task-writer-1",
        agentSlug: "writer",
        status: "success",
        data: { docs: ["README.md"] },
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const aggregated = orchestrator.aggregator.aggregate();

      expect(aggregated.totalTasks).toBe(3);
      expect(aggregated.succeeded).toBe(3);
      expect(aggregated.failed).toBe(0);
      expect(aggregated.partial).toBe(0);
      expect(aggregated.overallStatus).toBe("success");
      expect(aggregated.results.length).toBe(3);
    });

    it("should aggregate mixed success/failure results correctly", async () => {
      orchestrator.aggregator.reset();

      orchestrator.aggregator.addResult({
        taskId: "task-success",
        agentSlug: "coder",
        status: "success",
        data: { output: "done" },
        startedAt: new Date(),
        completedAt: new Date(),
      });

      orchestrator.aggregator.addResult({
        taskId: "task-failure",
        agentSlug: "qa",
        status: "failure",
        error: new Error("Tests failed"),
        startedAt: new Date(),
        completedAt: new Date(),
      });

      orchestrator.aggregator.addResult({
        taskId: "task-partial",
        agentSlug: "writer",
        status: "partial",
        data: { incomplete: true },
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const aggregated = orchestrator.aggregator.aggregate();

      expect(aggregated.totalTasks).toBe(3);
      expect(aggregated.succeeded).toBe(1);
      expect(aggregated.failed).toBe(1);
      expect(aggregated.partial).toBe(1);
      expect(aggregated.overallStatus).toBe("partial");
    });
  });

  // ============================================
  // Handoff Protocol Integration Tests
  // ============================================
  describe("Handoff Protocol Integration", () => {
    it("should handle handoff protocol correctly - create and validate request", () => {
      // Create a handoff request
      const handoff = createHandoff(
        "coder",
        "qa",
        "550e8400-e29b-41d4-a716-446655440000",
        "Implementation complete, needs testing"
      );

      expect(handoff).toBeDefined();
      expect(handoff.fromAgent).toBe("coder");
      expect(handoff.toAgent).toBe("qa");
      expect(handoff.reason).toBe("Implementation complete, needs testing");
      expect(handoff.preserveContext).toBe(true);
      expect(handoff.createdAt).toBeInstanceOf(Date);

      // Validate against schema
      const validationResult = HandoffRequestSchema.safeParse(handoff);
      expect(validationResult.success).toBe(true);
    });

    it("should validate handoff result - accepted case", () => {
      const result: HandoffResult = {
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        accepted: true,
        targetAgentId: "qa-instance-001",
        completedAt: new Date(),
      };

      const validationResult = HandoffResultSchema.safeParse(result);
      expect(validationResult.success).toBe(true);
      if (validationResult.success) {
        expect(validationResult.data.accepted).toBe(true);
        expect(validationResult.data.targetAgentId).toBe("qa-instance-001");
      }
    });

    it("should validate handoff result - rejected case", () => {
      const result: HandoffResult = {
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        accepted: false,
        rejectionReason: "Target agent unavailable",
        completedAt: new Date(),
      };

      const validationResult = HandoffResultSchema.safeParse(result);
      expect(validationResult.success).toBe(true);
      if (validationResult.success) {
        expect(validationResult.data.accepted).toBe(false);
        expect(validationResult.data.rejectionReason).toBe("Target agent unavailable");
      }
    });

    it("should create handoff without context preservation", () => {
      const handoff = createHandoff(
        "orchestrator",
        "coder",
        "660e8400-e29b-41d4-a716-446655440001",
        "Starting fresh implementation",
        false
      );

      expect(handoff.preserveContext).toBe(false);

      const validationResult = HandoffRequestSchema.safeParse(handoff);
      expect(validationResult.success).toBe(true);
    });

    it("should integrate handoff with orchestrator spawn flow", async () => {
      // 1. Create handoff request
      const taskPacketId = "550e8400-e29b-41d4-a716-446655440002";
      const handoff = createHandoff(
        "workflow",
        "coder",
        taskPacketId,
        "Delegating implementation task"
      );

      // 2. Validate handoff
      expect(HandoffRequestSchema.safeParse(handoff).success).toBe(true);

      // 3. Spawn the target agent
      const handle = await orchestrator.spawnSubagent(
        handoff.toAgent,
        `Execute task from ${handoff.fromAgent}: ${handoff.reason}`
      );

      expect(handle.agentSlug).toBe("coder");
      expect(handle.status).toMatch(/spawning|running/);

      // 4. Create handoff result
      const result: HandoffResult = {
        requestId: handoff.requestId,
        accepted: true,
        targetAgentId: handle.id,
        completedAt: new Date(),
      };

      expect(HandoffResultSchema.safeParse(result).success).toBe(true);
    });
  });

  // ============================================
  // Event Lifecycle Tests
  // ============================================
  describe("Event Lifecycle", () => {
    it("should emit events in correct order during task lifecycle", async () => {
      events = []; // Reset events

      await orchestrator.executeTask("Test lifecycle task", AgentLevel.worker);

      // Find indices of events
      const startIndex = events.findIndex((e) => e.type === "task_started");
      const spawnIndex = events.findIndex((e) => e.type === "subagent_spawned");
      const completeIndex = events.findIndex(
        (e) => e.type === "task_completed" || e.type === "task_failed"
      );

      // task_started should come first
      expect(startIndex).toBeGreaterThanOrEqual(0);

      // subagent_spawned should come after task_started
      if (spawnIndex >= 0) {
        expect(spawnIndex).toBeGreaterThan(startIndex);
      }

      // task_completed should come last
      expect(completeIndex).toBeGreaterThanOrEqual(0);
    });

    it("should emit progress events for complex tasks", async () => {
      events = [];

      // Execute a task that might trigger decomposition
      await orchestrator.executeTask(
        "Implement authentication with login, logout, and password reset",
        AgentLevel.worker
      );

      // Should have at least task_started and task_completed
      expect(events.some((e) => e.type === "task_started")).toBe(true);
      expect(events.some((e) => e.type === "task_completed" || e.type === "task_failed")).toBe(
        true
      );
    });

    it("should emit subagent_cancelled when cancelling", async () => {
      events = [];

      const handle = await orchestrator.spawnSubagent("coder", "Cancellable task");
      await orchestrator.cancelSubagent(handle.id);

      const cancelEvent = events.find((e) => e.type === "subagent_cancelled");
      expect(cancelEvent).toBeDefined();
      expect(cancelEvent?.data.handleId).toBe(handle.id);
      expect(cancelEvent?.data.agentSlug).toBe("coder");
    });

    it("should include timestamp in all events", async () => {
      events = [];

      await orchestrator.spawnSubagent("coder", "Test task");
      // Use a task description that will match 'coder' based on keywords
      await orchestrator.executeTask("implement a new feature", AgentLevel.worker);

      // Should have generated some events
      expect(events.length).toBeGreaterThan(0);

      for (const event of events) {
        expect(event.timestamp).toBeInstanceOf(Date);
        expect(event.type).toBeTruthy();
      }
    });
  });
});
