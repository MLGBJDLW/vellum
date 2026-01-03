/**
 * Unit tests for Agent Adapter
 *
 * Tests for T021 - Agent adapter functionality
 *
 * @module plugin/agents/__tests__/adapter.test
 */

import { describe, expect, it } from "vitest";

import { adaptToPluginAgent, convertToolsToToolGroups, TOOL_TO_GROUP } from "../adapter.js";
import type { ParsedAgent } from "../parser.js";
import {
  PLUGIN_AGENT_SCOPE,
  type PluginAgentDefinition,
  PluginAgentDefinitionSchema,
} from "../types.js";

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Creates a minimal ParsedAgent for testing
 */
function createParsedAgent(overrides: Partial<ParsedAgent> = {}): ParsedAgent {
  return {
    name: "test-agent",
    description: "Test agent description",
    systemPrompt: "You are a test agent.",
    filePath: "/plugins/test-plugin/agents/test-agent.md",
    ...overrides,
  };
}

// =============================================================================
// TOOL_TO_GROUP Mapping Tests
// =============================================================================

describe("TOOL_TO_GROUP mapping", () => {
  it("should map read_file to read group", () => {
    expect(TOOL_TO_GROUP.read_file).toBe("read");
  });

  it("should map list_dir to read group", () => {
    expect(TOOL_TO_GROUP.list_dir).toBe("read");
  });

  it("should map grep_search to read group", () => {
    expect(TOOL_TO_GROUP.grep_search).toBe("read");
  });

  it("should map write_file to edit group", () => {
    expect(TOOL_TO_GROUP.write_file).toBe("edit");
  });

  it("should map apply_diff to edit group", () => {
    expect(TOOL_TO_GROUP.apply_diff).toBe("edit");
  });

  it("should map run_terminal to execute group", () => {
    expect(TOOL_TO_GROUP.run_terminal).toBe("execute");
  });

  it("should map browser to browser group", () => {
    expect(TOOL_TO_GROUP.browser).toBe("browser");
  });

  it("should map fetch to browser group", () => {
    expect(TOOL_TO_GROUP.fetch).toBe("browser");
  });
});

// =============================================================================
// convertToolsToToolGroups Tests
// =============================================================================

describe("convertToolsToToolGroups", () => {
  it("should convert known tools to groups", () => {
    const result = convertToolsToToolGroups(["read_file", "list_dir"]);
    expect(result.groups).toEqual(["read"]);
    expect(result.custom).toEqual([]);
  });

  it("should deduplicate groups when multiple tools map to same group", () => {
    const result = convertToolsToToolGroups(["read_file", "list_dir", "grep_search"]);
    expect(result.groups).toEqual(["read"]);
    expect(result.groups).toHaveLength(1);
  });

  it("should handle multiple different groups", () => {
    const result = convertToolsToToolGroups(["read_file", "write_file", "browser"]);
    expect(result.groups).toContain("read");
    expect(result.groups).toContain("edit");
    expect(result.groups).toContain("browser");
    expect(result.custom).toEqual([]);
  });

  it("should collect unknown tools as custom", () => {
    const result = convertToolsToToolGroups(["read_file", "my_custom_tool", "another_tool"]);
    expect(result.groups).toEqual(["read"]);
    expect(result.custom).toEqual(["my_custom_tool", "another_tool"]);
  });

  it("should handle only custom tools", () => {
    const result = convertToolsToToolGroups(["custom1", "custom2"]);
    expect(result.groups).toEqual([]);
    expect(result.custom).toEqual(["custom1", "custom2"]);
  });

  it("should handle empty array", () => {
    const result = convertToolsToToolGroups([]);
    expect(result.groups).toEqual([]);
    expect(result.custom).toEqual([]);
  });

  it("should preserve order for custom tools", () => {
    const result = convertToolsToToolGroups(["z_tool", "a_tool", "m_tool"]);
    expect(result.custom).toEqual(["z_tool", "a_tool", "m_tool"]);
  });
});

// =============================================================================
// adaptToPluginAgent Tests - PluginAgentDefinition Extension
// =============================================================================

