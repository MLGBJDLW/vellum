/**
 * Groq Provider
 *
 * Implements support for Groq's ultra-fast inference API.
 * Provides access to various open-source models with exceptional speed.
 *
 * @module @vellum/provider/groq
 */

import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { ModelInfo } from "./types.js";

// =============================================================================
// Groq Provider Implementation
// =============================================================================

/**
 * Groq LLM Provider
 *
 * Supports Groq's fast inference platform with models including:
 * - llama-3.3-70b-versatile: Meta's Llama 3.3 70B for versatile tasks
 * - mixtral-8x7b-32768: Mistral's MoE model with 32K context
 * - gemma2-9b-it: Google's Gemma 2 9B instruction-tuned
 *
 * @example
 * ```typescript
 * const provider = new GroqProvider();
 * await provider.initialize({ apiKey: 'gsk_...' });
 *
 * const result = await provider.complete({
 *   model: 'llama-3.3-70b-versatile',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class GroqProvider extends OpenAICompatibleProvider {
  /**
   * Default base URL for Groq's OpenAI-compatible API
   */
  readonly defaultBaseUrl = "https://api.groq.com/openai/v1";

  /**
   * Provider identifier
   */
  readonly providerName = "groq";

  /**
   * Get the model catalog for Groq
   *
   * @returns Array of available Groq models
   */
  protected getModelCatalog(): ModelInfo[] {
    return [
      {
        id: "llama-3.3-70b-versatile",
        name: "Llama 3.3 70B Versatile",
        provider: "groq",
        contextWindow: 128000,
        maxOutputTokens: 32768,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.59,
        outputPrice: 0.79,
      },
      {
        id: "mixtral-8x7b-32768",
        name: "Mixtral 8x7B",
        provider: "groq",
        contextWindow: 32768,
        maxOutputTokens: 32768,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.24,
        outputPrice: 0.24,
      },
      {
        id: "gemma2-9b-it",
        name: "Gemma 2 9B IT",
        provider: "groq",
        contextWindow: 8192,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.2,
        outputPrice: 0.2,
      },
    ];
  }

  /**
   * Get the default model for Groq
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return "llama-3.3-70b-versatile";
  }
}
