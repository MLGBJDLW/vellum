/**
 * Qwen Provider (Alibaba Cloud)
 *
 * Implements support for Alibaba's Qwen models via DashScope API.
 * Uses the OpenAI-compatible endpoint for seamless integration.
 *
 * @module @vellum/provider/qwen
 */

import { QWEN_MODELS } from "./models/providers/qwen.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { ModelInfo } from "./types.js";

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
    return "qwen-turbo";
  }
}
