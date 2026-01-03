/**
 * Plugin Manager - Central coordinator for plugin operations.
 *
 * Orchestrates discovery, loading, registration, and execution of plugins.
 * Provides access to aggregated commands, agents, skills, and hooks from all plugins.
 *
 * @module plugin/manager
 */

import type { PluginAgentDefinition } from "./agents/types.js";
import { resolveCommandName, type SlashCommand } from "./commands/adapter.js";
import { type DiscoveredPlugin, discoverPlugins } from "./discovery.js";
import { executeHooks, type HookContext, type HookResult } from "./hooks/executor.js";
import type { HookEvent, HookRule } from "./hooks/types.js";
import {
  isFullyLoaded,
  loadFull,
  loadPlugin,
  type PartiallyLoadedPlugin,
  PluginLoadError,
} from "./loader.js";
import { TrustedPluginsManager } from "./trust/manager.js";
import { TrustStore } from "./trust/store.js";
import type { PluginCapability } from "./trust/types.js";
import type { LoadedPlugin } from "./types.js";

// =============================================================================
// Error Codes (8xxx range for Manager errors)
// =============================================================================

/**
 * Error codes specific to plugin manager operations.
 */
export enum PluginManagerErrorCode {
  /** Manager not initialized */
  NOT_INITIALIZED = 8001,
  /** Plugin not found */
  PLUGIN_NOT_FOUND = 8002,
  /** Plugin already loaded */
  PLUGIN_ALREADY_LOADED = 8003,
  /** Plugin load failed */
  PLUGIN_LOAD_FAILED = 8004,
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when plugin manager operations fail.
 *
 * @example
 * ```typescript
 * try {
 *   await manager.loadPlugin("nonexistent");
 * } catch (error) {
 *   if (error instanceof PluginManagerError) {
 *     console.error(`Manager error [${error.code}]: ${error.message}`);
 *   }
 * }
 * ```
 */
export class PluginManagerError extends Error {
  public readonly code: PluginManagerErrorCode;
  public readonly details?: unknown;

  constructor(
    message: string,
    code: PluginManagerErrorCode,
    options?: { cause?: Error; details?: unknown }
  ) {
    super(message);
    this.name = "PluginManagerError";
    this.code = code;
    this.details = options?.details;
    this.cause = options?.cause;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PluginManagerError);
    }
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Options for PluginManager initialization.
 *
 * @example
 * ```typescript
 * const options: PluginManagerOptions = {
 *   searchPaths: ["./plugins", "~/.vellum/plugins"],
 *   autoTrust: false,
 *   eagerLoad: false
 * };
 * ```
 */
export interface PluginManagerOptions {
  /**
   * Directories to search for plugins.
   * If not provided, default paths will be used.
   */
  searchPaths?: string[];

  /**
   * Custom trust store for managing plugin permissions.
   * If not provided, a default store will be created.
   */
  trustStore?: TrustStore;

  /**
   * Whether to automatically trust new plugins.
   * @default false
   */
  autoTrust?: boolean;

  /**
   * Whether to eagerly load all plugins (L2) during initialization.
   * If false, only L1 (manifest) loading is performed.
   * @default false
   */
  eagerLoad?: boolean;
}

/**
 * Information about a failed plugin load attempt.
 */
export interface FailedPlugin {
  /** Name of the plugin that failed to load */
  name: string;
  /** Path to the plugin */
  path: string;
  /** Error that caused the failure */
  error: Error;
  /** Timestamp of the failure */
  failedAt: Date;
}

// =============================================================================
// Plugin Manager
// =============================================================================

/**
 * Central coordinator for all plugin operations.
 *
 * The PluginManager handles:
 * - Plugin discovery across multiple search paths
 * - Progressive loading (L1 manifest-only, L2 full loading)
 * - Command, agent, skill, and hook aggregation
 * - Trust verification and permission management
 * - Error isolation (one plugin failure doesn't block others)
 *
 * @example
 * ```typescript
 * // Basic usage
 * const manager = new PluginManager();
 * await manager.initialize();
 *
 * // Get all loaded plugins
 * const plugins = manager.getPlugins();
 *
 * // Get aggregated commands
 * const commands = manager.getCommands();
 *
 * // Execute hooks
 * const results = await manager.executeHook("PreToolUse", context);
 * ```
 *
 * @example
 * ```typescript
 * // With custom options
 * const manager = new PluginManager({
 *   searchPaths: ["./project-plugins", "~/.vellum/plugins"],
 *   autoTrust: false,
 *   eagerLoad: true // Load all components immediately
 * });
 * await manager.initialize();
 * ```
 */
export class PluginManager {
  /** Search paths for plugin discovery */
  private readonly searchPaths: string[];

