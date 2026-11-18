import { z } from "zod";
import { DEFAULT_MODEL_IDS } from "./models/catalog.js";

/**
 * Qwen Provider (Alibaba Cloud)
 *
 * Implements support for Alibaba's Qwen models via DashScope API.
 * Uses the OpenAI-compatible endpoint for seamless integration.
 *
 * @module @vellum/provider/qwen
 */

import { normalizeDiscoveredModels } from "./models/discovery.js";
import { getModelInfo } from "./models/index.js";
import { QWEN_MODELS } from "./models/providers/qwen.js";
import type { ModelInfo, ReasoningEffort } from "./models/types.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { CompletionParams } from "./types.js";

const inventoryPage = z.object({
  success: z.literal(true),
  output: z.object({
    total: z.number().int().nonnegative(),
    page_no: z.number().int().positive(),
    models: z.array(
      z.object({
        model: z.string().min(1),
        name: z.string().nullish(),
        capabilities: z.array(z.string()).nullish(),
        features: z.array(z.string()).nullish(),
        inference_metadata: z
          .object({
            request_modality: z.array(z.string()).nullish(),
            response_modality: z.array(z.string()).nullish(),
          })
          .nullish(),
        model_info: z
          .object({
            context_window: z.number().nullish(),
            max_output_tokens: z.number().nullish(),
            reasoning_max_output_tokens: z.number().nullish(),
          })
          .nullish(),
      })
    ),
  }),
});

// =============================================================================
// Qwen Provider Implementation
// =============================================================================

/**
 * Qwen LLM Provider (Alibaba Cloud)
 *
 * @example
 * ```typescript
 * const provider = new QwenProvider();
 * await provider.initialize({ apiKey: 'sk-...' });
 *
 * const result = await provider.complete({
 *   model: 'qwen4-max',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class QwenProvider extends OpenAICompatibleProvider {
  /**
   * Default base URL for DashScope OpenAI-compatible API
   */
  readonly defaultBaseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1";

  /**
   * Provider identifier
   */
  readonly providerName = "qwen";

  /**
   * Get the model catalog for Qwen
   *
   * @returns Array of available Qwen models
   */
  protected getModelCatalog(): ModelInfo[] {
    return QWEN_MODELS;
  }

  /**
   * Get the default model for Qwen
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return DEFAULT_MODEL_IDS.qwen;
  }

  override async refreshModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    signal?.throwIfAborted();
    const client = this.ensureInitialized();
    const base = new URL(client.baseURL);
    // Token Plan, Coding Plan and custom proxy inventories use their own
    // routes. Only address the native inventory on a documented Model Studio host.
    const isWorkspace =
      /^[^.]+\.(?:cn-beijing|cn-hongkong|ap-southeast-1|ap-northeast-1|eu-central-1|us-east-1)\.maas\.aliyuncs\.com$/.test(
        base.hostname
      ) && !base.hostname.startsWith("token-plan.");
    const isDashScope = /^(?:dashscope|dashscope-intl|dashscope-us)\.aliyuncs\.com$/.test(
      base.hostname
    );
    if (
      (!isWorkspace && !isDashScope) ||
      base.pathname.replace(/\/$/, "") !== "/compatible-mode/v1"
    ) {
      return super.refreshModels(signal);
    }
    const url = new URL("/api/v1/models", base);
    const records = [];
    let received = 0;
    for (let page = 1; ; page++) {
      signal?.throwIfAborted();
      const response = await client.get<unknown>(url.href, {
        query: { page_no: page, page_size: 20, capabilities: "TG", supports: "inference" },
        signal,
      });
      const { output } = inventoryPage.parse(response);
      if (output.page_no !== page || (!output.models.length && received < output.total)) {
        throw new Error("Model Studio returned an incomplete model inventory");
      }
      for (const model of output.models) {
        const limits = model.model_info;
        records.push({
          id: model.model,
          name: model.name,
          context_window: limits?.context_window,
          max_tokens: Math.max(
            limits?.max_output_tokens ?? 0,
            limits?.reasoning_max_output_tokens ?? 0
          ),
          input_modalities: model.inference_metadata?.request_modality?.map((value) =>
            value.toLowerCase()
          ),
          output_modalities: model.inference_metadata?.response_modality?.map((value) =>
            value.toLowerCase()
          ),
          capabilities: {
            function_calling: model.features?.includes("function-calling"),
            thinking: { supported: model.capabilities?.includes("Reasoning") },
            prompt_cache: model.features?.includes("cache"),
          },
        });
      }
      received += output.models.length;
      if (received >= output.total) break;
    }
    signal?.throwIfAborted();
    return normalizeDiscoveredModels("qwen", records);
  }

  protected override buildExtraBody(params: CompletionParams): Record<string, unknown> {
    const body = { ...params.extraBody };
    const supportsEffort = getModelInfo("qwen", params.model).reasoningEfforts !== undefined;
    const enabled =
      params.thinking?.reasoningEffort === "none"
        ? false
        : (params.thinking?.enabled ?? body.enable_thinking ?? supportsEffort);
    body.enable_thinking = enabled;
    if (params.thinking?.budgetTokens !== undefined && enabled) {
      body.thinking_budget = params.thinking.budgetTokens;
    }
    if (supportsEffort && body.thinking_budget !== undefined) {
      // These are mutually exclusive on Qwen 3.8/4; the explicit budget wins.
      delete body.reasoning_effort;
    }
    if (!enabled) {
      const limit = typeof body.max_tokens === "number" ? body.max_tokens : params.maxTokens;
      if (params.model === "qwen4-max" && limit !== undefined && limit > 131_072) {
        body.max_tokens = 131_072;
      }
      delete body.thinking_budget;
      delete body.reasoning_effort;
    }
    return body;
  }

  protected override resolveReasoningEffort(params: CompletionParams): ReasoningEffort | undefined {
    if (
      params.thinking?.budgetTokens !== undefined ||
      params.extraBody?.thinking_budget !== undefined ||
      params.thinking?.reasoningEffort === "none"
    ) {
      return undefined;
    }
    return super.resolveReasoningEffort(params);
  }
}
