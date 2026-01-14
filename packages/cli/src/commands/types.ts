/**
 * Command System Type Definitions
 *
 * Core types for the slash command system including:
 * - Command definitions and metadata
 * - Argument parsing types
 * - Command execution context
 * - Result types with discriminated unions
 *
 * @module cli/commands/types
 */

import type { CredentialManager, ToolRegistry } from "@vellum/core";

import type { CommandSecurityPolicy } from "./security/permission-checker.js";

// =============================================================================
// T005: Argument Types
// =============================================================================

/**
 * Supported argument value types
 *
 * - string: Text value
 * - number: Numeric value (parsed from string)
 * - boolean: Flag value (true/false)
 * - path: File system path (validated)
 */
export type ArgType = "string" | "number" | "boolean" | "path";

/**
 * Definition for a positional argument
 *
 * Positional arguments are identified by their order in the command.
 *
 * @example
 * ```typescript
 * const arg: PositionalArg = {
 *   name: 'provider',
 *   type: 'string',
 *   description: 'Provider name (e.g., anthropic)',
 *   required: true,
 * };
 * ```
 */
export interface PositionalArg {
  /** Argument name for display and reference */
  readonly name: string;
  /** Expected value type */
  readonly type: ArgType;
  /** Help text describing the argument */
  readonly description: string;
  /** Whether the argument must be provided */
  readonly required: boolean;
  /** Default value if not provided */
  readonly default?: string | number | boolean;
}

/**
 * Definition for a named (flag) argument
 *
 * Named arguments use --flag or -f syntax.
 *
 * @example
 * ```typescript
 * const arg: NamedArg = {
 *   name: 'store',
 *   shorthand: 's',
 *   type: 'string',
 *   description: 'Credential store to use',
 *   required: false,
 *   default: 'keychain',
 * };
 * ```
 */
export interface NamedArg {
  /** Long form name (used as --name) */
  readonly name: string;
  /** Optional short form (used as -x) */
  readonly shorthand?: string;
  /** Expected value type */
  readonly type: ArgType;
  /** Help text describing the argument */
  readonly description: string;
  /** Whether the argument must be provided */
  readonly required: boolean;
  /** Default value if not provided */
  readonly default?: string | number | boolean;
}

// =============================================================================
// T004: Command Category and Kind
// =============================================================================

/**
 * Command categories for grouping related commands
 *
 * Used for help display organization and command filtering.
 */
export type CommandCategory =
  | "system" // /help, /clear, /version
  | "workflow" // /mode, /vibe, /plan, /spec, /tutorial
  | "auth" // /login, /logout, /credentials
  | "session" // /new, /history, /export
  | "navigation" // /cd, /pwd, /ls
  | "tools" // /tools, /enable, /disable
  | "config" // /config, /theme
  | "debug"; // /debug, /metrics

/**
 * Command source/origin kind
 *
 * - builtin: Core commands shipped with Vellum
 * - plugin: Commands from installed plugins
 * - mcp: Commands exposed via MCP servers
 * - user: User-defined custom commands
 */
export type CommandKind = "builtin" | "plugin" | "mcp" | "user";

// =============================================================================
// T004: Subcommand Definition
// =============================================================================

/**
 * Definition for a subcommand within a parent command
 *
 * Used for two-level autocomplete and help display.
 *
 * @example
 * ```typescript
 * const subcommand: SubcommandDef = {
 *   name: 'list',
 *   description: 'List all items',
 *   aliases: ['ls'],
 * };
 * ```
 */
export interface SubcommandDef {
  /** Subcommand name */
  readonly name: string;
  /** Human-readable description for help text */
  readonly description: string;
  /** Alternative names for the subcommand */
  readonly aliases?: readonly string[];
}

// =============================================================================
// T004: SlashCommand Interface
// =============================================================================