  /** Trust manager for permission checking */
  private readonly trustManager: TrustedPluginsManager;

  /** Trust store instance */
  private readonly trustStore: TrustStore;

  /** Whether to automatically trust new plugins */
  private readonly _autoTrust: boolean;

  /** Whether to eagerly load all plugins */
  private readonly eagerLoad: boolean;

  /** Map of plugin name to loaded plugin */
  private readonly plugins: Map<string, LoadedPlugin | PartiallyLoadedPlugin> = new Map();

  /** Map of plugin name to discovered plugin info */
  private readonly discovered: Map<string, DiscoveredPlugin> = new Map();

  /** List of plugins that failed to load */
  private readonly failedPlugins: FailedPlugin[] = [];

  /** Whether the manager has been initialized */
  private initialized = false;

  /** Aggregated commands from all plugins (cached) */
  private commandsCache: Map<string, SlashCommand> | null = null;

  /** Aggregated agents from all plugins (cached) */
  private agentsCache: Map<string, PluginAgentDefinition> | null = null;

  /**
   * Creates a new PluginManager instance.
   *
   * @param options - Configuration options for the manager
   *
   * @example
   * ```typescript
   * const manager = new PluginManager();
   * // or with options
   * const manager = new PluginManager({
   *   searchPaths: ["./plugins"],
   *   autoTrust: true
   * });
   * ```
   */
  constructor(options: PluginManagerOptions = {}) {
    this.searchPaths = options.searchPaths ?? [];
    this.trustStore = options.trustStore ?? new TrustStore();
    this.trustManager = new TrustedPluginsManager(this.trustStore);
    this._autoTrust = options.autoTrust ?? false;
    this.eagerLoad = options.eagerLoad ?? false;
  }

  /**
   * Initializes the plugin manager.
   *
   * Performs the following steps:
   * 1. Loads the trust store
   * 2. Discovers plugins from search paths
   * 3. Loads plugins (L1 or L2 based on eagerLoad option)
   * 4. Registers components (commands, agents, skills, hooks)
   *
   * Errors in individual plugins are logged but don't block initialization.
   *
   * @throws {PluginManagerError} If initialization fails critically
   *
   * @example
   * ```typescript
   * const manager = new PluginManager();
   * await manager.initialize();
   * console.log(`Loaded ${manager.getPlugins().length} plugins`);
   * ```
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Load trust store
    try {
      await this.trustStore.load();
    } catch (error) {
      // Log warning but continue - trust store failure shouldn't block plugins
      console.warn("[plugin:manager] Failed to load trust store:", error);
    }

    // Discover plugins
    if (this.searchPaths.length > 0) {
      const discoveredPlugins = await discoverPlugins(this.searchPaths);

      // Store discovered plugins for later on-demand loading
      for (const discovered of discoveredPlugins) {
        this.discovered.set(discovered.name, discovered);
      }

      // Load all discovered plugins
      await this.loadAllDiscovered();
    }

    this.initialized = true;
  }

  /**
   * Gets all loaded plugins.
   *
   * Returns only fully loaded (L2) plugins. Use this method to access
   * plugin components like commands, agents, and skills.
   *
   * @returns Array of fully loaded plugins
   *
   * @example
   * ```typescript
   * const plugins = manager.getPlugins();
   * for (const plugin of plugins) {
   *   console.log(`${plugin.manifest.name}: ${plugin.commands.size} commands`);
   * }
   * ```
   */
  getPlugins(): LoadedPlugin[] {
    const fullyLoaded: LoadedPlugin[] = [];
    for (const plugin of this.plugins.values()) {
      if (isFullyLoaded(plugin)) {
        fullyLoaded.push(plugin);
      }
    }
    return fullyLoaded;
  }

