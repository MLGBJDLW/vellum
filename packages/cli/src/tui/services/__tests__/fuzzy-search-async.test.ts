import { describe, expect, it } from "vitest";
import { fuzzySearchAsync, fuzzySearchMultiAsync } from "../fuzzy-search.js";

describe("fuzzy-search-async", () => {
  describe("fuzzySearchAsync", () => {
    const testItems = [
      { name: "apple", description: "red fruit" },
      { name: "banana", description: "yellow fruit" },
      { name: "cherry", description: "small red fruit" },
      { name: "date", description: "sweet brown fruit" },
      { name: "elderberry", description: "purple berry" },
    ];

    it("should return matching items", async () => {
      const results = await fuzzySearchAsync(testItems, "apple", "name");

      expect(results).toHaveLength(1);
      expect(results[0]?.item.name).toBe("apple");
    });

    it("should return empty array for no matches", async () => {
      const results = await fuzzySearchAsync(testItems, "xyz123", "name");

      expect(results).toHaveLength(0);
    });

    it("should return all items for empty query", async () => {
      const results = await fuzzySearchAsync(testItems, "", "name");

      expect(results).toHaveLength(testItems.length);
    });

    it("should respect limit option", async () => {
      const results = await fuzzySearchAsync(testItems, "fruit", "description", { limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("should abort when signal is triggered", async () => {
      const controller = new AbortController();

      // Large dataset to ensure async processing
      const largeItems = Array.from({ length: 10000 }, (_, i) => ({
        name: `item-${i}`,
        description: `description ${i}`,
      }));

      // Abort immediately
      controller.abort();

      // Aborted search should throw AbortError
      await expect(
        fuzzySearchAsync(largeItems, "item", "name", {}, controller.signal)
      ).rejects.toThrow("Aborted");
    });

    it("should handle empty array gracefully", async () => {
      const results = await fuzzySearchAsync([] as typeof testItems, "test", "name");

      expect(results).toHaveLength(0);
    });
  });

  describe("fuzzySearchMultiAsync", () => {
    const testItems = [
      { id: 1, name: "John", email: "john@example.com" },
      { id: 2, name: "Jane", email: "jane@example.com" },
      { id: 3, name: "Bob", email: "bob@test.com" },
    ];

    it("should search across multiple fields", async () => {
      const results = await fuzzySearchMultiAsync(testItems, "example", {
        keys: ["name", "email"],
      });

      expect(results.length).toBeGreaterThan(0);
      // Should match items with 'example' in email
      expect(results.some((r) => r.item.email.includes("example"))).toBe(true);
    });

    it("should return all items for empty query", async () => {
      const results = await fuzzySearchMultiAsync(testItems, "", { keys: ["name"] });

      expect(results).toHaveLength(testItems.length);
    });

    it("should support abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        fuzzySearchMultiAsync(testItems, "test", { keys: ["name"] }, controller.signal)
      ).rejects.toThrow("Aborted");
    });
  });

  describe("async chunk processing", () => {
    it("should process large datasets without blocking", async () => {
      // Create a dataset larger than default chunk size (1000)
      const largeItems = Array.from({ length: 2500 }, (_, i) => ({
        name: `item-${i}`,
        value: i,
      }));

      const startTime = Date.now();
      const results = await fuzzySearchAsync(largeItems, "item-1", "name");
      const elapsed = Date.now() - startTime;

      // Should complete in reasonable time
      expect(elapsed).toBeLessThan(5000);
      // Should find matches
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
