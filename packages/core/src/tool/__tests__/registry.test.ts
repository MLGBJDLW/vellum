// ============================================
// Tool Registry Tests - T010
// ============================================

import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool, ok, type ToolKind } from "../../types/tool.js";
import { createToolRegistry, type ToolRegistry } from "../registry.js";

// =============================================================================
// Test Fixtures
// =============================================================================

const readFileTool = defineTool({
  name: "read_file",
  description: "Read the contents of a file",
  parameters: z.object({
    path: z.string().describe("Path to the file"),
    encoding: z.string().optional().describe("File encoding"),
  }),
  kind: "read",
  async execute(input) {
    return ok({ content: `Contents of ${input.path}` });
  },
});

const writeFileTool = defineTool({
  name: "write_file",
  description: "Write content to a file",
  parameters: z.object({
    path: z.string().describe("Path to the file"),
    content: z.string().describe("Content to write"),
  }),
  kind: "write",
  async execute(input) {
    return ok({ path: input.path, bytesWritten: input.content.length });
  },
});

const shellTool = defineTool({
  name: "execute_command",
  description: "Execute a shell command",
  parameters: z.object({
    command: z.string().describe("Command to execute"),
    cwd: z.string().optional().describe("Working directory"),
  }),
  kind: "shell",
  async execute(input) {
    return ok({ stdout: `Executed: ${input.command}`, exitCode: 0 });
  },
});

const mcpTool = defineTool({
  name: "mcp_query",
  description: "Query via MCP protocol",
  parameters: z.object({
    query: z.string().describe("Query string"),
  }),
  kind: "mcp",
  async execute(input) {
    return ok({ result: input.query });
  },
});

const disabledTool = defineTool({
  name: "disabled_tool",
  description: "This tool is disabled",
  parameters: z.object({}),
  kind: "read",
  enabled: false,
  async execute() {
    return ok({});
  },
});

const mixedCaseTool = defineTool({
  name: "MyMixedCase_Tool",
  description: "Tool with mixed case name",
  parameters: z.object({
    value: z.number(),
  }),
  kind: "read",
  async execute(input) {
    return ok({ doubled: input.value * 2 });
  },
});

// =============================================================================
// T005: Factory Function Tests
// =============================================================================

describe("createToolRegistry", () => {
  it("should create an empty registry", () => {
    const registry = createToolRegistry();

    expect(registry).toBeDefined();
    expect(registry.size).toBe(0);
    expect(registry.list()).toHaveLength(0);
  });

  it("should return a ToolRegistry interface", () => {
    const registry = createToolRegistry();

    // Verify all methods exist
    expect(typeof registry.register).toBe("function");
    expect(typeof registry.get).toBe("function");
    expect(typeof registry.list).toBe("function");
    expect(typeof registry.listByKind).toBe("function");
    expect(typeof registry.has).toBe("function");
    expect(typeof registry.getDefinitions).toBe("function");
    expect(typeof registry.getOriginalName).toBe("function");
  });
});

