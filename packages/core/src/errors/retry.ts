// ============================================
// Vellum Retry and Timeout Utilities
// ============================================

import { ErrorCode, isRetryableError, VellumError } from "./types.js";

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
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, "shouldRetry" | "onRetry">> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * Sleeps for the specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  options: Required<Omit<RetryOptions, "shouldRetry" | "onRetry">>,
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
 * @param fn - The async function to execute with retries
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 */
export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const opts = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  const shouldRetryFn = options?.shouldRetry ?? isRetryableError;
  const onRetryFn = options?.onRetry;

  let lastError: unknown;
  let attempt = 0;

  while (attempt <= opts.maxRetries) {
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

      // Wait before retrying
      await sleep(delay);
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
