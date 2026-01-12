import { beforeEach, describe, expect, it } from "vitest";
import { type AgentConfig, PLAN_AGENT, SPEC_ORCHESTRATOR, VIBE_AGENT } from "../agent-config.js";
import { AgentRegistry, DuplicateAgentError } from "../agent-registry.js";

describe("AgentRegistry", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = AgentRegistry.getInstance();
    registry.reset();
    registry.reinitialize();
  });

  describe("getInstance", () => {
    it("should return the same instance", () => {
      const instance1 = AgentRegistry.getInstance();
      const instance2 = AgentRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should auto-register built-in agents", () => {
      expect(registry.has("vibe-agent")).toBe(true);
      expect(registry.has("plan-agent")).toBe(true);
      expect(registry.has("spec-orchestrator")).toBe(true);
    });
  });

  describe("register", () => {
    it("should register a new agent", () => {
      const customAgent: AgentConfig = {
        name: "custom-agent",
        level: 2,
        canSpawnAgents: false,
      };

      registry.register(customAgent);
      expect(registry.get("custom-agent")).toBe(customAgent);
    });

    it("should throw DuplicateAgentError for duplicate name", () => {
      const agent1: AgentConfig = {
        name: "duplicate-agent",
        level: 2,
        canSpawnAgents: false,
      };
      const agent2: AgentConfig = {
        name: "duplicate-agent",
        level: 1,
        canSpawnAgents: true,
      };

      registry.register(agent1);
      expect(() => registry.register(agent2)).toThrow(DuplicateAgentError);
    });

    it("should not allow re-registering built-in agents", () => {
      const fakeVibe: AgentConfig = {
        name: "vibe-agent",
        level: 0, // Different from real
        canSpawnAgents: true,
      };

      expect(() => registry.register(fakeVibe)).toThrow(DuplicateAgentError);
    });
  });

  describe("get", () => {
    it("should return agent by name", () => {
      const agent = registry.get("vibe-agent");
      expect(agent).toBe(VIBE_AGENT);
    });

    it("should return undefined for unknown agent", () => {
      const agent = registry.get("nonexistent-agent");
      expect(agent).toBeUndefined();
    });
  });

  describe("list", () => {
    it("should return all registered agents", () => {
      const agents = registry.list();
      expect(agents.length).toBeGreaterThanOrEqual(3);
      expect(agents).toContain(VIBE_AGENT);
      expect(agents).toContain(PLAN_AGENT);
      expect(agents).toContain(SPEC_ORCHESTRATOR);
    });

    it("should include custom registered agents", () => {
      const customAgent: AgentConfig = {
        name: "custom-list-agent",
        level: 2,
        canSpawnAgents: false,
      };
      registry.register(customAgent);

      const agents = registry.list();
      expect(agents).toContain(customAgent);
    });
  });

  describe("reset", () => {
    it("should clear all agents", () => {
      registry.reset();
      expect(registry.list()).toHaveLength(0);
      expect(registry.has("vibe-agent")).toBe(false);
    });

    it("should allow reinitialize after reset", () => {
      registry.reset();
      registry.reinitialize();
      expect(registry.has("vibe-agent")).toBe(true);
    });
  });

  describe("has", () => {
    it("should return true for existing agent", () => {
      expect(registry.has("vibe-agent")).toBe(true);
    });

    it("should return false for non-existing agent", () => {
      expect(registry.has("nonexistent")).toBe(false);
    });
  });
});

describe("DuplicateAgentError", () => {
  it("should have correct name and message", () => {
    const error = new DuplicateAgentError("test-agent");
    expect(error.name).toBe("DuplicateAgentError");
    expect(error.message).toBe('Agent "test-agent" is already registered');
  });

  it("should be instance of Error", () => {
    const error = new DuplicateAgentError("test");
    expect(error).toBeInstanceOf(Error);
  });
});
