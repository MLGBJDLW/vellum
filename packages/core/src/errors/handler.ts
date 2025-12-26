// ============================================
// Vellum Global Error Handler
// Centralized error handling with logging and events
// ============================================

import type { EventBus } from "../events/bus.js";
import { Events } from "../events/definitions.js";
import type { Logger } from "../logger/logger.js";
import { ErrorCode, ErrorSeverity, VellumError } from "./types.js";

// ============================================
// T084 - GlobalErrorHandler Options
// ============================================

/**
 * Configuration options for GlobalErrorHandler.
 */
export interface GlobalErrorHandlerOptions {
  /** Logger instance for error logging */
  logger: Logger;
  /** Optional event bus to emit error events */
  eventBus?: EventBus;
}

// ============================================
// T084, T085, T086 - GlobalErrorHandler Class
// ============================================

/**
 * Centralized error handler that normalizes errors, logs them,
 * and optionally emits events.
 *
 * @example
 * ```typescript
 * const handler = new GlobalErrorHandler({
 *   logger,
 *   eventBus,
 * });
 *
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   const vellumError = handler.handle(error);
 *   if (handler.isRecoverable(vellumError)) {
 *     // Retry logic
 *   }
 * }
 * ```
 */
export class GlobalErrorHandler {
  private readonly logger: Logger;
  private readonly eventBus?: EventBus;

  constructor(options: GlobalErrorHandlerOptions) {
    this.logger = options.logger;
    this.eventBus = options.eventBus;
  }

  /**
   * Handle any error by normalizing it to VellumError, logging, and emitting events.
   *
   * Normalization rules:
   * - VellumError: returned as-is
   * - Error: wrapped with SYSTEM_UNKNOWN code
   * - string: creates VellumError with message
   * - other: creates VellumError with generic message
   *
   * @param error - The error to handle (any type)
   * @returns Normalized VellumError
   */
  handle(error: unknown): VellumError {
    const vellumError = this.normalize(error);

    // Log at appropriate level based on severity
    this.logError(vellumError);

    // Emit error event if eventBus is provided
    if (this.eventBus) {
      this.eventBus.emit(Events.error, {
        error: vellumError,
        context: vellumError.context,
      });
    }

    return vellumError;
  }

  /**
   * Check if an error is recoverable (can be retried or handled gracefully).
   *
   * @param error - The error to check
   * @returns true if not FATAL severity, true for non-VellumError (assume recoverable)
   */
  isRecoverable(error: unknown): boolean {
    if (error instanceof VellumError) {
      return error.severity !== ErrorSeverity.FATAL;
    }
    // For non-VellumError, assume recoverable
    return true;
  }

  /**
   * Normalize any error to VellumError.
   */
  private normalize(error: unknown): VellumError {
    // Already a VellumError - return as-is
    if (error instanceof VellumError) {
      return error;
    }

    // Standard Error - wrap with SYSTEM_UNKNOWN code
    if (error instanceof Error) {
      return new VellumError(error.message, ErrorCode.SYSTEM_UNKNOWN, {
        cause: error,
        context: {
          originalName: error.name,
          originalStack: error.stack,
        },
      });
    }

    // String - create VellumError with the string as message
    if (typeof error === "string") {
      return new VellumError(error, ErrorCode.SYSTEM_UNKNOWN);
    }

    // Other types - generic message
    return new VellumError("An unknown error occurred", ErrorCode.SYSTEM_UNKNOWN, {
      context: {
        originalValue: String(error),
        originalType: typeof error,
      },
    });
  }

  /**
   * Log error at appropriate level based on severity.
   */
  private logError(error: VellumError): void {
    const logData = error.toJSON();

    if (error.severity === ErrorSeverity.FATAL) {
      this.logger.error(error.message, logData);
    } else {
      this.logger.warn(error.message, logData);
    }
  }
}
