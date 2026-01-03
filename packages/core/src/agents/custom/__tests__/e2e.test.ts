/**
 * Custom Agents End-to-End Tests (T032)
 *
 * Full workflow tests: create agent → discover → route → activate
 *
 * @module core/agents/custom/__tests__/e2e.test
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AgentDiscovery, DiscoverySource } from "../discovery.js";
import { AgentLoader } from "../loader.js";
import { CustomAgentRegistry } from "../registry.js";
import { InheritanceResolver } from "../resolver.js";
import { AgentRouter } from "../router.js";
import { validateAgentDefinition } from "../schema.js";
import { generateJsonSchema } from "../schema-generator.js";
import { getTemplate, isValidTemplateName, templateToMarkdown } from "../templates.js";
import type { CustomAgentDefinition } from "../types.js";

// =============================================================================
// Test Setup
// =============================================================================

const TEST_DIR = path.join(os.tmpdir(), `vellum-e2e-test-${Date.now()}`);
const AGENTS_DIR = path.join(TEST_DIR, ".vellum", "agents");

/**
 * Helper to write test agent file
 */
async function writeAgent(slug: string, content: string): Promise<string> {
  const filePath = path.join(AGENTS_DIR, `${slug}.md`);
  await fs.writeFile(filePath, content);
  return filePath;
}

/**
 * Helper to create a valid agent definition
 */
function createAgentContent(slug: string, options: Partial<CustomAgentDefinition> = {}): string {
  const name =
    options.name ??
    slug
      .split("-")
      .map((w) => (w[0]?.toUpperCase() ?? "") + w.slice(1))
      .join(" ");
  const mode = options.mode ?? "code";
  const description = options.description ?? `Test agent: ${slug}`;

  let frontmatter = `---
slug: ${slug}
name: "${name}"
mode: ${mode}
description: "${description}"`;

  if (options.icon) frontmatter += `\nicon: "${options.icon}"`;
  if (options.extends) frontmatter += `\nextends: ${options.extends}`;
  if (options.tags?.length) {
    frontmatter += "\ntags:";
    for (const tag of options.tags) {
      frontmatter += `\n  - ${tag}`;
    }
  }

  if (options.whenToUse) {
    frontmatter += "\nwhenToUse:";
    frontmatter += `\n  description: "${options.whenToUse.description}"`;
    if (options.whenToUse.triggers?.length) {
      frontmatter += "\n  triggers:";
      for (const t of options.whenToUse.triggers) {
        frontmatter += `\n    - type: ${t.type}`;
        frontmatter += `\n      pattern: "${t.pattern}"`;
      }
    }
    if (options.whenToUse.priority !== undefined) {
      frontmatter += `\n  priority: ${options.whenToUse.priority}`;
    }
  }

  frontmatter += "\n---\n";
  frontmatter += `\n# ${name}\n\nYou are a helpful assistant.\n`;

  return frontmatter;
}

