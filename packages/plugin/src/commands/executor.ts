/**
 * Command Executor for Plugin System
 *
 * Executes parsed plugin commands with argument substitution and tool filtering.
 * Processes markdown content by replacing $ARGUMENTS placeholders and
 * determining the effective set of allowed tools.
 *
 * @module plugin/commands/executor
 */

import type { ParsedCommand } from "./parser.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Arguments placeholder constant used in command templates
 */
const ARGUMENTS_VARIABLE = "$ARGUMENTS";

// =============================================================================
// Types
// =============================================================================

/**
 * Execution context provided when running a command.
 *
 * Contains the runtime environment information needed for command execution,
 * including available tools and session identification.
 */
export interface ExecutionContext {
  /** List of tool names available in the current session */
  readonly availableTools: readonly string[];

  /** Unique identifier for the current session */
  readonly sessionId: string;

  /** Optional abort signal for cancellation support */
  readonly abortSignal?: AbortSignal;
}

/**
 * Result from command execution.
 *
 * Contains the processed content ready for LLM consumption,
 * the filtered set of allowed tools, and execution metadata.
 */
export interface ExecutionResult {
  /** Processed markdown content with arguments substituted */
  readonly content: string;

  /** Tools allowed for this command execution */
  readonly filteredTools: readonly string[];

  /** Execution metadata */
  readonly metadata: {
    /** Original arguments passed to the command */
    readonly originalArgs: string;

    /** Number of $ARGUMENTS substitutions performed */
    readonly substitutionCount: number;
  };
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Counts the number of $ARGUMENTS occurrences in content.
 *
 * @param content - The content to search
 * @returns The count of $ARGUMENTS placeholders
 */
function countArgumentsOccurrences(content: string): number {
  let count = 0;
  let index = content.indexOf(ARGUMENTS_VARIABLE);

  while (index !== -1) {
    count++;
    index = content.indexOf(ARGUMENTS_VARIABLE, index + ARGUMENTS_VARIABLE.length);
  }

  return count;
}

/**
 * Substitutes all $ARGUMENTS placeholders in the content.
 *
 * @param content - The content with $ARGUMENTS placeholders
 * @param args - The arguments to substitute
 * @returns The content with all $ARGUMENTS replaced
 */
function substituteArguments(content: string, args: string): string {
  return content.replaceAll(ARGUMENTS_VARIABLE, args);
}

/**
 * Determines the effective set of allowed tools for command execution.
 *
 * If the command specifies allowedTools, returns the intersection of
 * command's allowedTools and context's availableTools.
 * If no allowedTools specified, returns all availableTools.
 *
 * @param command - The parsed command definition
 * @param context - The execution context with available tools
 * @returns Array of tools allowed for this execution
 */
function resolveAllowedTools(command: ParsedCommand, context: ExecutionContext): readonly string[] {
  // If command doesn't specify allowedTools, use all available tools
  if (!command.allowedTools || command.allowedTools.length === 0) {
    return context.availableTools;
  }

  // Filter to only tools that are both allowed by command and available in context
  const availableSet = new Set(context.availableTools);
  return command.allowedTools.filter((tool) => availableSet.has(tool));
}

/**
 * Executes a parsed command with argument substitution and tool filtering.
 *
 * Processes the command content by:
 * 1. Replacing all $ARGUMENTS placeholders with the provided args
 * 2. Determining the effective set of allowed tools
 * 3. Returning the processed content ready for LLM consumption
 *
 * @param command - The parsed command definition from a markdown file
 * @param args - The arguments to substitute for $ARGUMENTS (can be empty)
 * @param context - The execution context with available tools and session info
 * @returns The execution result with processed content and metadata
 *
 * @example
 * ```typescript
 * const command: ParsedCommand = {
 *   name: 'analyze',
 *   description: 'Analyze code',
 *   content: 'Please analyze the following: $ARGUMENTS',
 *   filePath: '/commands/analyze.md',
 *   hasArgumentsVariable: true,
 *   allowedTools: ['read_file', 'grep_search']
 * };
 *
 * const result = executeCommand(
 *   command,
 *   'src/utils/*.ts',
 *   {
 *     availableTools: ['read_file', 'grep_search', 'write_file'],
 *     sessionId: 'session-123'
 *   }
 * );
 *
 * // result.content = 'Please analyze the following: src/utils/*.ts'
 * // result.filteredTools = ['read_file', 'grep_search']
 * // result.metadata = { originalArgs: 'src/utils/*.ts', substitutionCount: 1 }
 * ```
 *
 * @example Empty arguments
 * ```typescript
 * const result = executeCommand(command, '', context);
 * // $ARGUMENTS replaced with empty string
 * // result.metadata.substitutionCount = 1
 * ```
 *
 * @example No $ARGUMENTS in content
 * ```typescript
 * const command = {
 *   ...baseCommand,
 *   content: 'Fixed prompt without arguments',
 *   hasArgumentsVariable: false
 * };
 * const result = executeCommand(command, 'ignored-args', context);
 * // result.content = 'Fixed prompt without arguments'
 * // result.metadata.substitutionCount = 0
 * ```
 */
export function executeCommand(
  command: ParsedCommand,
  args: string,
  context: ExecutionContext
): ExecutionResult {
  // Count substitutions before replacing
  const substitutionCount = command.hasArgumentsVariable
    ? countArgumentsOccurrences(command.content)
    : 0;

  // Process content - substitute $ARGUMENTS or return as-is
  const content = command.hasArgumentsVariable
    ? substituteArguments(command.content, args)
    : command.content;

  // Resolve allowed tools
  const filteredTools = resolveAllowedTools(command, context);

  return {
    content,
    filteredTools,
    metadata: {
      originalArgs: args,
      substitutionCount,
    },
  };
}
