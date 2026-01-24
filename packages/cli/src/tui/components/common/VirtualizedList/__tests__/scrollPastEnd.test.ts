/**
 * Unit tests for Scroll Past End functionality.
 *
 * @module tui/components/common/VirtualizedList/__tests__/scrollPastEnd.test
 */

import { describe, expect, it } from "vitest";
import {
  calculateBouncePosition,
  calculateMaxOverscroll,
  clampOverscroll,
  createInitialScrollPastEndState,
  DEFAULT_SCROLL_PAST_END_CONFIG,
  easeOutCubic,
  type ScrollPastEndAction,
  type ScrollPastEndConfig,
  type ScrollPastEndState,
  scrollPastEndReducer,
} from "../hooks/scrollPastEnd.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a test config with optional overrides.
 */
function createTestConfig(overrides?: Partial<ScrollPastEndConfig>): ScrollPastEndConfig {
  return {
    ...DEFAULT_SCROLL_PAST_END_CONFIG,
    ...overrides,
  };
}

/**
 * Create a test state with optional overrides.
 */
function createTestState(overrides?: Partial<ScrollPastEndState>): ScrollPastEndState {
  return {
    ...createInitialScrollPastEndState(),
    ...overrides,
  };
}

// ============================================================================
// Tests: easeOutCubic
// ============================================================================

describe("easeOutCubic", () => {
  it("should return 0 at t=0", () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it("should return 1 at t=1", () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it("should return values between 0 and 1 for t between 0 and 1", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0);
    expect(easeOutCubic(0.5)).toBeLessThan(1);
  });

  it("should decelerate (second half faster than linear)", () => {
    // At t=0.5, easeOutCubic should be > 0.5 (decelerating)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    // 1 - (1 - 0.5)^3 = 1 - 0.125 = 0.875
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 5);
  });

  it("should be monotonically increasing", () => {
    const values = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map(easeOutCubic);
    for (let i = 1; i < values.length; i++) {
      const prev = values[i - 1] ?? 0;
      expect(values[i]).toBeGreaterThanOrEqual(prev);
    }
  });
});

// ============================================================================
// Tests: calculateMaxOverscroll
// ============================================================================

describe("calculateMaxOverscroll", () => {
  it("should calculate based on maxLines and lineHeight", () => {
    const config = createTestConfig({ maxLines: 3, estimatedLineHeight: 20 });
    expect(calculateMaxOverscroll(config)).toBe(60);
  });

  it("should return 0 when maxLines is 0", () => {
    const config = createTestConfig({ maxLines: 0, estimatedLineHeight: 20 });
    expect(calculateMaxOverscroll(config)).toBe(0);
  });

  it("should scale with different line heights", () => {
    const config = createTestConfig({ maxLines: 5, estimatedLineHeight: 15 });
    expect(calculateMaxOverscroll(config)).toBe(75);
  });

  it("should use default config values correctly", () => {
    const result = calculateMaxOverscroll(DEFAULT_SCROLL_PAST_END_CONFIG);
    // Default: maxLines=3, estimatedLineHeight=20
    expect(result).toBe(60);
  });
});

// ============================================================================
// Tests: clampOverscroll
// ============================================================================

