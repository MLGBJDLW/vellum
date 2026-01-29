/**
 * EvidenceCache Unit Tests
 *
 * Tests for the LRU cache with TTL support.
 *
 * @module context/evidence/__tests__/cache.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvidenceCache } from "../cache.js";
import type { Evidence } from "../types.js";

// =============================================================================
// Mock Helpers
// =============================================================================

/**
 * Creates mock evidence for testing.
 */
function createMockEvidence(path: string, overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: `evidence-${path}`,
    provider: "diff",
    path,
    range: [1, 10] as const,
    content: `content for ${path}`,
    tokens: 100,
    baseScore: 50,
    matchedSignals: [],
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("EvidenceCache", () => {
  let cache: EvidenceCache;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-29T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should create cache with default config", () => {
      cache = new EvidenceCache();
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it("should create cache with custom config", () => {
      cache = new EvidenceCache({ maxEntries: 100, ttlMs: 30000 });
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe("get() and set()", () => {
    it("should get and set entries", () => {
      cache = new EvidenceCache();
      const evidence = createMockEvidence("/src/foo.ts");

      cache.set("key1", evidence);
      const result = cache.get("key1");

      expect(result).toBeDefined();
      expect(result?.path).toBe("/src/foo.ts");
    });

    it("should return undefined for missing keys", () => {
      cache = new EvidenceCache();

      const result = cache.get("non-existent");

      expect(result).toBeUndefined();
    });

    it("should overwrite existing entries", () => {
      cache = new EvidenceCache();
      const evidence1 = createMockEvidence("/src/foo.ts", { tokens: 100 });
      const evidence2 = createMockEvidence("/src/foo.ts", { tokens: 200 });

      cache.set("key1", evidence1);
      cache.set("key1", evidence2);
      const result = cache.get("key1");

      expect(result?.tokens).toBe(200);
      expect(cache.getStats().size).toBe(1);
    });

    it("should store content hash", () => {
      cache = new EvidenceCache();
      const evidence = createMockEvidence("/src/foo.ts");

      cache.set("diff:/src/foo.ts:abc123", evidence, "abc123");
      const result = cache.get("diff:/src/foo.ts:abc123");

      expect(result).toBeDefined();
    });
  });

  describe("TTL expiration", () => {
    it("should respect TTL", () => {
      cache = new EvidenceCache({ ttlMs: 5000 }); // 5 seconds TTL
      const evidence = createMockEvidence("/src/foo.ts");

      cache.set("key1", evidence);
      expect(cache.get("key1")).toBeDefined();

      // Advance time past TTL
      vi.advanceTimersByTime(6000);

      const result = cache.get("key1");
      expect(result).toBeUndefined();
    });

    it("should return entry before TTL expires", () => {
      cache = new EvidenceCache({ ttlMs: 10000 });
      const evidence = createMockEvidence("/src/foo.ts");

      cache.set("key1", evidence);

      // Advance time but not past TTL
      vi.advanceTimersByTime(5000);

      expect(cache.get("key1")).toBeDefined();
    });

    it("should count expired entry as eviction", () => {
      cache = new EvidenceCache({ ttlMs: 5000 });
      cache.set("key1", createMockEvidence("/src/foo.ts"));

      vi.advanceTimersByTime(6000);
      cache.get("key1"); // Triggers TTL check and eviction

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });
  });

  describe("LRU eviction", () => {
    it("should evict LRU entries", () => {
      cache = new EvidenceCache({ maxEntries: 3 });

      cache.set("key1", createMockEvidence("/src/a.ts"));
      cache.set("key2", createMockEvidence("/src/b.ts"));
      cache.set("key3", createMockEvidence("/src/c.ts"));

      // Access key1 to make it recently used
      cache.get("key1");

      // Add new entry, should evict key2 (least recently used)
      cache.set("key4", createMockEvidence("/src/d.ts"));

      expect(cache.get("key1")).toBeDefined(); // Was accessed, kept
      expect(cache.get("key2")).toBeUndefined(); // LRU, evicted
      expect(cache.get("key3")).toBeDefined();
      expect(cache.get("key4")).toBeDefined();
    });

    it("should track eviction count", () => {
      cache = new EvidenceCache({ maxEntries: 2 });

      cache.set("key1", createMockEvidence("/src/a.ts"));
      cache.set("key2", createMockEvidence("/src/b.ts"));
      cache.set("key3", createMockEvidence("/src/c.ts")); // Evicts key1
      cache.set("key4", createMockEvidence("/src/d.ts")); // Evicts key2

      const stats = cache.getStats();
      expect(stats.evictions).toBe(2);
    });

    it("should move accessed entry to front of LRU", () => {
      cache = new EvidenceCache({ maxEntries: 3 });

      cache.set("key1", createMockEvidence("/src/a.ts"));
      cache.set("key2", createMockEvidence("/src/b.ts"));
      cache.set("key3", createMockEvidence("/src/c.ts"));

      // Access key1 multiple times
      cache.get("key1");
      cache.get("key1");

      // Add new entries
      cache.set("key4", createMockEvidence("/src/d.ts")); // Evicts key2
      cache.set("key5", createMockEvidence("/src/e.ts")); // Evicts key3

      expect(cache.get("key1")).toBeDefined(); // Still alive due to access
      expect(cache.get("key2")).toBeUndefined();
      expect(cache.get("key3")).toBeUndefined();
    });
  });

  describe("invalidateByPath()", () => {
    it("should invalidate by path", () => {
      cache = new EvidenceCache();

      cache.set("diff:/src/foo.ts:hash1", createMockEvidence("/src/foo.ts"));
      cache.set("lsp:/src/foo.ts:hash2", createMockEvidence("/src/foo.ts"));
      cache.set("diff:/src/bar.ts:hash3", createMockEvidence("/src/bar.ts"));

      const invalidated = cache.invalidateByPath("/src/foo.ts");

      expect(invalidated).toBe(2);
      expect(cache.get("diff:/src/foo.ts:hash1")).toBeUndefined();
      expect(cache.get("lsp:/src/foo.ts:hash2")).toBeUndefined();
      expect(cache.get("diff:/src/bar.ts:hash3")).toBeDefined();
    });

    it("should return 0 when path not found", () => {
      cache = new EvidenceCache();
      cache.set("key1", createMockEvidence("/src/foo.ts"));

      const invalidated = cache.invalidateByPath("/src/non-existent.ts");

      expect(invalidated).toBe(0);
    });
  });

  describe("invalidate()", () => {
    it("should invalidate by exact key", () => {
      cache = new EvidenceCache();
      cache.set("key1", createMockEvidence("/src/foo.ts"));
      cache.set("key2", createMockEvidence("/src/bar.ts"));

      const invalidated = cache.invalidate("key1");

      expect(invalidated).toBe(1);
      expect(cache.get("key1")).toBeUndefined();
      expect(cache.get("key2")).toBeDefined();
    });

    it("should invalidate by regex pattern", () => {
      cache = new EvidenceCache();
      cache.set("diff:/src/foo.ts", createMockEvidence("/src/foo.ts"));
      cache.set("diff:/src/bar.ts", createMockEvidence("/src/bar.ts"));
      cache.set("lsp:/src/foo.ts", createMockEvidence("/src/foo.ts"));

      const invalidated = cache.invalidate(/^diff:/);

      expect(invalidated).toBe(2);
      expect(cache.get("diff:/src/foo.ts")).toBeUndefined();
      expect(cache.get("diff:/src/bar.ts")).toBeUndefined();
      expect(cache.get("lsp:/src/foo.ts")).toBeDefined();
    });
  });

  describe("hit/miss stats", () => {
    it("should track hit/miss stats", () => {
      cache = new EvidenceCache();
      cache.set("key1", createMockEvidence("/src/foo.ts"));

      // 2 hits
      cache.get("key1");
      cache.get("key1");

      // 3 misses
      cache.get("missing1");
      cache.get("missing2");
      cache.get("missing3");

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(3);
      expect(stats.hitRate).toBe(0.4); // 2 / 5
    });

    it("should return 0 hit rate when no accesses", () => {
      cache = new EvidenceCache();
      cache.set("key1", createMockEvidence("/src/foo.ts"));

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe("has()", () => {
    it("should return true for existing non-expired entry", () => {
      cache = new EvidenceCache();
      cache.set("key1", createMockEvidence("/src/foo.ts"));

      expect(cache.has("key1")).toBe(true);
    });

    it("should return false for missing entry", () => {
      cache = new EvidenceCache();

      expect(cache.has("missing")).toBe(false);
    });

    it("should return false for expired entry", () => {
      cache = new EvidenceCache({ ttlMs: 5000 });
      cache.set("key1", createMockEvidence("/src/foo.ts"));

      vi.advanceTimersByTime(6000);

      expect(cache.has("key1")).toBe(false);
    });
  });

  describe("clear()", () => {
    it("should clear all entries", () => {
      cache = new EvidenceCache();
      cache.set("key1", createMockEvidence("/src/foo.ts"));
      cache.set("key2", createMockEvidence("/src/bar.ts"));

      cache.clear();

      expect(cache.getStats().size).toBe(0);
      expect(cache.get("key1")).toBeUndefined();
      expect(cache.get("key2")).toBeUndefined();
    });
  });
});
