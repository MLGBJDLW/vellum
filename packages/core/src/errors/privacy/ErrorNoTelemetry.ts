// ============================================
// Privacy-Sensitive Error
// ============================================

import { type ErrorCode, VellumError, type VellumErrorOptions } from "../types.js";

/**
 * Error class for privacy-sensitive errors that should not be sent to telemetry.
 *
 * AC-008-1: ErrorNoTelemetry has skipTelemetry=true
 *
 * Use this class when an error contains sensitive information such as:
 * - User credentials or tokens
 * - Personal identifiable information (PII)
 * - Confidential business data
 * - API keys or secrets in error messages
 *
 * @example
 * ```typescript
 * // Create a privacy-sensitive error
 * const error = new ErrorNoTelemetry(
 *   'Invalid authentication token',
 *   ErrorCode.LLM_AUTH_FAILED,
 *   { userId: '[REDACTED]' }
 * );
 *
 * // Check if error should skip telemetry
 * if (shouldSkipTelemetry(error)) {
 *   console.log('Skipping telemetry for privacy-sensitive error');
 * }
 * ```
 */
export class ErrorNoTelemetry extends VellumError {
  /**
   * Flag indicating this error should not be sent to telemetry services.
   * AC-008-1: skipTelemetry=true
   */
  readonly skipTelemetry = true as const;

  constructor(message: string, code: ErrorCode, context?: Record<string, unknown>) {
    super(message, code, { context });
    this.name = "ErrorNoTelemetry";
  }

  /**
   * Creates a new ErrorNoTelemetry with additional options.
   */
  static create(
    message: string,
    code: ErrorCode,
    options?: Omit<VellumErrorOptions, "context"> & {
      context?: Record<string, unknown>;
    }
  ): ErrorNoTelemetry {
    const error = new ErrorNoTelemetry(message, code, options?.context);
    // Copy over additional options if provided
    if (options?.cause) {
      Object.defineProperty(error, "cause", { value: options.cause });
    }
    if (options?.requestId) {
      Object.defineProperty(error, "requestId", { value: options.requestId });
    }
    return error;
  }

  /**
   * Returns a JSON-serializable representation.
   * Includes the skipTelemetry flag.
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      skipTelemetry: this.skipTelemetry,
    };
  }
}

/**
 * Type guard to check if an error should skip telemetry.
 * AC-008-2: shouldSkipTelemetry() type guard works
 *
 * Returns true if:
 * - Error is an instance of ErrorNoTelemetry
 * - Error is a VellumError with skipTelemetry property set to true
 *
 * @param error - The error to check
 * @returns true if the error should not be sent to telemetry
 *
 * @example
 * ```typescript
 * function handleError(error: unknown) {
 *   if (shouldSkipTelemetry(error)) {
 *     // Log locally only, don't send to telemetry
 *     console.error('Privacy-sensitive error:', error);
 *     return;
 *   }
 *   // Safe to send to telemetry
 *   telemetry.record(error);
 * }
 * ```
 */
export function shouldSkipTelemetry(
  error: unknown
): error is ErrorNoTelemetry | (VellumError & { skipTelemetry: true }) {
  if (error instanceof ErrorNoTelemetry) {
    return true;
  }
  if (
    error instanceof VellumError &&
    "skipTelemetry" in error &&
    (error as { skipTelemetry?: unknown }).skipTelemetry === true
  ) {
    return true;
  }
  return false;
}