describe("adaptToPluginAgent - PluginAgentDefinition extension", () => {
  it("should generate slug from name (lowercase, hyphenated)", () => {
    const parsed = createParsedAgent({ name: "Code Reviewer" });
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.slug).toBe("code-reviewer");
  });

  it("should handle names with special characters in slug generation", () => {
    const parsed = createParsedAgent({ name: "Test!@#Agent$%^" });
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.slug).toBe("test-agent");
  });

  it("should trim leading/trailing hyphens from slug", () => {
    const parsed = createParsedAgent({ name: "---My Agent---" });
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.slug).toBe("my-agent");
  });

  it("should set pluginName from parameter", () => {
    const parsed = createParsedAgent();
    const definition = adaptToPluginAgent(parsed, "my-awesome-plugin");
    expect(definition.pluginName).toBe("my-awesome-plugin");
  });

  it("should preserve filePath from parsed agent", () => {
    const parsed = createParsedAgent({ filePath: "/custom/path/agent.md" });
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.filePath).toBe("/custom/path/agent.md");
  });

  it("should preserve name from parsed agent", () => {
    const parsed = createParsedAgent({ name: "Original Name" });
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.name).toBe("Original Name");
  });

  it("should preserve description from parsed agent", () => {
    const parsed = createParsedAgent({ description: "Custom description here" });
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.description).toBe("Custom description here");
  });

  it("should preserve systemPrompt from parsed agent", () => {
    const parsed = createParsedAgent({ systemPrompt: "You are a specialized agent." });
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.systemPrompt).toBe("You are a specialized agent.");
  });

  it("should include model when specified", () => {
    const parsed = createParsedAgent({ model: "claude-3-opus" });
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.model).toBe("claude-3-opus");
  });

  it("should not include model when not specified", () => {
    const parsed = createParsedAgent({ model: undefined });
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.model).toBeUndefined();
  });
});

// =============================================================================
// adaptToPluginAgent Tests - scope: 'plugin' is Set
// =============================================================================

describe("adaptToPluginAgent - scope is set to plugin", () => {
  it("should set scope to 'plugin'", () => {
    const parsed = createParsedAgent();
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.scope).toBe("plugin");
  });

  it("should use PLUGIN_AGENT_SCOPE constant value", () => {
    const parsed = createParsedAgent();
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.scope).toBe(PLUGIN_AGENT_SCOPE);
  });

  it("should always set scope regardless of agent configuration", () => {
    const variants = [
      createParsedAgent({ name: "variant-1" }),
      createParsedAgent({ toolGroups: ["read"] }),
      createParsedAgent({ tools: ["read_file"] }),
      createParsedAgent({ model: "gpt-4" }),
    ];

    for (const parsed of variants) {
      const definition = adaptToPluginAgent(parsed, "test-plugin");
      expect(definition.scope).toBe("plugin");
    }
  });
});

// =============================================================================
// adaptToPluginAgent Tests - tools→toolGroups Conversion
// =============================================================================

describe("adaptToPluginAgent - tools to toolGroups conversion", () => {
  it("should convert toolGroups to ToolGroupEntry format", () => {
    const parsed = createParsedAgent({
      toolGroups: ["read", "edit"],
    });

    const definition = adaptToPluginAgent(parsed, "test-plugin");

    expect(definition.toolGroups).toEqual([
      { group: "read", enabled: true },
      { group: "edit", enabled: true },
    ]);
  });

  it("should convert legacy tools array to toolGroups", () => {
    const parsed = createParsedAgent({
      tools: ["read_file", "write_file"],
    });

    const definition = adaptToPluginAgent(parsed, "test-plugin");

    expect(definition.toolGroups).toBeDefined();
    expect(definition.toolGroups).toContainEqual({ group: "read", enabled: true });
    expect(definition.toolGroups).toContainEqual({ group: "edit", enabled: true });
  });

  it("should prefer toolGroups over tools when both present", () => {
    const parsed = createParsedAgent({
      toolGroups: ["browser"],
      tools: ["read_file", "write_file"],
    });

    const definition = adaptToPluginAgent(parsed, "test-plugin");

    // Should use toolGroups, not convert tools
    expect(definition.toolGroups).toEqual([{ group: "browser", enabled: true }]);
  });

  it("should add custom tools to custom group", () => {
    const parsed = createParsedAgent({
      tools: ["read_file", "my_custom_tool", "another_custom"],
    });

    const definition = adaptToPluginAgent(parsed, "test-plugin");

    expect(definition.toolGroups).toContainEqual({ group: "read", enabled: true });
    expect(definition.toolGroups).toContainEqual({
      group: "custom",
      enabled: true,
      tools: ["my_custom_tool", "another_custom"],
    });
  });

  it("should not create custom group when no custom tools", () => {
    const parsed = createParsedAgent({
      tools: ["read_file", "write_file", "browser"],
    });

    const definition = adaptToPluginAgent(parsed, "test-plugin");

    const customGroup = definition.toolGroups?.find((g) => g.group === "custom");
    expect(customGroup).toBeUndefined();
  });

  it("should not set toolGroups when neither toolGroups nor tools present", () => {
    const parsed = createParsedAgent({
      toolGroups: undefined,
      tools: undefined,
    });

    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.toolGroups).toBeUndefined();
  });

  it("should not set toolGroups when both are empty arrays", () => {
    const parsed = createParsedAgent({
      toolGroups: [],
      tools: [],
    });

    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.toolGroups).toBeUndefined();
  });
});

