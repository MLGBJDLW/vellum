// ============================================
// Agent Spawn Integration Tests (T022)
// ============================================
// Verifies multi-agent spawning rules: orchestrator → workflow → worker chain
// and that workers cannot spawn other agents.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AgentConfig, PLAN_AGENT, SPEC_ORCHESTRATOR, VIBE_AGENT } from "../agent-config.js";
import { AgentRegistry } from "../agent-registry.js";
import { AgentLevel, canAgentSpawn, canSpawn } from "../level.js";

describe("Agent Spawn Integration", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = AgentRegistry.getInstance();
  });

  afterEach(() => {
    registry.reset();
    registry.reinitialize();
  });

  // ==========================================================================
  // Test Case 1: Orchestrator (level 0) CAN spawn workflow (level 1)
  // ==========================================================================
  describe("Orchestrator → Workflow", () => {
    it("orchestrator (level 0) CAN spawn workflow (level 1) via canSpawn", () => {
      expect(canSpawn(AgentLevel.orchestrator, AgentLevel.workflow)).toBe(true);
    });

    it("orchestrator (level 0) CAN spawn workflow (level 1) via canAgentSpawn", () => {
      expect(canAgentSpawn(SPEC_ORCHESTRATOR, PLAN_AGENT)).toBe(true);
    });

    it("spec-orchestrator CAN spawn plan-agent via registry lookup", () => {
      const orchestrator = registry.get("spec-orchestrator");
      const workflow = registry.get("plan-agent");

      expect(orchestrator).toBeDefined();
      expect(workflow).toBeDefined();
      expect(orchestrator?.level).toBe(AgentLevel.orchestrator);
      expect(workflow?.level).toBe(AgentLevel.workflow);
      expect(canAgentSpawn(orchestrator!, workflow!)).toBe(true);
    });
  });

  // ==========================================================================
  // Test Case 2: Orchestrator (level 0) CAN spawn worker (level 2)
  // ==========================================================================
  describe("Orchestrator → Worker", () => {
    it("orchestrator (level 0) CAN spawn worker (level 2) via canAgentSpawn", () => {
      // Note: canSpawn only allows immediate level transitions (0→1, 1→2)
      // but canAgentSpawn allows any higher level (0→1, 0→2, 1→2)
      expect(canAgentSpawn(SPEC_ORCHESTRATOR, VIBE_AGENT)).toBe(true);
    });

    it("spec-orchestrator CAN spawn vibe-agent directly via registry lookup", () => {
      const orchestrator = registry.get("spec-orchestrator");
      const worker = registry.get("vibe-agent");

      expect(orchestrator).toBeDefined();
      expect(worker).toBeDefined();
      expect(orchestrator?.level).toBe(AgentLevel.orchestrator);
      expect(worker?.level).toBe(AgentLevel.worker);
      expect(canAgentSpawn(orchestrator!, worker!)).toBe(true);
    });
  });

  // ==========================================================================
  // Test Case 3: Workflow (level 1) CAN spawn worker (level 2)
  // ==========================================================================
  describe("Workflow → Worker", () => {
    it("workflow (level 1) CAN spawn worker (level 2) via canSpawn", () => {
      expect(canSpawn(AgentLevel.workflow, AgentLevel.worker)).toBe(true);
    });

    it("workflow (level 1) CAN spawn worker (level 2) via canAgentSpawn", () => {
      expect(canAgentSpawn(PLAN_AGENT, VIBE_AGENT)).toBe(true);
    });

    it("plan-agent CAN spawn vibe-agent via registry lookup", () => {
      const workflow = registry.get("plan-agent");
      const worker = registry.get("vibe-agent");

      expect(workflow).toBeDefined();
      expect(worker).toBeDefined();
      expect(workflow?.level).toBe(AgentLevel.workflow);
      expect(worker?.level).toBe(AgentLevel.worker);
      expect(canAgentSpawn(workflow!, worker!)).toBe(true);
    });
  });

  // ==========================================================================
  // Test Case 4: Workflow (level 1) CANNOT spawn orchestrator (level 0)
  // ==========================================================================
  describe("Workflow ✗ Orchestrator", () => {
    it("workflow (level 1) CANNOT spawn orchestrator (level 0) via canSpawn", () => {
      expect(canSpawn(AgentLevel.workflow, AgentLevel.orchestrator)).toBe(false);
    });

    it("workflow (level 1) CANNOT spawn orchestrator (level 0) via canAgentSpawn", () => {
      expect(canAgentSpawn(PLAN_AGENT, SPEC_ORCHESTRATOR)).toBe(false);
    });

    it("plan-agent CANNOT spawn spec-orchestrator via registry lookup", () => {
      const workflow = registry.get("plan-agent");
      const orchestrator = registry.get("spec-orchestrator");

      expect(workflow).toBeDefined();
      expect(orchestrator).toBeDefined();
      expect(canAgentSpawn(workflow!, orchestrator!)).toBe(false);
    });
  });

  // ==========================================================================
  // Test Case 5: Worker (level 2) CANNOT spawn any agent (canSpawnAgents: false)
  // ==========================================================================
  describe("Worker ✗ Any Agent", () => {
    it("worker (level 2) CANNOT spawn worker (level 2) via canSpawn", () => {
      expect(canSpawn(AgentLevel.worker, AgentLevel.worker)).toBe(false);
    });

    it("worker (level 2) CANNOT spawn workflow (level 1) via canSpawn", () => {
      expect(canSpawn(AgentLevel.worker, AgentLevel.workflow)).toBe(false);
    });

    it("worker (level 2) CANNOT spawn orchestrator (level 0) via canSpawn", () => {
      expect(canSpawn(AgentLevel.worker, AgentLevel.orchestrator)).toBe(false);
    });

    it("vibe-agent CANNOT spawn any agent due to canSpawnAgents: false", () => {
      expect(VIBE_AGENT.canSpawnAgents).toBe(false);
      expect(canAgentSpawn(VIBE_AGENT, VIBE_AGENT)).toBe(false);
      expect(canAgentSpawn(VIBE_AGENT, PLAN_AGENT)).toBe(false);
      expect(canAgentSpawn(VIBE_AGENT, SPEC_ORCHESTRATOR)).toBe(false);
    });

    it("vibe-agent CANNOT spawn vibe-agent via registry lookup", () => {
      const worker = registry.get("vibe-agent");

      expect(worker).toBeDefined();
      expect(worker?.canSpawnAgents).toBe(false);
      expect(canAgentSpawn(worker!, worker!)).toBe(false);
    });
  });

  // ==========================================================================
  // Test Case 6: Agent without canSpawnAgents: true cannot spawn
  // ==========================================================================
  describe("canSpawnAgents Permission Check", () => {
    it("agent with canSpawnAgents: false cannot spawn even with valid level", () => {
      // Create a workflow agent that can't spawn
      const restrictedWorkflow: AgentConfig = {
        name: "restricted-workflow",
        level: AgentLevel.workflow,
        canSpawnAgents: false, // Disabled despite being workflow level
        description: "Workflow agent without spawn permission",
      };

      // Register it
      registry.register(restrictedWorkflow);
      const retrieved = registry.get("restricted-workflow");

      expect(retrieved).toBeDefined();
      expect(retrieved?.level).toBe(AgentLevel.workflow);
      expect(retrieved?.canSpawnAgents).toBe(false);

      // Should NOT be able to spawn worker despite level allowing it
      expect(canAgentSpawn(restrictedWorkflow, VIBE_AGENT)).toBe(false);
    });

    it("agent with canSpawnAgents: true but invalid level cannot spawn", () => {
      // Create a worker agent that has canSpawnAgents: true (invalid config)
      const invalidWorker: AgentConfig = {
        name: "invalid-worker",
        level: AgentLevel.worker,
        canSpawnAgents: true, // True, but workers can't spawn by level
        description: "Invalid worker config with spawn permission",
      };

      registry.register(invalidWorker);

      // canAgentSpawn checks level after canSpawnAgents
      // level 2 (worker) cannot spawn level 2 (worker) since 2 < 2 is false
      expect(canAgentSpawn(invalidWorker, VIBE_AGENT)).toBe(false);
    });

    it("built-in agents have correct canSpawnAgents settings", () => {
      const orchestrator = registry.get("spec-orchestrator");
      const workflow = registry.get("plan-agent");
      const worker = registry.get("vibe-agent");

      expect(orchestrator?.canSpawnAgents).toBe(true);
      expect(workflow?.canSpawnAgents).toBe(true);
      expect(worker?.canSpawnAgents).toBe(false);
    });
  });

  // ==========================================================================
  // Full spawn chain test
  // ==========================================================================
  describe("Full Spawn Chain", () => {
    it("complete chain: orchestrator → workflow → worker is valid", () => {
      const orchestrator = registry.get("spec-orchestrator")!;
      const workflow = registry.get("plan-agent")!;
      const worker = registry.get("vibe-agent")!;

      // Orchestrator can spawn workflow
      expect(canAgentSpawn(orchestrator, workflow)).toBe(true);

      // Workflow can spawn worker
      expect(canAgentSpawn(workflow, worker)).toBe(true);

      // Worker cannot spawn anything
      expect(canAgentSpawn(worker, orchestrator)).toBe(false);
      expect(canAgentSpawn(worker, workflow)).toBe(false);
      expect(canAgentSpawn(worker, worker)).toBe(false);
    });

    it("reverse chain is blocked at every step", () => {
      const orchestrator = registry.get("spec-orchestrator")!;
      const workflow = registry.get("plan-agent")!;
      const worker = registry.get("vibe-agent")!;

      // Worker cannot spawn workflow
      expect(canAgentSpawn(worker, workflow)).toBe(false);

      // Worker cannot spawn orchestrator
      expect(canAgentSpawn(worker, orchestrator)).toBe(false);

      // Workflow cannot spawn orchestrator
      expect(canAgentSpawn(workflow, orchestrator)).toBe(false);
    });
  });
});
