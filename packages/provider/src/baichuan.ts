/**
 * Baichuan Provider (百川)
 *
 * Implements support for Baichuan AI's models via OpenAI-compatible API.
 * Known for strong Chinese language understanding and generation.
 *
 * @module @vellum/provider/baichuan
 */

import { BAICHUAN_MODELS } from "./models/providers/baichuan.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { ModelInfo } from "./types.js";

// =============================================================================
// Baichuan Provider Implementation
// =============================================================================

/**
 * Baichuan AI LLM Provider (百川)
 *
 * Supports Baichuan's model family including:
 * - Baichuan4: Latest flagship model
 * - Baichuan3-Turbo: Fast, efficient model
 * - Baichuan3-Turbo-128k: Extended context version
 * - Baichuan2-Turbo: Previous generation turbo model
 *
 * @example
 * ```typescript
 * const provider = new BaichuanProvider();
 * await provider.initialize({ apiKey: 'your-api-key' });
 *
 * const result = await provider.complete({
 *   model: 'Baichuan4',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class BaichuanProvider extends OpenAICompatibleProvider {
  /**
   * Default base URL for Baichuan API
   */
  readonly defaultBaseUrl = "https://api.baichuan-ai.com/v1";

  /**
   * Provider identifier
   */
  readonly providerName = "baichuan";

  /**
   * Get the model catalog for Baichuan
   *
   * @returns Array of available Baichuan models
   */
  protected getModelCatalog(): ModelInfo[] {
    return BAICHUAN_MODELS;
  }

  /**
   * Get the default model for Baichuan
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return "Baichuan4";
  }
}
