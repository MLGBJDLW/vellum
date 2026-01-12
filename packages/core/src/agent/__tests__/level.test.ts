import { describe, expect, it } from "vitest";
import { PLAN_AGENT, SPEC_ORCHESTRATOR, VIBE_AGENT, type AgentConfig } from "../agent-config.js";
import { AgentLevel, AgentLevelSchema, canAgentSpawn, canSpawn } from "../level.js";

describe("AgentLevel", () => {
  describe("enum values", () => {
    it("has orchestrator at level 0", () => {
      expect(AgentLevel.orchestrator).toBe(0);
    });

    it("has workflow at level 1", () => {
      expect(AgentLevel.workflow).toBe(1);
    });

    it("has worker at level 2", () => {
      expect(AgentLevel.worker).toBe(2);
    });

    it("has exactly 3 levels", () => {
      const values = Object.values(AgentLevel).filter((v) => typeof v === "number");
      expect(values).toHaveLength(3);
      expect(values).toEqual([0, 1, 2]);
    });

    it("levels are in correct order (orchestrator < workflow < worker)", () => {
      expect(AgentLevel.orchestrator).toBeLessThan(AgentLevel.workflow);
      expect(AgentLevel.workflow).toBeLessThan(AgentLevel.worker);
    });
  });
});

describe("AgentLevelSchema", () => {
  describe("valid values", () => {
    it("validates orchestrator (0)", () => {
      const result = AgentLevelSchema.safeParse(0);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(AgentLevel.orchestrator);
      }
    });

    it("validates workflow (1)", () => {
      const result = AgentLevelSchema.safeParse(1);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(AgentLevel.workflow);
      }
    });

    it("validates worker (2)", () => {
      const result = AgentLevelSchema.safeParse(2);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(AgentLevel.worker);
      }
    });

    it("validates AgentLevel enum values directly", () => {
      expect(AgentLevelSchema.safeParse(AgentLevel.orchestrator).success).toBe(true);
      expect(AgentLevelSchema.safeParse(AgentLevel.workflow).success).toBe(true);
      expect(AgentLevelSchema.safeParse(AgentLevel.worker).success).toBe(true);
    });
  });

  describe("invalid values", () => {
    it("rejects negative numbers", () => {
      const result = AgentLevelSchema.safeParse(-1);
      expect(result.success).toBe(false);
    });

    it("rejects numbers above 2", () => {
      expect(AgentLevelSchema.safeParse(3).success).toBe(false);
      expect(AgentLevelSchema.safeParse(99).success).toBe(false);
    });

    it("rejects strings", () => {
      expect(AgentLevelSchema.safeParse("orchestrator").success).toBe(false);
      expect(AgentLevelSchema.safeParse("0").success).toBe(false);
    });

    it("rejects null and undefined", () => {
      expect(AgentLevelSchema.safeParse(null).success).toBe(false);
      expect(AgentLevelSchema.safeParse(undefined).success).toBe(false);
    });

    it("rejects objects and arrays", () => {
      expect(AgentLevelSchema.safeParse({}).success).toBe(false);
      expect(AgentLevelSchema.safeParse([]).success).toBe(false);
      expect(AgentLevelSchema.safeParse({ level: 0 }).success).toBe(false);
    });

    it("rejects floating point numbers", () => {
      expect(AgentLevelSchema.safeParse(0.5).success).toBe(false);
      expect(AgentLevelSchema.safeParse(1.5).success).toBe(false);
    });

    it("provides descriptive error messages", () => {
      const result = AgentLevelSchema.safeParse(99);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessage = result.error.issues[0]?.message;
        expect(errorMessage).toBeDefined();
        // Zod nativeEnum errors typically mention the invalid value
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });
  });
});

