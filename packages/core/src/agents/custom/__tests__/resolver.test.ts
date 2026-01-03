import { beforeEach, describe, expect, it } from "vitest";
import {
  createInheritanceResolver,
  getInheritanceDepth,
  hasNoCycles,
  InheritanceResolver,
  MAX_INHERITANCE_DEPTH,
} from "../resolver.js";
import type { CustomAgentDefinition } from "../types.js";

// ============================================
// InheritanceResolver Tests (T013)
// ============================================

/**
 * Helper to create a minimal agent definition.
 */
function createAgent(
  slug: string,
  overrides: Partial<CustomAgentDefinition> = {}
): CustomAgentDefinition {
  return {
    slug,
    name: `Agent ${slug}`,
    ...overrides,
  };
}

/**
 * Helper to create a registry from agent definitions.
 */
function createRegistry(agents: CustomAgentDefinition[]): Map<string, CustomAgentDefinition> {
  const registry = new Map<string, CustomAgentDefinition>();
  for (const agent of agents) {
    registry.set(agent.slug, agent);
  }
  return registry;
}

describe("InheritanceResolver", () => {
  let resolver: InheritanceResolver;

  beforeEach(() => {
    resolver = new InheritanceResolver();
  });

  // ============================================
  // Single Inheritance Tests
  // ============================================

  describe("single inheritance", () => {
    it("resolves agent without inheritance", async () => {
      const agent = createAgent("standalone", {
        mode: "code",
        description: "Standalone agent",
      });
      const registry = createRegistry([agent]);

      const result = await resolver.resolve(agent, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.slug).toBe("standalone");
        expect(result.value.mode).toBe("code");
        expect(result.value.inheritanceChain).toEqual(["standalone"]);
        expect(result.value.isResolved).toBe(true);
      }
    });

    it("resolves single-level inheritance", async () => {
      const parent = createAgent("parent", {
        mode: "code",
        description: "Parent agent",
        settings: { temperature: 0.5 },
      });
      const child = createAgent("child", {
        extends: "parent",
        description: "Child agent",
      });
      const registry = createRegistry([parent, child]);

      const result = await resolver.resolve(child, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.slug).toBe("child");
        expect(result.value.mode).toBe("code"); // Inherited
        expect(result.value.description).toBe("Child agent"); // Overridden
        expect(result.value.settings?.temperature).toBe(0.5); // Inherited
        expect(result.value.inheritanceChain).toEqual(["child", "parent"]);
      }
    });

    it("child overrides parent properties", async () => {
      const parent = createAgent("parent", {
        mode: "plan",
        icon: "📝",
        settings: { temperature: 0.5, extendedThinking: true },
      });
      const child = createAgent("child", {
        extends: "parent",
        mode: "code",
        settings: { temperature: 0.7 },
      });
      const registry = createRegistry([parent, child]);

      const result = await resolver.resolve(child, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mode).toBe("code"); // Child override
        expect(result.value.icon).toBe("📝"); // From parent
        expect(result.value.settings?.temperature).toBe(0.7); // Child override
        expect(result.value.settings?.extendedThinking).toBe(true); // From parent
      }
    });
  });

  // ============================================
  // Multi-Level Inheritance Tests
  // ============================================

  describe("multi-level inheritance", () => {
    it("resolves two-level inheritance chain", async () => {
      const grandparent = createAgent("grandparent", {
        mode: "code",
        settings: { temperature: 0.3 },
      });
      const parent = createAgent("parent", {
        extends: "grandparent",
        icon: "🔧",
      });
      const child = createAgent("child", {
        extends: "parent",
        description: "Final child",
      });
      const registry = createRegistry([grandparent, parent, child]);

      const result = await resolver.resolve(child, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.slug).toBe("child");
        expect(result.value.mode).toBe("code"); // From grandparent
        expect(result.value.icon).toBe("🔧"); // From parent
        expect(result.value.description).toBe("Final child"); // From child
        expect(result.value.settings?.temperature).toBe(0.3); // From grandparent
        expect(result.value.inheritanceChain).toEqual(["child", "parent", "grandparent"]);
      }
    });

    it("resolves three-level inheritance chain", async () => {
      const level0 = createAgent("level0", { mode: "plan" });
      const level1 = createAgent("level1", { extends: "level0", icon: "1️⃣" });
      const level2 = createAgent("level2", { extends: "level1", icon: "2️⃣" });
      const level3 = createAgent("level3", { extends: "level2", description: "Deep" });
      const registry = createRegistry([level0, level1, level2, level3]);

      const result = await resolver.resolve(level3, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mode).toBe("plan"); // From level0
        expect(result.value.icon).toBe("2️⃣"); // Latest override (level2)
        expect(result.value.description).toBe("Deep"); // From level3
        expect(result.value.inheritanceChain).toHaveLength(4);
      }
    });

    it("correctly merges through multiple levels", async () => {
      const base = createAgent("base", {
        settings: { temperature: 0.1, streamOutput: true },
        tags: ["base"],
      });
      const mid = createAgent("mid", {
        extends: "base",
        settings: { temperature: 0.5 },
        tags: ["mid"],
      });
      const top = createAgent("top", {
        extends: "mid",
        settings: { autoConfirm: true },
        tags: ["top"],
      });
      const registry = createRegistry([base, mid, top]);

      const result = await resolver.resolve(top, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Settings should be deep merged
        expect(result.value.settings?.temperature).toBe(0.5); // Mid override
        expect(result.value.settings?.streamOutput).toBe(true); // From base
        expect(result.value.settings?.autoConfirm).toBe(true); // From top
        // Tags should be concatenated
        expect(result.value.tags).toEqual(["base", "mid", "top"]);
      }
    });
  });

  // ============================================
  // Circular Detection Tests
  // ============================================

  describe("circular detection", () => {
    it("detects direct circular reference (A -> A)", async () => {
      const agent = createAgent("self-ref", {
        extends: "self-ref",
      });
      const registry = createRegistry([agent]);

      const result = await resolver.resolve(agent, registry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("CIRCULAR_INHERITANCE");
        expect(result.error.chain).toContain("self-ref");
      }
    });

    it("detects two-way circular reference (A -> B -> A)", async () => {
      const agentA = createAgent("agent-a", { extends: "agent-b" });
      const agentB = createAgent("agent-b", { extends: "agent-a" });
      const registry = createRegistry([agentA, agentB]);

      const result = await resolver.resolve(agentA, registry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("CIRCULAR_INHERITANCE");
        expect(result.error.message).toContain("Circular inheritance");
      }
    });

    it("detects three-way circular reference (A -> B -> C -> A)", async () => {
      const agentA = createAgent("agent-a", { extends: "agent-b" });
      const agentB = createAgent("agent-b", { extends: "agent-c" });
      const agentC = createAgent("agent-c", { extends: "agent-a" });
      const registry = createRegistry([agentA, agentB, agentC]);

      const result = await resolver.resolve(agentA, registry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("CIRCULAR_INHERITANCE");
        expect(result.error.chain).toEqual(
          expect.arrayContaining(["agent-a", "agent-b", "agent-c"])
        );
      }
    });

    it("detects cycle in middle of chain", async () => {
      const start = createAgent("start", { extends: "middle" });
      const middle = createAgent("middle", { extends: "end" });
      const end = createAgent("end", { extends: "middle" }); // Cycle here
      const registry = createRegistry([start, middle, end]);

      const result = await resolver.resolve(start, registry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("CIRCULAR_INHERITANCE");
      }
    });
  });

  // ============================================
  // Max Depth Enforcement Tests
  // ============================================

  describe("max depth enforcement", () => {
    it("enforces maximum inheritance depth", async () => {
      // Create chain of MAX_INHERITANCE_DEPTH + 2 agents
      const agents: CustomAgentDefinition[] = [];
      for (let i = 0; i <= MAX_INHERITANCE_DEPTH + 1; i++) {
        agents.push(
          createAgent(`level-${i}`, {
            extends: i > 0 ? `level-${i - 1}` : undefined,
          })
        );
      }
      const registry = createRegistry(agents);

      // Try to resolve the deepest agent
      const deepestAgent = agents[agents.length - 1];
      const result = await resolver.resolve(deepestAgent!, registry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("MAX_DEPTH_EXCEEDED");
        expect(result.error.message).toContain(String(MAX_INHERITANCE_DEPTH));
      }
    });

    it("allows chains at exactly max depth", async () => {
      // Create chain of exactly MAX_INHERITANCE_DEPTH agents
      const agents: CustomAgentDefinition[] = [];
      for (let i = 0; i < MAX_INHERITANCE_DEPTH; i++) {
        agents.push(
          createAgent(`level-${i}`, {
            extends: i > 0 ? `level-${i - 1}` : undefined,
          })
        );
      }
      const registry = createRegistry(agents);

      const deepestAgent = agents[agents.length - 1];
      const result = await resolver.resolve(deepestAgent!, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.inheritanceChain).toHaveLength(MAX_INHERITANCE_DEPTH);
      }
    });
  });

  // ============================================
  // Deep Merge Behavior Tests
  // ============================================

  describe("deep merge behavior", () => {
    it("concatenates arrays (child after parent)", async () => {
      const parent = createAgent("parent", {
        tags: ["parent-tag-1", "parent-tag-2"],
        toolGroups: [{ group: "filesystem", enabled: true }],
      });
      const child = createAgent("child", {
        extends: "parent",
        tags: ["child-tag"],
        toolGroups: [{ group: "shell", enabled: false }],
      });
      const registry = createRegistry([parent, child]);

      const result = await resolver.resolve(child, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tags).toEqual(["parent-tag-1", "parent-tag-2", "child-tag"]);
        expect(result.value.toolGroups).toHaveLength(2);
        expect(result.value.toolGroups?.[0]?.group).toBe("filesystem");
        expect(result.value.toolGroups?.[1]?.group).toBe("shell");
      }
    });

    it("deep merges nested objects", async () => {
      const parent = createAgent("parent", {
        settings: {
          temperature: 0.5,
          streamOutput: true,
          extendedThinking: false,
        },
        restrictions: {
          maxTokens: 4096,
          timeout: 300000,
        },
      });
      const child = createAgent("child", {
        extends: "parent",
        settings: {
          temperature: 0.7,
          autoConfirm: true,
        },
        restrictions: {
          timeout: 600000,
        },
      });
      const registry = createRegistry([parent, child]);

      const result = await resolver.resolve(child, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Settings merged
        expect(result.value.settings?.temperature).toBe(0.7); // Child
        expect(result.value.settings?.streamOutput).toBe(true); // Parent
        expect(result.value.settings?.extendedThinking).toBe(false); // Parent
        expect(result.value.settings?.autoConfirm).toBe(true); // Child

        // Restrictions merged
        expect(result.value.restrictions?.maxTokens).toBe(4096); // Parent
        expect(result.value.restrictions?.timeout).toBe(600000); // Child override
      }
    });

    it("child primitives override parent primitives", async () => {
      const parent = createAgent("parent", {
        mode: "plan",
        icon: "📝",
        hidden: true,
        model: "gpt-4",
      });
      const child = createAgent("child", {
        extends: "parent",
        mode: "code",
        icon: "🔧",
      });
      const registry = createRegistry([parent, child]);

      const result = await resolver.resolve(child, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mode).toBe("code"); // Child
        expect(result.value.icon).toBe("🔧"); // Child
        expect(result.value.hidden).toBe(true); // Parent (not overridden)
        expect(result.value.model).toBe("gpt-4"); // Parent
      }
    });

    it("handles null and undefined values correctly", async () => {
      const parent = createAgent("parent", {
        description: "Parent description",
        settings: { temperature: 0.5 },
      });
      const child = createAgent("child", {
        extends: "parent",
        description: undefined, // Should not override
      });
      const registry = createRegistry([parent, child]);

      const result = await resolver.resolve(child, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.description).toBe("Parent description");
      }
    });

    it("merges coordination settings correctly", async () => {
      const parent = createAgent("parent", {
        coordination: {
          canSpawnAgents: ["agent-a", "agent-b"],
          maxConcurrentSubagents: 3,
        },
      });
      const child = createAgent("child", {
        extends: "parent",
        coordination: {
          canSpawnAgents: ["agent-c"],
          parentMode: "orchestrator",
        },
      });
      const registry = createRegistry([parent, child]);

      const result = await resolver.resolve(child, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.coordination?.canSpawnAgents).toEqual([
          "agent-a",
          "agent-b",
          "agent-c",
        ]);
        expect(result.value.coordination?.maxConcurrentSubagents).toBe(3);
        expect(result.value.coordination?.parentMode).toBe("orchestrator");
      }
    });
  });

  // ============================================
  // Error Cases
  // ============================================

  describe("error cases", () => {
    it("returns error when parent not found", async () => {
      const child = createAgent("orphan", {
        extends: "non-existent-parent",
      });
      const registry = createRegistry([child]);

      const result = await resolver.resolve(child, registry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("NOT_FOUND");
        expect(result.error.message).toContain("non-existent-parent");
      }
    });

    it("returns error when parent in chain not found", async () => {
      const grandparent = createAgent("grandparent", {
        extends: "missing-ancestor",
      });
      const parent = createAgent("parent", { extends: "grandparent" });
      const child = createAgent("child", { extends: "parent" });
      const registry = createRegistry([grandparent, parent, child]);

      const result = await resolver.resolve(child, registry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("NOT_FOUND");
        expect(result.error.message).toContain("missing-ancestor");
      }
    });
  });

  // ============================================
  // Utility Function Tests
  // ============================================

  describe("utility functions", () => {
    describe("hasNoCycles", () => {
      it("returns true for chain without cycles", () => {
        expect(hasNoCycles(["a", "b", "c"])).toBe(true);
        expect(hasNoCycles(["single"])).toBe(true);
        expect(hasNoCycles([])).toBe(true);
      });

      it("returns false for chain with cycles", () => {
        expect(hasNoCycles(["a", "b", "a"])).toBe(false);
        expect(hasNoCycles(["a", "a"])).toBe(false);
        expect(hasNoCycles(["x", "y", "z", "y"])).toBe(false);
      });
    });

    describe("getInheritanceDepth", () => {
      it("returns 0 for agent without parent", () => {
        const agent = createAgent("standalone");
        const registry = createRegistry([agent]);

        expect(getInheritanceDepth(agent, registry)).toBe(0);
      });

      it("returns correct depth for inheritance chain", () => {
        const grandparent = createAgent("grandparent");
        const parent = createAgent("parent", { extends: "grandparent" });
        const child = createAgent("child", { extends: "parent" });
        const registry = createRegistry([grandparent, parent, child]);

        expect(getInheritanceDepth(child, registry)).toBe(2);
        expect(getInheritanceDepth(parent, registry)).toBe(1);
        expect(getInheritanceDepth(grandparent, registry)).toBe(0);
      });

      it("stops at max depth for very deep chains", () => {
        const agents: CustomAgentDefinition[] = [];
        for (let i = 0; i < 20; i++) {
          agents.push(
            createAgent(`level-${i}`, {
              extends: i > 0 ? `level-${i - 1}` : undefined,
            })
          );
        }
        const registry = createRegistry(agents);

        const deepAgent = agents[agents.length - 1]!;
        const depth = getInheritanceDepth(deepAgent, registry);

        expect(depth).toBeLessThanOrEqual(MAX_INHERITANCE_DEPTH);
      });

      it("handles broken chain (missing parent)", () => {
        const child = createAgent("child", { extends: "missing" });
        const registry = createRegistry([child]);

        // Returns 1 because depth increments when extends is present,
        // regardless of whether parent exists (broken chain detection)
        expect(getInheritanceDepth(child, registry)).toBe(1);
      });
    });

    describe("createInheritanceResolver", () => {
      it("creates a new InheritanceResolver instance", () => {
        const newResolver = createInheritanceResolver();
        expect(newResolver).toBeInstanceOf(InheritanceResolver);
      });
    });
  });

  // ============================================
  // Sync vs Async
  // ============================================

  describe("sync and async methods", () => {
    it("resolveSync returns same result as resolve", async () => {
      const parent = createAgent("parent", { mode: "code" });
      const child = createAgent("child", { extends: "parent" });
      const registry = createRegistry([parent, child]);

      const asyncResult = await resolver.resolve(child, registry);
      const syncResult = resolver.resolveSync(child, registry);

      expect(asyncResult).toEqual(syncResult);
    });
  });
});
