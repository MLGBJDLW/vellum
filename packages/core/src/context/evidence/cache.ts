/**
 * Evidence Cache - LRU Cache with TTL for Evidence Pack System
 *
 * Provides O(1) caching for evidence items with:
 * - LRU eviction strategy (doubly-linked list + Map)
 * - TTL-based expiration
 * - Path-based batch invalidation
 * - Hit rate statistics
 *
 * Cache key formats:
 * - `diff:${filePath}:${contentHash}`
 * - `search:${signal}:${patterns}`
 * - `lsp:definition:${symbol}:${position}`
 *
 * @packageDocumentation
 * @module context/evidence/cache
 */

import type { Evidence } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Internal node for doubly-linked list (LRU tracking).
 */
interface LRUNode {
  key: string;
  prev: LRUNode | null;
  next: LRUNode | null;
}

/**
 * Single cache entry with metadata.
 */
export interface CacheEntry {
  /** Cached evidence */
  readonly evidence: Evidence;
  /** Cache timestamp (ms since epoch) */
  readonly cachedAt: number;
  /** Content hash for invalidation */
  readonly contentHash: string;
  /** Hit count for this entry */
  hits: number;
}

/**
 * Configuration for EvidenceCache.
 */
export interface EvidenceCacheConfig {
  /** Max entries in cache (default: 1000) */
  readonly maxEntries?: number;
  /** TTL in milliseconds (default: 60000 = 1 min) */
  readonly ttlMs?: number;
  /** Enable LRU eviction (default: true) */
  readonly lru?: boolean;
}

/**
 * Cache statistics for monitoring.
 */
export interface CacheStats {
  /** Current number of entries */
  readonly size: number;
  /** Total cache hits */
  readonly hits: number;
  /** Total cache misses */
  readonly misses: number;
  /** Hit rate (hits / (hits + misses)), 0 if no accesses */
  readonly hitRate: number;
  /** Total evictions (LRU + TTL) */
  readonly evictions: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_TTL_MS = 60_000; // 1 minute

// =============================================================================
// EvidenceCache Implementation
// =============================================================================

/**
 * LRU cache with TTL support for Evidence items.
 *
 * Provides O(1) get/set operations using a combination of:
 * - Map for key-value storage
 * - Doubly-linked list for LRU ordering
 *
 * @example
 * ```typescript
 * const cache = new EvidenceCache({ maxEntries: 500, ttlMs: 30000 });
 *
 * // Set with content hash for invalidation
 * cache.set('diff:/src/foo.ts:abc123', evidence, 'abc123');
 *
 * // Get (returns undefined if expired or missing)
 * const cached = cache.get('diff:/src/foo.ts:abc123');
 *
 * // Invalidate all entries for a file
 * cache.invalidateByPath('/src/foo.ts');
 *
 * // Check stats
 * console.log(cache.getStats());
 * ```
 */
export class EvidenceCache {
  // Configuration
  readonly #maxEntries: number;
  readonly #ttlMs: number;
  readonly #lruEnabled: boolean;

  // Storage
  readonly #cache: Map<string, CacheEntry>;
  readonly #lruNodes: Map<string, LRUNode>;

  // LRU linked list pointers
  #head: LRUNode | null = null; // Most recently used
  #tail: LRUNode | null = null; // Least recently used

  // Path index for batch invalidation: path -> Set of cache keys
  readonly #pathIndex: Map<string, Set<string>>;

  // Statistics
  #hits = 0;
  #misses = 0;
  #evictions = 0;

  /**
   * Creates a new EvidenceCache instance.
   *
   * @param config - Cache configuration options
   */
  constructor(config?: EvidenceCacheConfig) {
    this.#maxEntries = config?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.#ttlMs = config?.ttlMs ?? DEFAULT_TTL_MS;
    this.#lruEnabled = config?.lru ?? true;

    this.#cache = new Map();
    this.#lruNodes = new Map();
    this.#pathIndex = new Map();
  }

  /**
   * Get cached evidence by key.
   *
   * Returns undefined if:
   * - Key not found
   * - Entry has expired (TTL)
   *
   * Updates LRU order on hit.
   *
   * @param key - Cache key
   * @returns Cached evidence or undefined
   */
  get(key: string): Evidence | undefined {
    const entry = this.#cache.get(key);

    if (!entry) {
      this.#misses++;
      return undefined;
    }

    // Check TTL expiration
    if (this.#isExpired(entry)) {
      this.#removeEntry(key);
      this.#misses++;
      this.#evictions++;
      return undefined;
    }

    // Update hit count
    entry.hits++;
    this.#hits++;

    // Move to front of LRU list
    if (this.#lruEnabled) {
      this.#moveToFront(key);
    }

    return entry.evidence;
  }

