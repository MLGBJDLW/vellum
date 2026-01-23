/**
 * Fallback Chain for Multi-Model Summarization
 *
 * Implements REQ-009: Provides resilient summarization with automatic
 * failover between multiple LLM models. When a primary model fails,
 * automatically tries the next model in the chain.
 *
 * @module @vellum/core/context/fallback-chain
 *
 * @example
 * ```typescript
 * import { FallbackChain } from './fallback-chain';
 *
 * const chain = new FallbackChain({
 *   models: [
 *     { model: 'gpt-4o', timeout: 30000, maxRetries: 2 },
 *     { model: 'claude-3-haiku', timeout: 20000 },
 *     { model: 'gemini-flash', timeout: 15000 },
 *   ],
 *   createClient: (model) => createLLMClient(model),
 * });
 *
 * const result = await chain.summarize(messages, prompt);
 * console.log(`Used model: ${result.model}, attempts: ${result.attempts}`);
 * ```
 */

import { CompactionError } from "./errors.js";
import type { ContextMessage } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for a single model in the fallback chain.
 */
export interface FallbackModelConfig {
  /** Model identifier (e.g., 'gpt-4o', 'claude-3-haiku') */
  model: string;

  /**
   * Timeout in milliseconds for this model's summarization request.
   * @default 30000
   */
  timeout?: number;

  /**
   * Maximum retry attempts within this model before falling back.
   * @default 1
   */
  maxRetries?: number;

  /**
   * Initial delay for retries in milliseconds.
   * @default 1000
   */
  retryDelayMs?: number;
}

/**
 * Function to create an LLM client for a specific model.
 * Returns a summarize function that can be used for compression.
 */
export type ModelClientFactory = (model: string) => {
  summarize(messages: ContextMessage[], prompt: string): Promise<string>;
};

/**
 * Options for configuring the FallbackChain.
 */
export interface FallbackChainOptions {
  /** Ordered list of models to try (first = primary, rest = fallbacks) */
  models: FallbackModelConfig[];

  /** Factory function to create LLM clients for each model */
  createClient: ModelClientFactory;

  /**
   * Callback invoked when a model attempt fails.
   * Useful for logging/monitoring.
   */
  onAttemptFailed?: (model: string, attempt: number, error: Error) => void;

  /**
   * Callback invoked when falling back to the next model.
   */
  onFallback?: (fromModel: string, toModel: string) => void;
}

/**
 * Record of a single summarization attempt.
 */
export interface FallbackAttempt {
  /** Model that was attempted */
  model: string;
  /** Attempt number for this model (1-based) */
  attempt: number;
  /** Whether this attempt succeeded */
  success: boolean;
  /** Time taken for this attempt in milliseconds */
  latencyMs: number;
  /** Error message if failed */
  error?: string;
  /** Whether this was a timeout failure */
  timedOut?: boolean;
}

/**
 * Result of a successful fallback chain summarization.
 */
export interface SummaryFallbackResult {
  /** The generated summary text */
  summary: string;
  /** Model that successfully generated the summary */
  model: string;
  /** Number of total attempts across all models */
  attempts: number;
  /** Total time spent including all attempts */
  latencyMs: number;
  /** Detailed record of all attempts */
  attemptHistory: FallbackAttempt[];
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 1000;

// ============================================================================
// FallbackChain
// ============================================================================

/**
 * Multi-model fallback chain for resilient summarization.
 *
 * Tries models in order, automatically falling back to the next model
 * when one fails. Supports per-model timeouts, retries, and detailed
 * attempt tracking for observability.
 *
 * @example
 * ```typescript
 * const chain = new FallbackChain({
 *   models: [
 *     { model: 'gpt-4o', timeout: 30000, maxRetries: 2 },
 *     { model: 'claude-3-haiku', timeout: 20000 },
 *   ],
 *   createClient: (model) => myLLMFactory(model),
 *   onFallback: (from, to) => console.log(`Falling back from ${from} to ${to}`),
 * });
 *
 * try {
 *   const result = await chain.summarize(messages, prompt);
 *   console.log(`Success with ${result.model} after ${result.attempts} attempts`);
 * } catch (err) {
 *   if (CompactionError.isCompactionError(err) && err.code === 'ALL_MODELS_FAILED') {
 *     console.error('All models failed:', err.context?.attemptedModels);
 *   }
 * }
 * ```
 */
export class FallbackChain {
  private readonly models: FallbackModelConfig[];
  private readonly createClient: ModelClientFactory;
  private readonly onAttemptFailed?: (model: string, attempt: number, error: Error) => void;
  private readonly onFallback?: (fromModel: string, toModel: string) => void;

  constructor(options: FallbackChainOptions) {
    if (options.models.length === 0) {
      throw new Error("FallbackChain requires at least one model configuration");
    }
    this.models = options.models;
    this.createClient = options.createClient;
    this.onAttemptFailed = options.onAttemptFailed;
    this.onFallback = options.onFallback;
  }

