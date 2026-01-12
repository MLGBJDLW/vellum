import { beforeEach, describe, expect, it } from "vitest";
import { AgentLevel } from "../level.js";
import { createModeRegistry, type ModeRegistry } from "../mode-registry.js";
import type { AgentMode, ExtendedModeConfig } from "../modes.js";

/**
 * Factory for creating test mode configurations.
 * Uses type assertion to allow custom mode names for testing.
 *
 * Note: Agent hierarchy fields (level, canSpawnAgents, fileRestrictions,
 * maxConcurrentSubagents) are now in AgentConfig, not ExtendedModeConfig.
 */
function createTestMode(
  overrides: Omit<Partial<ExtendedModeConfig>, "name"> & { name: string }
): ExtendedModeConfig {
  const { name, ...rest } = overrides;
  return {
    name: name as AgentMode, // Cast for test flexibility
    description: "Test mode",
    tools: { edit: true, bash: true },
    prompt: "Test prompt",
    ...rest,
  } as ExtendedModeConfig;
}

describe("ModeRegistry", () => {
  describe("createModeRegistry", () => {
    it("should create an empty registry", () => {
      const registry = createModeRegistry();
      expect(registry.list()).toHaveLength(0);
    });
  });

  describe("register", () => {
    it("should register a mode successfully", () => {
      const registry = createModeRegistry();
      const mode = createTestMode({ name: "test-mode" });

      registry.register(mode);

      expect(registry.get("test-mode")).toBe(mode);
    });

    it("should throw when registering duplicate slug", () => {
      const registry = createModeRegistry();
      const mode1 = createTestMode({ name: "duplicate" });
      const mode2 = createTestMode({ name: "duplicate" });

      registry.register(mode1);

      expect(() => registry.register(mode2)).toThrow('Mode "duplicate" is already registered');
    });

    it("should allow registering multiple different modes", () => {
      const registry = createModeRegistry();
      const mode1 = createTestMode({ name: "mode-1" });
      const mode2 = createTestMode({ name: "mode-2" });
      const mode3 = createTestMode({ name: "mode-3" });

      registry.register(mode1);
      registry.register(mode2);
      registry.register(mode3);

      expect(registry.list()).toHaveLength(3);
    });
  });

  describe("get", () => {
    it("should return undefined for non-existent mode", () => {
      const registry = createModeRegistry();

      expect(registry.get("non-existent")).toBeUndefined();
    });

    it("should return the registered mode", () => {
      const registry = createModeRegistry();
      const mode = createTestMode({ name: "my-mode" });

      registry.register(mode);

      expect(registry.get("my-mode")).toBe(mode);
    });

    it("should provide O(1) lookup", () => {
      const registry = createModeRegistry();

      // Register many modes
      for (let i = 0; i < 1000; i++) {
        registry.register(createTestMode({ name: `mode-${i}` }));
      }

      // Lookup should be fast (O(1))
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        registry.get(`mode-${i}`);
      }
      const elapsed = performance.now() - start;

      // 1000 lookups should complete in < 100ms
      expect(elapsed).toBeLessThan(100);
    });
  });

  /**
   * @deprecated getByLevel is deprecated since level is no longer in ExtendedModeConfig.
   * Level-based organization is now handled by AgentRegistry.
   */
  describe("getByLevel (deprecated)", () => {
    it("should return empty array since level is no longer tracked", () => {
      const registry = createModeRegistry();

      // Register modes (without level field)
      registry.register(createTestMode({ name: "orchestrator" }));
      registry.register(createTestMode({ name: "workflow-1" }));
      registry.register(createTestMode({ name: "worker" }));

      // getByLevel always returns empty array since level is no longer indexed
      expect(registry.getByLevel(AgentLevel.orchestrator)).toEqual([]);
      expect(registry.getByLevel(AgentLevel.workflow)).toEqual([]);
      expect(registry.getByLevel(AgentLevel.worker)).toEqual([]);
    });
  });

  /**
   * @deprecated canSpawn now uses BUILT_IN_AGENTS lookup and doesn't work
   * with arbitrary test modes. Use AgentRegistry for hierarchy management.
   */
  describe("canSpawn (deprecated behavior)", () => {
    it("should return false for non-built-in modes", () => {
      const registry = createModeRegistry();

      // Register test modes (these aren't in BUILT_IN_AGENTS)
      registry.register(createTestMode({ name: "orchestrator" }));
      registry.register(createTestMode({ name: "workflow-a" }));
      registry.register(createTestMode({ name: "worker-1" }));

      // canSpawn returns false for modes not in BUILT_IN_AGENTS
      expect(registry.canSpawn("orchestrator", "workflow-a")).toBe(false);
      expect(registry.canSpawn("workflow-a", "worker-1")).toBe(false);
    });

    it("should return false for non-existent source mode", () => {
      const registry = createModeRegistry();
      expect(registry.canSpawn("non-existent", "worker-1")).toBe(false);
    });

    it("should return false for non-existent target mode", () => {
      const registry = createModeRegistry();
      registry.register(createTestMode({ name: "orchestrator" }));
      expect(registry.canSpawn("orchestrator", "non-existent")).toBe(false);
    });
  });

  /**
   * @deprecated findBestMatch level filtering is deprecated since level
   * is no longer in ExtendedModeConfig. This test verifies basic matching.
   */
  describe("findBestMatch", () => {
    let registry: ModeRegistry;

    beforeEach(() => {
      registry = createModeRegistry();

      registry.register(
        createTestMode({
          name: "code",
          description: "Write and modify code",
          prompt: "You are a coding assistant. Implement features, fix bugs, write tests.",
        })
      );

      registry.register(
        createTestMode({
          name: "debug",
          description: "Debug and troubleshoot issues",
          prompt: "You are a debugging expert. Analyze errors, identify root causes, fix problems.",
        })
      );

      registry.register(
        createTestMode({
          name: "plan",
          description: "Create implementation plans",
          prompt:
            "You are a planning assistant. Analyze requirements, break down tasks, estimate effort.",
        })
      );
    });

    it("should return undefined when no modes match", () => {
      // Level filtering no longer works, but with no modes at all it returns undefined
      const emptyRegistry = createModeRegistry();
      expect(emptyRegistry.findBestMatch("any task", AgentLevel.orchestrator)).toBeUndefined();
    });

    it("should match based on mode name", () => {
      // Since level filtering is deprecated, match is based on keywords only
      const result = registry.findBestMatch("code the authentication module", AgentLevel.worker);
      expect(result?.name).toBe("code");
    });

    it("should match based on description keywords", () => {
      const result = registry.findBestMatch("troubleshoot the login issue", AgentLevel.worker);
      expect(result?.name).toBe("debug");
    });

    it("should match based on prompt keywords", () => {
      const result = registry.findBestMatch("fix the bug in the API", AgentLevel.worker);
      expect(result?.name).toBe("debug");
    });

    it("should be case-insensitive", () => {
      const result = registry.findBestMatch("DEBUG THE ERROR", AgentLevel.worker);
      expect(result?.name).toBe("debug");
    });
  });

  describe("list", () => {
    it("should return empty array for empty registry", () => {
      const registry = createModeRegistry();
      expect(registry.list()).toEqual([]);
    });

    it("should return all registered modes", () => {
      const registry = createModeRegistry();

      const mode1 = createTestMode({ name: "mode-1" });
      const mode2 = createTestMode({ name: "mode-2" });

      registry.register(mode1);
      registry.register(mode2);

      const list = registry.list();
      expect(list).toHaveLength(2);
      expect(list).toContain(mode1);
      expect(list).toContain(mode2);
    });

    it("should return a new array each time", () => {
      const registry = createModeRegistry();
      registry.register(createTestMode({ name: "mode-1" }));

      const list1 = registry.list();
      const list2 = registry.list();

      expect(list1).not.toBe(list2);
      expect(list1).toEqual(list2);
    });
  });

  describe("integration", () => {
    it("should handle mode registration and lookup", () => {
      const registry = createModeRegistry();

      // Register modes (agent hierarchy is now in AgentConfig, not modes)
      const codeMode = createTestMode({
        name: "code",
        description: "Main mode for coding tasks",
        prompt: "Coordinate coding workflows",
      });
      registry.register(codeMode);

      const specWorkflow = createTestMode({
        name: "spec-workflow",
        description: "Specification workflow",
        prompt: "Manage specification tasks",
      });
      registry.register(specWorkflow);

      const implWorkflow = createTestMode({
        name: "impl-workflow",
        description: "Implementation workflow",
        prompt: "Manage implementation tasks",
      });
      registry.register(implWorkflow);

      // Register worker modes
      registry.register(
        createTestMode({
          name: "spec-writer",
          description: "Write specifications",
          prompt: "Write detailed specifications",
        })
      );
      registry.register(
        createTestMode({
          name: "spec-reviewer",
          description: "Review specifications",
          prompt: "Review and validate specifications",
        })
      );
      registry.register(
        createTestMode({
          name: "coder",
          description: "Write code",
          prompt: "Implement features in code",
        })
      );
      registry.register(
        createTestMode({
          name: "tester",
          description: "Test code",
          prompt: "Write and run tests",
        })
      );

      // Verify counts
      expect(registry.list()).toHaveLength(7);

      // Note: getByLevel always returns [] since level is no longer tracked in modes
      expect(registry.getByLevel(AgentLevel.orchestrator)).toHaveLength(0);
      expect(registry.getByLevel(AgentLevel.workflow)).toHaveLength(0);
      expect(registry.getByLevel(AgentLevel.worker)).toHaveLength(0);

      // Note: canSpawn returns false for test modes not in BUILT_IN_AGENTS
      expect(registry.canSpawn("code", "spec-workflow")).toBe(false);

      // Verify findBestMatch works for keyword matching
      const testWorker = registry.findBestMatch("write tests for the module", AgentLevel.worker);
      expect(testWorker?.name).toBe("tester");
    });
  });
});
