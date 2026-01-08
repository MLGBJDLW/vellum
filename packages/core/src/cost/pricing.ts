/**
 * Pricing Data (Phase 35)
 *
 * Model pricing data for various LLM providers.
 * All prices are in USD per million tokens.
 *
 * @module @vellum/core/cost
 * @see REQ-COST-002 - Pricing data management
 */

import type { ModelPricing } from "./types.js";

// =============================================================================
// Pricing Table
// =============================================================================

/**
 * Model pricing table.
 * All prices are in USD per million tokens.
 *
 * @updated 2026-01-04 - Current pricing data
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ==========================================================================
  // Anthropic Claude Models
  // ==========================================================================
  "claude-sonnet-4-20250514": {
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    cacheReadPricePerMillion: 0.3,
    cacheWritePricePerMillion: 3.75,
    reasoningPricePerMillion: 15.0,
    tiers: [
      { contextWindow: 200_000, inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 },
      { contextWindow: Infinity, inputPricePerMillion: 6.0, outputPricePerMillion: 22.5 },
    ],
    effectiveDate: "2025-05-14",
  },
  "claude-3-5-sonnet-20241022": {
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    cacheReadPricePerMillion: 0.3,
    cacheWritePricePerMillion: 3.75,
    effectiveDate: "2024-10-22",
  },
  "claude-3-5-haiku-20241022": {
    inputPricePerMillion: 0.8,
    outputPricePerMillion: 4.0,
    cacheReadPricePerMillion: 0.08,
    cacheWritePricePerMillion: 1.0,
    effectiveDate: "2024-10-22",
  },
  "claude-3-opus-20240229": {
    inputPricePerMillion: 15.0,
    outputPricePerMillion: 75.0,
    cacheReadPricePerMillion: 1.5,
    cacheWritePricePerMillion: 18.75,
    effectiveDate: "2024-02-29",
  },

  // ==========================================================================
  // OpenAI GPT Models
  // ==========================================================================
  "gpt-4o": {
    inputPricePerMillion: 2.5,
    outputPricePerMillion: 10.0,
    cacheReadPricePerMillion: 1.25,
    effectiveDate: "2024-11-01",
  },
  "gpt-4o-mini": {
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
    cacheReadPricePerMillion: 0.075,
    effectiveDate: "2024-07-18",
  },
  "gpt-4-turbo": {
    inputPricePerMillion: 10.0,
    outputPricePerMillion: 30.0,
    effectiveDate: "2024-04-09",
  },
  "gpt-4": {
    inputPricePerMillion: 30.0,
    outputPricePerMillion: 60.0,
    effectiveDate: "2023-03-14",
  },
  "gpt-3.5-turbo": {
    inputPricePerMillion: 0.5,
    outputPricePerMillion: 1.5,
    effectiveDate: "2023-06-13",
  },
  o1: {
    inputPricePerMillion: 15.0,
    outputPricePerMillion: 60.0,
    cacheReadPricePerMillion: 7.5,
    reasoningPricePerMillion: 60.0,
    effectiveDate: "2024-12-17",
  },
  "o1-mini": {
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 12.0,
    cacheReadPricePerMillion: 1.5,
    reasoningPricePerMillion: 12.0,
    effectiveDate: "2024-09-12",
  },

  // ==========================================================================
  // Google Gemini Models
  // ==========================================================================
  "gemini-2.0-flash": {
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.4,
    effectiveDate: "2025-02-01",
  },
  "gemini-1.5-pro": {
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5.0,
    tiers: [
      { contextWindow: 128_000, inputPricePerMillion: 1.25, outputPricePerMillion: 5.0 },
      { contextWindow: Infinity, inputPricePerMillion: 2.5, outputPricePerMillion: 10.0 },
    ],
    effectiveDate: "2024-05-01",
  },
  "gemini-1.5-flash": {
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.3,
    tiers: [
      { contextWindow: 128_000, inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },
      { contextWindow: Infinity, inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    ],
    effectiveDate: "2024-05-01",
  },

  // ==========================================================================
  // DeepSeek Models
  // ==========================================================================
  "deepseek-chat": {
    inputPricePerMillion: 0.14,
    outputPricePerMillion: 0.28,
    cacheReadPricePerMillion: 0.014,
    effectiveDate: "2025-01-01",
  },
  "deepseek-reasoner": {
    inputPricePerMillion: 0.55,
    outputPricePerMillion: 2.19,
    cacheReadPricePerMillion: 0.055,
    reasoningPricePerMillion: 2.19,
    effectiveDate: "2025-01-01",
  },

  // ==========================================================================
  // Groq Models (Hosted open source)
  // ==========================================================================
  "llama-3.1-70b-versatile": {
    inputPricePerMillion: 0.59,
    outputPricePerMillion: 0.79,
    effectiveDate: "2024-07-01",
  },
  "llama-3.1-8b-instant": {
    inputPricePerMillion: 0.05,
    outputPricePerMillion: 0.08,
    effectiveDate: "2024-07-01",
  },
  "mixtral-8x7b-32768": {
    inputPricePerMillion: 0.24,
    outputPricePerMillion: 0.24,
    effectiveDate: "2024-01-01",
  },

  // ==========================================================================
  // xAI Grok Models
  // ==========================================================================
  "grok-2": {
    inputPricePerMillion: 5.0,
    outputPricePerMillion: 10.0,
    effectiveDate: "2024-08-01",
  },
  "grok-2-mini": {
    inputPricePerMillion: 2.0,
    outputPricePerMillion: 4.0,
    effectiveDate: "2024-08-01",
  },

  // ==========================================================================
  // Mistral Models
  // ==========================================================================
  "mistral-large-latest": {
    inputPricePerMillion: 2.0,
    outputPricePerMillion: 6.0,
    effectiveDate: "2024-02-01",
  },
  "mistral-small-latest": {
    inputPricePerMillion: 0.2,
    outputPricePerMillion: 0.6,
    effectiveDate: "2024-02-01",
  },
};

// =============================================================================
// Pricing Lookup Functions
// =============================================================================

/**
 * Get pricing for a specific model.
 *
 * @param model - Model identifier
 * @returns Model pricing or undefined if not found
 *
 * @example
 * ```typescript
 * const pricing = getPricing('claude-3-5-sonnet-20241022');
 * if (pricing) {
 *   console.log(`Input: $${pricing.inputPricePerMillion}/M tokens`);
 * }
 * ```
 */
