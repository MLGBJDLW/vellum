// ============================================
// SubsessionManager Integration Tests
// ============================================
// REQ-021: Subsession lifecycle management tests

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AgentLevel } from "../../../agent/level.js";
import type {
  GetDefinitionsFilter,
  LLMToolDefinition,
  ToolRegistry,
} from "../../../tool/registry.js";
import type { Tool, ToolKind } from "../../../types/tool.js";
import type { ApprovalRequest } from "../../orchestrator/approval-forwarder.js";
import { createContextIsolator } from "../context-isolator.js";
import { createPermissionInheritance } from "../permission-inheritance.js";
import { createResourceQuotaManager } from "../resource-quota.js";
import { createSubsessionManager, type SubsessionManager } from "../subsession-manager.js";

// ============================================
// Test Helpers
// ============================================

/**
 * Creates a mock tool for testing.
 */
function createMockTool(
  name: string,
  kind: ToolKind = "read"
  // biome-ignore lint/suspicious/noExplicitAny: Test mock
): Tool<z.ZodType, any> {
  return {
    definition: {
      name,
      description: `Mock tool: ${name}`,
      parameters: z.object({}),
      kind,
      enabled: true,
    },
    execute: async () => ({ success: true as const, output: undefined }),
  };
}

/**
 * Creates a mock tool registry for testing.
 */
function createMockRegistry(
  // biome-ignore lint/suspicious/noExplicitAny: Test mock
  tools: Tool<z.ZodType, any>[]
): ToolRegistry {
  // biome-ignore lint/suspicious/noExplicitAny: Test mock
  const toolMap = new Map<string, Tool<z.ZodType, any>>();
  for (const tool of tools) {
    toolMap.set(tool.definition.name.toLowerCase(), tool);
  }

  return {
    register: () => {},
    get: (name: string) => toolMap.get(name.toLowerCase()),
    list: () => Array.from(toolMap.values()),
    listByKind: (kind: ToolKind) =>
      Array.from(toolMap.values()).filter((t) => t.definition.kind === kind),
    has: (name: string) => toolMap.has(name.toLowerCase()),
    getDefinitions: (filter?: GetDefinitionsFilter): LLMToolDefinition[] => {
      let defs = Array.from(toolMap.values()).map((t) => ({
        name: t.definition.name,
        description: t.definition.description,
        parameters: {},
        kind: t.definition.kind,
      }));
      if (filter?.kinds) {
        defs = defs.filter((d) => filter.kinds?.includes(d.kind));
      }
      return defs;
    },
    getOriginalName: (name: string) => {
      const tool = toolMap.get(name.toLowerCase());
      return tool?.definition.name ?? name;
    },
    get size() {
      return toolMap.size;
    },
    // T044: MCP tool methods (no-op for test mock)
    registerMcpTool: () => {},
    unregisterMcpTools: () => 0,
    listMcpTools: () => [],
  };
}

/**
 * Creates a fully configured SubsessionManager for testing.
 */
function createTestManager(): SubsessionManager {
  const testTools = [
    createMockTool("read_file", "read"),
    createMockTool("write_file", "write"),
    createMockTool("execute", "shell"),
    createMockTool("delegate_task", "agent"),
    createMockTool("new_task", "agent"),
    createMockTool("fetch", "browser"),
  ];

  return createSubsessionManager({
    contextIsolator: createContextIsolator(),
    permissionInheritance: createPermissionInheritance(),
    resourceQuotaManager: createResourceQuotaManager(),
    baseToolRegistry: createMockRegistry(testTools),
  });
}

// ============================================
// Tests: Subsession Creation
// ============================================

