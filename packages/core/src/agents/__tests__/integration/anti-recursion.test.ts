// ============================================
// Anti-Recursion E2E Integration Tests - T051
// ============================================
// REQ-035: Agent hierarchy enforcement
// REQ-037: Anti-recursion - Block delegation for workers

import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { AgentLevel, canSpawn } from "../../../agent/level.js";
import { createToolRegistry, type ToolRegistry } from "../../../tool/registry.js";
import type { Tool, ToolKind } from "../../../types/tool.js";
import {
  createTaskChainManager,
  MAX_DELEGATION_DEPTH,
  type TaskChainManager,
} from "../../orchestrator/task-chain.js";
import {
  createFilteredToolRegistry,
  type FilteredToolRegistry,
  WORKER_BLOCKED_TOOLS,
} from "../../session/filtered-tool-registry.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock tool for testing.
 */
function createMockTool(name: string, kind: ToolKind = "agent"): Tool<z.ZodType, unknown> {
  return {
    definition: {
      name,
      description: `Mock ${name} tool for testing`,
      parameters: z.object({}),
      kind,
      enabled: true,
    },
    execute: async () => ({ success: true, output: `${name} executed` }),
  };
}

/**
 * Create a base tool registry with common tools including delegation tools.
 */
function createBaseRegistry(): ToolRegistry {
  const registry = createToolRegistry();

  // Register delegation tools (agent kind)
  registry.register(createMockTool("delegate_task", "agent"));
  registry.register(createMockTool("new_task", "agent"));

  // Register regular tools (various kinds)
  registry.register(createMockTool("read_file", "read"));
  registry.register(createMockTool("write_file", "write"));
  registry.register(createMockTool("execute", "shell"));
  registry.register(createMockTool("list_dir", "read"));
  registry.register(createMockTool("grep_search", "read"));

  return registry;
}

// =============================================================================
// T051-1: Level 2 Worker Delegation Failures
// =============================================================================

