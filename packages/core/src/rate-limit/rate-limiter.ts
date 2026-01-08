// ============================================
// Rate Limiter Service - Phase 34
// ============================================

import { RateLimitError } from "../errors/web.js";

import { TokenBucket } from "./token-bucket.js";
import {
  DEFAULT_BUCKET_CONFIG,
  DEFAULT_RATE_LIMITER_CONFIG,
  type RateLimiterConfig,
  type RateLimiterKeyState,
  type RateLimiterStats,
  type TokenBucketConfig,
} from "./types.js";

// =============================================================================
// Internal Bucket State
// =============================================================================

interface BucketEntry {
  bucket: TokenBucket;
  createdAt: number;
  lastAccessedAt: number;
  pendingRequests: number;
}

// =============================================================================
// RateLimiter Class
// =============================================================================

/**
 * Rate limiter service managing multiple token buckets.
 *
 * Features:
 * - Per-key rate limiting (e.g., per-endpoint, per-provider)
 * - Configurable bucket defaults and overrides
 * - Async acquire with wait or throw
 * - Immediate try-acquire
 * - Automatic stale bucket cleanup
 * - Monitoring and statistics
 *
 * @example
 * ```typescript
 * const limiter = createRateLimiter({
 *   defaultBucket: { capacity: 100, refillRate: 10 },
 *   buckets: {
 *     'api:anthropic': { capacity: 60, refillRate: 1 }, // 60 RPM
 *   },
 * });
 *
 * // Acquire with wait
 * await limiter.acquire('api:anthropic');
 *
 * // Try without waiting
 * if (limiter.tryAcquire('api:openai')) {
 *   // proceed
 * }
 *
 * // Cleanup when done
 * limiter.dispose();
 * ```
 */
export class RateLimiter {
  private readonly config: Required<Omit<RateLimiterConfig, "buckets">> & {
    buckets: Record<string, TokenBucketConfig>;
  };
  private readonly buckets: Map<string, BucketEntry> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private disposed: boolean = false;
  private totalRequests: number = 0;
  private throttledRequests: number = 0;
  private rejectedRequests: number = 0;

