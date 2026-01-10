/**
 * DeepSeek Provider
 *
 * Implements support for DeepSeek's OpenAI-compatible API.
 * Provides access to DeepSeek Chat, Coder, and Reasoner models.
 *
 * @module @vellum/provider/deepseek
 */

import { DEEPSEEK_MODELS } from "./models/providers/deepseek.js";
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
    return DEEPSEEK_MODELS;
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