  /**
   * Get the list of configured model names.
   */
  getModels(): string[] {
    return this.models.map((m) => m.model);
  }

  /**
   * Get the primary (first) model in the chain.
   */
  getPrimaryModel(): string {
    // Safe - constructor validates models.length > 0
    // biome-ignore lint/style/noNonNullAssertion: constructor ensures at least one model
    return this.models[0]!.model;
  }

  /**
   * Summarize messages using the fallback chain.
   *
   * Tries each model in order. For each model, respects maxRetries
   * before moving to the next. Tracks all attempts for observability.
   *
   * @param messages - Messages to summarize
   * @param prompt - Summarization prompt
   * @returns SummaryFallbackResult with summary and metadata
   * @throws CompactionError with code ALL_MODELS_FAILED if all models fail
   */
  async summarize(messages: ContextMessage[], prompt: string): Promise<SummaryFallbackResult> {
    const attemptHistory: FallbackAttempt[] = [];
    const startTime = Date.now();
    let totalAttempts = 0;

    for (let modelIndex = 0; modelIndex < this.models.length; modelIndex++) {
      const modelConfig = this.models[modelIndex] as FallbackModelConfig;
      const {
        model,
        timeout = DEFAULT_TIMEOUT_MS,
        maxRetries = DEFAULT_MAX_RETRIES,
        retryDelayMs = DEFAULT_RETRY_DELAY_MS,
      } = modelConfig;

      // Notify fallback callback if moving from a previous model
      if (modelIndex > 0 && this.onFallback) {
        // biome-ignore lint/style/noNonNullAssertion: modelIndex > 0 guarantees element exists
        const previousModel = this.models[modelIndex - 1]!.model;
        this.onFallback(previousModel, model);
      }

      // Try this model with retries
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        totalAttempts++;
        const attemptStart = Date.now();

        try {
          const summary = await this.attemptSummarize(model, messages, prompt, timeout);
          const attemptLatency = Date.now() - attemptStart;

          attemptHistory.push({
            model,
            attempt,
            success: true,
            latencyMs: attemptLatency,
          });

          return {
            summary,
            model,
            attempts: totalAttempts,
            latencyMs: Date.now() - startTime,
            attemptHistory,
          };
        } catch (error) {
          const attemptLatency = Date.now() - attemptStart;
          const err = error instanceof Error ? error : new Error(String(error));
          const timedOut = err.name === "TimeoutError" || err.message.includes("timeout");

          attemptHistory.push({
            model,
            attempt,
            success: false,
            latencyMs: attemptLatency,
            error: err.message,
            timedOut,
          });

          // Notify attempt failed callback
          if (this.onAttemptFailed) {
            this.onAttemptFailed(model, attempt, err);
          }

          // If more retries available for this model, wait and retry
          if (attempt < maxRetries) {
            await this.sleep(retryDelayMs * attempt); // Progressive backoff
          }
        }
      }
    }

    // All models exhausted
    const totalLatency = Date.now() - startTime;
    const attemptedModels = this.models.map((m) => m.model);

    throw CompactionError.allModelsFailed(
      `All ${attemptedModels.length} summary models failed after ${totalAttempts} total attempts`,
      {
        context: {
          attemptedModels,
          totalAttempts,
          totalLatencyMs: totalLatency,
          attemptHistory,
        },
      }
    );
  }

  /**
   * Attempt a single summarization with timeout.
   */
  private async attemptSummarize(
    model: string,
    messages: ContextMessage[],
    prompt: string,
    timeoutMs: number
  ): Promise<string> {
    const client = this.createClient(model);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Race between summarization and timeout
      const result = await Promise.race([
        client.summarize(messages, prompt),
        this.createTimeoutPromise(timeoutMs, controller.signal),
      ]);
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Create a promise that rejects after timeout.
   */
  private createTimeoutPromise(ms: number, signal: AbortSignal): Promise<never> {
    return new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        const error = new Error(`Summarization timed out after ${ms}ms`);
        error.name = "TimeoutError";
        reject(error);
      }, ms);

      signal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        const error = new Error(`Summarization timed out after ${ms}ms`);
        error.name = "TimeoutError";
        reject(error);
      });
    });
  }

  /**
   * Sleep for a duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a FallbackChain with simplified configuration.
 *
 * @param models - Array of model configurations
 * @param createClient - Factory to create LLM clients
 * @returns Configured FallbackChain instance
 *
 * @example
 * ```typescript
 * const chain = createFallbackChain(
 *   [
 *     { model: 'gpt-4o' },
 *     { model: 'claude-3-haiku' },
 *   ],
 *   (model) => myLLMFactory(model)
 * );
 * ```
 */
export function createFallbackChain(
  models: FallbackModelConfig[],
  createClient: ModelClientFactory
): FallbackChain {
  return new FallbackChain({ models, createClient });
}