  /**
   * Gets a specific plugin by name.
   *
   * Returns the fully loaded plugin if available, or undefined if not found
   * or not fully loaded.
   *
   * @param name - Plugin name to look up
   * @returns The loaded plugin or undefined
   *
   * @example
   * ```typescript
   * const plugin = manager.getPlugin("my-plugin");
   * if (plugin) {
   *   console.log(`Found plugin: ${plugin.manifest.version}`);
   * }
   * ```
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    const plugin = this.plugins.get(name);
    if (plugin && isFullyLoaded(plugin)) {
      return plugin;
    }
    return undefined;
  }

  /**
   * Loads a specific plugin by name.
   *
   * Performs full L2 loading of the plugin, including all components.
   * If the plugin is already loaded, returns the existing instance.
   *
   * @param name - Plugin name to load
   * @returns The loaded plugin
   * @throws {PluginManagerError} If plugin not found or load fails
   *
   * @example
   * ```typescript
   * try {
   *   const plugin = await manager.loadPlugin("my-plugin");
   *   console.log(`Loaded ${plugin.commands.size} commands`);
   * } catch (error) {
   *   console.error("Failed to load plugin:", error);
   * }
   * ```
   */
  async loadPlugin(name: string): Promise<LoadedPlugin> {
    // Check if already fully loaded
    const existing = this.plugins.get(name);
    if (existing && isFullyLoaded(existing)) {
      return existing;
    }

    // If we have a partial load, upgrade to full
    if (existing && !isFullyLoaded(existing)) {
      const loaded = await this.upgradeToFullLoad(name, existing);
      return loaded;
    }

    // Look up in discovered plugins
    let discovered = this.discovered.get(name);

    // If not discovered yet, try re-scanning to support dynamic plugins
    if (!discovered) {
      const freshDiscovery = await discoverPlugins(this.searchPaths);
      for (const plugin of freshDiscovery) {
        this.discovered.set(plugin.name, plugin);
      }
      discovered = this.discovered.get(name);
    }

    if (!discovered) {
      throw new PluginManagerError(
        `Plugin '${name}' not found`,
        PluginManagerErrorCode.PLUGIN_NOT_FOUND
      );
    }

    // Load the plugin fully
    try {
      const loaded = await loadPlugin(discovered, { fullLoad: true });
      if (!isFullyLoaded(loaded)) {
        throw new Error("Full load returned partial plugin");
      }
      this.plugins.set(name, loaded);

      // Auto-trust if enabled
      if (this._autoTrust && !this.trustManager.isTrusted(name)) {
        const allCapabilities: PluginCapability[] = [
          "execute-hooks",
          "network-access",
          "access-filesystem",
        ];
        const hash = "0".repeat(64);
        this.trustManager.trustPlugin(name, allCapabilities, hash);
      }

      this.invalidateCaches();
      return loaded;
    } catch (error) {
      const pluginError =
        error instanceof PluginLoadError
          ? error
          : new Error(error instanceof Error ? error.message : String(error));

      this.recordFailure(name, discovered.root, pluginError);

      throw new PluginManagerError(
        `Failed to load plugin '${name}': ${pluginError.message}`,
        PluginManagerErrorCode.PLUGIN_LOAD_FAILED,
        { cause: pluginError }
      );
    }
  }

  /**
   * Unloads a plugin by name.
   *
   * Removes the plugin from the manager's registry. Does not affect
   * the plugin files on disk.
   *
   * @param name - Plugin name to unload
   *
   * @example
   * ```typescript
   * manager.unloadPlugin("my-plugin");
   * console.log(manager.getPlugin("my-plugin")); // undefined
   * ```
   */
  unloadPlugin(name: string): void {
    if (this.plugins.has(name)) {
      this.plugins.delete(name);
      this.invalidateCaches();
    }
  }

