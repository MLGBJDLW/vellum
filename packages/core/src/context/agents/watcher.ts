// ============================================
// Agents Watcher
// ============================================
// File watching for AGENTS.md hot reload support.
// Implements REQ-017 (file watching), REQ-018 (debounce).

import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { type FSWatcher, watch } from "chokidar";
import {
  AGENTS_FILE_PATTERNS,
  type AgentsFilePattern,
  DEFAULT_STOP_BOUNDARIES,
} from "./discovery.js";

// ============================================
// Types
// ============================================

/**
 * Options for AgentsWatcher.
 */
export interface AgentsWatcherOptions {
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Additional file patterns to watch */
  additionalPatterns?: string[];
  /** Whether to watch parent directories (default: true) */
  watchParents?: boolean;
  /** Maximum depth to watch parent directories (default: 10) */
  maxParentDepth?: number;
}

/**
 * Events emitted by AgentsWatcher.
 */
export interface AgentsWatcherEvents {
  /** Emitted when AGENTS.md files change (after debounce) */
  change: [changedPaths: string[]];
  /** Emitted when a watcher error occurs */
  error: [error: Error];
  /** Emitted when watching starts */
  ready: [];
}

/**
 * Information about a file change event.
 */
interface PendingChange {
  /** Changed file path */
  filePath: string;
  /** Type of change */
  eventType: "add" | "change" | "unlink";
  /** Timestamp of the change */
  timestamp: number;
}

// ============================================
// Constants
// ============================================

/** Default debounce delay: 300ms */
const DEFAULT_DEBOUNCE_MS = 300;

/** Default max parent depth to watch */
const DEFAULT_MAX_PARENT_DEPTH = 10;

// ============================================
// AgentsWatcher Class
// ============================================

/**
 * Watches AGENTS.md files for changes with debounced reload events.
 *
 * AgentsWatcher uses chokidar to monitor file system changes and
 * emits debounced 'change' events when AGENTS.md files are modified.
 * This enables hot reload of agent configurations without excessive
 * file system operations.
 *
 * @example
 * ```typescript
 * const watcher = new AgentsWatcher('/project/src', { debounceMs: 500 });
 *
 * watcher.on('change', (paths) => {
 *   console.log('AGENTS.md files changed:', paths);
 *   // Reload configuration
 * });
 *
 * watcher.on('error', (error) => {
 *   console.error('Watch error:', error);
 * });
 *
 * await watcher.start();
 *
 * // Later...
 * await watcher.stop();
 * ```
 */
export class AgentsWatcher extends EventEmitter<AgentsWatcherEvents> {
  private readonly startPath: string;
  private readonly debounceMs: number;
  private readonly additionalPatterns: string[];
  private readonly watchParents: boolean;
  private readonly maxParentDepth: number;

  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges: Map<string, PendingChange> = new Map();
  private watchTargets = new Set<string>();
  private isRunning = false;

  /**
   * Creates a new AgentsWatcher.
   *
   * @param startPath - Directory to watch from
   * @param options - Watcher configuration options
   */
  constructor(startPath: string, options: AgentsWatcherOptions = {}) {
    super();
    this.startPath = path.resolve(startPath);
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.additionalPatterns = options.additionalPatterns ?? [];
    this.watchParents = options.watchParents ?? true;
    this.maxParentDepth = options.maxParentDepth ?? DEFAULT_MAX_PARENT_DEPTH;
  }

  /**
   * Starts watching for AGENTS.md file changes.
   *
   * Sets up chokidar watchers for:
   * - All patterns in AGENTS_FILE_PATTERNS in the start directory
   * - Optionally, parent directories up to project root
   * - Any additional patterns specified in options
   *
   * @throws Error if already watching
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("AgentsWatcher is already running");
    }

    const watchPaths = await this.buildWatchPaths();
    this.watchTargets = new Set(watchPaths.map((filePath) => this.normalizePath(filePath)));
    // Watch existing directory roots so files and nested directories created later
    // are observed too. Chokidar no longer expands glob patterns.
    const directories = new Set<string>();
    for (const filePath of watchPaths) {
      let directory = path.dirname(filePath);
      while (true) {
        try {
          if ((await fs.stat(directory)).isDirectory()) break;
        } catch {
          // Find the existing ancestor of a not-yet-created instruction directory.
        }
        const parent = path.dirname(directory);
        if (parent === directory) break;
        directory = parent;
      }
      directories.add(directory);
    }

    this.watcher = watch([...directories], {
      persistent: true,
      // Parent instruction lookup must not recursively subscribe to a home directory.
      backend: "native",
      ignoreInitial: true, // Don't emit events for existing files
      awaitWriteFinish: {
        // Wait for writes to complete
        stabilityThreshold: 100,
        pollInterval: 50,
      },
      // Prune everything except target files and their ancestor directories.
      ignored: (filePath) => {
        const normalized = this.normalizePath(filePath);
        if (this.watchTargets.has(normalized)) return false;
        const prefix = normalized.endsWith(path.sep) ? normalized : `${normalized}${path.sep}`;
        for (const target of this.watchTargets) {
          if (target.startsWith(prefix)) return false;
        }
        return true;
      },
    });

    // Set up event handlers
    this.watcher.on("add", (filePath) => this.handleFileEvent(filePath, "add"));
    this.watcher.on("change", (filePath) => this.handleFileEvent(filePath, "change"));
    this.watcher.on("unlink", (filePath) => this.handleFileEvent(filePath, "unlink"));
    this.watcher.on("error", (error) =>
      this.emit("error", error instanceof Error ? error : new Error(String(error)))
    );

    // Wait for ready
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        this.watcher?.removeListener("error", onError);
        this.isRunning = true;
        this.emit("ready");
        resolve();
      };
      const onError = (err: unknown) => {
        this.watcher?.removeListener("ready", onReady);
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      this.watcher?.once("ready", onReady);
      this.watcher?.once("error", onError);
    });
  }

  /**
   * Stops watching for file changes.
   *
   * Cleans up all watchers and pending timers.
   */
  async stop(): Promise<void> {
    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Clear pending changes
    this.pendingChanges.clear();

    // Close watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.isRunning = false;
  }

