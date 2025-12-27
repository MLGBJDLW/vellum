/**
 * Structured logging for LLM provider requests.
 *
 * @module logger/llm-logger
 */

import { serializeError } from "./decorators.js";
import type { Logger } from "./logger.js";

/**
 * Structured log data for LLM requests.
 */
export interface LLMRequestLog {
  /** LLM provider name (e.g., 'openai', 'anthropic') */
  provider: string;
  /** Model identifier (e.g., 'gpt-4', 'claude-3-opus') */
  model: string;
  /** Unique request identifier for correlation */
  requestId: string;
  /** Number of input tokens (if available) */
  inputTokens?: number;
  /** Number of output tokens (if available) */
  outputTokens?: number;
  /** Request duration in milliseconds */
  durationMs?: number;
}

/**
 * Logger specialized for structured LLM request logging.
 * Provides consistent log format across all LLM provider interactions.
 *
 * @example
 * ```typescript
 * const llmLogger = new LLMLogger(logger);
 *
 * const requestId = crypto.randomUUID();
 * llmLogger.logRequestStart('openai', 'gpt-4', requestId);
 *
 * try {
 *   const result = await llm.complete(prompt);
 *   llmLogger.logRequestComplete({
 *     provider: 'openai',
 *     model: 'gpt-4',
 *     requestId,
 *     inputTokens: result.usage.prompt_tokens,
 *     outputTokens: result.usage.completion_tokens,
 *     durationMs: timer.stop()
 *   });
 * } catch (error) {
 *   llmLogger.logRequestError({
 *     provider: 'openai',
 *     model: 'gpt-4',
 *     requestId,
 *     durationMs: timer.stop(),
 *     error
 *   });
 * }
 * ```
 */
export class LLMLogger {
  /**
   * Create a new LLM logger.
   * @param logger - The underlying logger instance
   */
  constructor(private logger: Logger) {}

  /**
   * Log the start of an LLM request.
   * @param provider - LLM provider name
   * @param model - Model identifier
   * @param requestId - Unique request ID
   */
  logRequestStart(provider: string, model: string, requestId: string): void {
    this.logger.info("LLM request started", {
      event: "llm.request.start",
      provider,
      model,
      requestId,
    });
  }

  /**
   * Log successful completion of an LLM request.
   * @param log - Request completion details
   */
  logRequestComplete(log: LLMRequestLog): void {
    const { provider, model, requestId, inputTokens, outputTokens, durationMs } = log;

    this.logger.info("LLM request completed", {
      event: "llm.request.complete",
      provider,
      model,
      requestId,
      inputTokens,
      outputTokens,
      durationMs,
      totalTokens:
        inputTokens !== undefined && outputTokens !== undefined
          ? inputTokens + outputTokens
          : undefined,
    });
  }

  /**
   * Log a failed LLM request.
   * @param log - Request details with error information
   */
  logRequestError(log: LLMRequestLog & { error: unknown }): void {
    const { provider, model, requestId, durationMs, error } = log;

    this.logger.error("LLM request failed", {
      event: "llm.request.error",
      provider,
      model,
      requestId,
      durationMs,
      error: serializeError(error),
    });
  }
}
