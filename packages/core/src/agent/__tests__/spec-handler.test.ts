// ============================================
// SpecModeHandler Integration Tests
// ============================================
// T027: Write SpecModeHandler integration tests
// ============================================

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { SPEC_MODE, SPEC_PHASE_CONFIG, SPEC_PHASES, type SpecPhase } from "../coding-modes.js";
import { AgentLevel } from "../level.js";
import type { UserMessage } from "../mode-handlers/index.js";
import { SpecModeHandler } from "../mode-handlers/spec.js";

describe("SpecModeHandler", () => {
  let handler: SpecModeHandler;
  let fileChecker: Mock<(path: string) => Promise<boolean>>;

  beforeEach(() => {
    fileChecker = vi.fn().mockResolvedValue(true);
    handler = new SpecModeHandler(SPEC_MODE, fileChecker as (path: string) => Promise<boolean>);
  });

  describe("constructor", () => {
    it("should initialize with SPEC_MODE config", () => {
      expect(handler.config).toBe(SPEC_MODE);
    });

    it("should have correct coding mode", () => {
      expect(handler.config.codingMode).toBe("spec");
    });

    it("should start in research phase", () => {
      expect(handler.currentPhase).toBe("research");
    });

    it("should start at phase number 1", () => {
      expect(handler.phaseNumber).toBe(1);
    });
  });

  describe("phase management", () => {
    describe("initial state", () => {
      it("should have empty completed phases", () => {
        expect(handler.completedPhases).toHaveLength(0);
      });

      it("should return complete state", () => {
        const state = handler.getState();
        expect(state.currentPhase).toBe("research");
        expect(state.phaseNumber).toBe(1);
        expect(state.completedPhases).toHaveLength(0);
        expect(state.currentPhaseValidated).toBe(false);
      });
    });

    describe("phase transitions", () => {
      it("should advance through all 6 phases", async () => {
        const expectedPhases: SpecPhase[] = [
          "research",
          "requirements",
          "design",
          "tasks",
          "implementation",
          "validation",
        ];

        for (let i = 0; i < expectedPhases.length - 1; i++) {
          expect(handler.currentPhase).toBe(expectedPhases[i]);
          expect(handler.phaseNumber).toBe(i + 1);

          // Validate current phase
          await handler.validatePhaseCompletion();
          handler.setPhase(handler.currentPhase, true);

          // Advance
          handler.advancePhase();
        }

        // Should be at validation (phase 6)
        expect(handler.currentPhase).toBe("validation");
        expect(handler.phaseNumber).toBe(6);
      });

      it("should track completed phases", async () => {
        // Complete research
        handler.setPhase("research", true);
        handler.advancePhase();
        expect(handler.completedPhases).toContain("research");

        // Complete requirements
        handler.setPhase("requirements", true);
        handler.advancePhase();
        expect(handler.completedPhases).toContain("requirements");
        expect(handler.completedPhases).toHaveLength(2);
      });

      it("should throw when advancing without validation", () => {
        expect(() => handler.advancePhase()).toThrow(
          'Cannot advance: phase "research" not validated'
        );
      });

      it("should throw when advancing from final phase", async () => {
        // Move to validation phase
        for (const phase of SPEC_PHASES.slice(0, -1)) {
          handler.setPhase(phase, true);
          handler.advancePhase();
        }

        // Try to advance from validation
        handler.setPhase("validation", true);
        expect(() => handler.advancePhase()).toThrow("Cannot advance: already at final phase");
      });
    });

    describe("setPhase", () => {
      it("should set phase directly", () => {
        handler.setPhase("implementation");
        expect(handler.currentPhase).toBe("implementation");
        expect(handler.phaseNumber).toBe(5);
      });

      it("should set validation state", () => {
        handler.setPhase("design", true);
        const state = handler.getState();
        expect(state.currentPhaseValidated).toBe(true);
      });
    });
  });

  describe("validatePhaseCompletion (T026)", () => {
    it("should check deliverables exist", async () => {
      const result = await handler.validatePhaseCompletion();

      expect(fileChecker).toHaveBeenCalledWith("research.md");
      expect(result.isComplete).toBe(true);
    });

    it("should report missing deliverables", async () => {
      fileChecker.mockResolvedValue(false);

      const result = await handler.validatePhaseCompletion();

      expect(result.isComplete).toBe(false);
      expect(result.missingDeliverables).toContain("research.md");
    });

    it("should validate each phase deliverables", async () => {
      const phaseDeliverables: Record<SpecPhase, string[]> = {
        research: ["research.md"],
        requirements: ["requirements.md"],
        design: ["design.md"],
        tasks: ["tasks.md"],
        implementation: [],
        validation: ["validation-report.md"],
      };

      for (const phase of SPEC_PHASES) {
        handler.setPhase(phase);
        fileChecker.mockClear();
        fileChecker.mockResolvedValue(true);

        await handler.validatePhaseCompletion();

        const expected = phaseDeliverables[phase];
        if (phase !== "implementation") {
          for (const deliverable of expected) {
            expect(fileChecker).toHaveBeenCalledWith(deliverable);
          }
        }
      }
    });

    it("should handle implementation phase with dynamic deliverables", async () => {
      handler.setPhase("implementation");

      const result = await handler.validatePhaseCompletion();

      expect(result.isComplete).toBe(true);
      expect(result.message).toContain("dynamic deliverables");
    });

    it("should provide descriptive messages", async () => {
      // Success message
      let result = await handler.validatePhaseCompletion();
      expect(result.message).toContain("complete");

      // Failure message
      fileChecker.mockResolvedValue(false);
      result = await handler.validatePhaseCompletion();
      expect(result.message).toContain("incomplete");
      expect(result.message).toContain("research.md");
    });
  });

  describe("getToolAccess / getPhaseToolAccess (T025)", () => {
    describe("read-only phases (1-4)", () => {
      const readOnlyPhases: SpecPhase[] = ["research", "requirements", "design", "tasks"];

      it.each(readOnlyPhases)("should return read-only access for %s phase", (phase) => {
        handler.setPhase(phase);
        const access = handler.getToolAccess();

        expect(access.groups).toContain("read");
        expect(access.groups).not.toContain("write");
        expect(access.groups).not.toContain("all");
      });
    });

    describe("implementation phase (5)", () => {
      it("should return full access", () => {
        handler.setPhase("implementation");
        const access = handler.getToolAccess();

        expect(access.groups).toContain("all");
      });
    });

    describe("validation phase (6)", () => {
      it("should return read + test access", () => {
        handler.setPhase("validation");
        const access = handler.getToolAccess();

        expect(access.groups).toContain("read");
        expect(access.enabled).toContain("run_tests");
        expect(access.enabled).toContain("vitest");
      });
    });

    it("should match SPEC_PHASE_CONFIG", () => {
      for (const phase of SPEC_PHASES) {
        handler.setPhase(phase);
        const access = handler.getToolAccess();
        const config = SPEC_PHASE_CONFIG[phase];

        if (config.toolAccess === "read-only") {
          expect(access.groups).toContain("read");
          expect(access.groups).not.toContain("write");
        } else if (config.toolAccess === "full") {
          expect(access.groups).toContain("all");
        } else if (config.toolAccess === "read-test") {
          expect(access.groups).toContain("read");
          expect(access.enabled.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("processMessage", () => {
    it("should add phase metadata to messages", async () => {
      const message: UserMessage = { content: "Analyze the codebase" };

      const result = await handler.processMessage(message);

      expect(result.modifiedMessage?.metadata?.phase).toBe("research");
      expect(result.modifiedMessage?.metadata?.phaseNumber).toBe(1);
    });

    it("should handle validation requests", async () => {
      const message: UserMessage = { content: "validate phase" };

      const result = await handler.processMessage(message);

      // Phase should be validated now
      expect(result.requiresCheckpoint).toBe(true);
    });

    it("should handle phase advance approval", async () => {
      // First validate the phase
      handler.setPhase("research", true);

      const message: UserMessage = { content: "next phase" };
      await handler.processMessage(message);

      expect(handler.currentPhase).toBe("requirements");
    });

    it("should block advance without validation", async () => {
      const message: UserMessage = { content: "advance" };

      const result = await handler.processMessage(message);

      expect(result.requiresCheckpoint).toBe(true);
      expect(handler.currentPhase).toBe("research"); // Still in research
    });
  });

  describe("onEnter", () => {
    it("should reset to research phase", async () => {
      handler.setPhase("design", true);
      handler.advancePhase();

      await handler.onEnter();

      expect(handler.currentPhase).toBe("research");
    });

    it("should clear completed phases", async () => {
      handler.setPhase("research", true);
      handler.advancePhase();

      await handler.onEnter();

      expect(handler.completedPhases).toHaveLength(0);
    });

    it("should clear validation state", async () => {
      handler.setPhase("research", true);

      await handler.onEnter();

      expect(handler.getState().currentPhaseValidated).toBe(false);
    });
  });

  describe("onExit", () => {
    it("should preserve completed phases", async () => {
      handler.setPhase("research", true);
      handler.advancePhase();

      await handler.onExit();

      expect(handler.completedPhases).toContain("research");
    });

    it("should clear validation state", async () => {
      handler.setPhase("research", true);

      await handler.onExit();

      expect(handler.getState().currentPhaseValidated).toBe(false);
    });
  });

  describe("agentLevel", () => {
    it("should return orchestrator level", () => {
      expect(handler.agentLevel).toBe(AgentLevel.orchestrator);
    });
  });

  describe("requiresCheckpoints", () => {
    it("should return true", () => {
      expect(handler.requiresCheckpoints).toBe(true);
    });
  });

  describe("checkpointCount", () => {
    it("should return 6", () => {
      expect(handler.checkpointCount).toBe(6);
    });
  });

  describe("canSpawnAgents", () => {
    it("should return true for SPEC_MODE", () => {
      expect(handler.canSpawnAgents).toBe(true);
    });

    it("should return empty spawnable agents list", () => {
      // Note: Spawnable agents are now managed at the orchestrator/registry level,
      // not in the mode handler. The handler returns empty array and the
      // orchestrator determines what agents can be spawned based on AgentConfig.
      expect(handler.spawnableAgents).toEqual([]);
    });
  });

  describe("config values", () => {
    it("should have correct approval policy", () => {
      expect(handler.config.approvalPolicy).toBe("suggest");
    });

    it("should have correct sandbox policy", () => {
      expect(handler.config.sandboxPolicy).toBe("workspace-read");
    });
  });

  describe("full workflow integration", () => {
    it("should complete entire 6-phase workflow", async () => {
      const phases: SpecPhase[] = [
        "research",
        "requirements",
        "design",
        "tasks",
        "implementation",
        "validation",
      ];

      // Enter mode
      await handler.onEnter();

      for (let i = 0; i < phases.length; i++) {
        const phase = phases.at(i);
        if (!phase) continue;
        expect(handler.currentPhase).toBe(phase);
        expect(handler.phaseNumber).toBe(i + 1);

        // Work in phase
        const workMsg: UserMessage = { content: `Working on ${phase}` };
        await handler.processMessage(workMsg);

        // Verify tool access
        const access = handler.getToolAccess();
        const config = SPEC_PHASE_CONFIG[phase];
        if (config.toolAccess === "full") {
          expect(access.groups).toContain("all");
        } else {
          expect(access.groups).toContain("read");
        }

        // Validate phase (if not last)
        if (i < phases.length - 1) {
          const validation = await handler.validatePhaseCompletion();
          expect(validation.isComplete).toBe(true);
          handler.setPhase(phase, true);

          // Advance
          const advanceMsg: UserMessage = { content: "next phase" };
          await handler.processMessage(advanceMsg);
        }
      }

      // Final state
      expect(handler.currentPhase).toBe("validation");
      expect(handler.completedPhases).toHaveLength(5);

      // Exit
      await handler.onExit();
    });

    it("should handle validation failure and retry", async () => {
      // Simulate missing deliverable
      fileChecker.mockResolvedValue(false);

      const result = await handler.validatePhaseCompletion();
      expect(result.isComplete).toBe(false);
      expect(handler.currentPhase).toBe("research"); // Still in research

      // Cannot advance
      expect(() => handler.advancePhase()).toThrow();

      // Fix the issue (deliverable now exists)
      fileChecker.mockResolvedValue(true);

      // Retry validation
      const retryResult = await handler.validatePhaseCompletion();
      expect(retryResult.isComplete).toBe(true);

      // Now can advance
      handler.setPhase("research", true);
      handler.advancePhase();
      expect(handler.currentPhase).toBe("requirements");
    });
  });
});
