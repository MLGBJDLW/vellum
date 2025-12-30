import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCacheKey, isCacheable, ResponseCache } from "../response-cache.js";

describe("ResponseCache", () => {
  let cache: ResponseCache<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new ResponseCache<string>({
      maxEntries: 3,
      defaultTtlMs: 1000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================================
  // 1. Basic Operations
  // ============================================================
  describe("Basic Operations", () => {
    it("get() returns undefined for missing key", () => {
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("set() then get() returns value", () => {
      cache.set("key1", "value1");
      expect(cache.get("key1")).toBe("value1");
    });

    it("has() returns true for existing key", () => {
      cache.set("key1", "value1");
      expect(cache.has("key1")).toBe(true);
    });

    it("has() returns false for missing key", () => {
      expect(cache.has("nonexistent")).toBe(false);
    });

    it("delete() removes entry", () => {
      cache.set("key1", "value1");
      expect(cache.delete("key1")).toBe(true);
      expect(cache.get("key1")).toBeUndefined();
    });

    it("delete() returns false for non-existent key", () => {
      expect(cache.delete("nonexistent")).toBe(false);
    });

    it("clear() removes all entries", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.clear();
      expect(cache.get("key1")).toBeUndefined();
      expect(cache.get("key2")).toBeUndefined();
      expect(cache.getStats().entries).toBe(0);
    });
  });

  // ============================================================
  // 2. TTL Expiration
  // ============================================================
  describe("TTL Expiration", () => {
    it("expired entries return undefined on get()", () => {
      cache.set("key1", "value1");
      vi.advanceTimersByTime(1001); // Past default TTL
      expect(cache.get("key1")).toBeUndefined();
    });

    it("non-expired entries return value on get()", () => {
      cache.set("key1", "value1");
      vi.advanceTimersByTime(500); // Still valid
      expect(cache.get("key1")).toBe("value1");
    });

    it("expired entries return false on has()", () => {
      cache.set("key1", "value1");
      vi.advanceTimersByTime(1001);
      expect(cache.has("key1")).toBe(false);
    });

    it("evictExpired() removes all expired entries", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      vi.advanceTimersByTime(1001);
      cache.set("key3", "value3"); // Not expired
      const evicted = cache.evictExpired();
      expect(evicted).toBe(2);
      expect(cache.get("key1")).toBeUndefined();
      expect(cache.get("key2")).toBeUndefined();
      expect(cache.get("key3")).toBe("value3");
    });

    it("custom TTL per entry works", () => {
      cache.set("short", "short-lived", { ttlMs: 500 });
      cache.set("long", "long-lived", { ttlMs: 2000 });

      vi.advanceTimersByTime(600);
      expect(cache.get("short")).toBeUndefined();
      expect(cache.get("long")).toBe("long-lived");

      vi.advanceTimersByTime(1500);
      expect(cache.get("long")).toBeUndefined();
    });
  });

  // ============================================================
  // 3. LRU Eviction
  // ============================================================
  describe("LRU Eviction", () => {
    it("when at maxEntries, LRU entry is evicted", () => {
      cache.set("key1", "value1");
      vi.advanceTimersByTime(10);
      cache.set("key2", "value2");
      vi.advanceTimersByTime(10);
      cache.set("key3", "value3");
      vi.advanceTimersByTime(10);

      // Adding 4th entry should evict key1 (oldest)
      cache.set("key4", "value4");

      expect(cache.get("key1")).toBeUndefined();
      expect(cache.get("key2")).toBe("value2");
      expect(cache.get("key3")).toBe("value3");
      expect(cache.get("key4")).toBe("value4");
    });

    it("access via get() updates lastAccessed", () => {
      cache.set("key1", "value1");
      vi.advanceTimersByTime(10);
      cache.set("key2", "value2");
      vi.advanceTimersByTime(10);
      cache.set("key3", "value3");
      vi.advanceTimersByTime(10);

      // Access key1, making it most recently accessed
      cache.get("key1");
      vi.advanceTimersByTime(10);

      // Adding key4 should now evict key2 (now oldest)
      cache.set("key4", "value4");

      expect(cache.get("key1")).toBe("value1");
      expect(cache.get("key2")).toBeUndefined();
      expect(cache.get("key3")).toBe("value3");
      expect(cache.get("key4")).toBe("value4");
    });

    it("most recently accessed survives eviction", () => {
      cache.set("key1", "value1");
      vi.advanceTimersByTime(10);
      cache.set("key2", "value2");
      vi.advanceTimersByTime(10);
      cache.set("key3", "value3");
      vi.advanceTimersByTime(10);

      // Access all in reverse order to make key3 oldest
      cache.get("key3");
      vi.advanceTimersByTime(10);
      cache.get("key2");
      vi.advanceTimersByTime(10);
      cache.get("key1");
      vi.advanceTimersByTime(10);

      // Now key3 is oldest, should be evicted
      cache.set("key4", "value4");

      expect(cache.get("key3")).toBeUndefined();
      expect(cache.get("key1")).toBe("value1");
      expect(cache.get("key2")).toBe("value2");
      expect(cache.get("key4")).toBe("value4");
    });

    it("replacing existing key does not trigger eviction", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.set("key3", "value3");

      // Replace existing key, should not evict anything
      cache.set("key2", "newValue2");

      expect(cache.get("key1")).toBe("value1");
      expect(cache.get("key2")).toBe("newValue2");
      expect(cache.get("key3")).toBe("value3");
      expect(cache.getStats().entries).toBe(3);
    });
  });

  // ============================================================
  // 4. Size Tracking
  // ============================================================
  describe("Size Tracking", () => {
    it("size increases on set()", () => {
      const initialSize = cache.getStats().size;
      cache.set("key1", "value1", { size: 100 });
      expect(cache.getStats().size).toBe(initialSize + 100);
    });

    it("size decreases on delete()", () => {
      cache.set("key1", "value1", { size: 100 });
      const sizeAfterSet = cache.getStats().size;
      cache.delete("key1");
      expect(cache.getStats().size).toBe(sizeAfterSet - 100);
    });

    it("size resets on clear()", () => {
      cache.set("key1", "value1", { size: 100 });
      cache.set("key2", "value2", { size: 200 });
      cache.clear();
      expect(cache.getStats().size).toBe(0);
    });

    it("replacement updates size correctly", () => {
      cache.set("key1", "value1", { size: 100 });
      expect(cache.getStats().size).toBe(100);
      cache.set("key1", "newValue1", { size: 150 });
      expect(cache.getStats().size).toBe(150);
    });

    it("estimates size for strings", () => {
      // "test" = 4 chars * 2 bytes = 8
      cache.set("key", "test");
      expect(cache.getStats().size).toBe(8);
    });

    it("estimates size for objects", () => {
      const objCache = new ResponseCache<object>({
        maxEntries: 10,
        defaultTtlMs: 1000,
      });
      // Object gets JSON stringified
      objCache.set("key", { a: 1 });
      expect(objCache.getStats().size).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // 5. Statistics
  // ============================================================
  describe("Statistics", () => {
    it("hits increment on cache hit", () => {
      cache.set("key1", "value1");
      expect(cache.getStats().hits).toBe(0);
      cache.get("key1");
      expect(cache.getStats().hits).toBe(1);
      cache.get("key1");
      expect(cache.getStats().hits).toBe(2);
    });

    it("misses increment on cache miss", () => {
      expect(cache.getStats().misses).toBe(0);
      cache.get("nonexistent");
      expect(cache.getStats().misses).toBe(1);
      cache.get("alsoMissing");
      expect(cache.getStats().misses).toBe(2);
    });

    it("misses increment when entry is expired", () => {
      cache.set("key1", "value1");
      vi.advanceTimersByTime(1001);
      cache.get("key1");
      expect(cache.getStats().misses).toBe(1);
    });

    it("evictions tracked on LRU eviction", () => {
      expect(cache.getStats().evictions).toBe(0);
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.set("key3", "value3");
      cache.set("key4", "value4"); // Should evict key1
      expect(cache.getStats().evictions).toBe(1);
    });

    it("evictions tracked on evictExpired()", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      vi.advanceTimersByTime(1001);
      cache.evictExpired();
      expect(cache.getStats().evictions).toBe(2);
    });

    it("getStats() returns copy (not reference)", () => {
      cache.set("key1", "value1");
      const stats1 = cache.getStats();
      cache.get("key1");
      const stats2 = cache.getStats();

      // stats1 should not have been mutated
      expect(stats1.hits).toBe(0);
      expect(stats2.hits).toBe(1);
    });

    it("entries count is accurate", () => {
      expect(cache.getStats().entries).toBe(0);
      cache.set("key1", "value1");
      expect(cache.getStats().entries).toBe(1);
      cache.set("key2", "value2");
      expect(cache.getStats().entries).toBe(2);
      cache.delete("key1");
      expect(cache.getStats().entries).toBe(1);
    });
  });

  // ============================================================
  // 6. Max Size Eviction
  // ============================================================
  describe("Max Size Eviction", () => {
    it("evicts entries when maxSize would be exceeded", () => {
      const sizedCache = new ResponseCache<string>({
        maxEntries: 10,
        defaultTtlMs: 1000,
        maxSize: 100,
      });

      sizedCache.set("key1", "value1", { size: 50 });
      vi.advanceTimersByTime(10);
      sizedCache.set("key2", "value2", { size: 40 });
      vi.advanceTimersByTime(10);

      // This should evict key1 to make room
      sizedCache.set("key3", "value3", { size: 50 });

      expect(sizedCache.get("key1")).toBeUndefined();
      expect(sizedCache.get("key2")).toBe("value2");
      expect(sizedCache.get("key3")).toBe("value3");
    });
  });
});

// ============================================================
// Helper Functions Tests
// ============================================================
describe("createCacheKey", () => {
  it("normalizes URLs to lowercase", () => {
    expect(createCacheKey("HTTP://EXAMPLE.COM/Path")).toBe("http://example.com/path");
  });

  it("returns base URL when no params", () => {
    expect(createCacheKey("http://example.com")).toBe("http://example.com");
  });

  it("returns base URL when params is empty object", () => {
    expect(createCacheKey("http://example.com", {})).toBe("http://example.com");
  });

  it("sorts params alphabetically", () => {
    const result = createCacheKey("http://example.com", {
      z: "1",
      a: "2",
      m: "3",
    });
    expect(result).toBe("http://example.com?a=2&m=3&z=1");
  });

  it("produces same key for same params in different order", () => {
    const key1 = createCacheKey("http://example.com", { b: "2", a: "1" });
    const key2 = createCacheKey("http://example.com", { a: "1", b: "2" });
    expect(key1).toBe(key2);
  });
});

describe("isCacheable", () => {
  it("returns true for GET request", () => {
    expect(isCacheable("GET")).toBe(true);
  });

  it("returns true for lowercase get request", () => {
    expect(isCacheable("get")).toBe(true);
  });

  it("returns false for POST request", () => {
    expect(isCacheable("POST")).toBe(false);
  });

  it("returns false for PUT request", () => {
    expect(isCacheable("PUT")).toBe(false);
  });

  it("returns false for DELETE request", () => {
    expect(isCacheable("DELETE")).toBe(false);
  });

  it("returns false for PATCH request", () => {
    expect(isCacheable("PATCH")).toBe(false);
  });

  it("returns true for GET without headers", () => {
    expect(isCacheable("GET", undefined)).toBe(true);
  });

  it("respects cache-control: no-store", () => {
    expect(isCacheable("GET", { "cache-control": "no-store" })).toBe(false);
  });

  it("respects cache-control: no-store with other directives", () => {
    expect(isCacheable("GET", { "cache-control": "max-age=0, no-store" })).toBe(false);
  });

  it("allows caching with other cache-control directives", () => {
    expect(isCacheable("GET", { "cache-control": "max-age=3600" })).toBe(true);
  });

  it("allows caching with no-cache (revalidation, not no-store)", () => {
    expect(isCacheable("GET", { "cache-control": "no-cache" })).toBe(true);
  });

  it("handles mixed case cache-control", () => {
    expect(isCacheable("GET", { "cache-control": "No-Store" })).toBe(false);
  });
});
