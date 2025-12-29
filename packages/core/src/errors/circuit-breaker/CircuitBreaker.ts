// ============================================
// CircuitBreaker - T013
// State machine for preventing cascading failures
// ============================================

import { z } from "zod";
import { defineEvent, type EventBus } from "../../events/bus.js";
import { CircuitOpenError } from "./CircuitOpenError.js";

// ============================================
// Types & Schemas
// ============================================

/**
 * Circuit breaker states following the standard pattern.
 *
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failure threshold exceeded, requests rejected
 * - HALF_OPEN: Testing if service has recovered
 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Configuration options for CircuitBreaker.
 */
export interface CircuitBreakerOptions {
  /** Number of failures before circuit opens (default: 5) */
  failureThreshold?: number;
  /** Time in ms before OPEN → HALF_OPEN transition (default: 30000) */
  resetTimeoutMs?: number;
  /** Sliding window size in ms for counting failures (default: 60000) */
  windowMs?: number;
  /** Max concurrent requests in HALF_OPEN state (default: 1) */
  halfOpenMaxAttempts?: number;
  /** Optional EventBus for emitting circuit state events */
  eventBus?: EventBus;
}

// ============================================
// Circuit Breaker Events (AC-003-6)
// ============================================

/**
 * Event emitted when circuit transitions to OPEN state.
 */
export const circuitOpen = defineEvent(
  "circuit:open",
  z.object({
    circuitId: z.string(),
    failureCount: z.number(),
    timestamp: z.number(),
  })
);

/**
 * Event emitted when circuit transitions to CLOSED state.
 */
export const circuitClose = defineEvent(
  "circuit:close",
  z.object({
    circuitId: z.string(),
    timestamp: z.number(),
  })
);

/**
 * Event emitted when circuit transitions to HALF_OPEN state.
 */
export const circuitHalfOpen = defineEvent(
  "circuit:half-open",
  z.object({
    circuitId: z.string(),
    timestamp: z.number(),
  })
);

// ============================================
// Default Configuration
// ============================================

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 30000; // 30 seconds
const DEFAULT_WINDOW_MS = 60000; // 1 minute
const DEFAULT_HALF_OPEN_MAX_ATTEMPTS = 1;

// ============================================
// CircuitBreaker Class
// ============================================

/**
 * Circuit breaker implementation following the standard pattern
 * to prevent cascading failures in distributed systems.
 *
 * State Machine:
 * ```
 *                    failure threshold
 *           ┌──────────────────────────────┐
 *           │                              ▼
 *        CLOSED ◄─── success ───── HALF_OPEN ───► OPEN
 *                                     │            │
 *                                     │  failure   │
 *                                     └────────────┘
 *                                                  │
 *                          reset timeout           │
 *                    ◄─────────────────────────────┘
 * ```
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker('api-service', {
 *   failureThreshold: 5,
 *   resetTimeoutMs: 30000,
 *   windowMs: 60000,
 * });
 *
 * try {
 *   const result = await breaker.execute(() => callExternalApi());
 * } catch (error) {
 *   if (error instanceof CircuitOpenError) {
 *     // Circuit is open, request was rejected
 *   }
 * }
 * ```
 */
export class CircuitBreaker {
  /** Unique identifier for this circuit breaker */
  readonly id: string;

  // Configuration
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly windowMs: number;
  private readonly halfOpenMaxAttempts: number;
  private readonly eventBus?: EventBus;

  // State
  private state: CircuitState = "CLOSED";
  private failures: number[] = []; // timestamps of failures within window
  private lastFailureTime?: number;
  private halfOpenAttempts = 0;
  private resetTimerId?: ReturnType<typeof setTimeout>;

  constructor(id: string, options?: CircuitBreakerOptions) {
    this.id = id;
    this.failureThreshold = options?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.resetTimeoutMs = options?.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS;
    this.windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
    this.halfOpenMaxAttempts = options?.halfOpenMaxAttempts ?? DEFAULT_HALF_OPEN_MAX_ATTEMPTS;
    this.eventBus = options?.eventBus;
  }

  /**
   * Get the current state of the circuit breaker.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get the number of failures in the current sliding window.
   */
  getFailureCount(): number {
    this.pruneOldFailures();
    return this.failures.length;
  }

