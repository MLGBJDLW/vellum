/**
 * DeepSeek Provider
 *
 * Implements support for DeepSeek's OpenAI-compatible API.
 * Provides access to DeepSeek Chat, Coder, and Reasoner models.
 *
 * The deepseek-reasoner model returns reasoning content in a `reasoning_content`
 * field, which is extracted and emitted as StreamReasoningEvent during streaming.
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
 * - deepseek-reasoner: Advanced reasoning capabilities with `reasoning_content`
 *
 * @example
 * ```typescript
 * const provider = new DeepSeekProvider();
 * await provider.initialize({ apiKey: 'sk-...' });
 *
 * const result = await provider.complete({
 *   model: 'deepseek-reasoner',
 *   messages: [{ role: 'user', content: 'Solve this step by step...' }],
 * });
 *
 * // Access reasoning content
 * console.log(result.thinking); // Contains the reasoning process
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
}
