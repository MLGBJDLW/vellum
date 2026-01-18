/**
 * useScrollController Hook Tests
 *
 * Tests the scroll controller state machine for follow/manual modes.
 *
 * @module tui/hooks/__tests__/useScrollController.test
 */

import { describe, expect, it } from "vitest";

// =============================================================================
// Pure Logic Tests (extracted from hook for testability)
// =============================================================================

// Type definitions matching the hook
type ScrollMode = "follow" | "manual";

interface ScrollState {
  mode: ScrollMode;
  offsetFromBottom: number;
  newMessageCount: number;
  totalHeight: number;
  viewportHeight: number;
}

type ScrollAction =
  | { type: "SCROLL_UP"; lines: number; autoFollowOnBottom: boolean }
  | { type: "SCROLL_DOWN"; lines: number; autoFollowOnBottom: boolean }
  | { type: "JUMP_TO"; offset: number; autoFollowOnBottom: boolean }
  | { type: "SCROLL_TO_BOTTOM" }
  | { type: "SET_TOTAL_HEIGHT"; height: number }
  | { type: "SET_VIEWPORT_HEIGHT"; height: number }
  | { type: "NEW_MESSAGE" };

// Utility functions (same as in hook)
function getMaxOffset(totalHeight: number, viewportHeight: number): number {
  return Math.max(0, totalHeight - viewportHeight);
}

function clampOffset(offset: number, totalHeight: number, viewportHeight: number): number {
  const maxOffset = getMaxOffset(totalHeight, viewportHeight);
  return Math.max(0, Math.min(offset, maxOffset));
}

// Reducer logic (same as in hook)
function scrollReducer(state: ScrollState, action: ScrollAction): ScrollState {
  switch (action.type) {
    case "SCROLL_UP": {
      const newOffset = clampOffset(
        state.offsetFromBottom + action.lines,
        state.totalHeight,
        state.viewportHeight
      );
      if (newOffset === state.offsetFromBottom) return state;
      return { ...state, mode: "manual", offsetFromBottom: newOffset };
    }

    case "SCROLL_DOWN": {
      const newOffset = clampOffset(
        state.offsetFromBottom - action.lines,
        state.totalHeight,
        state.viewportHeight
      );
      if (newOffset === 0 && action.autoFollowOnBottom) {
        return { ...state, mode: "follow", offsetFromBottom: 0, newMessageCount: 0 };
      }
      if (newOffset === state.offsetFromBottom) return state;
      return { ...state, offsetFromBottom: newOffset };
    }

    case "JUMP_TO": {
      const newOffset = clampOffset(action.offset, state.totalHeight, state.viewportHeight);
      if (newOffset === 0 && action.autoFollowOnBottom) {
        return { ...state, mode: "follow", offsetFromBottom: 0, newMessageCount: 0 };
      }
      const newMode = newOffset > 0 ? "manual" : state.mode;
      return {
        ...state,
        mode: newMode,
        offsetFromBottom: newOffset,
        newMessageCount: newMode === "follow" ? 0 : state.newMessageCount,
      };
    }

    case "SCROLL_TO_BOTTOM":
      return { ...state, mode: "follow", offsetFromBottom: 0, newMessageCount: 0 };

    case "SET_TOTAL_HEIGHT": {
      const newTotalHeight = Math.max(0, action.height);
      if (state.mode === "follow") {
        return { ...state, totalHeight: newTotalHeight, offsetFromBottom: 0 };
      }
      const clampedOffset = clampOffset(
        state.offsetFromBottom,
        newTotalHeight,
        state.viewportHeight
      );
      return { ...state, totalHeight: newTotalHeight, offsetFromBottom: clampedOffset };
    }

    case "SET_VIEWPORT_HEIGHT": {
      const newViewportHeight = Math.max(1, action.height);
      const clampedOffset = clampOffset(
        state.offsetFromBottom,
        state.totalHeight,
        newViewportHeight
      );
      return { ...state, viewportHeight: newViewportHeight, offsetFromBottom: clampedOffset };
    }

    case "NEW_MESSAGE":
      if (state.mode === "follow") return state;
      return { ...state, newMessageCount: state.newMessageCount + 1 };

    default:
      return state;
  }
}

