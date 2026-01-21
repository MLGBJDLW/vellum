// ============================================
// Worker Tool Bridge Tests
// ============================================

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentLevel } from "../../../agent/level.js";
import type { ToolRegistry } from "../../../tool/registry.js";
import type { Tool, ToolContext } from "../../../types/tool.js";
import type { FilteredToolRegistry } from "../../session/filtered-tool-registry.js";
import { WORKER_TOOL_SETS } from "../worker-executor.js";
import {
  createWorkerToolBridge,
  createWorkerToolExecutor,
  WorkerToolBridge,
} from "../worker-tool-bridge.js";

// ============================================
// Mock Helpers
// ============================================

function createMockTool(name: string, kind: string = "read"): Tool<z.ZodType, unknown> {
  return {
    definition: {
      name,
      description: `Mock ${name} tool`,
      parameters: z.object({ input: z.string() }),
      kind: kind as "read" | "write" | "shell" | "browser" | "lsp" | "mcp" | "task" | "agent",
      enabled: true,
    },
    execute: vi.fn().mockResolvedValue({ success: true, output: `${name} result` }),
  };
}

function createMockToolRegistry(tools: Tool<z.ZodType, unknown>[]): ToolRegistry {
  const toolMap = new Map<string, Tool<z.ZodType, unknown>>();
  for (const tool of tools) {
    toolMap.set(tool.definition.name.toLowerCase(), tool);
  }

  return {
    register: vi.fn(),
    get: (name: string) => toolMap.get(name.toLowerCase()),
    list: () => Array.from(toolMap.values()),
    listByKind: (kind: string) =>
      Array.from(toolMap.values()).filter((t) => t.definition.kind === kind),
    has: (name: string) => toolMap.has(name.toLowerCase()),
    getDefinitions: () =>
      Array.from(toolMap.values()).map((t) => ({
        name: t.definition.name,
        description: t.definition.description,
        parameters: {},
        kind: t.definition.kind,
      })),
    getOriginalName: (name: string) => name,
    size: toolMap.size,
    registerMcpTool: vi.fn(),
    unregisterMcpTools: vi.fn(),
    getMcpToolCount: vi.fn().mockReturnValue(0),
  } as unknown as ToolRegistry;
}

function createMockFilteredRegistry(
  tools: Tool<z.ZodType, unknown>[],
  blockedTools: string[] = [],
  agentLevel: AgentLevel = AgentLevel.worker
): FilteredToolRegistry {
  const baseRegistry = createMockToolRegistry(tools);
  const blockedSet = new Set(blockedTools.map((t) => t.toLowerCase()));

  return {
    get: (name: string) => {
      if (blockedSet.has(name.toLowerCase())) return undefined;
      return baseRegistry.get(name);
    },
    list: () => baseRegistry.list().filter((t) => !blockedSet.has(t.definition.name.toLowerCase())),
    isAllowed: (name: string) => !blockedSet.has(name.toLowerCase()),
    getBlocked: () => blockedTools,
    has: (name: string) => baseRegistry.has(name),
    getDefinitions: () =>
      baseRegistry.getDefinitions().filter((d) => !blockedSet.has(d.name.toLowerCase())),
    size: tools.length - blockedTools.length,
    agentLevel,
  } as FilteredToolRegistry;
}

function createMockToolContext(): ToolContext {
  return {
    workingDir: "/test",
    callId: "test-call-id",
    sessionId: "test-session",
    messageId: "test-message-id",
    abortSignal: new AbortController().signal,
    checkPermission: vi.fn().mockResolvedValue(true),
    agentLevel: AgentLevel.worker,
  };
}

// ============================================
// Tests
// ============================================

