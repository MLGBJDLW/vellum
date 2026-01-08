// ============================================
// Vellum Error Types
// ============================================

import {
  ErrorCode,
  type ErrorSeverity as SharedErrorSeverity,
  inferSeverity as sharedInferSeverity,
} from "@vellum/shared";
import { nanoid } from "nanoid";

// Re-export ErrorCode for backward compatibility
export { ErrorCode };

// Re-export shared severity type with different name to avoid conflict
export type { SharedErrorSeverity };

/**
 * Error severity levels that determine handling strategy.
 * Kept as enum for backward compatibility with existing code.
 */
export enum ErrorSeverity {
  /** Can retry automatically */
  RECOVERABLE = "recoverable",
  /** User needs to fix something */
  USER_ACTION = "user_action",
  /** Cannot continue */
  FATAL = "fatal",
}

// Alias for compatibility
export const LegacyErrorSeverity = ErrorSeverity;

/**
 * Infers the appropriate severity level from an error code.
 * Maps from the new string literal type to the legacy enum for backward compatibility.
 *
 * - Rate limit, timeout, network errors → RECOVERABLE
 * - Auth failed, validation, permission errors → USER_ACTION
 * - Out of memory, unknown errors → FATAL
 */
export function inferSeverity(code: ErrorCode): ErrorSeverity {
  // Map new severity levels to legacy enum
  const newSeverity = sharedInferSeverity(code);

  switch (newSeverity) {
    case "low":
    case "medium":
      // Recoverable errors - can retry automatically
      // Check specific codes for more granular mapping
      switch (code) {
        case ErrorCode.GIT_LOCK_TIMEOUT:
        case ErrorCode.GIT_TIMEOUT:
        case ErrorCode.GIT_REMOTE_ERROR:
        case ErrorCode.LLM_RATE_LIMIT:
        case ErrorCode.LLM_TIMEOUT:
        case ErrorCode.LLM_NETWORK_ERROR:
        case ErrorCode.NETWORK_ERROR:
        case ErrorCode.TOOL_TIMEOUT:
        case ErrorCode.SYSTEM_IO_ERROR:
        case ErrorCode.MCP_TIMEOUT:
        case ErrorCode.MCP_CONNECTION:
        case ErrorCode.CIRCUIT_OPEN:
        case ErrorCode.RATE_LIMITED:
        case ErrorCode.SERVICE_UNAVAILABLE:
        case ErrorCode.QUOTA_RETRYABLE:
          return ErrorSeverity.RECOVERABLE;
        default:
          return ErrorSeverity.USER_ACTION;
      }
    case "high":
    case "critical":
      // Check for recoverable high severity errors
      switch (code) {
        case ErrorCode.TIMEOUT:
        case ErrorCode.SYSTEM_IO_ERROR:
          return ErrorSeverity.RECOVERABLE;
        default:
          return ErrorSeverity.FATAL;
      }
    default:
      return ErrorSeverity.FATAL;
  }
}

/**
 * Options for creating a VellumError.
 */
export interface VellumErrorOptions {
  /** The underlying cause of this error */
  cause?: Error;
  /** Additional context about the error */
  context?: Record<string, unknown>;
  /** Whether this error can be retried */
  isRetryable?: boolean;
  /** Suggested delay before retry in milliseconds */
  retryDelay?: number;
  /** Request ID for tracing across services */
  requestId?: string;
}

/**
 * Base error class for all Vellum errors.
 *
 * Provides:
 * - Categorized error codes
 * - Automatic severity inference
 * - Retry configuration
 * - Error cause chaining
 * - Additional context
 * - Error tracing with errorId, timestamp, requestId
 */
export class VellumError extends Error {
  /** Unique identifier for this error instance (nanoid, 21 chars) */
  public readonly errorId: string;
  /** ISO-8601 UTC timestamp when error was created */
  public readonly timestamp: string;
  /** Request ID for distributed tracing */
  public readonly requestId?: string;
  public readonly code: ErrorCode;
  public readonly context?: Record<string, unknown>;
  private readonly _isRetryable?: boolean;
  private readonly _retryDelay?: number;

