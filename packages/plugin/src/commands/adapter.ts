/**
 * Command Adapter for Plugin System
 *
 * Converts parsed plugin commands to the SlashCommand format used by Phase 16.
 * Handles name collision resolution and argument substitution.
 *
 * @module plugin/commands/adapter
 */

import type { ParsedCommand } from "./parser.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Command category for organization in help displays
 */
export type CommandCategory =
  | "system"
  | "auth"
  | "session"
  | "navigation"
  | "tools"
  | "config"
  | "debug"
  | "plugin";

/**
 * Command source kind
 */
export type CommandKind = "builtin" | "plugin" | "mcp" | "user";

/**
 * Command execution context provided to command handlers.
 *
 * This is a minimal context interface for plugin commands.
 * The actual CommandContext from Phase 16 may have additional properties.
 */
export interface CommandContext {
  /** Parsed command arguments as raw string */
  readonly rawArgs: string;

  /** Parsed arguments (positional and named) */
  readonly parsedArgs: {
    readonly positional: readonly unknown[];
    readonly named: Readonly<Record<string, unknown>>;
  };

  /** Optional list of allowed tools for this command */
  readonly allowedTools?: readonly string[];

  /** Abort signal for cancellation */
  readonly signal?: AbortSignal;
}

/**
 * Result from command execution
 */
export type CommandResult =
  | { readonly kind: "success"; readonly message?: string; readonly data?: unknown }
  | {
      readonly kind: "error";
      readonly code: string;
      readonly message: string;
      readonly suggestions?: readonly string[];
    };

/**
 * SlashCommand definition for Phase 16 integration.
 *
 * Defines a command that can be executed via the CLI slash command system.
 */
export interface SlashCommand {
  /** Command name without leading slash */
  readonly name: string;

  /** Human-readable description for help text */
  readonly description: string;

  /** Source/origin of the command */
  readonly kind: CommandKind;

  /** Grouping category for organization */
  readonly category: CommandCategory;

  /** Source plugin name (for plugin-sourced commands) */
  readonly source?: string;

  /** Hint for expected arguments (e.g., "<branch-name>") */
  readonly argumentHint?: string;

  /** Alternative names for the command */
  readonly aliases?: readonly string[];

  /** Command execution handler */
  readonly execute: (ctx: CommandContext) => Promise<CommandResult>;
}

/**
 * Arguments placeholder constant
 */
const ARGUMENTS_VARIABLE = "$ARGUMENTS";

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Substitutes the $ARGUMENTS placeholder in the command content.
 *
 * Replaces all occurrences of `$ARGUMENTS` with the provided arguments string.
 * If no arguments are provided, removes the placeholder entirely.
 *
 * @param content - The command content (prompt template)
 * @param args - The arguments to substitute
 * @returns The content with $ARGUMENTS replaced
 *
 * @example
 * ```typescript
 * const content = "Analyze branch: $ARGUMENTS";
 * const result = substituteArguments(content, "feature/new-ui");
 * // result: "Analyze branch: feature/new-ui"
 * ```
 */
export function substituteArguments(content: string, args: string): string {
  return content.replaceAll(ARGUMENTS_VARIABLE, args.trim());
}

/**
 * Resolves a command name to ensure uniqueness in the registry.
 *
 * If the command name already exists in the registry, the name is
 * namespaced using the format `pluginName:commandName`.
 *
 * @param commandName - The original command name
 * @param pluginName - The source plugin name
 * @param existing - Map of existing command names in the registry
 * @returns The resolved unique command name
 *
 * @example
 * ```typescript
 * const existing = new Map([['init', command]]);
 *
 * // Collision - returns namespaced name
 * resolveCommandName('init', 'my-plugin', existing);
 * // Returns: 'my-plugin:init'
 *
 * // No collision - returns original name
 * resolveCommandName('deploy', 'my-plugin', existing);
 * // Returns: 'deploy'
 * ```
 */
export function resolveCommandName(
  commandName: string,
  pluginName: string,
  existing: Map<string, SlashCommand>
): string {
  if (existing.has(commandName)) {
    return `${pluginName}:${commandName}`;
  }
  return commandName;
}

