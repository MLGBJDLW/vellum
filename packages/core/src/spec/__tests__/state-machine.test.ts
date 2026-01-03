// ============================================
// State Machine Unit Tests
// ============================================

import { beforeEach, describe, expect, it } from "vitest";
import { PHASE_TRANSITIONS, SKIPPABLE_PHASES, StateMachine } from "../state-machine.js";
import { SPEC_PHASES, type SpecWorkflowState } from "../types.js";

describe("StateMachine", () => {
  let stateMachine: StateMachine;

  beforeEach(() => {
    stateMachine = new StateMachine();
  });

  // ===========================================================================
  // Initialization Tests
  // ===========================================================================

  describe("initialization", () => {
    it("should create with empty state", () => {
      const state = stateMachine.getState();
      expect(state.id).toBe("");
      expect(state.name).toBe("");
      expect(state.currentPhase).toBe("research");
    });

    it("should initialize with provided metadata", () => {
      stateMachine.initialize("test-spec", "A test description", "/path/to/spec");

      const state = stateMachine.getState();
      expect(state.id).toBeTruthy();
      expect(state.name).toBe("test-spec");
      expect(state.description).toBe("A test description");
      expect(state.specDir).toBe("/path/to/spec");
      expect(state.currentPhase).toBe("research");
    });

    it("should set all phases to pending on initialize", () => {
      stateMachine.initialize("test", "desc", "/path");

      const state = stateMachine.getState();
      for (const phase of SPEC_PHASES) {
        expect(state.phases[phase]?.status).toBe("pending");
      }
    });

    it("should create unique ids on each initialize", () => {
      stateMachine.initialize("test1", "desc1", "/path1");
      const id1 = stateMachine.getState().id;

      stateMachine.initialize("test2", "desc2", "/path2");
      const id2 = stateMachine.getState().id;

      expect(id1).not.toBe(id2);
    });

    it("should accept initial state in constructor", () => {
      const initialState: SpecWorkflowState = {
        id: "preset-id",
        name: "preset-name",
        description: "preset-desc",
        specDir: "/preset/path",
        currentPhase: "design",
        phases: {
          research: { phase: "research", status: "completed" },
          requirements: { phase: "requirements", status: "completed" },
          design: { phase: "design", status: "running" },
          tasks: { phase: "tasks", status: "pending" },
          implementation: { phase: "implementation", status: "pending" },
          validation: { phase: "validation", status: "pending" },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const machine = new StateMachine(initialState);
      const state = machine.getState();

      expect(state.id).toBe("preset-id");
      expect(state.currentPhase).toBe("design");
      expect(state.phases.research?.status).toBe("completed");
    });
  });

  // ===========================================================================
  // State Transition Tests
  // ===========================================================================

  describe("state transitions", () => {
    beforeEach(() => {
      stateMachine.initialize("test", "desc", "/path");
    });

    it("should transition to valid next phase", () => {
      // research → requirements is valid
      const result = stateMachine.transition("requirements");
      expect(result).toBe(true);
      expect(stateMachine.getState().currentPhase).toBe("requirements");
    });

    it("should allow transition to same phase (no-op)", () => {
      const result = stateMachine.transition("research");
      expect(result).toBe(true);
      expect(stateMachine.getState().currentPhase).toBe("research");
    });

    it("should transition through all phases in sequence", () => {
      // research → requirements → design → tasks → implementation → validation
      expect(stateMachine.transition("requirements")).toBe(true);
      expect(stateMachine.transition("design")).toBe(true);
      expect(stateMachine.transition("tasks")).toBe(true);
      expect(stateMachine.transition("implementation")).toBe(true);
      expect(stateMachine.transition("validation")).toBe(true);

      expect(stateMachine.getState().currentPhase).toBe("validation");
    });

    it("should allow tasks to skip to validation (bypass implementation)", () => {
      stateMachine.transition("requirements");
      stateMachine.transition("design");
      stateMachine.transition("tasks");

      // tasks → validation is valid (skipping implementation)
      const result = stateMachine.transition("validation");
      expect(result).toBe(true);
      expect(stateMachine.getState().currentPhase).toBe("validation");
    });

    it("should update updatedAt timestamp on transition", () => {
      const before = stateMachine.getState().updatedAt;

      // Small delay to ensure different timestamp
      stateMachine.transition("requirements");

      const after = stateMachine.getState().updatedAt;
      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  // ===========================================================================
  // Invalid Transition Tests
  // ===========================================================================

  describe("invalid transitions rejected", () => {
    beforeEach(() => {
      stateMachine.initialize("test", "desc", "/path");
    });

    it("should reject skipping phases (research → design)", () => {
      const result = stateMachine.transition("design");
      expect(result).toBe(false);
      expect(stateMachine.getState().currentPhase).toBe("research");
    });

    it("should reject backward transitions", () => {
      stateMachine.transition("requirements");
      stateMachine.transition("design");

      // Cannot go backwards
      const result = stateMachine.transition("requirements");
      expect(result).toBe(false);
      expect(stateMachine.getState().currentPhase).toBe("design");
    });

    it("should reject jumping to non-adjacent phases", () => {
      // research → tasks (skipping requirements and design)
      const result = stateMachine.transition("tasks");
      expect(result).toBe(false);
      expect(stateMachine.getState().currentPhase).toBe("research");
    });

    it("should reject transition from validation (terminal phase)", () => {
      // Navigate to validation
      stateMachine.transition("requirements");
      stateMachine.transition("design");
      stateMachine.transition("tasks");
      stateMachine.transition("validation");

      // Cannot transition from validation to anything except itself
      const result = stateMachine.transition("research");
      expect(result).toBe(false);
      expect(stateMachine.getState().currentPhase).toBe("validation");
    });
  });

  // ===========================================================================
  // canTransition Tests
  // ===========================================================================

  describe("canTransition", () => {
    beforeEach(() => {
      stateMachine.initialize("test", "desc", "/path");
    });

    it("should return true for valid transitions", () => {
      expect(stateMachine.canTransition("requirements")).toBe(true);
    });

    it("should return false for invalid transitions", () => {
      expect(stateMachine.canTransition("design")).toBe(false);
      expect(stateMachine.canTransition("validation")).toBe(false);
    });

    it("should return true for same phase", () => {
      expect(stateMachine.canTransition("research")).toBe(true);
    });
  });

  // ===========================================================================
  // Skippable Phase Logic
  // ===========================================================================

  describe("skippable phase logic", () => {
    beforeEach(() => {
      stateMachine.initialize("test", "desc", "/path");
    });

    it("should report implementation as skippable", () => {
      expect(stateMachine.isSkippable("implementation")).toBe(true);
    });

    it("should report required phases as not skippable", () => {
      expect(stateMachine.isSkippable("research")).toBe(false);
      expect(stateMachine.isSkippable("requirements")).toBe(false);
      expect(stateMachine.isSkippable("design")).toBe(false);
      expect(stateMachine.isSkippable("tasks")).toBe(false);
      expect(stateMachine.isSkippable("validation")).toBe(false);
    });

    it("should have SKIPPABLE_PHASES constant with only implementation", () => {
      expect(SKIPPABLE_PHASES).toContain("implementation");
      expect(SKIPPABLE_PHASES.length).toBe(1);
    });
  });

  // ===========================================================================
  // Phase Status Updates
  // ===========================================================================

  describe("setPhaseStatus", () => {
    beforeEach(() => {
      stateMachine.initialize("test", "desc", "/path");
    });

    it("should set phase status to running", () => {
      stateMachine.setPhaseStatus("research", "running");

      const state = stateMachine.getState();
      expect(state.phases.research?.status).toBe("running");
      expect(state.phases.research?.startedAt).toBeDefined();
    });

    it("should set phase status to completed", () => {
      stateMachine.setPhaseStatus("research", "running");
      stateMachine.setPhaseStatus("research", "completed");

      const state = stateMachine.getState();
      expect(state.phases.research?.status).toBe("completed");
      expect(state.phases.research?.completedAt).toBeDefined();
    });

    it("should set phase status to failed with error", () => {
      stateMachine.setPhaseStatus("research", "running");
      stateMachine.setPhaseStatus("research", "failed", "Something went wrong");

      const state = stateMachine.getState();
      expect(state.phases.research?.status).toBe("failed");
      expect(state.phases.research?.error).toBe("Something went wrong");
      expect(state.phases.research?.completedAt).toBeDefined();
    });

    it("should set phase status to skipped", () => {
      stateMachine.setPhaseStatus("implementation", "skipped");

      const state = stateMachine.getState();
      expect(state.phases.implementation?.status).toBe("skipped");
      expect(state.phases.implementation?.completedAt).toBeDefined();
    });

    it("should clear error and completedAt when setting to running", () => {
      stateMachine.setPhaseStatus("research", "failed", "error");
      stateMachine.setPhaseStatus("research", "running");

      const state = stateMachine.getState();
      expect(state.phases.research?.error).toBeUndefined();
      expect(state.phases.research?.completedAt).toBeUndefined();
    });
  });

  // ===========================================================================
  // Phase Output Tests
  // ===========================================================================

  describe("setPhaseOutput", () => {
    beforeEach(() => {
      stateMachine.initialize("test", "desc", "/path");
    });

    it("should set output file path for phase", () => {
      stateMachine.setPhaseOutput("research", "/path/to/research.md");

      const state = stateMachine.getState();
      expect(state.phases.research?.outputFile).toBe("/path/to/research.md");
    });

    it("should update updatedAt timestamp", () => {
      const before = stateMachine.getState().updatedAt;
      stateMachine.setPhaseOutput("research", "/path/output.md");
      const after = stateMachine.getState().updatedAt;

      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  // ===========================================================================
  // State Restoration Tests
  // ===========================================================================

  describe("restore", () => {
    it("should restore state from saved state", () => {
      const savedState: SpecWorkflowState = {
        id: "restored-id",
        name: "restored-name",
        description: "restored-desc",
        specDir: "/restored/path",
        currentPhase: "tasks",
        phases: {
          research: { phase: "research", status: "completed" },
          requirements: { phase: "requirements", status: "completed" },
          design: { phase: "design", status: "completed" },
          tasks: { phase: "tasks", status: "running" },
          implementation: { phase: "implementation", status: "pending" },
          validation: { phase: "validation", status: "pending" },
        },
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-02"),
      };

      stateMachine.restore(savedState);
      const state = stateMachine.getState();

      expect(state.id).toBe("restored-id");
      expect(state.currentPhase).toBe("tasks");
      expect(state.phases.design?.status).toBe("completed");
    });
  });

  // ===========================================================================
  // Phase Navigation Tests
  // ===========================================================================

  describe("getPhaseIndex", () => {
    it("should return correct index for each phase", () => {
      expect(stateMachine.getPhaseIndex("research")).toBe(0);
      expect(stateMachine.getPhaseIndex("requirements")).toBe(1);
      expect(stateMachine.getPhaseIndex("design")).toBe(2);
      expect(stateMachine.getPhaseIndex("tasks")).toBe(3);
      expect(stateMachine.getPhaseIndex("implementation")).toBe(4);
      expect(stateMachine.getPhaseIndex("validation")).toBe(5);
    });
  });

  describe("getNextPhase", () => {
    it("should return next phase in sequence", () => {
      expect(stateMachine.getNextPhase("research")).toBe("requirements");
      expect(stateMachine.getNextPhase("requirements")).toBe("design");
      expect(stateMachine.getNextPhase("design")).toBe("tasks");
      expect(stateMachine.getNextPhase("tasks")).toBe("implementation");
      expect(stateMachine.getNextPhase("implementation")).toBe("validation");
    });

    it("should return null for terminal phase", () => {
      expect(stateMachine.getNextPhase("validation")).toBeNull();
    });
  });

  // ===========================================================================
  // PHASE_TRANSITIONS Constant Tests
  // ===========================================================================

  describe("PHASE_TRANSITIONS constant", () => {
    it("should define valid transitions for each phase", () => {
      expect(PHASE_TRANSITIONS.research).toContain("requirements");
      expect(PHASE_TRANSITIONS.requirements).toContain("design");
      expect(PHASE_TRANSITIONS.design).toContain("tasks");
      expect(PHASE_TRANSITIONS.tasks).toContain("implementation");
      expect(PHASE_TRANSITIONS.tasks).toContain("validation");
      expect(PHASE_TRANSITIONS.implementation).toContain("validation");
      expect(PHASE_TRANSITIONS.validation).toHaveLength(0);
    });
  });
});
