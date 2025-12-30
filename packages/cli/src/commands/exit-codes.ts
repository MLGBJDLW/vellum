/**
 * Exit Code Implementation (T-046)
 *
 * Defines standardized process exit codes and maps CommandResult types to exit codes.
 * Following Unix conventions:
 * - 0: Success
 * - 1: General error
 * - 2: Usage/argument error
 * - 130: Interrupted (128 + SIGINT)
 *
 * @module cli/commands/exit-codes
 */

import type { CommandError, CommandResult } from "./types.js";

// =============================================================================
// Exit Code Constants
// =============================================================================

/**
 * Standardized process exit codes
 *
 * Following Unix conventions for exit codes:
 * - 0: Success
 * - 1: General error
 * - 2: Usage/argument error (invalid command syntax)
 * - 130: Interrupted by user (SIGINT - Ctrl+C)
 */
export const EXIT_CODES = {
  /** Successful execution */
  SUCCESS: 0,
  /** General error */
  ERROR: 1,
  /** Usage/argument error */
  USAGE_ERROR: 2,
  /** Interrupted by signal (128 + SIGINT=2) */
  INTERRUPTED: 130,
} as const;

/**
 * Exit code type derived from EXIT_CODES values
 */
export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

// =============================================================================
// Error Code to Exit Code Mapping
// =============================================================================

/**
 * Map CommandErrorCode to exit code
 *
 * Groups error codes by their exit code category:
 * - Usage errors (2): argument validation failures
 * - General errors (1): everything else
 */
const ERROR_CODE_EXIT_MAP: Record<string, ExitCode> = {
  // Usage errors → exit code 2
  INVALID_ARGUMENT: EXIT_CODES.USAGE_ERROR,
  MISSING_ARGUMENT: EXIT_CODES.USAGE_ERROR,
  ARGUMENT_TYPE_ERROR: EXIT_CODES.USAGE_ERROR,
  COMMAND_NOT_FOUND: EXIT_CODES.USAGE_ERROR,

  // Interrupted → exit code 130
  COMMAND_ABORTED: EXIT_CODES.INTERRUPTED,

  // All others → exit code 1
  // (handled by default case in mapper)
};

// =============================================================================
// Exit Code Mapper Class
// =============================================================================

/**
 * Maps CommandResult types to process exit codes
 *
 * Provides consistent exit code mapping for CLI applications.
 *
 * @example
 * ```typescript
 * const result = await executor.execute('/some-command');
 * const exitCode = ExitCodeMapper.fromResult(result);
 * process.exit(exitCode);
 * ```
 */
// biome-ignore lint/complexity/noStaticOnlyClass: ExitCodeMapper provides a logical grouping for exit code mapping
export class ExitCodeMapper {
  /**
   * Map a CommandResult to an exit code
   *
   * @param result - Command execution result
   * @returns Appropriate exit code
   */
  static fromResult(result: CommandResult): ExitCode {
    switch (result.kind) {
      case "success":
        return EXIT_CODES.SUCCESS;

      case "error":
        return ExitCodeMapper.fromError(result);

      case "interactive":
        // Interactive prompts are not terminal states
        // Return success since the command didn't fail
        return EXIT_CODES.SUCCESS;

      case "pending":
        // Pending operations are not terminal states
        // Return success since the command didn't fail
        return EXIT_CODES.SUCCESS;

      default:
        // Exhaustiveness check - should never reach here
        return EXIT_CODES.ERROR;
    }
  }

  /**
   * Map a CommandError to an exit code
   *
   * @param error - Command error result
   * @returns Appropriate exit code based on error code
   */
  static fromError(error: CommandError): ExitCode {
    const mappedCode = ERROR_CODE_EXIT_MAP[error.code];
    return mappedCode ?? EXIT_CODES.ERROR;
  }

  /**
   * Map an exception to an exit code
   *
   * @param error - Thrown error
   * @returns Appropriate exit code
   */
  static fromException(error: unknown): ExitCode {
    // AbortError indicates user interruption
    if (error instanceof Error && error.name === "AbortError") {
      return EXIT_CODES.INTERRUPTED;
    }

    // DOMException with AbortError code
    if (
      error instanceof DOMException &&
      (error.name === "AbortError" || error.code === DOMException.ABORT_ERR)
    ) {
      return EXIT_CODES.INTERRUPTED;
    }

    return EXIT_CODES.ERROR;
  }

  /**
   * Check if an exit code indicates success
   *
   * @param code - Exit code to check
   * @returns true if code indicates success
   */
  static isSuccess(code: ExitCode): boolean {
    return code === EXIT_CODES.SUCCESS;
  }

  /**
   * Check if an exit code indicates a usage error
   *
   * @param code - Exit code to check
   * @returns true if code indicates usage error
   */
  static isUsageError(code: ExitCode): boolean {
    return code === EXIT_CODES.USAGE_ERROR;
  }

  /**
   * Check if an exit code indicates interruption
   *
   * @param code - Exit code to check
   * @returns true if code indicates interruption
   */
  static isInterrupted(code: ExitCode): boolean {
    return code === EXIT_CODES.INTERRUPTED;
  }

  /**
   * Get a human-readable description of an exit code
   *
   * @param code - Exit code to describe
   * @returns Human-readable description
   */
  static describe(code: ExitCode): string {
    switch (code) {
      case EXIT_CODES.SUCCESS:
        return "Success";
      case EXIT_CODES.ERROR:
        return "Error";
      case EXIT_CODES.USAGE_ERROR:
        return "Usage error";
      case EXIT_CODES.INTERRUPTED:
        return "Interrupted";
      default:
        return `Unknown (${code})`;
    }
  }
}