/**
 * Complete definition of a slash command
 *
 * Defines the command's metadata, arguments, and execution handler.
 *
 * @example
 * ```typescript
 * const loginCommand: SlashCommand = {
 *   name: 'login',
 *   description: 'Add credential for a provider',
 *   kind: 'builtin',
 *   category: 'auth',
 *   aliases: ['signin'],
 *   positionalArgs: [{
 *     name: 'provider',
 *     type: 'string',
 *     description: 'Provider name',
 *     required: false,
 *   }],
 *   namedArgs: [{
 *     name: 'store',
 *     shorthand: 's',
 *     type: 'string',
 *     description: 'Credential store',
 *     required: false,
 *     default: 'keychain',
 *   }],
 *   execute: async (ctx) => {
 *     // Implementation
 *     return { kind: 'success', message: 'Logged in' };
 *   },
 * };
 * ```
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
  /** Alternative names for the command */
  readonly aliases?: readonly string[];
  /** Position-based arguments */
  readonly positionalArgs?: readonly PositionalArg[];
  /** Flag-based arguments (--flag) */
  readonly namedArgs?: readonly NamedArg[];
  /** Example usages for help display */
  readonly examples?: readonly string[];
  /** Security policy for resource access control (T052) */
  readonly securityPolicy?: CommandSecurityPolicy;
  /** Subcommands for two-level autocomplete */
  readonly subcommands?: readonly SubcommandDef[];
  /** Command execution handler */
  readonly execute: (ctx: CommandContext) => Promise<CommandResult>;
}

// =============================================================================
// T006: Command Error Codes
// =============================================================================

/**
 * Standardized error codes for command failures
 *
 * Used for programmatic error handling and user-friendly messages.
 */
export type CommandErrorCode =
  // Argument errors
  | "INVALID_ARGUMENT"
  | "MISSING_ARGUMENT"
  | "ARGUMENT_TYPE_ERROR"
  // Provider/auth errors
  | "PROVIDER_NOT_FOUND"
  | "CREDENTIAL_NOT_FOUND"
  | "AUTHENTICATION_FAILED"
  // Permission errors
  | "PERMISSION_DENIED"
  | "OPERATION_NOT_ALLOWED"
  // Resource errors
  | "FILE_NOT_FOUND"
  | "PATH_NOT_ALLOWED"
  | "RESOURCE_NOT_FOUND"
  // Command errors
  | "COMMAND_NOT_FOUND"
  | "COMMAND_DISABLED"
  | "COMMAND_ABORTED"
  // System errors
  | "INTERNAL_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  // Generic
  | "UNKNOWN_ERROR";

// =============================================================================
// T006: Interactive Prompt Types
// =============================================================================

/**
 * Configuration for interactive user input
 *
 * Used when a command needs additional user input to complete.
 */
export interface InteractivePrompt {
  /** Type of input to collect */
  readonly inputType: "text" | "password" | "confirm" | "select";
  /** Prompt message to display */
  readonly message: string;
  /** Placeholder text for input field */
  readonly placeholder?: string;
  /** Options for select input type */
  readonly options?: readonly string[];
  /** Default value for the input */
  readonly defaultValue?: string;
  /** Handler for submitted input */
  readonly handler: (value: string) => Promise<CommandResult>;
  /** Handler for cancelled input */
  readonly onCancel?: () => CommandResult;
  /** Provider name (for credential-related prompts) */
  readonly provider?: string;
  /** Form title (e.g., "🔐 Set API Key for Anthropic") */
  readonly title?: string;
  /** Help hint (e.g., "Your key starts with sk-ant-...") */
  readonly helpText?: string;
  /** Format example for the input */
  readonly formatHint?: string;
  /** Link to provider documentation */
  readonly documentationUrl?: string;
}

/**
 * Configuration for an async operation started by a command
 */
export interface AsyncOperation {
  /** Status message to display */
  readonly message: string;
  /** Promise that resolves when operation completes */
  readonly promise: Promise<CommandResult>;
  /** Whether to show a progress indicator */
  readonly showProgress?: boolean;
  /** Function to cancel the operation */
  readonly cancel?: () => void;
}

// =============================================================================
// T006: CommandResult Discriminated Union
// =============================================================================

/**
 * Successful command execution result
 */
export interface CommandSuccess {
  /** Discriminator for type narrowing */
  readonly kind: "success";
  /** Optional success message to display */
  readonly message?: string;
  /** Result data for programmatic access */
  readonly data?: unknown;
  /** Whether to clear the screen after execution */
  readonly clearScreen?: boolean;
  /** Whether to refresh the UI state */
  readonly refresh?: boolean;
}

/**
 * Failed command execution result
 */
export interface CommandError {
  /** Discriminator for type narrowing */
  readonly kind: "error";
  /** Standardized error code */
  readonly code: CommandErrorCode;
  /** Human-readable error message */
  readonly message: string;
  /** Suggested commands or actions to resolve the error */
  readonly suggestions?: readonly string[];
  /** Related help command */
  readonly helpCommand?: string;
}