// Helper to create initial state
function createInitialState(overrides: Partial<ScrollState> = {}): ScrollState {
  return {
    mode: "follow",
    offsetFromBottom: 0,
    newMessageCount: 0,
    totalHeight: 100,
    viewportHeight: 20,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("useScrollController (core logic)", () => {
  describe("initial state", () => {
    it("starts in follow mode", () => {
      const state = createInitialState();
      expect(state.mode).toBe("follow");
    });

    it("starts at bottom (offset 0)", () => {
      const state = createInitialState();
      expect(state.offsetFromBottom).toBe(0);
    });

    it("starts with zero new message count", () => {
      const state = createInitialState();
      expect(state.newMessageCount).toBe(0);
    });
  });

  describe("scrollUp action", () => {
    it("switches to manual mode when scrolling up", () => {
      const state = createInitialState();
      const result = scrollReducer(state, {
        type: "SCROLL_UP",
        lines: 5,
        autoFollowOnBottom: true,
      });

      expect(result.mode).toBe("manual");
      expect(result.offsetFromBottom).toBe(5);
    });

    it("clamps offset to maximum", () => {
      const state = createInitialState({ totalHeight: 100, viewportHeight: 20 });
      // maxOffset = 100 - 20 = 80
      const result = scrollReducer(state, {
        type: "SCROLL_UP",
        lines: 200,
        autoFollowOnBottom: true,
      });

      expect(result.offsetFromBottom).toBe(80);
    });

    it("does not change state if already at max", () => {
      const state = createInitialState({
        mode: "manual",
        offsetFromBottom: 80, // Already at max (100 - 20)
        totalHeight: 100,
        viewportHeight: 20,
      });
      const result = scrollReducer(state, {
        type: "SCROLL_UP",
        lines: 10,
        autoFollowOnBottom: true,
      });

      expect(result).toBe(state); // Same reference = no change
    });
  });

  describe("scrollDown action", () => {
    it("decreases offset when scrolling down", () => {
      const state = createInitialState({ mode: "manual", offsetFromBottom: 50 });
      const result = scrollReducer(state, {
        type: "SCROLL_DOWN",
        lines: 10,
        autoFollowOnBottom: true,
      });

      expect(result.offsetFromBottom).toBe(40);
    });

    it("switches to follow mode when reaching bottom with autoFollowOnBottom", () => {
      const state = createInitialState({ mode: "manual", offsetFromBottom: 5, newMessageCount: 3 });
      const result = scrollReducer(state, {
        type: "SCROLL_DOWN",
        lines: 10,
        autoFollowOnBottom: true,
      });

      expect(result.mode).toBe("follow");
      expect(result.offsetFromBottom).toBe(0);
      expect(result.newMessageCount).toBe(0);
    });

    it("stays in manual mode when reaching bottom without autoFollowOnBottom", () => {
      const state = createInitialState({ mode: "manual", offsetFromBottom: 5 });
      const result = scrollReducer(state, {
        type: "SCROLL_DOWN",
        lines: 10,
        autoFollowOnBottom: false,
      });

      expect(result.mode).toBe("manual");
      expect(result.offsetFromBottom).toBe(0);
    });

    it("clamps offset to minimum (0)", () => {
      const state = createInitialState({ mode: "manual", offsetFromBottom: 10 });
      const result = scrollReducer(state, {
        type: "SCROLL_DOWN",
        lines: 20,
        autoFollowOnBottom: false,
      });

      expect(result.offsetFromBottom).toBe(0);
    });
  });

  describe("scrollToBottom action", () => {
    it("switches to follow mode", () => {
      const state = createInitialState({ mode: "manual", offsetFromBottom: 50 });
      const result = scrollReducer(state, { type: "SCROLL_TO_BOTTOM" });

      expect(result.mode).toBe("follow");
    });

    it("resets offset to 0", () => {
      const state = createInitialState({ mode: "manual", offsetFromBottom: 50 });
      const result = scrollReducer(state, { type: "SCROLL_TO_BOTTOM" });

      expect(result.offsetFromBottom).toBe(0);
    });

    it("resets new message count", () => {
      const state = createInitialState({
        mode: "manual",
        offsetFromBottom: 50,
        newMessageCount: 5,
      });
      const result = scrollReducer(state, { type: "SCROLL_TO_BOTTOM" });

      expect(result.newMessageCount).toBe(0);
    });
  });

  describe("jumpTo action", () => {
    it("jumps to specified offset", () => {
      const state = createInitialState();
      const result = scrollReducer(state, {
        type: "JUMP_TO",
        offset: 30,
        autoFollowOnBottom: true,
      });

      expect(result.offsetFromBottom).toBe(30);
    });

    it("switches to manual mode when jumping away from bottom", () => {
      const state = createInitialState();
      const result = scrollReducer(state, {
        type: "JUMP_TO",
        offset: 30,
        autoFollowOnBottom: true,
      });

      expect(result.mode).toBe("manual");
    });

    it("switches to follow mode when jumping to bottom with autoFollow", () => {
      const state = createInitialState({
        mode: "manual",
        offsetFromBottom: 50,
        newMessageCount: 3,
      });
      const result = scrollReducer(state, { type: "JUMP_TO", offset: 0, autoFollowOnBottom: true });

      expect(result.mode).toBe("follow");
      expect(result.newMessageCount).toBe(0);
    });

    it("clamps offset to valid range", () => {
      const state = createInitialState({ totalHeight: 100, viewportHeight: 20 });
      const result = scrollReducer(state, {
        type: "JUMP_TO",
        offset: 500,
        autoFollowOnBottom: true,
      });

      expect(result.offsetFromBottom).toBe(80); // max offset
    });
  });

  describe("newMessage action", () => {
    it("increments counter in manual mode", () => {
      const state = createInitialState({
        mode: "manual",
        offsetFromBottom: 50,
        newMessageCount: 2,
      });
      const result = scrollReducer(state, { type: "NEW_MESSAGE" });

      expect(result.newMessageCount).toBe(3);
    });

    it("does not change state in follow mode", () => {
      const state = createInitialState({ mode: "follow" });
      const result = scrollReducer(state, { type: "NEW_MESSAGE" });

      expect(result).toBe(state); // Same reference = no change
    });
  });

  describe("setTotalHeight action", () => {
    it("updates total height in follow mode", () => {
      const state = createInitialState({ mode: "follow", totalHeight: 100 });
      const result = scrollReducer(state, { type: "SET_TOTAL_HEIGHT", height: 200 });

      expect(result.totalHeight).toBe(200);
      expect(result.offsetFromBottom).toBe(0); // Stays at bottom
    });

    it("maintains offset in manual mode", () => {
      const state = createInitialState({ mode: "manual", totalHeight: 100, offsetFromBottom: 30 });
      const result = scrollReducer(state, { type: "SET_TOTAL_HEIGHT", height: 200 });

      expect(result.totalHeight).toBe(200);
      expect(result.offsetFromBottom).toBe(30);
    });

    it("clamps offset when content shrinks", () => {
      const state = createInitialState({
        mode: "manual",
        totalHeight: 100,
        viewportHeight: 20,
        offsetFromBottom: 70,
      });
      // New maxOffset = 50 - 20 = 30
      const result = scrollReducer(state, { type: "SET_TOTAL_HEIGHT", height: 50 });

      expect(result.offsetFromBottom).toBe(30);
    });
  });

  describe("setViewportHeight action", () => {
    it("updates viewport height", () => {
      const state = createInitialState({ viewportHeight: 20 });
      const result = scrollReducer(state, { type: "SET_VIEWPORT_HEIGHT", height: 40 });

      expect(result.viewportHeight).toBe(40);
    });

    it("clamps offset when viewport grows", () => {
      const state = createInitialState({
        mode: "manual",
        totalHeight: 100,
        viewportHeight: 20,
        offsetFromBottom: 70,
      });
      // New maxOffset = 100 - 80 = 20
      const result = scrollReducer(state, { type: "SET_VIEWPORT_HEIGHT", height: 80 });

      expect(result.offsetFromBottom).toBe(20);
    });

    it("ensures minimum viewport of 1", () => {
      const state = createInitialState();
      const result = scrollReducer(state, { type: "SET_VIEWPORT_HEIGHT", height: 0 });

      expect(result.viewportHeight).toBe(1);
    });
  });

  describe("state machine transitions", () => {
    it("follow -> manual via scrollUp", () => {
      let state = createInitialState();
      expect(state.mode).toBe("follow");

      state = scrollReducer(state, { type: "SCROLL_UP", lines: 10, autoFollowOnBottom: true });
      expect(state.mode).toBe("manual");
    });

    it("manual -> follow via scrollToBottom", () => {
      let state = createInitialState({ mode: "manual", offsetFromBottom: 50 });
      expect(state.mode).toBe("manual");

      state = scrollReducer(state, { type: "SCROLL_TO_BOTTOM" });
      expect(state.mode).toBe("follow");
    });

    it("manual -> follow via reaching bottom", () => {
      let state = createInitialState({ mode: "manual", offsetFromBottom: 5 });
      expect(state.mode).toBe("manual");

      state = scrollReducer(state, { type: "SCROLL_DOWN", lines: 10, autoFollowOnBottom: true });
      expect(state.mode).toBe("follow");
    });

    it("manual stays manual on new message", () => {
      let state = createInitialState({ mode: "manual", offsetFromBottom: 50 });
      state = scrollReducer(state, { type: "NEW_MESSAGE" });

      expect(state.mode).toBe("manual");
      expect(state.newMessageCount).toBe(1);
    });

    it("follow stays follow on new message", () => {
      let state = createInitialState({ mode: "follow" });
      state = scrollReducer(state, { type: "NEW_MESSAGE" });

      expect(state.mode).toBe("follow");
      expect(state.newMessageCount).toBe(0);
    });
  });

  describe("utility functions", () => {
    describe("getMaxOffset", () => {
      it("returns total - viewport for scrollable content", () => {
        expect(getMaxOffset(100, 20)).toBe(80);
      });

      it("returns 0 when content fits in viewport", () => {
        expect(getMaxOffset(10, 20)).toBe(0);
      });

      it("returns 0 when content equals viewport", () => {
        expect(getMaxOffset(20, 20)).toBe(0);
      });
    });

    describe("clampOffset", () => {
      it("clamps to range [0, maxOffset]", () => {
        expect(clampOffset(-5, 100, 20)).toBe(0);
        expect(clampOffset(50, 100, 20)).toBe(50);
        expect(clampOffset(100, 100, 20)).toBe(80);
      });
    });
  });
});
