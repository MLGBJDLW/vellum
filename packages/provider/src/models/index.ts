/**
 * Model metadata module - Single Source of Truth for model information
 * @module models
 */

import type { ProviderType } from "../types.js";
import { getBundledModelMetadata, MODEL_CATALOG } from "./catalog.js";
import type { ModelInfo } from "./types.js";

// Catalog
export {
  ALL_MODELS,
  DEFAULT_MODEL_IDS,
  getDefaultModelId,
  getModelReplacement,
  getProviderModels,
  hasModels,
  isRetiredModel,
  MODEL_CATALOG,
} from "./catalog.js";
export { normalizeDiscoveredModels, updateDiscoveredModels } from "./discovery.js";
// Provider model exports (for backward compatibility)
export {
  ANTHROPIC_MODELS,
  BAICHUAN_MODELS,
  DEEPSEEK_MODELS,
  GOOGLE_MODELS,
  GROQ_MODELS,
  LMSTUDIO_MODELS,
  MISTRAL_MODELS,
  MOONSHOT_MODELS,
  OLLAMA_MODELS,
  OPENAI_MODELS,
  OPENROUTER_MODELS,
  QWEN_MODELS,
  XAI_MODELS,
  YI_MODELS,
  ZHIPU_MODELS,
} from "./providers/index.js";
// Registry
export { ModelRegistry, modelRegistry } from "./registry.js";
// Types and schemas
export {
  type ModelDefinitions,
  type ModelInfo,
  type ModelLookupOptions,
  modelInfoSchema,
  type PartialModelInfo,
  type PricingTier,
  type ProviderCatalog,
  partialModelInfoSchema,
  pricingTierSchema,
  type ReasoningEffort,
  reasoningEffortSchema,
  type ServiceTier,
  safeValidateModelInfo,
  serviceTierSchema,
  validateModelInfo,
} from "./types.js";

// =============================================================================
// Utility Functions (for CLI compatibility)
// =============================================================================

/**
 * Provider aliases mapping alternative names to canonical names.
 */
const PROVIDER_ALIASES: Record<string, string> = {
  gemini: "google",
  "vertex-ai": "google",
  "azure-openai": "openai",
};

/**
 * Default model info when model is not found
 */
const DEFAULT_MODEL_INFO: ModelInfo = {
  id: "unknown",
  name: "Unknown Model",
  provider: "openai", // Default provider
  contextWindow: 128000, // Reasonable default
  contextWindowKnown: false,
  maxOutputTokens: 8192,
  supportsVision: false,
  supportsReasoning: false,
  supportsStreaming: true,
  supportsPromptCache: false,
  deprecated: false,
};

/**
 * Get model info by provider and model ID.
 *
 * @param provider - Provider type (e.g., "anthropic", "openai")
 * @param modelId - Model identifier (e.g., "gpt-4o", "claude-sonnet-4-20250514")
 * @returns Model info, or default if not found
 */
export function getModelInfo(provider: string, modelId: string): ModelInfo {
  return (
    findModelInfo(provider, modelId) ?? {
      ...DEFAULT_MODEL_INFO,
      id: modelId,
      provider: canonicalProviderType(provider),
    }
  );
}

function canonicalProviderType(provider: string): ProviderType {
  const normalized = provider.toLowerCase();
  return (PROVIDER_ALIASES[normalized] ?? normalized) as ProviderType;
}

/** Look up wire capabilities without synthesizing limits for an unknown model. */
export function findModelInfo(provider: string, modelId: string): ModelInfo | undefined {
  const canonicalProvider = canonicalProviderType(provider);
  const providerModels = MODEL_CATALOG.get(canonicalProvider);

  if (!providerModels) return undefined;

  // Live metadata wins. A saved or manual ID may be absent from this account's list.
  const bundled = getBundledModelMetadata(canonicalProvider);
  const matchesId = (model: ModelInfo) => model.id === modelId || model.aliases?.includes(modelId);
  const exactMatch =
    providerModels.find(matchesId) ?? (providerModels !== bundled && bundled.find(matchesId));
  if (exactMatch) {
    return exactMatch;
  }

  // Allow dated snapshots of a known model, never arbitrary prefix matches
  // (e.g. "gpt-6" must not borrow the capabilities of "gpt-6.1-sol").
  const isSnapshot = (model: ModelInfo) =>
    modelId.startsWith(`${model.id}-`) &&
    /^\d{4}-?\d{2}-?\d{2}$/.test(modelId.slice(model.id.length + 1));
  const partialMatch =
    providerModels.find(isSnapshot) ?? (providerModels !== bundled && bundled.find(isSnapshot));
  return partialMatch ? { ...partialMatch, id: modelId } : undefined;
}

/**
 * Get context window size for a model.
 */
export function getContextWindow(provider: string, modelId: string): number {
  return getModelInfo(provider, modelId).contextWindow;
}

/** Select the inclusive prompt-size tier for a Standard request. */
export function getContextPricingTier<T extends { name?: string; contextWindow: number }>(
  tiers: readonly T[] | undefined,
  inputTokens: number
): T | undefined {
  let lastTier: T | undefined;
  for (const tier of tiers ?? []) {
    if (tier.name === "flex" || tier.name === "priority") continue;
    if (inputTokens <= tier.contextWindow) return tier;
    lastTier = tier;
  }
  return lastTier;
}

/**
 * Calculate estimated cost for token usage.
 */
export function calculateCost(
  provider: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number | undefined {
  const info = getModelInfo(provider, modelId);
  if (info.inputPrice === undefined || info.outputPrice === undefined) return undefined;
  const tier = getContextPricingTier(info.tiers, inputTokens);
  const inputCost = (inputTokens / 1_000_000) * (tier?.inputPrice ?? info.inputPrice);
  const outputCost = (outputTokens / 1_000_000) * (tier?.outputPrice ?? info.outputPrice);
  return inputCost + outputCost;
}

/**
 * Get all supported providers.
 */
export function getSupportedProviders(): string[] {
  return Array.from(MODEL_CATALOG.keys());
}
