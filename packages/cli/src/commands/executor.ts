/**
 * Command Executor
 *
 * Executes slash commands with:
 * - Command resolution via registry
 * - Argument validation against command definitions
 * - Unknown command handling with suggestions
 * - Context creation via provider pattern
 *
 * @module cli/commands/executor
 */

import { CommandParser, isParseError } from "./parser.js";
import type { CommandRegistry } from "./registry.js";
import type {
  ArgType,
  CommandContext,
  CommandError,
  CommandErrorCode,
  CommandResult,
  NamedArg,
  ParsedArgs,
  PositionalArg,
  SlashCommand,
} from "./types.js";

// =============================================================================
// T018: CommandContextProvider Interface
// =============================================================================

/**
 * Provider interface for creating CommandContext instances
 *
 * Abstracts context creation to allow dependency injection and testing.
 *
 * @example
 * ```typescript
 * const contextProvider: CommandContextProvider = {
 *   createContext(parsedArgs, signal) {
 *     return {
 *       session: currentSession,
 *       credentials: credentialManager,
 *       toolRegistry: tools,
 *       parsedArgs,
 *       signal,
 *       emit: eventEmitter.emit.bind(eventEmitter),
 *     };
 *   },
 * };
 * ```
 */
export interface CommandContextProvider {
  /**
   * Create a CommandContext for command execution
   *
   * @param parsedArgs - Parsed command arguments
   * @param signal - Optional abort signal for cancellation
   * @returns CommandContext with all dependencies
   */
  createContext(parsedArgs: ParsedArgs, signal?: AbortSignal): CommandContext;
}

// =============================================================================
// T020: Levenshtein Distance for Suggestions
// =============================================================================

/**
 * Initialize Levenshtein distance matrix
 */
function initLevenshteinMatrix(rows: number, cols: number): number[][] {
  const matrix: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const row: number[] = [];
    for (let j = 0; j < cols; j++) {
      if (i === 0) {
        row.push(j);
      } else if (j === 0) {
        row.push(i);
      } else {
        row.push(0);
      }
    }
    matrix.push(row);
  }
  return matrix;
}

/**
 * Fill Levenshtein distance matrix with computed values
 */
function fillLevenshteinMatrix(matrix: number[][], a: string, b: string): void {
  const rows = a.length + 1;
  const cols = b.length + 1;

  for (let i = 1; i < rows; i++) {
    const currentRow = matrix[i];
    const prevRow = matrix[i - 1];
    if (!currentRow || !prevRow) continue;

    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const deletion = (prevRow[j] ?? 0) + 1;
      const insertion = (currentRow[j - 1] ?? 0) + 1;
      const substitution = (prevRow[j - 1] ?? 0) + cost;
      currentRow[j] = Math.min(deletion, insertion, substitution);
    }
  }
}

/**
 * Calculate Levenshtein distance between two strings
 *
 * Used for finding similar command names when a command is not found.
 *
 * @param a - First string
 * @param b - Second string
 * @returns Edit distance (minimum edits to transform a to b)
 */
function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;

  const matrix = initLevenshteinMatrix(rows, cols);
  fillLevenshteinMatrix(matrix, a, b);

  return matrix[a.length]?.[b.length] ?? 0;
}

/**
 * Find similar commands using Levenshtein distance
 *
 * @param target - Command name that wasn't found
 * @param commands - List of available commands
 * @param maxSuggestions - Maximum suggestions to return (default: 3)
 * @param maxDistance - Maximum edit distance to consider (default: 3)
 * @returns Array of similar command names, sorted by similarity
 */
function findSimilarCommands(
  target: string,
  commands: SlashCommand[],
  maxSuggestions = 3,
  maxDistance = 3
): string[] {
  const targetLower = target.toLowerCase();

  const scored: Array<{ name: string; distance: number }> = [];

  for (const cmd of commands) {
    // Check main name
    const nameLower = cmd.name.toLowerCase();
    const nameDistance = levenshtein(targetLower, nameLower);

    // Also consider prefix match (e.g., "hel" for "help")
    const isPrefixMatch = nameLower.startsWith(targetLower) || targetLower.startsWith(nameLower);
    const adjustedDistance = isPrefixMatch ? Math.min(nameDistance, 1) : nameDistance;

    if (adjustedDistance <= maxDistance) {
      scored.push({ name: cmd.name, distance: adjustedDistance });
    }

    // Check aliases
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        const aliasLower = alias.toLowerCase();
        const aliasDistance = levenshtein(targetLower, aliasLower);
        const aliasIsPrefixMatch =
          aliasLower.startsWith(targetLower) || targetLower.startsWith(aliasLower);
        const adjustedAliasDistance = aliasIsPrefixMatch
          ? Math.min(aliasDistance, 1)
          : aliasDistance;

        if (adjustedAliasDistance <= maxDistance) {
          scored.push({ name: cmd.name, distance: adjustedAliasDistance });
        }
      }
    }
  }

  // Sort by distance (ascending) and remove duplicates
  const seen = new Set<string>();
  return scored
    .sort((a, b) => a.distance - b.distance)
    .filter((item) => {
      if (seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    })
    .slice(0, maxSuggestions)
    .map((item) => item.name);
}

