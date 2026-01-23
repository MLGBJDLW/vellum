/**
 * Context Compaction Error Types
 *
 * Provides specialized error handling for the context compaction system.
 * Implements REQ-002 error handling requirements.
 *
 * @module @vellum/core/context/errors
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for compaction-related failures.
 *
 * Each code represents a specific failure scenario in the compaction system:
 *
 * - `INVALID_SUMMARY`: LLM-generated summary failed quality checks
 * - `CONTEXT_GROWTH`: Summary is larger than the original content
 * - `ALL_MODELS_FAILED`: All fallback models exhausted without success
 * - `NO_TOKEN_BUDGET`: Insufficient tokens available for compaction
 * - `MIN_MESSAGES_NOT_MET`: Not enough messages to warrant compaction
 */
export const CompactionErrorCode = {
  /** LLM-generated summary failed validation (e.g., missing key info) */
  INVALID_SUMMARY: "INVALID_SUMMARY",
  /** Compacted content is larger than original (compression failed) */
  CONTEXT_GROWTH: "CONTEXT_GROWTH",
  /** All configured summary models have failed */
  ALL_MODELS_FAILED: "ALL_MODELS_FAILED",
  /** Token budget insufficient to perform compaction */
  NO_TOKEN_BUDGET: "NO_TOKEN_BUDGET",
  /** Minimum message count threshold not met */
  MIN_MESSAGES_NOT_MET: "MIN_MESSAGES_NOT_MET",
} as const;

/** Type for compaction error codes */
export type CompactionErrorCode = (typeof CompactionErrorCode)[keyof typeof CompactionErrorCode];

// ============================================================================
// Error Options
// ============================================================================

/**
 * Options for creating a CompactionError.
 */
export interface CompactionErrorOptions {
  /** The underlying cause of this error */
  cause?: Error;
  /** Additional context about the error */
  context?: Record<string, unknown>;
  /** Whether this error can be retried */
  isRetryable?: boolean;
  /** Model that was being used when error occurred */
  model?: string;
  /** Original token count before compaction attempt */
  originalTokens?: number;
  /** Resulting token count (for CONTEXT_GROWTH errors) */
  resultingTokens?: number;
}

// ============================================================================
// CompactionError Class
// ============================================================================

/**
 * Error class for compaction-related failures.
 *
 * Provides typed errors with context for debugging and error handling
 * in the context compaction system.
 *
 * @example
 * ```typescript
 * // Invalid summary from LLM
 * throw CompactionError.invalidSummary(
 *   'Summary missing tool results',
 *   { model: 'gpt-4o', originalTokens: 5000 }
 * );
 *
 * // Context growth (compression backfired)
 * throw CompactionError.contextGrowth(
 *   'Summary larger than original',
 *   { originalTokens: 1000, resultingTokens: 1200 }
 * );
 *
 * // All models exhausted
 * throw CompactionError.allModelsFailed(
 *   'All 3 summary models failed',
 *   { context: { attemptedModels: ['gpt-4o', 'claude-3-haiku', 'gemini-flash'] } }
 * );
 * ```
 */
export class CompactionError extends Error {
  /** The error code identifying the failure type */
  public readonly code: CompactionErrorCode;
  /** The original error that caused this error */
  public readonly cause?: Error;
  /** Additional context about the error */
  public readonly context?: Record<string, unknown>;
  /** Whether this error can be retried */
  public readonly isRetryable: boolean;
  /** Model that was being used when error occurred */
  public readonly model?: string;
  /** Original token count before compaction attempt */
  public readonly originalTokens?: number;
  /** Resulting token count (for CONTEXT_GROWTH errors) */
  public readonly resultingTokens?: number;

  constructor(message: string, code: CompactionErrorCode, options?: CompactionErrorOptions) {
    super(message, { cause: options?.cause });
    this.name = "CompactionError";
    this.code = code;
    this.cause = options?.cause;
    this.context = options?.context;
    this.isRetryable = options?.isRetryable ?? this.inferRetryability(code);
    this.model = options?.model;
    this.originalTokens = options?.originalTokens;
    this.resultingTokens = options?.resultingTokens;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CompactionError);
    }
  }

  /**
   * Infer whether an error is retryable based on its code.
   */
  private inferRetryability(code: CompactionErrorCode): boolean {
    switch (code) {
      case CompactionErrorCode.INVALID_SUMMARY:
        // May succeed with different model or prompt
        return true;
      case CompactionErrorCode.CONTEXT_GROWTH:
        // Retry with different strategy might help
        return true;
      case CompactionErrorCode.ALL_MODELS_FAILED:
        // No more models to try
        return false;
      case CompactionErrorCode.NO_TOKEN_BUDGET:
        // Need external intervention (e.g., truncate more)
        return false;
      case CompactionErrorCode.MIN_MESSAGES_NOT_MET:
        // Structural issue, won't change with retry
        return false;
      default:
        return false;
    }
  }

  // ==========================================================================
  // Static Factory Methods
  // ==========================================================================

  /**
   * Creates an error for invalid LLM-generated summaries.
   *
   * @param message - Description of why the summary is invalid
   * @param options - Additional error context
   */
  static invalidSummary(message: string, options?: CompactionErrorOptions): CompactionError {
    return new CompactionError(message, CompactionErrorCode.INVALID_SUMMARY, options);
  }

  /**
   * Creates an error for context growth (summary larger than original).
   *
   * @param message - Description of the growth issue
   * @param options - Should include originalTokens and resultingTokens
   */
  static contextGrowth(message: string, options?: CompactionErrorOptions): CompactionError {
    return new CompactionError(message, CompactionErrorCode.CONTEXT_GROWTH, options);
  }

  /**
   * Creates an error when all fallback models have been exhausted.
   *
   * @param message - Description including attempted models
   * @param options - Should include context with attemptedModels list
   */
  static allModelsFailed(message: string, options?: CompactionErrorOptions): CompactionError {
    return new CompactionError(message, CompactionErrorCode.ALL_MODELS_FAILED, {
      ...options,
      isRetryable: false,
    });
  }

  /**
   * Creates an error for insufficient token budget.
   *
   * @param message - Description of budget constraint
   * @param options - Should include budget details in context
   */
  static noTokenBudget(message: string, options?: CompactionErrorOptions): CompactionError {
    return new CompactionError(message, CompactionErrorCode.NO_TOKEN_BUDGET, {
      ...options,
      isRetryable: false,
    });
  }

  /**
   * Creates an error when minimum message count isn't met.
   *
   * @param message - Description of the threshold violation
   * @param options - Should include actual vs required counts
   */
  static minMessagesNotMet(message: string, options?: CompactionErrorOptions): CompactionError {
    return new CompactionError(message, CompactionErrorCode.MIN_MESSAGES_NOT_MET, {
      ...options,
      isRetryable: false,
    });
  }

  /**
   * Check if an error is a CompactionError.
   */
  static isCompactionError(error: unknown): error is CompactionError {
    return error instanceof CompactionError;
  }
}
