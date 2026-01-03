// ============================================
// PlanModeHandler Tests
// ============================================
// T023: Write PlanModeHandler unit tests
// ============================================

import { beforeEach, describe, expect, it } from "vitest";
import { PLAN_MODE } from "../coding-modes.js";
import { AgentLevel } from "../level.js";
import type { UserMessage } from "../mode-handlers/index.js";
import { PlanModeHandler } from "../mode-handlers/plan.js";

describe("PlanModeHandler", () => {
  let handler: PlanModeHandler;

  beforeEach(() => {
    handler = new PlanModeHandler(PLAN_MODE);
  });

  describe("constructor", () => {
    it("should initialize with PLAN_MODE config", () => {
      expect(handler.config).toBe(PLAN_MODE);
    });

    it("should have correct coding mode", () => {
      expect(handler.config.codingMode).toBe("plan");
    });

    it("should start in planning phase", () => {
      expect(handler.currentPhase).toBe("planning");
    });
  });

  describe("phase management", () => {
    describe("initial state", () => {
      it("should start in planning phase", () => {
        expect(handler.currentPhase).toBe("planning");
      });

      it("should not have execution approved", () => {
        expect(handler.isExecutionApproved).toBe(false);
      });
    });

    describe("approveExecution", () => {
      it("should transition to executing phase", () => {
        handler.approveExecution();
        expect(handler.currentPhase).toBe("executing");
      });

      it("should mark execution as approved", () => {
        handler.approveExecution();
        expect(handler.isExecutionApproved).toBe(true);
      });

      it("should throw if not in planning phase", () => {
        handler.approveExecution();
        expect(() => handler.approveExecution()).toThrow(
          "Cannot approve execution: not in planning phase"
        );
      });
    });

    describe("resetToPlanning", () => {
      it("should reset to planning phase", () => {
        handler.approveExecution();
        handler.resetToPlanning();
        expect(handler.currentPhase).toBe("planning");
      });

      it("should clear execution approval", () => {
        handler.approveExecution();
        handler.resetToPlanning();
        expect(handler.isExecutionApproved).toBe(false);
      });
    });
  });

  describe("processMessage", () => {
    describe("in planning phase", () => {
      it("should pass through normal messages", async () => {
        const message: UserMessage = {
          content: "Analyze the codebase",
        };

        const result = await handler.processMessage(message);

        expect(result.shouldContinue).toBe(true);
        expect(result.modifiedMessage?.content).toBe(message.content);
      });

      it("should require checkpoint when plan is complete", async () => {
        const message: UserMessage = {
          content: "Plan complete, ready to execute",
        };

        const result = await handler.processMessage(message);

        expect(result.requiresCheckpoint).toBe(true);
        expect(result.shouldContinue).toBe(false);
      });

      it("should require checkpoint with metadata signal", async () => {
        const message: UserMessage = {
          content: "Here is my analysis",
          metadata: { planComplete: true },
        };

        const result = await handler.processMessage(message);

        expect(result.requiresCheckpoint).toBe(true);
      });

      it("should transition to executing on approval", async () => {
        const message: UserMessage = {
          content: "yes",
        };

        const result = await handler.processMessage(message);

        expect(handler.currentPhase).toBe("executing");
        expect(result.shouldContinue).toBe(true);
        expect(result.modifiedMessage?.content).toContain("[Execution approved]");
      });

      it("should handle various approval phrases", async () => {
        const approvalPhrases = [
          "yes",
          "y",
          "approve",
          "proceed",
          "go ahead",
          "execute",
          "do it",
          "lgtm",
          "ok",
        ];

        for (const phrase of approvalPhrases) {
          handler.resetToPlanning();
          const message: UserMessage = { content: phrase };
          await handler.processMessage(message);
          expect(handler.currentPhase).toBe("executing");
        }
      });
    });

    describe("in executing phase", () => {
      beforeEach(() => {
        handler.approveExecution();
      });

      it("should pass through messages", async () => {
        const message: UserMessage = {
          content: "Implement the feature",
        };

        const result = await handler.processMessage(message);

        expect(result.shouldContinue).toBe(true);
        expect(result.modifiedMessage?.content).toBe(message.content);
      });

      it("should not require checkpoints", async () => {
        const message: UserMessage = {
          content: "Create the file",
        };

        const result = await handler.processMessage(message);

        expect(result.requiresCheckpoint).toBeUndefined();
      });
    });
  });

  describe("getToolAccess", () => {
    describe("in planning phase", () => {
      it("should return read-only access", () => {
        const access = handler.getToolAccess();

        expect(access.groups).toContain("read");
        expect(access.groups).not.toContain("write");
        expect(access.groups).not.toContain("execute");
      });

      it("should have no disabled tools", () => {
        const access = handler.getToolAccess();
        expect(access.disabled).toHaveLength(0);
      });
    });

    describe("in executing phase", () => {
      beforeEach(() => {
        handler.approveExecution();
      });

      it("should return read, write, and execute access", () => {
        const access = handler.getToolAccess();

        expect(access.groups).toContain("read");
        expect(access.groups).toContain("write");
        expect(access.groups).toContain("execute");
      });

      it("should not include all group", () => {
        const access = handler.getToolAccess();
        expect(access.groups).not.toContain("all");
      });
    });

    it("should change based on phase", () => {
      const planningAccess = handler.getToolAccess();
      handler.approveExecution();
      const executingAccess = handler.getToolAccess();

      expect(planningAccess.groups).not.toEqual(executingAccess.groups);
    });
  });

  describe("onEnter", () => {
    it("should reset to planning phase", async () => {
      handler.approveExecution();
      await handler.onEnter();
      expect(handler.currentPhase).toBe("planning");
    });

    it("should clear execution approval", async () => {
      handler.approveExecution();
      await handler.onEnter();
      expect(handler.isExecutionApproved).toBe(false);
    });
  });

  describe("onExit", () => {
    it("should reset to planning phase", async () => {
      handler.approveExecution();
      await handler.onExit();
      expect(handler.currentPhase).toBe("planning");
    });

    it("should clear execution approval", async () => {
      handler.approveExecution();
      await handler.onExit();
      expect(handler.isExecutionApproved).toBe(false);
    });
  });

  describe("agentLevel", () => {
    it("should return workflow level", () => {
      expect(handler.agentLevel).toBe(AgentLevel.workflow);
    });
  });

  describe("requiresCheckpoints", () => {
    it("should return true", () => {
      expect(handler.requiresCheckpoints).toBe(true);
    });
  });

  describe("checkpointCount", () => {
    it("should return 1", () => {
      expect(handler.checkpointCount).toBe(1);
    });
  });

  describe("config values", () => {
    it("should have correct approval policy", () => {
      expect(handler.config.approvalPolicy).toBe("auto-edit");
    });

    it("should have correct sandbox policy", () => {
      expect(handler.config.sandboxPolicy).toBe("workspace-write");
    });
  });

  describe("lifecycle integration", () => {
    it("should work correctly through full lifecycle", async () => {
      // Enter mode
      await handler.onEnter();
      expect(handler.currentPhase).toBe("planning");

      // Planning phase messages
      const planMsg: UserMessage = { content: "Analyze the code" };
      const planResult = await handler.processMessage(planMsg);
      expect(planResult.shouldContinue).toBe(true);

      // Read-only access
      let access = handler.getToolAccess();
      expect(access.groups).toContain("read");
      expect(access.groups).not.toContain("write");

      // Complete plan
      const completeMsg: UserMessage = { content: "Plan complete, awaiting approval" };
      const completeResult = await handler.processMessage(completeMsg);
      expect(completeResult.requiresCheckpoint).toBe(true);

      // Approve execution
      const approveMsg: UserMessage = { content: "proceed" };
      await handler.processMessage(approveMsg);
      expect(handler.currentPhase).toBe("executing");

      // Full access in executing phase
      access = handler.getToolAccess();
      expect(access.groups).toContain("write");
      expect(access.groups).toContain("execute");

      // Execute
      const execMsg: UserMessage = { content: "Create the file" };
      const execResult = await handler.processMessage(execMsg);
      expect(execResult.shouldContinue).toBe(true);

      // Exit mode
      await handler.onExit();
      expect(handler.currentPhase).toBe("planning");
    });
  });
});
