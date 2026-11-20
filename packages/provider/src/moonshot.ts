import { DEFAULT_MODEL_IDS } from "./models/catalog.js";
/**
 * Moonshot Provider (月之暗面/Kimi)
 *
 * Implements support for Moonshot AI's models via OpenAI-compatible API.
 * Known for the Kimi assistant with strong long-context capabilities.
 *
 * @module @vellum/provider/moonshot
 */

import { getModelInfo } from "./models/index.js";
import { MOONSHOT_MODELS } from "./models/providers/moonshot.js";
import type { ReasoningEffort } from "./models/types.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { CompletionParams, ModelInfo } from "./types.js";

// =============================================================================
// Moonshot Provider Implementation
// =============================================================================

/**
 * Moonshot AI LLM Provider (月之暗面/Kimi)
 *
 * @example
 * ```typescript
 * const provider = new MoonshotProvider();
 * await provider.initialize({ apiKey: 'sk-...' });
 *
 * const result = await provider.complete({
 *   model: 'kimi-k3.1-pro',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class MoonshotProvider extends OpenAICompatibleProvider {
  /**
   * Default base URL for Moonshot API
   */
  readonly defaultBaseUrl = "https://api.moonshot.cn/v1";

  /**
   * Provider identifier
   */
  readonly providerName = "moonshot";

  /**
   * Get the model catalog for Moonshot
   *
   * @returns Array of available Moonshot models
   */
  protected getModelCatalog(): ModelInfo[] {
    return MOONSHOT_MODELS;
  }

  /**
   * Enable reasoning content extraction for Kimi thinking models.
   */
  protected override supportsReasoningContent(): boolean {
    return true;
  }

  protected override buildExtraBody(params: CompletionParams): Record<string, unknown> | undefined {
    const model = getModelInfo("moonshot", params.model);
    if (model.supportsSampling !== false) return params.extraBody;
    // Kimi fixes these parameters server-side. Undefined values also remove
    // fields populated by the common builder before the SDK serializes JSON.
    const body: Record<string, unknown> = {
      ...params.extraBody,
      temperature: undefined,
      top_p: undefined,
      presence_penalty: undefined,
      frequency_penalty: undefined,
      n: undefined,
    };
    if (params.model === "kimi-k2.6" && params.thinking !== undefined) {
      body.thinking = {
        ...(typeof body.thinking === "object" && body.thinking),
        type:
          params.thinking.enabled && params.thinking.reasoningEffort !== "none"
            ? "enabled"
            : "disabled",
      };
    } else if (model.requiresThinking) {
      // K3 uses effort alone. K2.7 enables thinking and preservation by default.
      delete body.thinking;
    }
    if (params.model === "kimi-k2.6" || !model.reasoningEfforts?.length)
      delete body.reasoning_effort;
    return body;
  }

  protected override resolveReasoningEffort(params: CompletionParams): ReasoningEffort | undefined {
    return params.model === "kimi-k2.6" ? undefined : super.resolveReasoningEffort(params);
  }

  /**
   * Get the default model for Moonshot
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return DEFAULT_MODEL_IDS.moonshot;
  }
}
