// ============================================
// Vellum Retry and Timeout Utilities
// ============================================

import { ErrorCode, isRetryableError, VellumError } from "./types.js";

// ============================================
// AbortError for abort signal handling
// ============================================

/**
 * Error thrown when an operation is aborted via AbortSignal.
 * AC-006-2: AbortError thrown on abort
 */
export class AbortError extends Error {
  constructor(message = "Operation aborted") {
    super(message);
    this.name = "AbortError";

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AbortError);
    }
  }
}

// ============================================
// T088, T089 - withRetry Function
// ============================================

/**
 * Options for the withRetry function.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds before first retry (default: 1000) */
  baseDelay?: number;
  /** Maximum delay in milliseconds between retries (default: 30000) */
  maxDelay?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Custom function to determine if error should be retried */
  shouldRetry?: (error: unknown) => boolean;
  /** Callback called before each retry attempt */
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
  /** AbortSignal to cancel retry attempts (AC-006-1, AC-006-2, AC-006-3) */
  signal?: AbortSignal;
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, "shouldRetry" | "onRetry" | "signal">> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * Sleeps for the specified duration with abort signal support.
 * AC-006-3: Delay cancelled on abort
 *
 * @param ms - Duration in milliseconds
 * @param signal - Optional AbortSignal to cancel the sleep
 * @throws AbortError if the signal is aborted
 */
async function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  // AC-006-1: Check if already aborted before starting
  if (signal?.aborted) {
    throw new AbortError("Operation aborted");
  }

  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;

    const cleanup = (): void => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    };

    timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    if (signal) {
      abortHandler = (): void => {
        cleanup();
        reject(new AbortError("Operation aborted"));
      };

      signal.addEventListener("abort", abortHandler, { once: true });
    }
  });
}

/**
 * Calculates the delay for a given retry attempt using exponential backoff.
 * Respects error.retryDelay if the error is a VellumError.
 *
 * @param attempt - The current retry attempt (1-based)
 * @param options - Retry options
 * @param error - The error that triggered the retry
 * @returns Delay in milliseconds
 */
function calculateDelay(
  attempt: number,
  options: Required<Omit<RetryOptions, "shouldRetry" | "onRetry" | "signal">>,
  error: unknown
): number {
  // Check if error has a retryDelay hint
  if (error instanceof VellumError && error.retryDelay !== undefined) {
    return Math.min(error.retryDelay, options.maxDelay);
  }

  // Exponential backoff: baseDelay * backoffMultiplier^(attempt-1)
  const exponentialDelay = options.baseDelay * options.backoffMultiplier ** (attempt - 1);
  return Math.min(exponentialDelay, options.maxDelay);
}

/**
 * Wraps an async function with retry logic using exponential backoff.
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchData(),
 *   {
 *     maxRetries: 3,
 *     baseDelay: 1000,
 *     onRetry: (err, attempt, delay) => {
 *       console.log(`Retry ${attempt} after ${delay}ms`);
 *     }
 *   }
 * );
 * ```
 *
 * @example With AbortSignal
 * ```typescript
 * const controller = new AbortController();
 * const result = await withRetry(
 *   () => fetchData(),
 *   { signal: controller.signal }
 * );
 * // Call controller.abort() to cancel
 * ```
 *
 * @param fn - The async function to execute with retries
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 * @throws AbortError if the signal is aborted
 */
export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const opts = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  const shouldRetryFn = options?.shouldRetry ?? isRetryableError;
  const onRetryFn = options?.onRetry;
  const signal = options?.signal;

  let lastError: unknown;
  let attempt = 0;

  while (attempt <= opts.maxRetries) {
    // AC-006-1: Check if aborted before each attempt
    if (signal?.aborted) {
      throw new AbortError("Operation aborted");
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt++;

      // Check if we should retry
      if (attempt > opts.maxRetries || !shouldRetryFn(error)) {
        throw error;
      }

      // Calculate delay for this retry
      const delay = calculateDelay(attempt, opts, error);

      // Call onRetry callback if provided
      if (onRetryFn) {
        onRetryFn(error, attempt, delay);
      }

      // Wait before retrying (with abort support - AC-006-3)
      await abortableSleep(delay, signal);
    }
  }

  // Should not reach here, but throw last error just in case
  throw lastError;
}

// ============================================
// T090 - withTimeout Function
// ============================================

/**
 * Wraps an async function with a timeout.
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   () => fetchData(),
 *   5000 // 5 second timeout
 * );
 * ```
 *
 * @param fn - The async function to execute
 * @param timeout - Timeout in milliseconds
 * @returns The result of the function
 * @throws VellumError with TOOL_TIMEOUT code if timeout is exceeded
 */
export async function withTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    // Set up timeout
    timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(
          new VellumError(`Operation timed out after ${timeout}ms`, ErrorCode.TOOL_TIMEOUT, {
            context: {
              timeout,
            },
          })
        );
      }
    }, timeout);

    // Execute the function
    fn()
      .then((result) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          resolve(result);
        }
      })
      .catch((error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      });
  });
}
