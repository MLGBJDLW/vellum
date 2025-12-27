/**
 * OpenRouter Provider
 *
 * Implements support for OpenRouter's unified API that provides access
 * to multiple LLM providers through a single interface.
 *
 * @module @vellum/provider/openrouter
 */

import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { ModelInfo, ProviderOptions } from "./types.js";

// =============================================================================
// OpenRouter Provider Options
// =============================================================================

/**
 * Extended options for OpenRouter provider
 */
export interface OpenRouterProviderOptions extends ProviderOptions {
  /**
   * HTTP Referer header for request attribution
   * Recommended for tracking and rate limit improvements
   */
  httpReferer?: string;

  /**
   * Application title for request attribution
   * Displayed in OpenRouter dashboard
   */
  appTitle?: string;
}

// =============================================================================
// OpenRouter Provider Implementation
// =============================================================================

/**
 * OpenRouter LLM Provider
 *
 * Provides unified access to multiple LLM providers including:
 * - openai/gpt-4o: OpenAI's GPT-4o
 * - anthropic/claude-3-sonnet: Anthropic's Claude 3 Sonnet
 * - google/gemini-pro: Google's Gemini Pro
 * - meta-llama/llama-3.3-70b-instruct: Meta's Llama 3.3
 * - mistralai/mistral-large: Mistral's Large model
 *
 * Supports custom headers for request attribution:
 * - HTTP-Referer: Your app's URL
 * - X-Title: Your app's name
 *
 * @example
 * ```typescript
 * const provider = new OpenRouterProvider();
 * await provider.initialize({
 *   apiKey: 'sk-or-...',
 *   httpReferer: 'https://myapp.com',
 *   appTitle: 'My Application',
 * });
 *
 * const result = await provider.complete({
 *   model: 'openai/gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class OpenRouterProvider extends OpenAICompatibleProvider {
  /**
   * Default base URL for OpenRouter API
   */
  readonly defaultBaseUrl = "https://openrouter.ai/api/v1";

  /**
   * Provider identifier
   */
  readonly providerName = "openrouter";

  /**
   * Initialize the provider with OpenRouter-specific options
   *
   * @param options - Provider configuration including custom headers
   */
  async initialize(options: OpenRouterProviderOptions): Promise<void> {
    const headers: Record<string, string> = { ...options.headers };

    // Add OpenRouter-specific headers if provided
    if (options.httpReferer) {
      headers["HTTP-Referer"] = options.httpReferer;
    }
    if (options.appTitle) {
      headers["X-Title"] = options.appTitle;
    }

    const finalOptions: ProviderOptions = {
      ...options,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    };

    return super.initialize(finalOptions);
  }

  /**
   * Get the model catalog for OpenRouter
   *
   * Note: OpenRouter provides access to many models. This is a curated
   * list of popular models. Use listModelsAsync() for the full catalog.
   *
   * @returns Array of popular OpenRouter models
   */
  protected getModelCatalog(): ModelInfo[] {
    return [
      {
        id: "openai/gpt-4o",
        name: "GPT-4o (via OpenRouter)",
        provider: "openrouter",
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsTools: true,
        supportsVision: true,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 2.5,
        outputPrice: 10.0,
      },
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o Mini (via OpenRouter)",
        provider: "openrouter",
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsTools: true,
        supportsVision: true,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.15,
        outputPrice: 0.6,
      },
      {
        id: "anthropic/claude-3.5-sonnet",
        name: "Claude 3.5 Sonnet (via OpenRouter)",
        provider: "openrouter",
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 3.0,
        outputPrice: 15.0,
      },
      {
        id: "anthropic/claude-3-haiku",
        name: "Claude 3 Haiku (via OpenRouter)",
        provider: "openrouter",
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: true,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.25,
        outputPrice: 1.25,
      },
      {
        id: "google/gemini-pro-1.5",
        name: "Gemini Pro 1.5 (via OpenRouter)",
        provider: "openrouter",
        contextWindow: 2000000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 1.25,
        outputPrice: 5.0,
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct",
        name: "Llama 3.3 70B Instruct (via OpenRouter)",
        provider: "openrouter",
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0.4,
        outputPrice: 0.4,
      },
      {
        id: "mistralai/mistral-large",
        name: "Mistral Large (via OpenRouter)",
        provider: "openrouter",
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 2.0,
        outputPrice: 6.0,
      },
    ];
  }

  /**
   * Get the default model for OpenRouter
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return "openai/gpt-4o";
  }
}
