// ============================================
// Quota Error Classes
// ============================================

import { ErrorCode, VellumError } from "../types.js";

/**
 * Error thrown when a quota limit is permanently exceeded.
 *
 * Terminal quota errors indicate conditions that cannot be resolved
 * by waiting (e.g., billing issues, hard limits exceeded).
 */
export class TerminalQuotaError extends VellumError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, ErrorCode.QUOTA_TERMINAL, {
      context,
      isRetryable: false,
    });
    this.name = "TerminalQuotaError";
  }
}

/**
 * Error thrown when a quota limit is temporarily exceeded.
 *
 * Retryable quota errors indicate rate limiting or throttling
 * that will resolve after waiting.
 */
export class RetryableQuotaError extends VellumError {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number, context?: Record<string, unknown>) {
    super(message, ErrorCode.QUOTA_RETRYABLE, {
      context,
      isRetryable: true,
      retryDelay: retryAfterMs,
    });
    this.name = "RetryableQuotaError";
    this.retryAfterMs = retryAfterMs;
  }
}
