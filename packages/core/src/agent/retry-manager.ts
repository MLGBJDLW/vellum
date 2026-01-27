// ============================================
// Agent Retry Manager (Step 6 Refactor)
// ============================================

/**
 * Extracted retry management logic from AgentLoop.
 * Handles error classification, retry decisions, backoff calculation,
 * and cancellation-aware waiting.
 *
 * @module @vellum/core/agent/retry-manager
 */

import type { Logger } from "../logger/logger.js";
import { classifyError, type ErrorInfo, isFatal } from "../session/errors.js";
import { RetryAbortedError } from "../session/retry.js";
import type { CancellationToken } from "./cancellation.js";

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in milliseconds before first retry (default: 1000) */
  baseDelayMs: number;
  /** Maximum delay in milliseconds between retries (default: 30000) */
  maxDelayMs: number;
}

/**
 * Dependencies for AgentRetryManager.
 */
export interface RetryManagerDeps {
  /** Retry configuration */
  config: RetryConfig;
  /** Logger instance */
  logger?: Logger;
  /** Function to get current cancellation token */
  getCancellationToken: () => CancellationToken;
  /** Callback when a retry attempt is made */
  emitRetryAttempt: (attempt: number, error: Error, delay: number) => void;
  /** Callback when all retries are exhausted */
  emitRetryExhausted: (error: Error, attempts: number) => void;
}

/**
 * Result of error handling decision.
 */
export interface HandleErrorResult {
  /** Whether to retry the operation */
  shouldRetry: boolean;
  /** Delay before retry (if shouldRetry is true) */
  delay?: number;
  /** Whether the error is fatal (non-recoverable) */
  isFatal?: boolean;
  /** Classified error information */
  errorInfo: ErrorInfo;
}

/**
 * Manages retry logic for the agent loop.
 *
 * Extracted from AgentLoop to:
 * - Centralize retry decision logic
 * - Handle exponential backoff with jitter
 * - Support cancellation during retry waits
 * - Track retry attempts across operations
 */
export class AgentRetryManager {
  /** Current retry attempt counter */
  private retryAttempts = 0;

  constructor(private readonly deps: RetryManagerDeps) {}

  /**
   * Gets the current retry attempt count.
   */
  getRetryAttempts(): number {
    return this.retryAttempts;
  }

  /**
   * Resets the retry counter to zero.
   * Call this when starting a fresh operation.
   */
  resetRetryCounter(): void {
    this.retryAttempts = 0;
  }

  /**
   * Handles an error and determines retry strategy.
   *
   * @param error - The error to handle
   * @returns Result with retry decision and delay
   */
  handleError(error: Error): HandleErrorResult {
    const errorInfo = classifyError(error);

    // Check for fatal errors first
    if (isFatal(errorInfo)) {
      this.deps.logger?.error("Fatal error encountered", { errorInfo });
      return {
        shouldRetry: false,
        isFatal: true,
        errorInfo,
      };
    }

    // Check if we should retry
    if (this.shouldRetry(errorInfo)) {
      this.retryAttempts++;
      const delay = errorInfo.retryDelay ?? this.calculateBackoff(this.retryAttempts);

      this.deps.logger?.debug("Preparing retry after error", {
        attempt: this.retryAttempts,
        delay,
        errorType: errorInfo.severity,
      });

      this.deps.emitRetryAttempt(this.retryAttempts, error, delay);

      return {
        shouldRetry: true,
        delay,
        errorInfo,
      };
    }

    // Non-retryable or retries exhausted
    if (this.retryAttempts > 0) {
      this.deps.emitRetryExhausted(error, this.retryAttempts);
    }

    return {
      shouldRetry: false,
      isFatal: false,
      errorInfo,
    };
  }

  /**
   * Determines if a retry should be attempted based on error and config.
   *
   * @param errorInfo - Classified error information
   * @returns true if retry should be attempted
   */
  private shouldRetry(errorInfo: ErrorInfo): boolean {
    // Not retryable by classification
    if (!errorInfo.retryable) {
      return false;
    }

    const maxRetries = this.deps.config.maxRetries;
    const maxErrorRetries = errorInfo.maxRetries ?? maxRetries;
    return this.retryAttempts < Math.min(maxRetries, maxErrorRetries);
  }

  /**
   * Calculates retry delay using exponential backoff with jitter.
   *
   * @param attempt - Current retry attempt (1-based)
   * @returns Delay in milliseconds
   */
  private calculateBackoff(attempt: number): number {
    const { baseDelayMs, maxDelayMs } = this.deps.config;

    // Exponential backoff: base * 2^(attempt-1)
    const exponentialDelay = baseDelayMs * 2 ** (attempt - 1);

    // Add jitter (±10%) to prevent thundering herd
    const jitter = exponentialDelay * 0.1 * (Math.random() * 2 - 1);
    const delayWithJitter = exponentialDelay + jitter;

    return Math.min(Math.round(delayWithJitter), maxDelayMs);
  }

  /**
   * Waits for retry delay with cancellation support.
   *
   * @param delay - Delay in milliseconds
   * @throws RetryAbortedError if cancelled during wait
   */
  async waitForRetry(delay: number): Promise<void> {
    const cancellation = this.deps.getCancellationToken();

    return new Promise<void>((resolve, reject) => {
      if (cancellation.isCancelled) {
        reject(new RetryAbortedError("Retry cancelled"));
        return;
      }

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe: (() => void) | undefined;

      const cleanup = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
        if (unsubscribe) {
          unsubscribe();
        }
      };

      const cancelHandler = () => {
        cleanup();
        reject(new RetryAbortedError("Retry cancelled"));
      };

      unsubscribe = cancellation.onCancel(cancelHandler);

      timeoutId = setTimeout(() => {
        cleanup();
        resolve();
      }, delay);
    });
  }
}
