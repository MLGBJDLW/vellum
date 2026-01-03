/**
 * Plugin Type Definitions
 *
 * Core types for the plugin system including:
 * - LoadedPlugin: Runtime representation of a loaded plugin
 * - PluginCommand: Command definitions from plugin commands
 * - PluginSkill: Skill definitions from plugin skills
 * - PluginState: Plugin lifecycle state enum
 *
 * @module plugin/types
 */

import { z } from "zod";
import type { PluginAgentDefinition } from "./agents/types.js";
import type { HooksConfig } from "./hooks/types.js";
import type { PluginManifest } from "./manifest.js";

// =============================================================================
// Legacy Interfaces (Deprecated - kept for backwards compatibility)
// =============================================================================

/** @deprecated Use PluginManifest from ./manifest.ts instead */
export interface PluginConfig {
  name: string;
  version: string;
  description?: string;
}

/** @deprecated Use HooksConfig from ./hooks/types.ts instead */
export interface PluginHooks {
  onInit?: () => Promise<void>;
  onDestroy?: () => Promise<void>;
  onMessage?: (message: unknown) => Promise<void>;
  onToolCall?: (tool: string, params: unknown) => Promise<unknown>;
}

/** @deprecated Use LoadedPlugin interface instead */
export interface Plugin extends PluginConfig, PluginHooks {}

// =============================================================================
// PluginState - Plugin lifecycle state
// =============================================================================

/**
 * Schema for plugin lifecycle state.
 *
 * Represents the current operational state of a loaded plugin:
 * - `enabled`: Plugin is active and functional
 * - `disabled`: Plugin is loaded but not active
 * - `error`: Plugin failed to load or encountered a runtime error
 *
 * @example
 * ```typescript
 * const state = PluginStateSchema.parse("enabled");
 * ```
 */
export const PluginStateSchema = z.enum(["enabled", "disabled", "error"]);

/**
 * Plugin lifecycle state type.
 * Indicates whether the plugin is enabled, disabled, or in an error state.
 */
export type PluginState = z.infer<typeof PluginStateSchema>;

// =============================================================================
// PluginCommand - Command definition from plugin
// =============================================================================

/**
 * Schema for plugin command definitions.
 *
 * Commands are user-invocable actions registered by plugins.
 * They can be triggered via CLI or agent interactions.
 *
 * @example
 * ```typescript
 * const command = PluginCommandSchema.parse({
 *   name: "greet",
 *   description: "Send a greeting message",
 *   argumentHint: "<name>",
 *   content: "# Greet Command\n\nSay hello to {{name}}!",
 *   filePath: "./commands/greet.md"
 * });
 * ```
 */
export const PluginCommandSchema = z.object({
  /**
   * Command name (used for invocation).
   * Must be unique within the plugin namespace.
   */
  name: z.string().min(1, "Command name cannot be empty"),

  /**
   * Human-readable description of the command.
   * Shown in help text and command listings.
   */
  description: z.string().min(1, "Command description cannot be empty"),

  /**
   * Optional hint for expected arguments.
   * Displayed in help text to guide users.
   *
   * @example "<filename>", "[--force] <path>"
   */
  argumentHint: z.string().optional(),

  /**
   * Optional list of tool names this command is allowed to use.
   * If not specified, the command uses default tool permissions.
   */
  allowedTools: z.array(z.string()).optional(),

  /**
   * The markdown body of the command.
   * Contains the prompt or instructions for the command.
   */
  content: z.string(),

  /**
   * Absolute or relative path to the command definition file.
   * Used for error reporting and hot-reloading.
   */
  filePath: z.string().min(1, "File path cannot be empty"),
});

/**
 * Plugin command definition type.
 * Represents a user-invocable command registered by a plugin.
 */
export type PluginCommand = z.infer<typeof PluginCommandSchema>;

// =============================================================================
// PluginSkill - Skill definition from plugin
// =============================================================================

/**
 * Schema for plugin skill definitions.
 *
 * Skills provide specialized capabilities that can be attached to agents.
 * They contain instructions, scripts, and reference materials.
 *
 * @example
 * ```typescript
 * const skill = PluginSkillSchema.parse({
 *   name: "python-testing",
 *   description: "Best practices for Python unit testing",
 *   filePath: "./skills/python-testing/SKILL.md",
 *   scripts: ["./scripts/run-tests.py"],
 *   references: ["./references/pytest-guide.md"],
 *   examples: ["./examples/test_sample.py"]
 * });
 * ```
 */
export const PluginSkillSchema = z.object({
  /**
   * Skill name (used for identification).
   * Must be unique within the plugin namespace.
   */
  name: z.string().min(1, "Skill name cannot be empty"),

  /**
   * Human-readable description of the skill.
   * Explains what capabilities the skill provides.
   */
  description: z.string().min(1, "Skill description cannot be empty"),

  /**
   * Absolute or relative path to the skill definition file.
   * Typically the SKILL.md file.
   */
  filePath: z.string().min(1, "File path cannot be empty"),

  /**
   * Optional array of script paths associated with the skill.
   * Scripts can be executed as part of skill functionality.
   */
  scripts: z.array(z.string()).optional(),

  /**
   * Optional array of reference document paths.
   * Additional documentation or guides for the skill.
   */
  references: z.array(z.string()).optional(),

  /**
   * Optional array of example file paths.
   * Sample code or usage examples demonstrating the skill.
   */
  examples: z.array(z.string()).optional(),
});