  /**
   * Gets aggregated commands from all loaded plugins.
   *
   * Commands are aggregated from all fully loaded plugins and converted
   * to SlashCommand format. Name collisions are handled by prefixing
   * with the plugin name.
   *
   * @returns Map of command name to SlashCommand
   *
   * @example
   * ```typescript
   * const commands = manager.getCommands();
   * for (const [name, cmd] of commands) {
   *   console.log(`/${name} - ${cmd.description}`);
   * }
   * ```
   */
  getCommands(): Map<string, SlashCommand> {
    if (this.commandsCache) {
      return this.commandsCache;
    }

    const commands = new Map<string, SlashCommand>();

    for (const plugin of this.getPlugins()) {
      for (const [_cmdName, cmd] of plugin.commands) {
        // Resolve command name for collision handling
        const resolvedName = resolveCommandName(cmd.name, plugin.manifest.name, commands);

        // Create SlashCommand from PluginCommand
        const slashCmd: SlashCommand = {
          name: resolvedName,
          description: cmd.description,
          kind: "plugin",
          category: "plugin",
          source: plugin.manifest.name,
          argumentHint: cmd.argumentHint,
          execute: async (ctx) => {
            // Substitute $ARGUMENTS in content
            const content = cmd.content.replace(/\$ARGUMENTS/g, ctx.rawArgs.trim());
            return {
              kind: "success",
              message: content,
              data: { allowedTools: cmd.allowedTools },
            };
          },
        };
        commands.set(slashCmd.name, slashCmd);
      }
    }

    this.commandsCache = commands;
    return commands;
  }

  /**
   * Gets aggregated agents from all loaded plugins.
   *
   * Agents are aggregated from all fully loaded plugins. Each agent
   * is keyed by its slug, which is unique within a plugin.
   *
   * @returns Map of agent slug to PluginAgentDefinition
   *
   * @example
   * ```typescript
   * const agents = manager.getAgents();
   * for (const [slug, agent] of agents) {
   *   console.log(`Agent: ${agent.name} (${slug})`);
   * }
   * ```
   */
  getAgents(): Map<string, PluginAgentDefinition> {
    if (this.agentsCache) {
      return this.agentsCache;
    }

    const agents = new Map<string, PluginAgentDefinition>();

    for (const plugin of this.getPlugins()) {
      for (const [slug, agent] of plugin.agents) {
        // Namespace with plugin name to avoid collisions
        const key = `${plugin.manifest.name}:${slug}`;
        agents.set(key, agent);
      }
    }

    this.agentsCache = agents;
    return agents;
  }

  /**
   * Executes hooks for a given event across all loaded plugins.
   *
   * Hooks are executed sequentially across plugins. If any hook blocks
   * the action (returns allowed: false), subsequent hooks may still run
   * depending on the fail behavior configuration.
   *
   * @param event - The hook event type
   * @param context - Context for hook execution
   * @returns Array of results from each plugin's hooks
   *
   * @example
   * ```typescript
   * const results = await manager.executeHook("PreToolUse", {
   *   input: { toolName: "write_file", params: { path: "/tmp/test.txt" } },
   *   sessionId: "sess_123",
   *   pluginName: "security-guard"
   * });
   *
   * const allAllowed = results.every(r => r.allowed);
   * if (!allAllowed) {
   *   console.log("Action blocked by hook");
   * }
   * ```
   */
  async executeHook(event: HookEvent, context: HookContext): Promise<HookResult[]> {
    const allResults: HookResult[] = [];

    for (const plugin of this.getPlugins()) {
      if (!plugin.hooks || plugin.hooks.length === 0) {
        continue;
      }

      // Create context with plugin name
      const pluginContext: HookContext = {
        ...context,
        pluginName: plugin.manifest.name,
      };

      try {
        const result = await executeHooks(event, pluginContext, plugin.hooks as HookRule[]);
        allResults.push(...result.results);
      } catch (error) {
        // Log error but continue with other plugins
        console.warn(
          `[plugin:manager] Hook execution failed for '${plugin.manifest.name}':`,
          error
        );
      }
    }

    return allResults;
  }

