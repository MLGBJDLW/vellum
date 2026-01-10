/**
 * Local Provider Implementations
 *
 * Support for locally-hosted LLM servers including:
 * - Ollama (default: localhost:11434)
 * - LM Studio (default: localhost:1234)
 *
 * These providers extend OpenAICompatibleProvider but don't require
 * API key authentication - only connectivity to the local server.
 *
 * @module @vellum/provider/local
 */

import { LMSTUDIO_MODELS, OLLAMA_MODELS } from "./models/providers/local.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type {
  CredentialValidationResult,
  ModelInfo,
  ProviderCredential,
  ProviderOptions,
} from "./types.js";

// =============================================================================
// LocalProvider Abstract Base Class
// =============================================================================

/**
 * Abstract base class for local LLM providers
 *
 * Extends OpenAICompatibleProvider with modifications for local servers:
 * - No API key required (validates connectivity instead)
 * - Graceful handling of connection refused errors
 * - Dynamic model discovery from server
 *
 * @example
 * ```typescript
 * const ollama = new OllamaProvider();
 * await ollama.initialize({}); // No API key needed
 * const models = await ollama.listModelsAsync();
 * ```
 */
export abstract class LocalProvider extends OpenAICompatibleProvider {
  /**
   * Initialize the provider with configuration options
   *
   * Override to not require API key - local providers only need connectivity.
   *
   * @param options - Provider configuration (API key optional)
   */
  async initialize(options: ProviderOptions): Promise<void> {
    // For local providers, we don't require an API key
    // Pass a placeholder if none provided to satisfy parent class
    const finalOptions: ProviderOptions = {
      ...options,
      apiKey: options.apiKey ?? "local-no-key-required",
      baseUrl: options.baseUrl ?? this.defaultBaseUrl,
    };
    return super.initialize(finalOptions);
  }

