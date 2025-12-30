/**
 * CommandParser Unit Tests
 *
 * Tests for the command parser including:
 * - Tokenization
 * - Quote handling (double/single)
 * - Escape sequences
 * - Flag parsing (long and short)
 * - Error handling
 *
 * @module cli/commands/__tests__/parser
 */

import { describe, expect, it } from "vitest";

import { CommandParser, isParsedCommand, isParseError, Tokenizer } from "../parser.js";

// =============================================================================
// T013: Tokenizer Tests
// =============================================================================

describe("Tokenizer", () => {
  describe("tokenize", () => {
    it("should tokenize simple command", () => {
      const tokens = Tokenizer.tokenize("/help");

      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        type: "command",
        value: "help",
        start: 0,
        end: 5,
      });
    });

    it("should tokenize command with positional arg", () => {
      const tokens = Tokenizer.tokenize("/login provider");
      const significant = tokens.filter((t) => t.type !== "whitespace");

      expect(significant).toHaveLength(2);
      expect(significant[0]).toMatchObject({ type: "command", value: "login" });
      expect(significant[1]).toMatchObject({ type: "value", value: "provider" });
    });

    it("should tokenize long flag", () => {
      const tokens = Tokenizer.tokenize("/cmd --verbose");
      const significant = tokens.filter((t) => t.type !== "whitespace");

      expect(significant).toHaveLength(2);
      expect(significant[1]).toMatchObject({ type: "flag", value: "--verbose" });
    });

    it("should tokenize short flag", () => {
      const tokens = Tokenizer.tokenize("/cmd -v");
      const significant = tokens.filter((t) => t.type !== "whitespace");

      expect(significant).toHaveLength(2);
      expect(significant[1]).toMatchObject({ type: "flag", value: "-v" });
    });

    it("should tokenize double quoted string", () => {
      const tokens = Tokenizer.tokenize('/cmd "hello world"');
      const significant = tokens.filter((t) => t.type !== "whitespace");

      expect(significant).toHaveLength(2);
      expect(significant[1]).toMatchObject({ type: "string", value: "hello world" });
    });

    it("should tokenize single quoted string", () => {
      const tokens = Tokenizer.tokenize("/cmd 'hello world'");
      const significant = tokens.filter((t) => t.type !== "whitespace");

      expect(significant).toHaveLength(2);
      expect(significant[1]).toMatchObject({ type: "string", value: "hello world" });
    });

    it("should tokenize --flag=value syntax", () => {
      const tokens = Tokenizer.tokenize("/cmd --store=keychain");
      const significant = tokens.filter((t) => t.type !== "whitespace");

      expect(significant).toHaveLength(3);
      expect(significant[1]).toMatchObject({ type: "flag", value: "--store" });
      expect(significant[2]).toMatchObject({ type: "value", value: "keychain" });
    });

    it("should preserve whitespace tokens", () => {
      const tokens = Tokenizer.tokenize("/cmd  arg"); // double space

      expect(tokens.some((t) => t.type === "whitespace")).toBe(true);
    });

    it("should return Token[] with type discrimination", () => {
      const tokens = Tokenizer.tokenize("/help");

      // Type discrimination works
      for (const token of tokens) {
        expect(["command", "string", "flag", "value", "whitespace"]).toContain(token.type);
        expect(typeof token.value).toBe("string");
        expect(typeof token.start).toBe("number");
        expect(typeof token.end).toBe("number");
      }
    });
  });
});

// =============================================================================
// T015: CommandParser Tests
// =============================================================================

