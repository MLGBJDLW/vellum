/**
 * Credential Resolver with Priority Chain
 *
 * Resolves credentials from multiple stores in priority order (env > keychain > file > config).
 * Implements in-memory caching with 5-minute TTL for performance optimization.
 *
 * @module credentials/resolver
 */

import { Err, Ok, type Result } from "../types/result.js";

import type {
  Credential,
  CredentialRef,
  CredentialSource,
  CredentialStore,
  CredentialStoreError,
} from "./types.js";
import { createStoreError } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/** Default cache TTL in milliseconds (5 minutes) */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/** Store priority values (higher = checked first) */
export const STORE_PRIORITIES: Record<CredentialSource, number> = {
  runtime: 100,
  env: 90,
  keychain: 80,
  file: 50,
  config: 10,
};

// =============================================================================
// Cache Types
// =============================================================================

/**
 * Cached credential entry with expiration tracking
 */
interface CacheEntry {
  /** The cached credential (null means confirmed not found) */
  readonly credential: Credential | null;
  /** When this entry was cached */
  readonly cachedAt: number;
  /** Cache entry TTL in ms */
  readonly ttlMs: number;
}

/**
 * Generate cache key string from components
 */
function cacheKeyStr(provider: string, key?: string): string {
  return key ? `${provider}:${key}` : provider;
}

// =============================================================================
// Resolver Options
// =============================================================================

/**
 * Options for CredentialResolver construction
 */
export interface CredentialResolverOptions {
  /** Cache TTL in milliseconds (default: 5 minutes) */
  readonly cacheTtlMs?: number;
  /** Whether to cache negative results (not found) */
  readonly cacheNegatives?: boolean;
}

// =============================================================================
// Resolver Events
// =============================================================================

/**
 * Events emitted by the credential resolver
 */
export type CredentialResolverEvent =
  | { type: "cache:hit"; provider: string; key?: string }
  | { type: "cache:miss"; provider: string; key?: string }
  | { type: "cache:invalidate"; provider?: string; key?: string }
  | { type: "store:query"; store: CredentialSource; provider: string; key?: string }
  | { type: "store:found"; store: CredentialSource; provider: string; key?: string }
  | { type: "store:error"; store: CredentialSource; error: CredentialStoreError };

/**
 * Event listener type
 */
export type CredentialResolverListener = (event: CredentialResolverEvent) => void;

// =============================================================================
// CredentialResolver Implementation
// =============================================================================

/**
 * Credential Resolver with Priority Chain
 *
 * Queries credential stores in priority order until a credential is found.
 * Implements in-memory caching with configurable TTL for performance.
 *
 * Resolution order (by default priority):
 * 1. env (priority 90) - Environment variables
 * 2. keychain (priority 80) - OS native keychain
 * 3. file (priority 50) - Encrypted file storage
 * 4. config (priority 10) - Configuration file
 *
 * Features:
 * - Priority-based store querying
 * - In-memory cache with TTL
 * - Cache invalidation on write operations
 * - Provider-specific key override support
 * - Event emission for monitoring
 *
 * @example
 * ```typescript
 * const resolver = new CredentialResolver([
 *   new EnvCredentialStore(),
 *   new KeychainStore(),
 *   new EncryptedFileStore({ filePath: '~/.vellum/creds.enc', password }),
 * ]);
 *
 * // Resolve credential (checks stores in priority order)
 * const result = await resolver.resolve('anthropic');
 * if (result.ok && result.value) {
 *   console.log('Found credential from:', result.value.source);
 * }
 *
 * // Invalidate cache after external changes
 * resolver.invalidateCache('anthropic');
 * ```
 */
export class CredentialResolver {
  /** Registered stores sorted by priority (descending) */
  private readonly stores: readonly CredentialStore[];

  /** In-memory credential cache */
  private readonly cache: Map<string, CacheEntry> = new Map();

  /** Cache TTL in milliseconds */
  private readonly cacheTtlMs: number;

  /** Whether to cache negative (not found) results */
  private readonly cacheNegatives: boolean;

  /** Event listeners */
  private readonly listeners: Set<CredentialResolverListener> = new Set();

  /**
   * Create a new CredentialResolver
   *
   * @param stores - Array of credential stores to query
   * @param options - Resolver configuration options
   */
  constructor(stores: readonly CredentialStore[], options: CredentialResolverOptions = {}) {
    // Sort stores by priority (highest first)
    this.stores = [...stores].sort((a, b) => b.priority - a.priority);
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.cacheNegatives = options.cacheNegatives ?? true;
  }

  /**
   * Resolve a credential from the store chain
   *
   * Queries stores in priority order until a credential is found.
   * Uses cached result if available and not expired.
   *
   * @param provider - Provider name (e.g., 'anthropic', 'openai')
   * @param key - Optional specific key within provider namespace
   * @returns Result with credential or null if not found in any store
   */
  async resolve(
    provider: string,
    key?: string
  ): Promise<Result<Credential | null, CredentialStoreError>> {
    const cacheKey = cacheKeyStr(provider, key);

    // Check cache first
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) {
      this.emit({ type: "cache:hit", provider, key });
      return Ok(cached);
    }

    this.emit({ type: "cache:miss", provider, key });

