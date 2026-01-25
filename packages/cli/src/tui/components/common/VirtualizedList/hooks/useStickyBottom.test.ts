/**
 * Tests for useStickyBottom Hook
 *
 * Tests the 3-state Follow Mode state machine:
 * - auto: Default state, automatically follows new content
 * - off: User scrolled away (wheel-up), no auto-follow
 * - locked: User explicitly requested bottom (End key), locks follow
 *
 * @module tui/components/common/VirtualizedList/hooks/useStickyBottom.test
 */

import { describe, expect, it } from "vitest";
import {
  CONTENT_STABLE_THRESHOLD_MS,
  type FollowMode,
  initialState,
  type StickyBottomAction,
  type StickyBottomInternalState,
  stickyBottomReducer,
} from "./useStickyBottom.js";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a state with specific values for testing.
 */
function createState(overrides: Partial<StickyBottomInternalState>): StickyBottomInternalState {
  return {
    ...initialState,
    ...overrides,
  };
}

// ============================================================================
// Tests: State Machine Transitions
// ============================================================================

describe("useStickyBottom", () => {
  describe("stickyBottomReducer", () => {
    describe("auto mode transitions", () => {
      const autoState = createState({ followMode: "auto" });

      it("should transition to off on wheel-up", () => {
        const action: StickyBottomAction = {
          type: "SCROLL",
          delta: -10,
          source: "wheel",
          isAtBottom: false,
        };

        const newState = stickyBottomReducer(autoState, action);

        expect(newState.followMode).toBe("off");
        expect(newState.lastScrollDirection).toBe("up");
        expect(newState.newMessageCount).toBe(0);
      });

      it("should stay in auto on wheel-down", () => {
        const action: StickyBottomAction = {
          type: "SCROLL",
          delta: 10,
          source: "wheel",
          isAtBottom: true,
        };

        const newState = stickyBottomReducer(autoState, action);

        expect(newState.followMode).toBe("auto");
        expect(newState.lastScrollDirection).toBe("down");
      });

      it("should stay in auto on keyboard navigation up", () => {
        const action: StickyBottomAction = {
          type: "SCROLL",
          delta: -100,
          source: "keyboard",
          isAtBottom: false,
        };

        const newState = stickyBottomReducer(autoState, action);

        expect(newState.followMode).toBe("auto");
        expect(newState.lastScrollDirection).toBe("up");
      });

      it("should stay in auto on keyboard navigation down", () => {
        const action: StickyBottomAction = {
          type: "SCROLL",
          delta: 100,
          source: "keyboard",
          isAtBottom: true,
        };

        const newState = stickyBottomReducer(autoState, action);

        expect(newState.followMode).toBe("auto");
        expect(newState.lastScrollDirection).toBe("down");
      });

      it("should stay in auto on programmatic scroll up", () => {
        const action: StickyBottomAction = {
          type: "SCROLL",
          delta: -50,
          source: "programmatic",
          isAtBottom: false,
        };

        const newState = stickyBottomReducer(autoState, action);

        expect(newState.followMode).toBe("auto");
      });

      it("should stay in auto on programmatic scroll down", () => {
        const action: StickyBottomAction = {
          type: "SCROLL",
          delta: 50,
          source: "programmatic",
          isAtBottom: true,
        };

        const newState = stickyBottomReducer(autoState, action);

        expect(newState.followMode).toBe("auto");
      });

      it("should handle zero delta scroll (no direction change)", () => {
        const stateWithDirection = createState({
          followMode: "auto",
          lastScrollDirection: "down",
        });

        const action: StickyBottomAction = {
          type: "SCROLL",
          delta: 0,
          source: "wheel",
          isAtBottom: true,
        };

        const newState = stickyBottomReducer(stateWithDirection, action);

        expect(newState.followMode).toBe("auto");
        expect(newState.lastScrollDirection).toBe(null);
      });

      it("should update prevDataLength on new content in auto mode", () => {
        const action: StickyBottomAction = {
          type: "NEW_CONTENT",
          dataLength: 10,
          isStreaming: false,
        };

        const newState = stickyBottomReducer(autoState, action);

        expect(newState.followMode).toBe("auto");
        expect(newState.prevDataLength).toBe(10);
        expect(newState.newMessageCount).toBe(0); // Should NOT increment in auto
      });

      it("should not increment newMessageCount in auto mode", () => {
        const stateWithData = createState({
          followMode: "auto",
          prevDataLength: 5,
        });

        const action: StickyBottomAction = {
          type: "NEW_CONTENT",
          dataLength: 10,
          isStreaming: false,
        };

        const newState = stickyBottomReducer(stateWithData, action);

        expect(newState.newMessageCount).toBe(0);
        expect(newState.prevDataLength).toBe(10);
      });
    });

    describe("off mode transitions", () => {
      const offState = createState({
        followMode: "off",
        lastScrollDirection: "up",
      });

      it("should transition to auto when wheel-down reaches bottom", () => {
        const action: StickyBottomAction = {
          type: "SCROLL",
          delta: 10,
          source: "wheel",
          isAtBottom: true,
        };

        const newState = stickyBottomReducer(offState, action);

        expect(newState.followMode).toBe("auto");
        expect(newState.lastScrollDirection).toBe("down");
        expect(newState.newMessageCount).toBe(0);
      });

      it("should stay in off when wheel-down does not reach bottom", () => {
        const action: StickyBottomAction = {
          type: "SCROLL",
          delta: 10,
          source: "wheel",
          isAtBottom: false,
        };

        const newState = stickyBottomReducer(offState, action);

        expect(newState.followMode).toBe("off");
        expect(newState.lastScrollDirection).toBe("down");
      });

      it("should stay in off on continued wheel-up", () => {
        const action: StickyBottomAction = {
          type: "SCROLL",
          delta: -10,
          source: "wheel",
          isAtBottom: false,
        };

        const newState = stickyBottomReducer(offState, action);

        expect(newState.followMode).toBe("off");
        expect(newState.lastScrollDirection).toBe("up");
      });

      it("should transition to locked on SCROLL_TO_BOTTOM_AND_LOCK", () => {
        const action: StickyBottomAction = {
          type: "SCROLL_TO_BOTTOM_AND_LOCK",
        };

        const newState = stickyBottomReducer(offState, action);

        expect(newState.followMode).toBe("locked");
        expect(newState.lastScrollDirection).toBe(null);
        expect(newState.newMessageCount).toBe(0);
        expect(newState.lockedAt).not.toBe(null);
      });

      it("should transition to auto on REACHED_BOTTOM", () => {
        const action: StickyBottomAction = {
          type: "REACHED_BOTTOM",
        };

        const newState = stickyBottomReducer(offState, action);

        expect(newState.followMode).toBe("auto");
        expect(newState.newMessageCount).toBe(0);
      });

      it("should accumulate newMessageCount on new content", () => {
        const stateWithData = createState({
          followMode: "off",
          prevDataLength: 5,
          newMessageCount: 2,
        });

        const action: StickyBottomAction = {
          type: "NEW_CONTENT",
          dataLength: 8,
          isStreaming: false,
        };

        const newState = stickyBottomReducer(stateWithData, action);

        expect(newState.followMode).toBe("off");
        expect(newState.newMessageCount).toBe(5); // 2 + (8-5) = 5
        expect(newState.prevDataLength).toBe(8);
      });

      it("should not decrement newMessageCount when data length decreases", () => {
        const stateWithData = createState({
          followMode: "off",
          prevDataLength: 10,
          newMessageCount: 5,
        });

        const action: StickyBottomAction = {
          type: "NEW_CONTENT",
          dataLength: 8, // Less than prevDataLength
          isStreaming: false,
        };

        const newState = stickyBottomReducer(stateWithData, action);

        expect(newState.newMessageCount).toBe(5); // Unchanged (Math.max(0, -2) = 0)
        expect(newState.prevDataLength).toBe(8);
      });

      it("should stay in off on keyboard navigation", () => {
        const action: StickyBottomAction = {
          type: "SCROLL",
          delta: -100,
          source: "keyboard",
          isAtBottom: false,
        };

        const newState = stickyBottomReducer(offState, action);

        expect(newState.followMode).toBe("off");
      });
    });

    describe("locked mode transitions", () => {
      const lockedState = createState({
        followMode: "locked",
        lockedAt: Date.now(),
      });

      it("should transition to off on wheel-up", () => {
        const action: StickyBottomAction = {
          type: "SCROLL",
          delta: -10,
          source: "wheel",
          isAtBottom: false,
        };

        const newState = stickyBottomReducer(lockedState, action);

        expect(newState.followMode).toBe("off");
        expect(newState.lastScrollDirection).toBe("up");
        expect(newState.lockedAt).toBe(null);
      });

      it("should stay locked on wheel-down", () => {
        const action: StickyBottomAction = {
          type: "SCROLL",
          delta: 10,
          source: "wheel",
          isAtBottom: true,
        };

        const newState = stickyBottomReducer(lockedState, action);

        expect(newState.followMode).toBe("locked");
        expect(newState.lastScrollDirection).toBe("down");
      });

      it("should stay locked on keyboard navigation", () => {
        const action: StickyBottomAction = {
          type: "SCROLL",
          delta: -100,
          source: "keyboard",
          isAtBottom: false,
        };

        const newState = stickyBottomReducer(lockedState, action);

        expect(newState.followMode).toBe("locked");
      });

      it("should transition to auto on CONTENT_STABLE", () => {
        const action: StickyBottomAction = {
          type: "CONTENT_STABLE",
        };

        const newState = stickyBottomReducer(lockedState, action);

        expect(newState.followMode).toBe("auto");
        expect(newState.lockedAt).toBe(null);
      });

      it("should update prevDataLength on new content in locked mode", () => {
        const stateWithData = createState({
          followMode: "locked",
          prevDataLength: 5,
          lockedAt: Date.now(),
        });

        const action: StickyBottomAction = {
          type: "NEW_CONTENT",
          dataLength: 10,
          isStreaming: false,
        };

        const newState = stickyBottomReducer(stateWithData, action);

        expect(newState.followMode).toBe("locked");
        expect(newState.prevDataLength).toBe(10);
        expect(newState.newMessageCount).toBe(0); // Should NOT accumulate in locked
      });

      it("should refresh lockedAt timestamp during streaming", () => {
        const originalLockedAt = Date.now() - 1000; // 1 second ago
        const stateWithData = createState({
          followMode: "locked",
          prevDataLength: 5,
          lockedAt: originalLockedAt,
        });

        const action: StickyBottomAction = {
          type: "NEW_CONTENT",
          dataLength: 10,
          isStreaming: true,
        };

        const newState = stickyBottomReducer(stateWithData, action);

        expect(newState.lockedAt).not.toBe(originalLockedAt);
        expect(newState.lockedAt).toBeGreaterThan(originalLockedAt);
      });

      it("should not refresh lockedAt when not streaming", () => {
        const originalLockedAt = Date.now() - 1000;
        const stateWithData = createState({
          followMode: "locked",
          prevDataLength: 5,
          lockedAt: originalLockedAt,
        });

        const action: StickyBottomAction = {
          type: "NEW_CONTENT",
          dataLength: 10,
          isStreaming: false,
        };

        const newState = stickyBottomReducer(stateWithData, action);

        expect(newState.lockedAt).toBe(originalLockedAt);
      });
    });

    describe("CONTENT_STABLE action", () => {
      it("should only affect locked mode", () => {
        const autoState = createState({ followMode: "auto" });
        const offState = createState({ followMode: "off" });
        const action: StickyBottomAction = { type: "CONTENT_STABLE" };

        expect(stickyBottomReducer(autoState, action).followMode).toBe("auto");
        expect(stickyBottomReducer(offState, action).followMode).toBe("off");
      });
    });

    describe("REACHED_BOTTOM action", () => {
      it("should only affect off mode", () => {
        const autoState = createState({ followMode: "auto" });
        const lockedState = createState({
          followMode: "locked",
          lockedAt: Date.now(),
        });
        const action: StickyBottomAction = { type: "REACHED_BOTTOM" };

        expect(stickyBottomReducer(autoState, action).followMode).toBe("auto");
        expect(stickyBottomReducer(lockedState, action).followMode).toBe("locked");
      });
    });

    describe("CLEAR_NEW_MESSAGE_COUNT action", () => {
      it("should clear newMessageCount in any mode", () => {
        const modes: FollowMode[] = ["auto", "off", "locked"];

        for (const followMode of modes) {
          const state = createState({
            followMode,
            newMessageCount: 10,
            lockedAt: followMode === "locked" ? Date.now() : null,
          });

          const action: StickyBottomAction = { type: "CLEAR_NEW_MESSAGE_COUNT" };
          const newState = stickyBottomReducer(state, action);

          expect(newState.newMessageCount).toBe(0);
          expect(newState.followMode).toBe(followMode);
        }
      });
    });
  });

  describe("newMessageCount management", () => {
    it("should clear on transition from off to auto via REACHED_BOTTOM", () => {
      const state = createState({
        followMode: "off",
        newMessageCount: 5,
      });

      const action: StickyBottomAction = { type: "REACHED_BOTTOM" };
      const newState = stickyBottomReducer(state, action);

      expect(newState.followMode).toBe("auto");
      expect(newState.newMessageCount).toBe(0);
    });

    it("should clear on transition from off to auto via wheel-down to bottom", () => {
      const state = createState({
        followMode: "off",
        newMessageCount: 5,
      });

      const action: StickyBottomAction = {
        type: "SCROLL",
        delta: 10,
        source: "wheel",
        isAtBottom: true,
      };
      const newState = stickyBottomReducer(state, action);

      expect(newState.followMode).toBe("auto");
      expect(newState.newMessageCount).toBe(0);
    });

    it("should clear on transition from off to locked via SCROLL_TO_BOTTOM_AND_LOCK", () => {
      const state = createState({
        followMode: "off",
        newMessageCount: 5,
      });

      const action: StickyBottomAction = { type: "SCROLL_TO_BOTTOM_AND_LOCK" };
      const newState = stickyBottomReducer(state, action);

      expect(newState.followMode).toBe("locked");
      expect(newState.newMessageCount).toBe(0);
    });

    it("should clear on transition from auto to off (reset accumulator)", () => {
      const state = createState({
        followMode: "auto",
        newMessageCount: 3, // Shouldn't have count in auto, but test anyway
      });

      const action: StickyBottomAction = {
        type: "SCROLL",
        delta: -10,
        source: "wheel",
        isAtBottom: false,
      };
      const newState = stickyBottomReducer(state, action);

      expect(newState.followMode).toBe("off");
      expect(newState.newMessageCount).toBe(0);
    });
  });

  describe("initialState", () => {
    it("should have correct default values", () => {
      expect(initialState.followMode).toBe("auto");
      expect(initialState.lastScrollDirection).toBe(null);
      expect(initialState.newMessageCount).toBe(0);
      expect(initialState.prevDataLength).toBe(0);
      expect(initialState.lockedAt).toBe(null);
    });
  });

  describe("state machine invariants", () => {
    it("should never have lockedAt set when not in locked mode", () => {
      // Start in locked mode with lockedAt
      const lockedState = createState({
        followMode: "locked",
        lockedAt: Date.now(),
      });

      // Transition to off via wheel-up
      const offAction: StickyBottomAction = {
        type: "SCROLL",
        delta: -10,
        source: "wheel",
        isAtBottom: false,
      };
      const offState = stickyBottomReducer(lockedState, offAction);

      expect(offState.followMode).toBe("off");
      expect(offState.lockedAt).toBe(null);

      // Transition locked to auto via CONTENT_STABLE
      const lockedState2 = createState({
        followMode: "locked",
        lockedAt: Date.now(),
      });
      const stableAction: StickyBottomAction = { type: "CONTENT_STABLE" };
      const autoState = stickyBottomReducer(lockedState2, stableAction);

      expect(autoState.followMode).toBe("auto");
      expect(autoState.lockedAt).toBe(null);
    });

    it("should always set lockedAt when entering locked mode", () => {
      const offState = createState({ followMode: "off" });
      const action: StickyBottomAction = { type: "SCROLL_TO_BOTTOM_AND_LOCK" };
      const newState = stickyBottomReducer(offState, action);

      expect(newState.followMode).toBe("locked");
      expect(newState.lockedAt).not.toBe(null);
      expect(typeof newState.lockedAt).toBe("number");
    });

    it("should preserve other state fields during transitions", () => {
      const state = createState({
        followMode: "off",
        prevDataLength: 100,
        newMessageCount: 5,
      });

      // Transition to locked
      const lockAction: StickyBottomAction = {
        type: "SCROLL_TO_BOTTOM_AND_LOCK",
      };
      const lockedState = stickyBottomReducer(state, lockAction);

      // prevDataLength should be preserved
      expect(lockedState.prevDataLength).toBe(100);
    });
  });

  describe("edge cases", () => {
    it("should handle rapid mode switching", () => {
      let state = createState({ followMode: "auto" });

      // Wheel up -> off
      state = stickyBottomReducer(state, {
        type: "SCROLL",
        delta: -10,
        source: "wheel",
        isAtBottom: false,
      });
      expect(state.followMode).toBe("off");

      // Lock -> locked
      state = stickyBottomReducer(state, { type: "SCROLL_TO_BOTTOM_AND_LOCK" });
      expect(state.followMode).toBe("locked");

      // Wheel up -> off
      state = stickyBottomReducer(state, {
        type: "SCROLL",
        delta: -10,
        source: "wheel",
        isAtBottom: false,
      });
      expect(state.followMode).toBe("off");

      // Wheel down to bottom -> auto
      state = stickyBottomReducer(state, {
        type: "SCROLL",
        delta: 10,
        source: "wheel",
        isAtBottom: true,
      });
      expect(state.followMode).toBe("auto");
    });

    it("should handle very large scroll deltas", () => {
      const state = createState({ followMode: "auto" });

      const action: StickyBottomAction = {
        type: "SCROLL",
        delta: -10000,
        source: "wheel",
        isAtBottom: false,
      };

      const newState = stickyBottomReducer(state, action);

      expect(newState.followMode).toBe("off");
      expect(newState.lastScrollDirection).toBe("up");
    });

    it("should handle very small scroll deltas", () => {
      const state = createState({ followMode: "auto" });

      const action: StickyBottomAction = {
        type: "SCROLL",
        delta: -0.01,
        source: "wheel",
        isAtBottom: false,
      };

      const newState = stickyBottomReducer(state, action);

      expect(newState.followMode).toBe("off");
      expect(newState.lastScrollDirection).toBe("up");
    });

    it("should handle unknown action types gracefully", () => {
      const state = createState({ followMode: "auto" });

      // @ts-expect-error Testing unknown action type
      const newState = stickyBottomReducer(state, { type: "UNKNOWN_ACTION" });

      expect(newState).toEqual(state);
    });
  });

  describe("CONTENT_STABLE_THRESHOLD_MS constant", () => {
    it("should be exported and have a reasonable value", () => {
      expect(CONTENT_STABLE_THRESHOLD_MS).toBeDefined();
      expect(typeof CONTENT_STABLE_THRESHOLD_MS).toBe("number");
      expect(CONTENT_STABLE_THRESHOLD_MS).toBeGreaterThan(0);
      expect(CONTENT_STABLE_THRESHOLD_MS).toBeLessThanOrEqual(2000); // Reasonable upper bound
    });
  });
});
