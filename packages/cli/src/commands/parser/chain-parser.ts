/**
 * Command Chain Parser Module
 *
 * Parses command chains with shell-like operators:
 * - && (AND): Continue only if previous command succeeds
 * - || (OR): Continue only if previous command fails
 * - ; (SEQUENCE): Always continue regardless of result
 *
 * @module cli/commands/parser/chain-parser
 */

import type { CommandResult } from "../types.js";

// =============================================================================
// T053: Chain Operator Types
// =============================================================================

/**
 * Chain operator discriminator
 *
 * - && (AND): Execute next command only if previous succeeded (exit code 0)
 * - || (OR): Execute next command only if previous failed (non-zero exit)
 * - ; (SEQUENCE): Execute next command unconditionally
 */
export type ChainOperator = "&&" | "||" | ";";

/**
 * Single segment of a command chain
 */
export interface ChainSegment {
  /** Raw command string (may include pipes internally) */
  readonly command: string;
  /** Operator connecting to the NEXT segment (undefined for last) */
  readonly operator?: ChainOperator;
}

/**
 * Result of parsing a chained command string
 */
export interface ChainParseResult {
  /** Whether the input contains chain operators */
  readonly isChained: boolean;
  /** Array of command segments with their operators */
  readonly segments: readonly ChainSegment[];
  /** Original raw input */
  readonly raw: string;
}

/**
 * Result of chain execution
 */
export interface ChainExecutionResult {
  /** Final result from the chain (last executed command) */
  readonly result: CommandResult;
  /** Number of commands executed */
  readonly executedCount: number;
  /** Total commands in chain */
  readonly totalCount: number;
  /** Whether chain completed fully */
  readonly completed: boolean;
  /** Index of last executed command */
  readonly lastExecutedIndex: number;
}

// =============================================================================
// T053: Chain Parser Implementation
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
 * Find all chain operators with their positions
 */
function findChainOperators(
  input: string
): Array<{ operator: ChainOperator; start: number; end: number }> {
  const operators: Array<{ operator: ChainOperator; start: number; end: number }> = [];

  let i = 0;
  while (i < input.length) {
    // Skip if inside quotes
    if (isInsideQuotes(input, i)) {
      i++;
      continue;
    }

    // Check for && (must check before single &)
    if (input[i] === "&" && input[i + 1] === "&") {
      operators.push({ operator: "&&", start: i, end: i + 2 });
      i += 2;
      continue;
    }

    // Check for ||
    if (input[i] === "|" && input[i + 1] === "|") {
      operators.push({ operator: "||", start: i, end: i + 2 });
      i += 2;
      continue;
    }

    // Check for ; (only if not followed by another operator-like char)
    if (input[i] === ";") {
      operators.push({ operator: ";", start: i, end: i + 1 });
      i++;
      continue;
    }

    i++;
  }

  return operators;
}

/**
 * Chain Parser
 *
 * Parses command strings containing chain operators into segments.
 *
 * @example
 * ```typescript
 * const result = ChainParser.parse('/cmd1 && /cmd2 || /cmd3');
 * // {
 * //   isChained: true,
 * //   segments: [
 * //     { command: '/cmd1', operator: '&&' },
 * //     { command: '/cmd2', operator: '||' },
 * //     { command: '/cmd3' }
 * //   ],
 * //   raw: '/cmd1 && /cmd2 || /cmd3'
 * // }
 * ```
 */
// biome-ignore lint/complexity/noStaticOnlyClass: ChainParser provides logical grouping
export class ChainParser {
  /**
   * Parse a command string for chain operators
   *
   * @param input - Raw command string
   * @returns ChainParseResult with parsed segments
   */
  static parse(input: string): ChainParseResult {
    const trimmed = input.trim();

    if (!trimmed) {
      return {
        isChained: false,
        segments: [],
        raw: input,
      };
    }

    const operators = findChainOperators(trimmed);

    // No chain operators found
    if (operators.length === 0) {
      return {
        isChained: false,
        segments: [{ command: trimmed }],
        raw: input,
      };
    }

    // Split into segments
    const segments: ChainSegment[] = [];
    let lastEnd = 0;

    for (const op of operators) {
      const command = trimmed.slice(lastEnd, op.start).trim();
      if (command) {
        segments.push({ command, operator: op.operator });
      }
      lastEnd = op.end;
    }

    // Add final segment (after last operator)
    const finalCommand = trimmed.slice(lastEnd).trim();
    if (finalCommand) {
      segments.push({ command: finalCommand });
    }

    return {
      isChained: segments.length > 1,
      segments,
      raw: input,
    };
  }

