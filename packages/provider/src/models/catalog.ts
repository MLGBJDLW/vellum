/**
 * Model catalog - aggregates all provider model definitions
 * @module models/catalog
 */

import type { ProviderType } from "../types.js";
// Provider-specific model definitions
import {
  ANTHROPIC_MODELS,
  BAICHUAN_MODELS,
  COPILOT_MODELS,
  DEEPSEEK_MODELS,
  DOUBAO_MODELS,
  GOOGLE_MODELS,
  GROQ_MODELS,
  LMSTUDIO_MODELS,
  MINIMAX_MODELS,
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
import type { ModelInfo } from "./types.js";

/**
 * Model catalog organized by provider
 */
export const MODEL_CATALOG: Map<ProviderType, ModelInfo[]> = new Map([
  ["anthropic", ANTHROPIC_MODELS],
  ["openai", OPENAI_MODELS],
  ["google", GOOGLE_MODELS],
  ["copilot", COPILOT_MODELS],
  ["deepseek", DEEPSEEK_MODELS],
  ["groq", GROQ_MODELS],
  ["xai", XAI_MODELS],
  ["qwen", QWEN_MODELS],
  ["ollama", OLLAMA_MODELS],
  ["lmstudio", LMSTUDIO_MODELS],
  ["openrouter", OPENROUTER_MODELS],
  ["zhipu", ZHIPU_MODELS],
  ["moonshot", MOONSHOT_MODELS],
  ["mistral", MISTRAL_MODELS],
  ["yi", YI_MODELS],
  ["baichuan", BAICHUAN_MODELS],
  ["doubao", DOUBAO_MODELS],
  ["minimax", MINIMAX_MODELS],
]);

/**
 * Flattened list of all models across all providers
 */
export const ALL_MODELS: ModelInfo[] = [
  ...ANTHROPIC_MODELS,
  ...OPENAI_MODELS,
  ...GOOGLE_MODELS,
  ...COPILOT_MODELS,
  ...DEEPSEEK_MODELS,
  ...GROQ_MODELS,
  ...XAI_MODELS,
  ...QWEN_MODELS,
  ...OLLAMA_MODELS,
  ...LMSTUDIO_MODELS,
  ...OPENROUTER_MODELS,
  ...ZHIPU_MODELS,
  ...MOONSHOT_MODELS,
  ...MISTRAL_MODELS,
  ...YI_MODELS,
  ...BAICHUAN_MODELS,
  ...DOUBAO_MODELS,
  ...MINIMAX_MODELS,
];

/**
 * Get models for a specific provider from the catalog
 */
export function getProviderModels(provider: ProviderType | string): ModelInfo[] {
  return MODEL_CATALOG.get(provider as ProviderType) ?? [];
}

/**
 * Check if a provider has any registered models
 */
export function hasModels(provider: ProviderType | string): boolean {
  const models = MODEL_CATALOG.get(provider as ProviderType);
  return models !== undefined && models.length > 0;
}
