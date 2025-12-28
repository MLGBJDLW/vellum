// ============================================
// Session Retry Utilities (T022)
// ============================================

/**
 * Session-specific retry utilities with AbortSignal support.
 *
 * Provides exponential backoff with VellumError.retryDelay respect
 * and AbortSignal cancellation for session operations.
 *
 * @module @vellum/core/session/retry
 */

import { VellumError, isRetryableError } from "../errors/index.js";

/**
 * Options for session retry operations.
 */
export interface SessionRetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in milliseconds before first retry (default: 1000) */
  baseDelay?: number;
  /** Maximum delay in milliseconds between retries (default: 30000) */
  maxDelay?: number;
  /** AbortSignal to cancel waiting between retries */
  signal?: AbortSignal;
  /** Custom function to determine if error should be retried */
  shouldRetry?: (error: unknown) => boolean;
  /** Callback called before each retry attempt */
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}

/**
 * Default retry options.
 */
const DEFAULT_OPTIONS: Required<Omit<SessionRetryOptions, "signal" | "shouldRetry" | "onRetry">> = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
};

/**
 * Error thrown when a retry operation is aborted.
 */
export class RetryAbortedError extends Error {
  constructor(message = "Retry operation was aborted") {
    super(message);
    this.name = "RetryAbortedError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RetryAbortedError);
    }
  }
}

/**
 * Sleeps for the specified duration with AbortSignal support.
 *
 * @param ms - Duration in milliseconds
 * @param signal - Optional AbortSignal to cancel the sleep
 * @throws RetryAbortedError if signal is aborted
 */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Check if already aborted
    if (signal?.aborted) {
      reject(new RetryAbortedError());
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;

    const cleanup = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    };

    // Set up abort handler
    if (signal) {
      abortHandler = () => {
        cleanup();
        reject(new RetryAbortedError());
      };
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    // Set up timeout
    timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
  });
}

/**
 * Calculates the delay for a given retry attempt using exponential backoff.
 * Respects VellumError.retryDelay if set.
 *
 * @param attempt - The current retry attempt (1-based)
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay in milliseconds
 * @param error - The error that triggered the retry
 * @returns Delay in milliseconds
 */
export function calculateRetryDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  error: unknown
): number {
  // Check if error has a retryDelay hint
  if (error instanceof VellumError && error.retryDelay !== undefined) {
    return Math.min(error.retryDelay, maxDelay);
  }

  // Exponential backoff: baseDelay * 2^(attempt-1)
  const exponentialDelay = baseDelay * 2 ** (attempt - 1);
  return Math.min(exponentialDelay, maxDelay);
}

/**
 * Session-specific retry wrapper with AbortSignal support.
 *
 * Wraps an async function with retry logic using exponential backoff.
 * Respects VellumError.retryDelay if set and supports AbortSignal
 * for cancelling waits between retries.
 *
 * @example
 * ```typescript
 * const controller = new AbortController();
 *
 * const result = await withSessionRetry(
 *   () => fetchData(),
 *   {
 *     maxAttempts: 3,
 *     baseDelay: 1000,
 *     signal: controller.signal,
 *     onRetry: (err, attempt, delay) => {
 *       console.log(`Retry ${attempt} after ${delay}ms`);
 *     }
 *   }
 * );
 *
 * // Cancel retries
 * controller.abort();
 * ```
 *
 * @param fn - The async function to execute with retries
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 * @throws RetryAbortedError if aborted during wait
 */
export async function withSessionRetry<T>(
  fn: () => Promise<T>,
  options?: SessionRetryOptions
): Promise<T> {
  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const shouldRetryFn = options?.shouldRetry ?? isRetryableError;
  const onRetryFn = options?.onRetry;
  const signal = options?.signal;

  let lastError: unknown;
  let attempt = 0;

  while (attempt < opts.maxAttempts) {
    // Check if aborted before each attempt
    if (signal?.aborted) {
      throw new RetryAbortedError();
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt++;

      // Check if we should retry
      if (attempt >= opts.maxAttempts || !shouldRetryFn(error)) {
        throw error;
      }

      // Check if aborted before waiting
      if (signal?.aborted) {
        throw new RetryAbortedError();
      }

      // Calculate delay for this retry
      const delay = calculateRetryDelay(attempt, opts.baseDelay, opts.maxDelay, error);

      // Call onRetry callback if provided
      if (onRetryFn) {
        onRetryFn(error, attempt, delay);
      }

      // Wait before retrying (with abort support)
      await abortableSleep(delay, signal);
    }
  }

  // Should not reach here, but throw last error just in case
  throw lastError;
}

/**
 * Creates a session retry function with preset options.
 *
 * @example
 * ```typescript
 * const retry = createSessionRetry({
 *   maxAttempts: 5,
 *   baseDelay: 500,
 * });
 *
 * const result = await retry(() => fetchData());
 * ```
 *
 * @param defaultOptions - Default options for all retries
 * @returns A function that wraps async operations with retry logic
 */
export function createSessionRetry(
  defaultOptions: SessionRetryOptions
): <T>(fn: () => Promise<T>, options?: SessionRetryOptions) => Promise<T> {
  return <T>(fn: () => Promise<T>, options?: SessionRetryOptions): Promise<T> => {
    return withSessionRetry(fn, { ...defaultOptions, ...options });
  };
}

/**
 * Utility to check if an error was caused by abort.
 */
export function isAbortError(error: unknown): error is RetryAbortedError {
  return error instanceof RetryAbortedError;
}
