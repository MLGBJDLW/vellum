// ============================================
// Vellum Error Types
// ============================================

/**
 * Categorized error codes for the Vellum system.
 *
 * Categories:
 * - 1xxx: Configuration errors
 * - 2xxx: LLM/Provider errors
 * - 3xxx: Tool errors
 * - 4xxx: Session errors
 * - 5xxx: System errors
 */
export enum ErrorCode {
  // 1xxx - Configuration errors
  CONFIG_INVALID = 1001,
  CONFIG_NOT_FOUND = 1002,
  CONFIG_PARSE_ERROR = 1003,

  // 2xxx - LLM/Provider errors
  LLM_RATE_LIMIT = 2001,
  LLM_CONTEXT_LENGTH = 2002,
  LLM_AUTH_FAILED = 2003,
  LLM_NETWORK_ERROR = 2004,
  LLM_TIMEOUT = 2005,
  LLM_INVALID_RESPONSE = 2006,

  // 3xxx - Tool errors
  TOOL_NOT_FOUND = 3001,
  TOOL_VALIDATION_FAILED = 3002,
  TOOL_EXECUTION_FAILED = 3003,
  TOOL_PERMISSION_DENIED = 3004,
  TOOL_TIMEOUT = 3005,
  TOOL_ABORTED = 3006,
  PATH_SECURITY = 3007,
  MCP_CONNECTION = 3008,
  MCP_PROTOCOL = 3009,
  MCP_TIMEOUT = 3010,
  SMART_EDIT_FAILED = 3011,

  // 4xxx - Session errors
  SESSION_NOT_FOUND = 4001,
  SESSION_EXPIRED = 4002,
  SESSION_CONFLICT = 4003,

  // 5xxx - System errors
  SYSTEM_IO_ERROR = 5001,
  SYSTEM_OUT_OF_MEMORY = 5002,
  SYSTEM_UNKNOWN = 5999,
}

/**
 * Error severity levels that determine handling strategy.
 */
export enum ErrorSeverity {
  /** Can retry automatically */
  RECOVERABLE = "recoverable",
  /** User needs to fix something */
  USER_ACTION = "user_action",
  /** Cannot continue */
  FATAL = "fatal",
}

/**
 * Infers the appropriate severity level from an error code.
 *
 * - Rate limit, timeout, network errors → RECOVERABLE
 * - Auth failed, validation, permission errors → USER_ACTION
 * - Out of memory, unknown errors → FATAL
 */
export function inferSeverity(code: ErrorCode): ErrorSeverity {
  switch (code) {
    // Recoverable errors - can retry automatically
    case ErrorCode.LLM_RATE_LIMIT:
    case ErrorCode.LLM_TIMEOUT:
    case ErrorCode.LLM_NETWORK_ERROR:
    case ErrorCode.TOOL_TIMEOUT:
    case ErrorCode.SYSTEM_IO_ERROR:
    case ErrorCode.MCP_TIMEOUT:
    case ErrorCode.MCP_CONNECTION:
      return ErrorSeverity.RECOVERABLE;

    // User action required - user needs to fix something
    case ErrorCode.CONFIG_INVALID:
    case ErrorCode.CONFIG_NOT_FOUND:
    case ErrorCode.CONFIG_PARSE_ERROR:
    case ErrorCode.LLM_AUTH_FAILED:
    case ErrorCode.LLM_CONTEXT_LENGTH:
    case ErrorCode.LLM_INVALID_RESPONSE:
    case ErrorCode.TOOL_NOT_FOUND:
    case ErrorCode.TOOL_VALIDATION_FAILED:
    case ErrorCode.TOOL_PERMISSION_DENIED:
    case ErrorCode.TOOL_EXECUTION_FAILED:
    case ErrorCode.TOOL_ABORTED:
    case ErrorCode.PATH_SECURITY:
    case ErrorCode.MCP_PROTOCOL:
    case ErrorCode.SMART_EDIT_FAILED:
    case ErrorCode.SESSION_NOT_FOUND:
    case ErrorCode.SESSION_EXPIRED:
    case ErrorCode.SESSION_CONFLICT:
      return ErrorSeverity.USER_ACTION;
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
 */
export class VellumError extends Error {
  public readonly code: ErrorCode;
  public readonly context?: Record<string, unknown>;
  private readonly _isRetryable?: boolean;
  private readonly _retryDelay?: number;

  constructor(message: string, code: ErrorCode, options?: VellumErrorOptions) {
    super(message, { cause: options?.cause });
    this.name = "VellumError";
    this.code = code;
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
   * Returns a JSON-serializable representation of this error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      isRetryable: this.isRetryable,
      retryDelay: this.retryDelay,
      context: this.context,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
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
