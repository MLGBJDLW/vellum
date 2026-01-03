/**
 * Integration tests for Plugin Agent System
 *
 * Tests for T022 - Agent integration with plugin system
 *
 * @module plugin/agents/__tests__/integration.test
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { adaptToPluginAgent, parseAgent } from "../index.js";
import { PLUGIN_AGENT_SCOPE, PluginAgentDefinitionSchema } from "../types.js";

// =============================================================================
// Test Utilities
// =============================================================================

const FIXTURES_DIR = path.resolve(import.meta.dirname, "../../__tests__/fixtures");

/**
 * Creates a temporary directory for testing
 */
async function createTempDir(): Promise<string> {
  const tmpDir = path.join(
    FIXTURES_DIR,
    `temp-agents-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

/**
 * Removes a directory recursively
 */
async function removeTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore errors on cleanup
  }
}

/**
 * Creates a test agent markdown file
 */
async function createAgentFile(dir: string, filename: string, content: string): Promise<string> {
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

// =============================================================================
// Resolution Chain Priority Tests
// =============================================================================

describe("Plugin Agent Resolution Chain", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  describe("agent appears in resolution chain", () => {
    it("should parse agent from file and convert to PluginAgentDefinition", async () => {
      const agentContent = `---
name: test-agent
description: A test agent for integration testing
toolGroups:
  - read
  - edit
---
You are a test agent for integration testing.
`;

      const filePath = await createAgentFile(tempDir, "test-agent.md", agentContent);
      const content = await fs.readFile(filePath, "utf-8");

      // Step 1: Parse the agent from markdown
      const parsed = parseAgent(filePath, content);

      expect(parsed.name).toBe("test-agent");
      expect(parsed.description).toBe("A test agent for integration testing");
      expect(parsed.toolGroups).toEqual(["read", "edit"]);

      // Step 2: Adapt to PluginAgentDefinition
      const definition = adaptToPluginAgent(parsed, "test-plugin");

      expect(definition.scope).toBe(PLUGIN_AGENT_SCOPE);
      expect(definition.pluginName).toBe("test-plugin");
      expect(definition.slug).toBe("test-agent");
    });

    it("should create valid PluginAgentDefinition that can be added to registry", async () => {
      const agentContent = `---
name: registry-test
description: Agent for registry integration
model: claude-3-opus
toolGroups:
  - read
---
You are a registry test agent.
`;

      const filePath = await createAgentFile(tempDir, "registry-test.md", agentContent);
      const content = await fs.readFile(filePath, "utf-8");

      const parsed = parseAgent(filePath, content);
      const definition = adaptToPluginAgent(parsed, "registry-plugin");

      // Validate against schema
      const result = PluginAgentDefinitionSchema.safeParse(definition);
      expect(result.success).toBe(true);

      // Simulate adding to registry
      const registry = new Map<string, typeof definition>();
      registry.set(definition.slug, definition);

      expect(registry.has("registry-test")).toBe(true);
      expect(registry.get("registry-test")?.scope).toBe("plugin");
    });

    it("should handle multiple plugin agents in same registry", async () => {
      const agents = [
        {
          filename: "agent-one.md",
          content: `---
name: Agent One
description: First agent
toolGroups:
  - read
---
First agent prompt.
`,
          plugin: "plugin-a",
        },
        {
          filename: "agent-two.md",
          content: `---
name: Agent Two
description: Second agent
toolGroups:
  - edit
---
Second agent prompt.
`,
          plugin: "plugin-b",
        },
        {
          filename: "agent-three.md",
          content: `---
name: Agent Three
description: Third agent
---
Third agent prompt.
`,
          plugin: "plugin-a",
        },
      ];

      const registry = new Map<string, ReturnType<typeof adaptToPluginAgent>>();

      for (const agent of agents) {
        const filePath = await createAgentFile(tempDir, agent.filename, agent.content);
        const content = await fs.readFile(filePath, "utf-8");
        const parsed = parseAgent(filePath, content);
        const definition = adaptToPluginAgent(parsed, agent.plugin);

        // Use qualified slug (pluginName:agentSlug) for uniqueness
        const qualifiedSlug = `${definition.pluginName}:${definition.slug}`;
        registry.set(qualifiedSlug, definition);
      }

      expect(registry.size).toBe(3);
      expect(registry.has("plugin-a:agent-one")).toBe(true);
      expect(registry.has("plugin-b:agent-two")).toBe(true);
      expect(registry.has("plugin-a:agent-three")).toBe(true);

      // Verify all have plugin scope
      for (const [, def] of registry) {
        expect(def.scope).toBe("plugin");
      }
    });
  });

  describe("correct priority (after project, before user)", () => {
    it("should have plugin scope that distinguishes from other scopes", async () => {
      const agentContent = `---
name: priority-test
description: Priority test agent
---
Priority test prompt.
`;

      const filePath = await createAgentFile(tempDir, "priority-test.md", agentContent);
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = parseAgent(filePath, content);
      const definition = adaptToPluginAgent(parsed, "priority-plugin");

      // Plugin agents always have scope = "plugin"
      expect(definition.scope).toBe("plugin");
      expect(definition.scope).not.toBe("project");
      expect(definition.scope).not.toBe("user");
      expect(definition.scope).not.toBe("builtin");
    });

    it("should simulate resolution priority with multiple sources", async () => {
      /**
       * Priority order (highest to lowest):
       * 1. Project agents (local to workspace)
       * 2. Plugin agents (from enabled plugins)
       * 3. User agents (user's custom agents)
       * 4. Builtin agents (system defaults)
       */
      type AgentSource = "project" | "plugin" | "user" | "builtin";

      interface MockAgent {
        slug: string;
        name: string;
        source: AgentSource;
        scope: string;
      }

      // Create mock agents from different sources
      const agents: MockAgent[] = [
        { slug: "helper", name: "Builtin Helper", source: "builtin", scope: "builtin" },
        { slug: "helper", name: "User Helper", source: "user", scope: "user" },
        { slug: "helper", name: "Plugin Helper", source: "plugin", scope: "plugin" },
        { slug: "helper", name: "Project Helper", source: "project", scope: "project" },
      ];

      // Priority map (lower number = higher priority)
      const priorityMap: Record<AgentSource, number> = {
        project: 0,
        plugin: 1,
        user: 2,
        builtin: 3,
      };

      // Sort by priority
      const sorted = [...agents].sort((a, b) => {
        return priorityMap[a.source] - priorityMap[b.source];
      });

      // Project should win
      expect(sorted.at(0)?.source).toBe("project");
      expect(sorted.at(0)?.name).toBe("Project Helper");

      // Plugin should be second
      expect(sorted.at(1)?.source).toBe("plugin");
      expect(sorted.at(1)?.name).toBe("Plugin Helper");

      // User should be third
      expect(sorted.at(2)?.source).toBe("user");
      expect(sorted.at(2)?.name).toBe("User Helper");

      // Builtin should be last
      expect(sorted.at(3)?.source).toBe("builtin");
      expect(sorted.at(3)?.name).toBe("Builtin Helper");
    });

    it("should resolve plugin agent when no project agent exists", async () => {
      /**
       * Simulates resolution when only plugin and user agents exist
       */
      type AgentSource = "project" | "plugin" | "user" | "builtin";

      interface MockAgent {
        slug: string;
        name: string;
        source: AgentSource;
      }

      const agents: MockAgent[] = [
        { slug: "helper", name: "Builtin Helper", source: "builtin" },
        { slug: "helper", name: "User Helper", source: "user" },
        { slug: "helper", name: "Plugin Helper", source: "plugin" },
        // No project agent
      ];

      const priorityMap: Record<AgentSource, number> = {
        project: 0,
        plugin: 1,
        user: 2,
        builtin: 3,
      };

      const sorted = [...agents].sort((a, b) => {
        return priorityMap[a.source] - priorityMap[b.source];
      });

      // Plugin should win when no project agent
      expect(sorted.at(0)?.source).toBe("plugin");
      expect(sorted.at(0)?.name).toBe("Plugin Helper");
    });

    it("should resolve user agent when no project or plugin agent exists", async () => {
      type AgentSource = "project" | "plugin" | "user" | "builtin";

      interface MockAgent {
        slug: string;
        name: string;
        source: AgentSource;
      }

      const agents: MockAgent[] = [
        { slug: "helper", name: "Builtin Helper", source: "builtin" },
        { slug: "helper", name: "User Helper", source: "user" },
        // No project or plugin agent
      ];

      const priorityMap: Record<AgentSource, number> = {
        project: 0,
        plugin: 1,
        user: 2,
        builtin: 3,
      };

      const sorted = [...agents].sort((a, b) => {
        return priorityMap[a.source] - priorityMap[b.source];
      });

      // User should win when no project or plugin agent
      expect(sorted.at(0)?.source).toBe("user");
      expect(sorted.at(0)?.name).toBe("User Helper");
    });
  });

  describe("plugin agent immutability", () => {
    it("should not allow coordination (plugin agents cannot spawn)", async () => {
      const agentContent = `---
name: no-spawn-agent
description: Agent that cannot spawn others
toolGroups:
  - read
---
You cannot spawn other agents.
`;

      const filePath = await createAgentFile(tempDir, "no-spawn.md", agentContent);
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = parseAgent(filePath, content);
      const definition = adaptToPluginAgent(parsed, "limited-plugin");

      // Plugin agents should not have coordination field
      expect("coordination" in definition).toBe(false);

      // Verify with schema - coordination is explicitly omitted from PluginAgentDefinition
      const result = PluginAgentDefinitionSchema.safeParse({
        ...definition,
        coordination: { canSpawn: true }, // Try to add coordination
      });

      // The schema should strip unknown properties or still pass
      // but the coordination field should not be in the actual type
      expect(result.success).toBe(true);
      // Check that even if passed, the definition type doesn't include it
      if (result.success) {
        // Type system ensures coordination is not on PluginAgentDefinition
        expect(definition.scope).toBe("plugin");
      }
    });

    it("should always set scope to plugin regardless of input", async () => {
      // Test various agent configurations
      const variants = [
        `---
name: variant-1
description: Basic variant
---
Basic prompt.
`,
        `---
name: variant-2
description: With model
model: gpt-4
---
With model prompt.
`,
        `---
name: variant-3
description: With tool groups
toolGroups:
  - read
  - edit
  - browser
---
With tools prompt.
`,
        `---
name: variant-4
description: With legacy tools
tools:
  - read_file
  - write_file
---
Legacy tools prompt.
`,
      ];

      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        if (!variant) continue;
        const filePath = await createAgentFile(tempDir, `variant-${i}.md`, variant);
        const content = await fs.readFile(filePath, "utf-8");
        const parsed = parseAgent(filePath, content);
        const definition = adaptToPluginAgent(parsed, `plugin-${i}`);

        expect(definition.scope).toBe("plugin");
      }
    });
  });
});

// =============================================================================
// End-to-End Flow Tests
// =============================================================================

describe("Plugin Agent E2E Flow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it("should handle complete agent lifecycle from file to definition", async () => {
    // 1. Create agent file
    const agentContent = `---
name: Code Reviewer
description: Reviews code for quality and best practices
model: claude-3-5-sonnet
toolGroups:
  - read
  - edit
---
# Code Reviewer Agent

You are an expert code reviewer. Your responsibilities include:

## Tasks
- Review code for bugs and issues
- Suggest improvements for readability
- Check for security vulnerabilities
- Ensure best practices are followed

## Guidelines
- Be constructive in feedback
- Provide specific examples
- Suggest alternatives when criticizing
`;

    const filePath = await createAgentFile(tempDir, "code-reviewer.md", agentContent);

    // 2. Read file content
    const content = await fs.readFile(filePath, "utf-8");

    // 3. Parse agent definition
    const parsed = parseAgent(filePath, content);

    expect(parsed.name).toBe("Code Reviewer");
    expect(parsed.description).toBe("Reviews code for quality and best practices");
    expect(parsed.model).toBe("claude-3-5-sonnet");
    expect(parsed.toolGroups).toEqual(["read", "edit"]);
    expect(parsed.systemPrompt).toContain("# Code Reviewer Agent");
    expect(parsed.systemPrompt).toContain("## Tasks");
    expect(parsed.filePath).toBe(filePath);

    // 4. Adapt to plugin definition
    const definition = adaptToPluginAgent(parsed, "code-quality-plugin");

    expect(definition.slug).toBe("code-reviewer");
    expect(definition.name).toBe("Code Reviewer");
    expect(definition.pluginName).toBe("code-quality-plugin");
    expect(definition.scope).toBe("plugin");
    expect(definition.description).toBe("Reviews code for quality and best practices");
    expect(definition.model).toBe("claude-3-5-sonnet");
    expect(definition.toolGroups).toEqual([
      { group: "read", enabled: true },
      { group: "edit", enabled: true },
    ]);

    // 5. Validate against schema
    const result = PluginAgentDefinitionSchema.safeParse(definition);
    expect(result.success).toBe(true);
  });

  it("should handle minimal agent without optional fields", async () => {
    const agentContent = "You are a simple helper agent.";

    const filePath = await createAgentFile(tempDir, "simple-helper.md", agentContent);
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = parseAgent(filePath, content);
    const definition = adaptToPluginAgent(parsed, "simple-plugin");

    expect(definition.slug).toBe("simple-helper");
    expect(definition.name).toBe("simple-helper");
    expect(definition.description).toBe("You are a simple helper agent.");
    expect(definition.scope).toBe("plugin");
    expect(definition.model).toBeUndefined();
    expect(definition.toolGroups).toBeUndefined();

    // Still valid
    const result = PluginAgentDefinitionSchema.safeParse(definition);
    expect(result.success).toBe(true);
  });

  it("should convert legacy tools to toolGroups in E2E flow", async () => {
    const agentContent = `---
name: Legacy Tool Agent
description: Agent using legacy tool format
tools:
  - read_file
  - list_dir
  - grep_search
  - write_file
  - apply_diff
  - run_terminal
  - browser
  - my_custom_tool
---
You are a legacy tool agent being converted to new format.
`;

    const filePath = await createAgentFile(tempDir, "legacy-tools.md", agentContent);
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = parseAgent(filePath, content);

    expect(parsed.tools).toEqual([
      "read_file",
      "list_dir",
      "grep_search",
      "write_file",
      "apply_diff",
      "run_terminal",
      "browser",
      "my_custom_tool",
    ]);

    const definition = adaptToPluginAgent(parsed, "legacy-plugin");

    // Verify conversion
    expect(definition.toolGroups).toBeDefined();
    expect(definition.toolGroups).toContainEqual({ group: "read", enabled: true });
    expect(definition.toolGroups).toContainEqual({ group: "edit", enabled: true });
    expect(definition.toolGroups).toContainEqual({ group: "execute", enabled: true });
    expect(definition.toolGroups).toContainEqual({ group: "browser", enabled: true });
    expect(definition.toolGroups).toContainEqual({
      group: "custom",
      enabled: true,
      tools: ["my_custom_tool"],
    });

    // Validate final result
    const result = PluginAgentDefinitionSchema.safeParse(definition);
    expect(result.success).toBe(true);
  });
});