  /**
   * Get time remaining until circuit may transition from OPEN to HALF_OPEN.
   * Returns 0 if not in OPEN state.
   */
  getTimeUntilReset(): number {
    if (this.state !== "OPEN" || !this.lastFailureTime) {
      return 0;
    }
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.resetTimeoutMs - elapsed);
  }

  /**
   * Execute a function through the circuit breaker.
   *
   * - CLOSED: Execute function, track failures
   * - OPEN: Reject immediately with CircuitOpenError
   * - HALF_OPEN: Allow limited test requests
   *
   * @param fn - Async function to execute
   * @returns Result of the function
   * @throws CircuitOpenError if circuit is open
   * @throws Error from the function if it fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from OPEN to HALF_OPEN
    this.checkResetTimeout();

    // OPEN state - reject request
    if (this.state === "OPEN") {
      throw new CircuitOpenError(this.id, this.getTimeUntilReset());
    }

    // HALF_OPEN state - limit concurrent test requests
    if (this.state === "HALF_OPEN") {
      if (this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
        throw new CircuitOpenError(this.id, this.getTimeUntilReset());
      }
      this.halfOpenAttempts++;
    }

    // Execute the function
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Record a successful operation.
   * In HALF_OPEN state, this transitions the circuit to CLOSED.
   */
  recordSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.transitionTo("CLOSED");
    }
    // In CLOSED state, successes don't affect the failure count
    // This allows the sliding window to naturally expire failures
  }

  /**
   * Record a failed operation.
   * May trigger transition to OPEN state if threshold is exceeded.
   */
  recordFailure(): void {
    const now = Date.now();

    if (this.state === "HALF_OPEN") {
      // Any failure in HALF_OPEN returns to OPEN
      this.lastFailureTime = now;
      this.transitionTo("OPEN");
      return;
    }

    if (this.state === "CLOSED") {
      // Add failure to sliding window
      this.failures.push(now);
      this.lastFailureTime = now;

      // Check if threshold exceeded
      if (this.shouldOpen()) {
        this.transitionTo("OPEN");
      }
    }
  }

  /**
   * Reset the circuit breaker to CLOSED state.
   * Clears all failure history.
   */
  reset(): void {
    this.clearResetTimer();
    this.state = "CLOSED";
    this.failures = [];
    this.lastFailureTime = undefined;
    this.halfOpenAttempts = 0;
  }

  /**
   * Dispose of the circuit breaker, cleaning up any timers.
   */
  dispose(): void {
    this.clearResetTimer();
  }

  // ========================================
  // Private Methods
  // ========================================

  /**
   * Check if failure threshold has been exceeded in the sliding window.
   */
  private shouldOpen(): boolean {
    this.pruneOldFailures();
    return this.failures.length >= this.failureThreshold;
  }

  /**
   * Remove failures that are outside the sliding window.
   */
  private pruneOldFailures(): void {
    const cutoff = Date.now() - this.windowMs;
    this.failures = this.failures.filter((timestamp) => timestamp > cutoff);
  }

  /**
   * Check if reset timeout has elapsed and transition to HALF_OPEN.
   */
  private checkResetTimeout(): void {
    if (this.state !== "OPEN" || !this.lastFailureTime) {
      return;
    }

    const elapsed = Date.now() - this.lastFailureTime;
    if (elapsed >= this.resetTimeoutMs) {
      this.transitionTo("HALF_OPEN");
    }
  }

  /**
   * Transition to a new state.
   * Emits events via EventBus if configured.
   */
  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    if (previousState === newState) {
      return;
    }

    this.state = newState;
    this.clearResetTimer();

    switch (newState) {
      case "OPEN":
        this.scheduleResetTimeout();
        this.emitOpenEvent();
        break;
      case "HALF_OPEN":
        this.halfOpenAttempts = 0;
        this.emitHalfOpenEvent();
        break;
      case "CLOSED":
        this.failures = [];
        this.lastFailureTime = undefined;
        this.halfOpenAttempts = 0;
        this.emitCloseEvent();
        break;
    }
  }

  /**
   * Schedule automatic transition from OPEN to HALF_OPEN.
   */
  private scheduleResetTimeout(): void {
    this.clearResetTimer();
    this.resetTimerId = setTimeout(() => {
      if (this.state === "OPEN") {
        this.transitionTo("HALF_OPEN");
      }
    }, this.resetTimeoutMs);
  }

  /**
   * Clear the reset timeout timer.
   */
  private clearResetTimer(): void {
    if (this.resetTimerId) {
      clearTimeout(this.resetTimerId);
      this.resetTimerId = undefined;
    }
  }

  // ========================================
  // Event Emission (AC-003-6)
  // ========================================

  private emitOpenEvent(): void {
    this.eventBus?.emit(circuitOpen, {
      circuitId: this.id,
      failureCount: this.failures.length,
      timestamp: Date.now(),
    });
  }

  private emitCloseEvent(): void {
    this.eventBus?.emit(circuitClose, {
      circuitId: this.id,
      timestamp: Date.now(),
    });
  }

  private emitHalfOpenEvent(): void {
    this.eventBus?.emit(circuitHalfOpen, {
      circuitId: this.id,
      timestamp: Date.now(),
    });
  }
}
