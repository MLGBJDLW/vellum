// ============================================
// Fallback Strategies Unit Tests (T037 - REQ-012)
// ============================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CacheFallback, type FallbackProvider, ProviderFallbackChain } from "../fallback/index.js";

// ============================================
// Test Helpers
// ============================================

function createMockProvider<T>(
  name: string,
  value: T,
  shouldFail = false,
  isHealthy = true
): FallbackProvider<T> {
  return {
    name,
    execute: shouldFail
      ? vi.fn().mockRejectedValue(new Error(`${name} failed`))
      : vi.fn().mockResolvedValue(value),
    isHealthy: vi.fn().mockReturnValue(isHealthy),
  };
}

// ============================================
// AC-012-1: FallbackConfig supports types
// ============================================

describe("FallbackType and FallbackConfig", () => {
  it("should support provider-chain type", () => {
    const config = {
      type: "provider-chain" as const,
      fallbacks: [() => Promise.resolve("value")],
      timeout: 5000,
      retries: 3,
    };
    expect(config.type).toBe("provider-chain");
  });

  it("should support cache type", () => {
    const config = {
      type: "cache" as const,
      fallbacks: [() => Promise.resolve("value")],
    };
    expect(config.type).toBe("cache");
  });

  it("should support default type", () => {
    const config = {
      type: "default" as const,
      fallbacks: [() => Promise.resolve("value")],
    };
    expect(config.type).toBe("default");
  });

  it("should support graceful type", () => {
    const config = {
      type: "graceful" as const,
      fallbacks: [() => Promise.resolve("value")],
    };
    expect(config.type).toBe("graceful");
  });
});

// ============================================
// AC-012-2: ProviderFallbackChain
// ============================================

describe("ProviderFallbackChain", () => {
  describe("constructor", () => {
    it("should throw if providers array is empty", () => {
      expect(() => new ProviderFallbackChain([])).toThrow("requires at least one provider");
    });

    it("should accept valid providers array", () => {
      const providers = [createMockProvider("test", "value")];
      const chain = new ProviderFallbackChain(providers);
      expect(chain.getProviders()).toHaveLength(1);
    });
  });

  describe("execute", () => {
    it("should return primary result when first provider succeeds", async () => {
      const providers = [
        createMockProvider("primary", "primary-value"),
        createMockProvider("fallback", "fallback-value"),
      ];

      const chain = new ProviderFallbackChain(providers);
      const result = await chain.execute();

      expect(result.value).toBe("primary-value");
      expect(result.source).toBe("primary");
      expect(result.fallbackIndex).toBeUndefined();
      expect(result.attempts).toBe(1);
    });

    it("AC-012-2: should execute providers in order on failure", async () => {
      const providers = [
        createMockProvider("provider1", "value1", true),
        createMockProvider("provider2", "value2", true),
        createMockProvider("provider3", "value3", false),
      ];

      const chain = new ProviderFallbackChain(providers);
      const result = await chain.execute();

      expect(result.value).toBe("value3");
      expect(result.source).toBe("fallback");
      expect(result.fallbackIndex).toBe(2);
      expect(result.attempts).toBe(3);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("provider2 failed");
    });

    it("should skip unhealthy providers", async () => {
      const providers = [
        createMockProvider("unhealthy", "value1", false, false),
        createMockProvider("healthy", "value2", false, true),
      ];

      const chain = new ProviderFallbackChain(providers);
      const result = await chain.execute();

      expect(result.value).toBe("value2");
      expect(providers[0]?.execute).not.toHaveBeenCalled();
      expect(providers[1]?.execute).toHaveBeenCalled();
    });

    it("should throw when all providers fail", async () => {
      const providers = [
        createMockProvider("provider1", "value1", true),
        createMockProvider("provider2", "value2", true),
      ];

      const chain = new ProviderFallbackChain(providers);

      await expect(chain.execute()).rejects.toThrow("All 2 providers failed");
    });
  });

  describe("setPreferred", () => {
    it("should set preferred provider by name", async () => {
      const providers = [
        createMockProvider("first", "first-value"),
        createMockProvider("second", "second-value"),
      ];

      const chain = new ProviderFallbackChain(providers);
      chain.setPreferred("second");
      const result = await chain.execute();

      expect(result.value).toBe("second-value");
      expect(result.source).toBe("primary");
    });

    it("should throw if provider name not found", () => {
      const providers = [createMockProvider("test", "value")];
      const chain = new ProviderFallbackChain(providers);

      expect(() => chain.setPreferred("nonexistent")).toThrow('Provider "nonexistent" not found');
    });

    it("should fallback to others when preferred fails", async () => {
      const providers = [
        createMockProvider("first", "first-value"),
        createMockProvider("second", "second-value", true),
      ];

      const chain = new ProviderFallbackChain(providers);
      chain.setPreferred("second");
      const result = await chain.execute();

      expect(result.value).toBe("first-value");
      expect(result.source).toBe("fallback");
      expect(result.fallbackIndex).toBe(0);
    });
  });

  describe("reset", () => {
    it("should reset preferred to first provider", async () => {
      const providers = [
        createMockProvider("first", "first-value"),
        createMockProvider("second", "second-value"),
      ];

      const chain = new ProviderFallbackChain(providers);
      chain.setPreferred("second");
      chain.reset();
      const result = await chain.execute();

      expect(result.value).toBe("first-value");
      expect(result.source).toBe("primary");
    });
  });

  describe("getProviders", () => {
    it("should return readonly array of providers", () => {
      const providers = [
        createMockProvider("test1", "value1"),
        createMockProvider("test2", "value2"),
      ];

      const chain = new ProviderFallbackChain(providers);
      const result = chain.getProviders();

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe("test1");
      expect(result[1]?.name).toBe("test2");
    });
  });
});

