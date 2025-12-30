/**
 * Batch Executor (T-048)
 *
 * Executes multiple commands in sequence from a batch script.
 * Supports continue-on-error option for resilient batch processing.
 *
 * @module cli/commands/batch
 */

import type { CommandExecutor } from "../executor.js";
import type { CommandResult } from "../types.js";

// =============================================================================
// Interfaces
// =============================================================================

/**
 * Configuration for batch execution
 */
export interface BatchConfig {
  /** Continue executing remaining commands if one fails */
  continueOnError?: boolean;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Callback invoked before each command */
  onBeforeCommand?: (command: string, index: number) => void;
  /** Callback invoked after each command */
  onAfterCommand?: (command: string, index: number, result: CommandResult) => void;
  /** Skip empty lines and comments (lines starting with #) */
  skipComments?: boolean;
}

/**
 * Result of a single command in batch execution
 */
export interface BatchCommandResult {
  /** Original command string */
  command: string;
  /** Command index in batch (0-based) */
  index: number;
  /** Execution result */
  result: CommandResult;
  /** Whether command was skipped (comment or empty) */
  skipped: boolean;
}

/**
 * Result of batch execution
 */
export interface BatchResult {
  /** Results for each command */
  commands: BatchCommandResult[];
  /** Total commands processed */
  total: number;
  /** Number of successful commands */
  succeeded: number;
  /** Number of failed commands */
  failed: number;
  /** Number of skipped commands */
  skipped: number;
  /** Whether batch completed (not aborted early) */
  completed: boolean;
  /** Error that caused early abort (if any) */
  abortError?: Error;
}

// =============================================================================
// Batch Script Parser
// =============================================================================

/**
 * Parses batch scripts into individual commands
 *
 * Handles:
 * - Newline-separated commands
 * - Comment lines (starting with #)
 * - Empty lines
 * - Leading/trailing whitespace
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Parser provides a logical grouping for batch parsing functionality
export class BatchScriptParser {
  /**
   * Parse a batch script into command lines
   *
   * @param script - Batch script content
   * @param skipComments - Whether to filter out comments and empty lines
   * @returns Array of command strings
   */
  static parse(script: string, skipComments = true): string[] {
    const lines = script.split(/\r?\n/);

    if (!skipComments) {
      return lines;
    }

    const result: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines
      if (trimmed === "") continue;
      // Skip comment lines
      if (trimmed.startsWith("#")) continue;
      result.push(trimmed);
    }
    return result;
  }

  /**
   * Check if a line is a comment
   *
   * @param line - Line to check
   * @returns true if line is a comment
   */
  static isComment(line: string): boolean {
    return line.trim().startsWith("#");
  }

  /**
   * Check if a line is empty (whitespace only)
   *
   * @param line - Line to check
   * @returns true if line is empty
   */
  static isEmpty(line: string): boolean {
    return line.trim() === "";
  }

  /**
   * Validate batch script for common issues
   *
   * @param script - Batch script content
   * @returns Validation result with any warnings
   */
  static validate(script: string): BatchValidationResult {
    const lines = script.split(/\r?\n/);
    const warnings: string[] = [];
    let commandCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      if (rawLine === undefined) continue;
      const line = rawLine.trim();

      if (BatchScriptParser.isEmpty(line) || BatchScriptParser.isComment(line)) {
        continue;
      }

      commandCount++;

      // Check for common issues
      if (!line.startsWith("/")) {
        warnings.push(`Line ${i + 1}: Command should start with /`);
      }
    }

    return {
      valid: commandCount > 0,
      commandCount,
      warnings,
    };
  }
}

/**
 * Result of batch script validation
 */
export interface BatchValidationResult {
  /** Whether script is valid */
  valid: boolean;
  /** Number of commands found */
  commandCount: number;
  /** Validation warnings */
  warnings: string[];
}

// =============================================================================
// Batch Executor
// =============================================================================

