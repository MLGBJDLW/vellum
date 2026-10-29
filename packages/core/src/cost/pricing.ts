/**
 * Pricing Data (Phase 35)
 *
 * Model pricing data for various LLM providers.
 * All prices are in USD per million tokens.
 *
 * @module @vellum/core/cost
 * @see REQ-COST-002 - Pricing data management
 */

import { MODEL_CATALOG, type ModelInfo, type ProviderType } from "@vellum/provider";
import type { ModelPricing } from "./types.js";

// =============================================================================
// Pricing Table
// =============================================================================

/**
 * Historical exact-ID rates for reading sessions whose models have left the catalog.
 * Current catalog entries always take precedence, including entries with unknown prices.
 * Do not add current models here; their pricing belongs to the provider catalog.
 */
const LEGACY_MODEL_PRICING: Record<string, ModelPricing & { provider: ProviderType }> = {
  "claude-sonnet-4-20250514": {
    provider: "anthropic",
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
    provider: "anthropic",
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    cacheReadPricePerMillion: 0.3,
    cacheWritePricePerMillion: 3.75,
    effectiveDate: "2024-10-22",
  },
  "claude-3-5-haiku-20241022": {
    provider: "anthropic",
    inputPricePerMillion: 0.8,
    outputPricePerMillion: 4.0,
    cacheReadPricePerMillion: 0.08,
    cacheWritePricePerMillion: 1.0,
    effectiveDate: "2024-10-22",
  },
  "claude-3-opus-20240229": {
    provider: "anthropic",
    inputPricePerMillion: 15.0,
    outputPricePerMillion: 75.0,
    cacheReadPricePerMillion: 1.5,
    cacheWritePricePerMillion: 18.75,
    effectiveDate: "2024-02-29",
  },

  "gemini-3.1-flash-preview": {
    provider: "google",
    inputPricePerMillion: 0.5,
    outputPricePerMillion: 3.0,
    effectiveDate: "2026-03-01",
  },
  "gemini-3.1-flash-lite-preview": {
    provider: "google",
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.5,
    effectiveDate: "2026-03-01",
  },

  "gpt-4-turbo": {
    provider: "openai",
    inputPricePerMillion: 10.0,
    outputPricePerMillion: 30.0,
    effectiveDate: "2024-04-09",
  },
  "gpt-4": {
    provider: "openai",
    inputPricePerMillion: 30.0,
    outputPricePerMillion: 60.0,
    effectiveDate: "2023-03-14",
  },
  "gpt-3.5-turbo": {
    provider: "openai",
    inputPricePerMillion: 0.5,
    outputPricePerMillion: 1.5,
    effectiveDate: "2023-06-13",
  },
  o1: {
    provider: "openai",
    inputPricePerMillion: 15.0,
    outputPricePerMillion: 60.0,
    cacheReadPricePerMillion: 7.5,
    reasoningPricePerMillion: 60.0,
    effectiveDate: "2024-12-17",
  },
  "o1-mini": {
    provider: "openai",
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 12.0,
    cacheReadPricePerMillion: 1.5,
    reasoningPricePerMillion: 12.0,
    effectiveDate: "2024-09-12",
  },

  "gemini-2.0-flash": {
    provider: "google",
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.4,
    effectiveDate: "2025-02-01",
  },
  "gemini-1.5-pro": {
    provider: "google",
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5.0,
    tiers: [
      { contextWindow: 128_000, inputPricePerMillion: 1.25, outputPricePerMillion: 5.0 },
      { contextWindow: Infinity, inputPricePerMillion: 2.5, outputPricePerMillion: 10.0 },
    ],
    effectiveDate: "2024-05-01",
  },
  "gemini-1.5-flash": {
    provider: "google",
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.3,
    tiers: [
      { contextWindow: 128_000, inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },
      { contextWindow: Infinity, inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    ],
    effectiveDate: "2024-05-01",
  },

  "deepseek-chat": {
    provider: "deepseek",
    inputPricePerMillion: 0.14,
    outputPricePerMillion: 0.28,
    cacheReadPricePerMillion: 0.014,
    effectiveDate: "2025-01-01",
  },
  "deepseek-reasoner": {
    provider: "deepseek",
    inputPricePerMillion: 0.55,
    outputPricePerMillion: 2.19,
    cacheReadPricePerMillion: 0.055,
    reasoningPricePerMillion: 2.19,
    effectiveDate: "2025-01-01",
  },

  "llama-3.1-70b-versatile": {
    provider: "groq",
    inputPricePerMillion: 0.59,
    outputPricePerMillion: 0.79,
    effectiveDate: "2024-07-01",
  },
  "mixtral-8x7b-32768": {
    provider: "groq",
    inputPricePerMillion: 0.24,
    outputPricePerMillion: 0.24,
    effectiveDate: "2024-01-01",
  },

  "grok-2": {
    provider: "xai",
    inputPricePerMillion: 5.0,
    outputPricePerMillion: 10.0,
    effectiveDate: "2024-08-01",
  },
  "grok-2-mini": {
    provider: "xai",
    inputPricePerMillion: 2.0,
    outputPricePerMillion: 4.0,
    effectiveDate: "2024-08-01",
  },

  "mistral-large-latest": {
    provider: "mistral",
    inputPricePerMillion: 2.0,
    outputPricePerMillion: 6.0,
    effectiveDate: "2024-02-01",
  },
  "mistral-small-latest": {
    provider: "mistral",
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
export function getPricing(model: string, provider?: string): ModelPricing | undefined {
  const matches = Array.from(MODEL_CATALOG.values())
    .flat()
    .filter(
      (entry) =>
        (provider === undefined || entry.provider === provider) &&
        (entry.id === model || entry.aliases?.includes(model))
    );

  // Provider-less compatibility calls must not guess between identically named routes.
  if (matches.length > 1) return undefined;
  if (matches[0]) return toPricing(matches[0]);

  const historical = LEGACY_MODEL_PRICING[model];
  if (historical && (provider === undefined || historical.provider === provider)) {
    return historical;
  }
  return undefined;
}

function toPricing(model: ModelInfo): ModelPricing | undefined {
  if (model.inputPrice === undefined || model.outputPrice === undefined) return undefined;
  return {
    inputPricePerMillion: model.inputPrice,
    outputPricePerMillion: model.outputPrice,
    cacheReadPricePerMillion: model.cacheReadsPrice,
    cacheWritePricePerMillion: model.cacheWritesPrice,
    // Service-tier alternatives are not context thresholds for the default request.
    tiers: model.tiers
      ?.filter((tier) => tier.name !== "flex" && tier.name !== "priority")
      .map((tier) => ({
        contextWindow: tier.contextWindow,
        inputPricePerMillion: tier.inputPrice,
        outputPricePerMillion: tier.outputPrice,
      })),
  };
}

/** Whether exact provider/model pricing is known. */
export function hasPricing(model: string, provider?: string): boolean {
  return getPricing(model, provider) !== undefined;
}

/** Models with unambiguous known pricing, including exact historical IDs. */
export function getSupportedModels(): string[] {
  return Array.from(
    new Set([
      ...Object.keys(LEGACY_MODEL_PRICING),
      ...Array.from(MODEL_CATALOG.values()).flatMap((models) => models.map((model) => model.id)),
    ])
  ).filter((model) => hasPricing(model));
}

/**
 * Compatibility snapshot derived from the canonical catalog and historical records.
 * Use getPricing(model, provider) for runtime lookup so explicit discovery is reflected.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = Object.fromEntries(
  getSupportedModels().map((model) => [model, getPricing(model) as ModelPricing])
);

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
  const lastTier = pricing.tiers[pricing.tiers.length - 1] as (typeof pricing.tiers)[number];
  return {
    inputPrice: lastTier.inputPricePerMillion,
    outputPrice: lastTier.outputPricePerMillion,
  };
}