/**
 * Command requires additional user input
 */
export interface CommandInteractive {
  /** Discriminator for type narrowing */
  readonly kind: "interactive";
  /** Interactive input configuration */
  readonly prompt: InteractivePrompt;
}

/**
 * Command started an async operation
 */
export interface CommandPending {
  /** Discriminator for type narrowing */
  readonly kind: "pending";
  /** Async operation details */
  readonly operation: AsyncOperation;
}

/**
 * Command execution result
 *
 * Discriminated union representing all possible command outcomes.
 * Use the `kind` field to narrow the type.
 *
 * @example
 * ```typescript
 * const result = await command.execute(ctx);
 *
 * switch (result.kind) {
 *   case 'success':
 *     console.log(result.message);
 *     break;
 *   case 'error':
 *     console.error(`[${result.code}] ${result.message}`);
 *     break;
 *   case 'interactive':
 *     // Show input prompt
 *     break;
 *   case 'pending':
 *     // Wait for operation
 *     break;
 * }
 * ```
 */
export type CommandResult = CommandSuccess | CommandError | CommandInteractive | CommandPending;

// =============================================================================
// T007: Parsed Arguments
// =============================================================================

/**
 * Parsed command arguments after processing
 *
 * Contains resolved positional and named argument values.
 */
export interface ParsedArgs {
  /** Command name (without leading slash) */
  readonly command: string;
  /** Resolved positional argument values */
  readonly positional: readonly unknown[];
  /** Resolved named argument values */
  readonly named: Readonly<Record<string, unknown>>;
  /** Original raw input string */
  readonly raw: string;
}

// =============================================================================
// T007: CommandContext Interface
// =============================================================================

/**
 * Session interface for command execution
 *
 * Minimal session interface needed by commands.
 * Full Session type is defined in @vellum/core.
 */
export interface Session {
  /** Unique session identifier */
  readonly id: string;
  /** Current provider name */
  readonly provider: string;
  /** Current working directory */
  readonly cwd: string;
}

/**
 * Execution context passed to command handlers
 *
 * Provides access to session state, credentials, tools, and utilities
 * needed by commands during execution.
 *
 * @example
 * ```typescript
 * const handler: SlashCommand['execute'] = async (ctx) => {
 *   const { session, credentials, parsedArgs } = ctx;
 *
 *   // Check credential exists
 *   const cred = await credentials.resolve(session.provider);
 *   if (!cred.ok || !cred.value) {
 *     return {
 *       kind: 'error',
 *       code: 'CREDENTIAL_NOT_FOUND',
 *       message: `No credential for ${session.provider}`,
 *     };
 *   }
 *
 *   // Emit event
 *   ctx.emit('command:executed', { command: parsedArgs.command });
 *
 *   return { kind: 'success' };
 * };
 * ```
 */
export interface CommandContext {
  /** Current session state */
  readonly session: Session;
  /** Credential manager for authentication */
  readonly credentials: CredentialManager;
  /** Tool registry for available tools */
  readonly toolRegistry: ToolRegistry;
  /** Parsed command arguments */
  readonly parsedArgs: ParsedArgs;
  /** Abort signal for cancellation support */
  readonly signal?: AbortSignal;
  /**
   * Emit an event
   *
   * @param event - Event name
   * @param data - Optional event data
   */
  readonly emit: (event: string, data?: unknown) => void;
}

// =============================================================================
// Result Factory Helpers
// =============================================================================

/**
 * Create a success result
 *
 * @param message - Optional success message
 * @param data - Optional result data
 */
export function success(message?: string, data?: unknown): CommandSuccess {
  return { kind: "success", message, data };
}

/**
 * Create an error result
 *
 * @param code - Error code
 * @param message - Error message
 * @param suggestions - Optional suggestions
 */
export function error(
  code: CommandErrorCode,
  message: string,
  suggestions?: readonly string[]
): CommandError {
  return { kind: "error", code, message, suggestions };
}

/**
 * Create an interactive result
 *
 * @param prompt - Interactive prompt configuration
 */
export function interactive(prompt: InteractivePrompt): CommandInteractive {
  return { kind: "interactive", prompt };
}

/**
 * Create a pending result
 *
 * @param operation - Async operation configuration
 */
export function pending(operation: AsyncOperation): CommandPending {
  return { kind: "pending", operation };
}
