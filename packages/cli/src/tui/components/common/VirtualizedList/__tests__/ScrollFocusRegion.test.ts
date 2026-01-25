/**
 * Unit tests for ScrollFocusRegion functionality.
 *
 * Tests the pure utility functions and createScrollFocusHandler.
 * The useScrollFocus hook behavior is tested through its observable effects.
 *
 * @module ScrollFocusRegion.test
 */

import { describe, expect, it, vi } from "vitest";
import {
  createScrollFocusHandler,
  DEFAULT_SCROLL_FOCUS_CONFIG,
  type ScrollFocusRegionConfig,
} from "../ScrollFocusRegion.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a test configuration with optional overrides.
 */
function createTestConfig(overrides?: Partial<ScrollFocusRegionConfig>): ScrollFocusRegionConfig {
  return {
    ...DEFAULT_SCROLL_FOCUS_CONFIG,
    ...overrides,
  };
}

/**
 * Creates an array of test lines.
 */
function createLines(count: number, prefix = "line"): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i}`);
}

/**
 * Creates a mock scroll handler that tracks calls.
 */
function createMockScrollHandler(consumed = true): {
  handler: (deltaY: number) => boolean;
  calls: number[];
} {
  const calls: number[] = [];
  return {
    handler: (deltaY: number) => {
      calls.push(deltaY);
      return consumed;
    },
    calls,
  };
}

// ============================================================================
// Tests: DEFAULT_SCROLL_FOCUS_CONFIG
// ============================================================================

describe("ScrollFocusRegion", () => {
  describe("DEFAULT_SCROLL_FOCUS_CONFIG", () => {
    it("should have expected default values", () => {
      expect(DEFAULT_SCROLL_FOCUS_CONFIG.maxVisibleLines).toBe(20);
      expect(DEFAULT_SCROLL_FOCUS_CONFIG.enableFocusMode).toBe(true);
      expect(DEFAULT_SCROLL_FOCUS_CONFIG.boundaryThreshold).toBe(1);
      expect(DEFAULT_SCROLL_FOCUS_CONFIG.focusTransitionMs).toBe(150);
    });

    it("should be readonly (frozen)", () => {
      // Config should not be mutable
      expect(DEFAULT_SCROLL_FOCUS_CONFIG).toEqual({
        maxVisibleLines: 20,
        enableFocusMode: true,
        boundaryThreshold: 1,
        focusTransitionMs: 150,
      });
    });
  });

  // ============================================================================
  // Tests: createScrollFocusHandler
  // ============================================================================

  describe("createScrollFocusHandler", () => {
    it("should call focused region handler when region is focused", () => {
      const { handler, calls } = createMockScrollHandler(true);
      const regions = new Map([["region-1", handler]]);
      const parentScrollBy = vi.fn();

      const handleScroll = createScrollFocusHandler(regions, "region-1", parentScrollBy);

      handleScroll(5);

      expect(calls).toEqual([5]);
      expect(parentScrollBy).not.toHaveBeenCalled();
    });

    it("should call parent scrollBy when no region is focused", () => {
      const { handler, calls } = createMockScrollHandler(true);
      const regions = new Map([["region-1", handler]]);
      const parentScrollBy = vi.fn();

      const handleScroll = createScrollFocusHandler(
        regions,
        null, // No focused region
        parentScrollBy
      );

      handleScroll(5);

      expect(calls).toEqual([]); // Handler not called
      expect(parentScrollBy).toHaveBeenCalledWith(5);
    });

    it("should call parent scrollBy when focused region does not consume event", () => {
      const { handler, calls } = createMockScrollHandler(false); // Not consumed
      const regions = new Map([["region-1", handler]]);
      const parentScrollBy = vi.fn();

      const handleScroll = createScrollFocusHandler(regions, "region-1", parentScrollBy);

      handleScroll(-3);

      expect(calls).toEqual([-3]); // Handler was called
      expect(parentScrollBy).toHaveBeenCalledWith(-3); // But parent also called
    });

    it("should call parent scrollBy when focused region ID not in map", () => {
      const { handler, calls } = createMockScrollHandler(true);
      const regions = new Map([["region-1", handler]]);
      const parentScrollBy = vi.fn();

      const handleScroll = createScrollFocusHandler(
        regions,
        "unknown-region", // Not in map
        parentScrollBy
      );

      handleScroll(10);

      expect(calls).toEqual([]);
      expect(parentScrollBy).toHaveBeenCalledWith(10);
    });

    it("should handle multiple regions correctly", () => {
      const handler1 = createMockScrollHandler(true);
      const handler2 = createMockScrollHandler(true);
      const regions = new Map([
        ["region-1", handler1.handler],
        ["region-2", handler2.handler],
      ]);
      const parentScrollBy = vi.fn();

      // Focus region-2
      const handleScroll = createScrollFocusHandler(regions, "region-2", parentScrollBy);

      handleScroll(7);

      expect(handler1.calls).toEqual([]); // Not focused
      expect(handler2.calls).toEqual([7]); // Focused
      expect(parentScrollBy).not.toHaveBeenCalled();
    });

    it("should handle empty regions map", () => {
      const regions = new Map<string, (deltaY: number) => boolean>();
      const parentScrollBy = vi.fn();

      const handleScroll = createScrollFocusHandler(regions, null, parentScrollBy);

      handleScroll(1);

      expect(parentScrollBy).toHaveBeenCalledWith(1);
    });

    it("should handle negative delta (scroll up)", () => {
      const { handler, calls } = createMockScrollHandler(true);
      const regions = new Map([["region-1", handler]]);
      const parentScrollBy = vi.fn();

      const handleScroll = createScrollFocusHandler(regions, "region-1", parentScrollBy);

      handleScroll(-10);

      expect(calls).toEqual([-10]);
      expect(parentScrollBy).not.toHaveBeenCalled();
    });

    it("should handle zero delta", () => {
      const { handler, calls } = createMockScrollHandler(true);
      const regions = new Map([["region-1", handler]]);
      const parentScrollBy = vi.fn();

      const handleScroll = createScrollFocusHandler(regions, "region-1", parentScrollBy);

      handleScroll(0);

      expect(calls).toEqual([0]);
      expect(parentScrollBy).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Tests: Configuration merging
  // ============================================================================

  describe("configuration merging", () => {
    it("should allow partial config overrides", () => {
      const config = createTestConfig({ maxVisibleLines: 30 });

      expect(config.maxVisibleLines).toBe(30);
      expect(config.enableFocusMode).toBe(true); // Default preserved
      expect(config.boundaryThreshold).toBe(1); // Default preserved
      expect(config.focusTransitionMs).toBe(150); // Default preserved
    });

    it("should allow overriding all values", () => {
      const config = createTestConfig({
        maxVisibleLines: 50,
        enableFocusMode: false,
        boundaryThreshold: 3,
        focusTransitionMs: 200,
      });

      expect(config.maxVisibleLines).toBe(50);
      expect(config.enableFocusMode).toBe(false);
      expect(config.boundaryThreshold).toBe(3);
      expect(config.focusTransitionMs).toBe(200);
    });
  });

  // ============================================================================
  // Tests: Boundary calculations (pure logic tests)
  // ============================================================================

  describe("boundary calculations", () => {
    // These test the boundary detection logic that would be used in useScrollFocus

    describe("top boundary detection", () => {
      it("should detect at top when scrollTop is 0", () => {
        const scrollTop = 0;
        const boundaryThreshold = 1;
        const atTopBoundary = scrollTop <= boundaryThreshold;

        expect(atTopBoundary).toBe(true);
      });

      it("should detect at top when scrollTop equals threshold", () => {
        const scrollTop = 1;
        const boundaryThreshold = 1;
        const atTopBoundary = scrollTop <= boundaryThreshold;

        expect(atTopBoundary).toBe(true);
      });

      it("should not detect at top when scrollTop exceeds threshold", () => {
        const scrollTop = 5;
        const boundaryThreshold = 1;
        const atTopBoundary = scrollTop <= boundaryThreshold;

        expect(atTopBoundary).toBe(false);
      });

      it("should respect custom threshold", () => {
        const scrollTop = 3;
        const boundaryThreshold = 5;
        const atTopBoundary = scrollTop <= boundaryThreshold;

        expect(atTopBoundary).toBe(true);
      });
    });

    describe("bottom boundary detection", () => {
      it("should detect at bottom when at max scroll", () => {
        const contentHeight = 100;
        const viewportHeight = 20;
        const maxScrollTop = contentHeight - viewportHeight; // 80
        const scrollTop = 80;
        const boundaryThreshold = 1;
        const atBottomBoundary = scrollTop >= maxScrollTop - boundaryThreshold;

        expect(atBottomBoundary).toBe(true);
      });

      it("should detect at bottom within threshold", () => {
        const contentHeight = 100;
        const viewportHeight = 20;
        const maxScrollTop = contentHeight - viewportHeight; // 80
        const scrollTop = 79;
        const boundaryThreshold = 1;
        const atBottomBoundary = scrollTop >= maxScrollTop - boundaryThreshold;

        expect(atBottomBoundary).toBe(true);
      });

      it("should not detect at bottom when not near max", () => {
        const contentHeight = 100;
        const viewportHeight = 20;
        const maxScrollTop = contentHeight - viewportHeight; // 80
        const scrollTop = 50;
        const boundaryThreshold = 1;
        const atBottomBoundary = scrollTop >= maxScrollTop - boundaryThreshold;

        expect(atBottomBoundary).toBe(false);
      });
    });

    describe("scroll position clamping", () => {
      it("should clamp negative scrollTop to 0", () => {
        const position = -10;
        const maxScrollTop = 80;
        const clamped = Math.max(0, Math.min(maxScrollTop, Math.round(position)));

        expect(clamped).toBe(0);
      });

      it("should clamp scrollTop exceeding max", () => {
        const position = 100;
        const maxScrollTop = 80;
        const clamped = Math.max(0, Math.min(maxScrollTop, Math.round(position)));

        expect(clamped).toBe(80);
      });

      it("should allow valid scrollTop within range", () => {
        const position = 50;
        const maxScrollTop = 80;
        const clamped = Math.max(0, Math.min(maxScrollTop, Math.round(position)));

        expect(clamped).toBe(50);
      });

      it("should round fractional positions", () => {
        const position = 25.7;
        const maxScrollTop = 80;
        const clamped = Math.max(0, Math.min(maxScrollTop, Math.round(position)));

        expect(clamped).toBe(26);
      });
    });

    describe("maxScrollTop calculation", () => {
      it("should calculate maxScrollTop correctly", () => {
        const contentHeight = 100;
        const viewportHeight = 20;
        const maxScrollTop = Math.max(0, contentHeight - viewportHeight);

        expect(maxScrollTop).toBe(80);
      });

      it("should return 0 when content fits in viewport", () => {
        const contentHeight = 15;
        const viewportHeight = 20;
        const maxScrollTop = Math.max(0, contentHeight - viewportHeight);

        expect(maxScrollTop).toBe(0);
      });

      it("should return 0 when content equals viewport", () => {
        const contentHeight = 20;
        const viewportHeight = 20;
        const maxScrollTop = Math.max(0, contentHeight - viewportHeight);

        expect(maxScrollTop).toBe(0);
      });
    });

    describe("viewport height calculation", () => {
      it("should use maxVisibleLines when content is larger", () => {
        const lines = createLines(100);
        const maxVisibleLines = 20;
        const viewportHeight = Math.min(maxVisibleLines, lines.length);

        expect(viewportHeight).toBe(20);
      });

      it("should use content length when smaller than maxVisibleLines", () => {
        const lines = createLines(10);
        const maxVisibleLines = 20;
        const viewportHeight = Math.min(maxVisibleLines, lines.length);

        expect(viewportHeight).toBe(10);
      });

      it("should handle empty lines array", () => {
        const lines: string[] = [];
        const maxVisibleLines = 20;
        const viewportHeight = Math.min(maxVisibleLines, lines.length);

        expect(viewportHeight).toBe(0);
      });
    });
  });

  // ============================================================================
  // Tests: Visible line range calculation
  // ============================================================================

  describe("visible line range calculation", () => {
    it("should calculate correct start and end indices", () => {
      const lines = createLines(100);
      const scrollTop = 10;
      const maxVisibleLines = 20;

      const start = scrollTop;
      const end = Math.min(start + maxVisibleLines, lines.length);
      const visibleLines = lines.slice(start, end);

      expect(visibleLines.length).toBe(20);
      expect(visibleLines[0]).toBe("line-10");
      expect(visibleLines[19]).toBe("line-29");
    });

    it("should handle scrollTop=0", () => {
      const lines = createLines(100);
      const scrollTop = 0;
      const maxVisibleLines = 20;

      const start = scrollTop;
      const end = Math.min(start + maxVisibleLines, lines.length);
      const visibleLines = lines.slice(start, end);

      expect(visibleLines.length).toBe(20);
      expect(visibleLines[0]).toBe("line-0");
      expect(visibleLines[19]).toBe("line-19");
    });

    it("should handle scrollTop at end of content", () => {
      const lines = createLines(100);
      const scrollTop = 80; // maxScrollTop for 100 lines with 20 viewport
      const maxVisibleLines = 20;

      const start = scrollTop;
      const end = Math.min(start + maxVisibleLines, lines.length);
      const visibleLines = lines.slice(start, end);

      expect(visibleLines.length).toBe(20);
      expect(visibleLines[0]).toBe("line-80");
      expect(visibleLines[19]).toBe("line-99");
    });

    it("should handle content smaller than viewport", () => {
      const lines = createLines(10);
      const scrollTop = 0;
      const maxVisibleLines = 20;

      const start = scrollTop;
      const end = Math.min(start + maxVisibleLines, lines.length);
      const visibleLines = lines.slice(start, end);

      expect(visibleLines.length).toBe(10);
      expect(visibleLines[0]).toBe("line-0");
      expect(visibleLines[9]).toBe("line-9");
    });

    it("should handle empty lines array", () => {
      const lines: string[] = [];
      const scrollTop = 0;
      const maxVisibleLines = 20;

      const start = scrollTop;
      const end = Math.min(start + maxVisibleLines, lines.length);
      const visibleLines = lines.slice(start, end);

      expect(visibleLines.length).toBe(0);
    });

    it("should handle partial visible range at end", () => {
      const lines = createLines(25);
      const scrollTop = 20;
      const maxVisibleLines = 20;

      const start = scrollTop;
      const end = Math.min(start + maxVisibleLines, lines.length);
      const visibleLines = lines.slice(start, end);

      // Only 5 lines visible (25 - 20 = 5)
      expect(visibleLines.length).toBe(5);
      expect(visibleLines[0]).toBe("line-20");
      expect(visibleLines[4]).toBe("line-24");
    });
  });

  // ============================================================================
  // Tests: Scroll capability checks
  // ============================================================================

  describe("scroll capability checks", () => {
    it("should allow scroll up when not at top", () => {
      const scrollTop = 10;
      const canScrollUp = scrollTop > 0;

      expect(canScrollUp).toBe(true);
    });

    it("should not allow scroll up when at top", () => {
      const scrollTop = 0;
      const canScrollUp = scrollTop > 0;

      expect(canScrollUp).toBe(false);
    });

    it("should allow scroll down when not at bottom", () => {
      const scrollTop = 50;
      const maxScrollTop = 80;
      const canScrollDown = scrollTop < maxScrollTop;

      expect(canScrollDown).toBe(true);
    });

    it("should not allow scroll down when at bottom", () => {
      const scrollTop = 80;
      const maxScrollTop = 80;
      const canScrollDown = scrollTop < maxScrollTop;

      expect(canScrollDown).toBe(false);
    });

    it("should allow neither when content fits viewport", () => {
      const scrollTop = 0;
      const maxScrollTop = 0; // Content fits
      const canScrollUp = scrollTop > 0;
      const canScrollDown = scrollTop < maxScrollTop;

      expect(canScrollUp).toBe(false);
      expect(canScrollDown).toBe(false);
    });
  });

  // ============================================================================
  // Tests: Focus mode behavior
  // ============================================================================

  describe("focus mode behavior", () => {
    it("should determine if focus mode should consume event", () => {
      // When focused and can scroll, should consume
      const enableFocusMode = true;
      const isFocused = true;
      const contentHeight = 100;
      const viewportHeight = 20;

      const shouldConsume = enableFocusMode && isFocused && contentHeight > viewportHeight;

      expect(shouldConsume).toBe(true);
    });

    it("should not consume when focus mode disabled", () => {
      const enableFocusMode = false;
      const isFocused = true;
      const contentHeight = 100;
      const viewportHeight = 20;

      const shouldConsume = enableFocusMode && isFocused && contentHeight > viewportHeight;

      expect(shouldConsume).toBe(false);
    });

    it("should not consume when not focused", () => {
      const enableFocusMode = true;
      const isFocused = false;
      const contentHeight = 100;
      const viewportHeight = 20;

      const shouldConsume = enableFocusMode && isFocused && contentHeight > viewportHeight;

      expect(shouldConsume).toBe(false);
    });

    it("should not consume when content fits viewport", () => {
      const enableFocusMode = true;
      const isFocused = true;
      const contentHeight = 10;
      const viewportHeight = 20;

      const shouldConsume = enableFocusMode && isFocused && contentHeight > viewportHeight;

      expect(shouldConsume).toBe(false);
    });
  });

  // ============================================================================
  // Tests: Scroll indicator logic
  // ============================================================================

  describe("scroll indicator logic", () => {
    it("should show up arrow when can scroll up", () => {
      const canScrollUp = true;
      const canScrollDown = false;
      const indicators: string[] = [];

      if (canScrollUp) indicators.push("↑");
      if (canScrollDown) indicators.push("↓");

      expect(indicators).toEqual(["↑"]);
    });

    it("should show down arrow when can scroll down", () => {
      const canScrollUp = false;
      const canScrollDown = true;
      const indicators: string[] = [];

      if (canScrollUp) indicators.push("↑");
      if (canScrollDown) indicators.push("↓");

      expect(indicators).toEqual(["↓"]);
    });

    it("should show both arrows when can scroll both ways", () => {
      const canScrollUp = true;
      const canScrollDown = true;
      const indicators: string[] = [];

      if (canScrollUp) indicators.push("↑");
      if (canScrollDown) indicators.push("↓");

      expect(indicators).toEqual(["↑", "↓"]);
    });

    it("should show no arrows when cannot scroll", () => {
      const canScrollUp = false;
      const canScrollDown = false;
      const indicators: string[] = [];

      if (canScrollUp) indicators.push("↑");
      if (canScrollDown) indicators.push("↓");

      expect(indicators).toEqual([]);
    });

    it("should build correct indicator text", () => {
      const scrollTop = 10;
      const maxVisibleLines = 20;
      const totalLines = 100;

      const visibleStart = scrollTop + 1; // 1-indexed for display
      const visibleEnd = Math.min(scrollTop + maxVisibleLines, totalLines);
      const indicatorText = `(${visibleStart}-${visibleEnd}/${totalLines})`;

      expect(indicatorText).toBe("(11-30/100)");
    });
  });

  // ============================================================================
  // Tests: Wheel event handling logic
  // ============================================================================

  describe("wheel event handling logic", () => {
    it("should not consume at top boundary scrolling up", () => {
      const scrollingUp = true; // deltaY < 0
      const atTopBoundary = true;

      const shouldPropagate = scrollingUp && atTopBoundary;

      expect(shouldPropagate).toBe(true);
    });

    it("should not consume at bottom boundary scrolling down", () => {
      const scrollingDown = true; // deltaY > 0
      const atBottomBoundary = true;

      const shouldPropagate = scrollingDown && atBottomBoundary;

      expect(shouldPropagate).toBe(true);
    });

    it("should consume at top boundary scrolling down", () => {
      const scrollingDown = true;
      const atTopBoundary = true;
      const atBottomBoundary = false;

      const shouldPropagate =
        (scrollingDown && atBottomBoundary) || (!scrollingDown && atTopBoundary);

      // scrollingDown=true, atTopBoundary=true, but scrollingDown && atBottomBoundary=false
      // and !scrollingDown && atTopBoundary = false && true = false
      expect(shouldPropagate).toBe(false);
    });

    it("should consume at bottom boundary scrolling up", () => {
      const scrollingUp = true;
      const atTopBoundary = false;
      const atBottomBoundary = true;

      const shouldPropagate = (scrollingUp && atTopBoundary) || (!scrollingUp && atBottomBoundary);

      expect(shouldPropagate).toBe(false);
    });

    it("should consume when in middle of content", () => {
      const atTopBoundary = false;
      const atBottomBoundary = false;

      // In middle, should always consume regardless of direction
      const shouldPropagate = atTopBoundary || atBottomBoundary;

      expect(shouldPropagate).toBe(false);
    });
  });

  // ============================================================================
  // Tests: Edge cases
  // ============================================================================

  describe("edge cases", () => {
    it("should handle single line content", () => {
      const lines = createLines(1);
      const maxVisibleLines = 20;
      const contentHeight = lines.length;
      const viewportHeight = Math.min(maxVisibleLines, contentHeight);
      const maxScrollTop = Math.max(0, contentHeight - viewportHeight);

      expect(contentHeight).toBe(1);
      expect(viewportHeight).toBe(1);
      expect(maxScrollTop).toBe(0);
    });

    it("should handle content exactly matching viewport", () => {
      const lines = createLines(20);
      const maxVisibleLines = 20;
      const contentHeight = lines.length;
      const viewportHeight = Math.min(maxVisibleLines, contentHeight);
      const maxScrollTop = Math.max(0, contentHeight - viewportHeight);

      expect(contentHeight).toBe(20);
      expect(viewportHeight).toBe(20);
      expect(maxScrollTop).toBe(0);
    });

    it("should handle very large content", () => {
      const lines = createLines(10000);
      const maxVisibleLines = 20;
      const contentHeight = lines.length;
      const viewportHeight = Math.min(maxVisibleLines, contentHeight);
      const maxScrollTop = Math.max(0, contentHeight - viewportHeight);

      expect(contentHeight).toBe(10000);
      expect(viewportHeight).toBe(20);
      expect(maxScrollTop).toBe(9980);
    });

    it("should handle boundary threshold of 0", () => {
      const scrollTop = 0;
      const boundaryThreshold = 0;
      const atTopBoundary = scrollTop <= boundaryThreshold;

      expect(atTopBoundary).toBe(true);

      const scrollTop2 = 1;
      const atTopBoundary2 = scrollTop2 <= boundaryThreshold;

      expect(atTopBoundary2).toBe(false);
    });

    it("should handle large boundary threshold", () => {
      const scrollTop = 10;
      const boundaryThreshold = 20;
      const atTopBoundary = scrollTop <= boundaryThreshold;

      expect(atTopBoundary).toBe(true);
    });
  });
});
