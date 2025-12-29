import { describe, expect, it } from "vitest";
import type { PermissionLevel } from "../types.js";
import { Wildcard } from "../wildcard.js";

// ============================================
// toRegex Tests
// ============================================

describe("Wildcard.toRegex", () => {
  it("should create regex from simple pattern", () => {
    const regex = Wildcard.toRegex("hello");
    expect(regex.test("hello")).toBe(true);
    expect(regex.test("hello world")).toBe(false);
    expect(regex.test("say hello")).toBe(false);
  });

  it("should handle * wildcard (any characters)", () => {
    const regex = Wildcard.toRegex("*.ts");
    expect(regex.test("file.ts")).toBe(true);
    expect(regex.test("path/to/file.ts")).toBe(true);
    expect(regex.test(".ts")).toBe(true);
    expect(regex.test("file.tsx")).toBe(false);
  });

  it("should handle ? wildcard (single character)", () => {
    const regex = Wildcard.toRegex("file?.ts");
    expect(regex.test("file1.ts")).toBe(true);
    expect(regex.test("fileA.ts")).toBe(true);
    expect(regex.test("file.ts")).toBe(false);
    expect(regex.test("file12.ts")).toBe(false);
  });

  it("should handle multiple wildcards", () => {
    const regex = Wildcard.toRegex("*/*/*.ts");
    expect(regex.test("src/foo/bar.ts")).toBe(true);
    expect(regex.test("a/b/c.ts")).toBe(true);
    expect(regex.test("foo.ts")).toBe(false);
  });

  it("should escape special regex characters", () => {
    const regex = Wildcard.toRegex("file.ts");
    expect(regex.test("file.ts")).toBe(true);
    expect(regex.test("filets")).toBe(false); // . should be escaped

    const regex2 = Wildcard.toRegex("file[1].ts");
    expect(regex2.test("file[1].ts")).toBe(true);
    expect(regex2.test("file1.ts")).toBe(false); // [] should be escaped

    const regex3 = Wildcard.toRegex("a+b");
    expect(regex3.test("a+b")).toBe(true);
    expect(regex3.test("aab")).toBe(false); // + should be escaped
  });

  it("should handle empty pattern (EC-001)", () => {
    const regex = Wildcard.toRegex("");
    expect(regex.test("")).toBe(true);
    expect(regex.test("anything")).toBe(false);
  });

  it("should handle pattern with only wildcards", () => {
    const regex = Wildcard.toRegex("*");
    expect(regex.test("")).toBe(true);
    expect(regex.test("anything")).toBe(true);
    expect(regex.test("multi\nline")).toBe(true);

    const regex2 = Wildcard.toRegex("???");
    expect(regex2.test("abc")).toBe(true);
    expect(regex2.test("ab")).toBe(false);
    expect(regex2.test("abcd")).toBe(false);
  });
});

// ============================================
// matches Tests
// ============================================

describe("Wildcard.matches", () => {
  it("should match exact strings", () => {
    expect(Wildcard.matches("hello", "hello")).toBe(true);
    expect(Wildcard.matches("hello", "world")).toBe(false);
  });

  it("should match * wildcard patterns", () => {
    expect(Wildcard.matches("git status", "git *")).toBe(true);
    expect(Wildcard.matches("git push origin main", "git push *")).toBe(true);
    expect(Wildcard.matches("npm install", "git *")).toBe(false);
  });

  it("should match ? wildcard patterns", () => {
    expect(Wildcard.matches("file1.ts", "file?.ts")).toBe(true);
    expect(Wildcard.matches("file.ts", "file?.ts")).toBe(false);
  });

  it("should match combined wildcards", () => {
    expect(Wildcard.matches("src/components/Button.tsx", "src/*/Button.tsx")).toBe(true);
    expect(Wildcard.matches("test_1.js", "test_?.js")).toBe(true);
  });

  it("should handle special characters (EC-002)", () => {
    expect(Wildcard.matches("file.name.ts", "file.name.ts")).toBe(true);
    expect(Wildcard.matches("path/to/file", "path/to/file")).toBe(true);
    expect(Wildcard.matches("cmd --flag=value", "cmd --flag=*")).toBe(true);
    expect(Wildcard.matches("a(b)c", "a(b)c")).toBe(true);
    expect(Wildcard.matches("a[b]c", "a[b]c")).toBe(true);
    expect(Wildcard.matches("a{b}c", "a{b}c")).toBe(true);
    expect(Wildcard.matches("a^b$c", "a^b$c")).toBe(true);
  });

  it("should be case-sensitive", () => {
    expect(Wildcard.matches("Hello", "hello")).toBe(false);
    expect(Wildcard.matches("HELLO", "hello")).toBe(false);
  });

  it("should handle empty input and pattern (EC-001)", () => {
    expect(Wildcard.matches("", "")).toBe(true);
    expect(Wildcard.matches("", "*")).toBe(true);
    expect(Wildcard.matches("", "?")).toBe(false);
    expect(Wildcard.matches("a", "")).toBe(false);
  });

  it("should handle multiline input", () => {
    expect(Wildcard.matches("line1\nline2", "*")).toBe(true);
    expect(Wildcard.matches("line1\nline2", "line1*")).toBe(true);
  });
});

