/**
 * Mistral Provider
 *
 * Implements support for Mistral AI's models via OpenAI-compatible API.
 * Mistral offers a range of models from efficient to powerful.
 *
 * @module @vellum/provider/mistral
 */

import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { ModelInfo } from "./types.js";

// =============================================================================
// Mistral Provider Implementation
// =============================================================================

/**
 * Mistral AI LLM Provider
 *
 * Supports Mistral's model family including:
 * - mistral-large: Flagship model for complex tasks
 * - mistral-small: Efficient model for simpler tasks
 * - codestral: Specialized for code generation
 * - open-mixtral-8x22b: Open-weight mixture of experts
 * - open-mixtral-8x7b: Smaller MoE model
 * - mistral-embed: Text embedding model
 *
 * @example
 * ```typescript
 * const provider = new MistralProvider();
 * await provider.initialize({ apiKey: 'your-api-key' });
 *
 * const result = await provider.complete({
 *   model: 'mistral-large-latest',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class MistralProvider extends OpenAICompatibleProvider {
  /**
   * Default base URL for Mistral API
   */
  readonly defaultBaseUrl = "https://api.mistral.ai/v1";

  /**
   * Provider identifier
   */
  readonly providerName = "mistral";

  /**
   * Get the model catalog for Mistral
   *
   * @returns Array of available Mistral models
   */
  protected getModelCatalog(): ModelInfo[] {
    return [
      {
        id: "mistral-large-latest",
        name: "Mistral Large",
        provider: "mistral",
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: true,
        supportsStreaming: true,
        inputPrice: 2.0,
        outputPrice: 6.0,
      },
      {
        id: "mistral-small-latest",
        name: "Mistral Small",
        provider: "mistral",
        contextWindow: 32000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.1,
        outputPrice: 0.3,
      },
      {
        id: "codestral-latest",
        name: "Codestral",
        provider: "mistral",
        contextWindow: 32000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.3,
        outputPrice: 0.9,
      },
      {
        id: "open-mixtral-8x22b",
        name: "Open Mixtral 8x22B",
        provider: "mistral",
        contextWindow: 64000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 2.0,
        outputPrice: 6.0,
      },
      {
        id: "open-mixtral-8x7b",
        name: "Open Mixtral 8x7B",
        provider: "mistral",
        contextWindow: 32000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.7,
        outputPrice: 0.7,
      },
      {
        id: "open-mistral-7b",
        name: "Open Mistral 7B",
        provider: "mistral",
        contextWindow: 32000,
        maxOutputTokens: 8192,
        supportsTools: false,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.25,
        outputPrice: 0.25,
      },
      {
        id: "pixtral-large-latest",
        name: "Pixtral Large",
        provider: "mistral",
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 2.0,
        outputPrice: 6.0,
      },
    ];
  }

  /**
   * Get the default model for Mistral
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return "mistral-large-latest";
  }
}
