/**
 * Tests for textSanitizer utility
 *
 * @module tui/utils/__tests__/textSanitizer.test
 */

import { describe, expect, it } from "vitest";
import { sanitize, sanitizeAnsi, sanitizeText } from "../textSanitizer.js";

// =============================================================================
// sanitizeText Tests
// =============================================================================

describe("sanitizeText", () => {
  describe("line ending normalization", () => {
    it("should convert CRLF to LF", () => {
      expect(sanitizeText("Hello\r\nWorld")).toBe("Hello\nWorld");
    });

    it("should convert lone CR to LF", () => {
      expect(sanitizeText("Hello\rWorld")).toBe("Hello\nWorld");
    });

    it("should convert mixed line endings to LF", () => {
      expect(sanitizeText("A\r\nB\rC\nD")).toBe("A\nB\nC\nD");
    });

    it("should convert Unicode line separator (U+2028) to LF", () => {
      expect(sanitizeText("Hello\u2028World")).toBe("Hello\nWorld");
    });

    it("should convert Unicode paragraph separator (U+2029) to LF", () => {
      expect(sanitizeText("Hello\u2029World")).toBe("Hello\nWorld");
    });
  });

  describe("control character removal", () => {
    it("should remove NUL character", () => {
      expect(sanitizeText("Hello\x00World")).toBe("HelloWorld");
    });

    it("should remove BEL character", () => {
      expect(sanitizeText("Hello\x07World")).toBe("HelloWorld");
    });

    it("should remove backspace character", () => {
      expect(sanitizeText("Hello\x08World")).toBe("HelloWorld");
    });

    it("should remove vertical tab", () => {
      expect(sanitizeText("Hello\x0BWorld")).toBe("HelloWorld");
    });

    it("should remove form feed", () => {
      expect(sanitizeText("Hello\x0CWorld")).toBe("HelloWorld");
    });

    it("should preserve escape character (for ANSI compatibility)", () => {
      // sanitizeText preserves ESC for ANSI sequence support
      // Use sanitize() to strip orphan ESC characters
      expect(sanitizeText("Hello\x1BWorld")).toBe("Hello\x1BWorld");
    });

    it("should remove DEL character", () => {
      expect(sanitizeText("Hello\x7FWorld")).toBe("HelloWorld");
    });

    it("should remove C1 control characters (0x80-0x9F)", () => {
      expect(sanitizeText("Hello\x80\x8F\x9FWorld")).toBe("HelloWorld");
    });

    it("should preserve newline (LF)", () => {
      expect(sanitizeText("Hello\nWorld")).toBe("Hello\nWorld");
    });

    it("should preserve tab (before conversion)", () => {
      // Tab is preserved as control char, then converted to spaces
      expect(sanitizeText("Hello\tWorld")).toBe("Hello  World");
    });
  });

  describe("tab conversion", () => {
    it("should convert tab to 2 spaces by default", () => {
      expect(sanitizeText("A\tB")).toBe("A  B");
    });

    it("should convert tab to custom width", () => {
      expect(sanitizeText("A\tB", { tabWidth: 4 })).toBe("A    B");
    });

    it("should convert multiple tabs", () => {
      expect(sanitizeText("A\t\tB")).toBe("A    B");
    });

    it("should handle tab width of 0 (no conversion)", () => {
      expect(sanitizeText("A\tB", { tabWidth: 0 })).toBe("A\tB");
    });
  });

  describe("combined scenarios", () => {
    it("should handle complex input", () => {
      const input = "Hello\r\n\x00World\t!\x07";
      expect(sanitizeText(input)).toBe("Hello\nWorld  !");
    });

    it("should handle empty string", () => {
      expect(sanitizeText("")).toBe("");
    });

    it("should handle string with only control characters", () => {
      // ESC is preserved for ANSI compatibility; only combined sanitize() strips orphan ESC
      expect(sanitizeText("\x00\x07\x1B")).toBe("\x1B");
    });
  });
});

// =============================================================================
// sanitizeAnsi Tests
// =============================================================================

