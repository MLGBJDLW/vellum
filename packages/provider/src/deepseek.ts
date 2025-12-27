/**
 * DeepSeek Provider
 *
 * Implements support for DeepSeek's OpenAI-compatible API.
 * Provides access to DeepSeek Chat, Coder, and Reasoner models.
 *
 * @module @vellum/provider/deepseek
 */

import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { ModelInfo } from "./types.js";

// =============================================================================
// DeepSeek Provider Implementation
// =============================================================================

/**
 * DeepSeek LLM Provider
 *
 * Supports DeepSeek's suite of models including:
 * - deepseek-chat: General-purpose conversational model
 * - deepseek-coder: Specialized for code generation
 * - deepseek-reasoner: Advanced reasoning capabilities
 *
 * @example
 * ```typescript
 * const provider = new DeepSeekProvider();
 * await provider.initialize({ apiKey: 'sk-...' });
 *
 * const result = await provider.complete({
 *   model: 'deepseek-chat',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
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
    return [
      {
        id: "deepseek-chat",
        name: "DeepSeek Chat",
        provider: "deepseek",
        contextWindow: 64000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.14,
        outputPrice: 0.28,
      },
      {
        id: "deepseek-coder",
        name: "DeepSeek Coder",
        provider: "deepseek",
        contextWindow: 64000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.14,
        outputPrice: 0.28,
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek Reasoner",
        provider: "deepseek",
        contextWindow: 64000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: true,
        supportsStreaming: true,
        inputPrice: 0.55,
        outputPrice: 2.19,
      },
    ];
  }

  /**
   * Get the default model for DeepSeek
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return "deepseek-chat";
  }
}
