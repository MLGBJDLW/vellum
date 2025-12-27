/**
 * Provider Error Classification Utilities
 *
 * Maps HTTP status codes and error types to standardized error codes
 * and provides retry logic helpers.
 *
 * @module @vellum/provider/errors
 */

import { ErrorCode } from "@vellum/shared";

// =============================================================================
// T006: Provider Error Types
// =============================================================================

/**
 * Categories of provider errors for classification
 */
export type ProviderErrorCategory =
  | "credential_invalid"
  | "rate_limited"
  | "timeout"
  | "network_error"
  | "api_error"
  | "context_overflow"
  | "content_filter"
  | "unknown";

/**
 * Result of error classification
 */
export interface ErrorClassification {
  /** The error code from ErrorCode enum */
  code: ErrorCode;
  /** Human-readable category name */
  category: ProviderErrorCategory;
  /** Whether this error type is retryable */
  retryable: boolean;
  /** Suggested retry delay in milliseconds (if retryable) */
  retryDelayMs?: number;
}

// =============================================================================
// T032: Error Context
// =============================================================================

/**
 * Context information attached to provider errors
 */
export interface ProviderErrorContext {
  /** The provider that generated the error */
  provider?: string;
  /** The model that was being used */
  model?: string;
  /** Request ID for tracing (from provider response headers) */
  requestId?: string;
  /** Timestamp when the error occurred */
  timestamp?: Date;
  /** Additional context-specific data */
  metadata?: Record<string, unknown>;
}

/**
 * Extended error class for provider-specific errors
 */
export class ProviderError extends Error {
  /** Error code for programmatic handling */
  readonly code: ErrorCode;
  /** Error category for classification */
  readonly category: ProviderErrorCategory;
  /** Whether this error is retryable */
  readonly retryable: boolean;
  /** HTTP status code (if applicable) */
  readonly statusCode?: number;
  /** Original error that caused this error */
  readonly cause?: Error;
  /** Suggested retry delay in milliseconds */
  readonly retryDelayMs?: number;
  /** Context information (provider, model, requestId) */
  readonly context: ProviderErrorContext;

  constructor(
    message: string,
    options: {
      code: ErrorCode;
      category: ProviderErrorCategory;
      retryable: boolean;
      statusCode?: number;
      cause?: Error;
      retryDelayMs?: number;
      context?: ProviderErrorContext;
    }
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = options.code;
    this.category = options.category;
    this.retryable = options.retryable;
    this.statusCode = options.statusCode;
    this.cause = options.cause;
    this.retryDelayMs = options.retryDelayMs;
    this.context = options.context ?? { timestamp: new Date() };

    // Ensure timestamp is set
    if (!this.context.timestamp) {
      this.context.timestamp = new Date();
    }

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProviderError);
    }
  }

  /**
   * Create a new ProviderError with additional context
   */
  withContext(context: Partial<ProviderErrorContext>): ProviderError {
    return new ProviderError(this.message, {
      code: this.code,
      category: this.category,
      retryable: this.retryable,
      statusCode: this.statusCode,
      cause: this.cause,
      retryDelayMs: this.retryDelayMs,
      context: { ...this.context, ...context },
    });
  }

  /**
   * Create a formatted error message including all context
   */
  toDetailedString(): string {
    const parts = [
      `[${this.name}] ${this.message}`,
      `  Code: ${this.code} (${ErrorCode[this.code]})`,
      `  Category: ${this.category}`,
      `  Retryable: ${this.retryable}`,
    ];

    if (this.statusCode !== undefined) {
      parts.push(`  HTTP Status: ${this.statusCode}`);
    }

    if (this.retryDelayMs !== undefined) {
      parts.push(`  Suggested Retry Delay: ${this.retryDelayMs}ms`);
    }

    // Include context information
    if (this.context.provider) {
      parts.push(`  Provider: ${this.context.provider}`);
    }
    if (this.context.model) {
      parts.push(`  Model: ${this.context.model}`);
    }
    if (this.context.requestId) {
      parts.push(`  Request ID: ${this.context.requestId}`);
    }
    if (this.context.timestamp) {
      parts.push(`  Timestamp: ${this.context.timestamp.toISOString()}`);
    }

    if (this.cause) {
      parts.push(`  Caused by: ${this.cause.message}`);
    }

    return parts.join("\n");
  }

  /**
   * Convert to a JSON-serializable object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      codeName: ErrorCode[this.code],
      category: this.category,
      retryable: this.retryable,
      statusCode: this.statusCode,
      retryDelayMs: this.retryDelayMs,
      context: {
        ...this.context,
        timestamp: this.context.timestamp?.toISOString(),
      },
      cause: this.cause?.message,
    };
  }
}

// =============================================================================
// Error Classification Functions
// =============================================================================

/**
 * HTTP status code to error classification mapping
 */