/**
 * Plugin skill definition type.
 * Represents a specialized capability provided by a plugin.
 */
export type PluginSkill = z.infer<typeof PluginSkillSchema>;

// =============================================================================
// LoadedPlugin - Runtime representation of a loaded plugin
// =============================================================================

/**
 * Schema for a loaded plugin's runtime representation.
 *
 * Contains all parsed components of a plugin:
 * - Manifest metadata
 * - Resolved paths
 * - Component maps (commands, agents, skills)
 * - Hook configuration
 * - Runtime state
 *
 * @example
 * ```typescript
 * const plugin: LoadedPlugin = {
 *   manifest: { name: "my-plugin", version: "1.0.0", ... },
 *   root: "/path/to/plugin",
 *   commands: new Map([["greet", greetCommand]]),
 *   agents: new Map([["helper", helperAgent]]),
 *   skills: new Map([["coding", codingSkill]]),
 *   hooks: [{ event: "SessionStart", action: { type: "prompt", content: "Hi!" } }],
 *   state: "enabled",
 *   loadedAt: new Date()
 * };
 * ```
 */
export const LoadedPluginSchema = z.object({
  /**
   * The validated plugin manifest.
   * Contains all metadata from plugin.json.
   */
  manifest: z.custom<PluginManifest>((val) => val !== null && typeof val === "object"),

  /**
   * Absolute path to the plugin's root directory.
   * All relative paths in the manifest are resolved from here.
   */
  root: z.string().min(1, "Root path cannot be empty"),

  /**
   * Map of command names to their definitions.
   * Key is the command name, value is the parsed PluginCommand.
   */
  commands: z.custom<Map<string, PluginCommand>>(
    (val) => val instanceof Map,
    "Commands must be a Map"
  ),

  /**
   * Map of agent slugs to their definitions.
   * Key is the agent slug, value is the parsed PluginAgentDefinition.
   */
  agents: z.custom<Map<string, PluginAgentDefinition>>(
    (val) => val instanceof Map,
    "Agents must be a Map"
  ),

  /**
   * Map of skill names to their definitions.
   * Key is the skill name, value is the parsed PluginSkill.
   */
  skills: z.custom<Map<string, PluginSkill>>((val) => val instanceof Map, "Skills must be a Map"),

  /**
   * Parsed hooks configuration, or null if no hooks defined.
   */
  hooks: z.custom<HooksConfig | null>((val) => val === null || Array.isArray(val)).nullable(),

  /**
   * Current plugin state (enabled, disabled, or error).
   */
  state: PluginStateSchema,

  /**
   * Error that caused the plugin to enter error state.
   * Only present when state is 'error'.
   */
  error: z.instanceof(Error).optional(),

  /**
   * Timestamp when the plugin was loaded.
   */
  loadedAt: z.date(),
});

/**
 * Runtime representation of a loaded plugin.
 *
 * Contains the fully parsed and validated plugin with all components
 * resolved into Maps for efficient lookup. This is the main type
 * used throughout the plugin system after initial loading.
 */
export type LoadedPlugin = z.infer<typeof LoadedPluginSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a new LoadedPlugin instance with the given parameters.
 *
 * @param params - Plugin initialization parameters
 * @returns A new LoadedPlugin instance
 *
 * @example
 * ```typescript
 * const plugin = createLoadedPlugin({
 *   manifest: parsedManifest,
 *   root: "/path/to/plugin",
 * });
 * ```
 */
export function createLoadedPlugin(params: {
  manifest: PluginManifest;
  root: string;
  commands?: Map<string, PluginCommand>;
  agents?: Map<string, PluginAgentDefinition>;
  skills?: Map<string, PluginSkill>;
  hooks?: HooksConfig | null;
  state?: PluginState;
  error?: Error;
}): LoadedPlugin {
  return {
    manifest: params.manifest,
    root: params.root,
    commands: params.commands ?? new Map(),
    agents: params.agents ?? new Map(),
    skills: params.skills ?? new Map(),
    hooks: params.hooks ?? null,
    state: params.state ?? "enabled",
    error: params.error,
    loadedAt: new Date(),
  };
}

/**
 * Checks if a plugin is in an operational state.
 *
 * @param plugin - The plugin to check
 * @returns true if the plugin is enabled
 */
export function isPluginEnabled(plugin: LoadedPlugin): boolean {
  return plugin.state === "enabled";
}

/**
 * Checks if a plugin has encountered an error.
 *
 * @param plugin - The plugin to check
 * @returns true if the plugin is in error state
 */
export function isPluginError(plugin: LoadedPlugin): boolean {
  return plugin.state === "error";
}