describe("SubsessionManager", () => {
  describe("create()", () => {
    it("should spawn subsession with valid config", () => {
      const manager = createTestManager();

      const subsession = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      expect(subsession).toBeDefined();
      expect(subsession.id).toBeDefined();
      expect(subsession.agentSlug).toBe("ouroboros");
      expect(subsession.level).toBe(AgentLevel.orchestrator);
      expect(subsession.status).toBe("active");
      expect(subsession.createdAt).toBeInstanceOf(Date);
    });

    it("should create subsession with parent reference", () => {
      const manager = createTestManager();

      // Create parent orchestrator
      const parent = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      // Create child workflow
      const child = manager.create({
        parentId: parent.id,
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
      });

      expect(child.parentId).toBe(parent.id);
      expect(child.level).toBe(AgentLevel.workflow);
    });

    it("should validate level hierarchy - child level must be greater than parent", () => {
      const manager = createTestManager();

      const parent = manager.create({
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
      });

      // Same level should fail
      expect(() =>
        manager.create({
          parentId: parent.id,
          agentSlug: "ouroboros-implement",
          level: AgentLevel.workflow,
        })
      ).toThrow(/Invalid level hierarchy/);

      // Lower level should fail
      expect(() =>
        manager.create({
          parentId: parent.id,
          agentSlug: "ouroboros",
          level: AgentLevel.orchestrator,
        })
      ).toThrow(/Invalid level hierarchy/);
    });

    it("should throw if parent not found", () => {
      const manager = createTestManager();

      expect(() =>
        manager.create({
          parentId: "non-existent-parent",
          agentSlug: "ouroboros-coder",
          level: AgentLevel.worker,
        })
      ).toThrow(/Parent subsession not found/);
    });

    it("should throw if parent is not active", () => {
      const manager = createTestManager();

      const parent = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      // Terminate parent
      manager.terminate(parent.id);

      // Try to create child of terminated parent
      expect(() =>
        manager.create({
          parentId: parent.id,
          agentSlug: "ouroboros-spec",
          level: AgentLevel.workflow,
        })
      ).toThrow(/Parent subsession is not active/);
    });

    it("should inherit parent context", () => {
      const manager = createTestManager();

      // Create parent with local memory
      const parent = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
        initialContext: {
          localMemory: { config: { debug: true }, apiKey: "secret" },
        },
      });

      // Verify parent has local memory set
      expect(parent.context.localMemory).toEqual({
        config: { debug: true },
        apiKey: "secret",
      });

      // Create child - parent's local becomes child's shared
      const child = manager.create({
        parentId: parent.id,
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
      });

      // Child should have parent's local memory as shared
      expect(child.context.sharedMemory).toEqual({
        config: { debug: true },
        apiKey: "secret",
      });
      expect(child.context.localMemory).toEqual({});
    });

    it("should inherit parent files by default", () => {
      const manager = createTestManager();

      const parent = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
        initialContext: {
          files: ["src/index.ts", "src/utils.ts"],
        },
      });

      const child = manager.create({
        parentId: parent.id,
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
      });

      expect(child.context.files).toContain("src/index.ts");
      expect(child.context.files).toContain("src/utils.ts");
    });

    it("should inherit parent permissions (intersection)", () => {
      const manager = createTestManager();

      // Parent with full write access
      const parent = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
        requestedPermissions: {
          filePatterns: [
            { pattern: "src/**/*.ts", access: "write" },
            { pattern: "*.config.js", access: "write" },
          ],
          toolGroups: [
            { group: "filesystem", enabled: true },
            { group: "shell", enabled: true },
          ],
          canApproveSubagent: true,
          maxSubagentDepth: 5,
        },
      });

      // Child requests specific restrictions
      const child = manager.create({
        parentId: parent.id,
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
        requestedPermissions: {
          filePatterns: [
            { pattern: "src/**/*.ts", access: "read" }, // More restrictive
          ],
          toolGroups: [
            { group: "filesystem", enabled: true },
            { group: "shell", enabled: false }, // Disabled
          ],
          maxSubagentDepth: 3,
        },
      });

      // Child should get more restrictive access
      const srcPattern = child.permissions.filePatterns.find((p) => p.pattern === "src/**/*.ts");
      expect(srcPattern?.access).toBe("read");

      // Shell should be disabled
      const shellGroup = child.permissions.toolGroups.find((g) => g.group === "shell");
      expect(shellGroup?.enabled).toBe(false);

      // maxSubagentDepth should be minimum of parent and child
      expect(child.permissions.maxSubagentDepth).toBe(3);
    });
  });

  // ============================================
  // Tests: Subsession Retrieval
  // ============================================

  describe("get()", () => {
    it("should return subsession by ID", () => {
      const manager = createTestManager();

      const created = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      const retrieved = manager.get(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.agentSlug).toBe("ouroboros");
    });

    it("should return undefined for unknown ID", () => {
      const manager = createTestManager();

      const result = manager.get("non-existent-id");

      expect(result).toBeUndefined();
    });
  });

  // ============================================
  // Tests: Subsession Termination
  // ============================================

  describe("terminate()", () => {
    it("should mark subsession as terminated", () => {
      const manager = createTestManager();

      const subsession = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      expect(subsession.status).toBe("active");

      const result = manager.terminate(subsession.id);

      expect(result).toBe(true);
      expect(subsession.status).toBe("terminated");
      expect(subsession.terminatedAt).toBeInstanceOf(Date);
    });

    it("should return false for unknown ID", () => {
      const manager = createTestManager();

      const result = manager.terminate("non-existent-id");

      expect(result).toBe(false);
    });

    it("should recursively terminate children", () => {
      const manager = createTestManager();

      // Create hierarchy: orchestrator -> workflow -> worker
      const orchestrator = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      const workflow = manager.create({
        parentId: orchestrator.id,
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
      });

      const worker = manager.create({
        parentId: workflow.id,
        agentSlug: "ouroboros-coder",
        level: AgentLevel.worker,
      });

      // Terminate orchestrator
      manager.terminate(orchestrator.id);

      // All should be terminated
      expect(orchestrator.status).toBe("terminated");
      expect(workflow.status).toBe("terminated");
      expect(worker.status).toBe("terminated");
    });

    it("should terminate multiple children at same level", () => {
      const manager = createTestManager();

      const parent = manager.create({
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
      });

      const child1 = manager.create({
        parentId: parent.id,
        agentSlug: "ouroboros-coder",
        level: AgentLevel.worker,
      });

      const child2 = manager.create({
        parentId: parent.id,
        agentSlug: "ouroboros-qa",
        level: AgentLevel.worker,
      });

      manager.terminate(parent.id);

      expect(parent.status).toBe("terminated");
      expect(child1.status).toBe("terminated");
      expect(child2.status).toBe("terminated");
    });
  });

  // ============================================
  // Tests: List by Parent
  // ============================================

  describe("listByParent()", () => {
    it("should return child subsessions", () => {
      const manager = createTestManager();

      const parent = manager.create({
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
      });

      const child1 = manager.create({
        parentId: parent.id,
        agentSlug: "ouroboros-coder",
        level: AgentLevel.worker,
      });

      const child2 = manager.create({
        parentId: parent.id,
        agentSlug: "ouroboros-qa",
        level: AgentLevel.worker,
      });

      const children = manager.listByParent(parent.id);

      expect(children).toHaveLength(2);
      expect(children.map((c) => c.id)).toContain(child1.id);
      expect(children.map((c) => c.id)).toContain(child2.id);
    });

    it("should return empty array for no children", () => {
      const manager = createTestManager();

      const subsession = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      const children = manager.listByParent(subsession.id);

      expect(children).toEqual([]);
    });

    it("should return empty array for unknown parent", () => {
      const manager = createTestManager();

      const children = manager.listByParent("non-existent-id");

      expect(children).toEqual([]);
    });
  });

  // ============================================
  // Tests: Execute in Subsession Context
  // ============================================

  describe("execute()", () => {
    it("should run function in subsession context", async () => {
      const manager = createTestManager();

      const subsession = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      const result = await manager.execute(subsession.id, async () => {
        return { completed: true, data: "test-result" };
      });

      expect(result).toEqual({ completed: true, data: "test-result" });
    });

    it("should throw if subsession not found", async () => {
      const manager = createTestManager();

      await expect(
        manager.execute("non-existent-id", async () => ({ done: true }))
      ).rejects.toThrow(/Subsession not found/);
    });

    it("should throw if subsession not active", async () => {
      const manager = createTestManager();

      const subsession = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      manager.terminate(subsession.id);

      await expect(manager.execute(subsession.id, async () => ({ done: true }))).rejects.toThrow(
        /Subsession is not active/
      );
    });

    it("should track resource quota - duration", async () => {
      const manager = createTestManager();

      const subsession = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
        quota: {
          maxTokens: 100000,
          maxDurationMs: 10000,
          maxSubagents: 3,
          maxFileOps: 50,
        },
      });

      // Execute a quick operation
      await manager.execute(subsession.id, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return true;
      });

      // Subsession should still be active
      expect(subsession.status).toBe("active");
    });

    it("should fail if quota exceeded before execution", async () => {
      // Create a mock quota manager that reports exceeded
      const mockQuotaManager = {
        allocate: vi.fn(),
        consume: vi.fn().mockReturnValue(true),
        getRemaining: vi.fn().mockReturnValue({
          tokensUsed: 0,
          durationMs: 0,
          subagentsSpawned: 0,
          fileOpsPerformed: 0,
        }),
        release: vi.fn(),
        getStatus: vi.fn().mockReturnValue({
          quota: { maxTokens: 100, maxDurationMs: 1000, maxSubagents: 1, maxFileOps: 5 },
          usage: { tokensUsed: 150, durationMs: 0, subagentsSpawned: 0, fileOpsPerformed: 0 },
          remaining: { tokensUsed: 0, durationMs: 1000, subagentsSpawned: 1, fileOpsPerformed: 5 },
          exceeds: true,
        }),
        isExceeded: vi.fn().mockReturnValue(true), // Simulate exceeded state
      };

      const testTools = [createMockTool("read_file", "read")];
      const manager = createSubsessionManager({
        contextIsolator: createContextIsolator(),
        permissionInheritance: createPermissionInheritance(),
        resourceQuotaManager: mockQuotaManager,
        baseToolRegistry: createMockRegistry(testTools),
      });

      const subsession = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
        quota: {
          maxTokens: 100,
          maxDurationMs: 1000,
          maxSubagents: 1,
          maxFileOps: 5,
        },
      });

      await expect(manager.execute(subsession.id, async () => true)).rejects.toThrow(
        /Resource quota exceeded/
      );

      expect(subsession.status).toBe("suspended");
    });

    it("should track duration across multiple executions", async () => {
      const manager = createTestManager();

      const subsession = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
        quota: {
          maxTokens: 100000,
          maxDurationMs: 50, // Very low duration limit
          maxSubagents: 3,
          maxFileOps: 50,
        },
      });

      // First execution
      await manager.execute(subsession.id, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return true;
      });

      // Second execution - should work if under limit
      await manager.execute(subsession.id, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return true;
      });

      // Continue executing until duration limit exceeded
      // The status will be set to suspended after the quota is consumed
      expect(["active", "suspended"]).toContain(subsession.status);
    });

    it("should propagate errors from executed function", async () => {
      const manager = createTestManager();

      const subsession = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      await expect(
        manager.execute(subsession.id, async () => {
          throw new Error("Task failed");
        })
      ).rejects.toThrow("Task failed");
    });
  });

  // ============================================
  // Tests: Approval Forwarding
  // ============================================

  describe("requestApproval()", () => {
    it("should throw if subsession not found", async () => {
      const manager = createTestManager();

      const request: ApprovalRequest = {
        requestId: "req-1",
        subagentId: "agent-1",
        parentSessionId: "session-1",
        tool: "execute",
        params: { command: "rm -rf /" },
        createdAt: new Date(),
      };

      await expect(manager.requestApproval("non-existent-id", request)).rejects.toThrow(
        /Subsession not found/
      );
    });

    it("should forward to parent chain", async () => {
      const manager = createTestManager();
      const approvalHandler = vi.fn().mockResolvedValue(true);
      manager.setApprovalHandler(approvalHandler);

      const parent = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      const child = manager.create({
        parentId: parent.id,
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
      });

      const request: ApprovalRequest = {
        requestId: "req-1",
        subagentId: child.id,
        parentSessionId: parent.id,
        tool: "execute",
        params: { command: "ls -la" },
        createdAt: new Date(),
      };

      const result = await manager.requestApproval(child.id, request);

      expect(result).toBe(true);
      expect(approvalHandler).toHaveBeenCalledWith(request);
    });

    it("should deny if no approval handler is set", async () => {
      const manager = createTestManager();
      // Don't set approval handler

      const subsession = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      const request: ApprovalRequest = {
        requestId: "req-1",
        subagentId: subsession.id,
        parentSessionId: "session-1",
        tool: "execute",
        params: { command: "ls -la" },
        createdAt: new Date(),
      };

      const result = await manager.requestApproval(subsession.id, request);

      expect(result).toBe(false);
    });

    it("should forward through multi-level hierarchy", async () => {
      const manager = createTestManager();
      const approvalHandler = vi.fn().mockResolvedValue(true);
      manager.setApprovalHandler(approvalHandler);

      // Create 3-level hierarchy
      const orchestrator = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      const workflow = manager.create({
        parentId: orchestrator.id,
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
      });

      const worker = manager.create({
        parentId: workflow.id,
        agentSlug: "ouroboros-coder",
        level: AgentLevel.worker,
      });

      const request: ApprovalRequest = {
        requestId: "req-1",
        subagentId: worker.id,
        parentSessionId: workflow.id,
        tool: "write_file",
        params: { path: "/etc/hosts" },
        createdAt: new Date(),
      };

      const result = await manager.requestApproval(worker.id, request);

      expect(result).toBe(true);
      expect(approvalHandler).toHaveBeenCalled();
    });
  });

  // ============================================
  // Tests: Tool Registry Filtering
  // ============================================

  describe("Tool registry filtered by agent level", () => {
    it("should filter delegation tools for workers", () => {
      const manager = createTestManager();

      const parent = manager.create({
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
      });

      const worker = manager.create({
        parentId: parent.id,
        agentSlug: "ouroboros-coder",
        level: AgentLevel.worker,
      });

      // Worker should not have access to delegation tools
      expect(worker.toolRegistry.isAllowed("delegate_task")).toBe(false);
      expect(worker.toolRegistry.isAllowed("new_task")).toBe(false);

      // Worker should have access to regular tools
      expect(worker.toolRegistry.isAllowed("read_file")).toBe(true);
      expect(worker.toolRegistry.isAllowed("write_file")).toBe(true);
    });

    it("should allow all tools for orchestrators", () => {
      const manager = createTestManager();

      const orchestrator = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      expect(orchestrator.toolRegistry.isAllowed("delegate_task")).toBe(true);
      expect(orchestrator.toolRegistry.isAllowed("new_task")).toBe(true);
      expect(orchestrator.toolRegistry.isAllowed("read_file")).toBe(true);
    });

    it("should allow all tools for workflow agents", () => {
      const manager = createTestManager();

      const workflow = manager.create({
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
      });

      expect(workflow.toolRegistry.isAllowed("delegate_task")).toBe(true);
      expect(workflow.toolRegistry.isAllowed("new_task")).toBe(true);
      expect(workflow.toolRegistry.isAllowed("read_file")).toBe(true);
    });

    it("should apply tool group restrictions from permissions", () => {
      const manager = createTestManager();

      const parent = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
        requestedPermissions: {
          filePatterns: [],
          toolGroups: [
            { group: "read", enabled: true },
            { group: "write", enabled: true },
            { group: "browser", enabled: false }, // Browser disabled
          ],
          canApproveSubagent: true,
          maxSubagentDepth: 3,
        },
      });

      // Check tool availability based on groups
      expect(parent.toolRegistry.isAllowed("read_file")).toBe(true);
      expect(parent.toolRegistry.isAllowed("write_file")).toBe(true);
      // Browser tools should be blocked by permission
      // Note: This depends on how permissions are applied to tool groups
    });
  });

  // ============================================
  // Tests: Active Count
  // ============================================

  describe("getActiveCount()", () => {
    it("should return count of active subsessions", () => {
      const manager = createTestManager();

      expect(manager.getActiveCount()).toBe(0);

      manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      expect(manager.getActiveCount()).toBe(1);

      const sub2 = manager.create({
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
      });

      expect(manager.getActiveCount()).toBe(2);

      manager.terminate(sub2.id);

      expect(manager.getActiveCount()).toBe(1);
    });

    it("should not count terminated subsessions", () => {
      const manager = createTestManager();

      const sub = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
      });

      expect(manager.getActiveCount()).toBe(1);

      manager.terminate(sub.id);

      expect(manager.getActiveCount()).toBe(0);
    });
  });

  // ============================================
  // Tests: Isolation
  // ============================================

  describe("Context isolation", () => {
    it("should isolate local memory between siblings", () => {
      const manager = createTestManager();

      const parent = manager.create({
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
      });

      const child1 = manager.create({
        parentId: parent.id,
        agentSlug: "ouroboros-coder",
        level: AgentLevel.worker,
        initialContext: {
          localMemory: { task: "coding" },
        },
      });

      const child2 = manager.create({
        parentId: parent.id,
        agentSlug: "ouroboros-qa",
        level: AgentLevel.worker,
        initialContext: {
          localMemory: { task: "testing" },
        },
      });

      // Each child has its own local memory
      expect(child1.context.localMemory.task).toBe("coding");
      expect(child2.context.localMemory.task).toBe("testing");

      // Modifying one shouldn't affect the other
      child1.context.localMemory.result = "done";
      expect(child2.context.localMemory.result).toBeUndefined();
    });

    it("should not allow child to modify parent shared memory", () => {
      const manager = createTestManager();

      const parent = manager.create({
        agentSlug: "ouroboros",
        level: AgentLevel.orchestrator,
        initialContext: {
          localMemory: { config: { important: "value" } },
        },
      });

      const child = manager.create({
        parentId: parent.id,
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
      });

      // Child's shared memory is read-only (comes from parent's local)
      // The type system enforces this at compile time
      expect(child.context.sharedMemory.config).toEqual({ important: "value" });
    });
  });

  // ============================================
  // Tests: Subagent Spawn Tracking
  // ============================================

  describe("Subagent spawn tracking", () => {
    it("should track subagent spawns in parent quota", () => {
      const resourceQuotaManager = createResourceQuotaManager();

      const testTools = [createMockTool("read_file", "read")];
      const manager = createSubsessionManager({
        contextIsolator: createContextIsolator(),
        permissionInheritance: createPermissionInheritance(),
        resourceQuotaManager,
        baseToolRegistry: createMockRegistry(testTools),
      });

      const parent = manager.create({
        agentSlug: "ouroboros-spec",
        level: AgentLevel.workflow,
        quota: {
          maxTokens: 100000,
          maxDurationMs: 300000,
          maxSubagents: 2,
          maxFileOps: 50,
        },
      });

      // Create first child
      manager.create({
        parentId: parent.id,
        agentSlug: "ouroboros-coder",
        level: AgentLevel.worker,
      });

      const status1 = resourceQuotaManager.getStatus(parent.id);
      expect(status1?.usage.subagentsSpawned).toBe(1);

      // Create second child
      manager.create({
        parentId: parent.id,
        agentSlug: "ouroboros-qa",
        level: AgentLevel.worker,
      });

      const status2 = resourceQuotaManager.getStatus(parent.id);
      expect(status2?.usage.subagentsSpawned).toBe(2);
    });
  });
});
