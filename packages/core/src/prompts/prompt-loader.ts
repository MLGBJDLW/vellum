// ============================================
// Prompt Loader
// ============================================

/**
 * Progressive prompt loader with LRU caching and TypeScript fallback.
 *
 * Implements a two-level loading strategy:
 * - L1 (Warm): Return from LRU cache
 * - L2 (Cold): Read file, parse, cache result
 *
 * Falls back to TypeScript prompt definitions when markdown files
 * are not found or fail to parse.
 *
 * @module @vellum/core/prompts/prompt-loader
 * @see REQ-001, REQ-014, REQ-019
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { promptLoadError, promptNotFoundError } from "./errors.js";
import { PromptDiscovery, type PromptDiscoveryOptions } from "./prompt-discovery.js";
import { PromptParser } from "./prompt-parser.js";
import {
  ANALYST_PROMPT,
  ARCHITECT_PROMPT,
  CODER_PROMPT,
  ORCHESTRATOR_PROMPT,
  QA_PROMPT,
  WRITER_PROMPT,
} from "./roles/index.js";
import type { AgentRole, PromptCategory, PromptLoaded, PromptLocation } from "./types.js";

// =============================================================================
// Role Prompt Mapping (used for fallback)
// =============================================================================

const ROLE_PROMPTS: Record<AgentRole, string> = {
  orchestrator: ORCHESTRATOR_PROMPT,
  coder: CODER_PROMPT,
  qa: QA_PROMPT,
  writer: WRITER_PROMPT,
  analyst: ANALYST_PROMPT,
  architect: ARCHITECT_PROMPT,
};

function getRolePrompt(role: AgentRole): string {
  return ROLE_PROMPTS[role] ?? "";
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default maximum cache entries.
 */
const DEFAULT_MAX_CACHE_SIZE = 100;

/**
 * Default cache TTL in milliseconds (5 minutes).
 */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

// =============================================================================
// Types
// =============================================================================

/**
 * Cache entry for a loaded prompt.
 */
interface PromptCacheEntry {
  /**
   * Loaded prompt data.
   */
  data: PromptLoaded;

  /**
   * Source location information.
   */
  location: PromptLocation;

  /**
   * When the entry was cached.
   */
  cachedAt: number;

  /**
   * Last time the entry was accessed.
   */
  lastAccessedAt: number;
}

/**
 * Options for configuring the PromptLoader.
 */
export interface PromptLoaderOptions {
  /**
   * Options for prompt discovery.
   */
  discovery?: PromptDiscoveryOptions;

  /**
   * Custom PromptParser instance.
   */
  parser?: PromptParser;

  /**
   * Maximum number of cache entries.
   * @default 100
   */
  maxCacheSize?: number;

  /**
   * Cache TTL in milliseconds.
   * @default 300000 (5 minutes)
   */
  cacheTtlMs?: number;

  /**
   * Whether to enable TypeScript fallback.
   * @default true
   */
  enableFallback?: boolean;
}

/**
 * Result of a load operation with metadata.
 */
export interface LoadResult {
  /**
   * The loaded prompt.
   */
  prompt: PromptLoaded;

  /**
   * Whether the result came from cache.
   */
  fromCache: boolean;

  /**
   * Whether fallback was used.
   */
  usedFallback: boolean;
}

// =============================================================================
// PromptLoader Class
// =============================================================================

/**
 * Progressive prompt loader with LRU caching.
 *
 * Features:
 * - L1 (Warm) cache lookup
 * - L2 (Cold) file read and parse
 * - TypeScript fallback for missing/invalid prompts
 * - LRU eviction when cache is full
 * - TTL-based cache expiration
 *
 * @example
 * ```typescript
 * const loader = new PromptLoader({
 *   discovery: { workspacePath: '/path/to/project' },
 *   maxCacheSize: 50,
 *   cacheTtlMs: 60000, // 1 minute
 * });
 *
 * // Load a role prompt
 * const prompt = await loader.load('coder', 'role');
 *
 * // Load by path
 * const custom = await loader.loadByPath('/path/to/prompt.md');
 *
 * // Invalidate cache
 * loader.invalidate('coder');
 * loader.invalidateAll();
 * ```
 */
