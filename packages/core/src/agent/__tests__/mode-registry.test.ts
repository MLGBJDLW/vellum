import { beforeEach, describe, expect, it } from "vitest";
import { AgentLevel } from "../level.js";
import { createModeRegistry, type ModeRegistry } from "../mode-registry.js";
import type { AgentMode, ExtendedModeConfig } from "../modes.js";

/**
 * Factory for creating test mode configurations.
 * Uses type assertion to allow custom mode names for testing.
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
    level: AgentLevel.worker,
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

  describe("getByLevel", () => {
    it("should return empty array for level with no modes", () => {
      const registry = createModeRegistry();

      expect(registry.getByLevel(AgentLevel.orchestrator)).toEqual([]);
    });

    it("should return modes at specific level", () => {
      const registry = createModeRegistry();

      const orchestrator = createTestMode({
        name: "orchestrator",
        level: AgentLevel.orchestrator,
      });
      const workflow1 = createTestMode({
        name: "workflow-1",
        level: AgentLevel.workflow,
      });
      const workflow2 = createTestMode({
        name: "workflow-2",
        level: AgentLevel.workflow,
      });
      const worker = createTestMode({
        name: "worker",
        level: AgentLevel.worker,
      });

      registry.register(orchestrator);
      registry.register(workflow1);
      registry.register(workflow2);
      registry.register(worker);

      expect(registry.getByLevel(AgentLevel.orchestrator)).toEqual([orchestrator]);
      expect(registry.getByLevel(AgentLevel.workflow)).toEqual([workflow1, workflow2]);
      expect(registry.getByLevel(AgentLevel.worker)).toEqual([worker]);
    });
  });

  describe("canSpawn", () => {
    let registry: ModeRegistry;

    beforeEach(() => {
      registry = createModeRegistry();

      // Setup hierarchy
      registry.register(
        createTestMode({
          name: "orchestrator",
          level: AgentLevel.orchestrator,
          canSpawnAgents: ["workflow-a", "workflow-b"],
        })
      );
      registry.register(
        createTestMode({
          name: "workflow-a",
          level: AgentLevel.workflow,
          canSpawnAgents: ["worker-1", "worker-2"],
        })
      );
      registry.register(
        createTestMode({
          name: "workflow-b",
          level: AgentLevel.workflow,
          canSpawnAgents: ["worker-3"],
        })
      );
      registry.register(
        createTestMode({
          name: "worker-1",
          level: AgentLevel.worker,
        })
      );
      registry.register(
        createTestMode({
          name: "worker-2",
          level: AgentLevel.worker,
        })
      );
      registry.register(
        createTestMode({
          name: "worker-3",
          level: AgentLevel.worker,
        })
      );
    });

    it("should allow orchestrator to spawn allowed workflows", () => {
      expect(registry.canSpawn("orchestrator", "workflow-a")).toBe(true);
      expect(registry.canSpawn("orchestrator", "workflow-b")).toBe(true);
    });

    it("should prevent orchestrator from spawning non-allowed workflows", () => {
      // workflow-c doesn't exist, but even if it did, it's not in canSpawnAgents
      expect(registry.canSpawn("orchestrator", "workflow-c")).toBe(false);
    });

    it("should prevent orchestrator from spawning workers directly", () => {
      // Even if worker-1 existed, orchestrator can't skip levels
      expect(registry.canSpawn("orchestrator", "worker-1")).toBe(false);
    });

    it("should allow workflow to spawn allowed workers", () => {
      expect(registry.canSpawn("workflow-a", "worker-1")).toBe(true);
      expect(registry.canSpawn("workflow-a", "worker-2")).toBe(true);
      expect(registry.canSpawn("workflow-b", "worker-3")).toBe(true);
    });

    it("should prevent workflow from spawning non-allowed workers", () => {
      // workflow-a can only spawn worker-1 and worker-2
      expect(registry.canSpawn("workflow-a", "worker-3")).toBe(false);
    });

    it("should prevent workers from spawning anything", () => {
      expect(registry.canSpawn("worker-1", "worker-2")).toBe(false);
    });

    it("should return false for non-existent source mode", () => {
      expect(registry.canSpawn("non-existent", "worker-1")).toBe(false);
    });

    it("should return false for non-existent target mode", () => {
      expect(registry.canSpawn("orchestrator", "non-existent")).toBe(false);
    });

    it("should prevent same-level spawning", () => {
      // Orchestrator with workflow-a in canSpawnAgents but workflow-a is workflow level
      // This is already covered by level check
      expect(registry.canSpawn("workflow-a", "workflow-b")).toBe(false);
    });

    it("should prevent upward spawning", () => {
      expect(registry.canSpawn("worker-1", "workflow-a")).toBe(false);
      expect(registry.canSpawn("workflow-a", "orchestrator")).toBe(false);
    });
  });

  describe("findBestMatch", () => {
    let registry: ModeRegistry;

    beforeEach(() => {
      registry = createModeRegistry();

      registry.register(
        createTestMode({
          name: "code",
          description: "Write and modify code",
          prompt: "You are a coding assistant. Implement features, fix bugs, write tests.",
          level: AgentLevel.worker,
        })
      );

      registry.register(
        createTestMode({
          name: "debug",
          description: "Debug and troubleshoot issues",
          prompt: "You are a debugging expert. Analyze errors, identify root causes, fix problems.",
          level: AgentLevel.worker,
        })
      );

      registry.register(
        createTestMode({
          name: "plan",
          description: "Create implementation plans",
          prompt:
            "You are a planning assistant. Analyze requirements, break down tasks, estimate effort.",
          level: AgentLevel.workflow,
        })
      );
    });

    it("should return undefined for empty level", () => {
      expect(registry.findBestMatch("any task", AgentLevel.orchestrator)).toBeUndefined();
    });

    it("should match based on mode name", () => {
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

    it("should respect level filter", () => {
      const result = registry.findBestMatch("plan the feature implementation", AgentLevel.worker);
      // Should not return plan because it's at workflow level
      expect(result?.name).not.toBe("plan");
    });

    it("should return best match when multiple modes match", () => {
      // "implement" appears in both code and plan prompts
      const result = registry.findBestMatch("implement a new feature", AgentLevel.worker);
      // Code should win due to "Implement" in prompt
      expect(result?.name).toBe("code");
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
    it("should handle a complete multi-agent hierarchy", () => {
      const registry = createModeRegistry();

      // Register orchestrator
      const orchestrator = createTestMode({
        name: "code",
        description: "Main orchestrator for coding tasks",
        prompt: "Coordinate coding workflows",
        level: AgentLevel.orchestrator,
        canSpawnAgents: ["spec-workflow", "impl-workflow"],
      });
      registry.register(orchestrator);

      // Register workflows
      const specWorkflow = createTestMode({
        name: "spec-workflow",
        description: "Specification workflow",
        prompt: "Manage specification tasks",
        level: AgentLevel.workflow,
        canSpawnAgents: ["spec-writer", "spec-reviewer"],
      });
      registry.register(specWorkflow);

      const implWorkflow = createTestMode({
        name: "impl-workflow",
        description: "Implementation workflow",
        prompt: "Manage implementation tasks",
        level: AgentLevel.workflow,
        canSpawnAgents: ["coder", "tester"],
      });
      registry.register(implWorkflow);

      // Register workers
      registry.register(
        createTestMode({
          name: "spec-writer",
          description: "Write specifications",
          prompt: "Write detailed specifications",
          level: AgentLevel.worker,
        })
      );
      registry.register(
        createTestMode({
          name: "spec-reviewer",
          description: "Review specifications",
          prompt: "Review and validate specifications",
          level: AgentLevel.worker,
        })
      );
      registry.register(
        createTestMode({
          name: "coder",
          description: "Write code",
          prompt: "Implement features in code",
          level: AgentLevel.worker,
        })
      );
      registry.register(
        createTestMode({
          name: "tester",
          description: "Test code",
          prompt: "Write and run tests",
          level: AgentLevel.worker,
        })
      );

      // Verify counts
      expect(registry.list()).toHaveLength(7);
      expect(registry.getByLevel(AgentLevel.orchestrator)).toHaveLength(1);
      expect(registry.getByLevel(AgentLevel.workflow)).toHaveLength(2);
      expect(registry.getByLevel(AgentLevel.worker)).toHaveLength(4);

      // Verify spawning rules
      expect(registry.canSpawn("code", "spec-workflow")).toBe(true);
      expect(registry.canSpawn("code", "impl-workflow")).toBe(true);
      expect(registry.canSpawn("code", "coder")).toBe(false); // Can't skip level
      expect(registry.canSpawn("spec-workflow", "spec-writer")).toBe(true);
      expect(registry.canSpawn("spec-workflow", "coder")).toBe(false); // Not in list
      expect(registry.canSpawn("impl-workflow", "coder")).toBe(true);
      expect(registry.canSpawn("impl-workflow", "tester")).toBe(true);

      // Verify findBestMatch
      const testWorker = registry.findBestMatch("write tests for the module", AgentLevel.worker);
      expect(testWorker?.name).toBe("tester");
    });
  });
});
