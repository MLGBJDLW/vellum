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
  getProviderModels,
  hasModels,
  MODEL_CATALOG,
} from "./catalog.js";
// Provider model exports (for backward compatibility)
export {
  ANTHROPIC_MODELS,
  BAICHUAN_MODELS,
  COPILOT_MODELS,
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
  inputPrice: 1.0,
  outputPrice: 3.0,
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
  const exactMatch = providerModels.find((m) => m.id === modelId);
  if (exactMatch) {
    return exactMatch;
  }

  // Try partial match
  const partialMatch = providerModels.find(
    (m) => modelId.startsWith(m.id) || m.id.startsWith(modelId)
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
): number {
  const info = getModelInfo(provider, modelId);
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