// =============================================================================
// T005: Basic Registration Tests
// =============================================================================

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry();
  });

  describe("register", () => {
    it("should register a tool", () => {
      registry.register(readFileTool);

      expect(registry.size).toBe(1);
      expect(registry.has("read_file")).toBe(true);
    });

    it("should register multiple tools", () => {
      registry.register(readFileTool);
      registry.register(writeFileTool);
      registry.register(shellTool);

      expect(registry.size).toBe(3);
      expect(registry.has("read_file")).toBe(true);
      expect(registry.has("write_file")).toBe(true);
      expect(registry.has("execute_command")).toBe(true);
    });

    it("should allow re-registration (overwrite)", () => {
      registry.register(readFileTool);

      const updatedTool = defineTool({
        ...readFileTool.definition,
        description: "Updated description",
        execute: readFileTool.execute,
      });

      registry.register(updatedTool);

      expect(registry.size).toBe(1);
      const tool = registry.get("read_file");
      expect(tool?.definition.description).toBe("Updated description");
    });
  });

  // =============================================================================
  // T005: Basic Retrieval Tests
  // =============================================================================

  describe("get", () => {
    beforeEach(() => {
      registry.register(readFileTool);
      registry.register(writeFileTool);
    });

    it("should get a tool by name", () => {
      const tool = registry.get("read_file");

      expect(tool).toBe(readFileTool);
    });

    it("should return undefined for unknown tool", () => {
      const tool = registry.get("nonexistent");

      expect(tool).toBeUndefined();
    });
  });

  // =============================================================================
  // T006: Case-Insensitive Lookup Tests
  // =============================================================================

  describe("case-insensitive lookup", () => {
    beforeEach(() => {
      registry.register(readFileTool);
      registry.register(mixedCaseTool);
    });

    it("should find tool with uppercase name", () => {
      expect(registry.get("READ_FILE")).toBe(readFileTool);
    });

    it("should find tool with mixed case name", () => {
      expect(registry.get("Read_File")).toBe(readFileTool);
    });

    it("should find tool with lowercase name", () => {
      expect(registry.get("read_file")).toBe(readFileTool);
    });

    it("should find mixed-case tool with any casing", () => {
      expect(registry.get("MYMIXEDCASE_TOOL")).toBe(mixedCaseTool);
      expect(registry.get("mymixedcase_tool")).toBe(mixedCaseTool);
      expect(registry.get("MyMixedCase_Tool")).toBe(mixedCaseTool);
    });

    it("has() should be case-insensitive", () => {
      expect(registry.has("READ_FILE")).toBe(true);
      expect(registry.has("Read_File")).toBe(true);
      expect(registry.has("read_file")).toBe(true);
    });

    it("should preserve original name", () => {
      expect(registry.getOriginalName("read_file")).toBe("read_file");
      expect(registry.getOriginalName("READ_FILE")).toBe("read_file");
      expect(registry.getOriginalName("mymixedcase_tool")).toBe("MyMixedCase_Tool");
    });

    it("should return input for unknown tool name", () => {
      expect(registry.getOriginalName("unknown")).toBe("unknown");
    });
  });

  // =============================================================================
  // T005: List Tests
  // =============================================================================

  describe("list", () => {
    it("should return empty array for empty registry", () => {
      expect(registry.list()).toHaveLength(0);
    });

    it("should return all registered tools", () => {
      registry.register(readFileTool);
      registry.register(writeFileTool);
      registry.register(shellTool);

      const tools = registry.list();

      expect(tools).toHaveLength(3);
      expect(tools).toContain(readFileTool);
      expect(tools).toContain(writeFileTool);
      expect(tools).toContain(shellTool);
    });
  });

  // =============================================================================
  // T006: listByKind Tests
  // =============================================================================

  describe("listByKind", () => {
    beforeEach(() => {
      registry.register(readFileTool);
      registry.register(writeFileTool);
      registry.register(shellTool);
      registry.register(mcpTool);
    });

    it("should return tools of specified kind", () => {
      const readTools = registry.listByKind("read");

      expect(readTools).toHaveLength(1);
      expect(readTools[0]).toBe(readFileTool);
    });

    it("should return write tools", () => {
      const writeTools = registry.listByKind("write");

      expect(writeTools).toHaveLength(1);
      expect(writeTools[0]).toBe(writeFileTool);
    });

    it("should return shell tools", () => {
      const shellTools = registry.listByKind("shell");

      expect(shellTools).toHaveLength(1);
      expect(shellTools[0]).toBe(shellTool);
    });

    it("should return mcp tools", () => {
      const mcpTools = registry.listByKind("mcp");

      expect(mcpTools).toHaveLength(1);
      expect(mcpTools[0]).toBe(mcpTool);
    });

    it("should return empty array for kind with no tools", () => {
      const agentTools = registry.listByKind("agent");

      expect(agentTools).toHaveLength(0);
    });

    it("should return multiple tools of same kind", () => {
      const anotherReadTool = defineTool({
        name: "list_files",
        description: "List files in directory",
        parameters: z.object({ path: z.string() }),
        kind: "read",
        async execute() {
          return ok({ files: [] });
        },
      });

      registry.register(anotherReadTool);

      const readTools = registry.listByKind("read");

      expect(readTools).toHaveLength(2);
      expect(readTools).toContain(readFileTool);
      expect(readTools).toContain(anotherReadTool);
    });
  });

  // =============================================================================
  // T007: getDefinitions Tests
  // =============================================================================

  describe("getDefinitions", () => {
    beforeEach(() => {
      registry.register(readFileTool);
      registry.register(writeFileTool);
      registry.register(shellTool);
      registry.register(disabledTool);
    });

    it("should return LLM-compatible definitions", () => {
      const definitions = registry.getDefinitions();

      // Should exclude disabled tool by default
      expect(definitions).toHaveLength(3);
    });

    it("should have correct structure for each definition", () => {
      const definitions = registry.getDefinitions();
      const readDef = definitions.find((d) => d.name === "read_file");

      expect(readDef).toBeDefined();
      expect(readDef?.name).toBe("read_file");
      expect(readDef?.description).toBe("Read the contents of a file");
      expect(readDef?.kind).toBe("read");
      expect(readDef?.parameters).toBeDefined();
    });

    it("should convert Zod schema to JSON Schema", () => {
      const definitions = registry.getDefinitions();
      const readDef = definitions.find((d) => d.name === "read_file");

      expect(readDef).toBeDefined();
      expect(readDef?.parameters).toHaveProperty("type", "object");
      expect(readDef?.parameters).toHaveProperty("properties");

      const props = readDef?.parameters.properties as Record<string, unknown>;
      expect(props).toHaveProperty("path");
      expect(props).toHaveProperty("encoding");
    });

    it("should filter by kind", () => {
      const definitions = registry.getDefinitions({ kinds: ["read"] });

      expect(definitions).toHaveLength(1);
      expect(definitions[0]?.name).toBe("read_file");
    });

    it("should filter by multiple kinds", () => {
      const definitions = registry.getDefinitions({ kinds: ["read", "write"] });

      expect(definitions).toHaveLength(2);
      expect(definitions.map((d) => d.kind)).toContain("read");
      expect(definitions.map((d) => d.kind)).toContain("write");
    });

    it("should include disabled tools when enabledOnly is false", () => {
      const definitions = registry.getDefinitions({ enabledOnly: false });

      expect(definitions).toHaveLength(4);
      expect(definitions.map((d) => d.name)).toContain("disabled_tool");
    });

    it("should exclude disabled tools by default", () => {
      const definitions = registry.getDefinitions();

      expect(definitions.map((d) => d.name)).not.toContain("disabled_tool");
    });

    it("should combine kind and enabledOnly filters", () => {
      registry.register(
        defineTool({
          name: "disabled_read",
          description: "Disabled read tool",
          parameters: z.object({}),
          kind: "read",
          enabled: false,
          async execute() {
            return ok({});
          },
        })
      );

      const definitions = registry.getDefinitions({ kinds: ["read"], enabledOnly: true });

      expect(definitions).toHaveLength(1);
      expect(definitions[0]?.name).toBe("read_file");
    });
  });

  // =============================================================================
  // T010: Additional Coverage Tests
  // =============================================================================

  describe("size property", () => {
    it("should return 0 for empty registry", () => {
      expect(registry.size).toBe(0);
    });

    it("should update when tools are registered", () => {
      registry.register(readFileTool);
      expect(registry.size).toBe(1);

      registry.register(writeFileTool);
      expect(registry.size).toBe(2);
    });

    it("should not increase on re-registration", () => {
      registry.register(readFileTool);
      registry.register(readFileTool);

      expect(registry.size).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("should handle empty tool name", () => {
      const emptyNameTool = defineTool({
        name: "",
        description: "Empty name tool",
        parameters: z.object({}),
        kind: "read",
        async execute() {
          return ok({});
        },
      });

      registry.register(emptyNameTool);

      expect(registry.has("")).toBe(true);
      expect(registry.get("")).toBe(emptyNameTool);
    });

    it("should handle special characters in tool name", () => {
      const specialTool = defineTool({
        name: "tool-with_special.chars",
        description: "Special chars tool",
        parameters: z.object({}),
        kind: "read",
        async execute() {
          return ok({});
        },
      });

      registry.register(specialTool);

      expect(registry.has("tool-with_special.chars")).toBe(true);
      expect(registry.has("TOOL-WITH_SPECIAL.CHARS")).toBe(true);
    });

    it("should handle unicode tool names", () => {
      const unicodeTool = defineTool({
        name: "tool_文件",
        description: "Unicode name tool",
        parameters: z.object({}),
        kind: "read",
        async execute() {
          return ok({});
        },
      });

      registry.register(unicodeTool);

      expect(registry.has("tool_文件")).toBe(true);
    });

    it("should return empty definitions for empty registry", () => {
      const definitions = registry.getDefinitions();

      expect(definitions).toHaveLength(0);
    });

    it("should return empty array when filtering by non-existent kind", () => {
      registry.register(readFileTool);

      const definitions = registry.getDefinitions({ kinds: ["browser" as ToolKind] });

      expect(definitions).toHaveLength(0);
    });
  });
});
