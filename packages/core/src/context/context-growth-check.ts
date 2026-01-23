/**
 * Context Growth Validator
 *
 * Validates that LLM-generated summaries are actually smaller than the original
 * content, preventing the compaction system from making context larger.
 *
 * Implements REQ-005: Growth validation for compression operations.
 *
 * @module @vellum/core/context/context-growth-check
 */

import { CompactionError } from "./errors.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a growth validation check.
 */
export interface GrowthValidationResult {
  /** Whether the summary is valid (smaller than original) */
  readonly isValid: boolean;
  /** Original token count */
  readonly originalTokens: number;
  /** Summary token count */
  readonly summaryTokens: number;
  /** Compression ratio achieved (summaryTokens / originalTokens) */
  readonly ratio: number;
  /** Tokens saved (negative if growth occurred) */
  readonly tokensSaved: number;
}

/**
 * Options for creating a ContextGrowthValidator.
 */
export interface GrowthValidatorOptions {
  /**
   * Maximum allowed ratio for the summary compared to original.
   * Values >= 1.0 mean no compression occurred.
   *
   * @default 1.0 (summary must be smaller than original)
   */
  maxAllowedRatio?: number;

  /**
   * Whether to throw on validation failure.
   * When false, returns result with isValid: false instead of throwing.
   *
   * @default true
   */
  throwOnFailure?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULTS = {
  maxAllowedRatio: 1.0,
  throwOnFailure: true,
} as const;

// ============================================================================
// ContextGrowthValidator
// ============================================================================

/**
 * Validates that compression operations result in smaller context.
 *
 * Prevents the compaction system from accidentally increasing context size
 * by validating that summaries are always smaller than the original content.
 *
 * @example
 * ```typescript
 * const validator = new ContextGrowthValidator();
 *
 * // This will pass (good compression)
 * const result = validator.validate(1000, 300);
 * console.log(result.ratio); // 0.3
 *
 * // This will throw CONTEXT_GROWTH error
 * validator.validate(1000, 1200); // summary is larger!
 * ```
 */
export class ContextGrowthValidator {
  private readonly maxAllowedRatio: number;
  private readonly throwOnFailure: boolean;

  constructor(options: GrowthValidatorOptions = {}) {
    this.maxAllowedRatio = options.maxAllowedRatio ?? DEFAULTS.maxAllowedRatio;
    this.throwOnFailure = options.throwOnFailure ?? DEFAULTS.throwOnFailure;
  }

  /**
   * Get the configured maximum allowed ratio.
   */
  getMaxAllowedRatio(): number {
    return this.maxAllowedRatio;
  }

  /**
   * Validate that a summary is smaller than the original content.
   *
   * @param originalTokens - Token count of original content
   * @param summaryTokens - Token count of generated summary
   * @returns Validation result with metrics
   * @throws CompactionError with code CONTEXT_GROWTH if summary >= original and throwOnFailure is true
   *
   * @example
   * ```typescript
   * const validator = new ContextGrowthValidator();
   *
   * // Valid compression
   * const result = validator.validate(1000, 300);
   * // => { isValid: true, ratio: 0.3, tokensSaved: 700, ... }
   *
   * // Invalid - summary grew
   * validator.validate(1000, 1200);
   * // Throws: CompactionError (CONTEXT_GROWTH)
   * ```
   */
  validate(originalTokens: number, summaryTokens: number): GrowthValidationResult {
    // Handle edge case: zero original tokens
    if (originalTokens === 0) {
      const result: GrowthValidationResult = {
        isValid: summaryTokens === 0,
        originalTokens,
        summaryTokens,
        ratio: summaryTokens > 0 ? Number.POSITIVE_INFINITY : 0,
        tokensSaved: summaryTokens === 0 ? 0 : -summaryTokens, // Avoid -0
      };

      if (!result.isValid && this.throwOnFailure) {
        throw CompactionError.contextGrowth(
          `Cannot compress zero tokens into ${summaryTokens} tokens`,
          {
            originalTokens,
            resultingTokens: summaryTokens,
          }
        );
      }

      return result;
    }

    const ratio = summaryTokens / originalTokens;
    const tokensSaved = originalTokens - summaryTokens;
    const isValid = ratio < this.maxAllowedRatio;

    const result: GrowthValidationResult = {
      isValid,
      originalTokens,
      summaryTokens,
      ratio,
      tokensSaved,
    };

    if (!isValid && this.throwOnFailure) {
      const growthPercent = Math.round((ratio - 1) * 100);
      const message =
        ratio >= 1
          ? `Summary (${summaryTokens} tokens) is ${ratio === 1 ? "equal to" : `${growthPercent}% larger than`} original (${originalTokens} tokens)`
          : `Summary ratio ${ratio.toFixed(2)} exceeds maximum allowed ${this.maxAllowedRatio}`;

      throw CompactionError.contextGrowth(message, {
        originalTokens,
        resultingTokens: summaryTokens,
        context: {
          ratio,
          maxAllowedRatio: this.maxAllowedRatio,
        },
      });
    }

    return result;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a validator with default settings.
 *
 * Convenience function for quick validation without constructing a class instance.
 *
 * @returns A new ContextGrowthValidator with default options
 *
 * @example
 * ```typescript
 * const validator = createGrowthValidator();
 * validator.validate(1000, 300); // Valid
 * ```
 */
export function createGrowthValidator(options?: GrowthValidatorOptions): ContextGrowthValidator {
  return new ContextGrowthValidator(options);
}

/**
 * Quickly validate compression without creating a validator instance.
 *
 * Uses default settings (throws on growth).
 *
 * @param originalTokens - Token count of original content
 * @param summaryTokens - Token count of generated summary
 * @returns Validation result
 * @throws CompactionError with code CONTEXT_GROWTH if summary >= original
 *
 * @example
 * ```typescript
 * // Quick validation
 * const result = validateGrowth(1000, 300);
 * console.log(`Saved ${result.tokensSaved} tokens`);
 * ```
 */
export function validateGrowth(
  originalTokens: number,
  summaryTokens: number
): GrowthValidationResult {
  const validator = new ContextGrowthValidator();
  return validator.validate(originalTokens, summaryTokens);
}
