/**
 * Token Cache - Cached Tokenizer Wrapper
 *
 * Provides LRU caching with TTL expiration for token counting operations.
 * Uses MD5 hashing for cache keys to handle large text inputs efficiently.
 *
 * @module @vellum/core/context/token-cache
 *
 * @example
 * ```typescript
 * import { CachedTokenizer, withCache } from './token-cache';
 *
 * // Create with factory function
 * const baseTokenizer = (text: string) => Math.ceil(text.length / 4);
 * const cached = withCache(baseTokenizer, { maxSize: 500, ttl: 60000 });
 *
 * const count1 = cached.count("Hello world"); // Miss
 * const count2 = cached.count("Hello world"); // Hit
 *
 * console.log(cached.getStats().hitRate); // 0.5
 * ```
 */

import { createHash } from "node:crypto";

// ============================================================================
// Types
// ============================================================================

/**
 * Cache entry with timestamp for TTL expiration.
 */
interface CacheEntry {
  /** Cached token count */
  readonly tokens: number;
  /** Timestamp when entry was created (ms since epoch) */
  readonly createdAt: number;
}

/**
 * Statistics for cache monitoring and performance analysis.
 *
 * @example
 * ```typescript
 * const stats = tokenizer.getStats();
 * console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
 * console.log(`Cache size: ${stats.size}/${stats.maxSize}`);
 * ```
 */
export interface TokenCacheStats {
  /** Number of cache hits */
  readonly hits: number;
  /** Number of cache misses */
  readonly misses: number;
  /** Hit rate as decimal (0-1) */
  readonly hitRate: number;
  /** Current number of entries in cache */
  readonly size: number;
  /** Maximum cache capacity */
  readonly maxSize: number;
  /** Number of entries evicted due to size limit */
  readonly evictions: number;
}

/**
 * Options for configuring the cached tokenizer.
 */
export interface CachedTokenizerOptions {
  /**
   * Maximum number of cache entries.
   * When exceeded, oldest entries are evicted (LRU).
   *
   * @default 1000
   */
  maxSize?: number;

  /**
   * Time-to-live for cache entries in milliseconds.
   * Entries older than this are treated as cache misses.
   *
   * @default 300000 (5 minutes)
   */
  ttl?: number;

  /**
   * Custom hash function for cache keys.
   * Should produce consistent hashes for the same input.
   *
   * @default MD5 hash
   */
  hashFn?: (text: string) => string;
}

/**
 * Tokenizer function type.
 *
 * A function that takes text and returns a token count.
 * Can be synchronous or estimated.
 *
 * @param text - The text to tokenize
 * @returns The number of tokens in the text
 */
export type TokenizerFn = (text: string) => number;

// ============================================================================
// Constants
// ============================================================================

/** Default maximum cache size */
const DEFAULT_MAX_SIZE = 1000;

/** Default TTL: 5 minutes in milliseconds */
const DEFAULT_TTL = 5 * 60 * 1000;

// ============================================================================
// Hash Function
// ============================================================================

/**
 * Create a simple MD5 hash for cache keys.
 *
 * MD5 is chosen for speed over cryptographic security,
 * which is not needed for cache key generation.
 *
 * @param text - The text to hash
 * @returns Hexadecimal MD5 hash string
 */
function createMD5Hash(text: string): string {
  return createHash("md5").update(text).digest("hex");
}

// ============================================================================
// CachedTokenizer Class
// ============================================================================

/**
 * Cached tokenizer wrapper with LRU eviction and TTL expiration.
 *
 * Wraps a base tokenizer function and caches results using MD5 hashes
 * as keys. Implements LRU eviction when cache exceeds maxSize and
 * TTL expiration for stale entries.
 *
 * @example
 * ```typescript
 * // Simple word-based tokenizer (for testing)
 * const simpleTokenizer = (text: string) =>
 *   Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3);
 *
 * // Create cached version
 * const cached = new CachedTokenizer(simpleTokenizer, {
 *   maxSize: 500,
 *   ttl: 60000, // 1 minute
 * });
 *
 * // First call - cache miss
 * const count1 = cached.count("Hello world");
 *
 * // Second call - cache hit (instant)
 * const count2 = cached.count("Hello world");
 *
 * // Check statistics
 * const stats = cached.getStats();
 * console.log(stats.hitRate); // 0.5
 * ```
 */
