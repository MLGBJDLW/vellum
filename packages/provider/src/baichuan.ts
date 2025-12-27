/**
 * Baichuan Provider (百川)
 *
 * Implements support for Baichuan AI's models via OpenAI-compatible API.
 * Known for strong Chinese language understanding and generation.
 *
 * @module @vellum/provider/baichuan
 */

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
    return [
      {
        id: "Baichuan4",
        name: "Baichuan 4",
        provider: "baichuan",
        contextWindow: 32000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: true,
        supportsStreaming: true,
        inputPrice: 0.1,
        outputPrice: 0.1,
      },
      {
        id: "Baichuan3-Turbo",
        name: "Baichuan 3 Turbo",
        provider: "baichuan",
        contextWindow: 32000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.012,
        outputPrice: 0.012,
      },
      {
        id: "Baichuan3-Turbo-128k",
        name: "Baichuan 3 Turbo 128K",
        provider: "baichuan",
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.024,
        outputPrice: 0.024,
      },
      {
        id: "Baichuan2-Turbo",
        name: "Baichuan 2 Turbo",
        provider: "baichuan",
        contextWindow: 32000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.008,
        outputPrice: 0.008,
      },
      {
        id: "Baichuan2-Turbo-192k",
        name: "Baichuan 2 Turbo 192K",
        provider: "baichuan",
        contextWindow: 192000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.016,
        outputPrice: 0.016,
      },
    ];
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