describe("WorkerToolBridge", () => {
  describe("createWorkerToolBridge", () => {
    it("should create a bridge for coder worker", () => {
      const tools = [
        createMockTool("read_file", "read"),
        createMockTool("write_file", "write"),
        createMockTool("search_files", "read"),
        createMockTool("bash", "shell"),
      ];

      const registry = createMockFilteredRegistry(tools);
      const bridge = createWorkerToolBridge({
        workerSlug: "coder",
        toolRegistry: registry,
      });

      expect(bridge).toBeInstanceOf(WorkerToolBridge);
      expect(bridge.getExecutor()).toBeDefined();
    });

    it("should throw error for non-worker level registry", () => {
      const tools = [createMockTool("read_file", "read")];
      const registry = createMockFilteredRegistry(tools, [], AgentLevel.workflow);

      expect(() =>
        createWorkerToolBridge({
          workerSlug: "coder",
          toolRegistry: registry,
        })
      ).toThrow(/worker-level registry/);
    });

    it("should only register tools allowed for the worker type", () => {
      // Create tools including some not in coder's allowed set
      const tools = [
        createMockTool("read_file", "read"),
        createMockTool("write_file", "write"),
        createMockTool("web_fetch", "network"), // Not in coder's set
        createMockTool("doc_lookup", "network"), // Not in coder's set
      ];

      const registry = createMockFilteredRegistry(tools);
      const bridge = createWorkerToolBridge({
        workerSlug: "coder",
        toolRegistry: registry,
      });

      const registeredTools = bridge.getRegisteredToolNames();

      expect(registeredTools).toContain("read_file");
      expect(registeredTools).toContain("write_file");
      expect(registeredTools).not.toContain("web_fetch");
      expect(registeredTools).not.toContain("doc_lookup");
    });
  });

  describe("validate", () => {
    it("should return valid when tools are available", () => {
      const tools = [createMockTool("read_file", "read"), createMockTool("write_file", "write")];

      const registry = createMockFilteredRegistry(tools);
      const bridge = createWorkerToolBridge({
        workerSlug: "coder",
        toolRegistry: registry,
      });

      const result = bridge.validate();

      expect(result.valid).toBe(true);
      expect(result.availableTools).toContain("read_file");
      expect(result.availableTools).toContain("write_file");
      expect(result.blockedTools).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it("should report blocked tools", () => {
      const tools = [
        createMockTool("read_file", "read"),
        createMockTool("delegate_task", "other"), // Should be blocked for workers
      ];

      // Block delegate_task (simulating level restriction)
      const registry = createMockFilteredRegistry(tools, ["delegate_task"]);
      const bridge = createWorkerToolBridge({
        workerSlug: "coder",
        toolRegistry: registry,
      });

      const result = bridge.validate();

      expect(result.valid).toBe(true); // Still valid because read_file is available
      expect(result.availableTools).toContain("read_file");
    });

    it("should report missing tools", () => {
      // Create registry with minimal tools (missing many in coder's set)
      const tools = [createMockTool("read_file", "read")];
      const registry = createMockFilteredRegistry(tools);
      const bridge = createWorkerToolBridge({
        workerSlug: "coder",
        toolRegistry: registry,
      });

      const result = bridge.validate();

      expect(result.valid).toBe(true);
      expect(result.availableTools).toContain("read_file");
      // Many tools in WORKER_TOOL_SETS.coder are missing
      expect(result.missingTools.length).toBeGreaterThan(0);
    });

    it("should return invalid when no tools are available", () => {
      // Create registry with no tools that match coder's set
      const tools = [createMockTool("some_other_tool", "other")];
      const registry = createMockFilteredRegistry(tools);
      const bridge = createWorkerToolBridge({
        workerSlug: "coder",
        toolRegistry: registry,
      });

      const result = bridge.validate();

      expect(result.valid).toBe(false);
      expect(result.error).toContain("No tools available");
    });
  });

  describe("hasTool", () => {
    it("should return true for registered tools", () => {
      const tools = [createMockTool("read_file", "read")];
      const registry = createMockFilteredRegistry(tools);
      const bridge = createWorkerToolBridge({
        workerSlug: "coder",
        toolRegistry: registry,
      });

      expect(bridge.hasTool("read_file")).toBe(true);
      expect(bridge.hasTool("READ_FILE")).toBe(true); // Case insensitive
    });

    it("should return false for unregistered tools", () => {
      const tools = [createMockTool("read_file", "read")];
      const registry = createMockFilteredRegistry(tools);
      const bridge = createWorkerToolBridge({
        workerSlug: "coder",
        toolRegistry: registry,
      });

      expect(bridge.hasTool("nonexistent_tool")).toBe(false);
    });
  });

  describe("execute", () => {
    it("should execute a tool through the bridge", async () => {
      const mockExecute = vi.fn().mockResolvedValue({
        success: true,
        output: "file contents",
      });

      const tools = [
        {
          ...createMockTool("read_file", "read"),
          execute: mockExecute,
        },
      ];

      const registry = createMockFilteredRegistry(tools);
      const bridge = createWorkerToolBridge({
        workerSlug: "coder",
        toolRegistry: registry,
      });

      const context = createMockToolContext();
      const result = await bridge.execute("read_file", { input: "test.txt" }, context);

      expect(result.result.success).toBe(true);
      expect(result.toolName).toBe("read_file");
    });

    it("should deny execution for blocked tools", async () => {
      const tools = [createMockTool("delegate_task", "agent"), createMockTool("read_file", "read")];

      // Block delegate_task
      const registry = createMockFilteredRegistry(tools, ["delegate_task"]);
      const bridge = createWorkerToolBridge({
        workerSlug: "coder",
        toolRegistry: registry,
      });

      // delegate_task shouldn't be registered at all
      expect(bridge.hasTool("delegate_task")).toBe(false);
    });
  });

  describe("worker tool sets", () => {
    it("analyst should have read-only tools", () => {
      const tools = [
        createMockTool("read_file", "read"),
        createMockTool("write_file", "write"),
        createMockTool("search_files", "read"),
        createMockTool("bash", "shell"),
      ];

      const registry = createMockFilteredRegistry(tools);
      const bridge = createWorkerToolBridge({
        workerSlug: "analyst",
        toolRegistry: registry,
      });

      const registeredTools = bridge.getRegisteredToolNames();

      expect(registeredTools).toContain("read_file");
      expect(registeredTools).toContain("search_files");
      expect(registeredTools).not.toContain("write_file");
      expect(registeredTools).not.toContain("bash");
    });

    it("researcher should have web access tools", () => {
      const tools = [
        createMockTool("read_file", "read"),
        createMockTool("web_fetch", "network"),
        createMockTool("web_search", "network"),
        createMockTool("doc_lookup", "network"),
      ];

      const registry = createMockFilteredRegistry(tools);
      const bridge = createWorkerToolBridge({
        workerSlug: "researcher",
        toolRegistry: registry,
      });

      const registeredTools = bridge.getRegisteredToolNames();

      expect(registeredTools).toContain("read_file");
      expect(registeredTools).toContain("web_fetch");
      expect(registeredTools).toContain("web_search");
      expect(registeredTools).toContain("doc_lookup");
    });
  });
});

describe("createWorkerToolExecutor", () => {
  it("should create a ToolExecutor directly", () => {
    const tools = [createMockTool("read_file", "read"), createMockTool("write_file", "write")];

    const registry = createMockFilteredRegistry(tools);
    const executor = createWorkerToolExecutor("coder", registry);

    expect(executor).toBeDefined();
    expect(executor.hasTool("read_file")).toBe(true);
    expect(executor.hasTool("write_file")).toBe(true);
  });

  it("should accept a permission checker", () => {
    const tools = [createMockTool("read_file", "read")];
    const registry = createMockFilteredRegistry(tools);

    const mockChecker = {
      checkPermission: vi.fn().mockResolvedValue("allow"),
    };

    const executor = createWorkerToolExecutor("coder", registry, mockChecker);

    expect(executor).toBeDefined();
    expect(executor.hasTool("read_file")).toBe(true);
  });
});

describe("WORKER_TOOL_SETS", () => {
  it("should block delegation tools for all worker types", () => {
    const delegationTools = ["delegate_task", "new_task"];

    for (const [_workerType, toolSet] of Object.entries(WORKER_TOOL_SETS)) {
      for (const delegationTool of delegationTools) {
        expect(toolSet).not.toContain(delegationTool);
      }
    }
  });

  it("read-only workers should not have write tools", () => {
    const readOnlyWorkers = ["analyst", "researcher", "security"];
    const writeTools = ["write_file", "bash", "shell", "smart_edit", "apply_diff"];

    for (const worker of readOnlyWorkers) {
      const toolSet = WORKER_TOOL_SETS[worker];
      for (const writeTool of writeTools) {
        expect(toolSet).not.toContain(writeTool);
      }
    }
  });
});