describe("CommandParser", () => {
  const parser = new CommandParser();

  // ===========================================================================
  // Basic Command Parsing
  // ===========================================================================

  describe("basic command parsing", () => {
    it("should parse basic command: /help", () => {
      const result = parser.parse("/help");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.command).toBe("help");
        expect(result.positional).toEqual([]);
        expect(result.named.size).toBe(0);
      }
    });

    it("should parse command with positional args: /login provider", () => {
      const result = parser.parse("/login provider");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.command).toBe("login");
        expect(result.positional).toEqual(["provider"]);
      }
    });

    it("should lowercase command name", () => {
      const result = parser.parse("/HELP");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.command).toBe("help");
      }
    });

    it("should preserve raw input", () => {
      const input = "/login provider";
      const result = parser.parse(input);

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.raw).toBe(input);
      }
    });
  });

  // ===========================================================================
  // T014: Quote Handling
  // ===========================================================================

  describe("double quotes", () => {
    it('should parse: /cmd "hello world"', () => {
      const result = parser.parse('/cmd "hello world"');

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.positional).toEqual(["hello world"]);
      }
    });

    it('should process \\n escape: /cmd "line\\nbreak"', () => {
      const result = parser.parse('/cmd "line\\nbreak"');

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.positional[0]).toBe("line\nbreak");
      }
    });

    it('should process \\t escape: /cmd "tab\\there"', () => {
      const result = parser.parse('/cmd "tab\\there"');

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.positional[0]).toBe("tab\there");
      }
    });

    it('should process \\\\ escape: /cmd "back\\\\slash"', () => {
      const result = parser.parse('/cmd "back\\\\slash"');

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.positional[0]).toBe("back\\slash");
      }
    });

    it('should process \\" escape: /cmd "say \\"hi\\""', () => {
      const result = parser.parse('/cmd "say \\"hi\\""');

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.positional[0]).toBe('say "hi"');
      }
    });
  });

  describe("single quotes", () => {
    it("should parse: /cmd 'hello world'", () => {
      const result = parser.parse("/cmd 'hello world'");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.positional).toEqual(["hello world"]);
      }
    });

    it("should NOT process escapes (literal): /cmd 'no\\nescape'", () => {
      const result = parser.parse("/cmd 'no\\nescape'");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        // Single quotes are literal - backslash-n stays as-is
        expect(result.positional[0]).toBe("no\\nescape");
      }
    });

    it("should preserve backslashes in single quotes", () => {
      const result = parser.parse("/cmd 'path\\to\\file'");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.positional[0]).toBe("path\\to\\file");
      }
    });
  });

  describe("unclosed quote error", () => {
    it("should return ParseError for unclosed double quote", () => {
      const result = parser.parse('/cmd "unclosed');

      expect(isParseError(result)).toBe(true);
      if (isParseError(result)) {
        expect(result.error).toBe(true);
        expect(result.code).toBe("INVALID_ARGUMENT");
        expect(result.message).toContain("Unclosed");
        expect(result.message).toContain("double");
        expect(result.position).toBeDefined();
      }
    });

    it("should return ParseError for unclosed single quote", () => {
      const result = parser.parse("/cmd 'unclosed");

      expect(isParseError(result)).toBe(true);
      if (isParseError(result)) {
        expect(result.error).toBe(true);
        expect(result.code).toBe("INVALID_ARGUMENT");
        expect(result.message).toContain("Unclosed");
        expect(result.message).toContain("single");
      }
    });
  });

  // ===========================================================================
  // T016: Flag Parsing
  // ===========================================================================

  describe("flag parsing", () => {
    it("should parse: --flag value → named.set('flag', 'value')", () => {
      const result = parser.parse("/login --store keychain");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.named.get("store")).toBe("keychain");
      }
    });

    it("should parse: --flag=value → named.set('flag', 'value')", () => {
      const result = parser.parse("/login --store=keychain");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.named.get("store")).toBe("keychain");
      }
    });

    it("should parse: -f value → named.set('f', 'value')", () => {
      const result = parser.parse("/login -s keychain");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.named.get("s")).toBe("keychain");
      }
    });

    it("should parse boolean flag: --flag → named.set('flag', true)", () => {
      const result = parser.parse("/exit --force");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.named.get("force")).toBe(true);
      }
    });

    it("should parse short boolean flag: -f → named.set('f', true)", () => {
      const result = parser.parse("/exit -f");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.named.get("f")).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Mixed Arguments
  // ===========================================================================

  describe("mixed arguments", () => {
    it("should parse: /login 'my provider' --store keychain", () => {
      const result = parser.parse("/login 'my provider' --store keychain");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.command).toBe("login");
        expect(result.positional).toEqual(["my provider"]);
        expect(result.named.get("store")).toBe("keychain");
      }
    });

    it('should parse: /login "my provider" --store keychain', () => {
      const result = parser.parse('/login "my provider" --store keychain');

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.command).toBe("login");
        expect(result.positional).toEqual(["my provider"]);
        expect(result.named.get("store")).toBe("keychain");
      }
    });

    it("should handle multiple positional args", () => {
      const result = parser.parse("/cmd arg1 arg2 arg3");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.positional).toEqual(["arg1", "arg2", "arg3"]);
      }
    });

    it("should handle multiple flags", () => {
      const result = parser.parse("/cmd --verbose --output file.txt -f");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.named.get("verbose")).toBe(true);
        expect(result.named.get("output")).toBe("file.txt");
        expect(result.named.get("f")).toBe(true);
      }
    });

    it("should handle flags before and after positional args", () => {
      // Note: --before arg consumes "arg" as value per spec (--flag value pattern)
      // To have a boolean flag followed by positional, use positional first
      const result = parser.parse("/cmd arg --before --after");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.positional).toEqual(["arg"]);
        expect(result.named.get("before")).toBe(true);
        expect(result.named.get("after")).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Error Cases
  // ===========================================================================

  describe("error handling", () => {
    it("should return ParseError for empty input", () => {
      const result = parser.parse("");

      expect(isParseError(result)).toBe(true);
      if (isParseError(result)) {
        expect(result.error).toBe(true);
        expect(result.code).toBe("INVALID_ARGUMENT");
        expect(result.message).toContain("Empty");
      }
    });

    it("should return ParseError for whitespace-only input", () => {
      const result = parser.parse("   ");

      expect(isParseError(result)).toBe(true);
      if (isParseError(result)) {
        expect(result.error).toBe(true);
      }
    });

    it("should return ParseError for input without /", () => {
      const result = parser.parse("help");

      expect(isParseError(result)).toBe(true);
      if (isParseError(result)) {
        expect(result.error).toBe(true);
        expect(result.code).toBe("INVALID_ARGUMENT");
        expect(result.message).toContain("start with /");
      }
    });

    it("should return ParseError for just /", () => {
      const result = parser.parse("/");

      expect(isParseError(result)).toBe(true);
      if (isParseError(result)) {
        expect(result.error).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Type Guards
  // ===========================================================================

  describe("type guards", () => {
    it("isParseError should return true for errors", () => {
      const result = parser.parse("");
      expect(isParseError(result)).toBe(true);
      expect(isParsedCommand(result)).toBe(false);
    });

    it("isParsedCommand should return true for valid commands", () => {
      const result = parser.parse("/help");
      expect(isParsedCommand(result)).toBe(true);
      expect(isParseError(result)).toBe(false);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("edge cases", () => {
    it("should handle consecutive whitespace", () => {
      const result = parser.parse("/cmd    arg");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.positional).toEqual(["arg"]);
      }
    });

    it("should handle trailing whitespace", () => {
      const result = parser.parse("/help   ");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.command).toBe("help");
      }
    });

    it("should handle leading whitespace", () => {
      const result = parser.parse("  /help");

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.command).toBe("help");
      }
    });

    it("should handle empty quoted string", () => {
      const result = parser.parse('/cmd ""');

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.positional).toEqual([""]);
      }
    });

    it("should handle quoted flag value", () => {
      const result = parser.parse('/cmd --msg "hello world"');

      expect(isParsedCommand(result)).toBe(true);
      if (isParsedCommand(result)) {
        expect(result.named.get("msg")).toBe("hello world");
      }
    });
  });
});