// =============================================================================
// adaptToPluginAgent Tests - Coordination Field Omission
// =============================================================================

describe("adaptToPluginAgent - coordination field is omitted", () => {
  it("should not include coordination field", () => {
    const parsed = createParsedAgent();
    const definition = adaptToPluginAgent(parsed, "test-plugin");

    // TypeScript will enforce this at compile time, but we test runtime behavior
    expect("coordination" in definition).toBe(false);
  });

  it("should produce definition without spawn capability", () => {
    const parsed = createParsedAgent({
      name: "Agent With Full Config",
      description: "Fully configured agent",
      model: "claude-3-opus",
      toolGroups: ["read", "edit", "browser"],
    });

    const definition = adaptToPluginAgent(parsed, "test-plugin");

    // Verify no coordination-related fields
    expect(definition).not.toHaveProperty("coordination");
    expect(definition).not.toHaveProperty("canSpawn");
    expect(definition).not.toHaveProperty("parentMode");
  });

  it("should only contain expected PluginAgentDefinition fields", () => {
    const parsed = createParsedAgent({
      name: "Complete Agent",
      description: "Full description",
      model: "claude-3-5-sonnet",
      systemPrompt: "Full system prompt",
      toolGroups: ["read"],
    });

    const definition = adaptToPluginAgent(parsed, "complete-plugin");

    // Verify expected fields are present
    expect(definition.slug).toBeDefined();
    expect(definition.name).toBeDefined();
    expect(definition.pluginName).toBeDefined();
    expect(definition.filePath).toBeDefined();
    expect(definition.scope).toBe("plugin");
    expect(definition.description).toBeDefined();
    expect(definition.systemPrompt).toBeDefined();
    expect(definition.model).toBeDefined();
    expect(definition.toolGroups).toBeDefined();

    // Verify plugin agents cannot coordinate
    const keys = Object.keys(definition);
    expect(keys).not.toContain("coordination");
  });
});

// =============================================================================
// adaptToPluginAgent Tests - Schema Validation
// =============================================================================

describe("adaptToPluginAgent - produces valid schema output", () => {
  it("should produce output that passes PluginAgentDefinitionSchema validation", () => {
    const parsed = createParsedAgent({
      name: "valid-agent",
      description: "A valid agent definition",
      model: "claude-3-opus",
      toolGroups: ["read", "edit"],
    });

    const definition = adaptToPluginAgent(parsed, "valid-plugin");
    const result = PluginAgentDefinitionSchema.safeParse(definition);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scope).toBe("plugin");
    }
  });

  it("should produce valid output with minimal configuration", () => {
    const parsed = createParsedAgent({
      name: "minimal",
      description: "Minimal agent",
      systemPrompt: "Basic prompt",
    });

    const definition = adaptToPluginAgent(parsed, "minimal-plugin");
    const result = PluginAgentDefinitionSchema.safeParse(definition);

    expect(result.success).toBe(true);
  });

  it("should produce valid output with legacy tools conversion", () => {
    const parsed = createParsedAgent({
      name: "legacy-tools-agent",
      description: "Agent with legacy tools",
      tools: ["read_file", "grep_search", "write_file", "custom_tool"],
    });

    const definition = adaptToPluginAgent(parsed, "legacy-plugin");
    const result = PluginAgentDefinitionSchema.safeParse(definition);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toolGroups).toBeDefined();
    }
  });
});

