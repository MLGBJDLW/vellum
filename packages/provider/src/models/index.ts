/**
 * Model metadata module - Single Source of Truth for model information
 * @module models
 */

import type { ProviderType } from "../types.js";
import { MODEL_CATALOG } from "./catalog.js";
import type { ModelInfo } from "./types.js";

// Catalog
export {
  ALL_MODELS,
  DEFAULT_MODEL_IDS,
  getDefaultModelId,
  getModelReplacement,
  getProviderModels,
  hasModels,
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
  maxOutputTokens: 8192,
  supportsTools: true,
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
  // Resolve provider alias
  const normalizedProvider = provider.toLowerCase();
  const canonicalProvider = (PROVIDER_ALIASES[normalizedProvider] ??
    normalizedProvider) as ProviderType;
  const providerModels = MODEL_CATALOG.get(canonicalProvider);

  if (!providerModels) {
    return { ...DEFAULT_MODEL_INFO, id: modelId, provider: canonicalProvider };
  }

  // Try exact match
  const exactMatch = providerModels.find((m) => m.id === modelId || m.aliases?.includes(modelId));
  if (exactMatch) {
    return exactMatch;
  }

  // Allow dated snapshots of a known model, never arbitrary prefix matches
  // (e.g. "gpt-6" must not borrow the capabilities of "gpt-6.1-sol").
  const partialMatch = providerModels.find(
    (m) =>
      modelId.startsWith(`${m.id}-`) && /^\d{4}-?\d{2}-?\d{2}$/.test(modelId.slice(m.id.length + 1))
  );
  if (partialMatch) {
    return { ...partialMatch, id: modelId };
  }

  return { ...DEFAULT_MODEL_INFO, id: modelId, provider: canonicalProvider };
}

/**
 * Get context window size for a model.
 */
export function getContextWindow(provider: string, modelId: string): number {
  return getModelInfo(provider, modelId).contextWindow;
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
  const inputCost = (inputTokens / 1_000_000) * info.inputPrice;
  const outputCost = (outputTokens / 1_000_000) * info.outputPrice;
  return inputCost + outputCost;
}

/**
 * Get all supported providers.
 */
export function getSupportedProviders(): string[] {
  return Array.from(MODEL_CATALOG.keys());
}
