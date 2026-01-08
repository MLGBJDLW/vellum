// ============================================
// Token Bucket Tests - Phase 34
// ============================================

import { afterEach, describe, expect, it } from "vitest";
import { TokenBucket } from "../token-bucket.js";
import type { TokenBucketConfig } from "../types.js";

// =============================================================================
// Test Helpers
// =============================================================================

function createBucket(config: Partial<TokenBucketConfig> = {}): TokenBucket {
  return new TokenBucket({
    capacity: 10,
    refillRate: 10, // 10 tokens per second
    refillInterval: 100,
    ...config,
  });
}

// =============================================================================
// TokenBucket Tests
// =============================================================================

describe("TokenBucket", () => {
  let bucket: TokenBucket;

  afterEach(() => {
    bucket?.dispose();
  });

  describe("constructor", () => {
    it("should create bucket with default capacity", () => {
      bucket = createBucket({ capacity: 100 });

      expect(bucket.capacity).toBe(100);
      expect(bucket.getAvailableTokens()).toBe(100);
    });

    it("should create bucket with custom initial tokens", () => {
      bucket = createBucket({ capacity: 100, initialTokens: 50 });

      expect(bucket.capacity).toBe(100);
      expect(bucket.getAvailableTokens()).toBe(50);
    });

    it("should throw if capacity is not positive", () => {
      expect(() => createBucket({ capacity: 0 })).toThrow("capacity must be positive");
    });

    it("should throw if refillRate is not positive", () => {
      expect(() => createBucket({ refillRate: 0 })).toThrow("refillRate must be positive");
    });
  });

  describe("tryConsume", () => {
    it("should consume tokens when available", () => {
      bucket = createBucket({ capacity: 10 });

      expect(bucket.tryConsume(5)).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(5);
    });

    it("should fail when not enough tokens", () => {
      bucket = createBucket({ capacity: 10 });

      expect(bucket.tryConsume(15)).toBe(false);
      expect(bucket.getAvailableTokens()).toBe(10);
    });

    it("should consume default 1 token", () => {
      bucket = createBucket({ capacity: 10 });

      expect(bucket.tryConsume()).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(9);
    });

    it("should handle zero token request", () => {
      bucket = createBucket({ capacity: 10 });

      expect(bucket.tryConsume(0)).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(10);
    });

    it("should track total consumed", () => {
      bucket = createBucket({ capacity: 10 });

      bucket.tryConsume(3);
      bucket.tryConsume(2);

      const state = bucket.getState();
      expect(state.totalConsumed).toBe(5);
    });
  });

  describe("getAvailableTokens", () => {
    it("should return current token count", () => {
      bucket = createBucket({ capacity: 50 });

      expect(bucket.getAvailableTokens()).toBe(50);
    });

    it("should refill tokens over time", async () => {
      bucket = createBucket({
        capacity: 10,
        refillRate: 100, // 100 tokens per second
        initialTokens: 0,
      });

      expect(bucket.getAvailableTokens()).toBe(0);

      // Wait 50ms - should refill ~5 tokens (100/sec * 0.05s)
      await new Promise((resolve) => setTimeout(resolve, 50));

      const tokens = bucket.getAvailableTokens();
      expect(tokens).toBeGreaterThanOrEqual(3);
      expect(tokens).toBeLessThanOrEqual(10);
    });
  });

  describe("waitForTokens", () => {
    it("should return immediately when tokens available", async () => {
      bucket = createBucket({ capacity: 10 });

      await bucket.waitForTokens(5);

      expect(bucket.getAvailableTokens()).toBe(5);
    });

    it("should wait for tokens when not immediately available", async () => {
      bucket = createBucket({
        capacity: 10,
        refillRate: 100, // Fast refill for test
        initialTokens: 0,
      });

      const start = Date.now();
      await bucket.waitForTokens(5);
      const elapsed = Date.now() - start;

      // Should have waited ~50ms for 5 tokens at 100/sec
      expect(elapsed).toBeGreaterThanOrEqual(30);
      expect(elapsed).toBeLessThan(200);
    });

    it("should throw if tokens exceed capacity", async () => {
      bucket = createBucket({ capacity: 10 });

      await expect(bucket.waitForTokens(20)).rejects.toThrow("exceeds bucket capacity");
    });

    it("should support AbortSignal cancellation", async () => {
      bucket = createBucket({
        capacity: 10,
        refillRate: 0.1, // Very slow
        initialTokens: 0,
      });

      const controller = new AbortController();

      const promise = bucket.waitForTokens(5, controller.signal);

      // Abort after starting
      setTimeout(() => controller.abort(), 10);

      await expect(promise).rejects.toThrow("aborted");
    });

    it("should reject if already aborted", async () => {
      bucket = createBucket({ capacity: 10, initialTokens: 0 });

      const controller = new AbortController();
      controller.abort();

      await expect(bucket.waitForTokens(5, controller.signal)).rejects.toThrow("aborted");
    });
  });

  describe("calculateWaitTime", () => {
    it("should return 0 when tokens available", () => {
      bucket = createBucket({ capacity: 10 });

      expect(bucket.calculateWaitTime(5)).toBe(0);
    });

    it("should calculate correct wait time", () => {
      bucket = createBucket({
        capacity: 10,
        refillRate: 10, // 10 tokens per second
        initialTokens: 5,
      });

      // Need 5 more tokens at 10/sec = 500ms
      const waitTime = bucket.calculateWaitTime(10);
      expect(waitTime).toBeGreaterThanOrEqual(400);
      expect(waitTime).toBeLessThanOrEqual(600);
    });
  });

  describe("getState", () => {
    it("should return current state", () => {
      bucket = createBucket({ capacity: 10 });
      bucket.tryConsume(3);

      const state = bucket.getState();

      expect(state.tokens).toBe(7);
      expect(state.totalConsumed).toBe(3);
      expect(state.totalWaited).toBe(0);
      expect(state.lastRefillTime).toBeGreaterThan(0);
    });
  });

  describe("cleanup", () => {
    it("should not throw when called on active bucket", () => {
      bucket = createBucket({ capacity: 10 });
      bucket.tryConsume(5);

      // Should not throw
      expect(() => bucket.cleanup()).not.toThrow();
    });

    it("should allow continued usage after cleanup", () => {
      bucket = createBucket({ capacity: 10 });
      bucket.tryConsume(5);
      bucket.cleanup();

      // Should still work
      expect(bucket.tryConsume(1)).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(4);
    });
  });

  describe("dispose", () => {
    it("should prevent further operations after dispose", () => {
      bucket = createBucket({ capacity: 10 });
      bucket.dispose();

      expect(bucket.isDisposed).toBe(true);
      expect(() => bucket.tryConsume(1)).toThrow("disposed");
    });

    it("should be idempotent", () => {
      bucket = createBucket({ capacity: 10 });

      bucket.dispose();
      bucket.dispose();
      bucket.dispose();

      expect(bucket.isDisposed).toBe(true);
    });

    it("should reject pending requests", async () => {
      bucket = createBucket({
        capacity: 10,
        refillRate: 0.01, // Very slow
        initialTokens: 0,
      });

      const promise = bucket.waitForTokens(5);

      // Dispose while waiting
      setTimeout(() => bucket.dispose(), 10);

      await expect(promise).rejects.toThrow("disposed");
    });
  });

  describe("edge cases", () => {
    it("should handle rapid consecutive calls", () => {
      bucket = createBucket({ capacity: 100 });

      for (let i = 0; i < 100; i++) {
        bucket.tryConsume(1);
      }

      expect(bucket.getAvailableTokens()).toBe(0);
      expect(bucket.getState().totalConsumed).toBe(100);
    });

    it("should not exceed capacity during refill", async () => {
      bucket = createBucket({
        capacity: 10,
        refillRate: 1000, // Very fast refill
        initialTokens: 10,
      });

      // Wait for potential over-refill
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(bucket.getAvailableTokens()).toBeLessThanOrEqual(10);
    });
  });
});