  constructor(message: string, code: ErrorCode, options?: VellumErrorOptions) {
    super(message, { cause: options?.cause });
    this.name = "VellumError";
    this.code = code;
    this.errorId = nanoid(21);
    this.timestamp = new Date().toISOString();
    this.requestId = options?.requestId;
    this.context = options?.context;
    this._isRetryable = options?.isRetryable;
    this._retryDelay = options?.retryDelay;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, VellumError);
    }
  }

  /**
   * The severity level of this error, inferred from the error code.
   */
  get severity(): ErrorSeverity {
    return inferSeverity(this.code);
  }

  /**
   * Whether this error can be retried.
   * If not explicitly set, defaults to true for RECOVERABLE severity.
   */
  get isRetryable(): boolean {
    if (this._isRetryable !== undefined) {
      return this._isRetryable;
    }
    return this.severity === ErrorSeverity.RECOVERABLE;
  }

  /**
   * The suggested delay before retry in milliseconds.
   * Returns undefined if not retryable or not set.
   */
  get retryDelay(): number | undefined {
    if (!this.isRetryable) {
      return undefined;
    }
    return this._retryDelay;
  }

  /**
   * Creates a new VellumError with additional context merged in.
   * Preserves the original errorId and timestamp for tracing.
   *
   * @param additionalContext - Context to merge with existing context
   * @returns New VellumError instance with merged context
   */
  withContext(additionalContext: Record<string, unknown>): VellumError {
    const newError = new VellumError(this.message, this.code, {
      cause: this.cause instanceof Error ? this.cause : undefined,
      context: { ...this.context, ...additionalContext },
      isRetryable: this._isRetryable,
      retryDelay: this._retryDelay,
      requestId: this.requestId,
    });
    // Preserve original errorId and timestamp for tracing (AC-004-5)
    (newError as { errorId: string }).errorId = this.errorId;
    (newError as { timestamp: string }).timestamp = this.timestamp;
    return newError;
  }

  /**
   * Returns a JSON-serializable representation of this error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      errorId: this.errorId,
      timestamp: this.timestamp,
      requestId: this.requestId,
      severity: this.severity,
      isRetryable: this.isRetryable,
      retryDelay: this.retryDelay,
      context: this.context,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }

  /**
   * Cloudflare block detection patterns.
   * @internal
   */
  private static readonly CLOUDFLARE_PATTERNS = [
    "cloudflare",
    "cf-ray",
    "ray id:",
    "attention required",
    "please wait while",
    "checking your browser",
  ];

  /**
   * Maximum message length before truncation.
   * @internal
   */
  private static readonly MAX_MESSAGE_LENGTH = 200;

  /**
   * Returns a user-friendly version of this error message.
   *
   * Features:
   * - Detects Cloudflare security blocks and returns a friendly message
   * - Truncates very long messages (> 200 chars) with ellipsis
   * - Preserves short, already-friendly messages
   *
   * @returns User-friendly error message
   *
   * @example
   * ```typescript
   * const error = new VellumError('Cloudflare Ray ID: abc123...', ErrorCode.NETWORK_ERROR);
   * error.getFriendlyMessage();
   * // "Request blocked by security service. Please try again later or check your network."
   * ```
   */
  getFriendlyMessage(): string {
    const lowerMessage = this.message.toLowerCase();

    // Detect Cloudflare block patterns
    for (const pattern of VellumError.CLOUDFLARE_PATTERNS) {
      if (lowerMessage.includes(pattern)) {
        return "Request blocked by security service. Please try again later or check your network.";
      }
    }

    // Truncate very long messages
    if (this.message.length > VellumError.MAX_MESSAGE_LENGTH) {
      return `${this.message.substring(0, VellumError.MAX_MESSAGE_LENGTH - 3)}...`;
    }

    return this.message;
  }
}

/**
 * Type guard to check if an error is a VellumError with FATAL severity.
 */
export function isFatalError(error: unknown): error is VellumError {
  return error instanceof VellumError && error.severity === ErrorSeverity.FATAL;
}

/**
 * Checks if an error is retryable.
 * Returns true if error is a VellumError with isRetryable=true.
 */
export function isRetryableError(error: unknown): boolean {
  return error instanceof VellumError && error.isRetryable;
}
