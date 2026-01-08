/**
 * Model Information Utility
 *
 * Provides model metadata lookup for context window sizes and pricing.
 * Used by StatusBar components to display accurate token limits and costs.
 *
 * @module cli/utils/model-info
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Model metadata for display and calculations
 */
export interface ModelMetadata {
  /** Model identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Price per million input tokens (USD) */
  inputPricePer1M: number;
  /** Price per million output tokens (USD) */
  outputPricePer1M: number;
}

// =============================================================================
// Model Catalog
// =============================================================================

/**
 * Static model catalog with context windows and pricing.
 * Organized by provider for quick lookup.
 *
 * Note: Pricing and context windows are approximate and may change.
 * For production use, consider fetching from provider APIs.
 */
const MODEL_CATALOG: Record<string, ModelMetadata[]> = {
  anthropic: [
    {
      id: "claude-sonnet-4-20250514",
      name: "Claude Sonnet 4",
      contextWindow: 200000,
      inputPricePer1M: 3.0,
      outputPricePer1M: 15.0,
    },
    {
      id: "claude-3-5-sonnet-20241022",
      name: "Claude 3.5 Sonnet",
      contextWindow: 200000,
      inputPricePer1M: 3.0,
      outputPricePer1M: 15.0,
    },
    {
      id: "claude-3-5-haiku-20241022",
      name: "Claude 3.5 Haiku",
      contextWindow: 200000,
      inputPricePer1M: 0.8,
      outputPricePer1M: 4.0,
    },
    {
      id: "claude-opus-4-20250514",
      name: "Claude Opus 4",
      contextWindow: 200000,
      inputPricePer1M: 15.0,
      outputPricePer1M: 75.0,
    },
    {
      id: "claude-3-opus-20240229",
      name: "Claude 3 Opus",
      contextWindow: 200000,
      inputPricePer1M: 15.0,
      outputPricePer1M: 75.0,
    },
  ],
  openai: [
    {
      id: "gpt-4o",
      name: "GPT-4o",
      contextWindow: 128000,
      inputPricePer1M: 2.5,
      outputPricePer1M: 10.0,
    },
    {
      id: "gpt-4o-mini",
      name: "GPT-4o Mini",
      contextWindow: 128000,
      inputPricePer1M: 0.15,
      outputPricePer1M: 0.6,
    },
    {
      id: "gpt-4-turbo",
      name: "GPT-4 Turbo",
      contextWindow: 128000,
      inputPricePer1M: 10.0,
      outputPricePer1M: 30.0,
    },
    {
      id: "gpt-4",
      name: "GPT-4",
      contextWindow: 8192,
      inputPricePer1M: 30.0,
      outputPricePer1M: 60.0,
    },
    { id: "o1", name: "O1", contextWindow: 200000, inputPricePer1M: 15.0, outputPricePer1M: 60.0 },
    {
      id: "o1-mini",
      name: "O1 Mini",
      contextWindow: 128000,
      inputPricePer1M: 3.0,
      outputPricePer1M: 12.0,
    },
    { id: "o3", name: "O3", contextWindow: 200000, inputPricePer1M: 15.0, outputPricePer1M: 60.0 },
    {
      id: "o3-mini",
      name: "O3 Mini",
      contextWindow: 200000,
      inputPricePer1M: 1.1,
      outputPricePer1M: 4.4,
    },
  ],
  google: [
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      contextWindow: 1000000,
      inputPricePer1M: 1.25,
      outputPricePer1M: 10.0,
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      contextWindow: 1000000,
      inputPricePer1M: 0.15,
      outputPricePer1M: 0.6,
    },
    {
      id: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      contextWindow: 1000000,
      inputPricePer1M: 0.1,
      outputPricePer1M: 0.4,
    },
    {
      id: "gemini-1.5-pro",
      name: "Gemini 1.5 Pro",
      contextWindow: 2000000,
      inputPricePer1M: 1.25,
      outputPricePer1M: 5.0,
    },
  ],
  copilot: [
    {
      id: "gpt-4o",
      name: "GPT-4o (Copilot)",
      contextWindow: 128000,
      inputPricePer1M: 0,
      outputPricePer1M: 0,
    },
    {
      id: "claude-3.5-sonnet",
      name: "Claude 3.5 Sonnet (Copilot)",
      contextWindow: 200000,
      inputPricePer1M: 0,
      outputPricePer1M: 0,
    },
    {
      id: "o1",
      name: "O1 (Copilot)",
      contextWindow: 200000,
      inputPricePer1M: 0,
      outputPricePer1M: 0,
    },
  ],
  deepseek: [
    {
      id: "deepseek-chat",
      name: "DeepSeek Chat",
      contextWindow: 64000,
      inputPricePer1M: 0.14,
      outputPricePer1M: 0.28,
    },
    {
      id: "deepseek-reasoner",
      name: "DeepSeek Reasoner",
      contextWindow: 64000,
      inputPricePer1M: 0.55,
      outputPricePer1M: 2.19,
    },
  ],
  groq: [
    {
      id: "llama-3.3-70b-versatile",
      name: "Llama 3.3 70B",
      contextWindow: 128000,
      inputPricePer1M: 0.59,
      outputPricePer1M: 0.79,
    },
    {
      id: "llama-3.1-8b-instant",
      name: "Llama 3.1 8B",
      contextWindow: 128000,
      inputPricePer1M: 0.05,
      outputPricePer1M: 0.08,
    },
  ],
  xai: [
    {
      id: "grok-3",
      name: "Grok 3",
      contextWindow: 131072,
      inputPricePer1M: 3.0,
      outputPricePer1M: 15.0,
    },
    {
      id: "grok-3-mini",
      name: "Grok 3 Mini",
      contextWindow: 131072,
      inputPricePer1M: 0.3,
      outputPricePer1M: 0.5,
    },
  ],
  qwen: [
    {
      id: "qwen-max",
      name: "Qwen Max",
      contextWindow: 32000,
      inputPricePer1M: 2.0,
      outputPricePer1M: 6.0,
    },
    {
      id: "qwen-plus",
      name: "Qwen Plus",
      contextWindow: 131072,
      inputPricePer1M: 0.8,
      outputPricePer1M: 2.0,
    },
    {
      id: "qwen-turbo",
      name: "Qwen Turbo",
      contextWindow: 131072,
      inputPricePer1M: 0.3,
      outputPricePer1M: 0.6,
    },
  ],
  // Local providers with no cost
  ollama: [
    {
      id: "llama3.3",
      name: "Llama 3.3",
      contextWindow: 128000,
      inputPricePer1M: 0,
      outputPricePer1M: 0,
    },
    {
      id: "deepseek-r1",
      name: "DeepSeek R1",
      contextWindow: 64000,
      inputPricePer1M: 0,
      outputPricePer1M: 0,
    },
  ],
  lmstudio: [
    {
      id: "local-model",
      name: "Local Model",
      contextWindow: 32000,
      inputPricePer1M: 0,
      outputPricePer1M: 0,
    },
  ],
};

