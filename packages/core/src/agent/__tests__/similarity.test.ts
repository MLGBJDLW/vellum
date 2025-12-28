import { describe, expect, it } from "vitest";
import {
  averageSimilarity,
  computeSimilarityStats,
  jaccardSimilarity,
  maxSimilarity,
  minSimilarity,
  textSimilarity,
  tokenize,
} from "../similarity.js";

describe("Similarity Functions", () => {
  describe("tokenize", () => {
    it("should create 3-grams by default", () => {
      const tokens = tokenize("hello");

      expect(tokens.size).toBe(3);
      expect(tokens.has("hel")).toBe(true);
      expect(tokens.has("ell")).toBe(true);
      expect(tokens.has("llo")).toBe(true);
    });

    it("should normalize whitespace", () => {
      const tokens1 = tokenize("hello  world");
      const tokens2 = tokenize("hello world");

      // Should be the same after normalization
      expect(tokens1.size).toBe(tokens2.size);
      for (const token of tokens1) {
        expect(tokens2.has(token)).toBe(true);
      }
    });

    it("should be case-insensitive", () => {
      const tokens1 = tokenize("Hello");
      const tokens2 = tokenize("hello");

      expect(tokens1.size).toBe(tokens2.size);
      for (const token of tokens1) {
        expect(tokens2.has(token)).toBe(true);
      }
    });

    it("should handle short texts", () => {
      const tokens = tokenize("ab");

      expect(tokens.size).toBe(1);
      expect(tokens.has("ab")).toBe(true);
    });

    it("should return empty set for empty string", () => {
      const tokens = tokenize("");

      expect(tokens.size).toBe(0);
    });

    it("should support custom n-gram sizes", () => {
      const tokens = tokenize("hello", 2);

      expect(tokens.size).toBe(4);
      expect(tokens.has("he")).toBe(true);
      expect(tokens.has("el")).toBe(true);
      expect(tokens.has("ll")).toBe(true);
      expect(tokens.has("lo")).toBe(true);
    });
  });

  describe("jaccardSimilarity", () => {
    it("should return 1 for identical sets", () => {
      const set = new Set(["a", "b", "c"]);

      const similarity = jaccardSimilarity(set, set);

      expect(similarity).toBe(1);
    });

    it("should return 0 for completely different sets", () => {
      const setA = new Set(["a", "b", "c"]);
      const setB = new Set(["d", "e", "f"]);

      const similarity = jaccardSimilarity(setA, setB);

      expect(similarity).toBe(0);
    });

    it("should return correct value for partial overlap", () => {
      const setA = new Set(["a", "b", "c", "d"]);
      const setB = new Set(["c", "d", "e", "f"]);

      // Intersection: {c, d} = 2
      // Union: {a, b, c, d, e, f} = 6
      // Jaccard: 2/6 = 0.333...
      const similarity = jaccardSimilarity(setA, setB);

      expect(similarity).toBeCloseTo(2 / 6, 5);
    });

    it("should return 1 for two empty sets", () => {
      const similarity = jaccardSimilarity(new Set(), new Set());

      expect(similarity).toBe(1);
    });

    it("should return 0 when one set is empty", () => {
      const setA = new Set(["a", "b"]);
      const setB = new Set<string>();

      expect(jaccardSimilarity(setA, setB)).toBe(0);
      expect(jaccardSimilarity(setB, setA)).toBe(0);
    });
  });

  describe("textSimilarity", () => {
    it("should return 1 for identical texts", () => {
      const text = "hello world";

      const similarity = textSimilarity(text, text);

      expect(similarity).toBe(1);
    });

    it("should return high similarity for similar texts", () => {
      const similarity = textSimilarity("The file was not found", "The file was not found");

      expect(similarity).toBe(1);
    });

    it("should return lower similarity for different texts", () => {
      const similarity = textSimilarity("Hello world", "Goodbye everyone");

      expect(similarity).toBeLessThan(0.5);
    });
  });

  describe("averageSimilarity", () => {
    it("should return 1 for identical texts", () => {
      const texts = ["The file was not found", "The file was not found", "The file was not found"];

      const avg = averageSimilarity(texts);

      expect(avg).toBe(1);
    });

    it("should return 1 for single text", () => {
      const avg = averageSimilarity(["hello"]);

      expect(avg).toBe(1);
    });

    it("should return 0 for empty array", () => {
      const avg = averageSimilarity([]);

      expect(avg).toBe(0);
    });

    it("should calculate correct average for varied texts", () => {
      const texts = ["aaa", "bbb", "ccc"];

      // All pairs have 0 similarity (no overlap)
      const avg = averageSimilarity(texts);

      expect(avg).toBe(0);
    });

    it("should calculate correct average with partial similarity", () => {
      // These should have some overlap
      const texts = ["hello world", "hello there", "hello friend"];

      const avg = averageSimilarity(texts);

      // Should be > 0 due to "hello" overlap
      expect(avg).toBeGreaterThan(0);
      expect(avg).toBeLessThan(1);
    });
  });

  describe("minSimilarity", () => {
    it("should return minimum pairwise similarity", () => {
      const texts = ["hello world", "hello world", "completely different"];

      const min = minSimilarity(texts);

      // At least one pair has low similarity
      expect(min).toBeLessThan(0.5);
    });

    it("should return 1 for single text", () => {
      const min = minSimilarity(["hello"]);

      expect(min).toBe(1);
    });
  });

  describe("maxSimilarity", () => {
    it("should return maximum pairwise similarity", () => {
      const texts = ["hello world", "hello world", "completely different"];

      const max = maxSimilarity(texts);

      // At least one pair is identical
      expect(max).toBe(1);
    });

    it("should return 1 for single text", () => {
      const max = maxSimilarity(["hello"]);

      expect(max).toBe(1);
    });
  });

  describe("computeSimilarityStats", () => {
    it("should compute all statistics", () => {
      const texts = ["hello world", "hello there", "hello friend"];

      const stats = computeSimilarityStats(texts);

      expect(stats.count).toBe(3);
      expect(stats.pairCount).toBe(3); // C(3,2) = 3
      expect(stats.average).toBeGreaterThan(0);
      expect(stats.min).toBeLessThanOrEqual(stats.average);
      expect(stats.max).toBeGreaterThanOrEqual(stats.average);
    });

    it("should handle single text", () => {
      const stats = computeSimilarityStats(["hello"]);

      expect(stats.count).toBe(1);
      expect(stats.pairCount).toBe(0);
      expect(stats.average).toBe(1);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(1);
    });

    it("should handle empty array", () => {
      const stats = computeSimilarityStats([]);

      expect(stats.count).toBe(0);
      expect(stats.pairCount).toBe(0);
      expect(stats.average).toBe(0);
    });
  });
});