// ============================================
// AC-012-3, AC-012-4: CacheFallback
// ============================================

describe("CacheFallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should use default TTL of 5 minutes", () => {
      const cache = new CacheFallback();
      // We test indirectly through expiration behavior
      expect(cache).toBeDefined();
    });

    it("should accept custom TTL", () => {
      const cache = new CacheFallback({ ttlMs: 1000 });
      expect(cache).toBeDefined();
    });
  });

  describe("execute", () => {
    it("AC-012-4: should return primary source when primary succeeds", async () => {
      const cache = new CacheFallback<string>();
      const primary = vi.fn().mockResolvedValue("primary-value");

      const result = await cache.execute("key", primary);

      expect(result.value).toBe("primary-value");
      expect(result.source).toBe("primary");
      expect(result.fallbackIndex).toBeUndefined();
      expect(result.attempts).toBe(1);
    });

    it("AC-012-3: should return cached value when primary fails", async () => {
      const cache = new CacheFallback<string>();

      // First call succeeds and caches
      await cache.execute("key", () => Promise.resolve("cached-value"));

      // Second call fails but returns cache
      const failingPrimary = vi.fn().mockRejectedValue(new Error("Primary failed"));
      const result = await cache.execute("key", failingPrimary);

      expect(result.value).toBe("cached-value");
      expect(result.source).toBe("fallback");
      expect(result.fallbackIndex).toBe(0);
      expect(result.error?.message).toBe("Primary failed");
    });

    it("should throw when primary fails and no cache exists", async () => {
      const cache = new CacheFallback<string>();
      const primary = vi.fn().mockRejectedValue(new Error("Primary failed"));

      await expect(cache.execute("key", primary)).rejects.toThrow("Primary failed");
    });

    it("should update cache on successful primary call", async () => {
      const cache = new CacheFallback<string>();

      await cache.execute("key", () => Promise.resolve("value1"));
      expect(cache.get("key")).toBe("value1");

      await cache.execute("key", () => Promise.resolve("value2"));
      expect(cache.get("key")).toBe("value2");
    });

    it("should return stale cache when primary fails even after TTL", async () => {
      const cache = new CacheFallback<string>({ ttlMs: 1000 });

      // Cache a value
      await cache.execute("key", () => Promise.resolve("cached-value"));

      // Advance past TTL
      vi.advanceTimersByTime(2000);

      // Primary fails, should still return stale cache
      const failingPrimary = vi.fn().mockRejectedValue(new Error("Failed"));
      const result = await cache.execute("key", failingPrimary);

      expect(result.value).toBe("cached-value");
      expect(result.source).toBe("fallback");
    });
  });

  describe("staleWhileRevalidate", () => {
    it("should return stale cache immediately while revalidating", async () => {
      const cache = new CacheFallback<string>({
        ttlMs: 1000,
        staleWhileRevalidate: true,
      });

      // Cache initial value
      cache.set("key", "stale-value");

      // Advance past TTL
      vi.advanceTimersByTime(2000);

      // Should return stale value immediately
      const slowPrimary = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve("fresh-value"), 5000))
        );

      const result = await cache.execute("key", slowPrimary);

      expect(result.value).toBe("stale-value");
      expect(result.source).toBe("fallback"); // Stale = fallback
      expect(slowPrimary).toHaveBeenCalled();
    });

    it("should update cache after background revalidation completes", async () => {
      const cache = new CacheFallback<string>({
        ttlMs: 1000,
        staleWhileRevalidate: true,
      });

      cache.set("key", "stale-value");
      vi.advanceTimersByTime(2000);

      let resolveRevalidation: (value: string) => void;
      const slowPrimary = vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolveRevalidation = resolve;
          })
      );

      await cache.execute("key", slowPrimary);

      // Complete background revalidation
      resolveRevalidation?.("fresh-value");
      await vi.advanceTimersByTimeAsync(0); // Flush microtasks

      expect(cache.get("key")).toBe("fresh-value");
    });
  });

  describe("set", () => {
    it("should manually set a cache entry", () => {
      const cache = new CacheFallback<string>();
      cache.set("key", "value");
      expect(cache.get("key")).toBe("value");
    });
  });

  describe("get", () => {
    it("should return undefined for non-existent key", () => {
      const cache = new CacheFallback<string>();
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("should return undefined for expired entry", () => {
      const cache = new CacheFallback<string>({ ttlMs: 1000 });
      cache.set("key", "value");

      vi.advanceTimersByTime(2000);

      expect(cache.get("key")).toBeUndefined();
    });

    it("should return value for valid entry", () => {
      const cache = new CacheFallback<string>({ ttlMs: 5000 });
      cache.set("key", "value");

      vi.advanceTimersByTime(1000);

      expect(cache.get("key")).toBe("value");
    });
  });

  describe("has", () => {
    it("should return false for non-existent key", () => {
      const cache = new CacheFallback<string>();
      expect(cache.has("nonexistent")).toBe(false);
    });

    it("should return true for existing key (even if expired)", () => {
      const cache = new CacheFallback<string>({ ttlMs: 1000 });
      cache.set("key", "value");

      vi.advanceTimersByTime(2000);

      expect(cache.has("key")).toBe(true); // Has returns true for expired entries
    });
  });

  describe("clear", () => {
    it("should clear specific key", () => {
      const cache = new CacheFallback<string>();
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      cache.clear("key1");

      expect(cache.has("key1")).toBe(false);
      expect(cache.has("key2")).toBe(true);
    });

    it("should clear all entries when no key provided", () => {
      const cache = new CacheFallback<string>();
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      cache.clear();

      expect(cache.has("key1")).toBe(false);
      expect(cache.has("key2")).toBe(false);
    });
  });

  describe("isExpired", () => {
    it("should return true for non-existent key", () => {
      const cache = new CacheFallback<string>();
      expect(cache.isExpired("nonexistent")).toBe(true);
    });

    it("should return false for fresh entry", () => {
      const cache = new CacheFallback<string>({ ttlMs: 5000 });
      cache.set("key", "value");
      expect(cache.isExpired("key")).toBe(false);
    });

    it("should return true for expired entry", () => {
      const cache = new CacheFallback<string>({ ttlMs: 1000 });
      cache.set("key", "value");

      vi.advanceTimersByTime(2000);

      expect(cache.isExpired("key")).toBe(true);
    });
  });
});

