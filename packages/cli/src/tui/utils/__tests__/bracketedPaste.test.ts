/**
 * Bracketed Paste Utilities Tests
 *
 * Tests for the bracketedPaste utility functions.
 *
 * @module @vellum/cli
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  disableBracketedPaste,
  enableBracketedPaste,
  extractPasteContent,
  hasPasteEnd,
  hasPasteStart,
  PASTE_END,
  PASTE_START,
} from "../bracketedPaste.js";

// =============================================================================
// Mocks
// =============================================================================

const originalWrite = process.stdout.write;
let writtenData: string[] = [];

beforeEach(() => {
  writtenData = [];
  process.stdout.write = vi.fn((data: string | Uint8Array) => {
    writtenData.push(typeof data === "string" ? data : data.toString());
    return true;
  }) as typeof process.stdout.write;
});

afterEach(() => {
  process.stdout.write = originalWrite;
});

// =============================================================================
// Tests
// =============================================================================

describe("bracketedPaste utilities", () => {
  describe("Constants", () => {
    it("PASTE_START has correct ANSI sequence", () => {
      expect(PASTE_START).toBe("\x1b[200~");
    });

    it("PASTE_END has correct ANSI sequence", () => {
      expect(PASTE_END).toBe("\x1b[201~");
    });
  });

  describe("enableBracketedPaste", () => {
    it("writes correct ANSI enable sequence to stdout", () => {
      enableBracketedPaste();

      expect(process.stdout.write).toHaveBeenCalledTimes(1);
      expect(writtenData[0]).toBe("\x1b[?2004h");
    });

    it("can be called multiple times", () => {
      enableBracketedPaste();
      enableBracketedPaste();

      expect(process.stdout.write).toHaveBeenCalledTimes(2);
    });
  });

  describe("disableBracketedPaste", () => {
    it("writes correct ANSI disable sequence to stdout", () => {
      disableBracketedPaste();

      expect(process.stdout.write).toHaveBeenCalledTimes(1);
      expect(writtenData[0]).toBe("\x1b[?2004l");
    });

    it("can be called multiple times", () => {
      disableBracketedPaste();
      disableBracketedPaste();

      expect(process.stdout.write).toHaveBeenCalledTimes(2);
    });
  });

  describe("hasPasteStart", () => {
    it("returns true when paste start sequence is present", () => {
      expect(hasPasteStart(`${PASTE_START}hello`)).toBe(true);
    });

    it("returns false when paste start sequence is absent", () => {
      expect(hasPasteStart("hello world")).toBe(false);
    });

    it("returns true for sequence in middle of string", () => {
      expect(hasPasteStart(`before${PASTE_START}after`)).toBe(true);
    });

    it("returns false for empty string", () => {
      expect(hasPasteStart("")).toBe(false);
    });

    it("returns false for partial sequence", () => {
      expect(hasPasteStart("\x1b[200")).toBe(false);
    });
  });

  describe("hasPasteEnd", () => {
    it("returns true when paste end sequence is present", () => {
      expect(hasPasteEnd(`hello${PASTE_END}`)).toBe(true);
    });

    it("returns false when paste end sequence is absent", () => {
      expect(hasPasteEnd("hello world")).toBe(false);
    });

    it("returns true for sequence in middle of string", () => {
      expect(hasPasteEnd(`before${PASTE_END}after`)).toBe(true);
    });

    it("returns false for empty string", () => {
      expect(hasPasteEnd("")).toBe(false);
    });

    it("returns false for partial sequence", () => {
      expect(hasPasteEnd("\x1b[201")).toBe(false);
    });
  });

  describe("extractPasteContent", () => {
    it("extracts complete paste content", () => {
      const input = `${PASTE_START}pasted text${PASTE_END}`;
      const result = extractPasteContent(input);

      expect(result.content).toBe("pasted text");
      expect(result.complete).toBe(true);
      expect(result.remaining).toBe("");
    });

    it("extracts content with text before paste", () => {
      const input = `before${PASTE_START}pasted${PASTE_END}`;
      const result = extractPasteContent(input);

      expect(result.content).toBe("pasted");
      expect(result.complete).toBe(true);
      expect(result.remaining).toBe("before");
    });

    it("extracts content with text after paste", () => {
      const input = `${PASTE_START}pasted${PASTE_END}after`;
      const result = extractPasteContent(input);

      expect(result.content).toBe("pasted");
      expect(result.complete).toBe(true);
      expect(result.remaining).toBe("after");
    });

    it("extracts content with text before and after paste", () => {
      const input = `before${PASTE_START}pasted${PASTE_END}after`;
      const result = extractPasteContent(input);

      expect(result.content).toBe("pasted");
      expect(result.complete).toBe(true);
      expect(result.remaining).toBe("beforeafter");
    });

    it("handles incomplete paste (no end sequence)", () => {
      const input = `${PASTE_START}incomplete paste`;
      const result = extractPasteContent(input);

      expect(result.content).toBe("incomplete paste");
      expect(result.complete).toBe(false);
      expect(result.remaining).toBe("");
    });

    it("handles incomplete paste with text before", () => {
      const input = `before${PASTE_START}incomplete`;
      const result = extractPasteContent(input);

      expect(result.content).toBe("incomplete");
      expect(result.complete).toBe(false);
      expect(result.remaining).toBe("before");
    });

    it("returns empty for no paste sequence", () => {
      const input = "no paste here";
      const result = extractPasteContent(input);

      expect(result.content).toBe("");
      expect(result.complete).toBe(false);
      expect(result.remaining).toBe("no paste here");
    });

    it("handles empty paste content", () => {
      const input = `${PASTE_START}${PASTE_END}`;
      const result = extractPasteContent(input);

      expect(result.content).toBe("");
      expect(result.complete).toBe(true);
      expect(result.remaining).toBe("");
    });

    it("handles multiline paste content", () => {
      const multilineContent = "line1\nline2\nline3";
      const input = `${PASTE_START}${multilineContent}${PASTE_END}`;
      const result = extractPasteContent(input);

      expect(result.content).toBe(multilineContent);
      expect(result.complete).toBe(true);
      expect(result.remaining).toBe("");
    });

    it("handles paste content with special characters", () => {
      const specialContent = '{"key": "value", "arr": [1, 2, 3]}';
      const input = `${PASTE_START}${specialContent}${PASTE_END}`;
      const result = extractPasteContent(input);

      expect(result.content).toBe(specialContent);
      expect(result.complete).toBe(true);
    });

    it("handles paste content with unicode", () => {
      const unicodeContent = "你好世界 🎉 émojis";
      const input = `${PASTE_START}${unicodeContent}${PASTE_END}`;
      const result = extractPasteContent(input);

      expect(result.content).toBe(unicodeContent);
      expect(result.complete).toBe(true);
    });
  });
});
