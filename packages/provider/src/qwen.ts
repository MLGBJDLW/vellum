import { DEFAULT_MODEL_IDS } from "./models/catalog.js";

/**
 * Qwen Provider (Alibaba Cloud)
 *
 * Implements support for Alibaba's Qwen models via DashScope API.
 * Uses the OpenAI-compatible endpoint for seamless integration.
 *
 * @module @vellum/provider/qwen
 */

import { getModelInfo } from "./models/index.js";
import { QWEN_MODELS } from "./models/providers/qwen.js";
import type { ReasoningEffort } from "./models/types.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { CompletionParams, ModelInfo } from "./types.js";

// =============================================================================
// Qwen Provider Implementation
// =============================================================================

/**
 * Qwen LLM Provider (Alibaba Cloud)
 *
 * Supports Alibaba's Qwen model family including:
 * - qwen-turbo: Fast, efficient model for general tasks
 * - qwen-plus: Enhanced capabilities for complex tasks
 * - qwen-max: Flagship model with maximum capabilities
 * - qwen-coder-turbo: Specialized for code generation
 *
 * @example
 * ```typescript
 * const provider = new QwenProvider();
 * await provider.initialize({ apiKey: 'sk-...' });
 *
 * const result = await provider.complete({
 *   model: 'qwen-turbo',
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