describe("clampOverscroll", () => {
  const config = createTestConfig({
    maxLines: 3,
    estimatedLineHeight: 20,
    rubberbandFactor: 0.3,
  });
  // maxOverscroll = 60

  describe("within bounds", () => {
    it("should not modify values under max", () => {
      expect(clampOverscroll(30, config)).toBe(30);
      expect(clampOverscroll(60, config)).toBe(60);
    });

    it("should return 0 for negative values", () => {
      expect(clampOverscroll(-10, config)).toBe(0);
      expect(clampOverscroll(-100, config)).toBe(0);
    });

    it("should return 0 for exactly 0", () => {
      expect(clampOverscroll(0, config)).toBe(0);
    });
  });

  describe("rubberband effect", () => {
    it("should apply rubberband when exceeding max", () => {
      // excess = 80 - 60 = 20
      // rubberbandedExcess = 20 * 0.3 = 6
      // result = 60 + 6 = 66
      expect(clampOverscroll(80, config)).toBe(66);
    });

    it("should cap at maxWithRubberband", () => {
      // maxWithRubberband = 60 * (1 + 0.3) = 78
      // Very large amount should be capped
      expect(clampOverscroll(1000, config)).toBe(78);
    });

    it("should progressively resist overscroll", () => {
      const small = clampOverscroll(70, config);
      const large = clampOverscroll(90, config);
      // Both should be > 60 (max)
      expect(small).toBeGreaterThan(60);
      expect(large).toBeGreaterThan(60);
      // Larger input should yield larger output (but capped)
      expect(large).toBeGreaterThan(small);
    });
  });

  describe("edge cases", () => {
    it("should handle zero rubberbandFactor", () => {
      const noRubberConfig = createTestConfig({
        maxLines: 3,
        estimatedLineHeight: 20,
        rubberbandFactor: 0,
      });
      // Should cap exactly at max
      expect(clampOverscroll(100, noRubberConfig)).toBe(60);
    });

    it("should handle very small positive values", () => {
      expect(clampOverscroll(0.1, config)).toBe(0.1);
    });
  });
});

// ============================================================================
// Tests: calculateBouncePosition
// ============================================================================

describe("calculateBouncePosition", () => {
  const config = createTestConfig({
    bounceMs: 150,
    easing: easeOutCubic,
  });

  describe("not bouncing", () => {
    it("should return current overscrollAmount when not bouncing", () => {
      const state = createTestState({
        overscrollAmount: 50,
        isBouncing: false,
      });
      expect(calculateBouncePosition(state, Date.now(), config)).toBe(50);
    });

    it("should return overscrollAmount when bounceStartTime is null", () => {
      const state = createTestState({
        overscrollAmount: 30,
        isBouncing: true,
        bounceStartTime: null,
      });
      expect(calculateBouncePosition(state, Date.now(), config)).toBe(30);
    });
  });

  describe("during bounce animation", () => {
    it("should return startAmount at t=0", () => {
      const startTime = 1000;
      const state = createTestState({
        overscrollAmount: 60,
        isBouncing: true,
        bounceStartTime: startTime,
        bounceStartAmount: 60,
      });
      // At exactly start time, progress = 0, easedProgress = 0
      // result = 60 * (1 - 0) = 60
      expect(calculateBouncePosition(state, startTime, config)).toBe(60);
    });

    it("should return 0 at t=bounceMs", () => {
      const startTime = 1000;
      const state = createTestState({
        overscrollAmount: 60,
        isBouncing: true,
        bounceStartTime: startTime,
        bounceStartAmount: 60,
      });
      // At bounceMs (150ms), progress = 1, easedProgress = 1
      // result = 60 * (1 - 1) = 0
      expect(calculateBouncePosition(state, startTime + 150, config)).toBe(0);
    });

    it("should return intermediate value at halfway point", () => {
      const startTime = 1000;
      const state = createTestState({
        overscrollAmount: 60,
        isBouncing: true,
        bounceStartTime: startTime,
        bounceStartAmount: 60,
      });
      // At 75ms (halfway), progress = 0.5
      // easedProgress = easeOutCubic(0.5) = 0.875
      // result = 60 * (1 - 0.875) = 60 * 0.125 = 7.5
      const result = calculateBouncePosition(state, startTime + 75, config);
      expect(result).toBeCloseTo(7.5, 5);
    });

    it("should clamp progress to 1 when past bounceMs", () => {
      const startTime = 1000;
      const state = createTestState({
        overscrollAmount: 60,
        isBouncing: true,
        bounceStartTime: startTime,
        bounceStartAmount: 60,
      });
      // Well past animation end
      expect(calculateBouncePosition(state, startTime + 300, config)).toBe(0);
    });
  });

  describe("easing function", () => {
    it("should use custom easing function", () => {
      // Linear easing for predictable test
      const linearConfig = createTestConfig({
        bounceMs: 100,
        easing: (t) => t,
      });
      const startTime = 1000;
      const state = createTestState({
        isBouncing: true,
        bounceStartTime: startTime,
        bounceStartAmount: 100,
      });
      // At 50ms with linear easing: progress = 0.5, result = 100 * (1 - 0.5) = 50
      expect(calculateBouncePosition(state, startTime + 50, linearConfig)).toBe(50);
    });
  });
});

