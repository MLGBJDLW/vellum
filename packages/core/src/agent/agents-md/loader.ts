// ============================================
// AGENTS.md Loader
// ============================================

/**
 * Main entry point for AGENTS.md directory scoping.
 *
 * Orchestrates scanning, caching, and resolution of AGENTS.md files
 * to provide directory-scoped agent instructions.
 *
 * @module @vellum/core/agent/agents-md/loader
 */

import * as path from "node:path";
import { AgentsMdResolver } from "./resolver.js";
import { AgentsMdScanner } from "./scanner.js";
import type {
  AgentsMdFile,
  AgentsMdLoaderOptions,
  AgentsMdScope,
  AgentsMdTree,
  IAgentsMdLoader,
  ScanResult,
} from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/** Default cache TTL: 5 seconds */
const DEFAULT_CACHE_TTL_MS = 5000;

// =============================================================================
// Cache Entry
// =============================================================================

interface CacheEntry {
  tree: AgentsMdTree;
  files: AgentsMdFile[];
  timestamp: number;
}

// =============================================================================
// AgentsMdLoader Class
// =============================================================================

/**
 * Loads and manages AGENTS.md files for directory scoping.
 *
 * Implements the Codex pattern:
 * - Scans project for AGENTS.md files
 * - Builds hierarchy tree
 * - Resolves scoped instructions for target files
 * - Caches results for performance
 *
 * @example
 * ```typescript
 * const loader = new AgentsMdLoader({ projectRoot: '/path/to/project' });
 *
 * // Scan for all AGENTS.md files
 * const result = await loader.scan();
 * console.log(`Found ${result.files.length} AGENTS.md files`);
 *
 * // Get instructions for a specific file
 * const instructions = await loader.getInstructionsFor('/path/to/project/src/utils/helper.ts');
 * console.log(instructions);
 *
 * // Resolve full scope with source info
 * const scope = await loader.resolve('/path/to/project/src/utils/helper.ts');
 * console.log(`Merged from ${scope.sources.length} files`);
 * ```
 */
export class AgentsMdLoader implements IAgentsMdLoader {
  private readonly projectRoot: string;
  private readonly scanner: AgentsMdScanner;
  private readonly cacheTtlMs: number;
  private readonly enableCache: boolean;
  private cache: CacheEntry | null = null;

  constructor(options: AgentsMdLoaderOptions) {
    this.projectRoot = path.resolve(options.projectRoot);
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.enableCache = options.enableCache ?? true;

    this.scanner = new AgentsMdScanner(this.projectRoot, {
      patterns: options.patterns,
      excludeDirs: options.excludeDirs,
      maxDepth: options.maxDepth,
    });
  }

  /**
   * Scan the project for AGENTS.md files.
   *
   * @returns Scan result with files, tree, and timing info
   */
  async scan(): Promise<ScanResult> {
    const startTime = Date.now();
    const errors: Error[] = [];

    try {
      // Scan for files
      const files = await this.scanner.scan();

      // Build tree
      const tree = this.scanner.buildTree(files);

      // Update cache
      if (this.enableCache) {
        this.cache = {
          tree,
          files,
          timestamp: Date.now(),
        };
      }

      const scanTimeMs = Date.now() - startTime;

      return {
        files,
        tree,
        errors,
        scanTimeMs,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));

      return {
        files: [],
        tree: this.createEmptyTree(),
        errors,
        scanTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Resolve applicable instructions for a target file.
   *
   * @param filePath - Absolute path to the target file
   * @returns Resolved scope with merged instructions
   */
  async resolve(filePath: string): Promise<AgentsMdScope> {
    const tree = await this.getHierarchy();
    const resolver = new AgentsMdResolver(tree);
    return resolver.resolve(filePath);
  }

  /**
   * Get the hierarchy tree.
   *
   * Scans if cache is invalid or disabled.
   *
   * @returns The current hierarchy tree
   */
  async getHierarchy(): Promise<AgentsMdTree> {
    // Check cache
    if (this.enableCache && this.cache && this.isCacheValid()) {
      return this.cache.tree;
    }

    // Scan and return tree
    const result = await this.scan();
    return result.tree;
  }

  /**
   * Get formatted instructions for a target file.
   *
   * @param filePath - Absolute path to the target file
   * @returns Instructions string
   */
  async getInstructionsFor(filePath: string): Promise<string> {
    const tree = await this.getHierarchy();
    const resolver = new AgentsMdResolver(tree);
    return resolver.getInstructionsFor(filePath);
  }

  /**
   * Invalidate the cache.
   */
  invalidate(): void {
    this.cache = null;
  }

  /**
   * Get all discovered files.
   *
   * @returns Array of all AGENTS.md files
   */
  async getFiles(): Promise<AgentsMdFile[]> {
    const tree = await this.getHierarchy();
    return tree.files;
  }

  /**
   * Check if a file path has applicable AGENTS.md scope.
   *
   * @param filePath - Path to check
   * @returns True if any AGENTS.md applies
   */
  async hasScope(filePath: string): Promise<boolean> {
    const tree = await this.getHierarchy();
    const resolver = new AgentsMdResolver(tree);
    return resolver.hasScope(filePath);
  }

  /**
   * Get the project root.
   */
  getProjectRoot(): string {
    return this.projectRoot;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private isCacheValid(): boolean {
    if (!this.cache) return false;
    return Date.now() - this.cache.timestamp < this.cacheTtlMs;
  }

  private createEmptyTree(): AgentsMdTree {
    return {
      root: {
        path: this.projectRoot,
        file: null,
        children: [],
        depth: 0,
      },
      files: [],
      projectRoot: this.projectRoot,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new AgentsMdLoader instance.
 *
 * @param options - Loader options
 * @returns New loader instance
 */
export function createAgentsMdLoader(options: AgentsMdLoaderOptions): AgentsMdLoader {
  return new AgentsMdLoader(options);
}