describe("Anti-Recursion: Level 2 Worker Delegation Blocking", () => {
  let baseRegistry: ToolRegistry;
  let workerRegistry: FilteredToolRegistry;

  beforeEach(() => {
    baseRegistry = createBaseRegistry();
    workerRegistry = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);
  });

  // ---------------------------------------------------------------------------
  // Test Case 1: Level 2 worker attempting delegation fails immediately
  // ---------------------------------------------------------------------------
  describe("Level 2 worker delegation attempts", () => {
    it("should block delegate_task tool for Level 2 workers", () => {
      // Worker should NOT be able to access delegate_task
      expect(workerRegistry.isAllowed("delegate_task")).toBe(false);
      expect(workerRegistry.get("delegate_task")).toBeUndefined();
    });

    it("should block new_task tool for Level 2 workers", () => {
      expect(workerRegistry.isAllowed("new_task")).toBe(false);
      expect(workerRegistry.get("new_task")).toBeUndefined();
    });

    it("should report all blocked tools correctly", () => {
      const blocked = workerRegistry.getBlocked();

      expect(blocked).toContain("delegate_task");
      expect(blocked).toContain("new_task");
    });

    it("should match WORKER_BLOCKED_TOOLS constant", () => {
      for (const blockedTool of WORKER_BLOCKED_TOOLS) {
        expect(workerRegistry.isAllowed(blockedTool)).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Test Case 2: Level 2 worker's delegate_task returns error (via registry)
  // ---------------------------------------------------------------------------
  describe("Level 2 worker tool access returns undefined", () => {
    it("should return undefined when worker tries to get delegate_task", () => {
      const tool = workerRegistry.get("delegate_task");
      expect(tool).toBeUndefined();
    });

    it("should return undefined for all blocked tools", () => {
      for (const blockedTool of WORKER_BLOCKED_TOOLS) {
        expect(workerRegistry.get(blockedTool)).toBeUndefined();
      }
    });

    it("should still report that blocked tools exist in base registry", () => {
      // The tool exists (has), but is not allowed (isAllowed)
      expect(workerRegistry.has("delegate_task")).toBe(true);
      expect(workerRegistry.isAllowed("delegate_task")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Test Case 3: Level 2 worker cannot access delegate_task in FilteredToolRegistry
  // ---------------------------------------------------------------------------
  describe("FilteredToolRegistry blocks worker delegation tools", () => {
    it("should not include delegate_task in tool list", () => {
      const tools = workerRegistry.list();
      const toolNames = tools.map((t) => t.definition.name);

      expect(toolNames).not.toContain("delegate_task");
      expect(toolNames).not.toContain("new_task");
    });

    it("should not include delegation tools in getDefinitions", () => {
      const definitions = workerRegistry.getDefinitions();
      const defNames = definitions.map((d) => d.name);

      expect(defNames).not.toContain("delegate_task");
      expect(defNames).not.toContain("new_task");
    });

    it("should have correct size excluding blocked tools", () => {
      // Base has 7 tools, worker blocks 2 (delegate_task, new_task)
      expect(baseRegistry.size).toBe(7);
      expect(workerRegistry.size).toBe(5);
    });

    it("should allow regular tools for workers", () => {
      expect(workerRegistry.isAllowed("read_file")).toBe(true);
      expect(workerRegistry.isAllowed("write_file")).toBe(true);
      expect(workerRegistry.isAllowed("execute")).toBe(true);
      expect(workerRegistry.get("read_file")).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Test Case 4: Level 2 worker cannot access new_task tool
  // ---------------------------------------------------------------------------
  describe("new_task tool blocking", () => {
    it("should prevent worker from seeing new_task in tool list", () => {
      const tools = workerRegistry.list();
      const hasNewTask = tools.some((t) => t.definition.name === "new_task");
      expect(hasNewTask).toBe(false);
    });

    it("should prevent worker from executing new_task (tool not available)", () => {
      const tool = workerRegistry.get("new_task");
      expect(tool).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
});

// =============================================================================
// T051-2: Depth > 3 Delegation Rejection (TaskChain Limit)
// =============================================================================

describe("Anti-Recursion: TaskChain Depth Limit Enforcement", () => {
  let chainManager: TaskChainManager;

  beforeEach(() => {
    chainManager = createTaskChainManager();
  });

  // ---------------------------------------------------------------------------
  // Test Case 6: Depth > 3 delegation rejected
  // ---------------------------------------------------------------------------
  describe("depth limit enforcement", () => {
    it("should enforce MAX_DELEGATION_DEPTH = 3", () => {
      expect(MAX_DELEGATION_DEPTH).toBe(3);
    });

    it("should allow delegation up to depth 3", () => {
      // Create chain: root (depth 0)
      const chain = chainManager.createTaskChain("task-0", "orchestrator");
      expect(chain.rootTaskId).toBe("task-0");

      // Add depth 1: orchestrator -> workflow
      const node1 = chainManager.addTask(chain.chainId, "task-1", "task-0", "workflow-1");
      expect(node1).not.toBeNull();
      expect(node1?.depth).toBe(1);

      // Add depth 2: workflow -> worker
      const node2 = chainManager.addTask(chain.chainId, "task-2", "task-1", "worker-1");
      expect(node2).not.toBeNull();
      expect(node2?.depth).toBe(2);

      // Add depth 3: worker sub-task (max allowed)
      const node3 = chainManager.addTask(chain.chainId, "task-3", "task-2", "worker-2");
      expect(node3).not.toBeNull();
      expect(node3?.depth).toBe(3);
    });

    it("should reject delegation at depth > 3", () => {
      // Create chain with tasks at depths 0, 1, 2, 3
      const chain = chainManager.createTaskChain("task-0", "orchestrator");
      chainManager.addTask(chain.chainId, "task-1", "task-0", "workflow-1");
      chainManager.addTask(chain.chainId, "task-2", "task-1", "worker-1");
      chainManager.addTask(chain.chainId, "task-3", "task-2", "worker-2");

      // Try to add depth 4: MUST BE REJECTED
      const node4 = chainManager.addTask(chain.chainId, "task-4", "task-3", "worker-3");
      expect(node4).toBeNull();
    });

    it("should return null for any attempt to exceed depth 3", () => {
      const chain = chainManager.createTaskChain("root", "orchestrator");

      // Build max depth chain
      chainManager.addTask(chain.chainId, "d1", "root", "level-1");
      chainManager.addTask(chain.chainId, "d2", "d1", "level-2");
      chainManager.addTask(chain.chainId, "d3", "d2", "level-3");

      // Multiple attempts to exceed depth should all return null
      expect(chainManager.addTask(chain.chainId, "d4a", "d3", "level-4a")).toBeNull();
      expect(chainManager.addTask(chain.chainId, "d4b", "d3", "level-4b")).toBeNull();
      expect(chainManager.addTask(chain.chainId, "d4c", "d3", "level-4c")).toBeNull();
    });

    it("should track correct depth for each node", () => {
      const chain = chainManager.createTaskChain("root", "orchestrator");
      chainManager.addTask(chain.chainId, "child-1", "root", "agent-1");
      chainManager.addTask(chain.chainId, "child-2", "child-1", "agent-2");
      chainManager.addTask(chain.chainId, "child-3", "child-2", "agent-3");

      expect(chainManager.getDepth(chain.chainId, "root")).toBe(0);
      expect(chainManager.getDepth(chain.chainId, "child-1")).toBe(1);
      expect(chainManager.getDepth(chain.chainId, "child-2")).toBe(2);
      expect(chainManager.getDepth(chain.chainId, "child-3")).toBe(3);
    });
  });
});

// =============================================================================
// T051-3: Valid Delegation Paths
// =============================================================================

describe("Anti-Recursion: Valid Delegation Paths", () => {
  let baseRegistry: ToolRegistry;

  beforeEach(() => {
    baseRegistry = createBaseRegistry();
  });

  // ---------------------------------------------------------------------------
  // Test Case 7: Level 0 orchestrator can delegate to Level 1
  // ---------------------------------------------------------------------------
  describe("Level 0 orchestrator delegation", () => {
    it("should allow orchestrator to spawn workflow agents", () => {
      expect(canSpawn(AgentLevel.orchestrator, AgentLevel.workflow)).toBe(true);
    });

    it("should not allow orchestrator to spawn workers directly (skip level)", () => {
      expect(canSpawn(AgentLevel.orchestrator, AgentLevel.worker)).toBe(false);
    });

    it("should not allow orchestrator to spawn another orchestrator", () => {
      expect(canSpawn(AgentLevel.orchestrator, AgentLevel.orchestrator)).toBe(false);
    });

    it("should allow orchestrator full access to delegation tools", () => {
      const orchestratorRegistry = createFilteredToolRegistry(
        baseRegistry,
        AgentLevel.orchestrator
      );

      expect(orchestratorRegistry.isAllowed("delegate_task")).toBe(true);
      expect(orchestratorRegistry.isAllowed("new_task")).toBe(true);
      expect(orchestratorRegistry.get("delegate_task")).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Test Case 8: Level 1 can delegate to Level 2
  // ---------------------------------------------------------------------------
  describe("Level 1 workflow delegation", () => {
    it("should allow workflow to spawn worker agents", () => {
      expect(canSpawn(AgentLevel.workflow, AgentLevel.worker)).toBe(true);
    });

    it("should not allow workflow to spawn another workflow", () => {
      expect(canSpawn(AgentLevel.workflow, AgentLevel.workflow)).toBe(false);
    });

    it("should allow workflow full access to delegation tools", () => {
      const workflowRegistry = createFilteredToolRegistry(baseRegistry, AgentLevel.workflow);

      expect(workflowRegistry.isAllowed("delegate_task")).toBe(true);
      expect(workflowRegistry.isAllowed("new_task")).toBe(true);
      expect(workflowRegistry.get("delegate_task")).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Test Case 9: Level 1 cannot delegate to Level 0 (no upward delegation)
  // ---------------------------------------------------------------------------
  describe("no upward delegation", () => {
    it("should not allow workflow to spawn orchestrator", () => {
      expect(canSpawn(AgentLevel.workflow, AgentLevel.orchestrator)).toBe(false);
    });

    it("should not allow worker to spawn any agent", () => {
      expect(canSpawn(AgentLevel.worker, AgentLevel.orchestrator)).toBe(false);
      expect(canSpawn(AgentLevel.worker, AgentLevel.workflow)).toBe(false);
      expect(canSpawn(AgentLevel.worker, AgentLevel.worker)).toBe(false);
    });

    it("should enforce strict hierarchy: can only spawn exactly one level below", () => {
      // Level 0 can only spawn Level 1
      expect(canSpawn(AgentLevel.orchestrator, AgentLevel.workflow)).toBe(true);
      expect(canSpawn(AgentLevel.orchestrator, AgentLevel.worker)).toBe(false);

      // Level 1 can only spawn Level 2
      expect(canSpawn(AgentLevel.workflow, AgentLevel.worker)).toBe(true);
      expect(canSpawn(AgentLevel.workflow, AgentLevel.orchestrator)).toBe(false);

      // Level 2 cannot spawn any agent
      expect(canSpawn(AgentLevel.worker, AgentLevel.orchestrator)).toBe(false);
      expect(canSpawn(AgentLevel.worker, AgentLevel.workflow)).toBe(false);
      expect(canSpawn(AgentLevel.worker, AgentLevel.worker)).toBe(false);
    });
  });
});

// =============================================================================
// T051-4: Full Integration Path Verification
// =============================================================================

describe("Anti-Recursion: Full Integration Path", () => {
  let baseRegistry: ToolRegistry;
  let chainManager: TaskChainManager;

  beforeEach(() => {
    baseRegistry = createBaseRegistry();
    chainManager = createTaskChainManager();
  });

  describe("complete delegation chain validation", () => {
    it("should allow valid orchestrator -> workflow -> worker chain", () => {
      // Create registries for each level
      const orchestratorRegistry = createFilteredToolRegistry(
        baseRegistry,
        AgentLevel.orchestrator
      );
      const workflowRegistry = createFilteredToolRegistry(baseRegistry, AgentLevel.workflow);
      const workerRegistry = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      // Orchestrator can delegate
      expect(orchestratorRegistry.isAllowed("delegate_task")).toBe(true);
      expect(canSpawn(AgentLevel.orchestrator, AgentLevel.workflow)).toBe(true);

      // Workflow can delegate
      expect(workflowRegistry.isAllowed("delegate_task")).toBe(true);
      expect(canSpawn(AgentLevel.workflow, AgentLevel.worker)).toBe(true);

      // Worker CANNOT delegate
      expect(workerRegistry.isAllowed("delegate_task")).toBe(false);
      expect(canSpawn(AgentLevel.worker, AgentLevel.worker)).toBe(false);
    });

    it("should track full chain in TaskChainManager", () => {
      // Simulate: orchestrator creates task, spawns workflow, workflow spawns worker
      const chain = chainManager.createTaskChain("root-task", "ouroboros");

      // Orchestrator delegates to workflow
      const workflow = chainManager.addTask(
        chain.chainId,
        "workflow-task",
        "root-task",
        "ouroboros-spec"
      );
      expect(workflow).not.toBeNull();
      expect(workflow?.depth).toBe(1);

      // Workflow delegates to worker
      const worker = chainManager.addTask(
        chain.chainId,
        "worker-task",
        "workflow-task",
        "ouroboros-coder"
      );
      expect(worker).not.toBeNull();
      expect(worker?.depth).toBe(2);

      // Worker sub-task (allowed, depth 3)
      const subTask = chainManager.addTask(
        chain.chainId,
        "sub-task",
        "worker-task",
        "ouroboros-qa"
      );
      expect(subTask).not.toBeNull();
      expect(subTask?.depth).toBe(3);

      // Verify chain structure
      const retrievedChain = chainManager.getChain(chain.chainId);
      expect(retrievedChain).toBeDefined();
      expect(retrievedChain?.maxDepth).toBe(3);
    });

    it("should combine tool filtering AND depth checking for complete anti-recursion", () => {
      // Create a worker registry
      const workerRegistry = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      // Worker cannot access delegation tools (REQ-037)
      expect(workerRegistry.isAllowed("delegate_task")).toBe(false);
      expect(workerRegistry.get("delegate_task")).toBeUndefined();

      // Even if somehow bypassed, depth limits would catch it
      const chain = chainManager.createTaskChain("t0", "orchestrator");
      chainManager.addTask(chain.chainId, "t1", "t0", "workflow");
      chainManager.addTask(chain.chainId, "t2", "t1", "worker-1");
      chainManager.addTask(chain.chainId, "t3", "t2", "worker-2");

      // Depth 4 rejected by TaskChain
      expect(chainManager.addTask(chain.chainId, "t4", "t3", "worker-3")).toBeNull();
    });
  });

  describe("case-insensitive tool blocking", () => {
    it("should block delegation tools regardless of case", () => {
      const workerRegistry = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      // Various case combinations should all be blocked
      expect(workerRegistry.isAllowed("DELEGATE_TASK")).toBe(false);
      expect(workerRegistry.isAllowed("Delegate_Task")).toBe(false);
      expect(workerRegistry.isAllowed("NEW_TASK")).toBe(false);
      expect(workerRegistry.isAllowed("New_Task")).toBe(false);
    });
  });

  describe("registry level metadata", () => {
    it("should correctly report agent level for each registry", () => {
      const orchestratorReg = createFilteredToolRegistry(baseRegistry, AgentLevel.orchestrator);
      const workflowReg = createFilteredToolRegistry(baseRegistry, AgentLevel.workflow);
      const workerReg = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      expect(orchestratorReg.agentLevel).toBe(AgentLevel.orchestrator);
      expect(workflowReg.agentLevel).toBe(AgentLevel.workflow);
      expect(workerReg.agentLevel).toBe(AgentLevel.worker);
    });
  });
});
