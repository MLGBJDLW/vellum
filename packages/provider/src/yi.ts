/** 01.AI hosted text and vision routes. */
import { DEFAULT_MODEL_IDS } from "./models/catalog.js";
import { YI_MODELS } from "./models/providers/yi.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { CompletionParams, ModelInfo } from "./types.js";

export class YiProvider extends OpenAICompatibleProvider {
  readonly defaultBaseUrl = "https://api.lingyiwanwu.com/v1";
  readonly providerName = "yi";

  protected getModelCatalog(): ModelInfo[] {
    return YI_MODELS;
  }

  getDefaultModel(): string {
    return DEFAULT_MODEL_IDS.yi;
  }

  protected override buildExtraBody(params: CompletionParams): Record<string, unknown> {
    const body = { ...params.extraBody };
    const model = YI_MODELS.find((entry) => entry.id === params.model);
    const requested = typeof body.max_tokens === "number" ? body.max_tokens : params.maxTokens;
    // Input and output share the same 16K context. Let Yi choose the remaining
    // output budget when the CLI default alone would consume the whole window.
    if (model && (requested === undefined || requested >= model.contextWindow)) {
      body.max_tokens = undefined;
    }
    return body;
  }
}
