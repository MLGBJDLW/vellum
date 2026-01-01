// ============================================
// Session Agents Integration
// ============================================
// Coordinates agents configuration loading, watching, and session integration.
// Implements REQ-015 (prompt integration), REQ-016 (tool filtering), REQ-019 (live reload).

import { EventEmitter } from "node:events";
import * as path from "node:path";

import { AgentsLoader, type AgentsLoaderOptions } from "./loader.js";
import {
  AgentsPromptBuilder,
  type PromptBuilderOptions,
  type PromptSection,
} from "./prompt-builder.js";
import {
  createAllowAllFilter,
  createDenyAllFilter,
  ToolAllowlistFilter,
} from "./tool-allowlist-filter.js";
import type { AgentsConfig, AgentsWarning } from "./types.js";
import { AgentsWatcher, type AgentsWatcherOptions } from "./watcher.js";

// ============================================
// Types
// ============================================

/**
 * Options for SessionAgentsIntegration.
 */
export interface SessionAgentsIntegrationOptions {
  /** Whether to enable file watching (default: true) */
  enableWatcher?: boolean;
  /** Cache TTL for loader in milliseconds (default: 5000) */
  cacheTtlMs?: number;
  /** Debounce delay for watcher in milliseconds (default: 300) */
  debounceMs?: number;
  /** Options for prompt building */
  promptBuilderOptions?: PromptBuilderOptions;
  /** Options for loader */
  loaderOptions?: Omit<AgentsLoaderOptions, "cacheTtlMs">;
  /** Options for watcher */
  watcherOptions?: Omit<AgentsWatcherOptions, "debounceMs">;
  /** Allow all tools if no config found (default: false) */
  allowAllIfNoConfig?: boolean;
}

/**
 * Events emitted by SessionAgentsIntegration.
 */
export interface SessionAgentsIntegrationEvents {
  /** Emitted when agents configuration changes */
  configChanged: [config: AgentsConfig | null, previousConfig: AgentsConfig | null];
  /** Emitted on errors */
  error: [error: Error];
  /** Emitted when initialization completes */
  initialized: [];
  /** Emitted when disposed */
  disposed: [];
}

/**
 * State of the session agents integration.
 */
export type SessionAgentsState = "uninitialized" | "initializing" | "ready" | "disposed";

// ============================================
// Constants
// ============================================

/** Default cache TTL: 5 seconds */
const DEFAULT_CACHE_TTL_MS = 5000;

/** Default debounce delay: 300ms */
const DEFAULT_DEBOUNCE_MS = 300;

// ============================================
// SessionAgentsIntegration Class
// ============================================

/**
 * Integrates agents configuration into session lifecycle.
 *
 * SessionAgentsIntegration coordinates:
 * - Loading agents configuration from the session path
 * - Building system prompt sections from configuration
 * - Creating tool filters based on allowed-tools
 * - Watching for configuration changes and updating in-place
 *
 * @example
 * ```typescript
 * const integration = new SessionAgentsIntegration();
 *
 * // Initialize for a session
 * await integration.initialize('/project/src');
 *
 * // Get system prompt sections
 * const sections = integration.getSystemPromptSections();
 *
 * // Get tool filter
 * const filter = integration.getToolFilter();
 * if (filter.isAllowed('ReadFile')) {
 *   // Tool is permitted
 * }
 *
 * // Listen for config changes
 * integration.on('configChanged', (newConfig, oldConfig) => {
 *   console.log('Config updated');
 * });
 *
 * // Clean up
 * await integration.dispose();
 * ```
 */
export class SessionAgentsIntegration extends EventEmitter<SessionAgentsIntegrationEvents> {
  private readonly options: Required<
    Pick<
      SessionAgentsIntegrationOptions,
      "enableWatcher" | "cacheTtlMs" | "debounceMs" | "allowAllIfNoConfig"
    >
  > &
    SessionAgentsIntegrationOptions;

  private loader: AgentsLoader | null = null;
  private watcher: AgentsWatcher | null = null;
  private promptBuilder: AgentsPromptBuilder;
  private toolFilter: ToolAllowlistFilter;
  private currentConfig: AgentsConfig | null = null;
  private sessionPath: string | null = null;
  private state: SessionAgentsState = "uninitialized";
  private lastWarnings: AgentsWarning[] = [];

