/**
 * Tests for Input Highlight Utilities
 */
import { describe, expect, it } from "vitest";
import {
  applyHighlightStyle,
  findSegmentAtCursor,
  getHighlightStyleDescription,
  type HighlightSegment,
  highlightInput,
  parseHighlights,
  splitSegmentAtCursor,
} from "../highlight.js";

describe("highlight", () => {
  describe("parseHighlights", () => {
    it("returns empty segments for empty string", () => {
      const result = parseHighlights("");
      expect(result.segments).toHaveLength(0);
      expect(result.hasHighlights).toBe(false);
    });

    it("returns plain text when no highlights", () => {
      const result = parseHighlights("plain text here");
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]?.text).toBe("plain text here");
      expect(result.segments[0]?.type).toBeUndefined();
      expect(result.hasHighlights).toBe(false);
    });

    it("detects @mentions", () => {
      const result = parseHighlights("Check @file.ts");
      expect(result.hasHighlights).toBe(true);
      const mention = result.segments.find((s: HighlightSegment) => s.type === "mention");
      expect(mention?.text).toBe("@file.ts");
    });

    it("detects slash commands", () => {
      const result = parseHighlights("Use /help command");
      expect(result.hasHighlights).toBe(true);
      const command = result.segments.find((s: HighlightSegment) => s.type === "command");
      expect(command?.text).toBe("/help");
    });

    it("detects URLs", () => {
      const result = parseHighlights("Visit https://example.com");
      expect(result.hasHighlights).toBe(true);
      const url = result.segments.find((s: HighlightSegment) => s.type === "url");
      expect(url?.text).toBe("https://example.com");
    });

    it("detects http URLs", () => {
      const result = parseHighlights("Visit http://example.com");
      const url = result.segments.find((s: HighlightSegment) => s.type === "url");
      expect(url?.text).toBe("http://example.com");
    });

    it("detects inline code", () => {
      const result = parseHighlights("Run `npm install`");
      expect(result.hasHighlights).toBe(true);
      const code = result.segments.find((s: HighlightSegment) => s.type === "code");
      expect(code?.text).toBe("`npm install`");
    });

    it("handles multiple highlights", () => {
      const result = parseHighlights("Check @file.ts with /help");
      expect(result.hasHighlights).toBe(true);
      const mention = result.segments.find((s: HighlightSegment) => s.type === "mention");
      const command = result.segments.find((s: HighlightSegment) => s.type === "command");
      expect(mention?.text).toBe("@file.ts");
      expect(command?.text).toBe("/help");
    });

    it("preserves text order", () => {
      const result = parseHighlights("start @mid end");
      expect(result.segments).toHaveLength(3);
      expect(result.segments[0]?.text).toBe("start ");
      expect(result.segments[1]?.text).toBe("@mid");
      expect(result.segments[2]?.text).toBe(" end");
    });

    it("sets correct start and end positions", () => {
      const result = parseHighlights("prefix @file suffix");
      const mention = result.segments.find((s: HighlightSegment) => s.type === "mention");
      expect(mention?.start).toBe(7);
      expect(mention?.end).toBe(12);
    });
  });

  describe("applyHighlightStyle", () => {
    it("returns plain text for undefined type", () => {
      const result = applyHighlightStyle("text");
      expect(result).toBe("text");
    });

    it("applies style to mentions and returns text", () => {
      const result = applyHighlightStyle("@file", "mention");
      expect(result).toContain("@file");
      // Result should contain the original text (chalk may or may not add ANSI codes depending on env)
      expect(typeof result).toBe("string");
    });

    it("applies style to commands and returns text", () => {
      const result = applyHighlightStyle("/help", "command");
      expect(result).toContain("/help");
      expect(typeof result).toBe("string");
    });

    it("applies style to URLs and returns text", () => {
      const result = applyHighlightStyle("https://x.com", "url");
      expect(result).toContain("https://x.com");
      expect(typeof result).toBe("string");
    });

    it("applies style to code and returns text", () => {
      const result = applyHighlightStyle("`code`", "code");
      expect(result).toContain("`code`");
      expect(typeof result).toBe("string");
    });
  });

  describe("getHighlightStyleDescription", () => {
    it('returns "plain" for undefined type', () => {
      expect(getHighlightStyleDescription()).toBe("plain");
      expect(getHighlightStyleDescription(undefined)).toBe("plain");
    });

    it("returns correct descriptions", () => {
      expect(getHighlightStyleDescription("mention")).toBe("cyan");
      expect(getHighlightStyleDescription("command")).toBe("green");
      expect(getHighlightStyleDescription("url")).toBe("blue underline");
      expect(getHighlightStyleDescription("code")).toBe("dim");
    });
  });

  describe("highlightInput", () => {
    it("returns styled string for input with highlights", () => {
      const result = highlightInput("@file /help");
      expect(result).toContain("@file");
      expect(result).toContain("/help");
    });

    it("returns plain string for input without highlights", () => {
      const result = highlightInput("plain text");
      expect(result).toBe("plain text");
    });

    it("handles empty string", () => {
      expect(highlightInput("")).toBe("");
    });
  });

  describe("findSegmentAtCursor", () => {
    const segments: HighlightSegment[] = [
      { text: "start ", start: 0, end: 6 },
      { text: "@file", type: "mention", start: 6, end: 11 },
      { text: " end", start: 11, end: 15 },
    ];

    it("finds segment at cursor position", () => {
      const seg = findSegmentAtCursor(segments, 7);
      expect(seg?.text).toBe("@file");
      expect(seg?.type).toBe("mention");
    });

    it("finds segment at start boundary", () => {
      const seg = findSegmentAtCursor(segments, 6);
      expect(seg?.text).toBe("@file");
    });

    it("returns undefined for position beyond segments", () => {
      const seg = findSegmentAtCursor(segments, 100);
      expect(seg).toBeUndefined();
    });

    it("handles empty segments array", () => {
      const seg = findSegmentAtCursor([], 5);
      expect(seg).toBeUndefined();
    });
  });

  describe("splitSegmentAtCursor", () => {
    const segment: HighlightSegment = {
      text: "hello",
      start: 0,
      end: 5,
    };

    it("splits segment at cursor position", () => {
      const result = splitSegmentAtCursor(segment, 2);
      expect(result.before).toBe("he");
      expect(result.cursorChar).toBe("l");
      expect(result.after).toBe("lo");
      expect(result.localPosition).toBe(2);
    });

    it("handles cursor at start", () => {
      const result = splitSegmentAtCursor(segment, 0);
      expect(result.before).toBe("");
      expect(result.cursorChar).toBe("h");
      expect(result.after).toBe("ello");
    });

    it("handles cursor at end", () => {
      const result = splitSegmentAtCursor(segment, 5);
      expect(result.before).toBe("hello");
      expect(result.cursorChar).toBe(" "); // Default when past end
      expect(result.after).toBe("");
    });

    it("handles segment with non-zero start", () => {
      const seg: HighlightSegment = { text: "world", start: 10, end: 15 };
      const result = splitSegmentAtCursor(seg, 12);
      expect(result.before).toBe("wo");
      expect(result.cursorChar).toBe("r");
      expect(result.localPosition).toBe(2);
    });
  });
});
