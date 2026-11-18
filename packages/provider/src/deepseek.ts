import { DEFAULT_MODEL_IDS } from "./models/catalog.js";
import { DEEPSEEK_MODELS } from "./models/providers/deepseek.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { CompletionParams, ModelInfo } from "./types.js";

/** DeepSeek Flash and Pro use OpenAI-compatible chat with a separate thinking field. */
export class DeepSeekProvider extends OpenAICompatibleProvider {
  /**
   * Default base URL for DeepSeek API
   */
  readonly defaultBaseUrl = "https://api.deepseek.com/v1";

  /**
   * Provider identifier
   */
  readonly providerName = "deepseek";

  /**
   * Get the model catalog for DeepSeek
   *
   * @returns Array of available DeepSeek models
   */
  protected getModelCatalog(): ModelInfo[] {
    return DEEPSEEK_MODELS;
  }

  /**
   * Get the default model for DeepSeek
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return DEFAULT_MODEL_IDS.deepseek;
  }

  /**
   * Enable reasoning content extraction for DeepSeek Reasoner models
   *
   * DeepSeek Reasoner returns reasoning in `reasoning_content` field,
   * which the base provider will now extract automatically.
   *
   * @returns true to enable reasoning_content extraction
   */
  protected override supportsReasoningContent(): boolean {
    return true;
  }

  protected override buildExtraBody(params: CompletionParams): Record<string, unknown> {
    return {
      ...params.extraBody,
      thinking: { type: params.thinking?.enabled ? "enabled" : "disabled" },
    };
  }
}
