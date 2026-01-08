// ============================================
// File Watcher
// ============================================
// General-purpose file watcher with debouncing, filtering, and event coalescing.
// Uses chokidar for cross-platform file watching with Bun compatibility.
// @see REQ-036: General file watching system

import { EventEmitter } from "node:events";
import * as path from "node:path";
import { type FSWatcher, watch } from "chokidar";
import picomatch from "picomatch";

import type { Logger } from "../logger/logger.js";
import {
  DEFAULT_WATCH_IGNORE_PATTERNS,
  type FileWatcherEvents,
  type WatchEvent,
  type WatchEventType,
  type WatcherState,
  type WatchOptions,
} from "./types.js";

// ============================================
// Constants
// ============================================

/** Default debounce delay: 300ms */
const DEFAULT_DEBOUNCE_MS = 300;

/** Default stability threshold for write finish: 100ms */
const DEFAULT_STABILITY_THRESHOLD = 100;

/** Poll interval for write stability: 50ms */
const STABILITY_POLL_INTERVAL = 50;

// ============================================
// FileWatcher Class
// ============================================

/**
 * General-purpose file watcher with debouncing and filtering.
 *
 * FileWatcher provides:
 * - Debounced change events to coalesce rapid file changes
 * - Glob pattern filtering for includes/excludes
 * - Recursive directory watching
 * - Event coalescing (multiple changes to same file → single event)
 * - Cross-platform support via chokidar
 *
 * @example
 * ```typescript
 * const watcher = new FileWatcher({
 *   path: '/project',
 *   include: ['*.ts', '*.tsx'],
 *   ignore: ['**\/dist/**'],
 *   debounceMs: 500,
 * });
 *
 * watcher.on('change', (events) => {
 *   console.log('Files changed:', events);
 * });
 *
 * await watcher.start();
 *
 * // Later...
 * await watcher.stop();
 * ```
 */
export class FileWatcher extends EventEmitter<FileWatcherEvents> {
  readonly id: string;
  readonly name: string;
  readonly watchPath: string;
  readonly recursive: boolean;
  readonly debounceMs: number;
  readonly includePatterns: string[];
  readonly ignorePatterns: string[];
  readonly ignoreInitial: boolean;
  readonly awaitWriteFinish: boolean;
  readonly stabilityThreshold: number;

  private readonly logger?: Logger;
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingEvents: Map<string, WatchEvent> = new Map();
  private _running = false;
  private _startedAt?: number;
  private _eventCount = 0;
  private _lastError?: Error;