    // Query stores in priority order
    for (const store of this.stores) {
      // Check if store is available
      const availResult = await store.isAvailable();
      if (!availResult.ok || !availResult.value) {
        continue;
      }

      this.emit({ type: "store:query", store: store.name, provider, key });

      const result = await store.get(provider, key);

      if (!result.ok) {
        this.emit({ type: "store:error", store: store.name, error: result.error });
        // Continue to next store on error
        continue;
      }

      if (result.value) {
        this.emit({ type: "store:found", store: store.name, provider, key });
        // Found credential - cache and return
        this.setCached(cacheKey, result.value);
        return Ok(result.value);
      }
    }

    // Not found in any store - cache negative result if enabled
    if (this.cacheNegatives) {
      this.setCached(cacheKey, null);
    }

    return Ok(null);
  }

  /**
   * Resolve a credential, returning error if not found
   *
   * Convenience method that treats "not found" as an error.
   *
   * @param provider - Provider name
   * @param key - Optional specific key
   * @returns Result with credential or NOT_FOUND error
   */
  async resolveRequired(
    provider: string,
    key?: string
  ): Promise<Result<Credential, CredentialStoreError>> {
    const result = await this.resolve(provider, key);

    if (!result.ok) {
      return result;
    }

    if (!result.value) {
      return Err(
        createStoreError(
          "NOT_FOUND",
          `Credential not found for provider '${provider}'${key ? ` with key '${key}'` : ""}`,
          "runtime"
        )
      );
    }

    return Ok(result.value);
  }

  /**
   * List all credentials across all stores
   *
   * Aggregates credentials from all available stores.
   * Deduplicates by provider+key, keeping highest priority store's version.
   *
   * @param provider - Optional filter by provider
   * @returns Result with array of credential references
   */
  async list(provider?: string): Promise<Result<readonly CredentialRef[], CredentialStoreError>> {
    const seen = new Set<string>();
    const refs: CredentialRef[] = [];
    let lastError: CredentialStoreError | null = null;

    for (const store of this.stores) {
      const availResult = await store.isAvailable();
      if (!availResult.ok || !availResult.value) {
        continue;
      }

      const result = await store.list(provider);

      if (!result.ok) {
        lastError = result.error;
        continue;
      }

      for (const ref of result.value) {
        const key = cacheKeyStr(ref.provider, ref.metadata?.tags?.key as string | undefined);
        // Only add if not already seen (higher priority stores are processed first)
        if (!seen.has(key)) {
          seen.add(key);
          refs.push(ref);
        }
      }
    }

    // Return empty array with last error only if no refs found
    if (refs.length === 0 && lastError) {
      return Err(lastError);
    }

    return Ok(refs);
  }

  /**
   * Check if a credential exists in any store
   *
   * @param provider - Provider name
   * @param key - Optional specific key
   * @returns Result with existence status
   */
  async exists(provider: string, key?: string): Promise<Result<boolean, CredentialStoreError>> {
    const result = await this.resolve(provider, key);
    if (!result.ok) {
      return result;
    }
    return Ok(result.value !== null);
  }

  /**
   * Get all registered stores
   *
   * @returns Readonly array of stores (sorted by priority)
   */
  getStores(): readonly CredentialStore[] {
    return this.stores;
  }

  /**
   * Get a store by name
   *
   * @param name - Store name (e.g., 'env', 'keychain', 'file')
   * @returns The store or undefined if not found
   */
  getStore(name: CredentialSource): CredentialStore | undefined {
    return this.stores.find((s) => s.name === name);
  }

  /**
   * Get writable stores (non-read-only)
   *
   * @returns Array of writable stores sorted by priority
   */
  getWritableStores(): readonly CredentialStore[] {
    return this.stores.filter((s) => !s.readOnly);
  }

  // ===========================================================================
  // Cache Management
  // ===========================================================================

  /**
   * Invalidate cache entries
   *
   * @param provider - Optional provider to invalidate (all if omitted)
   * @param key - Optional specific key to invalidate
   */
  invalidateCache(provider?: string, key?: string): void {
    this.emit({ type: "cache:invalidate", provider, key });

    if (provider === undefined) {
      // Clear entire cache
      this.cache.clear();
      return;
    }

    if (key !== undefined) {
      // Clear specific key
      this.cache.delete(cacheKeyStr(provider, key));
      return;
    }

    // Clear all keys for provider
    const prefix = `${provider}:`;
    for (const cacheKey of this.cache.keys()) {
      if (cacheKey === provider || cacheKey.startsWith(prefix)) {
        this.cache.delete(cacheKey);
      }
    }
  }

  /**
   * Get cache statistics
   *
   * @returns Cache size and TTL info
   */
  getCacheStats(): { size: number; ttlMs: number } {
    return {
      size: this.cache.size,
      ttlMs: this.cacheTtlMs,
    };
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Add an event listener
   *
   * @param listener - Function to call on events
   * @returns Unsubscribe function
   */
  on(listener: CredentialResolverListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: CredentialResolverEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  // ===========================================================================
  // Private Cache Helpers
  // ===========================================================================

  /**
   * Get cached credential if valid
   *
   * @returns Credential, null (negative cache), or undefined (not cached/expired)
   */
  private getCached(cacheKey: string): Credential | null | undefined {
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.cachedAt > entry.ttlMs) {
      this.cache.delete(cacheKey);
      return undefined;
    }

    return entry.credential;
  }

  /**
   * Set cached credential
   */
  private setCached(cacheKey: string, credential: Credential | null): void {
    this.cache.set(cacheKey, {
      credential,
      cachedAt: Date.now(),
      ttlMs: this.cacheTtlMs,
    });
  }
}
