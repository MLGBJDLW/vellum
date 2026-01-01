// ============================================
// Filtered Tool Registry Tests
// ============================================
// REQ-020: Session isolation
// REQ-025: Tool filtering based on agent level

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AgentLevel } from "../../../agent/level.js";
import type { ToolGroupEntry } from "../../../agent/restrictions.js";
import type {
  GetDefinitionsFilter,
  LLMToolDefinition,
  ToolRegistry,
} from "../../../tool/registry.js";
import type { Tool, ToolKind } from "../../../types/tool.js";
import { createFilteredToolRegistry, WORKER_BLOCKED_TOOLS } from "../filtered-tool-registry.js";

// ============================================
// Mock Tool Registry
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
  };
}

// ============================================
// Tests
// ============================================

describe("FilteredToolRegistry", () => {
  // Standard test tools
  const testTools = [
    createMockTool("read_file", "read"),
    createMockTool("write_file", "write"),
    createMockTool("execute", "shell"),
    createMockTool("delegate_task", "agent"),
    createMockTool("new_task", "agent"),
    createMockTool("switch_mode", "agent"),
    createMockTool("fetch", "browser"),
    createMockTool("request", "browser"),
    createMockTool("mcp_tool", "mcp"),
  ];

  describe("WORKER_BLOCKED_TOOLS constant", () => {
    it("should contain delegate_task, new_task, switch_mode", () => {
      expect(WORKER_BLOCKED_TOOLS).toContain("delegate_task");
      expect(WORKER_BLOCKED_TOOLS).toContain("new_task");
      expect(WORKER_BLOCKED_TOOLS).toContain("switch_mode");
      expect(WORKER_BLOCKED_TOOLS).toHaveLength(3);
    });
  });

  describe("Level 2 workers blocked from delegation tools (REQ-037)", () => {
    it("should block delegate_task for workers", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      expect(filtered.isAllowed("delegate_task")).toBe(false);
      expect(filtered.get("delegate_task")).toBeUndefined();
    });

    it("should block new_task for workers", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      expect(filtered.isAllowed("new_task")).toBe(false);
      expect(filtered.get("new_task")).toBeUndefined();
    });

    it("should block switch_mode for workers", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      expect(filtered.isAllowed("switch_mode")).toBe(false);
      expect(filtered.get("switch_mode")).toBeUndefined();
    });

    it("should allow non-delegation tools for workers", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      expect(filtered.isAllowed("read_file")).toBe(true);
      expect(filtered.isAllowed("write_file")).toBe(true);
      expect(filtered.isAllowed("execute")).toBe(true);
      expect(filtered.get("read_file")).toBeDefined();
    });
  });

  describe("Level 0/1 can access all tools", () => {
    it("should allow all tools for orchestrators (Level 0)", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.orchestrator);

      expect(filtered.isAllowed("delegate_task")).toBe(true);
      expect(filtered.isAllowed("new_task")).toBe(true);
      expect(filtered.isAllowed("switch_mode")).toBe(true);
      expect(filtered.isAllowed("read_file")).toBe(true);
      expect(filtered.get("delegate_task")).toBeDefined();
    });

    it("should allow all tools for workflows (Level 1)", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.workflow);

      expect(filtered.isAllowed("delegate_task")).toBe(true);
      expect(filtered.isAllowed("new_task")).toBe(true);
      expect(filtered.isAllowed("switch_mode")).toBe(true);
      expect(filtered.get("new_task")).toBeDefined();
    });
  });

  describe("Tool groups filtering", () => {
    it("should disable entire tool group when enabled=false", () => {
      const baseRegistry = createMockRegistry(testTools);
      const toolGroups: ToolGroupEntry[] = [{ group: "shell", enabled: false }];

      const filtered = createFilteredToolRegistry(
        baseRegistry,
        AgentLevel.orchestrator,
        toolGroups
      );

      expect(filtered.isAllowed("execute")).toBe(false);
      expect(filtered.isAllowed("read_file")).toBe(true); // Other groups unaffected
    });

    it("should allow only specific tools when tools list provided", () => {
      const baseRegistry = createMockRegistry(testTools);
      const toolGroups: ToolGroupEntry[] = [{ group: "browser", enabled: true, tools: ["fetch"] }];

      const filtered = createFilteredToolRegistry(
        baseRegistry,
        AgentLevel.orchestrator,
        toolGroups
      );

      expect(filtered.isAllowed("fetch")).toBe(true);
      expect(filtered.isAllowed("request")).toBe(false); // Not in allowed list
    });

    it("should handle multiple tool groups", () => {
      const baseRegistry = createMockRegistry(testTools);
      const toolGroups: ToolGroupEntry[] = [
        { group: "shell", enabled: false },
        { group: "browser", enabled: true, tools: ["fetch"] },
        { group: "mcp", enabled: false },
      ];

      const filtered = createFilteredToolRegistry(
        baseRegistry,
        AgentLevel.orchestrator,
        toolGroups
      );

      expect(filtered.isAllowed("execute")).toBe(false);
      expect(filtered.isAllowed("fetch")).toBe(true);
      expect(filtered.isAllowed("request")).toBe(false);
      expect(filtered.isAllowed("mcp_tool")).toBe(false);
      expect(filtered.isAllowed("read_file")).toBe(true);
    });

    it("should combine level restrictions with tool groups for workers", () => {
      const baseRegistry = createMockRegistry(testTools);
      const toolGroups: ToolGroupEntry[] = [{ group: "shell", enabled: false }];

      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker, toolGroups);

      // Blocked by level
      expect(filtered.isAllowed("delegate_task")).toBe(false);
      // Blocked by tool group
      expect(filtered.isAllowed("execute")).toBe(false);
      // Allowed
      expect(filtered.isAllowed("read_file")).toBe(true);
    });
  });

  describe("isAllowed() - O(1) lookup", () => {
    it("should return true for allowed tools", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.orchestrator);

      expect(filtered.isAllowed("read_file")).toBe(true);
      expect(filtered.isAllowed("write_file")).toBe(true);
    });

    it("should return false for blocked tools", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      expect(filtered.isAllowed("delegate_task")).toBe(false);
      expect(filtered.isAllowed("new_task")).toBe(false);
    });

    it("should return true for non-existent tools (not blocked, just missing)", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      // Tool doesn't exist, but isAllowed checks blocked list, not existence
      expect(filtered.isAllowed("nonexistent_tool")).toBe(true);
    });

    it("should be case-insensitive", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      expect(filtered.isAllowed("DELEGATE_TASK")).toBe(false);
      expect(filtered.isAllowed("Delegate_Task")).toBe(false);
      expect(filtered.isAllowed("READ_FILE")).toBe(true);
    });

    it("should have O(1) lookup performance characteristics", () => {
      // Create a large registry
      const manyTools = [];
      for (let i = 0; i < 1000; i++) {
        manyTools.push(createMockTool(`tool_${i}`, "read"));
      }
      const baseRegistry = createMockRegistry(manyTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.orchestrator);

      // Measure single lookup time (should be constant regardless of size)
      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        filtered.isAllowed("tool_500");
      }
      const elapsed = performance.now() - start;

      // 10000 lookups should complete in under 100ms for O(1) Map lookup
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe("getBlocked()", () => {
    it("should return empty array for orchestrators with no tool groups", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.orchestrator);

      expect(filtered.getBlocked()).toHaveLength(0);
    });

    it("should return worker blocked tools for workers", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      const blocked = filtered.getBlocked();
      expect(blocked).toContain("delegate_task");
      expect(blocked).toContain("new_task");
      expect(blocked).toContain("switch_mode");
    });

    it("should include tool group blocked tools", () => {
      const baseRegistry = createMockRegistry(testTools);
      const toolGroups: ToolGroupEntry[] = [{ group: "shell", enabled: false }];
      const filtered = createFilteredToolRegistry(
        baseRegistry,
        AgentLevel.orchestrator,
        toolGroups
      );

      const blocked = filtered.getBlocked();
      expect(blocked).toContain("execute");
    });

    it("should combine level and tool group blocks", () => {
      const baseRegistry = createMockRegistry(testTools);
      const toolGroups: ToolGroupEntry[] = [{ group: "browser", enabled: false }];
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker, toolGroups);

      const blocked = filtered.getBlocked();
      // Level blocks
      expect(blocked).toContain("delegate_task");
      expect(blocked).toContain("new_task");
      expect(blocked).toContain("switch_mode");
      // Tool group blocks
      expect(blocked).toContain("fetch");
      expect(blocked).toContain("request");
    });
  });

  describe("get()", () => {
    it("should return tool if allowed", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.orchestrator);

      const tool = filtered.get("read_file");
      expect(tool).toBeDefined();
      expect(tool?.definition.name).toBe("read_file");
    });

    it("should return undefined if blocked", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      expect(filtered.get("delegate_task")).toBeUndefined();
    });

    it("should return undefined if tool does not exist", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.orchestrator);

      expect(filtered.get("nonexistent")).toBeUndefined();
    });

    it("should be case-insensitive", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.orchestrator);

      expect(filtered.get("READ_FILE")).toBeDefined();
      expect(filtered.get("Read_File")).toBeDefined();
    });
  });

  describe("list()", () => {
    it("should return all tools for orchestrators", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.orchestrator);

      expect(filtered.list()).toHaveLength(testTools.length);
    });

    it("should exclude blocked tools for workers", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      const listed = filtered.list();
      expect(listed).toHaveLength(testTools.length - WORKER_BLOCKED_TOOLS.length);
      expect(listed.some((t) => t.definition.name === "delegate_task")).toBe(false);
      expect(listed.some((t) => t.definition.name === "read_file")).toBe(true);
    });

    it("should exclude tool group blocked tools", () => {
      const baseRegistry = createMockRegistry(testTools);
      const toolGroups: ToolGroupEntry[] = [{ group: "shell", enabled: false }];
      const filtered = createFilteredToolRegistry(
        baseRegistry,
        AgentLevel.orchestrator,
        toolGroups
      );

      const listed = filtered.list();
      expect(listed.some((t) => t.definition.name === "execute")).toBe(false);
    });
  });

  describe("has()", () => {
    it("should return true if tool exists in base registry", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      // has() checks existence, not blocking
      expect(filtered.has("delegate_task")).toBe(true);
      expect(filtered.has("read_file")).toBe(true);
    });

    it("should return false if tool does not exist", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      expect(filtered.has("nonexistent")).toBe(false);
    });
  });

  describe("getDefinitions()", () => {
    it("should return definitions for allowed tools only", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      const defs = filtered.getDefinitions();
      expect(defs.some((d) => d.name === "delegate_task")).toBe(false);
      expect(defs.some((d) => d.name === "read_file")).toBe(true);
    });

    it("should respect filter options", () => {
      const baseRegistry = createMockRegistry(testTools);
      const filtered = createFilteredToolRegistry(baseRegistry, AgentLevel.orchestrator);

      const defs = filtered.getDefinitions({ kinds: ["read"] });
      expect(defs.every((d) => d.kind === "read")).toBe(true);
    });
  });

  describe("size property", () => {
    it("should return count of allowed tools", () => {
      const baseRegistry = createMockRegistry(testTools);
      const orchestratorFiltered = createFilteredToolRegistry(
        baseRegistry,
        AgentLevel.orchestrator
      );
      const workerFiltered = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);

      expect(orchestratorFiltered.size).toBe(testTools.length);
      expect(workerFiltered.size).toBe(testTools.length - WORKER_BLOCKED_TOOLS.length);
    });
  });

  describe("agentLevel property", () => {
    it("should return the agent level", () => {
      const baseRegistry = createMockRegistry(testTools);

      const orchestrator = createFilteredToolRegistry(baseRegistry, AgentLevel.orchestrator);
      expect(orchestrator.agentLevel).toBe(AgentLevel.orchestrator);

      const workflow = createFilteredToolRegistry(baseRegistry, AgentLevel.workflow);
      expect(workflow.agentLevel).toBe(AgentLevel.workflow);

      const worker = createFilteredToolRegistry(baseRegistry, AgentLevel.worker);
      expect(worker.agentLevel).toBe(AgentLevel.worker);
    });
  });
});