// ============================================
// findMatch Tests
// ============================================

describe("Wildcard.findMatch", () => {
  const patterns = {
    "git status": "status",
    "git push *": "push",
    "git *": "git",
    "*": "any",
  };

  it("should match exact patterns first", () => {
    expect(Wildcard.findMatch("git status", patterns)).toBe("status");
  });

  it("should match more specific wildcards before generic", () => {
    expect(Wildcard.findMatch("git push origin", patterns)).toBe("push");
    expect(Wildcard.findMatch("git pull", patterns)).toBe("git");
  });

  it("should fall back to catch-all pattern", () => {
    expect(Wildcard.findMatch("npm install", patterns)).toBe("any");
  });

  it("should return undefined for no match", () => {
    const patternsNoFallback = {
      "git *": "git",
    };
    expect(Wildcard.findMatch("npm install", patternsNoFallback)).toBeUndefined();
  });

  it("should handle empty patterns object", () => {
    expect(Wildcard.findMatch("anything", {})).toBeUndefined();
  });

  it("should handle empty input", () => {
    expect(Wildcard.findMatch("", { "": "empty", "*": "any" })).toBe("empty");
  });
});

// ============================================
// resolvePermission Tests
// ============================================

describe("Wildcard.resolvePermission", () => {
  const bashPermissions: Record<string, PermissionLevel> = {
    "git status": "allow",
    "git diff": "allow",
    "git log *": "allow",
    "git push *": "ask",
    "rm -rf *": "deny",
    "*": "ask",
  };

  it("should resolve exact matches", () => {
    expect(Wildcard.resolvePermission("git status", bashPermissions)).toBe("allow");
    expect(Wildcard.resolvePermission("git diff", bashPermissions)).toBe("allow");
  });

  it("should resolve pattern matches", () => {
    expect(Wildcard.resolvePermission("git log --oneline", bashPermissions)).toBe("allow");
    expect(Wildcard.resolvePermission("git push origin main", bashPermissions)).toBe("ask");
    expect(Wildcard.resolvePermission("rm -rf /", bashPermissions)).toBe("deny");
  });

  it("should fall back to * pattern", () => {
    expect(Wildcard.resolvePermission("ls -la", bashPermissions)).toBe("ask");
    expect(Wildcard.resolvePermission("npm install", bashPermissions)).toBe("ask");
  });

  it("should return undefined when no patterns match", () => {
    const limitedPatterns: Record<string, PermissionLevel> = {
      "git *": "allow",
    };
    expect(Wildcard.resolvePermission("npm install", limitedPatterns)).toBeUndefined();
  });
});

// ============================================
// hasWildcard Tests
// ============================================

describe("Wildcard.hasWildcard", () => {
  it("should detect * wildcard", () => {
    expect(Wildcard.hasWildcard("*.ts")).toBe(true);
    expect(Wildcard.hasWildcard("file*")).toBe(true);
    expect(Wildcard.hasWildcard("*")).toBe(true);
  });

  it("should detect ? wildcard", () => {
    expect(Wildcard.hasWildcard("file?.ts")).toBe(true);
    expect(Wildcard.hasWildcard("???")).toBe(true);
  });

  it("should return false for no wildcards", () => {
    expect(Wildcard.hasWildcard("file.ts")).toBe(false);
    expect(Wildcard.hasWildcard("git status")).toBe(false);
    expect(Wildcard.hasWildcard("")).toBe(false);
  });
});

// ============================================
// escapeWildcard Tests
// ============================================

describe("Wildcard.escapeWildcard", () => {
  it("should escape * characters", () => {
    expect(Wildcard.escapeWildcard("a*b")).toBe("a\\*b");
    expect(Wildcard.escapeWildcard("***")).toBe("\\*\\*\\*");
  });

  it("should escape ? characters", () => {
    expect(Wildcard.escapeWildcard("a?b")).toBe("a\\?b");
    expect(Wildcard.escapeWildcard("???")).toBe("\\?\\?\\?");
  });

  it("should escape both", () => {
    expect(Wildcard.escapeWildcard("*?*")).toBe("\\*\\?\\*");
  });

  it("should not modify strings without wildcards", () => {
    expect(Wildcard.escapeWildcard("hello")).toBe("hello");
    expect(Wildcard.escapeWildcard("file.ts")).toBe("file.ts");
    expect(Wildcard.escapeWildcard("")).toBe("");
  });
});