const HTTP_STATUS_CLASSIFICATION: Record<number, ErrorClassification> = {
  // Authentication errors
  401: {
    code: ErrorCode.CREDENTIAL_VALIDATION_FAILED,
    category: "credential_invalid",
    retryable: false,
  },
  403: {
    code: ErrorCode.CREDENTIAL_VALIDATION_FAILED,
    category: "credential_invalid",
    retryable: false,
  },

  // Rate limiting
  429: {
    code: ErrorCode.RATE_LIMITED,
    category: "rate_limited",
    retryable: true,
    retryDelayMs: 1000, // Default 1 second, should check Retry-After header
  },

  // Client errors (generally not retryable)
  400: {
    code: ErrorCode.INVALID_ARGUMENT,
    category: "api_error",
    retryable: false,
  },
  404: {
    code: ErrorCode.PROVIDER_NOT_FOUND,
    category: "api_error",
    retryable: false,
  },
  422: {
    code: ErrorCode.INVALID_ARGUMENT,
    category: "api_error",
    retryable: false,
  },

  // Server errors (generally retryable)
  500: {
    code: ErrorCode.API_ERROR,
    category: "api_error",
    retryable: true,
    retryDelayMs: 1000,
  },
  502: {
    code: ErrorCode.SERVICE_UNAVAILABLE,
    category: "api_error",
    retryable: true,
    retryDelayMs: 2000,
  },
  503: {
    code: ErrorCode.SERVICE_UNAVAILABLE,
    category: "api_error",
    retryable: true,
    retryDelayMs: 5000,
  },
  504: {
    code: ErrorCode.TIMEOUT,
    category: "timeout",
    retryable: true,
    retryDelayMs: 2000,
  },
};

/**
 * Classifies an HTTP status code into a standardized error classification
 *
 * @param statusCode - HTTP status code from the provider response
 * @returns ErrorClassification with code, category, and retry info
 *
 * @example
 * ```typescript
 * const classification = classifyHttpStatus(429);
 * // { code: ErrorCode.RATE_LIMITED, category: 'rate_limited', retryable: true, retryDelayMs: 1000 }
 *
 * if (classification.retryable) {
 *   await sleep(classification.retryDelayMs);
 *   // retry request
 * }
 * ```
 */
export function classifyHttpStatus(statusCode: number): ErrorClassification {
  // Check for exact match first
  const exactMatch = HTTP_STATUS_CLASSIFICATION[statusCode];
  if (exactMatch) {
    return exactMatch;
  }

  // Handle ranges
  if (statusCode >= 500) {
    return {
      code: ErrorCode.API_ERROR,
      category: "api_error",
      retryable: true,
      retryDelayMs: 1000,
    };
  }

  if (statusCode >= 400) {
    return {
      code: ErrorCode.API_ERROR,
      category: "api_error",
      retryable: false,
    };
  }

  // Unknown status codes
  return {
    code: ErrorCode.UNKNOWN,
    category: "unknown",
    retryable: false,
  };
}

/**
 * Error type identifiers for classification
 */
type ErrorTypeIdentifier = "timeout" | "network" | "abort" | "context_overflow" | "content_filter";

/**
 * Classifies a provider error based on error type or message patterns
 *
 * @param error - The error to classify (can be Error, string, or unknown)
 * @returns ErrorClassification with code, category, and retry info
 *
 * @example
 * ```typescript
 * try {
 *   await provider.complete(params);
 * } catch (error) {
 *   const classification = classifyProviderError(error);
 *   if (classification.retryable) {
 *     // Implement retry logic
 *   }
 * }
 * ```
 */