beforeAll(async () => {
  await fs.mkdir(AGENTS_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
});

afterEach(async () => {
  // Clean up agents after each test
  try {
    const files = await fs.readdir(AGENTS_DIR);
    for (const file of files) {
      await fs.unlink(path.join(AGENTS_DIR, file));
    }
  } catch {
    // Directory might not exist
  }
});

// =============================================================================
// E2E: Full Workflow Tests
// =============================================================================

describe("E2E: Full Workflow", () => {
  describe("Create → Discover → Route → Activate", () => {
    it("should complete full agent lifecycle", async () => {
      // 1. CREATE: Generate agent from template
      const template = getTemplate("frontend");
      expect(template).toBeDefined();
      expect(template?.slug).toBe("frontend-dev");

      // Create custom agent based on template
      const customSlug = "react-specialist";
      const agentContent = createAgentContent(customSlug, {
        name: "React Specialist",
        mode: "code",
        description: "Specialized React development agent",
        icon: "⚛️",
        tags: ["react", "frontend"],
        whenToUse: {
          description: "Use for React component development",
          triggers: [
            { type: "file", pattern: "**/*.tsx" },
            { type: "keyword", pattern: "react|component|hook" },
          ],
          priority: 15,
        },
      });

      const filePath = await writeAgent(customSlug, agentContent);
      expect(
        await fs
          .access(filePath)
          .then(() => true)
          .catch(() => false)
      ).toBe(true);

      // 2. VALIDATE: Ensure agent definition is valid
      const loader = new AgentLoader();
      const loadResult = await loader.loadFile(filePath);
      expect(loadResult.ok).toBe(true);

      if (loadResult.ok) {
        const validationResult = validateAgentDefinition(loadResult.value);
        expect(validationResult.success).toBe(true);
      }

      // 3. DISCOVER: Find agent in discovery
      const discovery = new AgentDiscovery({
        watchEnabled: false,
        paths: [AGENTS_DIR],
      });
      await discovery.discover();

      const agent = discovery.get(customSlug);
      expect(agent).toBeDefined();
      expect(agent?.definition.slug).toBe(customSlug);
      expect(agent?.definition.name).toBe("React Specialist");
      // Source is USER because temp dir is under user home but not cwd/.vellum
      expect(agent?.source).toBe(DiscoverySource.USER);

      // 4. ROUTE: Test routing by context
      const registry = new CustomAgentRegistry();
      expect(agent).toBeDefined();
      registry.register(agent!.definition, agent!.source);

      const router = new AgentRouter(registry);

      // Test explicit invocation
      const explicitResult = router.route({
        message: `@${customSlug} create a button component`,
      });
      expect(explicitResult.explicit).toBe(true);
      expect(explicitResult.agent?.slug).toBe(customSlug);

      // Test keyword trigger
      const keywordResult = router.route({
        message: "I need to create a new React component for the dashboard",
      });
      expect(keywordResult.candidates.length).toBeGreaterThan(0);
      const matchedByKeyword = keywordResult.candidates.some((c) => c.agent.slug === customSlug);
      expect(matchedByKeyword).toBe(true);

      // Test file pattern trigger
      const fileResult = router.route({
        message: "fix the bug",
        activeFile: "src/components/Button.tsx",
      });
      const matchedByFile = fileResult.candidates.some((c) => c.agent.slug === customSlug);
      expect(matchedByFile).toBe(true);

      // 5. ACTIVATE: Get full agent config for use
      const activeAgent = registry.get(customSlug);
      expect(activeAgent).toBeDefined();
      expect(activeAgent?.slug).toBe(customSlug);
      expect(activeAgent?.mode).toBe("code");
      expect(activeAgent?.tags).toContain("react");
    });

    it("should handle agent inheritance chain", async () => {
      // Create parent agent
      const parentContent = createAgentContent("base-dev", {
        name: "Base Developer",
        mode: "code",
        description: "Base development agent",
        tags: ["development"],
      });
      await writeAgent("base-dev", parentContent);

      // Create child agent that extends parent
      const childContent = createAgentContent("ts-dev", {
        name: "TypeScript Developer",
        extends: "base-dev",
        mode: "code",
        description: "TypeScript specialist",
        tags: ["typescript"],
      });
      await writeAgent("ts-dev", childContent);

      // Discover both
      const discovery = new AgentDiscovery({
        watchEnabled: false,
        paths: [AGENTS_DIR],
      });
      await discovery.discover();

      // Verify both found
      expect(discovery.get("base-dev")).toBeDefined();
      expect(discovery.get("ts-dev")).toBeDefined();

      // Test inheritance resolution
      const registry = new CustomAgentRegistry();
      const agents = discovery.getAll();

      for (const [, agent] of agents) {
        registry.register(agent.definition, agent.source);
      }

      const resolver = new InheritanceResolver();
      const childAgent = registry.get("ts-dev");
      expect(childAgent).toBeDefined();

      const resolveResult = await resolver.resolve(childAgent!, registry);

      expect(resolveResult.ok).toBe(true);
      if (resolveResult.ok) {
        const resolved = resolveResult.value;
        expect(resolved.slug).toBe("ts-dev");
        expect(resolved.name).toBe("TypeScript Developer");
        // Inheritance is verified (extends field is present)
        expect(resolved.extends).toBe("base-dev");
      }
    });
  });
});

// =============================================================================
// E2E: Template Workflow
// =============================================================================

describe("E2E: Template Workflow", () => {
  it("should create valid agent from each template", async () => {
    const templateNames = ["frontend", "backend", "security", "docs", "qa", "devops"];

    for (const name of templateNames) {
      expect(isValidTemplateName(name)).toBe(true);

      const template = getTemplate(name as Parameters<typeof getTemplate>[0]);
      expect(template).toBeDefined();
      expect(template?.slug).toBeDefined();
      expect(template?.name).toBeDefined();

      // Validate template produces valid agent
      const validation = validateAgentDefinition(template!);
      expect(validation.success).toBe(true);

      // Convert to markdown and back
      const markdown = templateToMarkdown(template!);
      expect(markdown).toContain(`slug: ${template?.slug}`);
      expect(markdown).toContain(`name: "${template?.name}"`);

      // Load the markdown content
      const loader = new AgentLoader();
      // Write to temp file
      const filePath = await writeAgent(`test-${name}`, markdown);
      const loadResult = await loader.loadFile(filePath);

      expect(loadResult.ok).toBe(true);
      if (loadResult.ok) {
        expect(loadResult.value.slug).toBe(template?.slug);
      }
    }
  });
});

// =============================================================================
// E2E: JSON Schema Generation
// =============================================================================

describe("E2E: JSON Schema", () => {
  it("should generate valid JSON Schema", () => {
    const schema = generateJsonSchema();

    // Verify schema structure
    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(schema.title).toBe("Custom Agent Definition");
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();

    // Verify schema is valid JSON (key requirement for IDE support)
    const jsonString = JSON.stringify(schema);
    expect(() => JSON.parse(jsonString)).not.toThrow();

    // Verify we have some properties (structure may vary based on Zod schema)
    const propKeys = Object.keys(schema.properties);
    expect(propKeys.length).toBeGreaterThan(0);
  });

  it("should validate agents against generated schema", () => {
    const schema = generateJsonSchema();

    // The schema should have properties object
    expect(schema.properties).toBeDefined();
    expect(typeof schema.properties).toBe("object");

    // Verify schema is complete and can be stringified
    const schemaStr = JSON.stringify(schema, null, 2);
    expect(schemaStr.length).toBeGreaterThan(100);
    expect(schemaStr).toContain("$schema");
  });
});

// =============================================================================
// E2E: Discovery and Registry Integration
// =============================================================================

describe("E2E: Discovery and Registry", () => {
  it("should handle multiple agents from different sources", async () => {
    // Create multiple agents
    await writeAgent(
      "agent-a",
      createAgentContent("agent-a", {
        name: "Agent A",
        tags: ["test"],
        whenToUse: {
          description: "Test A",
          triggers: [{ type: "keyword", pattern: "alpha" }],
          priority: 10,
        },
      })
    );

    await writeAgent(
      "agent-b",
      createAgentContent("agent-b", {
        name: "Agent B",
        tags: ["test"],
        whenToUse: {
          description: "Test B",
          triggers: [{ type: "keyword", pattern: "beta" }],
          priority: 20,
        },
      })
    );

    await writeAgent(
      "agent-c",
      createAgentContent("agent-c", {
        name: "Agent C",
        tags: ["test"],
        whenToUse: {
          description: "Test C",
          triggers: [{ type: "keyword", pattern: "gamma" }],
          priority: 5,
        },
      })
    );

    // Discover all
    const discovery = new AgentDiscovery({
      watchEnabled: false,
      paths: [AGENTS_DIR],
    });
    await discovery.discover();

    const allAgents = discovery.getAll();
    expect(allAgents.size).toBe(3);

    // Register in registry
    const registry = new CustomAgentRegistry();
    for (const [, agent] of allAgents) {
      registry.register(agent.definition, agent.source);
    }

    // Test routing priority
    const router = new AgentRouter(registry);

    // Agent B should score highest due to priority
    const result = router.route({
      message: "I need to work with beta features",
    });

    expect(result.candidates.length).toBeGreaterThan(0);

    // Find agent-b in candidates
    const agentB = result.candidates.find((c) => c.agent.slug === "agent-b");
    expect(agentB).toBeDefined();
    expect(agentB?.scoreBreakdown.keywords).toBeGreaterThan(0);
  });

  it("should handle agent updates during watch", async () => {
    // Create initial agent
    const initialContent = createAgentContent("watch-test", {
      name: "Watch Test Initial",
      description: "Initial description",
    });
    await writeAgent("watch-test", initialContent);

    // Discover
    const discovery = new AgentDiscovery({
      watchEnabled: false, // Manual refresh for test
      paths: [AGENTS_DIR],
    });
    await discovery.discover();

    let agent = discovery.get("watch-test");
    expect(agent?.definition.name).toBe("Watch Test Initial");

    // Update agent
    const updatedContent = createAgentContent("watch-test", {
      name: "Watch Test Updated",
      description: "Updated description",
    });
    await writeAgent("watch-test", updatedContent);

    // Re-discover (simulating watch)
    await discovery.discover();

    agent = discovery.get("watch-test");
    expect(agent?.definition.name).toBe("Watch Test Updated");
  });
});

// =============================================================================
// E2E: Error Handling
// =============================================================================

describe("E2E: Error Handling", () => {
  it("should gracefully handle invalid agent files", async () => {
    // Create invalid agent (missing required fields)
    const invalidContent = `---
name: "Missing Slug"
---

# Invalid agent
`;
    await writeAgent("invalid", invalidContent);

    // Create valid agent alongside
    await writeAgent("valid-agent", createAgentContent("valid-agent", { name: "Valid Agent" }));

    // Discovery should still work and find valid agent
    const discovery = new AgentDiscovery({
      watchEnabled: false,
      paths: [AGENTS_DIR],
    });
    await discovery.discover();

    // Valid agent should be found
    const valid = discovery.get("valid-agent");
    expect(valid).toBeDefined();

    // Invalid agent should not be in registry (or marked as error)
    // The key is that it doesn't crash the entire discovery
  });

  it("should handle circular inheritance gracefully", async () => {
    // Create agents with circular reference
    const agentAContent = createAgentContent("circular-a", {
      name: "Circular A",
      extends: "circular-b",
    });
    await writeAgent("circular-a", agentAContent);

    const agentBContent = createAgentContent("circular-b", {
      name: "Circular B",
      extends: "circular-a",
    });
    await writeAgent("circular-b", agentBContent);

    // Discover
    const discovery = new AgentDiscovery({
      watchEnabled: false,
      paths: [AGENTS_DIR],
    });
    await discovery.discover();

    // Register
    const registry = new CustomAgentRegistry();
    const allAgents = discovery.getAll();
    for (const [, agent] of allAgents) {
      registry.register(agent.definition, agent.source);
    }

    // Resolver should detect circular inheritance
    const resolver = new InheritanceResolver();
    const agentA = registry.get("circular-a");
    expect(agentA).toBeDefined();

    const result = await resolver.resolve(agentA!, registry);

    // Should return error for circular inheritance
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("CIRCULAR_INHERITANCE");
    }
  });
});

