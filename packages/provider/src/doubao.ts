/**
 * Doubao Provider (ByteDance/Volcengine)
 *
 * Implements support for ByteDance's Doubao models via OpenAI-compatible API.
 * Doubao offers strong multilingual capabilities and competitive pricing.
 *
 * @module @vellum/provider/doubao
 */

import { DOUBAO_MODELS } from "./models/providers/doubao.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { ModelInfo } from "./types.js";

// =============================================================================
// Doubao Provider Implementation
// =============================================================================

/**
 * Doubao LLM Provider (ByteDance/Volcengine)
 *
 * Supports ByteDance's Doubao model family including:
 * - doubao-seed-code-preview: Coding-focused model
 * - doubao-seed-1-6: Latest seed model
 * - doubao-1-5-pro: Production-grade model
 * - doubao-1-5-vision-pro: Vision-capable model
 *
 * @example
 * ```typescript
 * const provider = new DoubaoProvider();
 * await provider.initialize({ apiKey: 'your-api-key' });
 *
 * const result = await provider.complete({
 *   model: 'doubao-1-5-pro-256k-250115',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class DoubaoProvider extends OpenAICompatibleProvider {
  /**
   * Default base URL for Doubao API (Volcengine ARK)
   * @see https://www.volcengine.com/docs/82379/1099334
   */
  readonly defaultBaseUrl = "https://ark.cn-beijing.volces.com/api/v3";

  /**
   * Provider identifier
   */
  readonly providerName = "doubao";

  /**
   * Get the model catalog for Doubao
   *
   * @returns Array of available Doubao models
   */
  protected getModelCatalog(): ModelInfo[] {
    return DOUBAO_MODELS;
  }

  /**
   * Get the default model for Doubao
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return "doubao-1-5-pro-256k-250115";
  }
}
