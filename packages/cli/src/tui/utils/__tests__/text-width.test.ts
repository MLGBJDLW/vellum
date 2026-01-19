/**
 * Tests for Text Width Utilities
 */
import { describe, expect, it } from "vitest";
import {
  countLines,
  getVisualWidth,
  padToWidth,
  splitLines,
  truncateToWidth,
  wrapToWidth,
} from "../text-width.js";

describe("text-width", () => {
  describe("getVisualWidth", () => {
    it("measures ASCII text correctly", () => {
      expect(getVisualWidth("hello")).toBe(5);
      expect(getVisualWidth("test")).toBe(4);
    });

    it("handles empty string", () => {
      expect(getVisualWidth("")).toBe(0);
    });

    it("measures CJK characters as width 2", () => {
      expect(getVisualWidth("你好")).toBe(4); // 2 chars × 2 width
      expect(getVisualWidth("日本")).toBe(4);
    });

    it("measures emojis as width 2", () => {
      expect(getVisualWidth("👋")).toBe(2);
    });

    it("ANSI escape sequences have zero width", () => {
      expect(getVisualWidth("\x1b[31mred\x1b[0m")).toBe(3);
      expect(getVisualWidth("\x1b[1mbold\x1b[0m")).toBe(4);
    });
  });

  describe("truncateToWidth", () => {
    it("returns original if within maxWidth", () => {
      expect(truncateToWidth("Short", 10)).toBe("Short");
      expect(truncateToWidth("Hi", 5)).toBe("Hi");
    });

    it("truncates and adds ellipsis when too long", () => {
      expect(truncateToWidth("Hello World", 8)).toBe("Hello W…");
    });

    it("handles empty string", () => {
      expect(truncateToWidth("", 10)).toBe("");
    });

    it("handles zero maxWidth", () => {
      const result = truncateToWidth("Hello", 0);
      expect(getVisualWidth(result)).toBeLessThanOrEqual(1);
    });

    it("handles CJK text", () => {
      const result = truncateToWidth("你好世界", 5);
      expect(getVisualWidth(result)).toBeLessThanOrEqual(5);
    });

    it("uses custom ellipsis", () => {
      expect(truncateToWidth("Hello World", 8, "...")).toBe("Hello...");
    });
  });

  describe("padToWidth", () => {
    it("pads left-aligned text", () => {
      expect(padToWidth("Hi", 10, "left")).toBe("Hi        ");
    });

    it("pads right-aligned text", () => {
      expect(padToWidth("Hi", 10, "right")).toBe("        Hi");
    });

    it("pads center-aligned text", () => {
      expect(padToWidth("Hi", 10, "center")).toBe("    Hi    ");
    });

    it("handles odd padding for center alignment", () => {
      const result = padToWidth("Hi", 9, "center");
      expect(result.length).toBe(9);
    });

    it("returns original if text width >= target", () => {
      expect(padToWidth("HelloWorld", 5, "left")).toBe("HelloWorld");
    });

    it("handles empty string", () => {
      expect(padToWidth("", 5, "left")).toBe("     ");
    });

    it("defaults to left alignment", () => {
      expect(padToWidth("Hi", 5)).toBe("Hi   ");
    });

    it("handles CJK text", () => {
      const result = padToWidth("你好", 8, "center");
      expect(getVisualWidth(result)).toBe(8);
    });
  });

  describe("wrapToWidth", () => {
    it("wraps long lines at word boundaries", () => {
      const result = wrapToWidth("This is a long line that needs wrapping", 20);
      expect(result).toContain("\n");
    });

    it("handles empty string", () => {
      expect(wrapToWidth("", 20)).toBe("");
    });

    it("hard wraps with option", () => {
      const result = wrapToWidth("LongWordThatCantBreak", 10, { hard: true });
      expect(result).toContain("\n");
    });

    it("preserves short lines", () => {
      expect(wrapToWidth("Hi", 10)).toBe("Hi");
    });
  });

  describe("splitLines", () => {
    it("returns array of lines", () => {
      const lines = splitLines("Hello World", 6);
      expect(Array.isArray(lines)).toBe(true);
      expect(lines.length).toBeGreaterThan(1);
    });

    it("handles single line that fits", () => {
      const lines = splitLines("Hi", 10);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe("Hi");
    });

    it("handles empty string", () => {
      const lines = splitLines("", 10);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe("");
    });
  });

  describe("countLines", () => {
    it("counts lines after wrapping", () => {
      expect(countLines("Hello World", 6)).toBeGreaterThan(1);
    });

    it("returns 1 for short text", () => {
      expect(countLines("Hi", 10)).toBe(1);
    });

    it("returns 1 for empty string", () => {
      expect(countLines("", 10)).toBe(1);
    });
  });
});
