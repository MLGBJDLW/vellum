/**
 * Prompt Hot-Reload Integration (T038)
 *
 * Integrates PromptWatcher with PromptLoader for automatic cache
 * invalidation when prompt files change. File changes are reflected
 * in the next agent turn.
 *
 * @module @vellum/core/prompts/hot-reload
 * @see REQ-009
 */

import type { CommandLoader } from "../commands/command-loader.js";
import { createLogger } from "../logger/index.js";
import type { SkillManager } from "../skill/manager.js";
import type { WorkflowLoader } from "../workflows/workflow-loader.js";
import type { PromptLoader } from "./prompt-loader.js";
import {
  type PromptChangeEvent,
  PromptWatcher,
  type PromptWatcherOptions,
} from "./prompt-watcher.js";

// =============================================================================
// Constants
// =============================================================================

const logger = createLogger({ name: "hot-reload" });

// =============================================================================
// Types
// =============================================================================

/**
 * Callback for reload events.
 */
export type ReloadCallback = (paths: string[]) => void;

/**
 * Options for the hot-reload integration.
 */
export interface HotReloadOptions extends PromptWatcherOptions {
  /**
   * PromptLoader instance to invalidate.
   */
  promptLoader?: PromptLoader;

  /**
   * SkillManager instance to refresh.
   */
  skillManager?: SkillManager;

  /**
   * CommandLoader instance to refresh.
   */
  commandLoader?: CommandLoader;

  /**
   * WorkflowLoader instance to refresh.
   */
  workflowLoader?: WorkflowLoader;

  /**
   * Callback when prompts are reloaded.
   */
  onReload?: ReloadCallback;

  /**
   * Whether to log reload events.
   * @default true
   */
  logReloads?: boolean;
}

/**
 * Statistics about hot-reload activity.
 */
export interface HotReloadStats {
  /** Total number of invalidations */
  invalidations: number;
  /** Total number of files invalidated */
  filesInvalidated: number;
  /** Last invalidation timestamp */
  lastInvalidation: number | null;
  /** Number of errors encountered */
  errors: number;
}

// =============================================================================
// HotReloadIntegration Class
// =============================================================================

/**
 * Integrates file watching with prompt/skill/command caches.
 *
 * When files change in watched directories:
 * 1. PromptLoader cache is invalidated for changed prompts
 * 2. SkillManager is refreshed for changed skills
 * 3. CommandLoader cache is cleared for changed commands
 * 4. WorkflowLoader cache is cleared for changed workflows
 *
 * Changes are reflected in the next agent turn without restart.
 *
 * @example
 * ```typescript
 * const hotReload = new HotReloadIntegration({
 *   workspacePath: '/path/to/project',
 *   promptLoader: myPromptLoader,
 *   skillManager: mySkillManager,
 *   onReload: (paths) => {
 *     console.log('Reloaded:', paths);
 *   },
 * });
 *
 * hotReload.start();
 *
 * // Later...
 * hotReload.stop();
 * ```
 */
export class HotReloadIntegration {
  private readonly watcher: PromptWatcher;
  private readonly promptLoader?: PromptLoader;
  private readonly skillManager?: SkillManager;
  private readonly commandLoader?: CommandLoader;
  private readonly workflowLoader?: WorkflowLoader;
  private readonly onReload?: ReloadCallback;
  private readonly logReloads: boolean;
  private readonly stats: HotReloadStats = {
    invalidations: 0,
    filesInvalidated: 0,
    lastInvalidation: null,
    errors: 0,
  };
  private unsubscribers: Array<() => void> = [];

  /**
   * Creates a new HotReloadIntegration instance.
   *
   * @param options - Integration configuration
   */
  constructor(options: HotReloadOptions) {
    this.watcher = new PromptWatcher({
      workspacePath: options.workspacePath,
      watchUserPrompts: options.watchUserPrompts,
      debounceMs: options.debounceMs,
      recursive: options.recursive,
    });

    this.promptLoader = options.promptLoader;
    this.skillManager = options.skillManager;
    this.commandLoader = options.commandLoader;
    this.workflowLoader = options.workflowLoader;
    this.onReload = options.onReload;
    this.logReloads = options.logReloads ?? true;
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Starts the hot-reload integration.
   *
   * Begins watching prompt directories and sets up invalidation handlers.
   */
  start(): void {
    // Subscribe to invalidation events
    const unsubInvalidate = this.watcher.onInvalidate((paths) => {
      this.handleInvalidation(paths);
    });
    this.unsubscribers.push(unsubInvalidate);

    // Subscribe to individual change events for logging
    const unsubChange = this.watcher.onChange((event) => {
      this.handleChange(event);
    });
    this.unsubscribers.push(unsubChange);

    // Subscribe to errors
    const unsubError = this.watcher.onError((error) => {
      this.handleError(error);
    });
    this.unsubscribers.push(unsubError);

    // Start the watcher
    this.watcher.start();

    if (this.logReloads) {
      logger.info("Hot-reload integration started", {
        watcherCount: this.watcher.getWatcherCount(),
      });
    }
  }

  /**
   * Stops the hot-reload integration.
   *
   * Stops watching and cleans up all subscriptions.
   */
  stop(): void {
    // Unsubscribe from all events
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];

    // Stop the watcher
    this.watcher.stop();

    if (this.logReloads) {
      logger.info("Hot-reload integration stopped", {
        stats: this.getStats(),
      });
    }
  }

