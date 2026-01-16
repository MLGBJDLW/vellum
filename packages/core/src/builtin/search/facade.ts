/**
 * Search Facade
 *
 * High-level API for search operations. Provides a simple interface
 * that automatically selects the best backend.
 *
 * @module builtin/search/facade
 */

import { getDefaultStrategySelector, type StrategySelector } from "./strategy-selector.js";
import type { BackendType, SearchOptions, SearchResult } from "./types.js";

// =============================================================================
// Search Facade
// =============================================================================

/**
 * High-level search API that abstracts backend selection.
 *
 * The facade provides a simple interface for search operations,
 * automatically selecting the best available backend. It also
 * allows forcing a specific backend when needed.
 *
 * @example
 * ```typescript
 * // Simple search (auto-selects best backend)
 * const facade = new SearchFacade();
 * const result = await facade.search({
 *   query: "TODO",
 *   mode: "literal",
 *   paths: ["./src"],
 * });
 *
 * // Force specific backend
 * const gitResult = await facade.searchWithBackend("git-grep", {
 *   query: "FIXME",
 *   mode: "literal",
 * });
 * ```
 */
export class SearchFacade {
  private readonly strategySelector: StrategySelector;

  /**
   * Create a new search facade.
   *
   * @param strategySelector - Optional custom strategy selector
   */
  constructor(strategySelector?: StrategySelector) {
    this.strategySelector = strategySelector ?? getDefaultStrategySelector();
  }

  /**
   * Execute a search using the best available backend.
   *
   * @param options - Search options
   * @returns Search results
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const backend = await this.strategySelector.selectBestBackend();
    return backend.search(options);
  }

  /**
   * Execute a search with a specific backend.
   *
   * @param backendName - Name of the backend to use
   * @param options - Search options
   * @returns Search results
   * @throws Error if the specified backend is not available
   */
  async searchWithBackend(backendName: BackendType, options: SearchOptions): Promise<SearchResult> {
    const backend = this.strategySelector.getBackend(backendName);

    if (!backend) {
      throw new Error(`Unknown search backend: ${backendName}`);
    }

    const available = await backend.isAvailable();
    if (!available) {
      throw new Error(`Search backend '${backendName}' is not available`);
    }

    return backend.search(options);
  }

  /**
   * Get list of available backend names.
   *
   * @returns Array of available backend names
   */
  async getAvailableBackends(): Promise<string[]> {
    const availability = await this.strategySelector.probeAll();
    const available: string[] = [];

    for (const [name, isAvailable] of availability) {
      if (isAvailable) {
        available.push(name);
      }
    }

    return available;
  }

  /**
   * Get list of all registered backend names (regardless of availability).
   *
   * @returns Array of all backend names
   */
  getAllBackends(): string[] {
    return this.strategySelector.getBackendNames();
  }

  /**
   * Check if a specific backend is available.
   *
   * @param backendName - Name of the backend to check
   * @returns true if available
   */
  async isBackendAvailable(backendName: string): Promise<boolean> {
    return this.strategySelector.isBackendAvailable(backendName);
  }

  /**
   * Get the name of the best available backend without executing a search.
   *
   * @returns Name of the best available backend
   */
  async getBestBackendName(): Promise<string> {
    const backend = await this.strategySelector.selectBestBackend();
    return backend.name;
  }

  /**
   * Clear the backend availability cache.
   * Useful when environment changes (e.g., entering/leaving a git repo).
   */
  clearCache(): void {
    this.strategySelector.clearCache();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/** Default search facade instance */
let defaultFacade: SearchFacade | null = null;

/**
 * Get the default search facade instance.
 *
 * @returns Singleton SearchFacade instance
 */
export function getSearchFacade(): SearchFacade {
  if (!defaultFacade) {
    defaultFacade = new SearchFacade();
  }
  return defaultFacade;
}

/**
 * Reset the default search facade.
 * Useful for testing or when environment changes significantly.
 */
export function resetSearchFacade(): void {
  defaultFacade = null;
}