  /**
   * Validate a credential by checking server connectivity
   *
   * For local providers, we don't validate API key format.
   * Instead, we check if the local server is reachable.
   *
   * @param _credential - Credential (ignored for local providers)
   * @returns Validation result based on server connectivity
   */
  async validateCredential(_credential: ProviderCredential): Promise<CredentialValidationResult> {
    try {
      const response = await fetch(`${this.defaultBaseUrl}/models`, {
        method: "GET",
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (response.ok) {
        return { valid: true };
      }

      return {
        valid: false,
        error: `${this.providerName} server responded with status ${response.status}`,
      };
    } catch (error) {
      return this.handleConnectionError(error);
    }
  }

  /**
   * Check if the local server is running and accessible
   *
   * @returns Promise resolving to true if server is accessible
   */
  async isServerRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.defaultBaseUrl}/models`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Handle connection errors with user-friendly messages
   *
   * @param error - The caught error
   * @returns CredentialValidationResult with helpful error message
   */
  protected handleConnectionError(error: unknown): CredentialValidationResult {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Connection refused - server not running
    if (
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("fetch failed") ||
      errorMessage.includes("connect ECONNREFUSED")
    ) {
      return {
        valid: false,
        error:
          `Cannot connect to ${this.providerName} at ${this.defaultBaseUrl}. ` +
          `Please ensure ${this.providerName} is running.`,
      };
    }

    // Timeout
    if (errorMessage.includes("timeout") || errorMessage.includes("AbortError")) {
      return {
        valid: false,
        error:
          `Connection to ${this.providerName} timed out. ` +
          `Server may be busy or unreachable at ${this.defaultBaseUrl}.`,
      };
    }

    // Generic error
    return {
      valid: false,
      error: `Failed to connect to ${this.providerName}: ${errorMessage}`,
    };
  }
}

// =============================================================================
// OllamaProvider Implementation
// =============================================================================

/**
 * Response type for Ollama /api/tags endpoint
 */
interface OllamaTagsResponse {
  models: Array<{
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details?: {
      parameter_size?: string;
      quantization_level?: string;
      family?: string;
    };
  }>;
}

/**
 * Ollama LLM Provider
 *
 * Connects to locally-running Ollama server for inference.
 * Supports dynamic model discovery from installed models.
 *
 * Default endpoint: http://localhost:11434/v1
 *
 * @example
 * ```typescript
 * const ollama = new OllamaProvider();
 * await ollama.initialize({});
 *
 * // List available models
 * const models = await ollama.listModelsAsync();
 *
 * // Run completion
 * const result = await ollama.complete({
 *   model: 'llama3.2',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class OllamaProvider extends LocalProvider {
  /**
   * Default base URL for Ollama's OpenAI-compatible API
   */
  readonly defaultBaseUrl = "http://localhost:11434/v1";

  /**
   * Provider identifier
   */
  readonly providerName = "ollama";

  /**
   * Base URL without /v1 suffix for Ollama-native endpoints
   */
  private get ollamaBaseUrl(): string {
    return this.defaultBaseUrl.replace(/\/v1$/, "");
  }

  /**
   * Get the model catalog from Ollama
   *
   * Returns static catalog as fallback - use listModelsAsync() for dynamic discovery.
   *
   * @returns Static catalog (for fallback when server unavailable)
   */
  protected getModelCatalog(): ModelInfo[] {
    return OLLAMA_MODELS;
  }

  /**
   * List available models from Ollama server
   *
   * Fetches from Ollama's native /api/tags endpoint for model discovery.
   *
   * @returns Promise resolving to array of ModelInfo
   */
  async listModelsAsync(): Promise<ModelInfo[]> {
    try {
      // Ollama uses /api/tags for listing models (not OpenAI-compatible)
      const response = await fetch(`${this.ollamaBaseUrl}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(
          `Ollama /api/tags returned status ${response.status}, returning empty model list`
        );
        return [];
      }

      const data = (await response.json()) as OllamaTagsResponse;

      return data.models.map((model) => ({
        id: model.name,
        name: model.name,
        provider: "ollama" as const,
        contextWindow: 4096, // Default, varies by model
        maxOutputTokens: 4096,
        supportsTools: true, // Most Ollama models support tools
        supportsVision: this.modelSupportsVision(model.name),
        supportsReasoning: false,
        supportsStreaming: true,
        // Local models are free
        inputPrice: 0,
        outputPrice: 0,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed")) {
        console.warn("Ollama is not running. Start it with: ollama serve");
      } else {
        console.warn(`Failed to list Ollama models: ${errorMessage}`);
      }

      return [];
    }
  }

  /**
   * List model IDs synchronously
   *
   * Returns empty array for local providers - use listModelsAsync() instead.
   *
   * @returns Empty array (sync model list not available)
   */
  listModels(): string[] {
    // Cannot list models synchronously - must use listModelsAsync
    return [];
  }

  /**
   * Get the default model for Ollama
   *
   * @returns Default model ID (commonly available model)
   */
  getDefaultModel(): string {
    return "llama3.2";
  }

  /**
   * Check if a model name suggests vision support
   *
   * @param modelName - Name of the model
   * @returns true if model likely supports vision
   */
  private modelSupportsVision(modelName: string): boolean {
    const visionKeywords = ["vision", "llava", "bakllava", "moondream"];
    const lowerName = modelName.toLowerCase();
    return visionKeywords.some((keyword) => lowerName.includes(keyword));
  }

  /**
   * Validate credential by checking Ollama server connectivity
   *
   * Uses Ollama-native endpoint for validation.
   *
   * @param _credential - Credential (ignored for Ollama)
   * @returns Validation result based on server connectivity
   */
  async validateCredential(_credential: ProviderCredential): Promise<CredentialValidationResult> {
    try {
      // Use Ollama-native endpoint for validation
      const response = await fetch(`${this.ollamaBaseUrl}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        return { valid: true };
      }

      return {
        valid: false,
        error: `Ollama server responded with status ${response.status}`,
      };
    } catch (error) {
      return this.handleConnectionError(error);
    }
  }
}

// =============================================================================
// LMStudioProvider Implementation
// =============================================================================

/**
 * LM Studio LLM Provider
 *
 * Connects to locally-running LM Studio server for inference.
 * Uses standard OpenAI-compatible /v1/models endpoint.
 *
 * Default endpoint: http://localhost:1234/v1
 *
 * @example
 * ```typescript
 * const lmStudio = new LMStudioProvider();
 * await lmStudio.initialize({});
 *
 * // List available models
 * const models = await lmStudio.listModelsAsync();
 *
 * // Run completion
 * const result = await lmStudio.complete({
 *   model: 'local-model',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class LMStudioProvider extends LocalProvider {
  /**
   * Default base URL for LM Studio's OpenAI-compatible API
   */
  readonly defaultBaseUrl = "http://localhost:1234/v1";

  /**
   * Provider identifier
   */
  readonly providerName = "lmstudio";

  /**
   * Get the model catalog from LM Studio
   *
   * Returns static catalog as fallback - use listModelsAsync() for dynamic discovery.
   *
   * @returns Static catalog (for fallback when server unavailable)
   */
  protected getModelCatalog(): ModelInfo[] {
    return LMSTUDIO_MODELS;
  }

  /**
   * List available models from LM Studio server
   *
   * Uses standard OpenAI-compatible /v1/models endpoint.
   *
   * @returns Promise resolving to array of ModelInfo
   */
  async listModelsAsync(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.defaultBaseUrl}/models`, {
        method: "GET",
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(
          `LM Studio /models returned status ${response.status}, returning empty model list`
        );
        return [];
      }

      const data = (await response.json()) as {
        data: Array<{
          id: string;
          object: string;
          created?: number;
          owned_by?: string;
        }>;
      };

      return data.data.map((model) => ({
        id: model.id,
        name: model.id,
        provider: "lmstudio" as const,
        contextWindow: 4096, // Default, varies by model
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: false, // Assume no vision unless detected
        supportsReasoning: false,
        supportsStreaming: true,
        // Local models are free
        inputPrice: 0,
        outputPrice: 0,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed")) {
        console.warn("LM Studio is not running. Start LM Studio and load a model.");
      } else {
        console.warn(`Failed to list LM Studio models: ${errorMessage}`);
      }

      return [];
    }
  }

  /**
   * List model IDs synchronously
   *
   * Returns empty array for local providers - use listModelsAsync() instead.
   *
   * @returns Empty array (sync model list not available)
   */
  listModels(): string[] {
    return [];
  }

  /**
   * Get the default model for LM Studio
   *
   * Returns a generic name since models vary by user's loaded model.
   *
   * @returns Default model ID placeholder
   */
  getDefaultModel(): string {
    return "local-model";
  }
}
