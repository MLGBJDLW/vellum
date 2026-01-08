import { describe, expect, it } from "vitest";
import { ErrorCode, VellumError } from "../../errors/index.js";
import {
  AGENT_STATES,
  type AgentState,
  createStateContext,
  isValidTransition,
  VALID_TRANSITIONS,
} from "../state.js";

describe("AgentState", () => {
  describe("AGENT_STATES", () => {
    it("should contain all 10 states", () => {
      expect(AGENT_STATES).toHaveLength(10);
    });

    it("should contain expected states", () => {
      const expectedStates: AgentState[] = [
        "idle",
        "streaming",
        "tool_executing",
        "wait_permission",
        "wait_input",
        "paused",
        "recovering",
        "retry",
        "terminated",
        "shutdown",
      ];
      expect(AGENT_STATES).toEqual(expectedStates);
    });
  });

  describe("VALID_TRANSITIONS", () => {
    it("idle can transition to streaming and shutdown", () => {
      expect(VALID_TRANSITIONS.idle).toContain("streaming");
      expect(VALID_TRANSITIONS.idle).toContain("shutdown");
      expect(VALID_TRANSITIONS.idle).toHaveLength(2);
    });

    it("streaming can transition to multiple states", () => {
      const expected = [
        "tool_executing",
        "wait_permission",
        "wait_input",
        "paused",
        "recovering",
        "retry",
        "terminated",
        "shutdown",
        "idle",
      ];
      for (const state of expected) {
        expect(VALID_TRANSITIONS.streaming).toContain(state);
      }
    });

    it("tool_executing can transition to expected states", () => {
      expect(VALID_TRANSITIONS.tool_executing).toContain("streaming");
      expect(VALID_TRANSITIONS.tool_executing).toContain("wait_permission");
      expect(VALID_TRANSITIONS.tool_executing).toContain("recovering");
      expect(VALID_TRANSITIONS.tool_executing).toContain("retry");
      expect(VALID_TRANSITIONS.tool_executing).toContain("terminated");
      expect(VALID_TRANSITIONS.tool_executing).toContain("shutdown");
    });

    it("wait_permission can transition to expected states", () => {
      expect(VALID_TRANSITIONS.wait_permission).toContain("tool_executing");
      expect(VALID_TRANSITIONS.wait_permission).toContain("streaming");
      expect(VALID_TRANSITIONS.wait_permission).toContain("paused");
      expect(VALID_TRANSITIONS.wait_permission).toContain("terminated");
      expect(VALID_TRANSITIONS.wait_permission).toContain("shutdown");
      expect(VALID_TRANSITIONS.wait_permission).toContain("idle");
    });

    it("wait_input can transition to expected states", () => {
      expect(VALID_TRANSITIONS.wait_input).toContain("streaming");
      expect(VALID_TRANSITIONS.wait_input).toContain("paused");
      expect(VALID_TRANSITIONS.wait_input).toContain("terminated");
      expect(VALID_TRANSITIONS.wait_input).toContain("shutdown");
      expect(VALID_TRANSITIONS.wait_input).toContain("idle");
    });

    it("paused can transition to expected states", () => {
      expect(VALID_TRANSITIONS.paused).toContain("streaming");
      expect(VALID_TRANSITIONS.paused).toContain("tool_executing");
      expect(VALID_TRANSITIONS.paused).toContain("wait_permission");
      expect(VALID_TRANSITIONS.paused).toContain("wait_input");
      expect(VALID_TRANSITIONS.paused).toContain("terminated");
      expect(VALID_TRANSITIONS.paused).toContain("shutdown");
      expect(VALID_TRANSITIONS.paused).toContain("idle");
    });

    it("recovering can transition to expected states", () => {
      expect(VALID_TRANSITIONS.recovering).toContain("streaming");
      expect(VALID_TRANSITIONS.recovering).toContain("retry");
      expect(VALID_TRANSITIONS.recovering).toContain("terminated");
      expect(VALID_TRANSITIONS.recovering).toContain("shutdown");
      expect(VALID_TRANSITIONS.recovering).toContain("idle");
    });

    it("retry can transition to expected states", () => {
      expect(VALID_TRANSITIONS.retry).toContain("streaming");
      expect(VALID_TRANSITIONS.retry).toContain("recovering");
      expect(VALID_TRANSITIONS.retry).toContain("terminated");
      expect(VALID_TRANSITIONS.retry).toContain("shutdown");
      expect(VALID_TRANSITIONS.retry).toContain("idle");
    });

    it("terminated can only transition to idle and shutdown", () => {
      expect(VALID_TRANSITIONS.terminated).toContain("idle");
      expect(VALID_TRANSITIONS.terminated).toContain("shutdown");
      expect(VALID_TRANSITIONS.terminated).toHaveLength(2);
    });

    it("shutdown is terminal (no valid transitions)", () => {
      expect(VALID_TRANSITIONS.shutdown).toHaveLength(0);
    });
  });

  describe("isValidTransition", () => {
    it("returns true for valid idle -> streaming", () => {
      expect(isValidTransition("idle", "streaming")).toBe(true);
    });

    it("returns true for valid streaming -> tool_executing", () => {
      expect(isValidTransition("streaming", "tool_executing")).toBe(true);
    });

    it("returns true for valid tool_executing -> streaming", () => {
      expect(isValidTransition("tool_executing", "streaming")).toBe(true);
    });

    it("returns true for valid paused -> idle", () => {
      expect(isValidTransition("paused", "idle")).toBe(true);
    });

    it("returns false for invalid idle -> tool_executing", () => {
      expect(isValidTransition("idle", "tool_executing")).toBe(false);
    });

    it("returns false for invalid shutdown -> any", () => {
      for (const state of AGENT_STATES) {
        expect(isValidTransition("shutdown", state)).toBe(false);
      }
    });

    it("returns false for invalid terminated -> streaming", () => {
      expect(isValidTransition("terminated", "streaming")).toBe(false);
    });

    it("returns false for self-transition on idle", () => {
      expect(isValidTransition("idle", "idle")).toBe(false);
    });
  });

  describe("createStateContext", () => {
    it("creates context with session ID", () => {
      const context = createStateContext("test-session");
      expect(context.sessionId).toBe("test-session");
    });

    it("creates context with empty message ID", () => {
      const context = createStateContext("test-session");
      expect(context.messageId).toBe("");
    });

    it("creates context with zero attempts", () => {
      const context = createStateContext("test-session");
      expect(context.attempt).toBe(0);
    });

    it("creates context with enteredAt timestamp", () => {
      const before = Date.now();
      const context = createStateContext("test-session");
      const after = Date.now();
      expect(context.enteredAt).toBeGreaterThanOrEqual(before);
      expect(context.enteredAt).toBeLessThanOrEqual(after);
    });

    it("creates context without lastError", () => {
      const context = createStateContext("test-session");
      expect(context.lastError).toBeUndefined();
    });

    it("creates context without metadata", () => {
      const context = createStateContext("test-session");
      expect(context.metadata).toBeUndefined();
    });
  });

  describe("Invalid Transition Error", () => {
    /**
     * Helper function that throws VellumError for invalid transitions.
     * This demonstrates the expected error handling pattern.
     */
    function assertValidTransition(from: AgentState, to: AgentState): void {
      if (!isValidTransition(from, to)) {
        throw new VellumError(
          `Invalid state transition from '${from}' to '${to}'`,
          ErrorCode.UNKNOWN,
          {
            context: { from, to },
          }
        );
      }
    }

    it("throws VellumError for invalid transition idle -> tool_executing", () => {
      expect(() => assertValidTransition("idle", "tool_executing")).toThrow(VellumError);
    });

    it("throws VellumError with correct message", () => {
      try {
        assertValidTransition("idle", "paused");
      } catch (error) {
        expect(error).toBeInstanceOf(VellumError);
        expect((error as VellumError).message).toContain("idle");
        expect((error as VellumError).message).toContain("paused");
      }
    });

    it("throws VellumError for shutdown -> idle", () => {
      expect(() => assertValidTransition("shutdown", "idle")).toThrow(VellumError);
    });

    it("does not throw for valid transition", () => {
      expect(() => assertValidTransition("idle", "streaming")).not.toThrow();
    });
  });
});
