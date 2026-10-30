import { z } from "zod";
import type { ProviderType } from "../types.js";
import { ALL_MODELS, getModelReplacement, getProviderModels, MODEL_CATALOG } from "./catalog.js";
import { type ModelInfo, reasoningEffortSchema } from "./types.js";

const recordSchema = z.record(z.string(), z.unknown());
const record = (value: unknown): Record<string, unknown> =>
  recordSchema.safeParse(value).data ?? {};
const positive = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
const price = (value: unknown): number | undefined => {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const perMillion = Number(value) * 1_000_000;
  return Number.isFinite(perMillion) && perMillion >= 0
    ? Number(perMillion.toPrecision(12))
    : undefined;
};
const boolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

/** Normalize provider discovery without inventing capabilities or prices. */
export function normalizeDiscoveredModels(provider: ProviderType, records: unknown[]): ModelInfo[] {
  const result = new Map<string, ModelInfo>();
  for (const value of records) {
    const data = record(value);
    const rawId = data.id ?? data.name ?? data.key;
    if (typeof rawId !== "string" || rawId.length === 0) continue;
    const id = provider === "google" ? rawId.replace(/^models\//, "") : rawId;
    if (getModelReplacement(provider, id)) continue;
    const known = getProviderModels(provider).find(
      (model) => model.id === id || model.aliases?.includes(id)
    );
    const capabilities = record(data.capabilities);
    const localCapabilities = Array.isArray(data.capabilities) ? data.capabilities : undefined;
    const thinkingTypes = record(record(capabilities.thinking).types);
    const effortCapability = record(capabilities.effort);
    const architecture = record(data.architecture);
    const topProvider = record(data.top_provider);
    const pricing = record(data.pricing);
    const reasoning = record(data.reasoning);
    const localReasoning = record(capabilities.reasoning);
    const localReasoningOptions = Array.isArray(localReasoning.allowed_options)
      ? localReasoning.allowed_options
      : undefined;
    const supported = Array.isArray(data.supported_parameters) ? data.supported_parameters : [];
    const methods = data.supportedGenerationMethods ?? data.supportedActions;
    if (data.active === false || data.deprecated === true || data.lifecycle === "retired") continue;
    if (
      (provider === "ollama" || provider === "lmstudio") &&
      (data.type === "embedding" ||
        data.type === "decision" ||
        (localCapabilities?.includes("embedding") && !localCapabilities.includes("completion")))
    )
      continue;
    // Batch products use a separate asynchronous API, not this interactive chat transport.
    if (provider === "openrouter" && id.endsWith(":batch")) continue;
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
    if (capabilities.completion_chat === false) continue;
    // Groq's /models endpoint also includes speech and moderation-only products.
    if (provider === "groq" && /whisper|orpheus|prompt-guard|llama-guard|safeguard/.test(id))
      continue;
    const contextWindow =
      positive(data.context_length) ??
      positive(data.context_window) ??
      positive(data.max_input_tokens) ??
      positive(data.inputTokenLimit) ??
      positive(data.max_context_length) ??
      known?.contextWindow ??
      8_192;
    const reportedEfforts = reasoning.supported_efforts ?? localReasoningOptions;
    const reasoningEfforts = Array.isArray(reportedEfforts)
      ? reportedEfforts.flatMap((effort) => {
          const parsed = reasoningEffortSchema.safeParse(effort);
          return parsed.success ? [parsed.data] : [];
        })
      : effortCapability.supported === true
        ? reasoningEffortSchema.options.filter(
            (effort) => record(effortCapability[effort]).supported === true
          )
        : known?.reasoningEfforts;
    const defaultEffort = reasoningEffortSchema.safeParse(
      reasoning.default_effort ?? localReasoning.default
    );
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
        positive(data.max_completion_tokens) ??
        positive(data.max_tokens) ??
        positive(data.outputTokenLimit) ??
        known?.maxOutputTokens,
      supportsTools:
        boolean(capabilities.function_calling) ??
        boolean(capabilities.trained_for_tool_use) ??
        boolean(record(capabilities.tool_use).supported) ??
        (localCapabilities ? localCapabilities.includes("tools") : undefined) ??
        (Array.isArray(data.supported_parameters)
          ? supported.includes("tools")
          : known?.supportsTools),
      supportsVision: Array.isArray(architecture.input_modalities)
        ? architecture.input_modalities.includes("image")
        : (boolean(capabilities.vision) ??
          (localCapabilities ? localCapabilities.includes("vision") : undefined) ??
          boolean(record(capabilities.image_input).supported) ??
          known?.supportsVision === true),
      supportsReasoning:
        boolean(record(capabilities.thinking).supported) ??
        (localReasoningOptions
          ? localReasoningOptions.some((option) => option !== "off")
          : undefined) ??
        (Array.isArray(reasoning.supported_efforts)
          ? reasoningEfforts?.some((effort) => effort !== "none")
          : undefined) ??
        (localCapabilities ? localCapabilities.includes("thinking") : undefined) ??
        (Array.isArray(data.supported_parameters)
          ? supported.includes("reasoning") || supported.includes("reasoning_effort")
          : known?.supportsReasoning === true),
      supportsStreaming: true,
      supportsPromptCache:
        price(pricing.input_cache_read) !== undefined ||
        price(pricing.input_cache_write) !== undefined ||
        known?.supportsPromptCache === true,
      ...(Array.isArray(data.supported_parameters)
        ? { supportsSampling: supported.includes("temperature") || supported.includes("top_p") }
        : {}),
      thinkingMode:
        record(thinkingTypes.adaptive).supported === true
          ? "adaptive"
          : record(thinkingTypes.enabled).supported === true
            ? "budget"
            : known?.thinkingMode,
      reasoningEfforts,
      defaultReasoningEffort: defaultEffort.success
        ? defaultEffort.data
        : known?.defaultReasoningEffort,
      requiresThinking:
        boolean(reasoning.mandatory) ??
        (localReasoningOptions ? !localReasoningOptions.includes("off") : undefined) ??
        (record(capabilities.thinking).supported === true &&
        record(thinkingTypes.disabled).supported === false
          ? true
          : known?.requiresThinking),
      deprecated: data.lifecycle === "deprecated",
      inputPrice: price(pricing.prompt) ?? known?.inputPrice,
      outputPrice: price(pricing.completion) ?? known?.outputPrice,
      cacheReadsPrice: price(pricing.input_cache_read) ?? known?.cacheReadsPrice,
      cacheWritesPrice: price(pricing.input_cache_write) ?? known?.cacheWritesPrice,
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