  /**
   * Creates a new SessionAgentsIntegration.
   *
   * @param options - Integration configuration options
   */
  constructor(options: SessionAgentsIntegrationOptions = {}) {
    super();

    this.options = {
      enableWatcher: options.enableWatcher ?? true,
      cacheTtlMs: options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
      debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      allowAllIfNoConfig: options.allowAllIfNoConfig ?? false,
      promptBuilderOptions: options.promptBuilderOptions,
      loaderOptions: options.loaderOptions,
      watcherOptions: options.watcherOptions,
    };

    // Initialize prompt builder
    this.promptBuilder = new AgentsPromptBuilder(this.options.promptBuilderOptions);

    // Initialize with default filter (deny all or allow all based on option)
    this.toolFilter = this.options.allowAllIfNoConfig
      ? createAllowAllFilter()
      : createDenyAllFilter();
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Initializes the integration for a session path.
   *
   * Loads the agents configuration, sets up the watcher (if enabled),
   * and prepares prompt sections and tool filter.
   *
   * @param sessionPath - Directory path for the session
   * @throws Error if already initialized or disposed
   */
  async initialize(sessionPath: string): Promise<void> {
    if (this.state === "disposed") {
      throw new Error("SessionAgentsIntegration has been disposed");
    }

    if (this.state === "ready" || this.state === "initializing") {
      throw new Error("SessionAgentsIntegration is already initialized");
    }

    this.state = "initializing";
    this.sessionPath = path.resolve(sessionPath);

    try {
      // Create loader
      this.loader = new AgentsLoader({
        cacheTtlMs: this.options.cacheTtlMs,
        ...this.options.loaderOptions,
      });

      // Load initial configuration
      await this.loadConfig();

      // Set up watcher if enabled
      if (this.options.enableWatcher) {
        await this.setupWatcher();
      }

      this.state = "ready";
      this.emit("initialized");
    } catch (error) {
      this.state = "uninitialized";
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit("error", err);
      throw err;
    }
  }

  /**
   * Gets the current system prompt sections.
   *
   * @returns Array of formatted prompt sections
   */
  getSystemPromptSections(): PromptSection[] {
    const { sections } = this.promptBuilder.buildSystemPromptSections(this.currentConfig);
    return sections;
  }

  /**
   * Gets system prompt sections as string array.
   *
   * @returns Array of section content strings
   */
  getSystemPromptStrings(): string[] {
    return this.getSystemPromptSections().map((s) => s.content);
  }

  /**
   * Gets the formatted system prompt as a single string.
   *
   * @returns Formatted system prompt
   */
  getFormattedSystemPrompt(): string {
    return this.promptBuilder.formatAsSystemPrompt(this.getSystemPromptSections());
  }

  /**
   * Gets the current tool filter.
   *
   * @returns ToolAllowlistFilter configured from agents config
   */
  getToolFilter(): ToolAllowlistFilter {
    return this.toolFilter;
  }

  /**
   * Gets the current agents configuration.
   *
   * @returns Current AgentsConfig or null if not loaded
   */
  getConfig(): AgentsConfig | null {
    return this.currentConfig;
  }

  /**
   * Gets warnings from the last config load.
   *
   * @returns Array of warnings
   */
  getWarnings(): AgentsWarning[] {
    return [...this.lastWarnings];
  }

  /**
   * Gets the current state.
   *
   * @returns Current integration state
   */
  getState(): SessionAgentsState {
    return this.state;
  }

  /**
   * Checks if a tool is allowed by the current configuration.
   *
   * @param toolName - Name of the tool to check
   * @param args - Optional arguments for argument-based filtering
   * @returns true if tool is allowed
   */
  isToolAllowed(toolName: string, args?: string[]): boolean {
    return this.toolFilter.isAllowed(toolName, args);
  }

  /**
   * Forces a reload of the configuration.
   *
   * @returns Promise that resolves when reload completes
   */
  async reload(): Promise<void> {
    if (this.state !== "ready") {
      throw new Error("Cannot reload: integration is not ready");
    }

    if (this.loader && this.sessionPath) {
      this.loader.invalidateCache(this.sessionPath);
      await this.loadConfig();
    }
  }

  /**
   * Cleans up all resources.
   *
   * Stops the watcher and clears internal state.
   */
  async dispose(): Promise<void> {
    if (this.state === "disposed") {
      return;
    }

    // Stop watcher
    if (this.watcher) {
      await this.watcher.stop();
      this.watcher.removeAllListeners();
      this.watcher = null;
    }

    // Clear loader cache
    if (this.loader) {
      this.loader.invalidateCache();
      this.loader = null;
    }

    // Reset state
    this.currentConfig = null;
    this.sessionPath = null;
    this.toolFilter = this.options.allowAllIfNoConfig
      ? createAllowAllFilter()
      : createDenyAllFilter();
    this.lastWarnings = [];
    this.state = "disposed";

    this.emit("disposed");
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Loads configuration from the session path.
   */
  private async loadConfig(): Promise<void> {
    if (!this.loader || !this.sessionPath) {
      return;
    }

    const previousConfig = this.currentConfig;
    const result = await this.loader.load(this.sessionPath);

    this.currentConfig = result.config;
    this.lastWarnings = result.warnings;

    // Update tool filter
    this.updateToolFilter();

    // Emit change event if config changed
    if (this.hasConfigChanged(previousConfig, this.currentConfig)) {
      this.emit("configChanged", this.currentConfig, previousConfig);
    }
  }

  /**
   * Updates the tool filter based on current config.
   */
  private updateToolFilter(): void {
    if (!this.currentConfig || this.currentConfig.allowedTools.length === 0) {
      // No config or no tools specified
      this.toolFilter = this.options.allowAllIfNoConfig
        ? createAllowAllFilter()
        : createDenyAllFilter();
      return;
    }

    this.toolFilter = new ToolAllowlistFilter(this.currentConfig.allowedTools);
  }

  /**
   * Sets up the file watcher for live config updates.
   */
  private async setupWatcher(): Promise<void> {
    if (!this.sessionPath) {
      return;
    }

    this.watcher = new AgentsWatcher(this.sessionPath, {
      debounceMs: this.options.debounceMs,
      ...this.options.watcherOptions,
    });

    // Subscribe to change events
    this.watcher.on("change", this.handleWatcherChange.bind(this));
    this.watcher.on("error", this.handleWatcherError.bind(this));

    await this.watcher.start();
  }

  /**
   * Handles watcher change events.
   */
  private async handleWatcherChange(_changedPaths: string[]): Promise<void> {
    if (this.state !== "ready") {
      return;
    }

    try {
      // Invalidate cache for changed paths
      if (this.loader && this.sessionPath) {
        this.loader.invalidateCache(this.sessionPath);
      }

      // Reload configuration
      await this.loadConfig();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit("error", err);
    }
  }

  /**
   * Handles watcher errors.
   */
  private handleWatcherError(error: Error): void {
    this.emit("error", error);
  }

  /**
   * Checks if configuration has changed.
   */
  private hasConfigChanged(previous: AgentsConfig | null, current: AgentsConfig | null): boolean {
    // Both null = no change
    if (!previous && !current) {
      return false;
    }

    // One null, other not = change
    if (!previous || !current) {
      return true;
    }

    // Compare key fields
    if (previous.instructions !== current.instructions) {
      return true;
    }

    if (previous.name !== current.name) {
      return true;
    }

    if (previous.priority !== current.priority) {
      return true;
    }

    // Compare allowed tools
    if (previous.allowedTools.length !== current.allowedTools.length) {
      return true;
    }

    for (let i = 0; i < previous.allowedTools.length; i++) {
      const prevTool = previous.allowedTools[i];
      const currTool = current.allowedTools[i];
      if (!prevTool || !currTool) {
        return true;
      }
      if (
        prevTool.pattern !== currTool.pattern ||
        prevTool.negated !== currTool.negated ||
        JSON.stringify(prevTool.args) !== JSON.stringify(currTool.args)
      ) {
        return true;
      }
    }

    // Compare sources
    if (previous.sources.length !== current.sources.length) {
      return true;
    }

    for (let i = 0; i < previous.sources.length; i++) {
      if (previous.sources[i] !== current.sources[i]) {
        return true;
      }
    }

    return false;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Creates a SessionAgentsIntegration with default options.
 *
 * @param options - Optional configuration
 * @returns New SessionAgentsIntegration instance
 */
export function createSessionAgentsIntegration(
  options?: SessionAgentsIntegrationOptions
): SessionAgentsIntegration {
  return new SessionAgentsIntegration(options);
}