describe("canSpawn", () => {
  describe("orchestrator spawning rules", () => {
    it("orchestrator can spawn workflow (one level down)", () => {
      expect(canSpawn(AgentLevel.orchestrator, AgentLevel.workflow)).toBe(true);
    });

    it("orchestrator cannot spawn worker (two levels down)", () => {
      expect(canSpawn(AgentLevel.orchestrator, AgentLevel.worker)).toBe(false);
    });

    it("orchestrator cannot spawn orchestrator (same level)", () => {
      expect(canSpawn(AgentLevel.orchestrator, AgentLevel.orchestrator)).toBe(false);
    });
  });

  describe("workflow spawning rules", () => {
    it("workflow can spawn worker (one level down)", () => {
      expect(canSpawn(AgentLevel.workflow, AgentLevel.worker)).toBe(true);
    });

    it("workflow cannot spawn orchestrator (higher level)", () => {
      expect(canSpawn(AgentLevel.workflow, AgentLevel.orchestrator)).toBe(false);
    });

    it("workflow cannot spawn workflow (same level)", () => {
      expect(canSpawn(AgentLevel.workflow, AgentLevel.workflow)).toBe(false);
    });
  });

  describe("worker spawning rules", () => {
    it("worker cannot spawn orchestrator", () => {
      expect(canSpawn(AgentLevel.worker, AgentLevel.orchestrator)).toBe(false);
    });

    it("worker cannot spawn workflow", () => {
      expect(canSpawn(AgentLevel.worker, AgentLevel.workflow)).toBe(false);
    });

    it("worker cannot spawn worker (same level)", () => {
      expect(canSpawn(AgentLevel.worker, AgentLevel.worker)).toBe(false);
    });

    it("worker cannot spawn any agent", () => {
      const allLevels = [AgentLevel.orchestrator, AgentLevel.workflow, AgentLevel.worker];
      for (const level of allLevels) {
        expect(canSpawn(AgentLevel.worker, level)).toBe(false);
      }
    });
  });

  describe("general rules", () => {
    it("no agent can spawn at the same level", () => {
      expect(canSpawn(AgentLevel.orchestrator, AgentLevel.orchestrator)).toBe(false);
      expect(canSpawn(AgentLevel.workflow, AgentLevel.workflow)).toBe(false);
      expect(canSpawn(AgentLevel.worker, AgentLevel.worker)).toBe(false);
    });

    it("no agent can spawn at a higher level (lower number)", () => {
      // workflow (1) cannot spawn orchestrator (0)
      expect(canSpawn(AgentLevel.workflow, AgentLevel.orchestrator)).toBe(false);
      // worker (2) cannot spawn workflow (1)
      expect(canSpawn(AgentLevel.worker, AgentLevel.workflow)).toBe(false);
      // worker (2) cannot spawn orchestrator (0)
      expect(canSpawn(AgentLevel.worker, AgentLevel.orchestrator)).toBe(false);
    });

    it("can only spawn exactly one level below", () => {
      // Valid spawns (one level down)
      expect(canSpawn(AgentLevel.orchestrator, AgentLevel.workflow)).toBe(true);
      expect(canSpawn(AgentLevel.workflow, AgentLevel.worker)).toBe(true);

      // Invalid spawns (more than one level down)
      expect(canSpawn(AgentLevel.orchestrator, AgentLevel.worker)).toBe(false);
    });

    it("complete spawn matrix is correct", () => {
      // Define expected spawn matrix: [from][to] = expected result
      const spawnMatrix: Record<AgentLevel, Record<AgentLevel, boolean>> = {
        [AgentLevel.orchestrator]: {
          [AgentLevel.orchestrator]: false,
          [AgentLevel.workflow]: true,
          [AgentLevel.worker]: false,
        },
        [AgentLevel.workflow]: {
          [AgentLevel.orchestrator]: false,
          [AgentLevel.workflow]: false,
          [AgentLevel.worker]: true,
        },
        [AgentLevel.worker]: {
          [AgentLevel.orchestrator]: false,
          [AgentLevel.workflow]: false,
          [AgentLevel.worker]: false,
        },
      };

      // Verify all combinations
      for (const from of [AgentLevel.orchestrator, AgentLevel.workflow, AgentLevel.worker]) {
        for (const to of [AgentLevel.orchestrator, AgentLevel.workflow, AgentLevel.worker]) {
          expect(canSpawn(from, to)).toBe(spawnMatrix[from][to]);
        }
      }
    });
  });
});

// =============================================================================
// T013: canAgentSpawn Tests
// =============================================================================