// =============================================================================
// adaptToPluginAgent Tests - Edge Cases
// =============================================================================

describe("adaptToPluginAgent - edge cases", () => {
  it("should handle empty name (generates empty slug)", () => {
    const parsed = createParsedAgent({ name: "" });
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.slug).toBe("");
    expect(definition.name).toBe("");
  });

  it("should handle name with only special characters", () => {
    const parsed = createParsedAgent({ name: "!@#$%^&*()" });
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.slug).toBe("");
  });

  it("should handle name with numbers", () => {
    const parsed = createParsedAgent({ name: "Agent2024" });
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.slug).toBe("agent2024");
  });

  it("should handle name with multiple spaces", () => {
    const parsed = createParsedAgent({ name: "My   Spaced   Agent" });
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.slug).toBe("my-spaced-agent");
  });

  it("should handle very long system prompts", () => {
    const longPrompt = "A".repeat(10000);
    const parsed = createParsedAgent({ systemPrompt: longPrompt });
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    expect(definition.systemPrompt).toBe(longPrompt);
  });

  it("should handle unicode in name", () => {
    const parsed = createParsedAgent({ name: "Agent-日本語" });
    const definition = adaptToPluginAgent(parsed, "test-plugin");
    // Unicode should be stripped, leaving only alphanumeric and converted to slug
    expect(definition.slug).toBe("agent");
  });

  it("should handle all supported tool groups", () => {
    const parsed = createParsedAgent({
      toolGroups: ["read", "edit", "browser", "execute"],
    });

    const definition = adaptToPluginAgent(parsed, "test-plugin");

    expect(definition.toolGroups).toHaveLength(4);
    expect(definition.toolGroups).toContainEqual({ group: "read", enabled: true });
    expect(definition.toolGroups).toContainEqual({ group: "edit", enabled: true });
    expect(definition.toolGroups).toContainEqual({ group: "browser", enabled: true });
    expect(definition.toolGroups).toContainEqual({ group: "execute", enabled: true });
  });
});

// =============================================================================
// Full Integration Tests
// =============================================================================

describe("adaptToPluginAgent - full integration", () => {
  it("should produce complete PluginAgentDefinition", () => {
    const parsed: ParsedAgent = {
      name: "Code Quality Reviewer",
      description: "Reviews code for quality issues and best practices",
      model: "claude-3-5-sonnet",
      toolGroups: ["read", "edit"],
      systemPrompt: `You are a code quality reviewer.

## Responsibilities
- Review code for bugs
- Suggest improvements
- Check for best practices`,
      filePath: "/plugins/quality-tools/agents/reviewer.md",
    };

    const definition = adaptToPluginAgent(parsed, "quality-tools");

    expect(definition).toMatchObject<PluginAgentDefinition>({
      slug: "code-quality-reviewer",
      name: "Code Quality Reviewer",
      pluginName: "quality-tools",
      filePath: "/plugins/quality-tools/agents/reviewer.md",
      scope: "plugin",
      description: "Reviews code for quality issues and best practices",
      model: "claude-3-5-sonnet",
      systemPrompt: expect.stringContaining("## Responsibilities"),
      toolGroups: [
        { group: "read", enabled: true },
        { group: "edit", enabled: true },
      ],
    });
  });

  it("should handle real-world legacy tools conversion", () => {
    const parsed: ParsedAgent = {
      name: "Full Stack Helper",
      description: "Helps with full stack development",
      tools: [
        "read_file",
        "list_dir",
        "grep_search",
        "write_file",
        "apply_diff",
        "run_terminal",
        "browser",
        "custom_linter",
      ],
      systemPrompt: "You are a full stack development assistant.",
      filePath: "/plugins/fullstack/agents/helper.md",
    };

    const definition = adaptToPluginAgent(parsed, "fullstack-plugin");

    expect(definition.toolGroups).toBeDefined();
    expect(definition.toolGroups).toContainEqual({ group: "read", enabled: true });
    expect(definition.toolGroups).toContainEqual({ group: "edit", enabled: true });
    expect(definition.toolGroups).toContainEqual({ group: "execute", enabled: true });
    expect(definition.toolGroups).toContainEqual({ group: "browser", enabled: true });
    expect(definition.toolGroups).toContainEqual({
      group: "custom",
      enabled: true,
      tools: ["custom_linter"],
    });
  });
});