  constructor(config: RateLimiterConfig = {}) {
    this.config = {
      defaultBucket: config.defaultBucket ?? DEFAULT_RATE_LIMITER_CONFIG.defaultBucket,
      buckets: config.buckets ?? {},
      throwOnExceeded: config.throwOnExceeded ?? DEFAULT_RATE_LIMITER_CONFIG.throwOnExceeded,
      maxWaitMs: config.maxWaitMs ?? DEFAULT_RATE_LIMITER_CONFIG.maxWaitMs,
      cleanupInterval: config.cleanupInterval ?? DEFAULT_RATE_LIMITER_CONFIG.cleanupInterval,
    };

    this.startCleanupTimer();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Acquire tokens for a specific key, waiting if necessary.
   * Creates a new bucket if the key doesn't exist.
   *
   * @param key - Identifier for the rate limit bucket
   * @param tokens - Number of tokens to acquire (default: 1)
   * @param signal - Optional AbortSignal for cancellation
   * @throws RateLimitError if throwOnExceeded is true and no tokens available
   */
  async acquire(key: string, tokens: number = 1, signal?: AbortSignal): Promise<void> {
    this.ensureNotDisposed();
    this.totalRequests++;

    const entry = this.getOrCreateEntry(key);
    entry.lastAccessedAt = Date.now();
    entry.pendingRequests++;

    try {
      const waitTime = entry.bucket.calculateWaitTime(tokens);

      // Check if we should throw instead of wait
      if (waitTime > 0 && this.config.throwOnExceeded) {
        this.rejectedRequests++;
        throw new RateLimitError(
          `Rate limit exceeded for key '${key}'. Retry after ${waitTime}ms`,
          waitTime
        );
      }

      // Check if wait would exceed max
      if (waitTime > this.config.maxWaitMs) {
        this.rejectedRequests++;
        throw new RateLimitError(
          `Rate limit wait time (${waitTime}ms) exceeds maximum (${this.config.maxWaitMs}ms)`,
          waitTime
        );
      }

      if (waitTime > 0) {
        this.throttledRequests++;
      }

      await entry.bucket.waitForTokens(tokens, signal);
    } finally {
      entry.pendingRequests--;
    }
  }

  /**
   * Try to acquire tokens immediately without waiting.
   * Returns true if tokens were consumed, false otherwise.
   *
   * @param key - Identifier for the rate limit bucket
   * @param tokens - Number of tokens to acquire (default: 1)
   * @returns true if tokens were acquired
   */
  tryAcquire(key: string, tokens: number = 1): boolean {
    this.ensureNotDisposed();
    this.totalRequests++;

    const entry = this.getOrCreateEntry(key);
    entry.lastAccessedAt = Date.now();

    const acquired = entry.bucket.tryConsume(tokens);
    if (!acquired) {
      this.rejectedRequests++;
    }

    return acquired;
  }

  /**
   * Get available tokens for a key without consuming.
   *
   * @param key - Identifier for the rate limit bucket
   * @returns Number of available tokens
   */
  getAvailableTokens(key: string): number {
    this.ensureNotDisposed();

    const entry = this.buckets.get(key);
    if (!entry) {
      const config = this.getBucketConfig(key);
      return config.initialTokens ?? config.capacity;
    }

    return entry.bucket.getAvailableTokens();
  }

  /**
   * Calculate wait time for acquiring tokens.
   *
   * @param key - Identifier for the rate limit bucket
   * @param tokens - Number of tokens needed
   * @returns Wait time in milliseconds
   */
  getWaitTime(key: string, tokens: number = 1): number {
    this.ensureNotDisposed();

    const entry = this.getOrCreateEntry(key);
    return entry.bucket.calculateWaitTime(tokens);
  }

  /**
   * Check if a key has an active bucket.
   *
   * @param key - Identifier for the rate limit bucket
   * @returns true if bucket exists
   */
  hasKey(key: string): boolean {
    return this.buckets.has(key);
  }

  /**
   * Get current statistics.
   *
   * @returns Rate limiter statistics
   */
  getStats(): RateLimiterStats {
    const keys: RateLimiterKeyState[] = [];

    for (const [key, entry] of this.buckets) {
      keys.push({
        key,
        bucket: entry.bucket.getState(),
        pendingRequests: entry.pendingRequests,
        createdAt: entry.createdAt,
        lastAccessedAt: entry.lastAccessedAt,
      });
    }

    return {
      activeBuckets: this.buckets.size,
      totalRequests: this.totalRequests,
      throttledRequests: this.throttledRequests,
      rejectedRequests: this.rejectedRequests,
      keys,
    };
  }

  /**
   * Reset statistics counters.
   */
  resetStats(): void {
    this.totalRequests = 0;
    this.throttledRequests = 0;
    this.rejectedRequests = 0;
  }

  /**
   * Remove a specific bucket.
   *
   * @param key - Identifier for the bucket to remove
   * @returns true if bucket was removed
   */
  removeBucket(key: string): boolean {
    const entry = this.buckets.get(key);
    if (entry) {
      entry.bucket.dispose();
      this.buckets.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Clear all buckets.
   */
  clearBuckets(): void {
    for (const [, entry] of this.buckets) {
      entry.bucket.dispose();
    }
    this.buckets.clear();
  }

  /**
   * Check if limiter is disposed.
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Dispose the rate limiter and all buckets.
   */
  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    for (const [, entry] of this.buckets) {
      entry.bucket.dispose();
    }
    this.buckets.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Get or create a bucket entry for a key.
   */
  private getOrCreateEntry(key: string): BucketEntry {
    let entry = this.buckets.get(key);

    if (!entry) {
      const config = this.getBucketConfig(key);
      const now = Date.now();

      entry = {
        bucket: new TokenBucket(config),
        createdAt: now,
        lastAccessedAt: now,
        pendingRequests: 0,
      };

      this.buckets.set(key, entry);
    }

    return entry;
  }

  /**
   * Get bucket configuration for a key.
   */
  private getBucketConfig(key: string): Required<TokenBucketConfig> {
    const customConfig = this.config.buckets[key];

    if (customConfig) {
      return {
        capacity: customConfig.capacity,
        refillRate: customConfig.refillRate,
        refillInterval: customConfig.refillInterval ?? DEFAULT_BUCKET_CONFIG.refillInterval,
        initialTokens: customConfig.initialTokens ?? customConfig.capacity,
      };
    }

    return {
      capacity: this.config.defaultBucket.capacity,
      refillRate: this.config.defaultBucket.refillRate,
      refillInterval:
        this.config.defaultBucket.refillInterval ?? DEFAULT_BUCKET_CONFIG.refillInterval,
      initialTokens: this.config.defaultBucket.initialTokens ?? this.config.defaultBucket.capacity,
    };
  }

  /**
   * Start the cleanup timer.
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleBuckets();
    }, this.config.cleanupInterval);

    // Unref timer so it doesn't keep the process alive
    if (typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Clean up stale buckets that haven't been accessed recently.
   */
  private cleanupStaleBuckets(): void {
    const now = Date.now();
    const staleThreshold = now - this.config.cleanupInterval * 2;

    for (const [key, entry] of this.buckets) {
      // Don't remove buckets with pending requests
      if (entry.pendingRequests > 0) {
        continue;
      }

      // Remove if not accessed recently and not a configured bucket
      if (entry.lastAccessedAt < staleThreshold && !this.config.buckets[key]) {
        entry.bucket.dispose();
        this.buckets.delete(key);
      } else {
        // Cleanup internal state
        entry.bucket.cleanup();
      }
    }
  }

  /**
   * Ensure limiter is not disposed.
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new RateLimitError("RateLimiter is disposed");
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new rate limiter instance.
 *
 * @param config - Optional configuration
 * @returns RateLimiter instance
 *
 * @example
 * ```typescript
 * // Default rate limiter
 * const limiter = createRateLimiter();
 *
 * // Custom configuration
 * const limiter = createRateLimiter({
 *   defaultBucket: { capacity: 60, refillRate: 1 },
 *   buckets: {
 *     'api:anthropic': { capacity: 60, refillRate: 1 },
 *     'api:openai': { capacity: 500, refillRate: 8.33 },
 *   },
 *   throwOnExceeded: true,
 * });
 * ```
 */
export function createRateLimiter(config?: RateLimiterConfig): RateLimiter {
  return new RateLimiter(config);
}