  /**
   * Gets whether the watcher is currently running.
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Gets the debounce delay in milliseconds.
   */
  get debounceDelay(): number {
    return this.debounceMs;
  }

  /**
   * Gets the paths being watched.
   * Only available after start() is called.
   */
  getWatchedPaths(): string[] {
    if (!this.watcher) {
      return [];
    }
    const watched = this.watcher.getWatched();
    const paths: string[] = [];
    for (const [dir, files] of Object.entries(watched)) {
      for (const file of files) {
        paths.push(path.join(dir, file));
      }
    }
    return paths;
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Builds the list of paths to watch.
   */
  private async buildWatchPaths(): Promise<string[]> {
    const paths: string[] = [];
    const patterns = this.getFilePatterns();
    const watchRoot = await this.findWatchRoot();
    const canWatchParents = this.watchParents && watchRoot !== this.startPath;

    // Watch patterns in start directory
    for (const pattern of patterns) {
      paths.push(path.join(this.startPath, pattern));
    }

    // Watch patterns in parent directories
    if (canWatchParents) {
      let currentDir = this.startPath;
      let depth = 0;

      while (depth < this.maxParentDepth) {
        const parentDir = path.dirname(currentDir);

        // Reached filesystem root
        if (parentDir === currentDir) {
          break;
        }

        // Add patterns for parent directory
        for (const pattern of patterns) {
          paths.push(path.join(parentDir, pattern));
        }

        if (parentDir === watchRoot) {
          break;
        }

        currentDir = parentDir;
        depth++;
      }
    }

    // Add additional patterns
    for (const pattern of this.additionalPatterns) {
      paths.push(path.join(this.startPath, pattern));
    }

    return paths;
  }

  /**
   * Find the nearest parent directory containing a stop boundary.
   * If none found within maxParentDepth, fall back to startPath.
   */
  private async findWatchRoot(): Promise<string> {
    if (!this.watchParents) {
      return this.startPath;
    }

    let currentDir = this.startPath;
    let depth = 0;

    while (depth < this.maxParentDepth) {
      if (await this.isBoundary(currentDir)) {
        return currentDir;
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }

      currentDir = parentDir;
      depth++;
    }

    return this.startPath;
  }

  /**
   * Check if a directory contains any stop boundary markers.
   */
  private async isBoundary(dirPath: string): Promise<boolean> {
    for (const boundary of DEFAULT_STOP_BOUNDARIES) {
      const boundaryPath = path.join(dirPath, boundary);
      try {
        await fs.access(boundaryPath);
        return true;
      } catch {
        // Boundary marker doesn't exist, continue checking
      }
    }
    return false;
  }

  /**
   * Gets the file patterns to watch.
   */
  private getFilePatterns(): string[] {
    return AGENTS_FILE_PATTERNS.map((p: AgentsFilePattern) => p.pattern);
  }

  /**
   * Handles a file system event.
   */
  private handleFileEvent(filePath: string, eventType: "add" | "change" | "unlink"): void {
    // Check if this is an agents file
    if (!this.isAgentsFile(filePath)) {
      return;
    }

    // Add to pending changes
    this.pendingChanges.set(this.normalizePath(filePath), {
      filePath,
      eventType,
      timestamp: Date.now(),
    });

    // Reset debounce timer
    this.scheduleEmit();
  }

  /**
   * Checks if a file path matches AGENTS.md patterns.
   */
  private isAgentsFile(filePath: string): boolean {
    return this.watchTargets.has(this.normalizePath(filePath));
  }

  private normalizePath(filePath: string): string {
    const resolved = path.resolve(filePath);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  }

  /**
   * Schedules the debounced emit.
   */
  private scheduleEmit(): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      this.emitChanges();
    }, this.debounceMs);
  }

  /**
   * Emits accumulated changes.
   */
  private emitChanges(): void {
    if (this.pendingChanges.size === 0) {
      return;
    }

    // Collect changed paths
    const changedPaths = Array.from(this.pendingChanges.values(), (change) => change.filePath);

    // Clear pending changes
    this.pendingChanges.clear();
    this.debounceTimer = null;

    // Emit change event
    this.emit("change", changedPaths);
  }
}
