/** Hosted Baichuan general and medical Chat Completions. */
import { DEFAULT_MODEL_IDS, findModelInfo } from "./models/index.js";
import { BAICHUAN_MODELS } from "./models/providers/baichuan.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { OpenAIMessage } from "./transforms/openai.js";
import type { TransformConfig } from "./transforms/types.js";
import type { CompletionMessage, CompletionParams, ModelInfo } from "./types.js";

export class BaichuanProvider extends OpenAICompatibleProvider {
  readonly defaultBaseUrl = "https://api.baichuan-ai.com/v1";
  readonly providerName = "baichuan";

  protected getModelCatalog(): ModelInfo[] {
    return BAICHUAN_MODELS;
  }

  getDefaultModel(): string {
    return DEFAULT_MODEL_IDS.baichuan;
  }

  protected override buildExtraBody(params: CompletionParams): Record<string, unknown> {
    const body = { ...params.extraBody };
    const model = findModelInfo(this.providerName, params.model);
    if (!model?.maxOutputTokens) return body;
    const requested = typeof body.max_tokens === "number" ? body.max_tokens : params.maxTokens;
    const maxTokens = Math.min(requested ?? 4096, model.maxOutputTokens);
    body.max_tokens = maxTokens;
    const budget = params.thinking?.budgetTokens;
    if (
      model.supportsReasoning &&
      params.thinking?.enabled &&
      budget !== undefined &&
      maxTokens > 1024
    ) {
      body.thinking = { budget_tokens: Math.min(Math.max(1024, budget), maxTokens - 1) };
    }
    return body;
  }

  protected override transformRequestMessages(
    messages: CompletionMessage[],
    config: TransformConfig
  ): OpenAIMessage[] {
    const transformed = super.transformRequestMessages(messages, config);
    if (config.modelId !== "Baichuan-M2-Plus" && config.modelId !== "Baichuan-M3-Plus") {
      return transformed;
    }
    return transformed.map((message) =>
      message.role === "system" ? { role: "user", content: message.content } : message
    );
  }
}