  /**
   * Checks if the integration is currently running.
   *
   * @returns True if watching, false otherwise
   */
  isRunning(): boolean {
    return this.watcher.isWatching();
  }

  /**
   * Gets statistics about hot-reload activity.
   *
   * @returns Current statistics
   */
  getStats(): HotReloadStats {
    return { ...this.stats };
  }

  /**
   * Sets the workspace path and restarts watching.
   *
   * @param path - New workspace path
   */
  setWorkspacePath(path: string): void {
    this.watcher.setWorkspacePath(path);

    // Also update PromptLoader if available
    if (this.promptLoader) {
      this.promptLoader.setWorkspacePath(path);
    }
  }

  /**
   * Manually triggers a full cache invalidation.
   *
   * Useful for forcing a refresh without file changes.
   */
  invalidateAll(): void {
    if (this.promptLoader) {
      this.promptLoader.invalidateAll();
    }

    // Note: SkillManager doesn't have a refresh method yet
    // Skills are re-initialized on next access if needed

    if (this.commandLoader) {
      this.commandLoader.clearCache();
    }

    if (this.workflowLoader) {
      this.workflowLoader.clearCache();
    }

    this.stats.invalidations++;
    this.stats.lastInvalidation = Date.now();

    if (this.logReloads) {
      logger.info("Manual cache invalidation triggered");
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Handles batch invalidation events.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Categorizes paths and handles multiple invalidation types
  private handleInvalidation(paths: string[]): void {
    this.stats.invalidations++;
    this.stats.filesInvalidated += paths.length;
    this.stats.lastInvalidation = Date.now();

    // Categorize paths by type
    const promptPaths: string[] = [];
    const skillPaths: string[] = [];
    const commandPaths: string[] = [];
    const workflowPaths: string[] = [];

    for (const path of paths) {
      const lower = path.toLowerCase();
      if (lower.includes("/prompts/") || lower.includes("/rules/")) {
        promptPaths.push(path);
      } else if (lower.includes("/skills/") || lower.includes("skill.md")) {
        skillPaths.push(path);
      } else if (lower.includes("/commands/")) {
        commandPaths.push(path);
      } else if (lower.includes("/workflows/")) {
        workflowPaths.push(path);
      }
    }

    // Invalidate prompt cache
    if (promptPaths.length > 0 && this.promptLoader) {
      for (const path of promptPaths) {
        this.promptLoader.invalidateByPath(path);
      }
    }

    // Refresh skills
    // Note: SkillManager doesn't have a refresh method yet - skills are loaded on demand
    if (skillPaths.length > 0 && this.skillManager) {
      logger.debug("Skills changed, will be reloaded on next access", { paths: skillPaths });
    }

    // Clear command cache
    if (commandPaths.length > 0 && this.commandLoader) {
      this.commandLoader.clearCache();
    }

    // Clear workflow cache
    if (workflowPaths.length > 0 && this.workflowLoader) {
      this.workflowLoader.clearCache();
    }

    // Notify callback
    if (this.onReload) {
      this.onReload(paths);
    }

    if (this.logReloads) {
      logger.info("Caches invalidated", {
        prompts: promptPaths.length,
        skills: skillPaths.length,
        commands: commandPaths.length,
        workflows: workflowPaths.length,
      });
    }
  }

  /**
   * Handles individual change events (for logging).
   */
  private handleChange(event: PromptChangeEvent): void {
    if (this.logReloads) {
      logger.debug("File changed", {
        type: event.eventType,
        path: event.relativePath,
      });
    }
  }

  /**
   * Handles watcher errors.
   */
  private handleError(error: Error): void {
    this.stats.errors++;
    logger.error("Hot-reload watcher error", { error: error.message });
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Creates a HotReloadIntegration instance.
 *
 * @param options - Integration configuration
 * @returns A new HotReloadIntegration instance
 */
export function createHotReload(options: HotReloadOptions): HotReloadIntegration {
  return new HotReloadIntegration(options);
}
