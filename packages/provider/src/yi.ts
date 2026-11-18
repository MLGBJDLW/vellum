/** 01.AI hosted text and vision routes. */
import { DEFAULT_MODEL_IDS, findModelInfo } from "./models/index.js";
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
    const model = findModelInfo(this.providerName, params.model);
    const requested = typeof body.max_tokens === "number" ? body.max_tokens : params.maxTokens;
    // Yi can choose the remaining output budget when input and output share a window.
    if (
      model &&
      model.contextWindowKnown !== false &&
      (requested === undefined || requested >= model.contextWindow)
    ) {
      body.max_tokens = undefined;
    }
    return body;
  }
}