export class PromptLoader {
  private readonly discovery: PromptDiscovery;
  private readonly parser: PromptParser;
  private readonly cache: Map<string, PromptCacheEntry>;
  private readonly maxCacheSize: number;
  private readonly cacheTtlMs: number;
  private readonly enableFallback: boolean;

  /**
   * Creates a new PromptLoader instance.
   *
   * @param options - Loader configuration options
   */
  constructor(options: PromptLoaderOptions = {}) {
    this.discovery = new PromptDiscovery(options.discovery);
    this.parser = options.parser ?? new PromptParser();
    this.cache = new Map();
    this.maxCacheSize = options.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.enableFallback = options.enableFallback ?? true;
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Sets the workspace path for prompt discovery.
   *
   * @param path - Absolute path to the workspace root
   */
  setWorkspacePath(path: string): void {
    this.discovery.setWorkspacePath(path);
  }

  /**
   * Loads a prompt by name and category.
   *
   * Attempts to load from cache first (L1), then from file (L2),
   * and finally falls back to TypeScript definitions if enabled.
   *
   * @param name - The prompt name (without extension)
   * @param category - The prompt category
   * @returns The loaded prompt
   * @throws PromptError if prompt not found and fallback is disabled
   */
  async load(name: string, category: PromptCategory): Promise<PromptLoaded> {
    const cacheKey = this.getCacheKey(name, category);

    // L1: Check cache
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached.data;
    }

    // L2: Discover and load from file
    const location = await this.discovery.discoverByName(name);

    if (location) {
      try {
        const prompt = await this.loadFromFile(location);
        this.setCache(cacheKey, prompt, location);
        return prompt;
      } catch {
        // Fall through to fallback
      }
    }

    // Fallback to TypeScript
    if (this.enableFallback && category === "role") {
      const fallbackPrompt = this.loadFallback(name, category);
      if (fallbackPrompt) {
        return fallbackPrompt;
      }
    }

    throw promptNotFoundError(name, [
      this.discovery.getWorkspacePath() ?? "no workspace",
      this.discovery.getBuiltinPath(),
    ]);
  }

  /**
   * Loads a prompt from a specific file path.
   *
   * @param path - Absolute path to the prompt file
   * @returns The loaded prompt
   * @throws PromptError if file cannot be loaded
   */
  async loadByPath(path: string): Promise<PromptLoaded> {
    const cacheKey = `path:${path}`;

    // L1: Check cache
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached.data;
    }

    // L2: Load from file
    if (!existsSync(path)) {
      throw promptLoadError(path, "File not found");
    }

    const location: PromptLocation = {
      source: "project",
      path,
      priority: 1,
    };

