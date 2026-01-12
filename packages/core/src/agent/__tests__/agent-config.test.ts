import { describe, it, expect } from "vitest";
import {
  type AgentConfig,
  AgentConfigSchema,
  AgentLevel,
  AgentLevelSchema,
  FileRestrictionsSchema,
  VIBE_AGENT,
  PLAN_AGENT,
  SPEC_ORCHESTRATOR,
  BUILT_IN_AGENTS,
} from "../agent-config.js";

describe("AgentConfig", () => {
  describe("AgentConfigSchema", () => {
    it("should validate a valid agent config", () => {
      const config: AgentConfig = {
        name: "test-agent",
        level: 2,
        canSpawnAgents: false,
      };
      
      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should validate config with optional fields", () => {
      const config: AgentConfig = {
        name: "test-agent",
        level: 1,
        canSpawnAgents: true,
        fileRestrictions: {
          allowedPaths: ["src/**"],
          deniedPaths: ["node_modules/**"],
          readOnly: false,
        },
        maxConcurrentSubagents: 5,
        description: "A test agent",
      };
      
      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should reject empty name", () => {
      const config = {
        name: "",
        level: 2,
        canSpawnAgents: false,
      };
      
      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should reject invalid level", () => {
      const config = {
        name: "test",
        level: 3,
        canSpawnAgents: false,
      };
      
      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should reject level 5 as invalid", () => {
      const config = {
        name: "test",
        level: 5,
        canSpawnAgents: false,
      };
      
      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should reject missing required fields", () => {
      // Missing 'name'
      const missingName = {
        level: 2,
        canSpawnAgents: false,
      };
      expect(AgentConfigSchema.safeParse(missingName).success).toBe(false);

      // Missing 'level'
      const missingLevel = {
        name: "test",
        canSpawnAgents: false,
      };
      expect(AgentConfigSchema.safeParse(missingLevel).success).toBe(false);

      // Missing 'canSpawnAgents'
      const missingCanSpawn = {
        name: "test",
        level: 2,
      };
      expect(AgentConfigSchema.safeParse(missingCanSpawn).success).toBe(false);
    });

    it("should reject negative maxConcurrentSubagents", () => {
      const config = {
        name: "test",
        level: 1,
        canSpawnAgents: true,
        maxConcurrentSubagents: -1,
      };
      
      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe("BUILT_IN_AGENTS", () => {
    it("should have VIBE_AGENT as worker level", () => {
      expect(VIBE_AGENT.name).toBe("vibe-agent");
      expect(VIBE_AGENT.level).toBe(2);
      expect(VIBE_AGENT.canSpawnAgents).toBe(false);
    });

    it("should have PLAN_AGENT as workflow level", () => {
      expect(PLAN_AGENT.name).toBe("plan-agent");
      expect(PLAN_AGENT.level).toBe(1);
      expect(PLAN_AGENT.canSpawnAgents).toBe(true);
    });

    it("should have SPEC_ORCHESTRATOR as orchestrator level", () => {
      expect(SPEC_ORCHESTRATOR.name).toBe("spec-orchestrator");
      expect(SPEC_ORCHESTRATOR.level).toBe(0);
      expect(SPEC_ORCHESTRATOR.canSpawnAgents).toBe(true);
    });

    it("should have all built-in agents in BUILT_IN_AGENTS record", () => {
      expect(BUILT_IN_AGENTS["vibe-agent"]).toBe(VIBE_AGENT);
      expect(BUILT_IN_AGENTS["plan-agent"]).toBe(PLAN_AGENT);
      expect(BUILT_IN_AGENTS["spec-orchestrator"]).toBe(SPEC_ORCHESTRATOR);
    });

    it("should validate all built-in agents against schema", () => {
      for (const agent of Object.values(BUILT_IN_AGENTS)) {
        const result = AgentConfigSchema.safeParse(agent);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("AgentLevel type", () => {
    it("should accept valid levels", () => {
      const levels: AgentLevel[] = [0, 1, 2];
      expect(levels).toHaveLength(3);
    });
  });

  describe("AgentLevelSchema", () => {
    it("should validate level 0 (orchestrator)", () => {
      const result = AgentLevelSchema.safeParse(0);
      expect(result.success).toBe(true);
      expect(result.data).toBe(AgentLevel.orchestrator);
    });

    it("should validate level 1 (workflow)", () => {
      const result = AgentLevelSchema.safeParse(1);
      expect(result.success).toBe(true);
      expect(result.data).toBe(AgentLevel.workflow);
    });

    it("should validate level 2 (worker)", () => {
      const result = AgentLevelSchema.safeParse(2);
      expect(result.success).toBe(true);
      expect(result.data).toBe(AgentLevel.worker);
    });

    it("should reject invalid levels", () => {
      expect(AgentLevelSchema.safeParse(-1).success).toBe(false);
      expect(AgentLevelSchema.safeParse(3).success).toBe(false);
      expect(AgentLevelSchema.safeParse(5).success).toBe(false);
      expect(AgentLevelSchema.safeParse("orchestrator").success).toBe(false);
    });
  });

  describe("FileRestrictionsSchema", () => {
    it("should validate empty restrictions", () => {
      const result = FileRestrictionsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should validate full restrictions", () => {
      const restrictions = {
        allowedPaths: ["src/**", "tests/**"],
        deniedPaths: ["node_modules/**", ".env*"],
        readOnly: true,
      };
      const result = FileRestrictionsSchema.safeParse(restrictions);
      expect(result.success).toBe(true);
    });

    it("should validate partial restrictions", () => {
      const readOnlyOnly = { readOnly: true };
      expect(FileRestrictionsSchema.safeParse(readOnlyOnly).success).toBe(true);

      const pathsOnly = { allowedPaths: ["src/**"] };
      expect(FileRestrictionsSchema.safeParse(pathsOnly).success).toBe(true);
    });

    it("should reject invalid types", () => {
      expect(FileRestrictionsSchema.safeParse({ allowedPaths: "src/**" }).success).toBe(false);
      expect(FileRestrictionsSchema.safeParse({ readOnly: "yes" }).success).toBe(false);
    });
  });
});
