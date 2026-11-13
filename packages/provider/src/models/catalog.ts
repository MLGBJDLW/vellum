/**
 * Model catalog - aggregates all provider model definitions
 * @module models/catalog
 */

import type { ProviderType } from "../types.js";
// Provider-specific model definitions
import {
  ANTHROPIC_MODELS,
  BAICHUAN_MODELS,
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
const bundledCatalog: ReadonlyArray<readonly [ProviderType, ModelInfo[]]> = [
  ["anthropic", ANTHROPIC_MODELS],
  ["openai", OPENAI_MODELS],
  ["google", GOOGLE_MODELS],
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
];

// Refresh replaces a provider's available view, not its bundled metadata.
export const MODEL_CATALOG = new Map<ProviderType, ModelInfo[]>(bundledCatalog);

export function getBundledModelMetadata(provider: ProviderType): ModelInfo[] {
  return bundledCatalog.find(([key]) => key === provider)?.[1] ?? [];
}

/**
 * Flattened list of all models across all providers
 */
export const ALL_MODELS: ModelInfo[] = [...MODEL_CATALOG.values()].flat();

/**
 * Get models for a specific provider from the catalog
 */
export function getProviderModels(provider: ProviderType | string): ModelInfo[] {
  return (MODEL_CATALOG.get(provider as ProviderType) ?? []).filter((model) => !model.deprecated);
}

/** Defaults are shared by adapters, CLI configuration and onboarding. */
export const DEFAULT_MODEL_IDS: Record<ProviderType, string> = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-6.1-sol",
  google: "gemini-3.8-flash",
  deepseek: "deepseek-flash",
  qwen: "qwen3.8-flash",
  groq: "openai/gpt-oss-120b",
  xai: "grok-4.7",
  openrouter: "openai/gpt-6.1-sol",
  ollama: "llama3.2",
  lmstudio: "local-model",
  zhipu: "glm-5.3",
  moonshot: "kimi-k3.1-pro",
  mistral: "mistral-large-4",
  yi: "yi-large",
  baichuan: "Baichuan4",
  doubao: "doubao-seed-2-1-pro-260915",
  minimax: "MiniMax-M3.1-Flash",
};

export function getDefaultModelId(provider: ProviderType | string): string | undefined {
  return DEFAULT_MODEL_IDS[provider as ProviderType];
}