  /**
   * Check if input contains chain operators
   *
   * @param input - Raw command string
   * @returns true if chain operators are present
   */
  static hasChainOperators(input: string): boolean {
    const operators = findChainOperators(input);
    return operators.length > 0;
  }
}

// =============================================================================
// T053: Chained Command Executor
// =============================================================================

/**
 * Executor function type for individual commands
 */
export type CommandExecutorFn = (command: string, signal?: AbortSignal) => Promise<CommandResult>;

/**
 * Chained Command Executor
 *
 * Executes a chain of commands according to shell semantics:
 * - && : Continue only if previous succeeded (no error)
 * - || : Continue only if previous failed (has error)
 * - ;  : Always continue regardless of result
 *
 * @example
 * ```typescript
 * const executor = new ChainedCommandExecutor(async (cmd) => {
 *   return { type: 'success', message: `Executed: ${cmd}` };
 * });
 *
 * const result = await executor.execute('/build && /test || /rollback');
 * ```
 */
export class ChainedCommandExecutor {
  private readonly executeFn: CommandExecutorFn;

  /**
   * Create a ChainedCommandExecutor
   *
   * @param executeFn - Function to execute individual commands
   */
  constructor(executeFn: CommandExecutorFn) {
    this.executeFn = executeFn;
  }

  /**
   * Execute a chained command string
   *
   * @param input - Command string (may contain chain operators)
   * @param signal - Optional abort signal for cancellation
   * @returns ChainExecutionResult with execution details
   */
  async execute(input: string, signal?: AbortSignal): Promise<ChainExecutionResult> {
    const parsed = ChainParser.parse(input);

    if (!parsed.isChained || parsed.segments.length === 0) {
      // Single command or empty - execute directly
      const command = parsed.segments[0]?.command ?? input;
      const result = await this.executeFn(command, signal);

      return {
        result,
        executedCount: 1,
        totalCount: 1,
        completed: true,
        lastExecutedIndex: 0,
      };
    }

    let lastResult: CommandResult = {
      kind: "success",
      message: "",
    };
    let executedCount = 0;
    let lastExecutedIndex = 0;

    for (let i = 0; i < parsed.segments.length; i++) {
      // Check for abort
      if (signal?.aborted) {
        return {
          result: {
            kind: "error",
            code: "COMMAND_ABORTED",
            message: "Chain execution was cancelled",
          },
          executedCount,
          totalCount: parsed.segments.length,
          completed: false,
          lastExecutedIndex,
        };
      }

      const segment = parsed.segments[i];
      if (!segment) continue;

      // Check if we should execute based on previous operator
      if (i > 0) {
        const prevSegment = parsed.segments[i - 1];
        const prevOperator = prevSegment?.operator;
        const prevSucceeded = lastResult.kind === "success";

        // Apply chain logic
        if (prevOperator === "&&" && !prevSucceeded) {
          // AND: Previous failed, stop chain
          break;
        }

        if (prevOperator === "||" && prevSucceeded) {
          // OR: Previous succeeded, skip this command
          continue;
        }

        // ; (SEQUENCE): Always continue
      }

      // Execute this command
      lastResult = await this.executeFn(segment.command, signal);
      executedCount++;
      lastExecutedIndex = i;
    }

    return {
      result: lastResult,
      executedCount,
      totalCount: parsed.segments.length,
      completed: lastExecutedIndex === parsed.segments.length - 1,
      lastExecutedIndex,
    };
  }

  /**
   * Check if a command would succeed without executing
   * Used for validation purposes
   *
   * @param previousSuccess - Whether previous command succeeded
   * @param operator - Operator connecting to this command
   * @returns true if command should execute
   */
  static shouldExecute(previousSuccess: boolean, operator: ChainOperator | undefined): boolean {
    if (operator === undefined) {
      // First command or single command
      return true;
    }

    switch (operator) {
      case "&&":
        // AND: Execute only if previous succeeded
        return previousSuccess;
      case "||":
        // OR: Execute only if previous failed
        return !previousSuccess;
      case ";":
        // SEQUENCE: Always execute
        return true;
      default:
        return true;
    }
  }
}
