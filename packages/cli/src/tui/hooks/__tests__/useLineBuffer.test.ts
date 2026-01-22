/**
 * useLineBuffer Hook Tests
 *
 * Tests for the line buffer hook that pre-wraps messages for scrolling.
 *
 * @module tui/hooks/__tests__/useLineBuffer.test
 */

import { describe, expect, it } from "vitest";
import { wrapLine, wrapText } from "../useLineBuffer.js";

// =============================================================================
// Pure Function Tests
// =============================================================================

describe("wrapLine", () => {
  describe("basic wrapping", () => {
    it("should return single line when text fits", () => {
      const result = wrapLine("hello", 10);
      expect(result).toEqual(["hello"]);
    });

    it("should wrap text that exceeds width", () => {
      const result = wrapLine("hello world", 5);
      expect(result).toEqual(["hello", " worl", "d"]);
    });

    it("should handle empty string", () => {
      const result = wrapLine("", 10);
      expect(result).toEqual([""]);
    });

    it("should handle whitespace-only string", () => {
      const result = wrapLine("   ", 10);
      expect(result).toEqual(["   "]);
    });

    it("should handle single character", () => {
      const result = wrapLine("a", 10);
      expect(result).toEqual(["a"]);
    });

    it("should handle exact width match", () => {
      const result = wrapLine("hello", 5);
      expect(result).toEqual(["hello"]);
    });

    it("should handle minimum width of 1", () => {
      const result = wrapLine("abc", 0);
      // Width 0 should be treated as 1
      expect(result).toEqual(["a", "b", "c"]);
    });
  });

  describe("CJK and special characters", () => {
    it("should handle CJK characters (2-width)", () => {
      // 中文 = 4 display width (2 chars * 2 width each)
      const result = wrapLine("中文测试", 4);
      // Each CJK char is 2 width, so 4 width fits 2 chars
      expect(result).toEqual(["中文", "测试"]);
    });

    it("should wrap mixed ASCII and CJK", () => {
      // "ab中" = 2 + 2 = 4 width
      const result = wrapLine("ab中文", 4);
      expect(result).toEqual(["ab中", "文"]);
    });
  });

  describe("edge cases", () => {
    it("should handle very long line", () => {
      const longText = "a".repeat(100);
      const result = wrapLine(longText, 10);
      expect(result.length).toBe(10);
      expect(result.every((line) => line.length === 10)).toBe(true);
    });

    it("should handle width of 1", () => {
      const result = wrapLine("abc", 1);
      expect(result).toEqual(["a", "b", "c"]);
    });
  });
});

describe("wrapText", () => {
  describe("multi-line wrapping", () => {
    it("should preserve existing newlines", () => {
      const result = wrapText("hello\nworld", 20);
      expect(result).toEqual(["hello", "world"]);
    });

    it("should wrap each line independently", () => {
      const result = wrapText("hello world\nfoo bar", 5);
      expect(result).toEqual(["hello", " worl", "d", "foo b", "ar"]);
    });

    it("should handle empty lines", () => {
      const result = wrapText("hello\n\nworld", 20);
      expect(result).toEqual(["hello", "", "world"]);
    });

    it("should handle empty string", () => {
      const result = wrapText("", 20);
      expect(result).toEqual([""]);
    });

    it("should handle string with only newlines", () => {
      const result = wrapText("\n\n", 20);
      expect(result).toEqual(["", "", ""]);
    });
  });

  describe("combined scenarios", () => {
    it("should handle complex multi-line text", () => {
      const text = "First line that is very long\nShort\n\nLast";
      const result = wrapText(text, 10);
      expect(result).toEqual(["First line", " that is v", "ery long", "Short", "", "Last"]);
    });
  });
});

// =============================================================================
// Hook Integration Tests (using renderHook pattern simulation)
// =============================================================================

