// ============================================
// Token Bucket Algorithm Implementation - Phase 34
// ============================================

import { RateLimitError } from "../errors/web.js";

import { DEFAULT_BUCKET_CONFIG, type TokenBucketConfig, type TokenBucketState } from "./types.js";

// =============================================================================
// TokenBucket Class
// =============================================================================

/**
 * Token bucket algorithm implementation for rate limiting.
 *
 * Features:
 * - Sliding window token refill
 * - Async acquisition with wait
 * - Immediate try-acquire
 * - AbortSignal support
 * - Memory-safe with cleanup
 *
 * @example
 * ```typescript
 * const bucket = new TokenBucket({ capacity: 100, refillRate: 10 });
 *
 * // Wait for tokens (blocking)
 * await bucket.waitForTokens(5);
 *
 * // Try immediate acquisition (non-blocking)
 * if (bucket.tryConsume(5)) {
 *   // Token acquired
 * }
 *
 * // Cleanup when done
 * bucket.dispose();
 * ```
 */
export class TokenBucket {
  private readonly config: Required<TokenBucketConfig>;
  private tokens: number;
  private lastRefillTime: number;
  private refillTimer: ReturnType<typeof setInterval> | null = null;
  private totalConsumed: number = 0;
  private totalWaited: number = 0;
  private pendingRequests: Map<
    string,
    { resolve: () => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  > = new Map();
  private disposed: boolean = false;

  constructor(config: TokenBucketConfig) {
    this.config = {
      capacity: config.capacity,
      refillRate: config.refillRate,
      refillInterval: config.refillInterval ?? DEFAULT_BUCKET_CONFIG.refillInterval,
      initialTokens: config.initialTokens ?? config.capacity,
    };

    if (this.config.capacity <= 0) {
      throw new Error("TokenBucket capacity must be positive");
    }
    if (this.config.refillRate <= 0) {
      throw new Error("TokenBucket refillRate must be positive");
    }

    this.tokens = this.config.initialTokens;
    this.lastRefillTime = Date.now();
    this.startRefillTimer();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Try to consume tokens immediately without waiting.
   * Returns true if tokens were consumed, false otherwise.
   *
   * @param tokens - Number of tokens to consume (default: 1)
   * @returns true if tokens were consumed successfully
   */
  tryConsume(tokens: number = 1): boolean {
    this.ensureNotDisposed();

    if (tokens <= 0) {
      return true;
    }

    if (tokens > this.config.capacity) {
      return false;
    }

    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      this.totalConsumed += tokens;
      return true;
    }

    return false;
  }

  /**
   * Get the number of currently available tokens.
   *
   * @returns Number of available tokens
   */
  getAvailableTokens(): number {
    this.ensureNotDisposed();
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * Wait until the specified number of tokens are available and consume them.
   * Supports cancellation via AbortSignal.
   *
   * @param tokens - Number of tokens to acquire (default: 1)
   * @param signal - Optional AbortSignal for cancellation
   * @throws RateLimitError if aborted or bucket is disposed
   */
  async waitForTokens(tokens: number = 1, signal?: AbortSignal): Promise<void> {
    this.ensureNotDisposed();

    if (tokens <= 0) {
      return;
    }

    if (tokens > this.config.capacity) {
      throw new RateLimitError(
        `Requested ${tokens} tokens exceeds bucket capacity ${this.config.capacity}`
      );
    }

    // Check if already aborted
    if (signal?.aborted) {
      throw new RateLimitError("Token acquisition aborted");
    }

    // Try immediate acquisition
    if (this.tryConsume(tokens)) {
      return;
    }

    // Calculate wait time and wait
    const waitTime = this.calculateWaitTime(tokens);
    this.totalWaited += waitTime;

    await this.sleepWithAbort(waitTime, signal);

    // Retry acquisition after waiting
    if (!this.tryConsume(tokens)) {
      // Shouldn't happen normally, but handle edge case
      await this.waitForTokens(tokens, signal);
    }
  }

  /**
   * Calculate how long it would take to acquire the specified tokens.
   *
   * @param tokens - Number of tokens needed
   * @returns Wait time in milliseconds, 0 if tokens are immediately available
   */
  calculateWaitTime(tokens: number = 1): number {
    this.ensureNotDisposed();
    this.refill();

    if (this.tokens >= tokens) {
      return 0;
    }

    const deficit = tokens - this.tokens;
    const tokensPerMs = this.config.refillRate / 1000;
    return Math.ceil(deficit / tokensPerMs);
  }

  /**
   * Get current state snapshot for monitoring.
   *
   * @returns Current token bucket state
   */
  getState(): TokenBucketState {
    this.refill();
    return {
      tokens: Math.floor(this.tokens),
      lastRefillTime: this.lastRefillTime,
      totalConsumed: this.totalConsumed,
      totalWaited: this.totalWaited,
    };
  }

  /**
   * Get bucket capacity.
   */
  get capacity(): number {
    return this.config.capacity;
  }

  /**
   * Get refill rate (tokens per second).
   */
  get refillRate(): number {
    return this.config.refillRate;
  }

  /**
   * Check if bucket is disposed.
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Cleanup stale entries to prevent memory leaks.
   * Safe to call periodically.
   *
   * @param maxAgeMs - Maximum age for stale data (default: 5 minutes)
   */
  cleanup(maxAgeMs: number = 5 * 60 * 1000): void {
    if (this.disposed) return;

    const now = Date.now();
    const staleThreshold = now - maxAgeMs;

    // Reset counters if bucket has been idle
    if (this.lastRefillTime < staleThreshold) {
      this.totalConsumed = 0;
      this.totalWaited = 0;
    }

    // Safety: clear orphaned pending requests (shouldn't normally happen)
    if (this.pendingRequests.size > 1000) {
      for (const [, pending] of this.pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new RateLimitError("Pending request cleanup"));
      }
      this.pendingRequests.clear();
    }
  }

  /**
   * Dispose the token bucket and release resources.
   * Rejects all pending requests.
   */
  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new RateLimitError("TokenBucket disposed"));
    }
    this.pendingRequests.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Refill tokens based on elapsed time.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;

    if (elapsed <= 0) return;

    const tokensToAdd = (elapsed / 1000) * this.config.refillRate;
    this.tokens = Math.min(this.config.capacity, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  /**
   * Start the periodic refill timer.
   */
  private startRefillTimer(): void {
    this.refillTimer = setInterval(() => {
      this.refill();
    }, this.config.refillInterval);

    // Unref timer so it doesn't keep the process alive
    if (typeof this.refillTimer === "object" && "unref" in this.refillTimer) {
      this.refillTimer.unref();
    }
  }

  /**
   * Sleep with AbortSignal support.
   */
  private sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();

      const cleanup = () => {
        const pending = this.pendingRequests.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(id);
        }
        signal?.removeEventListener("abort", onAbort);
      };

      const onAbort = () => {
        cleanup();
        reject(new RateLimitError("Token acquisition aborted"));
      };

      if (signal?.aborted) {
        reject(new RateLimitError("Token acquisition aborted"));
        return;
      }

      signal?.addEventListener("abort", onAbort, { once: true });

      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);

      this.pendingRequests.set(id, {
        resolve: () => {
          cleanup();
          resolve();
        },
        reject: (err) => {
          cleanup();
          reject(err);
        },
        timer,
      });
    });
  }

  /**
   * Ensure bucket is not disposed before operations.
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new RateLimitError("TokenBucket is disposed");
    }
  }
}
