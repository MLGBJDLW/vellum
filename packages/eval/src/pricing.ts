/**
 * Model pricing for cost estimation
 * Prices are per 1M tokens
 * @module @vellum/eval
 */

import type { TokenUsage } from "@vellum/shared";

export interface ModelPricing {
  inputPrice: number; // $/1M input tokens
  outputPrice: number; // $/1M output tokens
  cacheReadPrice?: number; // $/1M cache read tokens
  cacheWritePrice?: number; // $/1M cache write tokens
}

/**
 * Pricing table for supported models
 * Prices as of January 2026
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic Claude 4 models
  "claude-sonnet-4-20250514": {
    inputPrice: 3.0,
    outputPrice: 15.0,
    cacheReadPrice: 0.3,
    cacheWritePrice: 3.75,
  },
  "claude-opus-4-20250514": {
    inputPrice: 15.0,
    outputPrice: 75.0,
    cacheReadPrice: 1.5,
    cacheWritePrice: 18.75,
  },
  // OpenAI GPT-4o models
  "gpt-4o": {
    inputPrice: 2.5,
    outputPrice: 10.0,
  },
  "gpt-4o-mini": {
    inputPrice: 0.15,
    outputPrice: 0.6,
  },
  // Google Gemini models
  "gemini-2.0-flash": {
    inputPrice: 0.1,
    outputPrice: 0.4,
  },
  "gemini-2.0-pro": {
    inputPrice: 1.25,
    outputPrice: 5.0,
  },
  // Anthropic Claude 3.5 models (legacy)
  "claude-3-5-sonnet-20241022": {
    inputPrice: 3.0,
    outputPrice: 15.0,
    cacheReadPrice: 0.3,
    cacheWritePrice: 3.75,
  },
};

/**
 * Calculate estimated cost from token usage
 * @param usage - Token usage from provider
 * @param model - Model identifier
 * @returns Estimated cost in USD
 */
export function calculateCost(usage: TokenUsage, model: string): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    // Unknown model, return 0
    return 0;
  }

  let cost = 0;

  // Input tokens
  cost += (usage.inputTokens / 1_000_000) * pricing.inputPrice;

  // Output tokens
  cost += (usage.outputTokens / 1_000_000) * pricing.outputPrice;

  // Cache read tokens (if applicable)
  if (usage.cacheReadTokens && pricing.cacheReadPrice) {
    cost += (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPrice;
  }

  // Cache write tokens (if applicable)
  if (usage.cacheWriteTokens && pricing.cacheWritePrice) {
    cost += (usage.cacheWriteTokens / 1_000_000) * pricing.cacheWritePrice;
  }

  return cost;
}

/**
 * Get pricing for a model, with fallback
 * @param model - Model identifier
 * @returns Pricing info or undefined if not found
 */
export function getModelPricing(model: string): ModelPricing | undefined {
  return MODEL_PRICING[model];
}

/**
 * Check if a model has known pricing
 * @param model - Model identifier
 */
export function hasKnownPricing(model: string): boolean {
  return model in MODEL_PRICING;
}

/**
 * Aggregate token usage from multiple results
 * @param usages - Array of TokenUsage objects
 * @returns Combined TokenUsage
 */
export function aggregateTokenUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (acc, usage) => ({
      inputTokens: acc.inputTokens + usage.inputTokens,
      outputTokens: acc.outputTokens + usage.outputTokens,
      cacheReadTokens: (acc.cacheReadTokens ?? 0) + (usage.cacheReadTokens ?? 0),
      cacheWriteTokens: (acc.cacheWriteTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }
  );
}

/**
 * Create empty token usage object
 */
export function emptyTokenUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}
