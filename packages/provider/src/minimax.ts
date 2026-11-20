import { DEFAULT_MODEL_IDS } from "./models/catalog.js";
/**
 * MiniMax Provider
 *
 * Implements support for MiniMax's OpenAI-compatible API, including
 * reasoning split mode for M3 reasoning models.
 *
 * @module @vellum/provider/minimax
 */

import { findModelInfo } from "./models/index.js";
import { MINIMAX_MODELS } from "./models/providers/minimax.js";
import type { ModelInfo, ReasoningEffort } from "./models/types.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { CompletionParams } from "./types.js";

// =============================================================================
// MiniMax Provider Implementation
// =============================================================================

/**
 * MiniMax LLM Provider
 *
 * Supports MiniMax's M3 models with reasoning split mode.
 */
export class MiniMaxProvider extends OpenAICompatibleProvider {
  /**
   * Default base URL for MiniMax API
   */
  readonly defaultBaseUrl = "https://api.minimax.io/v1";

  /**
   * Provider identifier
   */
  readonly providerName = "minimax";

  /**
   * Get the model catalog for MiniMax
   *
   * @returns Array of available MiniMax models
   */
  protected getModelCatalog(): ModelInfo[] {
    return MINIMAX_MODELS;
  }

  /**
   * Get the default model for MiniMax
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return DEFAULT_MODEL_IDS.minimax;
  }

  protected override buildExtraBody(params: CompletionParams): Record<string, unknown> | undefined {
    const modelInfo = findModelInfo("minimax", params.model);
    if (!modelInfo?.supportsReasoning) return params.extraBody;
    const body: Record<string, unknown> = { ...params.extraBody, reasoning_split: true };
    if (modelInfo.requiresThinking) {
      // Always on. An explicit disabled value returns a provider error.
      delete body.thinking;
    } else if (modelInfo.id === "MiniMax-M3") {
      delete body.reasoning_effort;
      if (params.thinking !== undefined) {
        body.thinking = {
          type:
            params.thinking.enabled && params.thinking.reasoningEffort !== "none"
              ? "adaptive"
              : "disabled",
        };
      }
    }
    return body;
  }

  protected override resolveReasoningEffort(params: CompletionParams): ReasoningEffort | undefined {
    return params.model === "MiniMax-M3" ? undefined : super.resolveReasoningEffort(params);
  }
}
