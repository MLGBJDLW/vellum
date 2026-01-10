/**
 * Unit tests for @ mention parsing utilities
 *
 * Tests parsing, validation, and manipulation of @ mentions.
 *
 * @module shared/__tests__/mentions
 */

import { describe, expect, it } from "vitest";
import {
  countMentions,
  countMentionsByType,
  extractTextWithoutMentions,
  getAllMentionSuggestions,
  getMentionFormat,
  getMentionSuggestions,
  hasMentions,
  MENTION_PARTIAL_REGEX,
  MENTION_REGEX,
  MENTION_TYPES,
  MENTION_TYPES_STANDALONE,
  MENTION_TYPES_WITH_VALUE,
  MENTION_VALUE_PARTIAL_REGEX,
  mentionIsStandalone,
  mentionRequiresValue,
  parseMentions,
  stripMentions,
  validateMentionValue,
} from "../mentions.js";

// =============================================================================
// Regex Pattern Tests
// =============================================================================

describe("MENTION_REGEX", () => {
  it("matches @file: mention with path", () => {
    const text = "@file:./src/index.ts";
    const matches = text.match(MENTION_REGEX);
    expect(matches).not.toBeNull();
    expect(matches?.[0]).toBe("@file:./src/index.ts");
  });

  it("matches @folder: mention", () => {
    const text = "@folder:./src";
    const matches = text.match(MENTION_REGEX);
    expect(matches).not.toBeNull();
  });

  it("matches @url: mention", () => {
    const text = "@url:https://example.com";
    const matches = text.match(MENTION_REGEX);
    expect(matches).not.toBeNull();
  });

  it("matches standalone @git-diff", () => {
    const text = "@git-diff";
    const matches = text.match(MENTION_REGEX);
    expect(matches).not.toBeNull();
  });

  it("matches @problems standalone", () => {
    const text = "@problems";
    const matches = text.match(MENTION_REGEX);
    expect(matches).not.toBeNull();
  });

  it("matches @terminal standalone", () => {
    const text = "@terminal";
    const matches = text.match(MENTION_REGEX);
    expect(matches).not.toBeNull();
  });

  it("matches @codebase: with query", () => {
    const text = "@codebase:authentication";
    const matches = text.match(MENTION_REGEX);
    expect(matches).not.toBeNull();
  });

  it("matches mention after whitespace", () => {
    const text = "Check this @file:./src/index.ts file";
    const matches = text.match(MENTION_REGEX);
    expect(matches).not.toBeNull();
  });

  it("does not match @ inside a word", () => {
    const text = "email@example.com";
    const regex = new RegExp(MENTION_REGEX.source, "g");
    const matches = text.match(regex);
    expect(matches).toBeNull();
  });
});

describe("MENTION_PARTIAL_REGEX", () => {
  it("matches @ at end of string", () => {
    expect("type @".match(MENTION_PARTIAL_REGEX)).not.toBeNull();
  });

  it("matches @fi partial", () => {
    const match = "@fi".match(MENTION_PARTIAL_REGEX);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("fi");
  });

  it("matches @git-d partial", () => {
    const match = "@git-d".match(MENTION_PARTIAL_REGEX);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("git-d");
  });
});

describe("MENTION_VALUE_PARTIAL_REGEX", () => {
  it("matches @file: with partial path", () => {
    const match = "@file:./sr".match(MENTION_VALUE_PARTIAL_REGEX);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("file");
    expect(match?.[2]).toBe("./sr");
  });

  it("matches @url: with partial url", () => {
    const match = "@url:https://".match(MENTION_VALUE_PARTIAL_REGEX);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("url");
  });
});

// =============================================================================
// parseMentions Tests
// =============================================================================

describe("parseMentions", () => {
  it("returns empty array for text without mentions", () => {
    expect(parseMentions("Hello world")).toEqual([]);
  });

  it("parses single @file mention", () => {
    const mentions = parseMentions("@file:./src/index.ts");
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({
      type: "file",
      raw: "@file:./src/index.ts",
      value: "./src/index.ts",
    });
  });

  it("parses single standalone @git-diff", () => {
    const mentions = parseMentions("@git-diff");
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({
      type: "git-diff",
      raw: "@git-diff",
      value: "",
    });
  });

  it("parses multiple mentions", () => {
    const text = "Check @file:./src/index.ts and @git-diff for changes";
    const mentions = parseMentions(text);
    expect(mentions).toHaveLength(2);
    expect(mentions[0]?.type).toBe("file");
    expect(mentions[1]?.type).toBe("git-diff");
  });

  it("calculates correct start and end positions", () => {
    const text = "@file:./test.ts";
    const mentions = parseMentions(text);
    expect(mentions[0]?.start).toBe(0);
    expect(mentions[0]?.end).toBe(15);
  });

  it("handles mention after whitespace correctly", () => {
    const text = "Review @file:./test.ts please";
    const mentions = parseMentions(text);
    expect(mentions[0]?.start).toBe(7);
  });

  it("parses all mention types", () => {
    const text = "@file:a @folder:b @url:c @codebase:d @git-diff @problems @terminal";
    const mentions = parseMentions(text);
    expect(mentions).toHaveLength(7);
  });
});

