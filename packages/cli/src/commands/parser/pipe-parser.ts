/**
 * Command Pipe Parser Module
 *
 * Parses command pipes and redirections with shell-like operators:
 * - | (PIPE): Pass output as input to next command
 * - > (WRITE): Write output to file (overwrite)
 * - >> (APPEND): Write output to file (append)
 *
 * @module cli/commands/parser/pipe-parser
 */

import type { CommandErrorCode, CommandResult } from "../types.js";

// =============================================================================
// T054: Pipe Operator Types
// =============================================================================

/**
 * Pipe operator discriminator
 *
 * - | (PIPE): Pass stdout of left command to stdin of right command
 * - > (WRITE): Write stdout to file, overwriting existing content
 * - >> (APPEND): Write stdout to file, appending to existing content
 */
export type PipeOperator = "|" | ">" | ">>";

/**
 * Segment type discriminator
 */
export type PipeSegmentType = "command" | "file";

/**
 * Single segment of a piped command
 */
export interface PipeSegment {
  /** Segment type: command to execute or file target */
  readonly type: PipeSegmentType;
  /** Command string or file path */
  readonly value: string;
  /** Operator connecting to the NEXT segment (undefined for last) */
  readonly operator?: PipeOperator;
}

/**
 * Result of parsing a piped command string
 */
export interface PipeParseResult {
  /** Whether the input contains pipe operators */
  readonly isPiped: boolean;
  /** Array of command/file segments with their operators */
  readonly segments: readonly PipeSegment[];
  /** Original raw input */
  readonly raw: string;
  /** Whether output redirects to a file */
  readonly hasRedirect: boolean;
  /** Redirect mode if hasRedirect is true */
  readonly redirectMode?: "overwrite" | "append";
  /** Target file if hasRedirect is true */
  readonly redirectTarget?: string;
}

/**
 * Result of pipe execution
 */
export interface PipeExecutionResult {
  /** Final result from the pipe chain */
  readonly result: CommandResult;
  /** Accumulated output data */
  readonly output: string;
  /** Number of commands executed */
  readonly executedCount: number;
  /** Total segments in pipe */
  readonly totalCount: number;
  /** Whether pipe completed fully */
  readonly completed: boolean;
  /** File written to (if redirected) */
  readonly writtenFile?: string;
}

// =============================================================================
// T054: Pipe Parser Implementation
// =============================================================================

/**
 * Check if a position is inside quotes
 */
function isInsideQuotes(input: string, position: number): boolean {
  let inDouble = false;
  let inSingle = false;

  for (let i = 0; i < position && i < input.length; i++) {
    const char = input[i];
    const prevChar = i > 0 ? input[i - 1] : "";

    if (char === '"' && !inSingle && prevChar !== "\\") {
      inDouble = !inDouble;
    } else if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    }
  }

  return inDouble || inSingle;
}

/**
 * Find all pipe operators with their positions
 */
function findPipeOperators(
  input: string
): Array<{ operator: PipeOperator; start: number; end: number }> {
  const operators: Array<{ operator: PipeOperator; start: number; end: number }> = [];

  let i = 0;
  while (i < input.length) {
    // Skip if inside quotes
    if (isInsideQuotes(input, i)) {
      i++;
      continue;
    }

    // Check for >> (must check before single >)
    if (input[i] === ">" && input[i + 1] === ">") {
      operators.push({ operator: ">>", start: i, end: i + 2 });
      i += 2;
      continue;
    }

    // Check for > (single, not part of >>)
    if (input[i] === ">" && input[i + 1] !== ">") {
      operators.push({ operator: ">", start: i, end: i + 1 });
      i++;
      continue;
    }

    // Check for | (but not || - check both next AND previous char)
    if (input[i] === "|" && input[i + 1] !== "|" && input[i - 1] !== "|") {
      operators.push({ operator: "|", start: i, end: i + 1 });
      i++;
      continue;
    }

    i++;
  }

  return operators;
}

/**
 * Pipe Parser
 *
 * Parses command strings containing pipe/redirect operators into segments.
 *
 * @example
 * ```typescript
 * const result = PipeParser.parse('/list | /filter pattern > output.txt');
 * // {
 * //   isPiped: true,
 * //   segments: [
 * //     { type: 'command', value: '/list', operator: '|' },
 * //     { type: 'command', value: '/filter pattern', operator: '>' },
 * //     { type: 'file', value: 'output.txt' }
 * //   ],
 * //   raw: '/list | /filter pattern > output.txt',
 * //   hasRedirect: true,
 * //   redirectMode: 'overwrite',
 * //   redirectTarget: 'output.txt'
 * // }
 * ```
 */