  /**
   * Set evidence in cache.
   *
   * If cache is full, evicts least recently used entry.
   *
   * @param key - Cache key
   * @param evidence - Evidence to cache
   * @param contentHash - Optional content hash for invalidation
   */
  set(key: string, evidence: Evidence, contentHash?: string): void {
    // Remove existing entry if present
    if (this.#cache.has(key)) {
      this.#removeEntry(key);
    }

    // Evict if at capacity
    if (this.#cache.size >= this.#maxEntries) {
      this.#evictLRU();
    }

    // Create entry
    const entry: CacheEntry = {
      evidence,
      cachedAt: Date.now(),
      contentHash: contentHash ?? "",
      hits: 0,
    };

    // Store in cache
    this.#cache.set(key, entry);

    // Add to LRU list
    if (this.#lruEnabled) {
      this.#addToFront(key);
    }

    // Index by path for batch invalidation
    this.#indexByPath(key, evidence.path);
  }

  /**
   * Check if entry exists and is valid (not expired).
   *
   * @param key - Cache key
   * @returns True if entry exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.#cache.get(key);

    if (!entry) {
      return false;
    }

    if (this.#isExpired(entry)) {
      this.#removeEntry(key);
      this.#evictions++;
      return false;
    }

    return true;
  }

  /**
   * Invalidate by key or pattern.
   *
   * @param keyOrPattern - Exact key string or RegExp pattern
   * @returns Number of entries invalidated
   */
  invalidate(keyOrPattern: string | RegExp): number {
    let count = 0;

    if (typeof keyOrPattern === "string") {
      // Exact key match
      if (this.#cache.has(keyOrPattern)) {
        this.#removeEntry(keyOrPattern);
        count = 1;
      }
    } else {
      // RegExp pattern match
      const keysToRemove: string[] = [];

      for (const key of this.#cache.keys()) {
        if (keyOrPattern.test(key)) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        this.#removeEntry(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Invalidate all entries associated with a file path.
   *
   * Uses path index for O(k) lookup where k = entries for path.
   *
   * @param filePath - File path to invalidate
   * @returns Number of entries invalidated
   */
  invalidateByPath(filePath: string): number {
    const keys = this.#pathIndex.get(filePath);

    if (!keys || keys.size === 0) {
      return 0;
    }

    let count = 0;

    // Copy keys to avoid modification during iteration
    for (const key of [...keys]) {
      this.#removeEntry(key);
      count++;
    }

    return count;
  }

  /**
   * Get cache statistics.
   *
   * @returns Current cache stats
   */
  getStats(): CacheStats {
    const total = this.#hits + this.#misses;

    return {
      size: this.#cache.size,
      hits: this.#hits,
      misses: this.#misses,
      hitRate: total > 0 ? this.#hits / total : 0,
      evictions: this.#evictions,
    };
  }

  /**
   * Clear all entries from cache.
   *
   * Resets statistics.
   */
  clear(): void {
    this.#cache.clear();
    this.#lruNodes.clear();
    this.#pathIndex.clear();
    this.#head = null;
    this.#tail = null;
    // Note: We keep stats for historical tracking
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Check if entry has expired based on TTL.
   */
  #isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.cachedAt > this.#ttlMs;
  }

  /**
   * Remove entry from cache and all indexes.
   */
  #removeEntry(key: string): void {
    const entry = this.#cache.get(key);

    if (!entry) {
      return;
    }

    // Remove from cache
    this.#cache.delete(key);

    // Remove from LRU list
    this.#removeFromList(key);

    // Remove from path index
    const pathKeys = this.#pathIndex.get(entry.evidence.path);
    if (pathKeys) {
      pathKeys.delete(key);
      if (pathKeys.size === 0) {
        this.#pathIndex.delete(entry.evidence.path);
      }
    }
  }

  /**
   * Index cache key by evidence path for batch invalidation.
   */
  #indexByPath(key: string, path: string): void {
    let keys = this.#pathIndex.get(path);

    if (!keys) {
      keys = new Set();
      this.#pathIndex.set(path, keys);
    }

    keys.add(key);
  }

  /**
   * Evict least recently used entry.
   */
  #evictLRU(): void {
    if (!this.#tail) {
      return;
    }

    const keyToEvict = this.#tail.key;
    this.#removeEntry(keyToEvict);
    this.#evictions++;
  }

  /**
   * Add node to front of LRU list.
   */
  #addToFront(key: string): void {
    const node: LRUNode = {
      key,
      prev: null,
      next: this.#head,
    };

    if (this.#head) {
      this.#head.prev = node;
    }

    this.#head = node;

    if (!this.#tail) {
      this.#tail = node;
    }

    this.#lruNodes.set(key, node);
  }

  /**
   * Move existing node to front of LRU list.
   */
  #moveToFront(key: string): void {
    const node = this.#lruNodes.get(key);

    if (!node || node === this.#head) {
      return;
    }

    // Remove from current position
    this.#unlinkNode(node);

    // Add to front
    node.prev = null;
    node.next = this.#head;

    if (this.#head) {
      this.#head.prev = node;
    }

    this.#head = node;
  }

  /**
   * Remove node from LRU list.
   */
  #removeFromList(key: string): void {
    const node = this.#lruNodes.get(key);

    if (!node) {
      return;
    }

    this.#unlinkNode(node);
    this.#lruNodes.delete(key);
  }

  /**
   * Unlink node from doubly-linked list.
   */
  #unlinkNode(node: LRUNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.#head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.#tail = node.prev;
    }
  }
}