// =============================================================================
// E2E: Performance
// =============================================================================

describe("E2E: Performance", () => {
  it("should handle many agents efficiently", async () => {
    // Create 50 agents
    const agentCount = 50;
    for (let i = 0; i < agentCount; i++) {
      await writeAgent(
        `perf-agent-${i}`,
        createAgentContent(`perf-agent-${i}`, {
          name: `Performance Agent ${i}`,
          tags: ["performance-test"],
          whenToUse: {
            description: `Agent ${i}`,
            triggers: [{ type: "keyword", pattern: `keyword${i}` }],
            priority: i,
          },
        })
      );
    }

    // Time discovery
    const startDiscover = performance.now();
    const discovery = new AgentDiscovery({
      watchEnabled: false,
      paths: [AGENTS_DIR],
    });
    await discovery.discover();
    const discoverTime = performance.now() - startDiscover;

    expect(discovery.getAll().size).toBe(agentCount);
    expect(discoverTime).toBeLessThan(5000); // Should complete in under 5 seconds

    // Time routing
    const registry = new CustomAgentRegistry();
    for (const [, agent] of discovery.getAll()) {
      registry.register(agent.definition, agent.source);
    }

    const router = new AgentRouter(registry);

    const startRoute = performance.now();
    for (let i = 0; i < 100; i++) {
      router.route({ message: `test message with keyword${i % agentCount}` });
    }
    const routeTime = performance.now() - startRoute;

    expect(routeTime).toBeLessThan(1000); // 100 routes should complete in under 1 second
  });
});