// ============================================================================
// Tests: createInitialScrollPastEndState
// ============================================================================

describe("createInitialScrollPastEndState", () => {
  it("should return correct initial state", () => {
    const state = createInitialScrollPastEndState();
    expect(state.overscrollAmount).toBe(0);
    expect(state.isBouncing).toBe(false);
    expect(state.bounceStartTime).toBeNull();
    expect(state.bounceStartAmount).toBe(0);
  });
});

// ============================================================================
// Tests: scrollPastEndReducer
// ============================================================================

describe("scrollPastEndReducer", () => {
  const config = createTestConfig({
    maxLines: 3,
    estimatedLineHeight: 20,
    rubberbandFactor: 0.3,
  });

  describe("OVERSCROLL", () => {
    it("should set overscroll amount", () => {
      const state = createInitialScrollPastEndState();
      const action: ScrollPastEndAction = { type: "OVERSCROLL", amount: 30 };
      const newState = scrollPastEndReducer(state, action, config);
      expect(newState.overscrollAmount).toBe(30);
    });

    it("should clamp to max with rubberband", () => {
      const state = createInitialScrollPastEndState();
      const action: ScrollPastEndAction = { type: "OVERSCROLL", amount: 100 };
      const newState = scrollPastEndReducer(state, action, config);
      // maxOverscroll = 60, excess = 40, rubberbanded = 40 * 0.3 = 12
      // result = 60 + 12 = 72 (but capped at 78)
      expect(newState.overscrollAmount).toBe(72);
    });

    it("should not update during bounce animation", () => {
      const state = createTestState({
        overscrollAmount: 30,
        isBouncing: true,
      });
      const action: ScrollPastEndAction = { type: "OVERSCROLL", amount: 50 };
      const newState = scrollPastEndReducer(state, action, config);
      expect(newState.overscrollAmount).toBe(30);
      expect(newState).toBe(state); // Same reference
    });

    it("should return same state if value unchanged", () => {
      const state = createTestState({ overscrollAmount: 30 });
      const action: ScrollPastEndAction = { type: "OVERSCROLL", amount: 30 };
      const newState = scrollPastEndReducer(state, action, config);
      expect(newState).toBe(state); // Same reference
    });

    it("should clamp negative values to 0", () => {
      const state = createInitialScrollPastEndState();
      const action: ScrollPastEndAction = { type: "OVERSCROLL", amount: -10 };
      const newState = scrollPastEndReducer(state, action, config);
      expect(newState.overscrollAmount).toBe(0);
    });
  });

  describe("START_BOUNCE", () => {
    it("should start bounce animation", () => {
      const state = createTestState({ overscrollAmount: 50 });
      const action: ScrollPastEndAction = { type: "START_BOUNCE" };
      const newState = scrollPastEndReducer(state, action, config);

      expect(newState.isBouncing).toBe(true);
      expect(newState.bounceStartTime).not.toBeNull();
      expect(newState.bounceStartAmount).toBe(50);
    });

    it("should not start if already at 0", () => {
      const state = createInitialScrollPastEndState();
      const action: ScrollPastEndAction = { type: "START_BOUNCE" };
      const newState = scrollPastEndReducer(state, action, config);
      expect(newState).toBe(state); // Same reference
      expect(newState.isBouncing).toBe(false);
    });

    it("should not restart if already bouncing", () => {
      const state = createTestState({
        overscrollAmount: 30,
        isBouncing: true,
        bounceStartTime: 1000,
        bounceStartAmount: 50,
      });
      const action: ScrollPastEndAction = { type: "START_BOUNCE" };
      const newState = scrollPastEndReducer(state, action, config);
      expect(newState).toBe(state); // Same reference
      expect(newState.bounceStartTime).toBe(1000);
      expect(newState.bounceStartAmount).toBe(50);
    });
  });

  describe("BOUNCE_TICK", () => {
    it("should update overscroll during bounce", () => {
      const startTime = 1000;
      const state = createTestState({
        overscrollAmount: 60,
        isBouncing: true,
        bounceStartTime: startTime,
        bounceStartAmount: 60,
      });
      const action: ScrollPastEndAction = {
        type: "BOUNCE_TICK",
        currentTime: startTime + 75, // Halfway through 150ms bounce
      };
      const newState = scrollPastEndReducer(state, action, config);
      // At halfway, easeOutCubic(0.5) = 0.875
      // result = 60 * (1 - 0.875) = 7.5
      expect(newState.overscrollAmount).toBeCloseTo(7.5, 5);
      expect(newState.isBouncing).toBe(true);
    });

    it("should complete bounce when amount < 0.5", () => {
      const startTime = 1000;
      const state = createTestState({
        overscrollAmount: 60,
        isBouncing: true,
        bounceStartTime: startTime,
        bounceStartAmount: 60,
      });
      const action: ScrollPastEndAction = {
        type: "BOUNCE_TICK",
        currentTime: startTime + 150, // Animation complete
      };
      const newState = scrollPastEndReducer(state, action, config);
      expect(newState.overscrollAmount).toBe(0);
      expect(newState.isBouncing).toBe(false);
      expect(newState.bounceStartTime).toBeNull();
      expect(newState.bounceStartAmount).toBe(0);
    });

    it("should do nothing if not bouncing", () => {
      const state = createTestState({
        overscrollAmount: 30,
        isBouncing: false,
      });
      const action: ScrollPastEndAction = {
        type: "BOUNCE_TICK",
        currentTime: Date.now(),
      };
      const newState = scrollPastEndReducer(state, action, config);
      expect(newState).toBe(state); // Same reference
    });
  });

  describe("BOUNCE_COMPLETE", () => {
    it("should reset to zero and stop bouncing", () => {
      const state = createTestState({
        overscrollAmount: 30,
        isBouncing: true,
        bounceStartTime: 1000,
        bounceStartAmount: 60,
      });
      const action: ScrollPastEndAction = { type: "BOUNCE_COMPLETE" };
      const newState = scrollPastEndReducer(state, action, config);

      expect(newState.overscrollAmount).toBe(0);
      expect(newState.isBouncing).toBe(false);
      expect(newState.bounceStartTime).toBeNull();
      expect(newState.bounceStartAmount).toBe(0);
    });

    it("should work even if not bouncing", () => {
      const state = createTestState({ overscrollAmount: 30 });
      const action: ScrollPastEndAction = { type: "BOUNCE_COMPLETE" };
      const newState = scrollPastEndReducer(state, action, config);
      expect(newState.overscrollAmount).toBe(0);
    });
  });

  describe("RESET", () => {
    it("should reset to initial state", () => {
      const state = createTestState({
        overscrollAmount: 50,
        isBouncing: true,
        bounceStartTime: 1000,
        bounceStartAmount: 60,
      });
      const action: ScrollPastEndAction = { type: "RESET" };
      const newState = scrollPastEndReducer(state, action, config);

      expect(newState).toEqual(createInitialScrollPastEndState());
    });
  });

  describe("unknown action", () => {
    it("should return same state for unknown action type", () => {
      const state = createTestState({ overscrollAmount: 30 });
      // @ts-expect-error - Testing unknown action
      const action: ScrollPastEndAction = { type: "UNKNOWN" };
      const newState = scrollPastEndReducer(state, action, config);
      expect(newState).toBe(state);
    });
  });
});

// ============================================================================
// Tests: DEFAULT_SCROLL_PAST_END_CONFIG
// ============================================================================

describe("DEFAULT_SCROLL_PAST_END_CONFIG", () => {
  it("should have expected default values", () => {
    expect(DEFAULT_SCROLL_PAST_END_CONFIG.maxLines).toBe(3);
    expect(DEFAULT_SCROLL_PAST_END_CONFIG.estimatedLineHeight).toBe(20);
    expect(DEFAULT_SCROLL_PAST_END_CONFIG.bounceMs).toBe(150);
    expect(DEFAULT_SCROLL_PAST_END_CONFIG.rubberbandFactor).toBe(0.3);
    expect(typeof DEFAULT_SCROLL_PAST_END_CONFIG.easing).toBe("function");
  });

  it("should use easeOutCubic as default easing", () => {
    expect(DEFAULT_SCROLL_PAST_END_CONFIG.easing(0.5)).toBe(easeOutCubic(0.5));
  });
});