// ============================================
// specificity Tests
// ============================================

describe("Wildcard.specificity", () => {
  it("should give higher score to exact matches", () => {
    expect(Wildcard.specificity("git status")).toBeGreaterThan(Wildcard.specificity("git *"));
  });

  it("should give higher score to longer patterns", () => {
    expect(Wildcard.specificity("git push origin")).toBeGreaterThan(
      Wildcard.specificity("git push")
    );
  });

  it("should penalize * more than ?", () => {
    expect(Wildcard.specificity("file?.ts")).toBeGreaterThan(Wildcard.specificity("file*.ts"));
  });

  it("should give lowest score to pure wildcards", () => {
    expect(Wildcard.specificity("*")).toBeLessThan(Wildcard.specificity("a"));
  });
});

// ============================================
// sortBySpecificity Tests
// ============================================

describe("Wildcard.sortBySpecificity", () => {
  it("should sort patterns by specificity (most specific first)", () => {
    const patterns = ["*", "git *", "git status", "git push *"];
    const sorted = Wildcard.sortBySpecificity(patterns);

    expect(sorted[0]).toBe("git status"); // exact match
    expect(sorted[sorted.length - 1]).toBe("*"); // catch-all
  });

  it("should not modify original array", () => {
    const patterns = ["*", "git *"];
    const sorted = Wildcard.sortBySpecificity(patterns);
    expect(patterns[0]).toBe("*");
    expect(sorted[0]).toBe("git *");
  });

  it("should handle empty array", () => {
    expect(Wildcard.sortBySpecificity([])).toEqual([]);
  });
});

// ============================================
// Edge Case Tests
// ============================================

describe("Wildcard edge cases", () => {
  describe("EC-001: Empty patterns and inputs", () => {
    it("should handle empty pattern with empty input", () => {
      expect(Wildcard.matches("", "")).toBe(true);
    });

    it("should handle * pattern with empty input", () => {
      expect(Wildcard.matches("", "*")).toBe(true);
    });

    it("should handle empty pattern with non-empty input", () => {
      expect(Wildcard.matches("text", "")).toBe(false);
    });
  });

  describe("EC-002: Special characters in patterns", () => {
    it("should handle regex special characters", () => {
      const specialChars = [
        ["file.ts", "file.ts"],
        ["path\\to\\file", "path\\to\\file"],
        ["(group)", "(group)"],
        ["[bracket]", "[bracket]"],
        ["{brace}", "{brace}"],
        ["a+b", "a+b"],
        ["a|b", "a|b"],
        ["a^b", "a^b"],
        ["a$b", "a$b"],
      ] as const;

      for (const [input, pattern] of specialChars) {
        expect(Wildcard.matches(input, pattern)).toBe(true);
      }
    });

    it("should combine special chars with wildcards", () => {
      expect(Wildcard.matches("file.test.ts", "*.ts")).toBe(true);
      expect(Wildcard.matches("path/to/[file].ts", "*/[file].ts")).toBe(true);
    });
  });

  describe("Long patterns and inputs", () => {
    it("should handle long strings", () => {
      const longInput = "a".repeat(1000);
      const longPattern = `${"a".repeat(500)}*`;
      expect(Wildcard.matches(longInput, longPattern)).toBe(true);
    });

    it("should handle many wildcards", () => {
      const pattern = "a?b?c?d?e?";
      expect(Wildcard.matches("a1b2c3d4e5", pattern)).toBe(true);
      expect(Wildcard.matches("a1b2c3d4e", pattern)).toBe(false);
    });
  });

  describe("Unicode and special content", () => {
    it("should handle unicode characters", () => {
      expect(Wildcard.matches("日本語", "日本語")).toBe(true);
      expect(Wildcard.matches("日本語テスト", "日本語*")).toBe(true);
    });

    it("should handle newlines", () => {
      expect(Wildcard.matches("line1\nline2", "*")).toBe(true);
      expect(Wildcard.matches("line1\nline2", "line1*line2")).toBe(true);
    });

    it("should handle tabs and spaces", () => {
      expect(Wildcard.matches("hello\tworld", "hello\tworld")).toBe(true);
      expect(Wildcard.matches("hello world", "hello*world")).toBe(true);
    });
  });
});