    try {
      const prompt = await this.loadFromFile(location);
      this.setCache(cacheKey, prompt, location);
      return prompt;
    } catch (error) {
      throw promptLoadError(path, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Loads a role prompt with automatic fallback.
   *
   * @param role - The agent role
   * @returns The role prompt content string
   */
  async loadRole(role: AgentRole): Promise<string> {
    try {
      const prompt = await this.load(role, "role");
      return prompt.content;
    } catch {
      // Fallback to TypeScript role prompt
      return getRolePrompt(role);
    }
  }

  /**
   * Loads a coding mode prompt (vibe, plan, spec).
   *
   * Mode prompts contain mode-specific behavior instructions.
   * Returns null if the mode prompt does not exist (falls back to hardcoded).
   *
   * @param mode - The coding mode name (e.g., 'vibe', 'plan', 'spec')
   * @returns The mode prompt content string, or null if not found
   *
   * @example
   * ```typescript
   * const modePrompt = await loader.loadMode('vibe');
   * if (modePrompt) {
   *   builder.withModeOverrides(modePrompt);
   * }
   * ```
   */
  async loadMode(mode: string): Promise<string | null> {
    try {
      const loaded = await this.load(mode, "mode");
      return loaded.content;
    } catch {
      // Mode prompt is optional - return null instead of throwing
      return null;
    }
  }

  /**
   * Loads a provider-specific header prompt.
   *
   * Provider headers contain LLM-specific formatting instructions and best practices.
   * Returns null if the provider header does not exist (provider headers are optional).
   *
   * @param provider - The provider name (e.g., 'anthropic', 'openai', 'gemini', 'openrouter')
   * @returns The provider header content string, or null if not found
   *
   * @example
   * ```typescript
   * const header = await loader.loadProviderHeader('anthropic');
   * if (header) {
   *   // Prepend to system prompt
   *   systemPrompt = header + '\n\n' + systemPrompt;
   * }
   * ```
   */
  async loadProviderHeader(provider: string): Promise<string | null> {
    try {
      const loaded = await this.load(provider, "provider");
      return loaded.content;
    } catch {
      // Provider header is optional - return null instead of throwing
      return null;
    }
  }

  /**
   * Invalidates a cache entry by name.
   *
   * @param name - The prompt name to invalidate
   */
  invalidate(name: string): void {
    // Invalidate all cache keys that include this name
    for (const key of this.cache.keys()) {
      if (key.includes(name)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalidates all cache entries.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Invalidates cache entries for a specific file path.
   *
   * @param path - The file path to invalidate
   */
  invalidateByPath(path: string): void {
    // Invalidate by path key
    const pathKey = `path:${path}`;
    this.cache.delete(pathKey);

    // Also check if any cached entries have this path
    for (const [key, entry] of this.cache.entries()) {
      if (entry.location.path === path) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Gets cache statistics.
   *
   * @returns Cache size and TTL information
   */
  getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      ttlMs: this.cacheTtlMs,
    };
  }

  /**
   * Gets the underlying PromptDiscovery instance.
   *
   * @returns The discovery instance
   */
  getDiscovery(): PromptDiscovery {
    return this.discovery;
  }

  /**
   * Gets the underlying PromptParser instance.
   *
   * @returns The parser instance
   */
  getParser(): PromptParser {
    return this.parser;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Generates a cache key for a prompt.
   */
  private getCacheKey(name: string, category: PromptCategory): string {
    return `${category}:${name}`;
  }

  /**
   * Gets an entry from cache if valid.
   */
  private getFromCache(key: string): PromptCacheEntry | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check TTL
    const now = Date.now();
    if (now - entry.cachedAt > this.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    // Update last accessed time
    entry.lastAccessedAt = now;
    return entry;
  }

  /**
   * Sets a cache entry with LRU eviction.
   */
  private setCache(key: string, data: PromptLoaded, location: PromptLocation): void {
    // Evict LRU entry if at capacity
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      data,
      location,
      cachedAt: now,
      lastAccessedAt: now,
    });
  }

  /**
   * Evicts the least recently used cache entry.
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Loads a prompt from a file.
   */
  private async loadFromFile(location: PromptLocation): Promise<PromptLoaded> {
    const content = await readFile(location.path, "utf-8");
    return this.parser.parse(content, location);
  }

  /**
   * Loads a fallback prompt from TypeScript definitions.
   */
  private loadFallback(name: string, category: PromptCategory): PromptLoaded | null {
    if (category !== "role") {
      return null;
    }

    // Try to load from TypeScript role prompts
    const rolePrompt = getRolePrompt(name as AgentRole);
    if (!rolePrompt) {
      return null;
    }

    return {
      id: name,
      name,
      category: "role",
      content: rolePrompt,
      location: {
        source: "builtin",
        path: `builtin:roles/${name}`,
        priority: 99,
      },
      frontmatter: { fallback: true },
    };
  }
}
