/**
 * Tests for useSmoothScroll hook
 *
 * Tests the smooth scroll animation logic including:
 * - Configuration defaults
 * - Pure easing calculations
 * - Animation completion detection
 * - Scroll position clamping
 * - Animation convergence behavior
 *
 * Note: Hook behavior is tested through pure function testing and simulation,
 * as the animation relies on setInterval which is better tested via integration tests.
 *
 * @module tui/components/common/VirtualizedList/hooks/useSmoothScroll.test
 */

import { describe, expect, it } from "vitest";
import {
  calculateEasedStep,
  clampScrollTop,
  DEFAULT_CONFIG,
  isAnimationComplete,
} from "./useSmoothScroll.js";

describe("useSmoothScroll", () => {
  // ============================================================================
  // Configuration Defaults
  // ============================================================================
  describe("DEFAULT_CONFIG", () => {
    it("should have correct default easing value", () => {
      expect(DEFAULT_CONFIG.easing).toBe(0.3);
    });

    it("should have correct default threshold value", () => {
      expect(DEFAULT_CONFIG.threshold).toBe(0.5);
    });

    it("should have correct default frameInterval for ~60fps", () => {
      expect(DEFAULT_CONFIG.frameInterval).toBe(16);
    });

    it("should be immutable (readonly)", () => {
      // TypeScript enforces this, but we can verify the object shape
      expect(Object.keys(DEFAULT_CONFIG)).toEqual(["easing", "threshold", "frameInterval"]);
    });
  });

  // ============================================================================
  // Pure Function: calculateEasedStep
  // ============================================================================
  describe("calculateEasedStep", () => {
    it("should calculate correct step with default easing", () => {
      // diff = 100, easing = 0.3 => step = 30
      const step = calculateEasedStep(0, 100, 0.3);
      expect(step).toBe(30);
    });

    it("should handle negative diff (scroll up)", () => {
      // current = 100, target = 0, diff = -100, step = -30
      const step = calculateEasedStep(100, 0, 0.3);
      expect(step).toBe(-30);
    });

    it("should return smaller steps as approaching target", () => {
      // Exponential ease-out: step size decreases as we approach
      const step1 = calculateEasedStep(0, 100, 0.3); // 30
      const step2 = calculateEasedStep(30, 100, 0.3); // 21
      const step3 = calculateEasedStep(51, 100, 0.3); // 14.7

      expect(Math.abs(step1)).toBeGreaterThan(Math.abs(step2));
      expect(Math.abs(step2)).toBeGreaterThan(Math.abs(step3));
    });

    it("should return zero step when at target", () => {
      const step = calculateEasedStep(100, 100, 0.3);
      expect(step).toBe(0);
    });

    it("should scale with easing coefficient", () => {
      const slowStep = calculateEasedStep(0, 100, 0.1); // 10
      const fastStep = calculateEasedStep(0, 100, 0.5); // 50

      expect(slowStep).toBe(10);
      expect(fastStep).toBe(50);
      expect(fastStep).toBeGreaterThan(slowStep);
    });

    it("should handle very large distances", () => {
      const step = calculateEasedStep(0, 10000, 0.3);
      expect(step).toBe(3000);
    });

    it("should handle fractional values", () => {
      const step = calculateEasedStep(50.5, 100.7, 0.3);
      // diff = 50.2, step = 50.2 * 0.3 = 15.06
      expect(step).toBeCloseTo(15.06, 2);
    });

    it("should handle very small distances", () => {
      const step = calculateEasedStep(99.9, 100, 0.3);
      expect(step).toBeCloseTo(0.03, 3);
    });
  });

  // ============================================================================
  // Pure Function: isAnimationComplete
  // ============================================================================
  describe("isAnimationComplete", () => {
    it("should return true when within threshold", () => {
      expect(isAnimationComplete(99.7, 100, 0.5)).toBe(true);
      expect(isAnimationComplete(100.3, 100, 0.5)).toBe(true);
    });

    it("should return false when beyond threshold", () => {
      expect(isAnimationComplete(99, 100, 0.5)).toBe(false);
      expect(isAnimationComplete(101, 100, 0.5)).toBe(false);
    });

    it("should return true when exactly at target", () => {
      expect(isAnimationComplete(100, 100, 0.5)).toBe(true);
    });

    it("should return true when exactly at threshold boundary", () => {
      expect(isAnimationComplete(99.5, 100, 0.5)).toBe(true);
      expect(isAnimationComplete(100.5, 100, 0.5)).toBe(true);
    });

    it("should handle tighter threshold", () => {
      expect(isAnimationComplete(99.95, 100, 0.1)).toBe(true);
      expect(isAnimationComplete(99.8, 100, 0.1)).toBe(false);
    });

    it("should handle looser threshold", () => {
      expect(isAnimationComplete(99, 100, 2)).toBe(true);
      expect(isAnimationComplete(97, 100, 2)).toBe(false);
    });

    it("should handle negative positions", () => {
      expect(isAnimationComplete(-0.3, 0, 0.5)).toBe(true);
      expect(isAnimationComplete(-1, 0, 0.5)).toBe(false);
    });

    it("should handle zero threshold", () => {
      expect(isAnimationComplete(100, 100, 0)).toBe(true);
      expect(isAnimationComplete(100.001, 100, 0)).toBe(false);
    });
  });

  // ============================================================================
  // Pure Function: clampScrollTop
  // ============================================================================
  describe("clampScrollTop", () => {
    it("should clamp to 0 for negative values", () => {
      expect(clampScrollTop(-50, 1000)).toBe(0);
      expect(clampScrollTop(-0.1, 1000)).toBe(0);
    });

    it("should clamp to maxScroll for values exceeding max", () => {
      expect(clampScrollTop(1500, 1000)).toBe(1000);
      expect(clampScrollTop(1000.1, 1000)).toBe(1000);
    });

    it("should return value unchanged when within range", () => {
      expect(clampScrollTop(500, 1000)).toBe(500);
      expect(clampScrollTop(0, 1000)).toBe(0);
      expect(clampScrollTop(1000, 1000)).toBe(1000);
    });

    it("should handle zero maxScroll", () => {
      expect(clampScrollTop(100, 0)).toBe(0);
      expect(clampScrollTop(0, 0)).toBe(0);
      expect(clampScrollTop(-10, 0)).toBe(0);
    });

    it("should handle fractional values", () => {
      expect(clampScrollTop(50.5, 100)).toBe(50.5);
      expect(clampScrollTop(-0.001, 100)).toBe(0);
    });

    it("should handle very large values", () => {
      expect(clampScrollTop(Number.MAX_SAFE_INTEGER, 1000)).toBe(1000);
      expect(clampScrollTop(500, Number.MAX_SAFE_INTEGER)).toBe(500);
    });
  });

  // ============================================================================
  // Animation Convergence Simulation
  // ============================================================================
  describe("animation convergence (simulation)", () => {
    it("should converge to target within reasonable frames", () => {
      let current = 0;
      const target = 100;
      const easing = 0.3;
      const threshold = 0.5;
      let frames = 0;
      const maxFrames = 100;

      while (!isAnimationComplete(current, target, threshold) && frames < maxFrames) {
        const step = calculateEasedStep(current, target, easing);
        current += step;
        frames++;
      }

      expect(frames).toBeLessThan(30); // Should converge quickly
      expect(Math.abs(current - target)).toBeLessThanOrEqual(threshold);
    });

    it("should converge for scroll down (0 to 100)", () => {
      let current = 0;
      const target = 100;
      let frames = 0;

      while (!isAnimationComplete(current, target, DEFAULT_CONFIG.threshold) && frames < 100) {
        current += calculateEasedStep(current, target, DEFAULT_CONFIG.easing);
        frames++;
      }

      expect(current).toBeCloseTo(target, 0);
      expect(frames).toBeLessThan(25);
    });

    it("should converge for scroll up (100 to 0)", () => {
      let current = 100;
      const target = 0;
      let frames = 0;

      while (!isAnimationComplete(current, target, DEFAULT_CONFIG.threshold) && frames < 100) {
        current += calculateEasedStep(current, target, DEFAULT_CONFIG.easing);
        frames++;
      }

      expect(current).toBeCloseTo(target, 0);
      expect(frames).toBeLessThan(25);
    });

    it("should converge for large distances", () => {
      let current = 0;
      const target = 10000;
      let frames = 0;

      while (!isAnimationComplete(current, target, DEFAULT_CONFIG.threshold) && frames < 100) {
        current += calculateEasedStep(current, target, DEFAULT_CONFIG.easing);
        frames++;
      }

      // Same number of frames regardless of distance (exponential ease)
      expect(frames).toBeLessThan(30);
    });

    it("should converge faster with higher easing", () => {
      const target = 100;
      const threshold = 0.5;

      // Slow easing
      let slowCurrent = 0;
      let slowFrames = 0;
      while (!isAnimationComplete(slowCurrent, target, threshold) && slowFrames < 100) {
        slowCurrent += calculateEasedStep(slowCurrent, target, 0.1);
        slowFrames++;
      }

      // Fast easing
      let fastCurrent = 0;
      let fastFrames = 0;
      while (!isAnimationComplete(fastCurrent, target, threshold) && fastFrames < 100) {
        fastCurrent += calculateEasedStep(fastCurrent, target, 0.5);
        fastFrames++;
      }

      expect(fastFrames).toBeLessThan(slowFrames);
    });

    it("should handle bidirectional scrolling", () => {
      const current = 50;

      // Scroll down
      const stepDown = calculateEasedStep(current, 100, 0.3);
      expect(stepDown).toBeGreaterThan(0);

      // Scroll up
      const stepUp = calculateEasedStep(current, 0, 0.3);
      expect(stepUp).toBeLessThan(0);
    });

    it("should calculate total animation time estimate", () => {
      // Useful for testing: estimate how long animation takes
      let current = 0;
      const target = 100;
      let frames = 0;

      while (!isAnimationComplete(current, target, DEFAULT_CONFIG.threshold) && frames < 100) {
        current += calculateEasedStep(current, target, DEFAULT_CONFIG.easing);
        frames++;
      }

      // Total time = frames * frameInterval
      const totalTimeMs = frames * DEFAULT_CONFIG.frameInterval;
      expect(totalTimeMs).toBeLessThan(500); // Should complete within 500ms
    });

    it("should maintain monotonic progress towards target", () => {
      let current = 0;
      const target = 100;
      let prevDistance = Math.abs(target - current);

      for (let i = 0; i < 20; i++) {
        const step = calculateEasedStep(current, target, DEFAULT_CONFIG.easing);
        current += step;
        const newDistance = Math.abs(target - current);

        // Distance should always decrease (or stay same at threshold)
        expect(newDistance).toBeLessThanOrEqual(prevDistance);
        prevDistance = newDistance;
      }
    });
  });

  // ============================================================================
  // Configuration Validation
  // ============================================================================
  describe("configuration validation", () => {
    it("should accept custom easing values", () => {
      // Test with different easing values
      const slowStep = calculateEasedStep(0, 100, 0.1); // Slower
      const fastStep = calculateEasedStep(0, 100, 0.5); // Faster

      expect(fastStep).toBeGreaterThan(slowStep);
    });

    it("should accept custom threshold values", () => {
      // Tighter threshold
      expect(isAnimationComplete(99.9, 100, 0.1)).toBe(true);
      expect(isAnimationComplete(99.8, 100, 0.1)).toBe(false);

      // Looser threshold
      expect(isAnimationComplete(99, 100, 2)).toBe(true);
    });

    it("should work with extreme easing values", () => {
      // Very slow
      const verySlowStep = calculateEasedStep(0, 100, 0.01);
      expect(verySlowStep).toBe(1);

      // Very fast (but not instant)
      const veryFastStep = calculateEasedStep(0, 100, 0.9);
      expect(veryFastStep).toBe(90);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================
  describe("edge cases", () => {
    it("should handle zero distance animation", () => {
      const step = calculateEasedStep(100, 100, 0.3);
      expect(step).toBe(0);
      expect(isAnimationComplete(100, 100, 0.5)).toBe(true);
    });

    it("should handle easing = 0 (no movement)", () => {
      const step = calculateEasedStep(0, 100, 0);
      expect(step).toBe(0);
    });

    it("should handle easing = 1 (instant)", () => {
      const step = calculateEasedStep(0, 100, 1);
      expect(step).toBe(100);
    });

    it("should handle negative scroll targets", () => {
      // clampScrollTop should handle this
      expect(clampScrollTop(-100, 1000)).toBe(0);
    });

    it("should handle Infinity maxScroll", () => {
      expect(clampScrollTop(1000000, Infinity)).toBe(1000000);
    });

    it("should be stable when current equals target", () => {
      let current = 100;
      const target = 100;

      for (let i = 0; i < 10; i++) {
        const step = calculateEasedStep(current, target, 0.3);
        current += step;
      }

      expect(current).toBe(100); // Should stay exactly at 100
    });

    it("should not overshoot target", () => {
      let current = 0;
      const target = 100;

      // Run many iterations
      for (let i = 0; i < 100; i++) {
        const step = calculateEasedStep(current, target, 0.3);
        current += step;
      }

      // Should approach but never exceed target
      expect(current).toBeLessThanOrEqual(target);
      expect(current).toBeCloseTo(target, 5);
    });

    it("should not undershoot when scrolling up", () => {
      let current = 100;
      const target = 0;

      // Run many iterations
      for (let i = 0; i < 100; i++) {
        const step = calculateEasedStep(current, target, 0.3);
        current += step;
      }

      // Should approach but never go below target
      expect(current).toBeGreaterThanOrEqual(target);
      expect(current).toBeCloseTo(target, 5);
    });

    it("should handle boundary clamping correctly", () => {
      // Test clamping at boundaries
      expect(clampScrollTop(0, 1000)).toBe(0);
      expect(clampScrollTop(1000, 1000)).toBe(1000);

      // Just inside bounds
      expect(clampScrollTop(0.001, 1000)).toBe(0.001);
      expect(clampScrollTop(999.999, 1000)).toBe(999.999);
    });

    it("should handle NaN gracefully in clamp", () => {
      // NaN handling - Math.max/min with NaN returns NaN
      const result = clampScrollTop(NaN, 1000);
      expect(Number.isNaN(result)).toBe(true);
    });
  });

  // ============================================================================
  // Performance Characteristics
  // ============================================================================
  describe("performance characteristics", () => {
    it("should reach 90% of target within 7 frames", () => {
      let current = 0;
      const target = 100;

      for (let i = 0; i < 7; i++) {
        current += calculateEasedStep(current, target, 0.3);
      }

      // After 7 frames with 0.3 easing: 1 - (0.7)^7 ≈ 0.918
      expect(current).toBeGreaterThan(90);
    });

    it("should reach 99% of target within 13 frames", () => {
      let current = 0;
      const target = 100;

      for (let i = 0; i < 13; i++) {
        current += calculateEasedStep(current, target, 0.3);
      }

      // After 13 frames with 0.3 easing: 1 - (0.7)^13 ≈ 0.996
      expect(current).toBeGreaterThan(99);
    });

    it("should have more frames for larger distances with fixed threshold", () => {
      const threshold = 0.5; // Fixed absolute threshold

      // Short distance
      let shortFrames = 0;
      let shortCurrent = 0;
      while (!isAnimationComplete(shortCurrent, 10, threshold) && shortFrames < 100) {
        shortCurrent += calculateEasedStep(shortCurrent, 10, 0.3);
        shortFrames++;
      }

      // Long distance
      let longFrames = 0;
      let longCurrent = 0;
      while (!isAnimationComplete(longCurrent, 10000, threshold) && longFrames < 100) {
        longCurrent += calculateEasedStep(longCurrent, 10000, 0.3);
        longFrames++;
      }

      // With fixed absolute threshold, larger distances need more frames
      // because we're waiting to get within 0.5px of very different targets
      expect(longFrames).toBeGreaterThan(shortFrames);
      // But the difference is logarithmic, not linear
      expect(longFrames - shortFrames).toBeLessThan(30);
    });

    it("should have similar frame count with proportional threshold", () => {
      // With proportional threshold, frame count would be consistent
      // Short distance with proportional threshold
      let shortFrames = 0;
      let shortCurrent = 0;
      const shortTarget = 10;
      const shortThreshold = shortTarget * 0.005; // 0.5% of target
      while (!isAnimationComplete(shortCurrent, shortTarget, shortThreshold) && shortFrames < 100) {
        shortCurrent += calculateEasedStep(shortCurrent, shortTarget, 0.3);
        shortFrames++;
      }

      // Long distance with proportional threshold
      let longFrames = 0;
      let longCurrent = 0;
      const longTarget = 10000;
      const longThreshold = longTarget * 0.005; // 0.5% of target
      while (!isAnimationComplete(longCurrent, longTarget, longThreshold) && longFrames < 100) {
        longCurrent += calculateEasedStep(longCurrent, longTarget, 0.3);
        longFrames++;
      }

      // With proportional threshold, frame counts are similar
      expect(Math.abs(longFrames - shortFrames)).toBeLessThanOrEqual(1);
    });
  });
});