describe("sanitizeAnsi", () => {
  describe("safe SGR sequences (colors/styles)", () => {
    it("should preserve basic color codes", () => {
      expect(sanitizeAnsi("\x1b[31mRed\x1b[0m")).toBe("\x1b[31mRed\x1b[0m");
    });

    it("should preserve bright color codes", () => {
      expect(sanitizeAnsi("\x1b[91mBright Red\x1b[0m")).toBe("\x1b[91mBright Red\x1b[0m");
    });

    it("should preserve 256-color codes", () => {
      expect(sanitizeAnsi("\x1b[38;5;196mColor\x1b[0m")).toBe("\x1b[38;5;196mColor\x1b[0m");
    });

    it("should preserve RGB color codes", () => {
      expect(sanitizeAnsi("\x1b[38;2;255;0;0mRGB\x1b[0m")).toBe("\x1b[38;2;255;0;0mRGB\x1b[0m");
    });

    it("should preserve text style codes", () => {
      expect(sanitizeAnsi("\x1b[1mBold\x1b[0m")).toBe("\x1b[1mBold\x1b[0m");
      expect(sanitizeAnsi("\x1b[3mItalic\x1b[0m")).toBe("\x1b[3mItalic\x1b[0m");
      expect(sanitizeAnsi("\x1b[4mUnderline\x1b[0m")).toBe("\x1b[4mUnderline\x1b[0m");
    });

    it("should preserve combined style codes", () => {
      expect(sanitizeAnsi("\x1b[1;31;4mStyled\x1b[0m")).toBe("\x1b[1;31;4mStyled\x1b[0m");
    });
  });

  describe("dangerous CSI sequences removal", () => {
    it("should remove cursor position (CUP)", () => {
      expect(sanitizeAnsi("\x1b[10;20HText")).toBe("Text");
    });

    it("should remove cursor up (CUU)", () => {
      expect(sanitizeAnsi("\x1b[5AText")).toBe("Text");
    });

    it("should remove cursor down (CUD)", () => {
      expect(sanitizeAnsi("\x1b[5BText")).toBe("Text");
    });

    it("should remove cursor forward (CUF)", () => {
      expect(sanitizeAnsi("\x1b[5CText")).toBe("Text");
    });

    it("should remove cursor back (CUB)", () => {
      expect(sanitizeAnsi("\x1b[5DText")).toBe("Text");
    });

    it("should remove erase display (ED)", () => {
      expect(sanitizeAnsi("\x1b[2JText")).toBe("Text");
    });

    it("should remove erase line (EL)", () => {
      expect(sanitizeAnsi("\x1b[KText")).toBe("Text");
    });

    it("should remove scroll up (SU)", () => {
      expect(sanitizeAnsi("\x1b[5SText")).toBe("Text");
    });

    it("should remove scroll down (SD)", () => {
      expect(sanitizeAnsi("\x1b[5TText")).toBe("Text");
    });

    it("should remove save cursor position", () => {
      expect(sanitizeAnsi("\x1b[sText\x1b[u")).toBe("Text");
    });

    it("should remove private mode sequences", () => {
      expect(sanitizeAnsi("\x1b[?25lText\x1b[?25h")).toBe("Text");
    });
  });

  describe("OSC sequences removal", () => {
    it("should remove terminal title sequence (BEL terminated)", () => {
      expect(sanitizeAnsi("\x1b]0;Title\x07Text")).toBe("Text");
    });

    it("should remove terminal title sequence (ST terminated)", () => {
      expect(sanitizeAnsi("\x1b]0;Title\x1b\\Text")).toBe("Text");
    });

    it("should remove hyperlink sequences", () => {
      expect(sanitizeAnsi("\x1b]8;;https://example.com\x07Link\x1b]8;;\x07")).toBe("Link");
    });
  });

  describe("stripAllAnsi option", () => {
    it("should strip all ANSI codes when enabled", () => {
      const input = "\x1b[31mRed\x1b[0m \x1b[2JCleared";
      expect(sanitizeAnsi(input, { stripAllAnsi: true })).toBe("Red Cleared");
    });

    it("should strip colors and styles when enabled", () => {
      expect(sanitizeAnsi("\x1b[1;31;4mStyled\x1b[0m", { stripAllAnsi: true })).toBe("Styled");
    });
  });

  describe("mixed content", () => {
    it("should handle colors mixed with dangerous sequences", () => {
      const input = "\x1b[2J\x1b[31mRed\x1b[0m\x1b[H";
      expect(sanitizeAnsi(input)).toBe("\x1b[31mRed\x1b[0m");
    });

    it("should handle empty string", () => {
      expect(sanitizeAnsi("")).toBe("");
    });

    it("should handle text without ANSI", () => {
      expect(sanitizeAnsi("Plain text")).toBe("Plain text");
    });
  });
});

// =============================================================================
// sanitize (combined) Tests
// =============================================================================

describe("sanitize (combined)", () => {
  it("should apply both text and ANSI sanitization", () => {
    const input = "Hello\r\nWorld\x1b[2J\x1b[31mRed\x1b[0m\t!";
    const result = sanitize(input);
    expect(result).toBe("Hello\nWorld\x1b[31mRed\x1b[0m  !");
  });

  it("should handle complex LLM output with ANSI codes", () => {
    const input = "\x1b[1mTitle\x1b[0m\r\n\x1b[33mWarning\x1b[0m: Something\thappened";
    const result = sanitize(input);
    expect(result).toBe("\x1b[1mTitle\x1b[0m\n\x1b[33mWarning\x1b[0m: Something  happened");
  });

  it("should strip all with combined options", () => {
    const input = "Hello\r\n\x1b[31mRed\x1b[0m\t!";
    const result = sanitize(input, { stripAllAnsi: true, tabWidth: 4 });
    expect(result).toBe("Hello\nRed    !");
  });

  it("should handle malicious input safely", () => {
    // Attempt to clear screen and move cursor
    const malicious = "\x1b[2J\x1b[H\x1b[31mTrick\x1b[0m\x1b[1000;1000H";
    const result = sanitize(malicious);
    expect(result).toBe("\x1b[31mTrick\x1b[0m");
  });
});
