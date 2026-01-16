/**
 * Strategy Selector
 *
 * Intelligently selects the best available search backend based on
 * environment capabilities. Caches availability probes for performance.
 *
 * @module builtin/search/strategy-selector
 */

import { GitGrepBackend } from "./backends/git-grep.js";
import { JavaScriptBackend } from "./backends/javascript.js";
import { RipgrepBackend } from "./backends/ripgrep.js";
import type { SearchBackend } from "./types.js";

// =============================================================================
// Strategy Selector
// =============================================================================

/**
 * Selects the best search backend based on availability.
 *
 * Priority order:
 * 1. Ripgrep - fastest, most feature-complete
 * 2. Git grep - fast, respects .gitignore, available in git repos
 * 3. JavaScript - always available fallback
 *
 * @example
 * ```typescript
 * const selector = new StrategySelector();
 * const backend = await selector.selectBestBackend();
 * console.log(`Using ${backend.name} for search`);
 * ```
 */
export class StrategySelector {
  /** Available backends in priority order */
  private readonly backends: SearchBackend[];

  /** Cache for availability probes (backend name → available) */
  private availabilityCache = new Map<string, boolean>();

  /** TTL for cache entries in milliseconds (5 minutes) */
  private readonly cacheTtl = 5 * 60 * 1000;

  /** Timestamps for cache entries */
  private cacheTimestamps = new Map<string, number>();

  /**
   * Create a new strategy selector.
   *
   * @param backends - Optional custom backend list (for testing)
   */
  constructor(backends?: SearchBackend[]) {
    this.backends = backends ?? [
      new RipgrepBackend(),
      new GitGrepBackend(),
      new JavaScriptBackend(),
    ];
  }

  /**
   * Select the best available backend.
   *
   * Tries backends in priority order, returning the first available one.
   * Results are cached to avoid repeated availability probes.
   *
   * @returns The best available backend (always returns at least JavaScript)
   */
  async selectBestBackend(): Promise<SearchBackend> {
    for (const backend of this.backends) {
      const available = await this.checkAvailability(backend);
      if (available) {
        return backend;
      }
    }

    // Should never reach here since JavaScript is always available
    // but return the last backend as fallback
    return this.backends[this.backends.length - 1] ?? new JavaScriptBackend();
  }

  /**
   * Get a specific backend by name.
   *
   * @param name - Backend name ('ripgrep', 'git-grep', 'javascript')
   * @returns The requested backend or undefined if not found
   */
  getBackend(name: string): SearchBackend | undefined {
    return this.backends.find((b) => b.name === name);
  }

  /**
   * Probe all backends and return availability map.
   *
   * @returns Map of backend name to availability status
   */
  async probeAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    // Probe all backends in parallel
    await Promise.all(
      this.backends.map(async (backend) => {
        const available = await this.checkAvailability(backend, true);
        results.set(backend.name, available);
      })
    );

    return results;
  }

  /**
   * Get list of all registered backend names.
   *
   * @returns Array of backend names
   */
  getBackendNames(): string[] {
    return this.backends.map((b) => b.name);
  }

  /**
   * Clear the availability cache.
   * Useful when environment changes (e.g., entering/leaving a git repo).
   */
  clearCache(): void {
    this.availabilityCache.clear();
    this.cacheTimestamps.clear();
  }

  /**
   * Check if a specific backend is available.
   *
   * @param name - Backend name
   * @returns true if available
   */
  async isBackendAvailable(name: string): Promise<boolean> {
    const backend = this.getBackend(name);
    if (!backend) {
      return false;
    }
    return this.checkAvailability(backend);
  }

  /**
   * Check availability with caching.
   *
   * @param backend - Backend to check
   * @param forceRefresh - Force a fresh probe even if cached
   * @returns true if available
   */
  private async checkAvailability(backend: SearchBackend, forceRefresh = false): Promise<boolean> {
    const now = Date.now();

    // Check cache unless force refresh
    if (!forceRefresh) {
      const cached = this.availabilityCache.get(backend.name);
      const timestamp = this.cacheTimestamps.get(backend.name);

      if (cached !== undefined && timestamp !== undefined) {
        // Check if cache is still valid
        if (now - timestamp < this.cacheTtl) {
          return cached;
        }
      }
    }

    // Probe backend
    try {
      const available = await backend.isAvailable();
      this.availabilityCache.set(backend.name, available);
      this.cacheTimestamps.set(backend.name, now);
      return available;
    } catch {
      // Probe failed, mark as unavailable
      this.availabilityCache.set(backend.name, false);
      this.cacheTimestamps.set(backend.name, now);
      return false;
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/** Default strategy selector instance */
let defaultSelector: StrategySelector | null = null;

/**
 * Get the default strategy selector instance.
 *
 * @returns Singleton StrategySelector instance
 */
export function getDefaultStrategySelector(): StrategySelector {
  if (!defaultSelector) {
    defaultSelector = new StrategySelector();
  }
  return defaultSelector;
}

/**
 * Reset the default strategy selector.
 * Useful for testing or when environment changes significantly.
 */
export function resetDefaultStrategySelector(): void {
  defaultSelector = null;
}