// =============================================================================
// Type Checking Functions
// =============================================================================

describe("mentionRequiresValue", () => {
  it("returns true for file type", () => {
    expect(mentionRequiresValue("file")).toBe(true);
  });

  it("returns true for folder type", () => {
    expect(mentionRequiresValue("folder")).toBe(true);
  });

  it("returns true for url type", () => {
    expect(mentionRequiresValue("url")).toBe(true);
  });

  it("returns true for codebase type", () => {
    expect(mentionRequiresValue("codebase")).toBe(true);
  });

  it("returns false for standalone types", () => {
    expect(mentionRequiresValue("git-diff")).toBe(false);
    expect(mentionRequiresValue("problems")).toBe(false);
    expect(mentionRequiresValue("terminal")).toBe(false);
  });
});

describe("mentionIsStandalone", () => {
  it("returns true for git-diff", () => {
    expect(mentionIsStandalone("git-diff")).toBe(true);
  });

  it("returns true for problems", () => {
    expect(mentionIsStandalone("problems")).toBe(true);
  });

  it("returns true for terminal", () => {
    expect(mentionIsStandalone("terminal")).toBe(true);
  });

  it("returns false for value types", () => {
    expect(mentionIsStandalone("file")).toBe(false);
    expect(mentionIsStandalone("folder")).toBe(false);
    expect(mentionIsStandalone("url")).toBe(false);
    expect(mentionIsStandalone("codebase")).toBe(false);
  });
});

// =============================================================================
// Validation Tests
// =============================================================================

describe("validateMentionValue", () => {
  describe("standalone types", () => {
    it("returns undefined for empty value", () => {
      expect(validateMentionValue("git-diff", "")).toBeUndefined();
    });

    it("returns error if standalone type has value", () => {
      expect(validateMentionValue("git-diff", "something")).toBe(
        "@git-diff does not accept a value"
      );
    });
  });

  describe("file type", () => {
    it("returns undefined for valid path", () => {
      expect(validateMentionValue("file", "./src/index.ts")).toBeUndefined();
    });

    it("returns error for empty path", () => {
      expect(validateMentionValue("file", "")).toBe("@file requires a value (e.g., @file:path)");
    });

    it("returns error for whitespace-only path", () => {
      expect(validateMentionValue("file", "   ")).toBe("@file requires a non-empty path");
    });
  });

  describe("url type", () => {
    it("returns undefined for valid https URL", () => {
      expect(validateMentionValue("url", "https://example.com")).toBeUndefined();
    });

    it("returns undefined for valid http URL", () => {
      expect(validateMentionValue("url", "http://example.com")).toBeUndefined();
    });

    it("returns undefined for URL without protocol (auto-prefix)", () => {
      expect(validateMentionValue("url", "example.com")).toBeUndefined();
    });

    it("returns error for invalid URL", () => {
      expect(validateMentionValue("url", "not a url at all!!!")).toBe("Invalid URL format");
    });
  });

  describe("codebase type", () => {
    it("returns undefined for valid query", () => {
      expect(validateMentionValue("codebase", "authentication logic")).toBeUndefined();
    });

    it("returns error for empty query", () => {
      expect(validateMentionValue("codebase", "")).toBe(
        "@codebase requires a value (e.g., @codebase:path)"
      );
    });

    it("returns error for whitespace-only query", () => {
      expect(validateMentionValue("codebase", "   ")).toBe("@codebase requires a search query");
    });
  });
});

// =============================================================================
// Suggestion Tests
// =============================================================================

describe("getAllMentionSuggestions", () => {
  it("returns all suggestion types", () => {
    const suggestions = getAllMentionSuggestions();
    expect(suggestions).toHaveLength(7);
  });

  it("includes required properties", () => {
    const suggestions = getAllMentionSuggestions();
    for (const s of suggestions) {
      expect(s.type).toBeDefined();
      expect(s.label).toBeDefined();
      expect(s.description).toBeDefined();
    }
  });
});