// biome-ignore lint/complexity/noStaticOnlyClass: PipeParser provides logical grouping
export class PipeParser {
  /**
   * Parse a command string for pipe operators
   *
   * @param input - Raw command string
   * @returns PipeParseResult with parsed segments
   */
  static parse(input: string): PipeParseResult {
    const trimmed = input.trim();

    if (!trimmed) {
      return {
        isPiped: false,
        segments: [],
        raw: input,
        hasRedirect: false,
      };
    }

    const operators = findPipeOperators(trimmed);

    // No pipe operators found
    if (operators.length === 0) {
      return {
        isPiped: false,
        segments: [{ type: "command", value: trimmed }],
        raw: input,
        hasRedirect: false,
      };
    }

    // Split into segments
    const segments: PipeSegment[] = [];
    let lastEnd = 0;

    for (let i = 0; i < operators.length; i++) {
      const op = operators[i];
      if (!op) continue;

      const value = trimmed.slice(lastEnd, op.start).trim();
      if (value) {
        // Determine segment type based on what comes before
        const type: PipeSegmentType = "command";
        segments.push({ type, value, operator: op.operator });
      }
      lastEnd = op.end;
    }

    // Add final segment (after last operator)
    const finalValue = trimmed.slice(lastEnd).trim();
    if (finalValue) {
      // Determine if final segment is a file (after > or >>)
      const lastOp = operators[operators.length - 1];
      const isFile = lastOp?.operator === ">" || lastOp?.operator === ">>";
      segments.push({
        type: isFile ? "file" : "command",
        value: finalValue,
      });
    }

    // Determine redirect info
    const lastOp = operators[operators.length - 1];
    const hasRedirect = lastOp?.operator === ">" || lastOp?.operator === ">>";
    const redirectMode = hasRedirect
      ? lastOp?.operator === ">>"
        ? "append"
        : "overwrite"
      : undefined;
    const redirectTarget = hasRedirect ? finalValue : undefined;

    return {
      isPiped: segments.length > 1 || hasRedirect,
      segments,
      raw: input,
      hasRedirect,
      redirectMode,
      redirectTarget,
    };
  }

  /**
   * Check if input contains pipe operators
   *
   * @param input - Raw command string
   * @returns true if pipe operators are present
   */
  static hasPipeOperators(input: string): boolean {
    const operators = findPipeOperators(input);
    return operators.length > 0;
  }

  /**
   * Check if input has file redirection
   *
   * @param input - Raw command string
   * @returns true if > or >> is present
   */
  static hasRedirection(input: string): boolean {
    const operators = findPipeOperators(input);
    return operators.some((op) => op.operator === ">" || op.operator === ">>");
  }
}

// =============================================================================
// T054: Piped Command Executor
// =============================================================================

/**
 * Executor function type for piped commands
 * Returns output string for piping to next command
 */
export type PipeCommandExecutorFn = (
  command: string,
  input?: string,
  signal?: AbortSignal
) => Promise<{ result: CommandResult; output: string }>;

/**
 * File writer function type for redirections
 */
export type FileWriterFn = (
  path: string,
  content: string,
  mode: "overwrite" | "append"
) => Promise<void>;

/**
 * Piped Command Executor
 *
 * Executes a pipe of commands according to shell semantics:
 * - | : Pass output of left as input to right
 * - > : Write final output to file (overwrite)
 * - >> : Write final output to file (append)
 *
 * @example
 * ```typescript
 * const executor = new PipedCommandExecutor(
 *   async (cmd, input) => ({
 *     result: { type: 'success', message: `Processed: ${cmd}` },
 *     output: `Output from ${cmd} with input: ${input ?? 'none'}`
 *   }),
 *   async (path, content, mode) => {
 *     // Write to file
 *   }
 * );
 *
 * const result = await executor.execute('/list | /filter > output.txt');
 * ```
 */
export class PipedCommandExecutor {
  private readonly executeFn: PipeCommandExecutorFn;
  private readonly writeFileFn?: FileWriterFn;

