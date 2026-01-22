// ============================================
// Agents Loader
// ============================================
// Orchestrates AGENTS.md discovery, parsing, and merging.
// Implements REQ-003 (caching), REQ-014 (single entry point), REQ-029 (graceful errors).

import * as path from "node:path";
import { AgentsFileDiscovery, type AgentsFileDiscoveryOptions } from "./discovery.js";
import { type MergeOptions, mergeConfigs } from "./merge.js";
import { type AgentsParseResult, AgentsParser, type AgentsParserOptions } from "./parser.js";
import type { AgentsConfig, AgentsFileLocation, AgentsLoadResult, AgentsWarning } from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Options for AgentsLoader.
 */
export interface AgentsLoaderOptions {
  /** Cache time-to-live in milliseconds (default: 5000) */
  cacheTtlMs?: number;
  /** Whether caching is enabled (default: true) */
  enableCache?: boolean;
  /** Options for file discovery */
  discoveryOptions?: AgentsFileDiscoveryOptions;
  /** Options for parsing */
  parserOptions?: AgentsParserOptions;
  /** Options for merging */
  mergeOptions?: MergeOptions;
}

/**
 * Cache entry with expiration tracking.
 */
interface CacheEntry {
  /** Cached load result */
  result: AgentsLoadResult;
  /** Timestamp when cache entry was created */
  createdAt: number;
}

// ============================================
// Constants
// ============================================

/** Default cache TTL: 5 seconds */
const DEFAULT_CACHE_TTL_MS = 5000;

// ============================================
// AgentsLoader Class
// ============================================

/**
 * Orchestrates AGENTS.md file loading with caching support.
 *
 * AgentsLoader is the single entry point for loading agent configurations.
 * It coordinates:
 * 1. Discovery - Finding all AGENTS.md files in the directory hierarchy
 * 2. Parsing - Converting file content to structured configuration
 * 3. Merging - Combining multiple configs with inheritance
 * 4. Caching - Avoiding redundant file I/O within TTL window
 *
 * @example
 * ```typescript
 * const loader = new AgentsLoader();
 *
 * // Load config from a directory
 * const result = await loader.load('/project/src/utils');
 * console.log(result.config?.instructions);
 * console.log(result.warnings); // Non-fatal issues
 * console.log(result.fromCache); // false on first load
 *
 * // Second call within 5s uses cache
 * const cached = await loader.load('/project/src/utils');
 * console.log(cached.fromCache); // true
 *
 * // Force reload
 * loader.invalidateCache('/project/src/utils');
 * ```
 */
export class AgentsLoader {
  private readonly discovery: AgentsFileDiscovery;
  private readonly parser: AgentsParser;
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTtlMs: number;
  private readonly enableCache: boolean;
  private readonly mergeOptions: MergeOptions;

  /**
   * Creates a new AgentsLoader.
   *
   * @param options - Loader configuration options
   */
  constructor(options: AgentsLoaderOptions = {}) {
    this.discovery = new AgentsFileDiscovery(options.discoveryOptions);
    this.parser = new AgentsParser(options.parserOptions);
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.enableCache = options.enableCache ?? true;
    this.mergeOptions = options.mergeOptions ?? {};
  }