describe("getMentionSuggestions", () => {
  it("returns all suggestions for empty partial", () => {
    expect(getMentionSuggestions("")).toHaveLength(7);
  });

  it("filters by prefix", () => {
    const suggestions = getMentionSuggestions("fi");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.type).toBe("file");
  });

  it("handles git-diff prefix", () => {
    const suggestions = getMentionSuggestions("git");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.type).toBe("git-diff");
  });

  it("is case-insensitive", () => {
    expect(getMentionSuggestions("FILE")).toHaveLength(1);
    expect(getMentionSuggestions("File")).toHaveLength(1);
  });

  it("returns empty for non-matching prefix", () => {
    expect(getMentionSuggestions("xyz")).toHaveLength(0);
  });
});

describe("getMentionFormat", () => {
  it("returns format without value for standalone types", () => {
    expect(getMentionFormat("git-diff")).toBe("@git-diff");
    expect(getMentionFormat("problems")).toBe("@problems");
    expect(getMentionFormat("terminal")).toBe("@terminal");
  });

  it("returns format with <value> for value types", () => {
    expect(getMentionFormat("file")).toBe("@file:<value>");
    expect(getMentionFormat("folder")).toBe("@folder:<value>");
    expect(getMentionFormat("url")).toBe("@url:<value>");
    expect(getMentionFormat("codebase")).toBe("@codebase:<value>");
  });
});

// =============================================================================
// Text Manipulation Tests
// =============================================================================

describe("stripMentions", () => {
  it("removes single mention", () => {
    expect(stripMentions("@git-diff")).toBe("");
  });

  it("preserves surrounding text", () => {
    const result = stripMentions("Check @file:./test.ts please");
    expect(result).toContain("Check");
    expect(result).toContain("please");
    expect(result).not.toContain("@file");
  });

  it("removes multiple mentions", () => {
    const result = stripMentions("@file:a and @git-diff here");
    expect(result).not.toContain("@file");
    expect(result).not.toContain("@git-diff");
  });
});

describe("extractTextWithoutMentions", () => {
  it("returns cleaned text", () => {
    const result = extractTextWithoutMentions("Check @file:./test.ts and @git-diff for changes");
    expect(result).toBe("Check and for changes");
  });

  it("trims result", () => {
    const result = extractTextWithoutMentions("@file:./test.ts hello");
    expect(result).not.toMatch(/^\s/);
    expect(result).not.toMatch(/\s$/);
  });
});

describe("hasMentions", () => {
  it("returns true when mentions exist", () => {
    expect(hasMentions("@file:./test.ts")).toBe(true);
    expect(hasMentions("Check @git-diff")).toBe(true);
  });

  it("returns false for text without mentions", () => {
    expect(hasMentions("Hello world")).toBe(false);
    expect(hasMentions("email@example.com")).toBe(false);
  });
});

describe("countMentions", () => {
  it("returns 0 for no mentions", () => {
    expect(countMentions("Hello")).toBe(0);
  });

  it("counts single mention", () => {
    expect(countMentions("@git-diff")).toBe(1);
  });

  it("counts multiple mentions", () => {
    expect(countMentions("@file:a @folder:b @git-diff")).toBe(3);
  });
});

describe("countMentionsByType", () => {
  it("returns empty map for no mentions", () => {
    const counts = countMentionsByType("Hello");
    expect(counts.size).toBe(0);
  });

  it("counts by type correctly", () => {
    const counts = countMentionsByType("@file:a @file:b @git-diff");
    expect(counts.get("file")).toBe(2);
    expect(counts.get("git-diff")).toBe(1);
  });
});

// =============================================================================
// Type Constants Tests
// =============================================================================

describe("MENTION_TYPES", () => {
  it("contains all 7 types", () => {
    expect(MENTION_TYPES).toHaveLength(7);
  });

  it("includes expected types", () => {
    expect(MENTION_TYPES).toContain("file");
    expect(MENTION_TYPES).toContain("folder");
    expect(MENTION_TYPES).toContain("url");
    expect(MENTION_TYPES).toContain("codebase");
    expect(MENTION_TYPES).toContain("git-diff");
    expect(MENTION_TYPES).toContain("problems");
    expect(MENTION_TYPES).toContain("terminal");
  });
});

describe("MENTION_TYPES_WITH_VALUE", () => {
  it("contains 4 types", () => {
    expect(MENTION_TYPES_WITH_VALUE).toHaveLength(4);
  });
});

describe("MENTION_TYPES_STANDALONE", () => {
  it("contains 3 types", () => {
    expect(MENTION_TYPES_STANDALONE).toHaveLength(3);
  });
});
