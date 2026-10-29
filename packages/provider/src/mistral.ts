import { DEFAULT_MODEL_IDS } from "./models/catalog.js";
/**
 * Mistral Provider
 *
 * Implements support for Mistral AI's models via OpenAI-compatible API.
 * Mistral offers a range of models from efficient to powerful.
 *
 * @module @vellum/provider/mistral
 */

import { MISTRAL_MODELS } from "./models/providers/mistral.js";
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
  protected override normalizeAssistantContent(content: unknown): {
    text: string;
    thinking?: string;
  } {
    if (!Array.isArray(content)) return super.normalizeAssistantContent(content);
    let text = "";
    let thinking = "";
    for (const chunk of content) {
      if (!chunk || typeof chunk !== "object") continue;
      if (chunk.type === "text" && typeof chunk.text === "string") text += chunk.text;
      if (chunk.type === "thinking" && Array.isArray(chunk.thinking)) {
        for (const part of chunk.thinking) {
          if (part?.type === "text" && typeof part.text === "string") thinking += part.text;
        }
      }
    }
    return { text, ...(thinking ? { thinking } : {}) };
  }

  protected override getThinkingReplay(content: unknown): Record<string, unknown>[] | undefined {
    if (!Array.isArray(content)) return undefined;
    const blocks = content.filter(
      (chunk): chunk is Record<string, unknown> =>
        chunk !== null && typeof chunk === "object" && chunk.type === "thinking"
    );
    return blocks.length > 0 ? blocks : undefined;
  }

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
    return MISTRAL_MODELS;
  }

  /**
   * Get the default model for Mistral
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return DEFAULT_MODEL_IDS.mistral;
  }
}