/**
 * Executes batch scripts with error handling
 *
 * @example
 * ```typescript
 * const batch = new BatchExecutor(executor);
 *
 * const script = `
 * # Setup commands
 * /login anthropic
 * /config set theme dark
 *
 * # Main operation
 * /help
 * `;
 *
 * const result = await batch.execute(script, {
 *   continueOnError: true,
 *   onBeforeCommand: (cmd, i) => console.log(`Running ${i + 1}: ${cmd}`),
 * });
 *
 * console.log(`Completed: ${result.succeeded}/${result.total}`);
 * ```
 */
export class BatchExecutor {
  constructor(private readonly executor: CommandExecutor) {}

  /**
   * Execute a batch script
   *
   * @param script - Batch script content (newline-separated commands)
   * @param config - Batch execution configuration
   * @returns Batch execution result
   */
  async execute(script: string, config: BatchConfig = {}): Promise<BatchResult> {
    const { continueOnError = false, signal, onBeforeCommand, onAfterCommand, skipComments = true } =
      config;

    const lines = script.split(/\r?\n/);
    const commands: BatchCommandResult[] = [];
    let completed = true;
    let abortError: Error | undefined;

    for (let i = 0; i < lines.length; i++) {
      // Check for abort signal
      if (signal?.aborted) {
        completed = false;
        abortError = new Error("Batch execution aborted");
        break;
      }

      const line = lines[i];
      if (line === undefined) continue;
      const trimmedLine = line.trim();

      // Handle comments and empty lines
      if (skipComments && (BatchScriptParser.isEmpty(trimmedLine) || BatchScriptParser.isComment(trimmedLine))) {
        commands.push({
          command: line,
          index: i,
          result: { kind: "success" },
          skipped: true,
        });
        continue;
      }

      // Execute command
      onBeforeCommand?.(trimmedLine, i);

      try {
        const result = await this.executor.execute(trimmedLine, signal);

        commands.push({
          command: trimmedLine,
          index: i,
          result,
          skipped: false,
        });

        onAfterCommand?.(trimmedLine, i, result);

        // Check for failure
        if (result.kind === "error" && !continueOnError) {
          completed = false;
          abortError = new Error(`Command failed: ${result.message}`);
          break;
        }
      } catch (error) {
        const errorResult: CommandResult = {
          kind: "error",
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
        };

        commands.push({
          command: trimmedLine,
          index: i,
          result: errorResult,
          skipped: false,
        });

        onAfterCommand?.(trimmedLine, i, errorResult);

        if (!continueOnError) {
          completed = false;
          abortError = error instanceof Error ? error : new Error(String(error));
          break;
        }
      }
    }

    // Calculate summary
    const executed = commands.filter((c) => !c.skipped);
    const succeeded = executed.filter((c) => c.result.kind === "success").length;
    const failed = executed.filter((c) => c.result.kind === "error").length;
    const skipped = commands.filter((c) => c.skipped).length;

    return {
      commands,
      total: executed.length,
      succeeded,
      failed,
      skipped,
      completed,
      abortError,
    };
  }

  /**
   * Execute commands from an array
   *
   * @param commands - Array of command strings
   * @param config - Batch execution configuration
   * @returns Batch execution result
   */
  async executeCommands(commands: string[], config: BatchConfig = {}): Promise<BatchResult> {
    const script = commands.join("\n");
    return this.execute(script, { ...config, skipComments: false });
  }
}

/**
 * Create a batch script from an array of commands
 *
 * @param commands - Array of command strings
 * @param options - Script creation options
 * @returns Formatted batch script
 */
export function createBatchScript(
  commands: string[],
  options: { header?: string; comments?: Record<number, string> } = {}
): string {
  const { header, comments = {} } = options;
  const lines: string[] = [];

  if (header) {
    lines.push(`# ${header}`);
    lines.push("");
  }

  for (let i = 0; i < commands.length; i++) {
    const comment = comments[i];
    const cmd = commands[i];
    if (comment) {
      lines.push(`# ${comment}`);
    }
    if (cmd !== undefined) {
      lines.push(cmd);
    }
  }

  return lines.join("\n");
}
