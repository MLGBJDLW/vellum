/**
 * xAI Provider (Grok)
 *
 * Implements support for xAI's Grok models via OpenAI-compatible API.
 * Provides access to Grok-2 and related models.
 *
 * @module @vellum/provider/xai
 */

import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { ModelInfo } from "./types.js";

// =============================================================================
// xAI Provider Implementation
// =============================================================================

/**
 * xAI LLM Provider (Grok)
 *
 * Supports xAI's Grok model family including:
 * - grok-2: Latest flagship model
 * - grok-2-mini: Smaller, faster variant
 * - grok-beta: Beta version with experimental features
 *
 * @example
 * ```typescript
 * const provider = new XAIProvider();
 * await provider.initialize({ apiKey: 'xai-...' });
 *
 * const result = await provider.complete({
 *   model: 'grok-2',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class XAIProvider extends OpenAICompatibleProvider {
  /**
   * Default base URL for xAI API
   */
  readonly defaultBaseUrl = "https://api.x.ai/v1";

  /**
   * Provider identifier
   */
  readonly providerName = "xai";

  /**
   * Get the model catalog for xAI
   *
   * @returns Array of available xAI models
   */
  protected getModelCatalog(): ModelInfo[] {
    return [
      {
        id: "grok-2",
        name: "Grok 2",
        provider: "xai",
        contextWindow: 131072,
        maxOutputTokens: 32768,
        supportsTools: true,
        supportsVision: true,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 2.0,
        outputPrice: 10.0,
      },
      {
        id: "grok-2-mini",
        name: "Grok 2 Mini",
        provider: "xai",
        contextWindow: 131072,
        maxOutputTokens: 32768,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.2,
        outputPrice: 1.0,
      },
      {
        id: "grok-beta",
        name: "Grok Beta",
        provider: "xai",
        contextWindow: 131072,
        maxOutputTokens: 32768,
        supportsTools: true,
        supportsVision: true,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 5.0,
        outputPrice: 15.0,
      },
    ];
  }

  /**
   * Get the default model for xAI
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return "grok-2";
  }
}