/**
 * Default model metadata when model is not found
 */
const DEFAULT_MODEL_METADATA: ModelMetadata = {
  id: "unknown",
  name: "Unknown Model",
  contextWindow: 128000, // Reasonable default for modern models
  inputPricePer1M: 1.0,
  outputPricePer1M: 3.0,
};

// =============================================================================
// Lookup Functions
// =============================================================================

/**
 * Get model metadata by provider and model ID.
 *
 * @param provider - Provider type (e.g., "anthropic", "openai")
 * @param modelId - Model identifier (e.g., "gpt-4o", "claude-sonnet-4-20250514")
 * @returns Model metadata, or default if not found
 *
 * @example
 * ```ts
 * const info = getModelInfo("openai", "gpt-4o");
 * console.log(info.contextWindow); // 128000
 * ```
 */
export function getModelInfo(provider: string, modelId: string): ModelMetadata {
  const providerModels = MODEL_CATALOG[provider.toLowerCase()];
  if (!providerModels) {
    return { ...DEFAULT_MODEL_METADATA, id: modelId };
  }

  // Try exact match first
  const exactMatch = providerModels.find((m) => m.id === modelId);
  if (exactMatch) {
    return exactMatch;
  }

  // Try partial match (e.g., "gpt-4o" matches "gpt-4o-2024-05-13")
  const partialMatch = providerModels.find(
    (m) => modelId.startsWith(m.id) || m.id.startsWith(modelId)
  );
  if (partialMatch) {
    return { ...partialMatch, id: modelId };
  }

  // Return default with the original model ID
  return { ...DEFAULT_MODEL_METADATA, id: modelId };
}

/**
 * Get context window size for a model.
 *
 * @param provider - Provider type
 * @param modelId - Model identifier
 * @returns Context window size in tokens
 */
export function getContextWindow(provider: string, modelId: string): number {
  return getModelInfo(provider, modelId).contextWindow;
}

/**
 * Calculate estimated cost for token usage.
 *
 * @param provider - Provider type
 * @param modelId - Model identifier
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Estimated cost in USD
 */
export function calculateCost(
  provider: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const info = getModelInfo(provider, modelId);
  const inputCost = (inputTokens / 1_000_000) * info.inputPricePer1M;
  const outputCost = (outputTokens / 1_000_000) * info.outputPricePer1M;
  return inputCost + outputCost;
}

/**
 * Get all supported providers.
 *
 * @returns Array of provider names
 */
export function getSupportedProviders(): string[] {
  return Object.keys(MODEL_CATALOG);
}

/**
 * Get all models for a provider.
 *
 * @param provider - Provider type
 * @returns Array of model metadata, or empty array if provider not found
 */
export function getProviderModels(provider: string): ModelMetadata[] {
  return MODEL_CATALOG[provider.toLowerCase()] ?? [];
}
