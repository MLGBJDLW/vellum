import { beforeEach, describe, expect, it } from "vitest";
import { CitationCollector } from "../citation.js";

describe("CitationCollector", () => {
  let collector: CitationCollector;

  beforeEach(() => {
    collector = new CitationCollector();
  });

  describe("processCitation()", () => {
    it("adds a citation", () => {
      collector.processCitation({
        uri: "https://example.com/doc1",
        title: "Doc 1",
        relevanceScore: 0.9,
      });

      expect(collector.count).toBe(1);
    });

    it("adds multiple citations", () => {
      collector.processCitation({
        uri: "https://example.com/doc1",
        title: "Doc 1",
        relevanceScore: 0.9,
      });
      collector.processCitation({
        uri: "https://example.com/doc2",
        title: "Doc 2",
        relevanceScore: 0.8,
      });

      expect(collector.count).toBe(2);
    });
  });

  describe("getSortedCitations()", () => {
    it("sorts by relevanceScore descending", () => {
      collector.processCitation({
        uri: "https://example.com/low",
        title: "Low",
        relevanceScore: 0.5,
      });
      collector.processCitation({
        uri: "https://example.com/high",
        title: "High",
        relevanceScore: 0.95,
      });
      collector.processCitation({
        uri: "https://example.com/mid",
        title: "Mid",
        relevanceScore: 0.7,
      });

      const sorted = collector.getSortedCitations();

      expect(sorted[0]?.uri).toBe("https://example.com/high");
      expect(sorted[1]?.uri).toBe("https://example.com/mid");
      expect(sorted[2]?.uri).toBe("https://example.com/low");
    });

    it("treats missing relevanceScore as 0", () => {
      collector.processCitation({
        uri: "https://example.com/no-score",
        title: "No Score",
      });
      collector.processCitation({
        uri: "https://example.com/with-score",
        title: "With Score",
        relevanceScore: 0.5,
      });

      const sorted = collector.getSortedCitations();

      expect(sorted[0]?.uri).toBe("https://example.com/with-score");
      expect(sorted[1]?.uri).toBe("https://example.com/no-score");
    });
  });

  describe("deduplication", () => {
    it("deduplicates by URI", () => {
      collector.processCitation({
        uri: "https://example.com/doc",
        title: "First",
        relevanceScore: 0.5,
      });
      collector.processCitation({
        uri: "https://example.com/doc",
        title: "Second",
        relevanceScore: 0.9,
      });

      expect(collector.count).toBe(1);
      const citations = collector.getSortedCitations();
      expect(citations[0]?.title).toBe("Second");
      expect(citations[0]?.relevanceScore).toBe(0.9);
    });
  });

  describe("count", () => {
    it("returns 0 for empty collector", () => {
      expect(collector.count).toBe(0);
    });

    it("returns correct count after adding citations", () => {
      collector.processCitation({ uri: "https://a.com", title: "A" });
      collector.processCitation({ uri: "https://b.com", title: "B" });
      collector.processCitation({ uri: "https://c.com", title: "C" });

      expect(collector.count).toBe(3);
    });
  });

  describe("hasCitations()", () => {
    it("returns false when empty", () => {
      expect(collector.hasCitations()).toBe(false);
    });

    it("returns true when citations exist", () => {
      collector.processCitation({ uri: "https://example.com", title: "Test" });

      expect(collector.hasCitations()).toBe(true);
    });
  });

  describe("reset()", () => {
    it("clears all citations", () => {
      collector.processCitation({ uri: "https://a.com", title: "A" });
      collector.processCitation({ uri: "https://b.com", title: "B" });

      expect(collector.count).toBe(2);

      collector.reset();

      expect(collector.count).toBe(0);
      expect(collector.hasCitations()).toBe(false);
      expect(collector.getSortedCitations()).toEqual([]);
    });
  });
});