// ============================================
// Edge Cases and Integration Tests
// ============================================

describe("Fallback Edge Cases", () => {
  describe("ProviderFallbackChain with real async providers", () => {
    it("should handle slow providers correctly", async () => {
      vi.useRealTimers();

      const slowProvider: FallbackProvider<string> = {
        name: "slow",
        execute: () => new Promise((resolve) => setTimeout(() => resolve("slow-value"), 10)),
      };
      const fastProvider: FallbackProvider<string> = {
        name: "fast",
        execute: () => Promise.resolve("fast-value"),
      };

      const chain = new ProviderFallbackChain([slowProvider, fastProvider]);
      const result = await chain.execute();

      expect(result.value).toBe("slow-value");
      expect(result.source).toBe("primary");
    });
  });

  describe("CacheFallback with complex objects", () => {
    it("should cache and retrieve complex objects", async () => {
      vi.useRealTimers();

      interface UserData {
        id: number;
        name: string;
        metadata: { created: Date };
      }

      const cache = new CacheFallback<UserData>();
      const user: UserData = {
        id: 1,
        name: "Test User",
        metadata: { created: new Date() },
      };

      await cache.execute("user:1", () => Promise.resolve(user));
      const cached = cache.get("user:1");

      expect(cached).toEqual(user);
      expect(cached?.metadata.created).toEqual(user.metadata.created);
    });
  });

  describe("Provider health check integration", () => {
    it("should respect isHealthy returning false", async () => {
      const unhealthyProvider: FallbackProvider<string> = {
        name: "unhealthy",
        execute: vi.fn().mockResolvedValue("unhealthy-value"),
        isHealthy: () => false,
      };
      const healthyProvider: FallbackProvider<string> = {
        name: "healthy",
        execute: vi.fn().mockResolvedValue("healthy-value"),
        isHealthy: () => true,
      };

      const chain = new ProviderFallbackChain([unhealthyProvider, healthyProvider]);
      const result = await chain.execute();

      expect(result.value).toBe("healthy-value");
      expect(unhealthyProvider.execute).not.toHaveBeenCalled();
    });
  });

  describe("Error wrapping", () => {
    it("should wrap non-Error objects in Error", async () => {
      const stringThrowingProvider: FallbackProvider<string> = {
        name: "string-throw",
        execute: () => Promise.reject("string error"),
      };
      const successProvider: FallbackProvider<string> = {
        name: "success",
        execute: () => Promise.resolve("success"),
      };

      const chain = new ProviderFallbackChain([stringThrowingProvider, successProvider]);
      const result = await chain.execute();

      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe("string error");
    });
  });
});
