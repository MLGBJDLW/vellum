/**
 * OpenAI-Compatible Provider Base Class
 *
 * Abstract base class for providers that implement OpenAI-compatible APIs.
 * Subclasses only need to specify:
 * - defaultBaseUrl: The API endpoint
 * - providerName: Unique identifier for the provider
 * - Override listModels()/listModelsAsync() to return provider-specific models
 *
 * This enables easy integration with providers like:
 * - Groq
 * - Together AI
 * - Fireworks AI
 * - OpenRouter
 * - Local LLMs (Ollama, LM Studio, etc.)
 *
 * @module @vellum/provider/openai-compat
 */

import { OpenAIProvider } from "./openai.js";
import type { TransformConfig } from "./transforms/types.js";
import type { ModelInfo, ProviderOptions, ProviderType } from "./types.js";

// =============================================================================
// OpenAICompatibleProvider Abstract Base Class
// =============================================================================

/**
 * Abstract base class for OpenAI-compatible API providers
 *
 * Extends OpenAIProvider to reuse its implementation while allowing
 * subclasses to specify different API endpoints and model lists.
 *
 * @example
 * ```typescript
 * export class GroqProvider extends OpenAICompatibleProvider {
 *   readonly defaultBaseUrl = 'https://api.groq.com/openai/v1';
 *   readonly providerName = 'groq';
 *
 *   protected getModelCatalog(): ModelInfo[] {
 *     return [
 *       { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', ... }
 *     ];
 *   }
 * }
 * ```
 */
export abstract class OpenAICompatibleProvider extends OpenAIProvider {
  /**
   * The default base URL for this provider's API
   * Subclasses MUST override this with their API endpoint
   */
  abstract readonly defaultBaseUrl: string;

  /**
   * Unique identifier for this provider
   * Used for logging, error messages, and model attribution
   */
  abstract readonly providerName: string;

  /**
   * Initialize the provider with configuration options
   *
   * Automatically applies defaultBaseUrl if no baseUrl is provided in options.
   * This allows users to override the base URL if needed (e.g., for proxies).
   *
   * @param options - Provider configuration including API key
   * @throws ProviderError if initialization fails
   */
  async initialize(options: ProviderOptions): Promise<void> {
    const finalOptions: ProviderOptions = {
      ...options,
      baseUrl: options.baseUrl ?? this.defaultBaseUrl,
    };
    return super.initialize(finalOptions);
  }

  /**
   * Get the model catalog for this provider
   *
   * Subclasses SHOULD override this to return their specific model catalog.
   * Default implementation returns an empty array.
   *
   * @returns Array of model information for this provider
   */
  protected getModelCatalog(): ModelInfo[] {
    // Subclasses should override this with their specific models
    return [];
  }

  /**
   * List available model IDs for this provider (synchronous)
   *
   * @returns Array of model IDs
   */
  listModels(): string[] {
    return this.getModelCatalog().map((m) => m.id);
  }

  /**
   * List available models with full details
   *
   * @returns Promise resolving to array of ModelInfo
   */
  async listModelsAsync(): Promise<ModelInfo[]> {
    return this.getModelCatalog();
  }

  /**
   * Get the default model ID for this provider
   *
   * Subclasses SHOULD override this to return their preferred default model.
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    const models = this.getModelCatalog();
    const firstModel = models[0];
    return firstModel ? firstModel.id : "gpt-4o";
  }

  /**
   * Create transform config for OpenAI-compatible provider.
   * Uses the provider-specific transform from the registry.
   *
   * @param model - Optional model ID for model-specific features
   */
  protected override createTransformConfig(model?: string): TransformConfig {
    return {
      provider: this.providerName as ProviderType,
      modelId: model,
    };
  }
}
