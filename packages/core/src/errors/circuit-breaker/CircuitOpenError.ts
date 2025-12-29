// ============================================
// CircuitOpenError - T012
// Error thrown when circuit breaker is open
// ============================================

import { ErrorCode, VellumError } from "../types.js";

/**
 * Error thrown when a circuit breaker is in the OPEN state,
 * indicating that requests are being rejected to prevent cascading failures.
 *
 * This error includes retry information so callers can determine
 * when to attempt the request again.
 *
 * @example
 * ```typescript
 * try {
 *   await circuitBreaker.execute(() => apiCall());
 * } catch (error) {
 *   if (error instanceof CircuitOpenError) {
 *     console.log(`Circuit ${error.circuitId} is open`);
 *     console.log(`Retry after ${error.retryAfterMs}ms`);
 *   }
 * }
 * ```
 */
export class CircuitOpenError extends VellumError {
  /** Identifier of the circuit breaker that is open */
  readonly circuitId: string;

  /** Time in milliseconds until the circuit may transition to HALF_OPEN */
  readonly retryAfterMs: number;

  constructor(circuitId: string, retryAfterMs: number) {
    super(`Circuit breaker '${circuitId}' is open`, ErrorCode.CIRCUIT_OPEN, {
      context: {
        circuitId,
        retryAfterMs,
      },
      isRetryable: true,
      retryDelay: retryAfterMs,
    });
    this.name = "CircuitOpenError";
    this.circuitId = circuitId;
    this.retryAfterMs = retryAfterMs;
  }
}
