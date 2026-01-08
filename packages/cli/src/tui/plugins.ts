/**
 * Plugin System Integration for TUI
 *
 * Provides initialization and integration of the plugin system with the CLI.
 * Handles plugin loading from default search paths, command registration,
 * and agent/hooks aggregation.
 *
 * @module cli/tui/plugins
 */

import {
  getSearchPaths,
  type HookContext,
  type HookEvent,
  type PluginAgentDefinition,
  PluginManager,
} from "@vellum/plugin";

import type { CommandContext, CommandResult, SlashCommand } from "../commands/types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Plugin initialization options
 */
export interface PluginInitOptions {
  /**
   * Project root directory for project-local plugins.
   * If provided, plugins from `${projectRoot}/.vellum/plugins/` will be loaded.
   * @default process.cwd()
   */
  projectRoot?: string;

  /**
   * Whether to automatically trust new plugins.
   * @default false
   */
  autoTrust?: boolean;

  /**
   * Whether to eagerly load all plugin components.
   * If false, only manifests are loaded initially.
   * @default false
   */
  eagerLoad?: boolean;

  /**
   * Whether to include builtin plugins.
   * @default true
   */
  includeBuiltin?: boolean;

  /**
   * Whether to include user plugins from ~/.vellum/plugins/
   * @default true
   */
  includeUser?: boolean;

  /**
   * Whether to include global system plugins.
   * @default true
   */
  includeGlobal?: boolean;
}

/**
 * Result of plugin initialization
 */
export interface PluginInitResult {
  /** Initialized plugin manager instance */
  manager: PluginManager;

  /** Number of plugins loaded */
  pluginCount: number;

  /** Number of commands available */
  commandCount: number;

  /** Number of agents available */
  agentCount: number;

  /** Any errors encountered during loading */
  errors: PluginLoadError[];
}

/**
 * Plugin load error information
 */
export interface PluginLoadError {
  /** Plugin name */
  name: string;

  /** Plugin path */
  path: string;

  /** Error message */
  message: string;
}

// =============================================================================
// Plugin Manager Singleton
// =============================================================================

let _pluginManager: PluginManager | null = null;

/**
 * Gets the global plugin manager instance.
 *
 * Returns null if plugins have not been initialized yet.
 *
 * @returns The plugin manager or null
 */
export function getPluginManager(): PluginManager | null {
  return _pluginManager;
}

// =============================================================================
// Plugin Initialization
// =============================================================================

/**
 * Initializes the plugin system.
 *
 * Loads plugins from:
 * 1. Project plugins: `${projectRoot}/.vellum/plugins/`
 * 2. User plugins: `~/.vellum/plugins/`
 * 3. Global plugins: Platform-specific system directory
 * 4. Builtin plugins: Shipped with the package
 *
 * @param options - Initialization options
 * @returns Initialization result with manager and stats
 *
 * @example
 * ```typescript
 * const result = await initializePlugins({ projectRoot: process.cwd() });
 * console.log(`Loaded ${result.pluginCount} plugins`);
 *
 * // Access plugin commands
 * const commands = getPluginCommands(result.manager);
 * ```
 */
export async function initializePlugins(
  options: PluginInitOptions = {}
): Promise<PluginInitResult> {
  const {
    projectRoot = process.cwd(),
    autoTrust = false,
    eagerLoad = false,
    includeBuiltin = true,
    includeUser = true,
    includeGlobal = true,
  } = options;

  // Get search paths based on options
  const searchPaths = getSearchPaths({
    projectRoot,
    includeBuiltin,
    includeUser,
    includeGlobal,
    filterNonExistent: true,
  });

  // Create plugin manager with resolved paths
  const manager = new PluginManager({
    searchPaths,
    autoTrust,
    eagerLoad,
  });
  const errors: PluginLoadError[] = [];

  // Initialize and load plugins
  try {
    await manager.initialize();
  } catch (error) {
    // Log initialization error but continue - manager may have partial success
    console.warn("[plugins] Initialization warning:", error);
  }

  // Collect any failed plugins
  for (const failed of manager.getFailedPlugins()) {
    errors.push({
      name: failed.name,
      path: failed.path,
      message: failed.error.message,
    });
  }

  // Store manager globally for access by other modules
  _pluginManager = manager;

  // Return initialization result
  const plugins = manager.getPlugins();
  const commands = manager.getCommands();
  const agents = manager.getAgents();

  return {
    manager,
    pluginCount: plugins.length,
    commandCount: commands.size,
    agentCount: agents.size,
    errors,
  };
}