describe("useLineBuffer logic", () => {
  // Simulate the createEntry logic for testing
  function createEntry(
    messageId: string,
    content: string,
    width: number,
    padding = 4
  ): { messageId: string; lines: string[]; wrapWidth: number } {
    const contentWidth = Math.max(10, width - padding);
    const lines = wrapText(content, contentWidth);
    return { messageId, lines, wrapWidth: width };
  }

  describe("basic buffering", () => {
    it("should create entry with wrapped lines", () => {
      const entry = createEntry("msg1", "hello world", 20);
      expect(entry.messageId).toBe("msg1");
      expect(entry.wrapWidth).toBe(20);
      expect(entry.lines.length).toBeGreaterThan(0);
    });

    it("should wrap content at correct width", () => {
      // Width 20 - padding 4 = 16 char content width
      const entry = createEntry("msg1", "a".repeat(32), 20);
      // 32 chars at 16 width = 2 lines
      expect(entry.lines.length).toBe(2);
    });
  });

  describe("width change detection", () => {
    it("should re-wrap when width changes", () => {
      const entry1 = createEntry("msg1", "a".repeat(30), 20); // 16 char width -> 2 lines
      const entry2 = createEntry("msg1", "a".repeat(30), 40); // 36 char width -> 1 line

      expect(entry1.wrapWidth).toBe(20);
      expect(entry2.wrapWidth).toBe(40);
      expect(entry1.lines.length).toBeGreaterThan(entry2.lines.length);
    });
  });

  describe("getVisibleLines logic", () => {
    it("should return correct range of lines", () => {
      const entries = [
        createEntry("msg1", "line1\nline2", 80),
        createEntry("msg2", "line3\nline4", 80),
      ];

      // Flatten all lines
      const allLines = entries.flatMap((e) => e.lines);

      // Simulate getVisibleLines(1, 3) - lines at index 1 and 2
      const visible = allLines.slice(1, 3);
      expect(visible.length).toBe(2);
    });

    it("should handle out-of-bounds range gracefully", () => {
      const entries = [createEntry("msg1", "hello", 80)];
      const allLines = entries.flatMap((e) => e.lines);

      // Request range beyond available lines
      const start = Math.max(0, -5);
      const end = Math.min(allLines.length, 100);
      const visible = allLines.slice(start, end);

      expect(visible.length).toBeLessThanOrEqual(allLines.length);
    });

    it("should return empty array for invalid range", () => {
      const entries = [createEntry("msg1", "hello", 80)];
      const allLines = entries.flatMap((e) => e.lines);

      // Start >= end should return empty
      const start = 5;
      const end = Math.min(allLines.length, start);
      const visible = allLines.slice(start, end);

      expect(visible).toEqual([]);
    });
  });

  describe("ring buffer logic", () => {
    it("should limit total lines to maxLines", () => {
      const maxLines = 10;
      const entries: Array<{ messageId: string; lines: string[]; wrapWidth: number }> = [];
      let totalLineCount = 0;

      // Create entries that exceed maxLines
      for (let i = 0; i < 5; i++) {
        const entry = createEntry(`msg${i}`, "line1\nline2\nline3", 80);
        entries.push(entry);
        totalLineCount += entry.lines.length;
      }

      // Simulate ring buffer trimming
      while (totalLineCount > maxLines && entries.length > 1) {
        const removed = entries.shift();
        if (removed) {
          totalLineCount -= removed.lines.length;
        }
      }

      expect(totalLineCount).toBeLessThanOrEqual(maxLines);
    });

    it("should always keep at least one entry", () => {
      const maxLines = 1;
      const entries = [createEntry("msg1", "line1\nline2\nline3\nline4\nline5", 80)];
      let totalLineCount = entries.reduce((sum, e) => sum + e.lines.length, 0);

      // Even with maxLines=1, we should keep the one entry
      while (totalLineCount > maxLines && entries.length > 1) {
        const removed = entries.shift();
        if (removed) {
          totalLineCount -= removed.lines.length;
        }
      }

      expect(entries.length).toBe(1);
    });
  });

  describe("total lines calculation", () => {
    it("should sum all entry line counts", () => {
      const entries = [
        createEntry("msg1", "a\nb", 80), // 2 lines
        createEntry("msg2", "c\nd\ne", 80), // 3 lines
      ];

      const totalLines = entries.reduce((sum, e) => sum + e.lines.length, 0);
      expect(totalLines).toBe(5);
    });

    it("should handle empty entries", () => {
      const entries = [createEntry("msg1", "", 80), createEntry("msg2", "hello", 80)];

      const totalLines = entries.reduce((sum, e) => sum + e.lines.length, 0);
      expect(totalLines).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Performance Tests
// =============================================================================

describe("performance characteristics", () => {
  it("should handle large content efficiently", () => {
    const largeContent = "x".repeat(10000);
    const start = performance.now();

    const result = wrapText(largeContent, 80);

    const duration = performance.now() - start;
    // Use relaxed threshold for CI environments where performance varies
    expect(duration).toBeLessThan(500);
    expect(result.length).toBeGreaterThan(100);
  });

  it("should handle many small lines efficiently", () => {
    const manyLines = Array(1000).fill("short line").join("\n");
    const start = performance.now();

    const result = wrapText(manyLines, 80);

    const duration = performance.now() - start;
    // Use relaxed threshold for CI environments where performance varies
    expect(duration).toBeLessThan(500);
    expect(result.length).toBe(1000);
  });
});