export function getPricing(model: string): ModelPricing | undefined {
  // Direct lookup
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }

  // Try to find by prefix match (for versioned models)
  const modelLower = model.toLowerCase();
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (modelLower.startsWith(key.toLowerCase())) {
      return pricing;
    }
    if (key.toLowerCase().startsWith(modelLower)) {
      return pricing;
    }
  }

  return undefined;
}

/**
 * Check if pricing data exists for a model.
 *
 * @param model - Model identifier
 * @returns true if pricing data is available
 */
export function hasPricing(model: string): boolean {
  return getPricing(model) !== undefined;
}

/**
 * Get all supported model names.
 *
 * @returns Array of model names with pricing data
 */
export function getSupportedModels(): string[] {
  return Object.keys(MODEL_PRICING);
}

/**
 * Get the appropriate tier pricing based on context size.
 *
 * @param pricing - Model pricing data
 * @param contextTokens - Current context size
 * @returns Input and output prices for the applicable tier
 */
export function getTieredPricing(
  pricing: ModelPricing,
  contextTokens: number
): { inputPrice: number; outputPrice: number } {
  if (!pricing.tiers || pricing.tiers.length === 0) {
    return {
      inputPrice: pricing.inputPricePerMillion,
      outputPrice: pricing.outputPricePerMillion,
    };
  }

  // Find the applicable tier
  for (const tier of pricing.tiers) {
    if (contextTokens <= tier.contextWindow) {
      return {
        inputPrice: tier.inputPricePerMillion,
        outputPrice: tier.outputPricePerMillion,
      };
    }
  }

  // If beyond all tiers, use the last tier (guaranteed to exist since we checked length > 0)
  const lastTier = pricing.tiers[pricing.tiers.length - 1]!;
  return {
    inputPrice: lastTier.inputPricePerMillion,
    outputPrice: lastTier.outputPricePerMillion,
  };
}
