/**
 * Token Usage Types
 *
 * Shared token usage interface to avoid circular dependencies
 * between @vellum/core and @vellum/provider.
 *
 * @module @vellum/shared/types/token
 */

/**
 * Token usage statistics for LLM interactions
 *
 * @description Represents the token consumption from a single LLM API call.
 * All modern LLM providers report token usage for billing and monitoring purposes.
 *
 * @example
 * ```typescript
 * const usage: TokenUsage = {
 *   inputTokens: 150,
 *   outputTokens: 250,
 *   thinkingTokens: 500,
 * };
 * console.log(`Total: ${usage.inputTokens + usage.outputTokens} tokens`);
 * ```
 */
export interface TokenUsage {
  /** Number of tokens in the input/prompt */
  inputTokens: number;
  /** Number of tokens in the output/completion */
  outputTokens: number;
  /** Number of tokens used for thinking/reasoning (if applicable) */
  thinkingTokens?: number;
  /** Number of tokens in cached input (if applicable) */
  cacheReadTokens?: number;
  /** Number of tokens written to cache (if applicable) */
  cacheWriteTokens?: number;
}