/**
 * Creates an execute function for a parsed command.
 *
 * The returned function substitutes $ARGUMENTS in the content and
 * applies the allowedTools filter to the execution context.
 *
 * @param parsed - The parsed command definition
 * @returns An execute function suitable for SlashCommand.execute
 *
 * @example
 * ```typescript
 * const parsed: ParsedCommand = {
 *   name: 'analyze',
 *   description: 'Analyze code',
 *   content: 'Analyze: $ARGUMENTS',
 *   filePath: '/path/to/cmd.md',
 *   hasArgumentsVariable: true
 * };
 *
 * const execute = createCommandExecutor(parsed);
 * const result = await execute({ rawArgs: 'src/*.ts', ... });
 * ```
 */
export function createCommandExecutor(
  parsed: ParsedCommand
): (ctx: CommandContext) => Promise<CommandResult> {
  return async (ctx: CommandContext): Promise<CommandResult> => {
    // Substitute $ARGUMENTS in the content
    const processedContent = parsed.hasArgumentsVariable
      ? substituteArguments(parsed.content, ctx.rawArgs)
      : parsed.content;

    // Build context with allowedTools filter
    const effectiveAllowedTools = parsed.allowedTools ?? ctx.allowedTools;

    // Return the processed content as the execution result
    // The actual execution (sending to LLM, etc.) is handled by the command runner
    return {
      kind: "success",
      message: processedContent,
      data: {
        content: processedContent,
        allowedTools: effectiveAllowedTools,
        source: parsed.filePath,
      },
    };
  };
}

/**
 * Adapts a ParsedCommand to the SlashCommand format for Phase 16 integration.
 *
 * Converts the plugin-specific ParsedCommand format to the standard
 * SlashCommand interface used by the CLI command system.
 *
 * @param parsed - The parsed command from a plugin
 * @param pluginName - The name of the source plugin
 * @returns A SlashCommand suitable for registration
 *
 * @example
 * ```typescript
 * const parsed: ParsedCommand = {
 *   name: 'deploy',
 *   description: 'Deploy to production',
 *   argumentHint: '<environment>',
 *   content: 'Deploy to $ARGUMENTS',
 *   filePath: '/plugins/my-plugin/commands/deploy.md',
 *   hasArgumentsVariable: true
 * };
 *
 * const command = adaptToSlashCommand(parsed, 'my-plugin');
 * // command.name = 'deploy'
 * // command.kind = 'plugin'
 * // command.source = 'my-plugin'
 * ```
 */
export function adaptToSlashCommand(parsed: ParsedCommand, pluginName: string): SlashCommand {
  return {
    name: parsed.name,
    description: parsed.description,
    kind: "plugin",
    category: "plugin",
    source: pluginName,
    argumentHint: parsed.argumentHint,
    execute: createCommandExecutor(parsed),
  };
}

/**
 * Adapts multiple ParsedCommands with name collision resolution.
 *
 * Processes a batch of commands, resolving any name collisions with
 * existing commands by namespacing with the plugin name.
 *
 * @param commands - Array of parsed commands to adapt
 * @param pluginName - The name of the source plugin
 * @param existing - Map of existing command names for collision detection
 * @returns Array of adapted SlashCommands with resolved names
 *
 * @example
 * ```typescript
 * const parsed = [
 *   { name: 'init', ... },
 *   { name: 'deploy', ... }
 * ];
 * const existing = new Map([['init', builtinInitCommand]]);
 *
 * const commands = adaptCommands(parsed, 'my-plugin', existing);
 * // commands[0].name = 'my-plugin:init' (namespaced due to collision)
 * // commands[1].name = 'deploy' (no collision)
 * ```
 */
export function adaptCommands(
  commands: readonly ParsedCommand[],
  pluginName: string,
  existing: Map<string, SlashCommand>
): SlashCommand[] {
  return commands.map((parsed) => {
    const resolvedName = resolveCommandName(parsed.name, pluginName, existing);

    return {
      ...adaptToSlashCommand(parsed, pluginName),
      name: resolvedName,
    };
  });
}
