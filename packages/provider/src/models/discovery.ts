import { z } from "zod";
import type { ProviderType } from "../types.js";
import { ALL_MODELS, getModelReplacement, getProviderModels, MODEL_CATALOG } from "./catalog.js";
import type { ModelInfo } from "./types.js";

const recordSchema = z.record(z.string(), z.unknown());
const record = (value: unknown): Record<string, unknown> =>
  recordSchema.safeParse(value).data ?? {};
const positive = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
const price = (value: unknown): number | undefined => {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1_000_000 : undefined;
};

/** Normalize provider discovery without inventing capabilities or prices. */
export function normalizeDiscoveredModels(provider: ProviderType, records: unknown[]): ModelInfo[] {
  const result = new Map<string, ModelInfo>();
  for (const value of records) {
    const data = record(value);
    const rawId = data.id ?? data.name;
    if (typeof rawId !== "string" || rawId.length === 0) continue;
    const id = provider === "google" ? rawId.replace(/^models\//, "") : rawId;
    if (getModelReplacement(provider, id)) continue;
    const known = getProviderModels(provider).find(
      (model) => model.id === id || model.aliases?.includes(id)
    );
    const capabilities = record(data.capabilities);
    const architecture = record(data.architecture);
    const topProvider = record(data.top_provider);
    const pricing = record(data.pricing);
    const supported = Array.isArray(data.supported_parameters) ? data.supported_parameters : [];
    const methods = data.supportedGenerationMethods ?? data.supportedActions;
    if (data.active === false || data.deprecated === true) continue;
    if (Array.isArray(methods) && !methods.includes("generateContent")) continue;
    if (
      Array.isArray(architecture.output_modalities) &&
      !architecture.output_modalities.includes("text")
    )
      continue;
    if (
      provider === "openai" &&
      (!/^(gpt-\d|o\d|chatgpt-)/.test(id) || /audio|realtime|transcribe|tts|search-api/.test(id))
    )
      continue;
    if (provider === "mistral" && capabilities.completion_chat === false) continue;
    const contextWindow =
      positive(data.context_length) ??
      positive(data.max_input_tokens) ??
      positive(data.inputTokenLimit) ??
      positive(data.max_context_length) ??
      known?.contextWindow ??
      8_192;
    const model: ModelInfo = {
      ...known,
      id,
      provider,
      ...(provider === "openai" && /^(gpt-[5-9]|o[134])/.test(id)
        ? { api: "responses" as const, supportsSampling: false }
        : {}),
      name:
        typeof data.display_name === "string"
          ? data.display_name
          : typeof data.displayName === "string"
            ? data.displayName
            : typeof data.name === "string" && !data.name.startsWith("models/")
              ? data.name
              : (known?.name ?? id),
      contextWindow,
      maxOutputTokens:
        positive(topProvider.max_completion_tokens) ??
        positive(data.max_tokens) ??
        positive(data.outputTokenLimit) ??
        known?.maxOutputTokens,
      supportsTools:
        supported.includes("tools") ||
        capabilities.function_calling === true ||
        record(capabilities.tool_use).supported === true ||
        known?.supportsTools === true,
      supportsVision: Array.isArray(architecture.input_modalities)
        ? architecture.input_modalities.includes("image")
        : capabilities.vision === true ||
          record(capabilities.image_input).supported === true ||
          known?.supportsVision === true,
      supportsReasoning:
        supported.includes("reasoning") ||
        record(capabilities.thinking).supported === true ||
        known?.supportsReasoning === true,
      supportsStreaming: true,
      supportsPromptCache: known?.supportsPromptCache ?? false,
      deprecated: false,
      inputPrice: price(pricing.prompt) ?? known?.inputPrice,
      outputPrice: price(pricing.completion) ?? known?.outputPrice,
      description:
        known?.description ??
        "Discovered from provider. Unreported capabilities, limits and pricing require provider documentation.",
    };
    result.set(id, model);
  }
  return [...result.values()];
}

/** Replace the current provider view after an explicit successful refresh. */
export function updateDiscoveredModels(provider: ProviderType, models: ModelInfo[]): void {
  if (models.length === 0) throw new Error(`No chat models were returned by ${provider}`);
  MODEL_CATALOG.set(provider, models);
  ALL_MODELS.splice(0, ALL_MODELS.length, ...[...MODEL_CATALOG.values()].flat());
}
