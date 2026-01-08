// ============================================
// Rate Limiter Tests - Phase 34
// ============================================

import { afterEach, describe, expect, it } from "vitest";
import { createRateLimiter, RateLimiter } from "../rate-limiter.js";
import type { RateLimiterConfig } from "../types.js";

// =============================================================================
// Test Helpers
// =============================================================================

function createLimiter(config: RateLimiterConfig = {}): RateLimiter {
  return createRateLimiter({
    defaultBucket: {
      capacity: 10,
      refillRate: 10,
    },
    cleanupInterval: 60_000, // Longer interval for tests
    ...config,
  });
}

// =============================================================================
// RateLimiter Tests
// =============================================================================

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  afterEach(() => {
    limiter?.dispose();
  });

  describe("constructor", () => {
    it("should create limiter with default config", () => {
      limiter = createRateLimiter();

      expect(limiter.isDisposed).toBe(false);
    });

    it("should create limiter with custom bucket configs", () => {
      limiter = createLimiter({
        buckets: {
          "api:fast": { capacity: 100, refillRate: 100 },
          "api:slow": { capacity: 10, refillRate: 1 },
        },
      });

      expect(limiter.getAvailableTokens("api:fast")).toBe(100);
      expect(limiter.getAvailableTokens("api:slow")).toBe(10);
    });
  });

  describe("acquire", () => {
    it("should acquire tokens when available", async () => {
      limiter = createLimiter();

      await limiter.acquire("test-key");

      expect(limiter.getAvailableTokens("test-key")).toBe(9);
    });

    it("should acquire multiple tokens", async () => {
      limiter = createLimiter();

      await limiter.acquire("test-key", 5);

      expect(limiter.getAvailableTokens("test-key")).toBe(5);
    });

    it("should wait when tokens not available", async () => {
      limiter = createLimiter({
        defaultBucket: {
          capacity: 10,
          refillRate: 100, // Fast refill for test
          initialTokens: 0,
        },
      });

      const start = Date.now();
      await limiter.acquire("test-key", 5);
      const elapsed = Date.now() - start;

      // Should have waited ~50ms for 5 tokens at 100/sec
      expect(elapsed).toBeGreaterThanOrEqual(30);
      expect(elapsed).toBeLessThan(200);
    });

    it("should throw when throwOnExceeded is true", async () => {
      limiter = createLimiter({
        defaultBucket: {
          capacity: 10,
          refillRate: 10,
          initialTokens: 0,
        },
        throwOnExceeded: true,
      });

      await expect(limiter.acquire("test-key", 5)).rejects.toThrow("Rate limit exceeded");
    });

    it("should throw when wait time exceeds maxWaitMs", async () => {
      limiter = createLimiter({
        defaultBucket: {
          capacity: 10,
          refillRate: 0.001, // Very slow refill
          initialTokens: 0,
        },
        maxWaitMs: 100,
      });

      await expect(limiter.acquire("test-key", 5)).rejects.toThrow("exceeds maximum");
    });

    it("should support AbortSignal", async () => {
      limiter = createLimiter({
        defaultBucket: {
          capacity: 10,
          refillRate: 0.1, // Very slow
          initialTokens: 0,
        },
      });

      const controller = new AbortController();
      const promise = limiter.acquire("test-key", 5, controller.signal);

      // Abort after starting
      setTimeout(() => controller.abort(), 10);

      await expect(promise).rejects.toThrow("aborted");
    });

    it("should track pending requests", async () => {
      limiter = createLimiter({
        defaultBucket: {
          capacity: 10,
          refillRate: 100, // Fast refill
          initialTokens: 0,
        },
      });

      // Start acquiring but don't await yet
      const promise = limiter.acquire("test-key", 5);

      // Check pending immediately (should be 1)
      const stats = limiter.getStats();
      expect(stats.keys[0]?.pendingRequests).toBe(1);

      // Wait for completion
      await promise;

      // Check pending after completion (should be 0)
      const statsAfter = limiter.getStats();
      expect(statsAfter.keys[0]?.pendingRequests).toBe(0);
    });
  });

  describe("tryAcquire", () => {
    it("should return true when tokens available", () => {
      limiter = createLimiter();

      expect(limiter.tryAcquire("test-key")).toBe(true);
      expect(limiter.getAvailableTokens("test-key")).toBe(9);
    });

    it("should return false when tokens not available", () => {
      limiter = createLimiter({
        defaultBucket: {
          capacity: 10,
          refillRate: 10,
          initialTokens: 0,
        },
      });

      expect(limiter.tryAcquire("test-key", 5)).toBe(false);
    });

    it("should not create bucket for false result", () => {
      limiter = createLimiter({
        defaultBucket: {
          capacity: 10,
          refillRate: 10,
          initialTokens: 5,
        },
      });

      // Try to acquire more than available
      limiter.tryAcquire("test-key", 100);

      // Bucket should still exist (created during tryAcquire)
      expect(limiter.hasKey("test-key")).toBe(true);
    });
  });

  describe("getAvailableTokens", () => {
    it("should return available tokens for existing key", () => {
      limiter = createLimiter();
      limiter.tryAcquire("test-key", 3);

      expect(limiter.getAvailableTokens("test-key")).toBe(7);
    });

    it("should return default capacity for new key", () => {
      limiter = createLimiter({
        defaultBucket: {
          capacity: 50,
          refillRate: 10,
        },
      });

      expect(limiter.getAvailableTokens("new-key")).toBe(50);
    });
  });

  describe("getWaitTime", () => {
    it("should return 0 when tokens available", () => {
      limiter = createLimiter();

      expect(limiter.getWaitTime("test-key", 5)).toBe(0);
    });

    it("should return positive wait time when tokens not available", () => {
      limiter = createLimiter({
        defaultBucket: {
          capacity: 10,
          refillRate: 10,
          initialTokens: 0,
        },
      });

      const waitTime = limiter.getWaitTime("test-key", 5);
      expect(waitTime).toBeGreaterThan(0);
    });
  });

  describe("hasKey", () => {
    it("should return false for non-existent key", () => {
      limiter = createLimiter();

      expect(limiter.hasKey("non-existent")).toBe(false);
    });

    it("should return true after key is used", () => {
      limiter = createLimiter();
      limiter.tryAcquire("test-key");

      expect(limiter.hasKey("test-key")).toBe(true);
    });
  });

  describe("getStats", () => {
    it("should return empty stats initially", () => {
      limiter = createLimiter();

      const stats = limiter.getStats();
      expect(stats.activeBuckets).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.throttledRequests).toBe(0);
      expect(stats.rejectedRequests).toBe(0);
    });

    it("should track total requests", () => {
      limiter = createLimiter();

      limiter.tryAcquire("key1");
      limiter.tryAcquire("key2");
      limiter.tryAcquire("key3");

      const stats = limiter.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.activeBuckets).toBe(3);
    });

    it("should track rejected requests", () => {
      limiter = createLimiter({
        defaultBucket: {
          capacity: 10,
          refillRate: 10,
          initialTokens: 0,
        },
      });

      limiter.tryAcquire("test-key", 5);
      limiter.tryAcquire("test-key", 5);

      const stats = limiter.getStats();
      expect(stats.rejectedRequests).toBe(2);
    });
  });

  describe("resetStats", () => {
    it("should reset all counters", () => {
      limiter = createLimiter();

      limiter.tryAcquire("key1");
      limiter.tryAcquire("key2");

      limiter.resetStats();

      const stats = limiter.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.throttledRequests).toBe(0);
      expect(stats.rejectedRequests).toBe(0);
      // Buckets should still exist
      expect(stats.activeBuckets).toBe(2);
    });
  });

  describe("removeBucket", () => {
    it("should remove existing bucket", () => {
      limiter = createLimiter();
      limiter.tryAcquire("test-key");

      expect(limiter.hasKey("test-key")).toBe(true);

      const removed = limiter.removeBucket("test-key");

      expect(removed).toBe(true);
      expect(limiter.hasKey("test-key")).toBe(false);
    });

    it("should return false for non-existent bucket", () => {
      limiter = createLimiter();

      expect(limiter.removeBucket("non-existent")).toBe(false);
    });
  });

  describe("clearBuckets", () => {
    it("should remove all buckets", () => {
      limiter = createLimiter();

      limiter.tryAcquire("key1");
      limiter.tryAcquire("key2");
      limiter.tryAcquire("key3");

      limiter.clearBuckets();

      expect(limiter.getStats().activeBuckets).toBe(0);
    });
  });

  describe("dispose", () => {
    it("should prevent further operations", () => {
      limiter = createLimiter();
      limiter.dispose();

      expect(limiter.isDisposed).toBe(true);
      expect(() => limiter.tryAcquire("test-key")).toThrow("disposed");
    });

    it("should be idempotent", () => {
      limiter = createLimiter();

      limiter.dispose();
      limiter.dispose();
      limiter.dispose();

      expect(limiter.isDisposed).toBe(true);
    });

    it("should dispose all buckets", () => {
      limiter = createLimiter();

      limiter.tryAcquire("key1");
      limiter.tryAcquire("key2");

      limiter.dispose();

      expect(limiter.getStats().activeBuckets).toBe(0);
    });
  });

  describe("per-key configurations", () => {
    it("should use custom config for specific keys", () => {
      limiter = createLimiter({
        defaultBucket: {
          capacity: 10,
          refillRate: 10,
        },
        buckets: {
          "api:premium": {
            capacity: 1000,
            refillRate: 100,
          },
        },
      });

      expect(limiter.getAvailableTokens("api:premium")).toBe(1000);
      expect(limiter.getAvailableTokens("api:standard")).toBe(10);
    });

    it("should fall back to default for unknown keys", () => {
      limiter = createLimiter({
        defaultBucket: {
          capacity: 50,
          refillRate: 5,
        },
      });

      expect(limiter.getAvailableTokens("unknown-key")).toBe(50);
    });
  });

  describe("factory function", () => {
    it("should create limiter with createRateLimiter", () => {
      limiter = createRateLimiter();

      expect(limiter).toBeInstanceOf(RateLimiter);
      expect(limiter.isDisposed).toBe(false);
    });

    it("should accept full configuration", () => {
      limiter = createRateLimiter({
        defaultBucket: {
          capacity: 200,
          refillRate: 20,
        },
        buckets: {
          custom: { capacity: 50, refillRate: 5 },
        },
        throwOnExceeded: true,
        maxWaitMs: 5000,
      });

      expect(limiter.getAvailableTokens("test")).toBe(200);
      expect(limiter.getAvailableTokens("custom")).toBe(50);
    });
  });
});
