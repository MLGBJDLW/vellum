// ============================================
// Watcher Registry
// ============================================
// Central registry for managing multiple file watchers.
// Provides unified event handling and lifecycle management.
// @see REQ-036: General file watching system

import { EventEmitter } from "node:events";

import type { Logger } from "../logger/logger.js";
import type { WatchEvent, WatcherPreset, WatcherRegistryEvents, WatchOptions } from "./types.js";
import { createWatcher, type FileWatcher } from "./watcher.js";

// ============================================
// WatcherRegistry Class
// ============================================

/**
 * Central registry for managing multiple file watchers.
 *
 * WatcherRegistry provides:
 * - Registration and lifecycle management of multiple watchers
 * - Unified event handling across all watchers
 * - Watcher lookup by ID
 * - Batch start/stop operations
 *
 * @example
 * ```typescript
 * const registry = new WatcherRegistry(logger);
 *
 * // Register watchers
 * registry.register({
 *   id: 'config',
 *   path: '/project',
 *   include: ['*.config.*'],
 * });
 *
 * registry.register({
 *   id: 'source',
 *   path: '/project/src',
 *   include: ['*.ts'],
 * });
 *
 * // Listen for changes from any watcher
 * registry.on('change', (watcherId, events) => {
 *   console.log(`Changes from ${watcherId}:`, events);
 * });
 *
 * // Start all watchers
 * await registry.startAll();
 *
 * // Later...
 * await registry.stopAll();
 * ```
 */
export class WatcherRegistry extends EventEmitter<WatcherRegistryEvents> {
  private readonly watchers: Map<string, FileWatcher> = new Map();
  private readonly logger?: Logger;

  /**
   * Creates a new WatcherRegistry.
   *
   * @param logger - Optional logger for debugging
   */
  constructor(logger?: Logger) {
    super();
    this.logger = logger;
  }

  /**
   * Number of registered watchers.
   */
  get size(): number {
    return this.watchers.size;
  }

  /**
   * Get all registered watcher IDs.
   */
  get watcherIds(): string[] {
    return Array.from(this.watchers.keys());
  }

  /**
   * Register a new watcher.
   *
   * @param options - Watcher configuration
   * @returns The created FileWatcher instance
   * @throws Error if a watcher with the same ID already exists
   */
  register(options: WatchOptions): FileWatcher {
    const watcher = createWatcher(options, this.logger);

    if (this.watchers.has(watcher.id)) {
      throw new Error(`Watcher with ID "${watcher.id}" already registered`);
    }

    // Set up event forwarding
    watcher.on("change", (events) => {
      this.emit("change", watcher.id, events);
    });

    watcher.on("error", (error) => {
      this.emit("error", watcher.id, error);
    });

    this.watchers.set(watcher.id, watcher);
    this.logger?.debug("Watcher registered", { id: watcher.id, name: watcher.name });
    this.emit("register", watcher.id);

    return watcher;
  }

  /**
   * Register a watcher from a preset configuration.
   *
   * @param preset - Watcher preset configuration
   * @param basePath - Base path to watch
   * @returns The created FileWatcher instance
   */
  registerFromPreset(preset: WatcherPreset, basePath: string): FileWatcher {
    return this.register({
      id: preset.id,
      name: preset.name,
      path: basePath,
      include: preset.include,
      ignore: preset.ignore,
      debounceMs: preset.debounceMs,
      recursive: preset.recursive,
    });
  }

  /**
   * Unregister and stop a watcher.
   *
   * @param id - Watcher ID to unregister
   * @returns true if watcher was found and removed
   */
  async unregister(id: string): Promise<boolean> {
    const watcher = this.watchers.get(id);
    if (!watcher) {
      return false;
    }

    // Stop the watcher
    if (watcher.running) {
      await watcher.stop();
    }

    // Remove from registry
    this.watchers.delete(id);
    this.logger?.debug("Watcher unregistered", { id });
    this.emit("unregister", id);

    return true;
  }

  /**
   * Get a watcher by ID.
   *
   * @param id - Watcher ID
   * @returns The FileWatcher or undefined if not found
   */
  get(id: string): FileWatcher | undefined {
    return this.watchers.get(id);
  }

  /**
   * Check if a watcher is registered.
   *
   * @param id - Watcher ID
   * @returns true if watcher exists
   */
  has(id: string): boolean {
    return this.watchers.has(id);
  }

  /**
   * Get all registered watchers.
   *
   * @returns Map of watcher ID to FileWatcher
   */
  getAll(): Map<string, FileWatcher> {
    return new Map(this.watchers);
  }

  /**
   * Start all registered watchers.
   *
   * @returns Array of watcher IDs that were started
   */
  async startAll(): Promise<string[]> {
    const started: string[] = [];

    for (const [id, watcher] of this.watchers) {
      if (!watcher.running) {
        try {
          await watcher.start();
          started.push(id);
        } catch (error) {
          this.logger?.error("Failed to start watcher", {
            id,
            error: error instanceof Error ? error.message : String(error),
          });
          this.emit("error", id, error instanceof Error ? error : new Error(String(error)));
        }
      }
    }

    this.logger?.info("Started watchers", { count: started.length, ids: started });
    return started;
  }

  /**
   * Stop all registered watchers.
   *
   * @returns Array of watcher IDs that were stopped
   */
  async stopAll(): Promise<string[]> {
    const stopped: string[] = [];

    for (const [id, watcher] of this.watchers) {
      if (watcher.running) {
        try {
          await watcher.stop();
          stopped.push(id);
        } catch (error) {
          this.logger?.error("Failed to stop watcher", {
            id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    this.logger?.info("Stopped watchers", { count: stopped.length, ids: stopped });
    return stopped;
  }

  /**
   * Start a specific watcher.
   *
   * @param id - Watcher ID
   * @throws Error if watcher not found
   */
  async start(id: string): Promise<void> {
    const watcher = this.watchers.get(id);
    if (!watcher) {
      throw new Error(`Watcher "${id}" not found`);
    }
    await watcher.start();
  }

  /**
   * Stop a specific watcher.
   *
   * @param id - Watcher ID
   * @throws Error if watcher not found
   */
  async stop(id: string): Promise<void> {
    const watcher = this.watchers.get(id);
    if (!watcher) {
      throw new Error(`Watcher "${id}" not found`);
    }
    await watcher.stop();
  }

  /**
   * Clear all watchers (stops and removes all).
   */
  async clear(): Promise<void> {
    await this.stopAll();
    this.watchers.clear();
    this.logger?.debug("Registry cleared");
  }

  /**
   * Subscribe to changes from a specific watcher.
   *
   * @param id - Watcher ID
   * @param callback - Callback for change events
   * @returns Unsubscribe function
   * @throws Error if watcher not found
   */
  subscribe(id: string, callback: (events: WatchEvent[]) => void): () => void {
    const watcher = this.watchers.get(id);
    if (!watcher) {
      throw new Error(`Watcher "${id}" not found`);
    }

    watcher.on("change", callback);
    return () => watcher.off("change", callback);
  }

  /**
   * Get status of all watchers.
   */
  getStatus(): Map<string, { running: boolean; eventCount: number }> {
    const status = new Map<string, { running: boolean; eventCount: number }>();
    for (const [id, watcher] of this.watchers) {
      status.set(id, {
        running: watcher.running,
        eventCount: watcher.state.eventCount,
      });
    }
    return status;
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new WatcherRegistry instance.
 *
 * @param logger - Optional logger for debugging
 * @returns A new WatcherRegistry instance
 */
export function createWatcherRegistry(logger?: Logger): WatcherRegistry {
  return new WatcherRegistry(logger);
}
