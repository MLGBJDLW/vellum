/**
 * ScrollIndicator Component Tests (T3.3)
 *
 * @module tui/components/common/__tests__/ScrollIndicator.test
 */

import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../../../theme/index.js";
import { ScrollIndicator } from "../ScrollIndicator.js";

/**
 * Wrap component with ThemeProvider for testing.
 */
function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("ScrollIndicator", () => {
  describe("visibility", () => {
    it("does not show when content fits in viewport", () => {
      const { lastFrame } = renderWithTheme(
        <ScrollIndicator totalHeight={10} offsetFromBottom={0} viewportHeight={20} />
      );

      // Should render nothing (or empty)
      expect(lastFrame()).toBe("");
    });

    it("does not show when content equals viewport", () => {
      const { lastFrame } = renderWithTheme(
        <ScrollIndicator totalHeight={20} offsetFromBottom={0} viewportHeight={20} />
      );

      expect(lastFrame()).toBe("");
    });

    it("shows when content exceeds viewport", () => {
      const { lastFrame } = renderWithTheme(
        <ScrollIndicator totalHeight={100} offsetFromBottom={0} viewportHeight={20} />
      );

      // Should render scrollbar characters
      expect(lastFrame()).toMatch(/[█│]/);
    });

    it("respects show=false override", () => {
      const { lastFrame } = renderWithTheme(
        <ScrollIndicator totalHeight={100} offsetFromBottom={0} viewportHeight={20} show={false} />
      );

      expect(lastFrame()).toBe("");
    });

    it("respects show=true override when not scrollable", () => {
      const { lastFrame } = renderWithTheme(
        <ScrollIndicator totalHeight={10} offsetFromBottom={0} viewportHeight={20} show={true} />
      );

      // Even with show=true, returns null when not scrollable (no metrics)
      expect(lastFrame()).toBe("");
    });
  });

  describe("thumb position", () => {
    it("positions thumb at bottom when offsetFromBottom is 0", () => {
      const { lastFrame } = renderWithTheme(
        <ScrollIndicator totalHeight={100} offsetFromBottom={0} viewportHeight={10} />
      );

      const frame = lastFrame() ?? "";
      const lines = frame.split("\n").filter(Boolean);

      // Thumb should be at the end (bottom)
      // With 100 total, 10 viewport, thumb is ~1 line (10/100 = 10%)
      // At offset 0, thumb is at bottom
      const lastLine = lines[lines.length - 1];
      expect(lastLine).toContain("█");
    });

    it("positions thumb at top when at max offset", () => {
      const totalHeight = 100;
      const viewportHeight = 10;
      const maxOffset = totalHeight - viewportHeight; // 90

      const { lastFrame } = renderWithTheme(
        <ScrollIndicator
          totalHeight={totalHeight}
          offsetFromBottom={maxOffset}
          viewportHeight={viewportHeight}
        />
      );

      const frame = lastFrame() ?? "";
      const lines = frame.split("\n").filter(Boolean);

      // Thumb should be at the start (top)
      const firstLine = lines[0];
      expect(firstLine).toContain("█");
    });

    it("positions thumb in middle when offset is half", () => {
      const totalHeight = 100;
      const viewportHeight = 10;
      const halfOffset = Math.floor((totalHeight - viewportHeight) / 2); // 45

      const { lastFrame } = renderWithTheme(
        <ScrollIndicator
          totalHeight={totalHeight}
          offsetFromBottom={halfOffset}
          viewportHeight={viewportHeight}
        />
      );

      const frame = lastFrame() ?? "";
      const lines = frame.split("\n").filter(Boolean);

      // Should have track characters at both top and bottom
      expect(lines.length).toBeGreaterThan(0);
      // Thumb should be somewhere in the middle
      const thumbIndex = lines.findIndex((line) => line.includes("█"));
      expect(thumbIndex).toBeGreaterThan(0);
      expect(thumbIndex).toBeLessThan(lines.length - 1);
    });
  });

  describe("thumb size", () => {
    it("has larger thumb when viewport is large relative to content", () => {
      const { lastFrame } = renderWithTheme(
        <ScrollIndicator totalHeight={20} offsetFromBottom={0} viewportHeight={10} />
      );

      const frame = lastFrame() ?? "";
      const thumbCount = (frame.match(/█/g) || []).length;

      // With 50% viewport ratio, thumb should be ~5 lines (half of 10)
      expect(thumbCount).toBeGreaterThanOrEqual(4);
    });

    it("has smaller thumb when viewport is small relative to content", () => {
      const { lastFrame } = renderWithTheme(
        <ScrollIndicator totalHeight={200} offsetFromBottom={0} viewportHeight={10} />
      );

      const frame = lastFrame() ?? "";
      const thumbCount = (frame.match(/█/g) || []).length;

      // With 5% viewport ratio, thumb should be ~1 line (minimum)
      expect(thumbCount).toBeGreaterThanOrEqual(1);
      expect(thumbCount).toBeLessThanOrEqual(2);
    });

    it("respects minimum thumb size of 1", () => {
      const { lastFrame } = renderWithTheme(
        <ScrollIndicator totalHeight={1000} offsetFromBottom={0} viewportHeight={10} />
      );

      const frame = lastFrame() ?? "";
      const thumbCount = (frame.match(/█/g) || []).length;

      // Even with tiny ratio, should have at least 1 thumb character
      expect(thumbCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("edge cases", () => {
    it("handles zero viewport height", () => {
      const { lastFrame } = renderWithTheme(
        <ScrollIndicator totalHeight={100} offsetFromBottom={0} viewportHeight={0} />
      );

      expect(lastFrame()).toBe("");
    });

    it("handles zero total height", () => {
      const { lastFrame } = renderWithTheme(
        <ScrollIndicator totalHeight={0} offsetFromBottom={0} viewportHeight={10} />
      );

      expect(lastFrame()).toBe("");
    });

    it("handles negative offset gracefully", () => {
      // Should clamp to valid range
      const { lastFrame } = renderWithTheme(
        <ScrollIndicator totalHeight={100} offsetFromBottom={-10} viewportHeight={10} />
      );

      // Should still render
      expect(lastFrame()).toMatch(/[█│]/);
    });
  });
});
