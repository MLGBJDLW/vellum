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

import { fetchWithPool } from "@vellum/shared";

import { getProviderModels } from "./models/catalog.js";
import { normalizeDiscoveredModels } from "./models/discovery.js";
import { LMSTUDIO_MODELS, OLLAMA_MODELS } from "./models/providers/local.js";
import type { ModelInfo } from "./models/types.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { CredentialValidationResult, ProviderCredential, ProviderOptions } from "./types.js";

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function discoveryDeadline(signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("Model discovery timed out", "TimeoutError")),
    10_000
  );
  timer.unref();
  return {
    signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    dispose: () => clearTimeout(timer),
  };
}

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
  abstract override listModelsAsync(signal?: AbortSignal): Promise<ModelInfo[]>;

  private configuredBaseUrl?: string;
  private discoveryHeaders: Record<string, string> = {};

  protected get localBaseUrl(): string {
    return (this.configuredBaseUrl ?? this.defaultBaseUrl).replace(/\/$/, "");
  }

  /** Discovery uses the same credential/header owner as completion requests. */
  protected fetchLocal(
    url: string,
    options: {
      method: "GET" | "POST";
      signal: AbortSignal;
      headers?: Record<string, string>;
      body?: string;
    }
  ): Promise<Response> {
    const headers = new Headers(this.discoveryHeaders);
    new Headers(options.headers).forEach((value, key) => {
      headers.set(key, value);
    });
    return fetchWithPool(url, {
      ...options,
      headers: Object.fromEntries(headers),
      redirect: "error",
    });
  }

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
    await super.initialize(finalOptions);
    this.configuredBaseUrl = finalOptions.baseUrl;
    const headers = new Headers(options.headers);
    if (options.apiKey && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${options.apiKey}`);
    }
    this.discoveryHeaders = Object.fromEntries(headers);
  }

  override async refreshModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    return this.listModelsAsync(signal);
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
      const response = await this.fetchLocal(`${this.localBaseUrl}/models`, {
        method: "GET",
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      await response.body?.cancel();

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
      const response = await this.fetchLocal(`${this.localBaseUrl}/models`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      await response.body?.cancel();
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
          `Cannot connect to ${this.providerName} at ${this.localBaseUrl}. ` +
          `Please ensure ${this.providerName} is running.`,
      };
    }

    // Timeout
    if (errorMessage.includes("timeout") || errorMessage.includes("AbortError")) {
      return {
        valid: false,
        error:
          `Connection to ${this.providerName} timed out. ` +
          `Server may be busy or unreachable at ${this.localBaseUrl}.`,
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
    return this.localBaseUrl.replace(/\/v1$/, "");
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
  async listModelsAsync(signal?: AbortSignal): Promise<ModelInfo[]> {
    const deadline = discoveryDeadline(signal);
    try {
      // Ollama uses /api/tags for listing models (not OpenAI-compatible)
      const response = await this.fetchLocal(`${this.ollamaBaseUrl}/api/tags`, {
        method: "GET",
        signal: deadline.signal,
      });

      if (!response.ok) {
        await response.body?.cancel();
        console.warn(
          `Ollama /api/tags returned status ${response.status}, returning empty model list`
        );
        return [];
      }

      const data = (await response.json()) as OllamaTagsResponse;

      const records: Record<string, unknown>[] = data.models.map((model) => ({
        ...model,
        id: model.name,
      }));
      let next = 0;
      // Metadata requests share one deadline and at most four connections, regardless of catalog size.
      await Promise.all(
        Array.from({ length: Math.min(4, records.length) }, async () => {
          while (next < records.length && !deadline.signal.aborted) {
            const record = records[next++];
            if (!record) continue;
            try {
              const detailsResponse = await this.fetchLocal(`${this.ollamaBaseUrl}/api/show`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ model: record.id }),
                signal: deadline.signal,
              });
              if (!detailsResponse.ok) {
                await detailsResponse.body?.cancel();
                continue; // Missing metadata keeps known capabilities or explicit unknowns.
              }
              const details = asRecord(await detailsResponse.json());
              const info = asRecord(details.model_info);
              const architecture = info["general.architecture"];
              const configuredContext =
                typeof details.parameters === "string"
                  ? /^num_ctx\s+(\d+)\s*$/m.exec(details.parameters)?.[1]
                  : undefined;
              Object.assign(record, {
                capabilities: details.capabilities,
                context_length: configuredContext
                  ? Number(configuredContext)
                  : typeof architecture === "string"
                    ? info[`${architecture}.context_length`]
                    : undefined,
              });
            } catch {
              // Failure to inspect a model is not evidence that it rejects tools.
            }
          }
        })
      );
      deadline.signal.throwIfAborted();
      return normalizeDiscoveredModels("ollama", records);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed")) {
        console.warn("Ollama is not running. Start it with: ollama serve");
      } else {
        console.warn(`Failed to list Ollama models: ${errorMessage}`);
      }

      return [];
    } finally {
      deadline.dispose();
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
    return getProviderModels("ollama").map((model) => model.id);
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
      const response = await this.fetchLocal(`${this.ollamaBaseUrl}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      await response.body?.cancel();

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
  async listModelsAsync(signal?: AbortSignal): Promise<ModelInfo[]> {
    const deadline = discoveryDeadline(signal);
    try {
      // Native bulk metadata reports tool training, vision and configured instance context.
      const native = await this.fetchLocal(
        `${this.localBaseUrl.replace(/\/v1$/, "")}/api/v1/models`,
        {
          method: "GET",
          signal: deadline.signal,
        }
      );
      if (native.ok) {
        const payload = asRecord(await native.json());
        if (!Array.isArray(payload.models))
          throw new Error("LM Studio model response is missing models");
        const records = payload.models.flatMap((value) => {
          const model = asRecord(value);
          if (model.type !== "llm" || typeof model.key !== "string") return [];
          const instances = Array.isArray(model.loaded_instances) ? model.loaded_instances : [];
          const loaded = instances.flatMap((value) => {
            const instance = asRecord(value);
            return typeof instance.id === "string"
              ? [
                  {
                    ...model,
                    id: instance.id,
                    context_length: asRecord(instance.config).context_length,
                  },
                ]
              : [];
          });
          return loaded.some((instance) => instance.id === model.key)
            ? loaded
            : [{ ...model, id: model.key }, ...loaded];
        });
        return normalizeDiscoveredModels("lmstudio", records);
      }
      const nativeStatus = native.status;
      await native.body?.cancel();
      if (nativeStatus !== 404 && nativeStatus !== 405)
        throw new Error(`LM Studio metadata returned HTTP ${nativeStatus}`);
      // Older servers/proxies may expose only OpenAI-compatible listing; capabilities stay unknown.
      const response = await this.fetchLocal(`${this.localBaseUrl}/models`, {
        method: "GET",
        signal: deadline.signal,
      });

      if (!response.ok) {
        await response.body?.cancel();
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

      return normalizeDiscoveredModels("lmstudio", data.data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed")) {
        console.warn("LM Studio is not running. Start LM Studio and load a model.");
      } else {
        console.warn(`Failed to list LM Studio models: ${errorMessage}`);
      }

      return [];
    } finally {
      deadline.dispose();
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
    return getProviderModels("lmstudio").map((model) => model.id);
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