export class CachedTokenizer {
  /** Internal cache storage (Map preserves insertion order for LRU) */
  private readonly cache: Map<string, CacheEntry>;

  /** Base tokenizer function to call on cache miss */
  private readonly baseTokenizer: TokenizerFn;

  /** Resolved configuration options */
  private readonly options: Readonly<Required<CachedTokenizerOptions>>;

  /** Internal statistics tracking */
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
  };

  /**
   * Create a new cached tokenizer.
   *
   * @param baseTokenizer - The underlying tokenizer function to cache
   * @param options - Configuration options
   */
  constructor(baseTokenizer: TokenizerFn, options?: CachedTokenizerOptions) {
    this.cache = new Map();
    this.baseTokenizer = baseTokenizer;
    this.options = {
      maxSize: options?.maxSize ?? DEFAULT_MAX_SIZE,
      ttl: options?.ttl ?? DEFAULT_TTL,
      hashFn: options?.hashFn ?? createMD5Hash,
    };
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };
  }

  /**
   * Count tokens for text, using cache if available.
   *
   * For empty strings, returns 0 immediately without caching.
   *
   * @param text - The text to tokenize
   * @returns The number of tokens
   */
  count(text: string): number {
    // Fast path for empty strings
    if (!text || text.length === 0) {
      return 0;
    }

    const key = this.getCacheKey(text);

    // Check cache
    const entry = this.cache.get(key);
    if (entry !== undefined) {
      // Check TTL
      if (!this.isExpired(entry)) {
        this.stats.hits++;
        // LRU: Move to end by re-inserting
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.tokens;
      }
      // Expired - remove
      this.cache.delete(key);
    }

    // Cache miss
    this.stats.misses++;
    const tokens = this.baseTokenizer(text);

    // Evict if needed before adding
    if (this.cache.size >= this.options.maxSize) {
      this.evictOldest();
    }

    // Store in cache
    this.cache.set(key, {
      tokens,
      createdAt: Date.now(),
    });

    return tokens;
  }

  /**
   * Count tokens for multiple texts efficiently.
   *
   * Processes texts in order, leveraging cache for duplicates.
   *
   * @param texts - Array of texts to tokenize
   * @returns Array of token counts in the same order
   */
  countMany(texts: string[]): number[] {
    return texts.map((text) => this.count(text));
  }

  /**
   * Generate cache key from text using hash function.
   *
   * @param text - The text to generate a key for
   * @returns The cache key (hash)
   */
  private getCacheKey(text: string): string {
    return this.options.hashFn(text);
  }

  /**
   * Check if a cache entry has expired based on TTL.
   *
   * @param entry - The cache entry to check
   * @returns True if the entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.createdAt > this.options.ttl;
  }

  /**
   * Evict the oldest entry from cache (LRU eviction).
   *
   * Map iteration order is insertion order, so the first
   * key is the oldest entry.
   */
  private evictOldest(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
      this.stats.evictions++;
    }
  }

  /**
   * Get cache statistics for monitoring.
   *
   * @returns Current cache statistics
   */
  getStats(): TokenCacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      size: this.cache.size,
      maxSize: this.options.maxSize,
      evictions: this.stats.evictions,
    };
  }

  /**
   * Clear all cache entries and reset statistics.
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };
  }

  /**
   * Warm up cache with common texts.
   *
   * Pre-populates the cache with known frequently-used texts
   * to improve hit rate from the start.
   *
   * @param texts - Array of texts to pre-cache
   */
  warmUp(texts: string[]): void {
    for (const text of texts) {
      // count() handles caching
      this.count(text);
    }
    // Reset stats after warm-up so they reflect actual usage
    this.stats.hits = 0;
    this.stats.misses = 0;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Factory function for creating a cached tokenizer.
 *
 * Convenience wrapper around the CachedTokenizer constructor.
 *
 * @param tokenizer - The base tokenizer function to cache
 * @param options - Configuration options
 * @returns A new CachedTokenizer instance
 *
 * @example
 * ```typescript
 * const cached = withCache(
 *   (text) => text.split(' ').length,
 *   { maxSize: 500 }
 * );
 * ```
 */
export function withCache(
  tokenizer: TokenizerFn,
  options?: CachedTokenizerOptions
): CachedTokenizer {
  return new CachedTokenizer(tokenizer, options);
}