  /**
   * Creates a new FileWatcher.
   *
   * @param options - Watcher configuration
   * @param logger - Optional logger for debugging
   */
  constructor(options: WatchOptions, logger?: Logger) {
    super();
    this.id = options.id ?? `watcher-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.name = options.name ?? `FileWatcher(${path.basename(options.path)})`;
    this.watchPath = path.resolve(options.path);
    this.recursive = options.recursive ?? true;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.includePatterns = options.include ?? [];
    this.ignorePatterns = [...DEFAULT_WATCH_IGNORE_PATTERNS, ...(options.ignore ?? [])];
    this.ignoreInitial = options.ignoreInitial ?? true;
    this.awaitWriteFinish = options.awaitWriteFinish ?? true;
    this.stabilityThreshold = options.stabilityThreshold ?? DEFAULT_STABILITY_THRESHOLD;
    this.logger = logger;
  }

  /**
   * Whether the watcher is currently running.
   */
  get running(): boolean {
    return this._running;
  }

  /**
   * Get current watcher state.
   */
  get state(): WatcherState {
    return {
      running: this._running,
      pendingEvents: this.pendingEvents.size,
      startedAt: this._startedAt,
      eventCount: this._eventCount,
      lastError: this._lastError,
    };
  }

  /**
   * Starts watching for file changes.
   *
   * @throws Error if already running
   */
  async start(): Promise<void> {
    if (this._running) {
      throw new Error(`FileWatcher "${this.name}" is already running`);
    }

    this.logger?.debug(`Starting ${this.name}`, {
      path: this.watchPath,
      recursive: this.recursive,
      include: this.includePatterns,
      ignore: this.ignorePatterns,
    });

    // Build chokidar options
    const watcherOptions: Parameters<typeof watch>[1] = {
      persistent: true,
      ignoreInitial: this.ignoreInitial,
      ignored: this.ignorePatterns,
      depth: this.recursive ? undefined : 0,
    };

    // Add awaitWriteFinish if enabled
    if (this.awaitWriteFinish) {
      watcherOptions.awaitWriteFinish = {
        stabilityThreshold: this.stabilityThreshold,
        pollInterval: STABILITY_POLL_INTERVAL,
      };
    }

    // Create watcher
    this.watcher = watch(this.watchPath, watcherOptions);

    // Set up event handlers
    this.watcher.on("add", (filePath) => this.handleEvent(filePath, "add", false));
    this.watcher.on("change", (filePath) => this.handleEvent(filePath, "change", false));
    this.watcher.on("unlink", (filePath) => this.handleEvent(filePath, "unlink", false));
    this.watcher.on("addDir", (filePath) => this.handleEvent(filePath, "addDir", true));
    this.watcher.on("unlinkDir", (filePath) => this.handleEvent(filePath, "unlinkDir", true));
    this.watcher.on("error", (error) => this.handleError(error));

    // Wait for ready
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        this.watcher?.removeListener("error", onError);
        this._running = true;
        this._startedAt = Date.now();
        this.logger?.info(`${this.name} ready`);
        this.emit("ready");
        resolve();
      };
      const onError = (err: unknown) => {
        this.watcher?.removeListener("ready", onReady);
        const error = err instanceof Error ? err : new Error(String(err));
        this._lastError = error;
        reject(error);
      };
      this.watcher?.once("ready", onReady);
      this.watcher?.once("error", onError);
    });
  }

  /**
   * Stops watching for file changes.
   * Cleans up all watchers and pending timers.
   */
  async stop(): Promise<void> {
    if (!this._running) {
      return;
    }

    // Clear pending debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Close watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.pendingEvents.clear();
    this._running = false;

    this.logger?.info(`${this.name} stopped`);
  }

  /**
   * Force flush any pending events immediately.
   * Useful for testing or when immediate processing is needed.
   */
  flush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.flushPendingEvents();
  }

  /**
   * Handle a file system event.
   */
  private handleEvent(filePath: string, type: WatchEventType, isDirectory: boolean): void {
    // Apply include filter if patterns are specified
    if (this.includePatterns.length > 0 && !isDirectory) {
      const relativePath = path.relative(this.watchPath, filePath);
      const matches = this.includePatterns.some((pattern) =>
        picomatch(pattern, { dot: true, matchBase: true })(relativePath)
      );
      if (!matches) {
        return;
      }
    }

    const relativePath = path.relative(this.watchPath, filePath);

    this.logger?.debug(`${this.name} event`, { type, path: relativePath });

    // Create event
    const event: WatchEvent = {
      type,
      path: filePath,
      relativePath,
      timestamp: Date.now(),
      isDirectory,
    };

    // Emit individual event
    switch (type) {
      case "add":
      case "addDir":
        this.emit("add", event);
        break;
      case "change":
        this.emit("update", event);
        break;
      case "unlink":
      case "unlinkDir":
        this.emit("remove", event);
        break;
    }

    // Add to pending events (coalesce by path)
    this.pendingEvents.set(filePath, event);

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => this.flushPendingEvents(), this.debounceMs);
  }

  /**
   * Handle watcher errors.
   */
  private handleError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this._lastError = err;
    this.logger?.error(`${this.name} error`, { error: err });
    this.emit("error", err);
  }

  /**
   * Flush pending events and emit change event.
   */
  private flushPendingEvents(): void {
    if (this.pendingEvents.size === 0) {
      return;
    }

    const events = Array.from(this.pendingEvents.values());
    this.pendingEvents.clear();
    this.debounceTimer = null;

    this._eventCount++;

    this.logger?.info(`${this.name} flushing changes`, {
      count: events.length,
      paths: events.map((e) => e.relativePath),
    });

    this.emit("change", events);
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new FileWatcher instance.
 *
 * @param options - Watcher configuration
 * @param logger - Optional logger for debugging
 * @returns A new FileWatcher instance
 *
 * @example
 * ```typescript
 * const watcher = createWatcher({
 *   path: '/project/src',
 *   include: ['*.ts'],
 *   debounceMs: 200,
 * });
 *
 * watcher.on('change', console.log);
 * await watcher.start();
 * ```
 */
export function createWatcher(options: WatchOptions, logger?: Logger): FileWatcher {
  return new FileWatcher(options, logger);
}
