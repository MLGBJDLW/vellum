import type { TokenUsage } from "./types.js";

/** Total prompt occupancy. Anthropic reports cache reads/writes outside input_tokens;
 * OpenAI-compatible and Google APIs include cache hits in their prompt count.
 */
export function getUsageInputTokens(provider: string, usage: TokenUsage): number {
  return (
    usage.inputTokens +
    (provider === "anthropic" ? (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0) : 0)
  );
}

/** Total generated tokens, including reasoning counted separately by Google. */
export function getUsageOutputTokens(provider: string, usage: TokenUsage): number {
  return usage.outputTokens + (provider === "google" ? (usage.thinkingTokens ?? 0) : 0);
}
