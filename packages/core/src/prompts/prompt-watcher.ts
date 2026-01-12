// ============================================
// Prompt Watcher
// ============================================

/**
 * File system watcher for prompt hot-reload.
 *
 * Watches prompt directories for changes and emits events
 * when files are added, modified, or deleted. Includes
 * debouncing to handle rapid successive changes.
 *
 * @module @vellum/core/prompts/prompt-watcher
 * @see REQ-009
 */

import { EventEmitter } from "node:events";
import { existsSync, type FSWatcher, type WatchEventType, watch } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";

// =============================================================================
// Constants
// =============================================================================

/**
 * Default debounce interval in milliseconds.
 */
const DEFAULT_DEBOUNCE_MS = 100;

/**
 * Directories to watch (relative to workspace).
 */
const WATCH_DIRECTORIES = [".vellum/prompts", ".vellum/rules", ".vellum/skills"] as const;

// =============================================================================
// Types
// =============================================================================

/**
 * Event types for file changes.
 */
export type PromptWatchEventType = "add" | "change" | "unlink";

/**
 * Change event payload.
 */
export interface PromptChangeEvent {
  /**
   * Type of change event.
   */
  eventType: PromptWatchEventType;

  /**
   * Absolute path to the changed file.
   */
  filePath: string;

  /**
   * Path relative to the watch root.
   */
  relativePath: string;

  /**
   * Timestamp of the change.
   */
  timestamp: number;
}

/**
 * Options for configuring the PromptWatcher.
 */
export interface PromptWatcherOptions {
  /**
   * Path to the workspace/project root.
   */
  workspacePath?: string;

  /**
   * Whether to watch user global prompts (~/.vellum/).
   * @default true
   */
  watchUserPrompts?: boolean;

  /**
   * Debounce interval in milliseconds.
   * @default 100
   */
  debounceMs?: number;

  /**
   * Whether to watch recursively.
   * @default true
   */
  recursive?: boolean;
}

/**
 * Type definition for watcher event handlers.
 */
export interface PromptWatcherEventMap {
  /**
   * Emitted when prompt files change (after debounce).
   */
  invalidate: [paths: string[]];

  /**
   * Emitted for each individual change.
   */
  change: [event: PromptChangeEvent];

  /**
   * Emitted when an error occurs.
   */
  error: [error: Error];

  /**
   * Emitted when the watcher is ready.
   */
  ready: [];

  /**
   * Emitted when the watcher is stopped.
   */
  stopped: [];
}

// =============================================================================
// PromptWatcher Class
// =============================================================================

/**
 * Watches prompt directories for file changes with debounced invalidation.
 *
 * Uses Node.js `fs.watch` for efficient file system monitoring.
 * Emits events when files are added, modified, or deleted.
 *
 * @example
 * ```typescript
 * const watcher = new PromptWatcher({
 *   workspacePath: '/path/to/project',
 *   debounceMs: 100,
 * });
 *
 * watcher.onInvalidate((paths) => {
 *   console.log('Files changed:', paths);
 *   // Reload affected prompts
 * });
 *
 * await watcher.start();
 *
 * // Later...
 * await watcher.stop();
 * ```
 */
export class PromptWatcher extends EventEmitter<PromptWatcherEventMap> {
  private readonly workspacePath?: string;
  private readonly watchUserPrompts: boolean;
  private readonly debounceMs: number;
  private readonly recursive: boolean;
  private readonly watchers: Map<string, FSWatcher> = new Map();
  private readonly pendingChanges: Map<string, PromptChangeEvent> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Creates a new PromptWatcher instance.
   *
   * @param options - Watcher configuration options
   */
  constructor(options: PromptWatcherOptions = {}) {
    super();
    this.workspacePath = options.workspacePath;
    this.watchUserPrompts = options.watchUserPrompts ?? true;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.recursive = options.recursive ?? true;
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Starts watching all configured directories.
   *
   * Creates file system watchers for:
   * - Workspace prompt directories (.vellum/prompts/, etc.)
   * - User global prompts (~/.vellum/prompts/) if enabled
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Watch workspace directories
    if (this.workspacePath) {
      for (const dir of WATCH_DIRECTORIES) {
        const fullPath = join(this.workspacePath, dir);
        this.watchDirectory(fullPath);
      }
    }

    // Watch user global directory
    if (this.watchUserPrompts) {
      const userPath = join(homedir(), ".vellum", "prompts");
      this.watchDirectory(userPath);
    }

    this.emit("ready");
  }

