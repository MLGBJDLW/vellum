// ============================================
// Agent Discovery (T011)
// ============================================
// Discovers and watches custom agent definition files.
// @see REQ-004, REQ-006, REQ-007

import { EventEmitter } from "node:events";
import { statSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { type FSWatcher, watch } from "chokidar";

import type { Logger } from "../../logger/logger.js";
import { AgentLoader, isSupportedAgentFile } from "./loader.js";
import { createInheritanceResolver, type InheritanceResolver } from "./resolver.js";
import type { CustomAgentDefinition } from "./types.js";

// ============================================
// Constants
// ============================================

/** Default debounce delay for file change events (ms) */
export const DEFAULT_DEBOUNCE_MS = 300;

/** Agent file glob patterns */
const AGENT_GLOB_PATTERNS = ["*.yaml", "*.yml", "*.md", "**/*.yaml", "**/*.yml", "**/*.md"];

// ============================================
// Types
// ============================================

/**
 * Source priority levels (higher = more priority).
 * CLI > ENV > Project > User > System
 */
export enum DiscoverySource {
  SYSTEM = 0,
  USER = 1,
  PROJECT = 2,
  ENV = 3,
  CLI = 4,
}

/**
 * Information about a discovered agent.
 */
export interface DiscoveredAgent {
  /** The agent definition */
  definition: CustomAgentDefinition;
  /** Source path where agent was found */
  sourcePath: string;
  /** Discovery source priority */
  source: DiscoverySource;
  /** Last modification time */
  modifiedAt: Date;
}

/**
 * Events emitted by AgentDiscovery.
 */
export interface AgentDiscoveryEvents {
  /** Emitted when a new agent is discovered */
  "agent:added": [agent: DiscoveredAgent];
  /** Emitted when an existing agent is modified */
  "agent:changed": [agent: DiscoveredAgent];
  /** Emitted when an agent is removed */
  "agent:removed": [slug: string, sourcePath: string];
  /** Emitted when a discovery error occurs */
  "discovery:error": [error: Error, filePath?: string];
  /** Emitted when initial discovery completes */
  "discovery:ready": [];
}

/**
 * Options for AgentDiscovery.
 */
export interface AgentDiscoveryOptions {
  /** Custom search paths (overrides default) */
  paths?: string[];
  /** Debounce delay for file changes (ms) */
  debounceMs?: number;
  /** Logger instance */
  logger?: Logger;
  /** Whether to watch for changes (default: true) */
  watchEnabled?: boolean;
  /** Custom loader instance */
  loader?: AgentLoader;
  /** Custom resolver instance */
  resolver?: InheritanceResolver;
  /** Whether to resolve inheritance automatically (default: true) */
  autoResolve?: boolean;
}

/**
 * Pending change event for debouncing.
 */
interface PendingChange {
  type: "add" | "change" | "unlink";
  filePath: string;
  timestamp: number;
}

// ============================================
// AgentDiscovery Class
// ============================================

/**
 * Discovers and watches custom agent definition files.
 *
 * Features:
 * - Scans priority-ordered paths (CLI > ENV > Project > User > System)
 * - Hot-reload with chokidar file watching
 * - Debounced change events (300ms default)
 * - Cross-platform path handling (Windows/Unix)
 * - Event-driven architecture
 *
 * @example
 * ```typescript
 * const discovery = new AgentDiscovery({
 *   paths: ['.vellum/agents'],
 *   logger: console,
 * });
 *
 * discovery.on('agent:added', (agent) => {
 *   console.log(`New agent: ${agent.definition.slug}`);
 * });
 *
 * discovery.on('agent:changed', (agent) => {
 *   console.log(`Updated: ${agent.definition.slug}`);
 * });
 *
 * discovery.on('agent:removed', (slug) => {
 *   console.log(`Removed: ${slug}`);
 * });
 *
 * // Initial discovery
 * const agents = await discovery.discover();
 *
 * // Start watching for changes
 * discovery.watch();
 *
 * // Later...
 * discovery.stop();
 * ```
 */
export class AgentDiscovery extends EventEmitter<AgentDiscoveryEvents> {
  private readonly options: Required<
    Pick<AgentDiscoveryOptions, "debounceMs" | "watchEnabled" | "autoResolve">
  > &
    AgentDiscoveryOptions;
  private readonly loader: AgentLoader;
  /**
   * Reserved for future inheritance support.
   * @internal
   */
  public readonly resolver: InheritanceResolver;

  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges: Map<string, PendingChange> = new Map();
  private isWatching = false;

  /** Map of discovered agents by slug */
  private agents: Map<string, DiscoveredAgent> = new Map();
  /** Map of file paths to agent slugs */
  private pathToSlug: Map<string, string> = new Map();

  /**
   * Creates a new AgentDiscovery instance.
   *
   * @param options - Discovery configuration options
   */
  constructor(options: AgentDiscoveryOptions = {}) {
    super();
    this.options = {
      debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      watchEnabled: options.watchEnabled ?? true,
      autoResolve: options.autoResolve ?? true,
      ...options,
    };
    this.loader = options.loader ?? new AgentLoader();
    this.resolver = options.resolver ?? createInheritanceResolver();
  }

  /**
   * Whether the watcher is currently active.
   */
  get watching(): boolean {
    return this.isWatching;
  }

  /**
   * Gets the current agent count.
   */
  get count(): number {
    return this.agents.size;
  }

  /**
   * Gets an agent by slug.
   */
  get(slug: string): DiscoveredAgent | undefined {
    return this.agents.get(slug);
  }

  /**
   * Checks if an agent exists.
   */
  has(slug: string): boolean {
    return this.agents.has(slug);
  }

  /**
   * Gets all discovered agents.
   */
  getAll(): Map<string, DiscoveredAgent> {
    return new Map(this.agents);
  }

  /**
   * Discovers agents from configured paths.
   *
   * @param customPaths - Optional custom paths to scan (overrides configured paths)
   * @returns Map of agent slug to discovered agent info
   */
  async discover(customPaths?: string[]): Promise<Map<string, CustomAgentDefinition>> {
    const paths = customPaths ?? this.options.paths ?? this.getDefaultPaths();
    this.agents.clear();
    this.pathToSlug.clear();

    // Scan each path in priority order (lower index = lower priority)
    for (let i = 0; i < paths.length; i++) {
      const searchPath = paths[i];
      if (!searchPath) continue;

      const source = this.getSourcePriority(searchPath, i, paths.length);
      await this.scanDirectory(searchPath, source);
    }

    this.emit("discovery:ready");

    // Return just the definitions
    const result = new Map<string, CustomAgentDefinition>();
    for (const [slug, agent] of this.agents) {
      result.set(slug, agent.definition);
    }
    return result;
  }

  /**
   * Starts watching for file changes.
   * Must call discover() first.
   */
  watch(): void {
    if (this.isWatching) {
      return;
    }

    if (!this.options.watchEnabled) {
      return;
    }

    const paths = this.options.paths ?? this.getDefaultPaths();
    const existingPaths = paths.filter((p) => this.directoryExists(p));

    if (existingPaths.length === 0) {
      this.options.logger?.warn("No valid agent directories to watch");
      return;
    }

    // Build glob patterns for agent files
    const watchPatterns = existingPaths.flatMap((basePath) =>
      AGENT_GLOB_PATTERNS.map((pattern) => path.join(basePath, pattern))
    );

    this.watcher = watch(watchPatterns, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
      ignored: ["**/node_modules/**", "**/.git/**"],
    });

    this.watcher.on("add", (filePath) => this.handleFileEvent(filePath, "add"));
    this.watcher.on("change", (filePath) => this.handleFileEvent(filePath, "change"));
    this.watcher.on("unlink", (filePath) => this.handleFileEvent(filePath, "unlink"));
    this.watcher.on("error", (error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.logger?.error("Agent watcher error", { error: err });
      this.emit("discovery:error", err);
    });

    this.isWatching = true;
    this.options.logger?.debug("Agent discovery watcher started");
  }

  /**
   * Stops watching for file changes.
   */
  async stop(): Promise<void> {
    if (!this.isWatching) {
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.pendingChanges.clear();
    this.isWatching = false;
    this.options.logger?.debug("Agent discovery watcher stopped");
  }

  /**
   * Forces a reload of a specific agent file.
   */
  async reload(filePath: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);

    if (!isSupportedAgentFile(normalizedPath)) {
      return;
    }

    const result = await this.loader.loadFile(normalizedPath);

    if (result.ok) {
      const definition = result.value;
      const existingAgent = this.agents.get(definition.slug);
      const source = this.getSourceFromPath(normalizedPath);

      const agent: DiscoveredAgent = {
        definition,
        sourcePath: normalizedPath,
        source,
        modifiedAt: new Date(),
      };

      // Update mappings
      const oldSlug = this.pathToSlug.get(normalizedPath);
      if (oldSlug && oldSlug !== definition.slug) {
        this.agents.delete(oldSlug);
      }

      this.agents.set(definition.slug, agent);
      this.pathToSlug.set(normalizedPath, definition.slug);

      // Emit appropriate event
      if (existingAgent) {
        this.emit("agent:changed", agent);
      } else {
        this.emit("agent:added", agent);
      }
    } else {
      this.emit("discovery:error", new Error(result.error.message), normalizedPath);
    }
  }

  /**
   * Gets default search paths in priority order (lowest to highest).
   */
  private getDefaultPaths(): string[] {
    const paths: string[] = [];

    // System paths (lowest priority)
    // Could add system-wide paths here

    // User home directory
    const userHome = os.homedir();
    paths.push(path.join(userHome, ".vellum", "agents"));

    // Project-level (current working directory)
    paths.push(path.join(process.cwd(), ".vellum", "agents"));

    // ENV-specified paths
    const envPaths = process.env.VELLUM_AGENT_PATHS;
    if (envPaths) {
      const separator = process.platform === "win32" ? ";" : ":";
      paths.push(...envPaths.split(separator).filter(Boolean));
    }

    return paths;
  }

  /**
   * Determines source priority based on path.
   */
  private getSourcePriority(
    searchPath: string,
    index: number,
    totalPaths: number
  ): DiscoverySource {
    const userHome = os.homedir();
    const cwd = process.cwd();

    if (searchPath.startsWith(userHome)) {
      return DiscoverySource.USER;
    }
    if (searchPath.startsWith(cwd)) {
      return DiscoverySource.PROJECT;
    }

    // Map index to priority (later indices = higher priority)
    const ratio = index / totalPaths;
    if (ratio > 0.75) return DiscoverySource.CLI;
    if (ratio > 0.5) return DiscoverySource.ENV;
    if (ratio > 0.25) return DiscoverySource.PROJECT;
    return DiscoverySource.SYSTEM;
  }

  /**
   * Gets source from a file path.
   */
  private getSourceFromPath(filePath: string): DiscoverySource {
    const userHome = os.homedir();
    const cwd = process.cwd();

    if (filePath.startsWith(path.join(cwd, ".vellum"))) {
      return DiscoverySource.PROJECT;
    }
    if (filePath.startsWith(path.join(userHome, ".vellum"))) {
      return DiscoverySource.USER;
    }
    return DiscoverySource.SYSTEM;
  }

  /**
   * Scans a directory for agent files.
   */
  private async scanDirectory(dirPath: string, source: DiscoverySource): Promise<void> {
    const normalizedDir = this.normalizePath(dirPath);

    if (!this.directoryExists(normalizedDir)) {
      this.options.logger?.debug(`Agent directory does not exist: ${normalizedDir}`);
      return;
    }

    try {
      await this.scanDirectoryRecursive(normalizedDir, source);
    } catch (err) {
      this.options.logger?.error(`Failed to scan directory: ${normalizedDir}`, {
        error: err,
      });
      this.emit(
        "discovery:error",
        err instanceof Error ? err : new Error(String(err)),
        normalizedDir
      );
    }
  }

  /**
   * Recursively scans a directory for agent files.
   */
  private async scanDirectoryRecursive(dirPath: string, source: DiscoverySource): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and .git
        if (entry.name === "node_modules" || entry.name === ".git") {
          continue;
        }
        await this.scanDirectoryRecursive(fullPath, source);
      } else if (entry.isFile() && isSupportedAgentFile(entry.name)) {
        await this.loadAgentFile(fullPath, source);
      }
    }
  }

  /**
   * Loads a single agent file.
   */
  private async loadAgentFile(filePath: string, source: DiscoverySource): Promise<void> {
    const result = await this.loader.loadFile(filePath);

    if (!result.ok) {
      this.options.logger?.warn(`Failed to load agent: ${filePath}`, {
        error: result.error.message,
      });
      this.emit("discovery:error", new Error(result.error.message), filePath);
      return;
    }

    const definition = result.value;

    // Check for slug conflicts (higher priority wins)
    const existing = this.agents.get(definition.slug);
    if (existing && existing.source > source) {
      this.options.logger?.debug(
        `Agent "${definition.slug}" from higher priority source already exists`
      );
      return;
    }

    // Get file stats for modification time
    let modifiedAt = new Date();
    try {
      const stats = await fs.stat(filePath);
      modifiedAt = stats.mtime;
    } catch {
      // Use current time if stat fails
    }

    const agent: DiscoveredAgent = {
      definition,
      sourcePath: filePath,
      source,
      modifiedAt,
    };

    this.agents.set(definition.slug, agent);
    this.pathToSlug.set(filePath, definition.slug);

    this.options.logger?.debug(`Loaded agent: ${definition.slug} from ${filePath}`);
  }

  /**
   * Handles a file system event.
   */
  private handleFileEvent(filePath: string, eventType: "add" | "change" | "unlink"): void {
    const normalizedPath = this.normalizePath(filePath);

    if (!isSupportedAgentFile(normalizedPath)) {
      return;
    }

    // Queue the change for debouncing
    this.pendingChanges.set(normalizedPath, {
      type: eventType,
      filePath: normalizedPath,
      timestamp: Date.now(),
    });

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingChanges();
    }, this.options.debounceMs);
  }

  /**
   * Processes all pending file changes after debounce period.
   */
  private async processPendingChanges(): Promise<void> {
    const changes = new Map(this.pendingChanges);
    this.pendingChanges.clear();
    this.debounceTimer = null;

    for (const [filePath, change] of changes) {
      try {
        if (change.type === "unlink") {
          // File removed
          const slug = this.pathToSlug.get(filePath);
          if (slug) {
            this.agents.delete(slug);
            this.pathToSlug.delete(filePath);
            this.emit("agent:removed", slug, filePath);
          }
        } else {
          // File added or changed
          await this.reload(filePath);
        }
      } catch (err) {
        this.emit("discovery:error", err instanceof Error ? err : new Error(String(err)), filePath);
      }
    }
  }

  /**
   * Normalizes a path for cross-platform compatibility.
   */
  private normalizePath(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, path.sep);
  }

  /**
   * Checks if a directory exists synchronously.
   */
  private directoryExists(dirPath: string): boolean {
    try {
      const stat = statSync(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates a new AgentDiscovery instance.
 */
export function createAgentDiscovery(options?: AgentDiscoveryOptions): AgentDiscovery {
  return new AgentDiscovery(options);
}
