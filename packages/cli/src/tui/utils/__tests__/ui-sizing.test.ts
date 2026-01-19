/**
 * Tests for UI Sizing Utilities
 */
import { describe, expect, it } from "vitest";
import {
  clamp,
  DEFAULT_TERMINAL_HEIGHT,
  DEFAULT_TERMINAL_WIDTH,
  getContentPadding,
  getMaxContentWidth,
  getTerminalHeight,
  getTerminalSize,
  getTerminalWidth,
  lerp,
  NARROW_CONTENT_RATIO,
  NARROW_WIDTH_BREAKPOINT,
  WIDE_CONTENT_RATIO,
  WIDE_WIDTH_BREAKPOINT,
} from "../ui-sizing.js";

describe("ui-sizing", () => {
  describe("lerp", () => {
    it("returns min when t=0", () => {
      expect(lerp(0, 100, 0)).toBe(0);
      expect(lerp(10, 20, 0)).toBe(10);
    });

    it("returns max when t=1", () => {
      expect(lerp(0, 100, 1)).toBe(100);
      expect(lerp(10, 20, 1)).toBe(20);
    });

    it("interpolates correctly at t=0.5", () => {
      expect(lerp(0, 100, 0.5)).toBe(50);
      expect(lerp(10, 20, 0.5)).toBe(15);
    });

    it("interpolates correctly at t=0.25", () => {
      expect(lerp(0, 100, 0.25)).toBe(25);
      expect(lerp(10, 20, 0.25)).toBe(12.5);
    });

    it("handles negative values", () => {
      expect(lerp(-100, 100, 0.5)).toBe(0);
      expect(lerp(-50, -10, 0.5)).toBe(-30);
    });
  });

  describe("clamp", () => {
    it("returns value when within range", () => {
      expect(clamp(50, 0, 100)).toBe(50);
      expect(clamp(0, 0, 100)).toBe(0);
      expect(clamp(100, 0, 100)).toBe(100);
    });

    it("clamps to min when value is below range", () => {
      expect(clamp(-10, 0, 100)).toBe(0);
      expect(clamp(-100, -50, 50)).toBe(-50);
    });

    it("clamps to max when value is above range", () => {
      expect(clamp(150, 0, 100)).toBe(100);
      expect(clamp(200, 0, 100)).toBe(100);
    });

    it("handles zero range", () => {
      expect(clamp(50, 10, 10)).toBe(10);
    });
  });

  describe("getTerminalWidth", () => {
    it("returns default when stdout has no columns", () => {
      expect(getTerminalWidth(80)).toBe(process.stdout.columns ?? 80);
    });

    it("uses custom fallback", () => {
      // When stdout.columns is undefined, uses fallback
      const fallback = 120;
      const result = getTerminalWidth(fallback);
      expect(result).toBeGreaterThan(0);
    });
  });

  describe("getTerminalHeight", () => {
    it("returns default when stdout has no rows", () => {
      expect(getTerminalHeight(24)).toBe(process.stdout.rows ?? 24);
    });

    it("uses custom fallback", () => {
      const fallback = 50;
      const result = getTerminalHeight(fallback);
      expect(result).toBeGreaterThan(0);
    });
  });

  describe("getMaxContentWidth", () => {
    it("uses narrow ratio for widths <= 80", () => {
      expect(getMaxContentWidth(80)).toBe(Math.floor(80 * NARROW_CONTENT_RATIO));
      expect(getMaxContentWidth(60)).toBe(Math.floor(60 * NARROW_CONTENT_RATIO));
    });

    it("uses wide ratio for widths >= 132", () => {
      expect(getMaxContentWidth(132)).toBe(Math.floor(132 * WIDE_CONTENT_RATIO));
      expect(getMaxContentWidth(200)).toBe(Math.floor(200 * WIDE_CONTENT_RATIO));
    });

    it("interpolates for widths between 80 and 132", () => {
      const midWidth = 106; // Midpoint between 80 and 132
      const result = getMaxContentWidth(midWidth);
      // Should be between the two ratios
      const minExpected = Math.floor(midWidth * WIDE_CONTENT_RATIO);
      const maxExpected = Math.floor(midWidth * NARROW_CONTENT_RATIO);
      expect(result).toBeGreaterThanOrEqual(minExpected);
      expect(result).toBeLessThanOrEqual(maxExpected);
    });

    it("handles zero width", () => {
      expect(getMaxContentWidth(0)).toBe(0);
    });
  });

  describe("getContentPadding", () => {
    it("returns left and right padding", () => {
      const result = getContentPadding(100);
      expect(result).toHaveProperty("left");
      expect(result).toHaveProperty("right");
      expect(typeof result.left).toBe("number");
      expect(typeof result.right).toBe("number");
    });

    it("padding + content = terminal width", () => {
      const width = 100;
      const { left, right } = getContentPadding(width);
      const contentWidth = getMaxContentWidth(width);
      expect(left + right + contentWidth).toBe(width);
    });

    it("distributes padding roughly evenly", () => {
      const { left, right } = getContentPadding(100);
      expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    });
  });

  describe("getTerminalSize", () => {
    it("returns object with width and height", () => {
      const size = getTerminalSize();
      expect(size).toHaveProperty("width");
      expect(size).toHaveProperty("height");
      expect(typeof size.width).toBe("number");
      expect(typeof size.height).toBe("number");
    });
  });

  describe("exported constants", () => {
    it("exports expected default values", () => {
      expect(DEFAULT_TERMINAL_WIDTH).toBe(80);
      expect(DEFAULT_TERMINAL_HEIGHT).toBe(24);
      expect(NARROW_WIDTH_BREAKPOINT).toBe(80);
      expect(WIDE_WIDTH_BREAKPOINT).toBe(132);
    });

    it("exports valid ratios", () => {
      expect(NARROW_CONTENT_RATIO).toBeGreaterThan(0);
      expect(NARROW_CONTENT_RATIO).toBeLessThanOrEqual(1);
      expect(WIDE_CONTENT_RATIO).toBeGreaterThan(0);
      expect(WIDE_CONTENT_RATIO).toBeLessThanOrEqual(1);
    });
  });
});