  /**
   * Create a PipedCommandExecutor
   *
   * @param executeFn - Function to execute individual commands
   * @param writeFileFn - Optional function to write output to files
   */
  constructor(executeFn: PipeCommandExecutorFn, writeFileFn?: FileWriterFn) {
    this.executeFn = executeFn;
    this.writeFileFn = writeFileFn;
  }

  /** Create an error result for pipe execution */
  private createErrorResult(
    code: CommandErrorCode,
    message: string,
    output: string,
    executedCount: number,
    totalCount: number
  ): PipeExecutionResult {
    return {
      result: { kind: "error", code, message },
      output,
      executedCount,
      totalCount,
      completed: false,
    };
  }

  /** Execute command segments in sequence */
  private async executeCommandSequence(
    commandSegments: PipeSegment[],
    signal?: AbortSignal
  ): Promise<{ result: CommandResult; output: string; executedCount: number; aborted: boolean }> {
    let currentOutput = "";
    let lastResult: CommandResult = { kind: "success", message: "" };
    let executedCount = 0;

    for (let i = 0; i < commandSegments.length; i++) {
      if (signal?.aborted) {
        return {
          result: {
            kind: "error",
            code: "COMMAND_ABORTED",
            message: "Pipe execution was cancelled",
          },
          output: currentOutput,
          executedCount,
          aborted: true,
        };
      }

      const segment = commandSegments[i];
      if (!segment) continue;

      const pipeInput = i > 0 ? currentOutput : undefined;
      const { result, output } = await this.executeFn(segment.value, pipeInput, signal);

      lastResult = result;
      currentOutput = output;
      executedCount++;

      if (result.kind === "error") {
        return { result, output: currentOutput, executedCount, aborted: false };
      }
    }

    return { result: lastResult, output: currentOutput, executedCount, aborted: false };
  }

  /** Handle file redirection after command execution */
  private async handleFileRedirection(
    parsed: PipeParseResult,
    output: string,
    executedCount: number
  ): Promise<{ success: boolean; writtenFile?: string; error?: PipeExecutionResult }> {
    if (!parsed.hasRedirect || !parsed.redirectTarget || !parsed.redirectMode) {
      return { success: true };
    }

    if (!this.writeFileFn) {
      return {
        success: false,
        error: this.createErrorResult(
          "INTERNAL_ERROR",
          "File redirection not supported: no file writer configured",
          output,
          executedCount,
          parsed.segments.length
        ),
      };
    }

    try {
      await this.writeFileFn(parsed.redirectTarget, output, parsed.redirectMode);
      return { success: true, writtenFile: parsed.redirectTarget };
    } catch (err) {
      return {
        success: false,
        error: this.createErrorResult(
          "INTERNAL_ERROR",
          `Failed to write to file '${parsed.redirectTarget}': ${err instanceof Error ? err.message : String(err)}`,
          output,
          executedCount,
          parsed.segments.length
        ),
      };
    }
  }

  /**
   * Execute a piped command string
   *
   * @param input - Command string (may contain pipe operators)
   * @param signal - Optional abort signal for cancellation
   * @returns PipeExecutionResult with execution details
   */
  async execute(input: string, signal?: AbortSignal): Promise<PipeExecutionResult> {
    const parsed = PipeParser.parse(input);

    if (!parsed.isPiped || parsed.segments.length === 0) {
      const command = parsed.segments[0]?.value ?? input;
      const { result, output } = await this.executeFn(command, undefined, signal);
      return { result, output, executedCount: 1, totalCount: 1, completed: true };
    }

    const commandSegments = parsed.segments.filter((s) => s.type === "command");
    const seqResult = await this.executeCommandSequence(commandSegments, signal);

    if (seqResult.aborted || seqResult.result.kind === "error") {
      return {
        result: seqResult.result,
        output: seqResult.output,
        executedCount: seqResult.executedCount,
        totalCount: parsed.segments.length,
        completed: false,
      };
    }

    const redirectResult = await this.handleFileRedirection(
      parsed,
      seqResult.output,
      seqResult.executedCount
    );
    if (!redirectResult.success && redirectResult.error) {
      return redirectResult.error;
    }

    return {
      result: seqResult.result,
      output: seqResult.output,
      executedCount: seqResult.executedCount,
      totalCount: parsed.segments.length,
      completed: true,
      writtenFile: redirectResult.writtenFile,
    };
  }
}