// =============================================================================
// T021: Argument Validation
// =============================================================================

/**
 * Validation error details
 */
interface ValidationError {
  readonly code: CommandErrorCode;
  readonly message: string;
  readonly argName: string;
}

/**
 * Validate a value against an expected type
 *
 * @param value - Value to validate
 * @param expectedType - Expected ArgType
 * @returns true if valid, false otherwise
 */
function validateArgType(value: unknown, expectedType: ArgType): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  switch (expectedType) {
    case "string":
      return typeof value === "string";

    case "number": {
      if (typeof value === "number") return !Number.isNaN(value);
      if (typeof value === "string") {
        const num = Number(value);
        return !Number.isNaN(num);
      }
      return false;
    }

    case "boolean": {
      if (typeof value === "boolean") return true;
      if (typeof value === "string") {
        const lower = value.toLowerCase();
        return lower === "true" || lower === "false" || lower === "1" || lower === "0";
      }
      return false;
    }

    case "path":
      // Path is validated as a non-empty string
      // Actual file existence checking is done by the command itself
      return typeof value === "string" && value.length > 0;

    default:
      return false;
  }
}

/**
 * Convert a value to the expected type
 *
 * @param value - Value to convert
 * @param expectedType - Expected ArgType
 * @returns Converted value
 */
function coerceArgType(value: string | boolean, expectedType: ArgType): unknown {
  if (expectedType === "number" && typeof value === "string") {
    return Number(value);
  }

  if (expectedType === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const lower = value.toLowerCase();
      return lower === "true" || lower === "1";
    }
  }

  return value;
}

/**
 * Validate positional arguments against command definition
 *
 * @param positional - Parsed positional arguments
 * @param argDefs - Command's positional argument definitions
 * @returns ValidationError if invalid, undefined if valid
 */
function validatePositionalArgs(
  positional: readonly string[],
  argDefs: readonly PositionalArg[]
): ValidationError | undefined {
  for (let i = 0; i < argDefs.length; i++) {
    const def = argDefs[i];
    if (!def) continue;

    const value = positional[i];

    // Check required
    if (def.required && value === undefined && def.default === undefined) {
      return {
        code: "MISSING_ARGUMENT",
        message: `Missing required argument: ${def.name}`,
        argName: def.name,
      };
    }

    // Check type if value provided
    if (value !== undefined && !validateArgType(value, def.type)) {
      return {
        code: "ARGUMENT_TYPE_ERROR",
        message: `Invalid type for argument '${def.name}': expected ${def.type}`,
        argName: def.name,
      };
    }
  }

  return undefined;
}

/**
 * Validate named arguments against command definition
 *
 * @param named - Parsed named arguments
 * @param argDefs - Command's named argument definitions
 * @returns ValidationError if invalid, undefined if valid
 */
function validateNamedArgs(
  named: ReadonlyMap<string, string | boolean>,
  argDefs: readonly NamedArg[]
): ValidationError | undefined {
  for (const def of argDefs) {
    const value = named.get(def.name) ?? named.get(def.shorthand ?? "");

    // Check required
    if (def.required && value === undefined && def.default === undefined) {
      return {
        code: "MISSING_ARGUMENT",
        message: `Missing required argument: --${def.name}`,
        argName: def.name,
      };
    }

    // Check type if value provided
    if (value !== undefined && !validateArgType(value, def.type)) {
      return {
        code: "ARGUMENT_TYPE_ERROR",
        message: `Invalid type for argument '--${def.name}': expected ${def.type}`,
        argName: def.name,
      };
    }
  }

  return undefined;
}

/**
 * Build ParsedArgs with type coercion and defaults applied
 *
 * @param command - Command being executed
 * @param parsedCommand - Parsed command from parser
 * @returns ParsedArgs with resolved values
 */