// =============================================================================
// Command Integration
// =============================================================================

/**
 * Gets plugin commands in CLI SlashCommand format.
 *
 * Converts plugin commands to the SlashCommand format used by the
 * CommandRegistry. Commands are returned with `kind: 'plugin'` and
 * include the source plugin name.
 *
 * @param manager - Plugin manager instance
 * @returns Array of SlashCommand definitions
 *
 * @example
 * ```typescript
 * const commands = getPluginCommands(manager);
 * for (const cmd of commands) {
 *   commandRegistry.register(cmd);
 * }
 * ```
 */
export function getPluginCommands(manager: PluginManager): SlashCommand[] {
  const pluginCommands = manager.getCommands();
  const commands: SlashCommand[] = [];

  for (const [_name, cmd] of pluginCommands) {
    // Convert plugin SlashCommand to CLI SlashCommand
    // Need to wrap execute to adapt context types
    const cliCommand: SlashCommand = {
      name: cmd.name,
      description: cmd.description,
      kind: "plugin",
      category: "tools", // Plugin commands go to tools category
      aliases: cmd.aliases,
      execute: async (ctx: CommandContext): Promise<CommandResult> => {
        // Adapt CLI CommandContext to plugin CommandContext
        const pluginCtx = {
          rawArgs: ctx.parsedArgs.raw,
          parsedArgs: {
            positional: ctx.parsedArgs.positional,
            named: ctx.parsedArgs.named,
          },
          allowedTools: undefined,
          signal: ctx.signal,
        };

        // Execute the plugin command
        const result = await cmd.execute(pluginCtx);

        // Adapt plugin result to CLI result
        if (result.kind === "success") {
          return {
            kind: "success",
            message: result.message,
            data: result.data,
          };
        } else {
          return {
            kind: "error",
            code: "INTERNAL_ERROR",
            message: result.message,
            suggestions: result.suggestions,
          };
        }
      },
    };

    commands.push(cliCommand);
  }

  return commands;
}

/**
 * Gets the count of available plugin commands.
 *
 * Useful for status displays without loading full command data.
 *
 * @param manager - Plugin manager instance
 * @returns Number of registered plugin commands
 */
export function getPluginCommandCount(manager: PluginManager): number {
  return manager.getCommands().size;
}

// =============================================================================
// Agent Integration
// =============================================================================

/**
 * Gets plugin agents.
 *
 * Returns all agents defined by loaded plugins, keyed by their
 * qualified slug (pluginName:agentSlug).
 *
 * @param manager - Plugin manager instance
 * @returns Map of agent slug to agent definition
 *
 * @example
 * ```typescript
 * const agents = getPluginAgents(manager);
 * for (const [slug, agent] of agents) {
 *   console.log(`Agent: ${agent.name} (${slug})`);
 * }
 * ```
 */
export function getPluginAgents(manager: PluginManager): Map<string, PluginAgentDefinition> {
  return manager.getAgents();
}

/**
 * Gets a list of plugin agent names for display.
 *
 * @param manager - Plugin manager instance
 * @returns Array of agent display names
 */
export function getPluginAgentNames(manager: PluginManager): string[] {
  const agents = manager.getAgents();
  const names: string[] = [];

  for (const [_slug, agent] of agents) {
    names.push(agent.name);
  }

  return names;
}

// =============================================================================
// Hook Integration
// =============================================================================

/**
 * Executes plugin hooks for a given event.
 *
 * Delegates to the PluginManager's hook execution system.
 * Results from all plugins are returned.
 *
 * @param manager - Plugin manager instance
 * @param event - Hook event type
 * @param context - Context for hook execution
 * @returns Array of hook results from all plugins
 *
 * @example
 * ```typescript
 * const results = await executePluginHooks(manager, "PreToolUse", {
 *   input: "user query",
 *   sessionId: "session-123",
 *   pluginName: "my-plugin",
 * });
 *
 * // Check if any hook blocked the action
 * const blocked = results.some(r => !r.allowed);
 * ```
 */
export async function executePluginHooks(
  manager: PluginManager,
  event: HookEvent,
  context: HookContext
): Promise<Array<{ allowed: boolean; message?: string }>> {
  const results = await manager.executeHook(event, context);
  return results;
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Disposes the plugin system.
 *
 * Cleans up resources and clears the global manager instance.
 * Should be called during application shutdown.
 */
export function disposePlugins(): void {
  _pluginManager = null;
}