  /**
   * Gets the list of plugins that failed to load.
   *
   * @returns Array of failed plugin information
   *
   * @example
   * ```typescript
   * const failed = manager.getFailedPlugins();
   * for (const f of failed) {
   *   console.error(`Failed to load ${f.name}: ${f.error.message}`);
   * }
   * ```
   */
  getFailedPlugins(): readonly FailedPlugin[] {
    return this.failedPlugins;
  }

  /**
   * Checks if the manager has been initialized.
   *
   * @returns true if initialize() has been called successfully
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Gets the trust manager for permission verification.
   *
   * @returns The TrustedPluginsManager instance
   */
  getTrustManager(): TrustedPluginsManager {
    return this.trustManager;
  }

  /**
   * Gets whether auto-trust is enabled.
   *
   * When auto-trust is enabled, newly discovered plugins are automatically
   * trusted without user confirmation.
   *
   * @returns true if auto-trust is enabled
   */
  isAutoTrustEnabled(): boolean {
    return this._autoTrust;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Loads all discovered plugins.
   */
  private async loadAllDiscovered(): Promise<void> {
    // Load sequentially to preserve discovery order. This keeps command
    // collision resolution deterministic (first discovered plugin retains
    // the bare command name, later ones are namespaced) regardless of
    // individual plugin load timings.
    for (const discovered of this.discovered.values()) {
      // Errors are handled per plugin inside loadSinglePlugin
      // so the loop continues even if one fails.
      await this.loadSinglePlugin(discovered);
    }
  }

  /**
   * Loads a single plugin with error handling.
   */
  private async loadSinglePlugin(discovered: DiscoveredPlugin): Promise<void> {
    try {
      const plugin = await loadPlugin(discovered, { fullLoad: this.eagerLoad });
      this.plugins.set(discovered.name, plugin);

      // Auto-trust if enabled
      if (this._autoTrust && !this.trustManager.isTrusted(discovered.name)) {
        const allCapabilities: PluginCapability[] = [
          "execute-hooks",
          "network-access",
          "access-filesystem",
        ];
        // Use a placeholder hash for auto-trusted plugins
        const hash = "0".repeat(64);
        this.trustManager.trustPlugin(discovered.name, allCapabilities, hash);
      }
    } catch (error) {
      const pluginError = error instanceof Error ? error : new Error(String(error));
      this.recordFailure(discovered.name, discovered.root, pluginError);
      console.warn(`[plugin:manager] Failed to load '${discovered.name}':`, pluginError.message);
    }
  }

  /**
   * Upgrades a partially loaded plugin to full L2 loading.
   */
  private async upgradeToFullLoad(
    name: string,
    partial: PartiallyLoadedPlugin
  ): Promise<LoadedPlugin> {
    try {
      const loaded = await loadFull(partial);
      this.plugins.set(name, loaded);
      this.invalidateCaches();
      return loaded;
    } catch (error) {
      const pluginError = error instanceof Error ? error : new Error(String(error));
      this.recordFailure(name, partial.root, pluginError);

      throw new PluginManagerError(
        `Failed to fully load plugin '${name}': ${pluginError.message}`,
        PluginManagerErrorCode.PLUGIN_LOAD_FAILED,
        { cause: pluginError }
      );
    }
  }

  /**
   * Records a plugin load failure.
   */
  private recordFailure(name: string, path: string, error: Error): void {
    this.failedPlugins.push({
      name,
      path,
      error,
      failedAt: new Date(),
    });
  }

  /**
   * Invalidates cached aggregations.
   */
  private invalidateCaches(): void {
    this.commandsCache = null;
    this.agentsCache = null;
  }
}
