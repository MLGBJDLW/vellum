/**
 * MiniMax Provider
 *
 * Implements support for MiniMax's OpenAI-compatible API, including
 * reasoning split mode for M2 reasoning models.
 *
 * @module @vellum/provider/minimax
 */

import { MINIMAX_MODELS } from "./models/providers/minimax.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { CompletionParams, ModelInfo } from "./types.js";

// =============================================================================
// MiniMax Provider Implementation
// =============================================================================

/**
 * MiniMax LLM Provider
 *
 * Supports MiniMax's M2 models with reasoning split mode.
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
    return "MiniMax-M2";
  }

  protected override buildExtraBody(params: CompletionParams): Record<string, unknown> | undefined {
    const baseExtra = super.buildExtraBody(params) ?? {};
    const modelInfo = this.getModelCatalog().find((model) => model.id === params.model);

    if (params.thinking?.enabled && modelInfo?.supportsReasoning) {
      return {
        ...baseExtra,
        reasoning_split: true,
      };
    }

    return Object.keys(baseExtra).length > 0 ? baseExtra : undefined;
  }
}
