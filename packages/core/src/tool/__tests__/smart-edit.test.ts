// ============================================
// SmartEdit Engine Tests - T037
// ============================================

import { describe, expect, it } from "vitest";

import { _internal, createSmartEditEngine, type StrategyName } from "../smart-edit.js";

// =============================================================================
// Test Fixtures
// =============================================================================

const ORIGINAL_CODE = `function hello() {
  console.log("Hello, World!");
  return true;
}

function goodbye() {
  console.log("Goodbye!");
  return false;
}`;

// =============================================================================
// T032: Exact Match Strategy Tests
// =============================================================================

describe("SmartEditEngine", () => {
  describe("exact match strategy", () => {
    it("should match and replace exact text", () => {
      const engine = createSmartEditEngine();

      const result = engine.apply(
        ORIGINAL_CODE,
        'console.log("Hello, World!");',
        'console.log("Hi there!");'
      );

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("exact");
      expect(result.confidence).toBe(1.0);
      expect(result.output).toContain('console.log("Hi there!");');
      expect(result.output).not.toContain('console.log("Hello, World!");');
    });

    it("should return immediately on exact match", () => {
      const engine = createSmartEditEngine({ strategies: ["exact", "fuzzy"] });

      const result = engine.apply("abc def ghi", "def", "xyz");

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("exact");
      expect(result.confidence).toBe(1.0);
      expect(result.output).toBe("abc xyz ghi");
    });

    it("should fail when exact match not found", () => {
      const engine = createSmartEditEngine({ strategies: ["exact"] });

      const result = engine.apply("abc def ghi", "xyz", "123");

      expect(result.success).toBe(false);
      // When exact is the only strategy and fails, LLM fallback is returned
      expect(result.strategy).toBe("llm");
    });

    it("should only replace first occurrence", () => {
      const engine = createSmartEditEngine({ strategies: ["exact"] });

      const result = engine.apply("abc abc abc", "abc", "xyz");

      expect(result.success).toBe(true);
      expect(result.output).toBe("xyz abc abc");
    });

    it("should preserve position metadata", () => {
      const engine = createSmartEditEngine({ strategies: ["exact"] });

      const result = engine.apply("prefix search suffix", "search", "replace");

      expect(result.matchDetails).toBeDefined();
      expect(result.matchDetails?.position).toBe(7); // "prefix " is 7 chars
      expect(result.matchDetails?.matchLength).toBe(6); // "search" is 6 chars
    });
  });

  // =============================================================================
  // T033: Whitespace Normalization Strategy Tests
  // =============================================================================

  describe("whitespace normalize strategy", () => {
    it("should match with trailing whitespace differences", () => {
      const engine = createSmartEditEngine({ strategies: ["whitespace"] });

      const original = "const x = 1;   \nconst y = 2;";
      const search = "const x = 1;\nconst y = 2;";

      const result = engine.apply(original, search, "const z = 3;");

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("whitespace");
      expect(result.confidence).toBe(0.95);
    });

    it("should normalize CRLF to LF", () => {
      const engine = createSmartEditEngine({ strategies: ["whitespace"] });

      const original = "line1\r\nline2\r\nline3";
      const search = "line1\nline2\nline3";

      const result = engine.apply(original, search, "replaced");

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("whitespace");
    });

    it("should handle mixed line endings", () => {
      const engine = createSmartEditEngine({ strategies: ["whitespace"] });

      const original = "a\r\nb  \nc\r\n";
      const search = "a\nb\nc\n";

      const result = engine.apply(original, search, "replaced");

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("whitespace");
    });

    it("should fail on content differences", () => {
      const engine = createSmartEditEngine({ strategies: ["whitespace"] });

      const result = engine.apply("const x = 1;", "const x = 2;", "replaced");

      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // T034: Fuzzy Match Strategy Tests
  // =============================================================================

  describe("fuzzy match strategy", () => {
    it("should match with >80% similarity", () => {
      const engine = createSmartEditEngine({
        strategies: ["fuzzy"],
        confidenceThreshold: 0.8,
      });

      const original = `function test() {
  console.log("test");
  return true;
}`;

      const search = `function test() {
  console.log("tset");
  return true;
}`;

      const result = engine.apply(original, search, "replaced()");

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("fuzzy");
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it("should reject matches below threshold", () => {
      const engine = createSmartEditEngine({
        strategies: ["fuzzy"],
        confidenceThreshold: 0.9,
      });

      const original = "abcdefghij";
      const search = "xyzwvutsrq"; // Very different

      const result = engine.apply(original, search, "replaced");

      expect(result.success).toBe(false);
    });

    it("should find best matching position", () => {
      const engine = createSmartEditEngine({
        strategies: ["fuzzy"],
        confidenceThreshold: 0.7,
      });

      const original = `line 1
line 2
target line
line 4`;

      const search = `targt line`; // Typo in "target"

      // Note: fuzzy works on line-by-line basis with same line count
      const result = engine.apply(original, search, "replaced line");

      // Single line fuzzy match should work
      expect(result.success).toBe(true);
      expect(result.strategy).toBe("fuzzy");
    });

    it("should return similarity as confidence", () => {
      const engine = createSmartEditEngine({
        strategies: ["fuzzy"],
        confidenceThreshold: 0.5,
      });

      const original = "hello world";
      const search = "hello wurld"; // One char different

      const result = engine.apply(original, search, "hi there");

      expect(result.success).toBe(true);
      expect(result.confidence).toBeLessThan(1.0);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.matchDetails?.similarity).toBeDefined();
    });
  });

  // =============================================================================
  // T035: Block Match Strategy Tests
  // =============================================================================

  describe("block match strategy", () => {
    it("should find block by anchor lines", () => {
      const engine = createSmartEditEngine({ strategies: ["block"] });

      const original = `// Header comment
function processData() {
  const data = load();
  const result = transform(data);
  return result;
}

function saveData() {
  // save logic
}`;

      const search = `function processData() {
  const data = loadData();
  const result = transformData(data);
  return result;
}`;

      const result = engine.apply(original, search, "function newProcess() {}");

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("block");
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.confidence).toBeLessThanOrEqual(0.9);
    });

    it("should use first and last lines as anchors", () => {
      const engine = createSmartEditEngine({ strategies: ["block"] });

      const original = `start line
middle content here
end line`;

      const search = `start line
different middle
end line`;

      const result = engine.apply(original, search, "replaced block");

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("block");
    });

    it("should fail with no anchor match", () => {
      const engine = createSmartEditEngine({ strategies: ["block"] });

      const original = `aaa
bbb
ccc`;

      const search = `xxx
yyy
zzz`;

      const result = engine.apply(original, search, "replaced");

      expect(result.success).toBe(false);
    });

    it("should require at least 2 lines", () => {
      const engine = createSmartEditEngine({ strategies: ["block"] });

      // Block strategy needs at least 2 lines for anchoring
      const result = engine.apply("single line content", "single line", "replaced");

      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // T035: LLM Fallback Strategy Tests
  // =============================================================================

  describe("llm fallback strategy", () => {
    it("should trigger when all strategies fail", () => {
      const engine = createSmartEditEngine({
        strategies: ["exact", "whitespace", "llm"],
      });

      const result = engine.apply("original text", "not found text", "replacement");

      expect(result.success).toBe(false);
      expect(result.strategy).toBe("llm");
      expect(result.confidence).toBe(0);
      expect(result.error).toContain("LLM assistance");
    });

    it("should preserve original text on failure", () => {
      const engine = createSmartEditEngine({ strategies: ["llm"] });

      const original = "keep this text";
      const result = engine.apply(original, "search", "replace");

      expect(result.success).toBe(false);
      expect(result.output).toBe(original);
    });

    it("should include search length in details", () => {
      const engine = createSmartEditEngine({ strategies: ["llm"] });

      const result = engine.apply("original", "long search text", "replace");

      expect(result.matchDetails?.matchLength).toBe("long search text".length);
    });
  });

  // =============================================================================
  // Strategy Cascade Tests
  // =============================================================================

  describe("strategy cascade", () => {
    it("should try strategies in order", () => {
      // Test that exact is tried before whitespace
      const engine = createSmartEditEngine({
        strategies: ["exact", "whitespace", "fuzzy"],
      });

      const original = "exact match";
      const result = engine.apply(original, "exact match", "replaced");

      expect(result.strategy).toBe("exact");
    });

    it("should fall through to next strategy on failure", () => {
      const engine = createSmartEditEngine({
        strategies: ["exact", "whitespace"],
      });

      // Exact will fail, whitespace should succeed
      const original = "text with trailing   ";
      const search = "text with trailing";

      const result = engine.apply(`${original}\n`, `${search}\n`, "replaced\n");

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("whitespace");
    });

    it("should respect custom strategy order", () => {
      // Reverse order - fuzzy first
      const engine = createSmartEditEngine({
        strategies: ["fuzzy", "exact"],
        confidenceThreshold: 0.5,
      });

      const original = "some text here";
      const search = "som text her"; // Typos

      const result = engine.apply(original, search, "replaced");

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("fuzzy");
    });

    it("should stop at first successful strategy", () => {
      const engine = createSmartEditEngine({
        strategies: ["exact", "fuzzy", "block"],
      });

      // This will match exactly
      const result = engine.apply("find me", "find me", "found");

      expect(result.strategy).toBe("exact");
      expect(result.confidence).toBe(1.0);
    });
  });

  // =============================================================================
  // Custom Strategy Selection Tests
  // =============================================================================

  describe("applyWithStrategy", () => {
    it("should use only the specified strategy", () => {
      const engine = createSmartEditEngine();

      // Force whitespace strategy even though exact would match
      const result = engine.applyWithStrategy("exact text", "exact text", "replaced", "exact");

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("exact");
    });

    it("should fail if specified strategy doesn't match", () => {
      const engine = createSmartEditEngine();

      // Force whitespace strategy on text that requires exact match
      const result = engine.applyWithStrategy("original", "not matching", "replaced", "exact");

      expect(result.success).toBe(false);
      expect(result.strategy).toBe("exact");
      expect(result.error).toContain("did not find a match");
    });

    it("should return error for unknown strategy", () => {
      const engine = createSmartEditEngine();

      const result = engine.applyWithStrategy(
        "original",
        "search",
        "replace",
        "unknown" as StrategyName
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown strategy");
    });
  });

  // =============================================================================
  // Confidence Threshold Tests
  // =============================================================================

  describe("confidence threshold", () => {
    it("should use default threshold of 0.8", () => {
      const engine = createSmartEditEngine({ strategies: ["fuzzy"] });

      // Create a match that would be below 0.8
      const original = "abcdefghij";
      const search = "abXXXfghij"; // ~70% similar

      const result = engine.apply(original, search, "replaced");

      // Should fail because similarity < 0.8
      expect(result.success).toBe(false);
    });

    it("should respect custom confidence threshold", () => {
      const engine = createSmartEditEngine({
        strategies: ["fuzzy"],
        confidenceThreshold: 0.5,
      });

      const original = "hello";
      const search = "hxllo"; // 80% similar

      const result = engine.apply(original, search, "replaced");

      expect(result.success).toBe(true);
    });
  });

  // =============================================================================
  // Internal Utility Tests
  // =============================================================================

  describe("internal utilities", () => {
    describe("levenshteinDistance", () => {
      it("should return 0 for identical strings", () => {
        expect(_internal.levenshteinDistance("hello", "hello")).toBe(0);
      });

      it("should return correct distance for single edit", () => {
        expect(_internal.levenshteinDistance("hello", "hallo")).toBe(1);
      });

      it("should return length for completely different strings", () => {
        expect(_internal.levenshteinDistance("abc", "xyz")).toBe(3);
      });

      it("should handle empty strings", () => {
        expect(_internal.levenshteinDistance("", "hello")).toBe(5);
        expect(_internal.levenshteinDistance("hello", "")).toBe(5);
        expect(_internal.levenshteinDistance("", "")).toBe(0);
      });
    });

    describe("computeLineSimilarity", () => {
      it("should return 1.0 for identical lines", () => {
        expect(_internal.computeLineSimilarity("hello", "hello")).toBe(1.0);
      });

      it("should return value between 0 and 1", () => {
        const similarity = _internal.computeLineSimilarity("hello", "hallo");
        expect(similarity).toBeGreaterThan(0);
        expect(similarity).toBeLessThan(1);
      });

      it("should return 1.0 for empty strings", () => {
        expect(_internal.computeLineSimilarity("", "")).toBe(1.0);
      });
    });

    describe("computeBlockSimilarity", () => {
      it("should return 1.0 for identical blocks", () => {
        const lines = ["line1", "line2", "line3"];
        expect(_internal.computeBlockSimilarity(lines, lines)).toBe(1.0);
      });

      it("should return 0 for different length blocks", () => {
        expect(_internal.computeBlockSimilarity(["a", "b"], ["a"])).toBe(0);
      });

      it("should average line similarities", () => {
        const lines1 = ["hello", "world"];
        const lines2 = ["hello", "wurld"];

        const similarity = _internal.computeBlockSimilarity(lines1, lines2);
        expect(similarity).toBeGreaterThan(0.8);
        expect(similarity).toBeLessThan(1.0);
      });
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe("edge cases", () => {
    it("should handle empty search text", () => {
      const engine = createSmartEditEngine();

      const result = engine.apply("some text", "", "replacement");

      // Empty search should match at position 0 (exact strategy)
      expect(result.success).toBe(true);
      expect(result.output).toBe("replacementsome text");
    });

    it("should handle empty original text", () => {
      const engine = createSmartEditEngine();

      const result = engine.apply("", "search", "replacement");

      expect(result.success).toBe(false);
    });

    it("should handle unicode text", () => {
      const engine = createSmartEditEngine();

      const result = engine.apply("Hello 世界!", "世界", "World");

      expect(result.success).toBe(true);
      expect(result.output).toBe("Hello World!");
    });

    it("should handle multiline replacements", () => {
      const engine = createSmartEditEngine();

      const original = "line before\ntarget\nline after";
      const search = "target";
      const replace = "new line 1\nnew line 2\nnew line 3";

      const result = engine.apply(original, search, replace);

      expect(result.success).toBe(true);
      expect(result.output).toBe("line before\nnew line 1\nnew line 2\nnew line 3\nline after");
    });
  });
});