describe("canAgentSpawn (T013)", () => {
  describe("built-in agents spawn rules", () => {
    it("spec-orchestrator can spawn plan-agent", () => {
      expect(canAgentSpawn(SPEC_ORCHESTRATOR, PLAN_AGENT)).toBe(true);
    });

    it("spec-orchestrator can spawn vibe-agent", () => {
      expect(canAgentSpawn(SPEC_ORCHESTRATOR, VIBE_AGENT)).toBe(true);
    });

    it("plan-agent can spawn vibe-agent", () => {
      expect(canAgentSpawn(PLAN_AGENT, VIBE_AGENT)).toBe(true);
    });

    it("vibe-agent cannot spawn any agent (canSpawnAgents: false)", () => {
      expect(canAgentSpawn(VIBE_AGENT, VIBE_AGENT)).toBe(false);
      expect(canAgentSpawn(VIBE_AGENT, PLAN_AGENT)).toBe(false);
      expect(canAgentSpawn(VIBE_AGENT, SPEC_ORCHESTRATOR)).toBe(false);
    });

    it("plan-agent cannot spawn spec-orchestrator (higher level)", () => {
      expect(canAgentSpawn(PLAN_AGENT, SPEC_ORCHESTRATOR)).toBe(false);
    });

    it("plan-agent cannot spawn plan-agent (same level)", () => {
      expect(canAgentSpawn(PLAN_AGENT, PLAN_AGENT)).toBe(false);
    });
  });

  describe("canSpawnAgents permission", () => {
    it("should block spawn when canSpawnAgents is false", () => {
      const noSpawnAgent: AgentConfig = {
        name: "no-spawn-agent",
        level: AgentLevel.orchestrator, // Even at orchestrator level
        canSpawnAgents: false, // But cannot spawn
      };
      expect(canAgentSpawn(noSpawnAgent, VIBE_AGENT)).toBe(false);
      expect(canAgentSpawn(noSpawnAgent, PLAN_AGENT)).toBe(false);
    });

    it("should allow spawn when canSpawnAgents is true and level is lower", () => {
      const canSpawnAgent: AgentConfig = {
        name: "can-spawn-agent",
        level: AgentLevel.workflow,
        canSpawnAgents: true,
      };
      expect(canAgentSpawn(canSpawnAgent, VIBE_AGENT)).toBe(true);
    });
  });

  describe("level hierarchy enforcement", () => {
    it("cannot spawn agent at same level even with canSpawnAgents: true", () => {
      const sameLevel1: AgentConfig = {
        name: "workflow-1",
        level: AgentLevel.workflow,
        canSpawnAgents: true,
      };
      const sameLevel2: AgentConfig = {
        name: "workflow-2",
        level: AgentLevel.workflow,
        canSpawnAgents: true,
      };
      expect(canAgentSpawn(sameLevel1, sameLevel2)).toBe(false);
    });

    it("cannot spawn agent at higher (lower-numbered) level", () => {
      const workflowAgent: AgentConfig = {
        name: "workflow-agent",
        level: AgentLevel.workflow,
        canSpawnAgents: true,
      };
      const orchestratorAgent: AgentConfig = {
        name: "orch-agent",
        level: AgentLevel.orchestrator,
        canSpawnAgents: true,
      };
      expect(canAgentSpawn(workflowAgent, orchestratorAgent)).toBe(false);
    });

    it("orchestrator (0) can spawn any lower level with permission", () => {
      const orchestrator: AgentConfig = {
        name: "orch",
        level: AgentLevel.orchestrator,
        canSpawnAgents: true,
      };
      expect(canAgentSpawn(orchestrator, PLAN_AGENT)).toBe(true); // level 1
      expect(canAgentSpawn(orchestrator, VIBE_AGENT)).toBe(true); // level 2
    });
  });

  describe("complete spawn matrix with AgentConfig", () => {
    it("verifies full spawn matrix for built-in agents", () => {
      // SPEC_ORCHESTRATOR (level 0, canSpawnAgents: true)
      expect(canAgentSpawn(SPEC_ORCHESTRATOR, SPEC_ORCHESTRATOR)).toBe(false); // same level
      expect(canAgentSpawn(SPEC_ORCHESTRATOR, PLAN_AGENT)).toBe(true); // lower level
      expect(canAgentSpawn(SPEC_ORCHESTRATOR, VIBE_AGENT)).toBe(true); // lower level

      // PLAN_AGENT (level 1, canSpawnAgents: true)
      expect(canAgentSpawn(PLAN_AGENT, SPEC_ORCHESTRATOR)).toBe(false); // higher level
      expect(canAgentSpawn(PLAN_AGENT, PLAN_AGENT)).toBe(false); // same level
      expect(canAgentSpawn(PLAN_AGENT, VIBE_AGENT)).toBe(true); // lower level

      // VIBE_AGENT (level 2, canSpawnAgents: false)
      expect(canAgentSpawn(VIBE_AGENT, SPEC_ORCHESTRATOR)).toBe(false); // no permission
      expect(canAgentSpawn(VIBE_AGENT, PLAN_AGENT)).toBe(false); // no permission
      expect(canAgentSpawn(VIBE_AGENT, VIBE_AGENT)).toBe(false); // no permission
    });
  });
});