export function classifyProviderError(error: unknown): ErrorClassification {
  // Handle ProviderError instances (already classified)
  if (error instanceof ProviderError) {
    return {
      code: error.code,
      category: error.category,
      retryable: error.retryable,
      retryDelayMs: error.retryDelayMs,
    };
  }

  // Handle errors with status codes (HTTP errors)
  if (hasStatusCode(error)) {
    const statusCode = error.status ?? error.statusCode;
    if (statusCode !== undefined) {
      return classifyHttpStatus(statusCode);
    }
  }

  // Get error message for pattern matching
  const message = getErrorMessage(error).toLowerCase();
  const errorName = error instanceof Error ? error.name.toLowerCase() : "";

  // Classify by error type/message patterns
  const errorType = identifyErrorType(message, errorName);
  return classifyByErrorType(errorType);
}

/**
 * Determines if an error is retryable
 *
 * @param error - The error to check
 * @returns boolean indicating if the error can be retried
 *
 * @example
 * ```typescript
 * const maxRetries = 3;
 * let attempt = 0;
 *
 * while (attempt < maxRetries) {
 *   try {
 *     return await provider.complete(params);
 *   } catch (error) {
 *     if (!isRetryable(error) || attempt >= maxRetries - 1) {
 *       throw error;
 *     }
 *     attempt++;
 *     await sleep(getRetryDelay(error, attempt));
 *   }
 * }
 * ```
 */
export function isRetryable(error: unknown): boolean {
  return classifyProviderError(error).retryable;
}

/**
 * Gets the suggested retry delay for an error
 *
 * @param error - The error to get delay for
 * @param attempt - Current retry attempt (for exponential backoff)
 * @returns Retry delay in milliseconds
 *
 * @example
 * ```typescript
 * const delay = getRetryDelay(error, attemptNumber);
 * await new Promise(resolve => setTimeout(resolve, delay));
 * ```
 */
