// ============================================
// Context Agents Errors
// ============================================
// Error classes for AGENTS.md protocol implementation.
// Uses ErrorCode enum from @vellum/core/errors for consistency.

import { ErrorCode, VellumError, type VellumErrorOptions } from "../../errors/types.js";

/**
 * Error codes specific to AGENTS.md operations.
 * These map to the CONFIG_* range in ErrorCode enum.
 */
export const AgentsErrorCode = {
  /** Generic AGENTS.md error */
  AGENTS_ERROR: ErrorCode.CONFIG_INVALID,
  /** Failed to parse AGENTS.md content */
  PARSE_ERROR: ErrorCode.CONFIG_PARSE_ERROR,
  /** Security violation during import */
  IMPORT_SECURITY: ErrorCode.PATH_SECURITY,
} as const;

/**
 * Base error class for AGENTS.md protocol errors.
 * Extends VellumError for consistent error handling.
 */
export class AgentsError extends VellumError {
  constructor(
    message: string,
    public readonly agentsCode: string,
    options?: VellumErrorOptions & { context?: Record<string, unknown> }
  ) {
    super(message, AgentsErrorCode.AGENTS_ERROR, {
      ...options,
      context: {
        ...options?.context,
        agentsCode,
      },
    });
    this.name = "AgentsError";
  }
}

/**
 * Error thrown when parsing AGENTS.md content fails.
 * Includes file location information for debugging.
 */
export class AgentsParseError extends VellumError {
  /** File path where the parse error occurred */
  public readonly file: string;
  /** Line number in the file (1-indexed) */
  public readonly line?: number;

  constructor(message: string, file: string, line?: number, options?: VellumErrorOptions) {
    super(message, AgentsErrorCode.PARSE_ERROR, {
      ...options,
      context: {
        ...options?.context,
        file,
        line,
      },
    });
    this.name = "AgentsParseError";
    this.file = file;
    this.line = line;
  }

  /**
   * Returns a formatted error message with file location.
   */
  override getFriendlyMessage(): string {
    if (this.line !== undefined) {
      return `Parse error in ${this.file}:${this.line}: ${this.message}`;
    }
    return `Parse error in ${this.file}: ${this.message}`;
  }
}

/**
 * Error thrown when an import operation violates security constraints.
 * For example: path traversal attempts, blocked URL schemes, etc.
 */
export class ImportSecurityError extends VellumError {
  /** The path or URL that was attempted */
  public readonly attemptedPath: string;

  constructor(message: string, attemptedPath: string, options?: VellumErrorOptions) {
    super(message, AgentsErrorCode.IMPORT_SECURITY, {
      ...options,
      context: {
        ...options?.context,
        attemptedPath,
      },
    });
    this.name = "ImportSecurityError";
    this.attemptedPath = attemptedPath;
  }

  /**
   * Returns a formatted error message with the blocked path.
   */
  override getFriendlyMessage(): string {
    return `Security violation: ${this.message} (attempted: ${this.attemptedPath})`;
  }
}
