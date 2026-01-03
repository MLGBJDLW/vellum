import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveredAgent } from "../discovery.js";
import { AgentDiscovery, DiscoverySource } from "../discovery.js";
import { CustomAgentRegistry, createAgentRegistry } from "../registry.js";
import type { CustomAgentDefinition } from "../types.js";

// ============================================
// CustomAgentRegistry Tests (T018)
// ============================================

/**
 * Helper to create a minimal agent definition.
 */
function createTestAgent(
  slug: string,
  name: string,
  extras: Partial<CustomAgentDefinition> = {}
): CustomAgentDefinition {
  return {
    slug,
    name,
    ...extras,
  };
}

/**
 * Helper to create a discovered agent.
 */
function createDiscoveredAgent(
  slug: string,
  name: string,
  source: DiscoverySource = DiscoverySource.PROJECT,
  extras: Partial<CustomAgentDefinition> = {}
): DiscoveredAgent {
  return {
    definition: createTestAgent(slug, name, extras),
    sourcePath: `/test/${slug}.yaml`,
    source,
    modifiedAt: new Date(),
  };
}

describe("CustomAgentRegistry", () => {
  let registry: CustomAgentRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new CustomAgentRegistry();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // CRUD Operations Tests
  // ============================================

  describe("CRUD operations", () => {
    describe("register()", () => {
      it("registers a new agent", () => {
        const agent = createTestAgent("test-agent", "Test Agent");

        registry.register(agent);

        expect(registry.has("test-agent")).toBe(true);
        expect(registry.count).toBe(1);
      });

      it("emits agent:registered event for new agents", () => {
        const agent = createTestAgent("test-agent", "Test Agent");
        const handler = vi.fn();

        registry.on("agent:registered", handler);
        registry.register(agent);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(agent);
      });

      it("updates existing agent with same or higher priority", () => {
        const agent1 = createTestAgent("test-agent", "Original");
        const agent2 = createTestAgent("test-agent", "Updated");

        registry.register(agent1, 0);
        registry.register(agent2, 0);

        expect(registry.get("test-agent")?.name).toBe("Updated");
      });

      it("emits agent:updated event when updating existing agent", () => {
        const agent1 = createTestAgent("test-agent", "Original");
        const agent2 = createTestAgent("test-agent", "Updated");
        const handler = vi.fn();

        registry.register(agent1);
        registry.on("agent:updated", handler);
        registry.register(agent2);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(agent2);
      });

      it("registers multiple agents", () => {
        registry.register(createTestAgent("agent-1", "Agent 1"));
        registry.register(createTestAgent("agent-2", "Agent 2"));
        registry.register(createTestAgent("agent-3", "Agent 3"));

        expect(registry.count).toBe(3);
      });
    });

    describe("get()", () => {
      it("returns agent by slug", () => {
        const agent = createTestAgent("test-agent", "Test Agent");
        registry.register(agent);

        const retrieved = registry.get("test-agent");

        expect(retrieved).toEqual(agent);
      });

      it("returns undefined for non-existent slug", () => {
        const retrieved = registry.get("non-existent");

        expect(retrieved).toBeUndefined();
      });
    });

    describe("getAll()", () => {
      it("returns empty array when registry is empty", () => {
        expect(registry.getAll()).toEqual([]);
      });

      it("returns all registered agents", () => {
        const agent1 = createTestAgent("agent-1", "Agent 1");
        const agent2 = createTestAgent("agent-2", "Agent 2");

        registry.register(agent1);
        registry.register(agent2);

        const all = registry.getAll();

        expect(all).toHaveLength(2);
        expect(all).toContainEqual(agent1);
        expect(all).toContainEqual(agent2);
      });

      it("returns a copy, not the internal reference", () => {
        const agent = createTestAgent("test-agent", "Test Agent");
        registry.register(agent);

        const all1 = registry.getAll();
        const all2 = registry.getAll();

        expect(all1).not.toBe(all2);
      });
    });

    describe("unregister()", () => {
      it("removes existing agent and returns true", () => {
        registry.register(createTestAgent("test-agent", "Test Agent"));

        const result = registry.unregister("test-agent");

        expect(result).toBe(true);
        expect(registry.has("test-agent")).toBe(false);
        expect(registry.count).toBe(0);
      });

      it("returns false for non-existent agent", () => {
        const result = registry.unregister("non-existent");

        expect(result).toBe(false);
      });

      it("emits agent:unregistered event", () => {
        registry.register(createTestAgent("test-agent", "Test Agent"));
        const handler = vi.fn();

        registry.on("agent:unregistered", handler);
        registry.unregister("test-agent");

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith("test-agent");
      });
    });

    describe("has()", () => {
      it("returns true for registered agent", () => {
        registry.register(createTestAgent("test-agent", "Test Agent"));

        expect(registry.has("test-agent")).toBe(true);
      });

      it("returns false for non-existent agent", () => {
        expect(registry.has("non-existent")).toBe(false);
      });
    });

    describe("clear()", () => {
      it("removes all agents", () => {
        registry.register(createTestAgent("agent-1", "Agent 1"));
        registry.register(createTestAgent("agent-2", "Agent 2"));

        registry.clear();

        expect(registry.count).toBe(0);
        expect(registry.getAll()).toEqual([]);
      });

      it("emits agent:unregistered for each agent", () => {
        registry.register(createTestAgent("agent-1", "Agent 1"));
        registry.register(createTestAgent("agent-2", "Agent 2"));
        const handler = vi.fn();

        registry.on("agent:unregistered", handler);
        registry.clear();

        expect(handler).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ============================================
  // Event-Driven Updates Tests
  // ============================================

  describe("event-driven updates from discovery", () => {
    let mockDiscovery: AgentDiscovery;

    beforeEach(() => {
      mockDiscovery = new AgentDiscovery({
        watchEnabled: false,
      });
    });

    it("subscribes to discovery events", () => {
      const onSpy = vi.spyOn(mockDiscovery, "on");

      registry.subscribeToDiscovery(mockDiscovery);

      expect(onSpy).toHaveBeenCalledWith("agent:added", expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith("agent:changed", expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith("agent:removed", expect.any(Function));
    });

    it("registers agent on agent:added event", () => {
      registry.subscribeToDiscovery(mockDiscovery);

      const discovered = createDiscoveredAgent("new-agent", "New Agent");
      mockDiscovery.emit("agent:added", discovered);

      expect(registry.has("new-agent")).toBe(true);
      expect(registry.get("new-agent")?.name).toBe("New Agent");
    });

    it("updates agent on agent:changed event", () => {
      const agent = createTestAgent("test-agent", "Original");
      registry.register(agent);
      registry.subscribeToDiscovery(mockDiscovery);

      const updated = createDiscoveredAgent("test-agent", "Updated");
      mockDiscovery.emit("agent:changed", updated);

      expect(registry.get("test-agent")?.name).toBe("Updated");
    });

    it("removes agent on agent:removed event", () => {
      registry.register(createTestAgent("test-agent", "Test Agent"));
      registry.subscribeToDiscovery(mockDiscovery);

      mockDiscovery.emit("agent:removed", "test-agent", "/test/path");

      expect(registry.has("test-agent")).toBe(false);
    });

    it("unsubscribes from previous discovery when subscribing to new one", () => {
      const mockDiscovery2 = new AgentDiscovery({ watchEnabled: false });
      const offSpy = vi.spyOn(mockDiscovery, "off");

      registry.subscribeToDiscovery(mockDiscovery);
      registry.subscribeToDiscovery(mockDiscovery2);

      expect(offSpy).toHaveBeenCalledWith("agent:added", expect.any(Function));
      expect(offSpy).toHaveBeenCalledWith("agent:changed", expect.any(Function));
      expect(offSpy).toHaveBeenCalledWith("agent:removed", expect.any(Function));
    });

    it("unsubscribeFromDiscovery removes event listeners", () => {
      const offSpy = vi.spyOn(mockDiscovery, "off");

      registry.subscribeToDiscovery(mockDiscovery);
      registry.unsubscribeFromDiscovery();

      expect(offSpy).toHaveBeenCalledWith("agent:added", expect.any(Function));
    });

    it("populateFromDiscovery loads all agents", () => {
      // Mock getAll to return discovered agents
      const agents = new Map<string, DiscoveredAgent>([
        ["agent-1", createDiscoveredAgent("agent-1", "Agent 1")],
        ["agent-2", createDiscoveredAgent("agent-2", "Agent 2")],
      ]);
      vi.spyOn(mockDiscovery, "getAll").mockReturnValue(agents);

      registry.populateFromDiscovery(mockDiscovery);

      expect(registry.count).toBe(2);
      expect(registry.has("agent-1")).toBe(true);
      expect(registry.has("agent-2")).toBe(true);
    });
  });

  // ============================================
  // Duplicate Handling Tests
  // ============================================

  describe("duplicate handling", () => {
    it("replaces agent when new registration has higher priority", () => {
      const agent1 = createTestAgent("test-agent", "Low Priority");
      const agent2 = createTestAgent("test-agent", "High Priority");

      registry.register(agent1, 1);
      registry.register(agent2, 2);

      expect(registry.get("test-agent")?.name).toBe("High Priority");
    });

    it("replaces agent when new registration has equal priority", () => {
      const agent1 = createTestAgent("test-agent", "First");
      const agent2 = createTestAgent("test-agent", "Second");

      registry.register(agent1, 1);
      registry.register(agent2, 1);

      expect(registry.get("test-agent")?.name).toBe("Second");
    });

    it("keeps existing agent when new registration has lower priority", () => {
      const agent1 = createTestAgent("test-agent", "High Priority");
      const agent2 = createTestAgent("test-agent", "Low Priority");

      registry.register(agent1, 2);
      registry.register(agent2, 1);

      expect(registry.get("test-agent")?.name).toBe("High Priority");
    });

    it("does not emit event when lower priority registration is skipped", () => {
      const agent1 = createTestAgent("test-agent", "High Priority");
      const agent2 = createTestAgent("test-agent", "Low Priority");
      const handler = vi.fn();

      registry.register(agent1, 2);
      registry.on("agent:updated", handler);
      registry.register(agent2, 1);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Priority Resolution Tests
  // ============================================

  describe("priority resolution", () => {
    it("uses discovery source as priority when populating", () => {
      const mockDiscovery = new AgentDiscovery({ watchEnabled: false });

      // Create agents from different sources
      const projectAgent = createDiscoveredAgent(
        "test-agent",
        "Project Agent",
        DiscoverySource.PROJECT
      );
      const userAgent = createDiscoveredAgent("test-agent", "User Agent", DiscoverySource.USER);

      const agents = new Map<string, DiscoveredAgent>([
        // Project has higher priority (2) than User (1)
        ["test-agent", projectAgent],
      ]);
      vi.spyOn(mockDiscovery, "getAll").mockReturnValue(agents);

      registry.populateFromDiscovery(mockDiscovery);

      // Now try to add user agent with lower priority
      registry.register(userAgent.definition, DiscoverySource.USER);

      // Project agent should still be there
      expect(registry.get("test-agent")?.name).toBe("Project Agent");
    });

    it("resolves CLI source over PROJECT source", () => {
      const projectAgent = createDiscoveredAgent(
        "test-agent",
        "Project Agent",
        DiscoverySource.PROJECT
      );
      const cliAgent = createDiscoveredAgent("test-agent", "CLI Agent", DiscoverySource.CLI);

      registry.register(projectAgent.definition, DiscoverySource.PROJECT);
      registry.register(cliAgent.definition, DiscoverySource.CLI);

      expect(registry.get("test-agent")?.name).toBe("CLI Agent");
    });
  });

  // ============================================
  // Filter and Query Tests
  // ============================================

  describe("filter and query", () => {
    beforeEach(() => {
      registry.register(
        createTestAgent("agent-1", "Agent 1", {
          tags: ["testing", "frontend"],
          mode: "code",
        })
      );
      registry.register(
        createTestAgent("agent-2", "Agent 2", {
          tags: ["testing", "backend"],
          mode: "debug",
        })
      );
      registry.register(
        createTestAgent("agent-3", "Agent 3", {
          tags: ["docs"],
          mode: "code",
        })
      );
    });

    it("filter returns agents matching predicate", () => {
      const result = registry.filter((agent) => agent.mode === "code");

      expect(result).toHaveLength(2);
      expect(result.map((a) => a.slug)).toContain("agent-1");
      expect(result.map((a) => a.slug)).toContain("agent-3");
    });

    it("findByTag returns agents with specific tag", () => {
      const result = registry.findByTag("testing");

      expect(result).toHaveLength(2);
      expect(result.map((a) => a.slug)).toContain("agent-1");
      expect(result.map((a) => a.slug)).toContain("agent-2");
    });

    it("findByMode returns agents with specific mode", () => {
      const result = registry.findByMode("debug");

      expect(result).toHaveLength(1);
      expect(result[0]?.slug).toBe("agent-2");
    });

    it("findByTag returns empty array when no matches", () => {
      const result = registry.findByTag("nonexistent");

      expect(result).toEqual([]);
    });
  });

  // ============================================
  // Factory Function Tests
  // ============================================

  describe("createAgentRegistry factory", () => {
    it("creates a new registry instance", () => {
      const newRegistry = createAgentRegistry();

      expect(newRegistry).toBeInstanceOf(CustomAgentRegistry);
    });

    it("accepts options", () => {
      const logger = { debug: vi.fn() } as any;
      const newRegistry = createAgentRegistry({ logger });

      newRegistry.register(createTestAgent("test", "Test"));

      expect(logger.debug).toHaveBeenCalled();
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe("edge cases", () => {
    it("handles agents with minimal configuration", () => {
      const minimalAgent: CustomAgentDefinition = {
        slug: "minimal",
        name: "Minimal Agent",
      };

      registry.register(minimalAgent);

      expect(registry.get("minimal")).toEqual(minimalAgent);
    });

    it("handles agents with full configuration", () => {
      const fullAgent: CustomAgentDefinition = {
        slug: "full-agent",
        name: "Full Agent",
        mode: "code",
        icon: "🔧",
        color: "#3b82f6",
        hidden: false,
        model: "claude-3-5-sonnet",
        systemPrompt: "You are a test agent",
        tags: ["testing"],
        version: "1.0.0",
        author: "test",
        whenToUse: {
          description: "Use for testing",
          priority: 10,
        },
      };

      registry.register(fullAgent);

      expect(registry.get("full-agent")).toEqual(fullAgent);
    });

    it("handles rapid sequential registrations", () => {
      for (let i = 0; i < 100; i++) {
        registry.register(createTestAgent(`agent-${i}`, `Agent ${i}`));
      }

      expect(registry.count).toBe(100);
    });

    it("handles unregistering during iteration", () => {
      registry.register(createTestAgent("agent-1", "Agent 1"));
      registry.register(createTestAgent("agent-2", "Agent 2"));

      // Get all, then unregister shouldn't throw
      const all = registry.getAll();
      registry.unregister("agent-1");

      // Original array should be unchanged (it's a copy)
      expect(all).toHaveLength(2);
      expect(registry.count).toBe(1);
    });
  });
});