export function getRetryDelay(error: unknown, attempt: number = 1): number {
  const classification = classifyProviderError(error);
  const baseDelay = classification.retryDelayMs ?? 1000;

  // Check for Retry-After header value
  const retryAfter = extractRetryAfter(error);
  if (retryAfter !== undefined) {
    return retryAfter;
  }

  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * 2 ** (attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return Math.min(exponentialDelay + jitter, 60000); // Cap at 60 seconds
}

/**
 * Creates a ProviderError from any error
 *
 * @param error - The original error
 * @param contextOrOptions - Optional context message or full context options
 * @returns ProviderError instance
 *
 * @example
 * ```typescript
 * // With simple context message
 * try {
 *   await anthropicClient.messages.create(params);
 * } catch (error) {
 *   throw createProviderError(error, 'Anthropic completion failed');
 * }
 *
 * // With full context
 * try {
 *   await anthropicClient.messages.create(params);
 * } catch (error) {
 *   throw createProviderError(error, {
 *     provider: 'anthropic',
 *     model: 'claude-sonnet-4-20250514',
 *     requestId: response.headers['x-request-id'],
 *   });
 * }
 * ```
 */
export function createProviderError(
  error: unknown,
  contextOrOptions?: string | ProviderErrorContext
): ProviderError {
  const classification = classifyProviderError(error);
  const originalMessage = getErrorMessage(error);

  // Handle context as string or object
  let message: string;
  let errorContext: ProviderErrorContext;

  if (typeof contextOrOptions === "string") {
    message = `${contextOrOptions}: ${originalMessage}`;
    errorContext = { timestamp: new Date() };
  } else if (contextOrOptions) {
    message = originalMessage;
    errorContext = { ...contextOrOptions, timestamp: new Date() };
  } else {
    message = originalMessage;
    errorContext = { timestamp: new Date() };
  }

  // Try to extract requestId from error headers
  const requestId = extractRequestId(error);
  if (requestId && !errorContext.requestId) {
    errorContext.requestId = requestId;
  }

  const statusCode = hasStatusCode(error) ? (error.status ?? error.statusCode) : undefined;

  return new ProviderError(message, {
    code: classification.code,
    category: classification.category,
    retryable: classification.retryable,
    statusCode,
    cause: error instanceof Error ? error : undefined,
    retryDelayMs: classification.retryDelayMs,
    context: errorContext,
  });
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Type guard for errors with HTTP status codes
 */
function hasStatusCode(error: unknown): error is { status?: number; statusCode?: number } {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const e = error as Record<string, unknown>;
  return typeof e.status === "number" || typeof e.statusCode === "number";
}

/**
 * Extract error message from any error type
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    if (typeof e.message === "string") {
      return e.message;
    }
    if (typeof e.error === "string") {
      return e.error;
    }
  }
  return "Unknown error";
}

/**
 * Identify error type from message and name patterns
 */
function identifyErrorType(message: string, errorName: string): ErrorTypeIdentifier | null {
  // Timeout patterns
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("etimedout") ||
    errorName.includes("timeout")
  ) {
    return "timeout";
  }

  // Network patterns
  if (
    message.includes("network") ||
    message.includes("econnrefused") ||
    message.includes("econnreset") ||
    message.includes("enotfound") ||
    message.includes("socket") ||
    message.includes("connection") ||
    errorName.includes("network")
  ) {
    return "network";
  }

  // Abort patterns
  if (
    message.includes("abort") ||
    message.includes("cancelled") ||
    message.includes("canceled") ||
    errorName.includes("abort")
  ) {
    return "abort";
  }

  // Context overflow patterns
  if (
    message.includes("context") ||
    message.includes("token limit") ||
    message.includes("max_tokens") ||
    message.includes("context_length")
  ) {
    return "context_overflow";
  }

  // Content filter patterns
  if (
    message.includes("content filter") ||
    message.includes("content_filter") ||
    message.includes("flagged") ||
    message.includes("safety")
  ) {
    return "content_filter";
  }

  return null;
}

/**
 * Get classification for error type
 */
function classifyByErrorType(errorType: ErrorTypeIdentifier | null): ErrorClassification {
  switch (errorType) {
    case "timeout":
      return {
        code: ErrorCode.TIMEOUT,
        category: "timeout",
        retryable: true,
        retryDelayMs: 2000,
      };

    case "network":
      return {
        code: ErrorCode.NETWORK_ERROR,
        category: "network_error",
        retryable: true,
        retryDelayMs: 1000,
      };

    case "abort":
      return {
        code: ErrorCode.UNKNOWN,
        category: "unknown",
        retryable: false,
      };

    case "context_overflow":
      return {
        code: ErrorCode.CONTEXT_OVERFLOW,
        category: "context_overflow",
        retryable: false,
      };

    case "content_filter":
      return {
        code: ErrorCode.API_ERROR,
        category: "content_filter",
        retryable: false,
      };

    default:
      return {
        code: ErrorCode.UNKNOWN,
        category: "unknown",
        retryable: false,
      };
  }
}

/**
 * Extract Retry-After header value if present
 */
function extractRetryAfter(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const e = error as Record<string, unknown>;

  // Check headers object
  if (typeof e.headers === "object" && e.headers !== null) {
    const headers = e.headers as Record<string, unknown>;
    const retryAfter = headers["retry-after"] ?? headers["Retry-After"];
    if (typeof retryAfter === "string") {
      const seconds = parseInt(retryAfter, 10);
      if (!Number.isNaN(seconds)) {
        return seconds * 1000; // Convert to milliseconds
      }
    }
    if (typeof retryAfter === "number") {
      return retryAfter * 1000;
    }
  }

  // Check direct retryAfter property
  if (typeof e.retryAfter === "number") {
    return e.retryAfter * 1000;
  }

  return undefined;
}

/**
 * Extract request ID from error headers if present
 */
function extractRequestId(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const e = error as Record<string, unknown>;

  // Check headers object for common request ID header names
  if (typeof e.headers === "object" && e.headers !== null) {
    const headers = e.headers as Record<string, unknown>;
    const requestIdHeaders = [
      "x-request-id",
      "X-Request-Id",
      "x-request-ID",
      "request-id",
      "Request-Id",
      "x-anthropic-request-id",
      "x-goog-request-id",
    ];

    for (const header of requestIdHeaders) {
      const value = headers[header];
      if (typeof value === "string") {
        return value;
      }
    }
  }

  // Check direct requestId property
  if (typeof e.requestId === "string") {
    return e.requestId;
  }

  return undefined;
}
