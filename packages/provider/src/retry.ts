/**
 * Retry Utilities
 *
 * Provides retry logic with exponential backoff for LLM provider requests.
 * Handles rate limiting, transient failures, and respects Retry-After headers.
 *
 * @module @vellum/provider/retry
 */

import { getRetryDelay, isRetryable } from "./errors.js";

// =============================================================================
// T031: Retry Configuration
// =============================================================================

/**
 * Configuration options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 60000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Jitter factor (0-1) to randomize delays (default: 0.3) */
  jitterFactor?: number;
  /** Callback invoked before each retry attempt */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** AbortSignal to cancel retry attempts */
  signal?: AbortSignal;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, "onRetry" | "signal" | "isRetryable">> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitterFactor: 0.3,
};

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The result value if successful */
  value?: T;
  /** The last error if failed */
  error?: unknown;
  /** Number of attempts made */
  attempts: number;
  /** Total time spent (including delays) in milliseconds */
  totalTimeMs: number;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Sleep for a specified duration
 *
 * @param ms - Duration in milliseconds
 * @param signal - Optional AbortSignal to cancel sleep
 */
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    if (signal) {
      const onAbort = (): void => {
        clearTimeout(timeoutId);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Calculate delay with exponential backoff and jitter
 *
 * @param attempt - Current attempt number (1-based)
 * @param options - Retry options
 * @param error - The error that triggered the retry (for Retry-After extraction)
 * @returns Delay in milliseconds
 */
function calculateDelay(
  attempt: number,
  options: Required<Omit<RetryOptions, "onRetry" | "signal" | "isRetryable">>,
  error: unknown
): number {
  // Check for Retry-After from the error
  const retryAfterDelay = getRetryDelay(error, attempt);

  // If getRetryDelay returns a significantly higher value, it likely found Retry-After
  // Use it if it's greater than our calculated delay
  const exponentialDelay = options.initialDelayMs * options.backoffMultiplier ** (attempt - 1);

  // Add jitter (randomize between 0 and jitterFactor * delay)
  const jitter = Math.random() * options.jitterFactor * exponentialDelay;
  const calculatedDelay = exponentialDelay + jitter;

  // Use the larger of Retry-After delay or calculated delay
  const delay = Math.max(retryAfterDelay, calculatedDelay);

  // Cap at maxDelayMs
  return Math.min(delay, options.maxDelayMs);
}

// =============================================================================
// T031: withProviderRetry Implementation
// =============================================================================

/**
 * Execute an async function with retry logic using exponential backoff.
 *
 * Features:
 * - Exponential backoff with configurable multiplier
 * - Jitter to prevent thundering herd
 * - Respects Retry-After headers when present
 * - Uses isRetryable() from errors.ts for error classification
 * - Supports AbortSignal for cancellation
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns Promise resolving to the function result
 * @throws The last error if all retries fail
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = await withProviderRetry(
 *   () => provider.complete(params)
 * );
 *
 * // With options
 * const result = await withProviderRetry(
 *   () => provider.complete(params),
 *   {
 *     maxRetries: 5,
 *     onRetry: (attempt, error, delay) => {
 *       console.log(`Retry ${attempt} after ${delay}ms: ${error}`);
 *     },
 *   }
 * );
 *
 * // With AbortSignal
 * const controller = new AbortController();
 * const result = await withProviderRetry(
 *   () => provider.complete(params),
 *   { signal: controller.signal }
 * );
 * ```
 */
export async function withProviderRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  const checkRetryable = opts.isRetryable ?? isRetryable;
  let lastError: unknown;
  let attempt = 0;

  while (attempt <= opts.maxRetries) {
    // Check for abort before each attempt
    if (opts.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt++;

      // Don't retry if not retryable or max retries reached
      if (!checkRetryable(error) || attempt > opts.maxRetries) {
        throw error;
      }

      // Calculate delay
      const delayMs = calculateDelay(attempt, opts, error);

      // Invoke callback if provided
      opts.onRetry?.(attempt, error, delayMs);

      // Wait before next attempt
      try {
        await sleep(delayMs, opts.signal);
      } catch (abortError) {
        // If aborted during sleep, throw the original error
        if (abortError instanceof DOMException && abortError.name === "AbortError") {
          throw lastError;
        }
        throw abortError;
      }
    }
  }

  // Should not reach here, but throw last error just in case
  throw lastError;
}

/**
 * Execute an async function with retry logic and return detailed result.
 *
 * Unlike withProviderRetry, this function:
 * - Never throws (errors are captured in result)
 * - Returns detailed retry information
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns RetryResult with success status, value, and metadata
 *
 * @example
 * ```typescript
 * const result = await withProviderRetryResult(
 *   () => provider.complete(params)
 * );
 *
 * if (result.success) {
 *   console.log('Success after', result.attempts, 'attempts');
 *   console.log('Result:', result.value);
 * } else {
 *   console.error('Failed after', result.attempts, 'attempts');
 *   console.error('Error:', result.error);
 * }
 * ```
 */
export async function withProviderRetryResult<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attempts = 0;

  try {
    const value = await withProviderRetry(fn, {
      ...options,
      onRetry: (attempt, error, delayMs) => {
        attempts = attempt;
        options.onRetry?.(attempt, error, delayMs);
      },
    });

    return {
      success: true,
      value,
      attempts: attempts + 1,
      totalTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error,
      attempts: attempts + 1,
      totalTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Create a retryable version of a function
 *
 * @param fn - The async function to wrap
 * @param options - Default retry options
 * @returns Wrapped function with retry logic
 *
 * @example
 * ```typescript
 * const retryableComplete = createRetryable(
 *   (params) => provider.complete(params),
 *   { maxRetries: 3 }
 * );
 *
 * const result = await retryableComplete(params);
 * ```
 */
export function createRetryable<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  defaultOptions: RetryOptions = {}
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    return withProviderRetry(() => fn(...args), defaultOptions);
  };
}

/**
 * Retry a function that may partially complete.
 * Useful for streaming operations where you want to resume.
 *
 * @param fn - Function that takes a resume token and returns result with token
 * @param options - Retry options
 * @returns Final result
 *
 * @example
 * ```typescript
 * const result = await withResumableRetry(
 *   async (resumeToken) => {
 *     const stream = provider.stream(params, { resumeFrom: resumeToken });
 *     let lastToken = resumeToken;
 *     for await (const event of stream) {
 *       lastToken = event.checkpoint;
 *       process(event);
 *     }
 *     return { value: 'done', resumeToken: lastToken };
 *   }
 * );
 * ```
 */
export async function withResumableRetry<T>(
  fn: (resumeToken?: string) => Promise<{ value: T; resumeToken?: string }>,
  options: RetryOptions = {}
): Promise<T> {
  let resumeToken: string | undefined;

  return withProviderRetry(async () => {
    const result = await fn(resumeToken);
    resumeToken = result.resumeToken;
    return result.value;
  }, options);
}
