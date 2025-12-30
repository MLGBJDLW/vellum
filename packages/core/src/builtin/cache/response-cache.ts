/**
 * Cache entry with metadata for TTL and LRU tracking
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
  size: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  size: number;
  evictions: number;
}

/**
 * Cache configuration options
 */
export interface CacheOptions {
  /** Maximum number of entries */
  maxEntries: number;
  /** Default TTL in milliseconds */
  defaultTtlMs: number;
  /** Maximum total size in bytes (optional) */
  maxSize?: number;
}

/**
 * Create a cache key from URL and optional parameters
 */
export function createCacheKey(url: string, params?: Record<string, string>): string {
  const baseKey = url.toLowerCase();
  if (!params || Object.keys(params).length === 0) {
    return baseKey;
  }
  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `${baseKey}?${sortedParams}`;
}

/**
 * Check if a request is cacheable (GET only, no cache-control: no-store)
 */
export function isCacheable(method: string, headers?: Record<string, string>): boolean {
  if (method.toUpperCase() !== "GET") {
    return false;
  }
  if (headers) {
    const cacheControl = headers["cache-control"]?.toLowerCase();
    if (cacheControl?.includes("no-store")) {
      return false;
    }
  }
  return true;
}

/**
 * LRU + TTL Response Cache
 *
 * Generic cache implementation with:
 * - Time-based expiration (TTL)
 * - LRU eviction when at capacity
 * - Size tracking
 * - Statistics
 */
export class ResponseCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    entries: 0,
    size: 0,
    evictions: 0,
  };

  constructor(private readonly options: CacheOptions) {}

  /**
   * Get a cached value if it exists and is not expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update access time for LRU
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a cached value with optional TTL override
   */
  set(key: string, value: T, options?: { ttlMs?: number; size?: number }): void {
    const ttlMs = options?.ttlMs ?? this.options.defaultTtlMs;
    const size = options?.size ?? this.estimateSize(value);

    // Evict if at capacity
    if (this.cache.size >= this.options.maxEntries && !this.cache.has(key)) {
      this.evictLRU();
    }

    // Check max size if configured
    if (this.options.maxSize && this.stats.size + size > this.options.maxSize) {
      this.evictUntilSize(size);
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + ttlMs,
      lastAccessed: Date.now(),
      size,
    };

    // Update stats for replacement
    const existing = this.cache.get(key);
    if (existing) {
      this.stats.size -= existing.size;
    }

    this.cache.set(key, entry);
    this.stats.entries = this.cache.size;
    this.stats.size += size;
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete a cache entry
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.stats.size -= entry.size;
      this.cache.delete(key);
      this.stats.entries = this.cache.size;
      return true;
    }
    return false;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.entries = 0;
    this.stats.size = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Evict all expired entries
   */
  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.delete(key);
        evicted++;
        this.stats.evictions++;
      }
    }
    return evicted;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldest: { key: string; time: number } | null = null;
    for (const [key, entry] of this.cache) {
      if (!oldest || entry.lastAccessed < oldest.time) {
        oldest = { key, time: entry.lastAccessed };
      }
    }
    if (oldest) {
      this.delete(oldest.key);
      this.stats.evictions++;
    }
  }

  /**
   * Evict entries until we have room for given size
   */
  private evictUntilSize(needed: number): void {
    while (
      this.cache.size > 0 &&
      this.options.maxSize &&
      this.stats.size + needed > this.options.maxSize
    ) {
      this.evictLRU();
    }
  }

  /**
   * Estimate size of a value
   */
  private estimateSize(value: T): number {
    if (typeof value === "string") {
      return value.length * 2; // UTF-16
    }
    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value).length * 2;
    }
    return 64; // Default estimate
  }
}