  /**
   * Loads agents configuration from a directory.
   *
   * Orchestrates the full loading pipeline:
   * 1. Check cache (if enabled and not expired)
   * 2. Discover AGENTS.md files in directory hierarchy
   * 3. Parse each discovered file
   * 4. Merge configurations in inheritance order
   * 5. Cache result (if enabled)
   *
   * Errors are handled gracefully - parse failures become warnings,
   * and the loader continues with remaining files.
   *
   * @param startPath - Directory to start loading from (defaults to cwd)
   * @returns Load result with merged config, warnings, and cache status
   */
  async load(startPath: string = process.cwd()): Promise<AgentsLoadResult> {
    // Normalize path for cache key
    const normalizedPath = path.resolve(startPath);

    // Check cache
    if (this.enableCache) {
      const cached = this.getCachedEntry(normalizedPath);
      if (cached) {
        return {
          ...cached.result,
          fromCache: true,
        };
      }
    }

    // Discover files
    const warnings: AgentsWarning[] = [];
    const errors: Error[] = [];

    let fileLocations: AgentsFileLocation[];
    try {
      fileLocations = await this.discovery.discoverWithInheritance(normalizedPath);
    } catch (error) {
      // Discovery error is fatal
      return this.createErrorResult(
        error instanceof Error ? error : new Error(String(error)),
        warnings
      );
    }

    // No files found
    if (fileLocations.length === 0) {
      const result: AgentsLoadResult = {
        config: null,
        warnings: [
          {
            file: normalizedPath,
            message: "No AGENTS.md files found in directory hierarchy",
            severity: "info",
          },
        ],
        errors: [],
        fromCache: false,
      };
      this.cacheResult(normalizedPath, result);
      return result;
    }

    // Parse each file
    const parseResults: AgentsParseResult[] = [];
    for (const location of fileLocations) {
      try {
        const parseResult = await this.parser.parse(location.path);

        // Collect warnings from parsing
        warnings.push(...parseResult.warnings);

        // Collect errors as warnings (graceful degradation)
        for (const error of parseResult.errors) {
          warnings.push({
            file: location.path,
            message: `Parse error: ${error.message}`,
            severity: "warn",
          });
        }

        // Only include successfully parsed results with some content
        if (parseResult.frontmatter !== null || parseResult.instructions.trim()) {
          parseResults.push(parseResult);
        }
      } catch (error) {
        // Parse failure - log warning and continue
        warnings.push({
          file: location.path,
          message: `Failed to parse: ${error instanceof Error ? error.message : String(error)}`,
          severity: "warn",
        });
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Handle all files failed to parse
    if (parseResults.length === 0) {
      const result: AgentsLoadResult = {
        config: null,
        warnings,
        errors,
        fromCache: false,
      };
      this.cacheResult(normalizedPath, result);
      return result;
    }

    // Merge configurations
    let mergedConfig: AgentsConfig;
    try {
      const mergeResult = mergeConfigs(parseResults, this.mergeOptions);
      mergedConfig = mergeResult.config;
      warnings.push(...mergeResult.warnings);
    } catch (error) {
      // Merge error - return partial result
      warnings.push({
        file: normalizedPath,
        message: `Merge error: ${error instanceof Error ? error.message : String(error)}`,
        severity: "warn",
      });

      const result: AgentsLoadResult = {
        config: null,
        warnings,
        errors: [error instanceof Error ? error : new Error(String(error))],
        fromCache: false,
      };
      this.cacheResult(normalizedPath, result);
      return result;
    }

    // Build final result
    const result: AgentsLoadResult = {
      config: mergedConfig,
      warnings,
      errors,
      fromCache: false,
    };

    // Cache result
    this.cacheResult(normalizedPath, result);

    return result;
  }

  /**
   * Invalidates cached configuration.
   *
   * @param startPath - Path to invalidate (if omitted, clears all cache)
   */
  invalidateCache(startPath?: string): void {
    if (startPath === undefined) {
      this.cache.clear();
    } else {
      const normalizedPath = path.resolve(startPath);
      this.cache.delete(normalizedPath);
    }
  }

  /**
   * Gets the cache TTL in milliseconds.
   */
  get ttlMs(): number {
    return this.cacheTtlMs;
  }

  /**
   * Gets whether caching is enabled.
   */
  get isCacheEnabled(): boolean {
    return this.enableCache;
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Gets a cached entry if it exists and is not expired.
   */
  private getCachedEntry(normalizedPath: string): CacheEntry | null {
    const entry = this.cache.get(normalizedPath);
    if (!entry) {
      return null;
    }

    // Check expiration
    const now = Date.now();
    if (now - entry.createdAt > this.cacheTtlMs) {
      // Expired - remove and return null
      this.cache.delete(normalizedPath);
      return null;
    }

    return entry;
  }

  /**
   * Caches a load result.
   */
  private cacheResult(normalizedPath: string, result: AgentsLoadResult): void {
    if (!this.enableCache) {
      return;
    }

    this.cache.set(normalizedPath, {
      result: { ...result, fromCache: false }, // Store without fromCache flag
      createdAt: Date.now(),
    });
  }

  /**
   * Creates an error result.
   */
  private createErrorResult(error: Error, warnings: AgentsWarning[]): AgentsLoadResult {
    return {
      config: null,
      warnings,
      errors: [error],
      fromCache: false,
    };
  }
}
