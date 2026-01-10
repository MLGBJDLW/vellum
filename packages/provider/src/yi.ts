/**
 * Yi Provider (零一万物)
 *
 * Implements support for 01.AI's Yi models via OpenAI-compatible API.
 * Yi offers strong multilingual capabilities with competitive pricing.
 *
 * @module @vellum/provider/yi
 */

import { YI_MODELS } from "./models/providers/yi.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { ModelInfo } from "./types.js";

// =============================================================================
// Yi Provider Implementation
// =============================================================================

/**
 * Yi AI LLM Provider (零一万物)
 *
 * Supports 01.AI's Yi model family including:
 * - yi-large: Flagship model with strong capabilities
 * - yi-large-turbo: Faster variant of the large model
 * - yi-medium: Balanced performance and cost
 * - yi-vision: Multimodal model with image understanding
 *
 * @example
 * ```typescript
 * const provider = new YiProvider();
 * await provider.initialize({ apiKey: 'your-api-key' });
 *
 * const result = await provider.complete({
 *   model: 'yi-large',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class YiProvider extends OpenAICompatibleProvider {
  /**
   * Default base URL for Yi API (Lingyiwanwu)
   */
  readonly defaultBaseUrl = "https://api.lingyiwanwu.com/v1";

  /**
   * Provider identifier
   */
  readonly providerName = "yi";

  /**
   * Get the model catalog for Yi
   *
   * @returns Array of available Yi models
   */
  protected getModelCatalog(): ModelInfo[] {
    return YI_MODELS;
  }

  /**
   * Get the default model for Yi
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return "yi-large";
  }
}