  /**
   * Stops all watchers and cleans up.
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Close all watchers
    for (const [path, watcher] of this.watchers.entries()) {
      try {
        watcher.close();
      } catch {
        // Ignore close errors
      }
      this.watchers.delete(path);
    }

    // Clear pending changes
    this.pendingChanges.clear();

    this.isRunning = false;
    this.emit("stopped");
  }

  /**
   * Registers a callback for invalidation events.
   *
   * @param callback - Function to call when files change
   * @returns Unsubscribe function
   */
  onInvalidate(callback: (paths: string[]) => void): () => void {
    this.on("invalidate", callback);
    return () => this.off("invalidate", callback);
  }

  /**
   * Registers a callback for individual change events.
   *
   * @param callback - Function to call for each change
   * @returns Unsubscribe function
   */
  onChange(callback: (event: PromptChangeEvent) => void): () => void {
    this.on("change", callback);
    return () => this.off("change", callback);
  }

  /**
   * Registers a callback for error events.
   *
   * @param callback - Function to call on errors
   * @returns Unsubscribe function
   */
  onError(callback: (error: Error) => void): () => void {
    this.on("error", callback);
    return () => this.off("error", callback);
  }

  /**
   * Checks if the watcher is currently running.
   *
   * @returns True if watching, false otherwise
   */
  isWatching(): boolean {
    return this.isRunning;
  }

  /**
   * Gets the number of active watchers.
   *
   * @returns Number of active file system watchers
   */
  getWatcherCount(): number {
    return this.watchers.size;
  }

  /**
   * Sets the workspace path and restarts watching.
   *
   * @param path - New workspace path
   */
  setWorkspacePath(path: string): void {
    const wasRunning = this.isRunning;

    if (wasRunning) {
      this.stop();
    }

    // Use Object.assign to set readonly property during reconfiguration
    Object.assign(this, { workspacePath: path });

    if (wasRunning) {
      this.start();
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Starts watching a specific directory.
   */
  private watchDirectory(dirPath: string): void {
    // Skip if directory doesn't exist
    if (!existsSync(dirPath)) {
      return;
    }

    // Skip if already watching
    if (this.watchers.has(dirPath)) {
      return;
    }

    try {
      const watcher = watch(dirPath, { recursive: this.recursive }, (eventType, filename) => {
        this.handleWatchEvent(dirPath, eventType, filename);
      });

      watcher.on("error", (error) => {
        this.emit("error", error);
        // Remove the broken watcher
        this.watchers.delete(dirPath);
      });

      this.watchers.set(dirPath, watcher);
    } catch (error) {
      // Directory might not be watchable, emit error and continue
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Handles a file system watch event.
   */
  private handleWatchEvent(
    watchRoot: string,
    eventType: WatchEventType,
    filename: string | null
  ): void {
    if (!filename) {
      return;
    }

    // Only process prompt files (.md)
    if (!filename.endsWith(".md")) {
      return;
    }

    const filePath = resolve(watchRoot, filename);
    const relativePath = relative(watchRoot, filePath);

    // Map fs.watch event types to our event types
    const mappedEventType: PromptWatchEventType = eventType === "rename" ? "change" : "change";

    const event: PromptChangeEvent = {
      eventType: mappedEventType,
      filePath,
      relativePath,
      timestamp: Date.now(),
    };

    // Add to pending changes
    this.pendingChanges.set(filePath, event);

    // Emit individual change event
    this.emit("change", event);

    // Debounce the invalidation
    this.scheduleFlush();
  }

  /**
   * Schedules a debounced flush of pending changes.
   */
  private scheduleFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushPendingChanges();
    }, this.debounceMs);
  }

  /**
   * Flushes pending changes and emits invalidation event.
   */
  private flushPendingChanges(): void {
    if (this.pendingChanges.size === 0) {
      return;
    }

    const paths = Array.from(this.pendingChanges.keys());
    this.pendingChanges.clear();
    this.debounceTimer = null;

    this.emit("invalidate", paths);
  }
}
