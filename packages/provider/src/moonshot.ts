/**
 * Moonshot Provider (月之暗面/Kimi)
 *
 * Implements support for Moonshot AI's models via OpenAI-compatible API.
 * Known for the Kimi assistant with strong long-context capabilities.
 *
 * @module @vellum/provider/moonshot
 */

import { MOONSHOT_MODELS } from "./models/providers/moonshot.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { ModelInfo } from "./types.js";

// =============================================================================
// Moonshot Provider Implementation
// =============================================================================

/**
 * Moonshot AI LLM Provider (月之暗面/Kimi)
 *
 * Supports Moonshot's model family with varying context windows:
 * - moonshot-v1-8k: Standard context (8K tokens)
 * - moonshot-v1-32k: Extended context (32K tokens)
 * - moonshot-v1-128k: Long context (128K tokens)
 *
 * @example
 * ```typescript
 * const provider = new MoonshotProvider();
 * await provider.initialize({ apiKey: 'sk-...' });
 *
 * const result = await provider.complete({
 *   model: 'moonshot-v1-128k',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class MoonshotProvider extends OpenAICompatibleProvider {
  /**
   * Default base URL for Moonshot API
   */
  readonly defaultBaseUrl = "https://api.moonshot.cn/v1";

  /**
   * Provider identifier
   */
  readonly providerName = "moonshot";

  /**
   * Get the model catalog for Moonshot
   *
   * @returns Array of available Moonshot models
   */
  protected getModelCatalog(): ModelInfo[] {
    return MOONSHOT_MODELS;
  }

  /**
   * Get the default model for Moonshot
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return "moonshot-v1-32k";
  }
}