function buildParsedArgs(
  command: SlashCommand,
  parsedCommand: {
    command: string;
    positional: readonly string[];
    named: ReadonlyMap<string, string | boolean>;
    raw: string;
  }
): ParsedArgs {
  // Build positional args with defaults and type coercion
  const positionalValues: unknown[] = [];
  const positionalDefs = command.positionalArgs ?? [];

  for (let i = 0; i < positionalDefs.length; i++) {
    const def = positionalDefs[i];
    if (!def) continue;

    const rawValue = parsedCommand.positional[i];

    if (rawValue !== undefined) {
      positionalValues.push(coerceArgType(rawValue, def.type));
    } else if (def.default !== undefined) {
      positionalValues.push(def.default);
    } else {
      positionalValues.push(undefined);
    }
  }

  // Add any extra positional args beyond the definition
  for (let i = positionalDefs.length; i < parsedCommand.positional.length; i++) {
    positionalValues.push(parsedCommand.positional[i]);
  }

  // Build named args with defaults and type coercion
  const namedValues: Record<string, unknown> = {};
  const namedDefs = command.namedArgs ?? [];

  // First, set defaults
  for (const def of namedDefs) {
    if (def.default !== undefined) {
      namedValues[def.name] = def.default;
    }
  }

  // Then, apply provided values with type coercion
  for (const [key, value] of parsedCommand.named.entries()) {
    // Find the definition for this arg (by name or shorthand)
    const def = namedDefs.find((d) => d.name === key || d.shorthand === key);

    if (def) {
      namedValues[def.name] = coerceArgType(value, def.type);
    } else {
      // Unknown flag, pass through as-is
      namedValues[key] = value;
    }
  }

  return {
    command: parsedCommand.command,
    positional: positionalValues,
    named: namedValues,
    raw: parsedCommand.raw,
  };
}

// =============================================================================
// T019: CommandExecutor Class
// =============================================================================

/**
 * Command executor for slash commands
 *
 * Orchestrates command execution:
 * 1. Parse input string
 * 2. Resolve command from registry
 * 3. Validate arguments
 * 4. Create execution context
 * 5. Execute command handler
 *
 * @example
 * ```typescript
 * const executor = new CommandExecutor(registry, contextProvider);
 *
 * // Execute a command
 * const result = await executor.execute('/help');
 *
 * // With abort signal
 * const controller = new AbortController();
 * const result = await executor.execute('/long-task', controller.signal);
 * ```
 */
export class CommandExecutor {
  private readonly registry: CommandRegistry;
  private readonly contextProvider: CommandContextProvider;
  private readonly parser: CommandParser;

  /**
   * Create a new CommandExecutor
   *
   * @param registry - Command registry for command lookup
   * @param contextProvider - Provider for creating execution contexts
   */
  constructor(registry: CommandRegistry, contextProvider: CommandContextProvider) {
    this.registry = registry;
    this.contextProvider = contextProvider;
    this.parser = new CommandParser();
  }

  /**
   * Execute a command from input string
   *
   * @param input - Raw command input (e.g., "/help --verbose")
   * @param signal - Optional abort signal for cancellation
   * @returns Command execution result
   *
   * @example
   * ```typescript
   * const result = await executor.execute('/login anthropic --store keychain');
   *
   * switch (result.kind) {
   *   case 'success':
   *     console.log('Command succeeded:', result.message);
   *     break;
   *   case 'error':
   *     console.error(`[${result.code}] ${result.message}`);
   *     break;
   * }
   * ```
   */
  async execute(input: string, signal?: AbortSignal): Promise<CommandResult> {
    // Step 1: Parse input
    const parseResult = this.parser.parse(input);

    if (isParseError(parseResult)) {
      return {
        kind: "error",
        code: parseResult.code,
        message: parseResult.message,
      };
    }

    // Step 2: Get command from registry
    const command = this.registry.get(parseResult.command);

    if (!command) {
      return this.createUnknownCommandError(parseResult.command);
    }

    // Step 3: Validate arguments
    const validationError = this.validateArguments(command, parseResult);

    if (validationError) {
      return {
        kind: "error",
        code: validationError.code,
        message: validationError.message,
        helpCommand: `/help ${command.name}`,
      };
    }

    // Step 4: Build parsed args with type coercion
    const parsedArgs = buildParsedArgs(command, parseResult);

    // Step 5: Create context
    const context = this.contextProvider.createContext(parsedArgs, signal);

    // Step 6: Execute command
    try {
      return await command.execute(context);
    } catch (error) {
      return {
        kind: "error",
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Create error for unknown command with suggestions
   */
  private createUnknownCommandError(commandName: string): CommandError {
    const allCommands = this.registry.list();
    const suggestions = findSimilarCommands(commandName, allCommands);

    return {
      kind: "error",
      code: "COMMAND_NOT_FOUND",
      message: `Unknown command: /${commandName}`,
      suggestions: suggestions.length > 0 ? suggestions.map((s) => `/${s}`) : undefined,
      helpCommand: "/help",
    };
  }

  /**
   * Validate arguments against command definition
   */
  private validateArguments(
    command: SlashCommand,
    parsedCommand: {
      positional: readonly string[];
      named: ReadonlyMap<string, string | boolean>;
    }
  ): ValidationError | undefined {
    // Validate positional args
    if (command.positionalArgs) {
      const positionalError = validatePositionalArgs(
        parsedCommand.positional,
        command.positionalArgs
      );
      if (positionalError) {
        return positionalError;
      }
    }

    // Validate named args
    if (command.namedArgs) {
      const namedError = validateNamedArgs(parsedCommand.named, command.namedArgs);
      if (namedError) {
        return namedError;
      }
    }

    return undefined;
  }
}