/** Exact vendor retirements only; custom IDs and working historical models stay untouched. */
const RETIRED_MODEL_REPLACEMENTS: Partial<Record<ProviderType, Record<string, string>>> = {
  anthropic: {
    "claude-3-opus-20240229": "claude-opus-5-5",
    "claude-3-5-sonnet-20240620": "claude-sonnet-5-5",
    "claude-3-5-sonnet-20241022": "claude-sonnet-5-5",
    "claude-3-7-sonnet-20250219": "claude-sonnet-5-5",
    "claude-3-5-haiku-20241022": "claude-haiku-5-5",
    "claude-3-haiku-20240307": "claude-haiku-5-5",
    "claude-sonnet-4-20250514": "claude-sonnet-5-5",
    "claude-opus-4-20250514": "claude-opus-5-5",
    "claude-opus-4-1-20250805": "claude-opus-5-5",
  },
  openai: {
    "gpt-4": "gpt-6.1-sol",
    "gpt-4-turbo": "gpt-6.1-sol",
    "gpt-4-32k": "gpt-6.1-sol",
    "gpt-4-32k-0613": "gpt-6.1-sol",
    "gpt-3.5-turbo": "gpt-6-luna",
    "gpt-4.1-nano": "gpt-6-luna",
    o1: "gpt-6.1-sol",
    "o1-pro": "gpt-5.6-sol",
    "o1-mini": "gpt-6-luna",
    "o1-preview": "gpt-6.1-sol",
    "o3-mini": "gpt-6-luna",
    "codex-mini-latest": "gpt-6-luna",
    "gpt-5-codex": "gpt-5.6-sol",
    "gpt-5.1-codex": "gpt-5.6-sol",
    "gpt-5.1-codex-max": "gpt-5.6-sol",
    "gpt-5.1-codex-mini": "gpt-5.6-terra",
    "gpt-5.2-codex": "gpt-5.6-sol",
    "o4-mini": "gpt-5.6-terra",
    "o4-mini-2025-04-16": "gpt-5.6-terra",
    "gpt-4o-2024-05-13": "gpt-5.6-sol",
    "gpt-3.5-turbo-0125": "gpt-5.6-terra",
    "gpt-3.5-turbo-1106": "gpt-5.6-terra",
    "gpt-3.5-turbo-instruct": "gpt-5.6-terra",
    "gpt-4-0613": "gpt-5.6-sol",
    "gpt-4-0314": "gpt-5.6-sol",
    "gpt-4-1106-preview": "gpt-5.6-sol",
    "gpt-4-0125-preview": "gpt-5.6-sol",
    "gpt-4-turbo-preview": "gpt-5.6-sol",
    "gpt-4.5-preview": "gpt-5.6-sol",
    "gpt-5-chat-latest": "gpt-5.6-sol",
    "gpt-5.1-chat-latest": "gpt-5.6-sol",
    "gpt-5.2-chat-latest": "gpt-5.6-sol",
    "gpt-5.3-chat-latest": "gpt-5.6-sol",
    "chatgpt-4o-latest": "gpt-5.6-sol",
    "o3-deep-research": "gpt-5.6-sol",
    "o4-mini-deep-research": "gpt-5.6-sol",
  },
  google: {
    "gemini-1.5-pro": "gemini-4-argon",
    "gemini-1.5-flash": "gemini-3.8-flash",
    "gemini-2.0-flash-exp": "gemini-3.8-flash",
    "gemini-2.0-flash": "gemini-3.8-flash",
    "gemini-2.0-flash-001": "gemini-3.8-flash",
    "gemini-2.0-flash-lite": "gemini-3.5-flash-lite",
    "gemini-2.0-flash-lite-001": "gemini-3.5-flash-lite",
    "gemini-3-pro-preview": "gemini-3.1-pro-preview",
    "gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite",
  },
  moonshot: {
    "moonshot-v1-8k": "kimi-k3.1-pro",
    "moonshot-v1-32k": "kimi-k3.1-pro",
    "moonshot-v1-128k": "kimi-k3.1-pro",
    "kimi-latest": "kimi-k3.1-pro",
    "kimi-k2.5": "kimi-k3.1-pro",
    "kimi-k2-thinking": "kimi-k3.1-pro",
    "kimi-k2-thinking-turbo": "kimi-k3.1-pro",
    "kimi-k2-0905-preview": "kimi-k3.1-pro",
    "kimi-k2-turbo-preview": "kimi-k3.1-pro",
  },
  groq: { "mixtral-8x7b-32768": "openai/gpt-oss-120b" },
};

export function getModelReplacement(
  provider: ProviderType | string,
  modelId: string
): string | undefined {
  const replacements = RETIRED_MODEL_REPLACEMENTS[provider as ProviderType];
  return (
    replacements?.[modelId] ??
    (provider === "openai" ? replacements?.[modelId.replace(/-\d{4}-\d{2}-\d{2}$/, "")] : undefined)
  );
}

/** Retired products without a compatible vendor replacement must not be rediscovered. */
export function isRetiredModel(provider: ProviderType | string, modelId: string): boolean {
  return (
    getModelReplacement(provider, modelId) !== undefined ||
    (provider === "groq" && (modelId === "groq/compound" || modelId === "groq/compound-mini"))
  );
}

/**
 * Check if a provider has any registered models
 */
export function hasModels(provider: ProviderType | string): boolean {
  const models = MODEL_CATALOG.get(provider as ProviderType);
  return models !== undefined && models.length > 0;
}
