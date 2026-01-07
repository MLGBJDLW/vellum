// ============================================
// Cache Fallback (T036 - REQ-012)
// ============================================

import type { FallbackResult } from "./types.js";

/**
 * Options for cache fallback behavior.
 */
export interface CacheFallbackOptions {
  /** Time-to-live in milliseconds (default: 300000 = 5 minutes) */
  ttlMs?: number;
  /** Whether to return stale cache while revalidating in background */
  staleWhileRevalidate?: boolean;
}

/**
 * A single cache entry with timestamp and TTL.
 *
 * @template T - The type of cached value
 */
export interface CacheEntry<T> {
  /** The cached value */
  value: T;
  /** Timestamp when the entry was created */
  timestamp: number;
  /** Time-to-live in milliseconds */
  ttlMs: number;
}

const DEFAULT_TTL_MS = 300_000; // 5 minutes

/**
 * Cache fallback that returns cached values when the primary source fails.
 * AC-012-3: CacheFallback returns cached value when primary fails
 * AC-012-4: FallbackResult indicates source (primary vs fallback)
 *
 * @template T - The type of values stored in the cache
 *
 * @example
 * ```typescript
 * const cache = new CacheFallback<UserData>({ ttlMs: 60_000 });
 *
 * // First call fetches from primary and caches
 * const result1 = await cache.execute('user:123', () => fetchUser('123'));
 * console.log(result1.source); // 'primary'
 *
 * // If primary fails, falls back to cache
 * const result2 = await cache.execute('user:123', () => Promise.reject(new Error('API down')));
 * console.log(result2.source); // 'fallback'
 * ```
 */
export class CacheFallback<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private options: Required<CacheFallbackOptions>;

  /**
   * Creates a new cache fallback instance.
   *
   * @param options - Configuration options for the cache
   */
  constructor(options?: CacheFallbackOptions) {
    this.options = {
      ttlMs: options?.ttlMs ?? DEFAULT_TTL_MS,
      staleWhileRevalidate: options?.staleWhileRevalidate ?? false,
    };
  }

  /**
   * Executes the primary function with cache fallback.
   * AC-012-3: Returns cached value when primary fails
   * AC-012-4: FallbackResult indicates source
   *
   * @param key - Cache key for the value
   * @param primary - Primary function to fetch the value
   * @returns FallbackResult with value and source information
   * @throws Error if primary fails and no valid cache entry exists
   */
  async execute(key: string, primary: () => Promise<T>): Promise<FallbackResult<T>> {
    let attempts = 0;
    let primaryError: Error | undefined;

    // Try stale-while-revalidate if enabled and we have cached data
    if (this.options.staleWhileRevalidate && this.has(key)) {
      const cached = this.cache.get(key);
      if (!cached) throw new Error("Cache inconsistency");
      attempts++;

      // Return stale data immediately, revalidate in background
      primary()
        .then((value) => {
          this.set(key, value);
        })
        .catch(() => {
          // Silently fail background revalidation
        });

      return {
        value: cached.value,
        source: this.isExpired(key) ? "fallback" : "primary",
        fallbackIndex: this.isExpired(key) ? 0 : undefined,
        attempts,
      };
    }

    // Try primary first
    try {
      attempts++;
      const value = await primary();

      // Cache the successful result
      this.set(key, value);

      return {
        value,
        source: "primary",
        attempts,
      };
    } catch (error) {
      primaryError = error instanceof Error ? error : new Error(String(error));
    }

    // Primary failed, try cache fallback
    if (this.has(key)) {
      const cached = this.cache.get(key);
      if (!cached) throw new Error("Cache inconsistency");

      // Allow stale cache on primary failure (graceful degradation)
      return {
        value: cached.value,
        source: "fallback",
        fallbackIndex: 0,
        error: primaryError,
        attempts,
      };
    }

    // No cache available, propagate the error
    throw primaryError;
  }

  /**
   * Manually sets a value in the cache.
   *
   * @param key - Cache key
   * @param value - Value to cache
   */
  set(key: string, value: T): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttlMs: this.options.ttlMs,
    });
  }

  /**
   * Gets a value from the cache if it exists and is not expired.
   *
   * @param key - Cache key
   * @returns The cached value or undefined if not found or expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (this.isExpiredEntry(entry)) {
      return undefined;
    }

    return entry.value;
  }

  /**
   * Checks if a key exists in the cache (may be expired).
   *
   * @param key - Cache key
   * @returns True if the key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Clears the cache, optionally for a specific key.
   *
   * @param key - Optional specific key to clear; if omitted, clears all
   */
  clear(key?: string): void {
    if (key !== undefined) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Checks if a cache entry is expired.
   *
   * @param key - Cache key
   * @returns True if the entry exists and is expired
   */
  isExpired(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return true;
    }

    return this.isExpiredEntry(entry);
  }

  /**
   * Internal helper to check if an entry is expired.
   */
  private isExpiredEntry(entry: CacheEntry<T>): boolean {
    const now = Date.now();
    return now - entry.timestamp > entry.ttlMs;
  }
}
