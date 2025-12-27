/**
 * Provider Registry
 *
 * Centralized registry for creating, caching, and managing LLM provider instances.
 * Integrates with CredentialManager for secure credential resolution.
 *
 * @module @vellum/provider/registry
 */

import { AnthropicProvider } from "./anthropic.js";
import { DeepSeekProvider } from "./deepseek.js";
import { GoogleProvider } from "./google.js";
import { GroqProvider } from "./groq.js";
import { LMStudioProvider, OllamaProvider } from "./local.js";
import { OpenAIProvider } from "./openai.js";
import { OpenRouterProvider } from "./openrouter.js";
import { QwenProvider } from "./qwen.js";
import type { Provider, ProviderCredential, ProviderType } from "./types.js";
import { XAIProvider } from "./xai.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Minimal resolved credential interface
 * Compatible with @vellum/core Credential type
 */
interface ResolvedCredential {
  readonly type: "api_key" | "oauth_token" | "bearer_token" | "service_account" | "certificate";
  readonly value: string;
}

/**
 * Result type for credential resolution
 */
interface CredentialResult<T, E> {
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: E;
}

/**
 * Minimal CredentialManager interface
 * Compatible with @vellum/core CredentialManager
 */
export interface CredentialManagerLike {
  resolve(
    provider: string,
    key?: string
  ): Promise<CredentialResult<ResolvedCredential | null, unknown>>;
}

/**
 * Configuration for provider retrieval
 */
export interface ProviderRegistryConfig {
  /** Provider type to create */
  type: ProviderType;
  /** Model ID (used as part of cache key) */
  model?: string;
  /** Direct API key (takes precedence over credentialManager) */
  apiKey?: string;
  /** Direct credential (takes precedence over credentialManager) */
  credential?: ProviderCredential;
}

/**
 * Options for ProviderRegistry
 */
export interface ProviderRegistryOptions {
  /** Credential manager for resolving credentials from stores */
  credentialManager?: CredentialManagerLike;
  /**
   * Validate credentials on provider creation
   * If true, calls provider.validateCredential() after initialization
   * @default false
   */
  validateOnCreate?: boolean;
  /**
   * Enable caching of provider instances
   * @default true
   */
  enableCache?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a cache key for provider instances
 */
function getCacheKey(type: ProviderType, model?: string): string {
  return model ? `${type}:${model}` : type;
}

/**
 * Convert a resolved credential to ProviderCredential
 */
function toProviderCredential(credential: ResolvedCredential): ProviderCredential {
  return {
    type: credential.type,
    value: credential.value,
  };
}

/**
 * Create a provider instance by type
 */
function createProviderInstance(type: ProviderType): Provider {
  switch (type) {
    case "anthropic":
      return new AnthropicProvider();
    case "openai":
      return new OpenAIProvider();
    case "google":
      return new GoogleProvider();
    case "deepseek":
      return new DeepSeekProvider();
    case "qwen":
      return new QwenProvider();
    case "groq":
      return new GroqProvider();
    case "xai":
      return new XAIProvider();
    case "openrouter":
      return new OpenRouterProvider();
    case "ollama":
      return new OllamaProvider();
    case "lmstudio":
      return new LMStudioProvider();
    default:
      throw new Error(`Unknown provider: ${type}`);
  }
}

// =============================================================================
// ProviderRegistry Implementation
// =============================================================================

/**
 * Provider Registry
 *
 * Manages LLM provider instances with:
 * - Credential resolution via CredentialManager
 * - Instance caching by provider+model key
 * - Optional credential validation on creation
 *
 * @example
 * ```typescript
 * // Basic usage
 * const registry = new ProviderRegistry();
 * const provider = await registry.get({ type: 'anthropic' });
 *
 * // With credential manager
 * const manager = new CredentialManager([envStore, keychainStore]);
 * const registry = new ProviderRegistry({
 *   credentialManager: manager,
 *   validateOnCreate: true,
 * });
 *
 * // Get cached provider for specific model
 * const provider = await registry.get({
 *   type: 'anthropic',
 *   model: 'claude-sonnet-4-20250514',
 * });
 *
 * // Direct API key (bypasses credential manager)
 * const provider = await registry.get({
 *   type: 'openai',
 *   apiKey: 'sk-...',
 * });
 * ```
 */
export class ProviderRegistry {
  /** Cached provider instances */
  private readonly cache: Map<string, Provider> = new Map();

  /** Credential manager for resolving credentials */
  private readonly credentialManager?: CredentialManagerLike;

  /** Whether to validate credentials on create */
  private readonly validateOnCreate: boolean;

  /** Whether caching is enabled */
  private readonly enableCache: boolean;

  /**
   * Create a new ProviderRegistry
   *
   * @param options - Registry configuration
   */
  constructor(options: ProviderRegistryOptions = {}) {
    this.credentialManager = options.credentialManager;
    this.validateOnCreate = options.validateOnCreate ?? false;
    this.enableCache = options.enableCache ?? true;
  }

  /**
   * Get or create a provider instance
   *
   * Resolves credentials in the following order:
   * 1. Direct apiKey in config
   * 2. Direct credential in config
   * 3. Credential from credentialManager
   * 4. Environment variables (provider default behavior)
   *
   * @param config - Provider configuration
   * @returns Configured provider instance
   * @throws Error if provider type is unknown or validation fails
   */
  async get(config: ProviderRegistryConfig): Promise<Provider> {
    const { type, model, apiKey, credential: directCredential } = config;
    const cacheKey = getCacheKey(type, model);

    // Return cached instance if available and caching is enabled
    if (this.enableCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Create new provider instance
    const provider = createProviderInstance(type);

    // Resolve credential
    let credential: ProviderCredential | undefined;

    if (apiKey) {
      // Direct API key takes highest precedence
      credential = { type: "api_key", value: apiKey };
    } else if (directCredential) {
      // Direct credential takes second precedence
      credential = directCredential;
    } else if (this.credentialManager) {
      // Resolve from credential manager
      const result = await this.credentialManager.resolve(type);
      if (result.ok && result.value) {
        credential = toProviderCredential(result.value);
      }
      // If not found, provider may fall back to env vars
    }

    // Configure provider with credential if available
    if (credential && provider.configure) {
      // Validate credential before configuring if enabled
      if (this.validateOnCreate && provider.validateCredential) {
        const validation = await provider.validateCredential(credential);
        if (!validation.valid) {
          throw new Error(
            `Credential validation failed for ${type}: ${validation.error || "Invalid credential"}`
          );
        }
      }

      await provider.configure(credential);
    }

    // Cache the provider instance
    if (this.enableCache) {
      this.cache.set(cacheKey, provider);
    }

    return provider;
  }

  /**
   * Get a provider synchronously (no credential resolution)
   *
   * Returns a cached instance or creates a new unconfigured instance.
   * Provider will use environment variables for authentication.
   *
   * @param type - Provider type
   * @param model - Optional model for cache key
   * @returns Provider instance (may be unconfigured)
   */
  getSync(type: ProviderType, model?: string): Provider {
    const cacheKey = getCacheKey(type, model);

    // Return cached instance if available
    if (this.enableCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Create new unconfigured instance
    const provider = createProviderInstance(type);

    // Cache the provider instance
    if (this.enableCache) {
      this.cache.set(cacheKey, provider);
    }

    return provider;
  }

  /**
   * Check if a provider is cached
   *
   * @param type - Provider type
   * @param model - Optional model
   * @returns true if provider is in cache
   */
  has(type: ProviderType, model?: string): boolean {
    return this.cache.has(getCacheKey(type, model));
  }

  /**
   * Remove a provider from the cache
   *
   * @param type - Provider type
   * @param model - Optional model
   * @returns true if provider was removed
   */
  invalidate(type: ProviderType, model?: string): boolean {
    return this.cache.delete(getCacheKey(type, model));
  }

  /**
   * Clear all cached provider instances
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of cached providers
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all cached provider types
   */
  getCachedTypes(): ProviderType[] {
    const types = new Set<ProviderType>();
    for (const key of this.cache.keys()) {
      // Extract type from cache key (format: "type" or "type:model")
      const type = key.split(":")[0] as ProviderType;
      types.add(type);
    }
    return Array.from(types);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Default global registry instance
 *
 * For simple use cases where a single registry is sufficient.
 * For more control, create your own ProviderRegistry instance.
 */
let defaultRegistry: ProviderRegistry | null = null;

/**
 * Get the default global registry
 *
 * Creates a new registry on first call with default options.
 */
export function getDefaultRegistry(): ProviderRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new ProviderRegistry();
  }
  return defaultRegistry;
}

/**
 * Configure the default global registry
 *
 * @param options - Registry options
 * @returns The configured registry
 */
export function configureDefaultRegistry(options: ProviderRegistryOptions): ProviderRegistry {
  defaultRegistry = new ProviderRegistry(options);
  return defaultRegistry;
}

/**
 * Clear the default global registry
 *
 * Useful for testing or when credentials change.
 */
export function clearDefaultRegistry(): void {
  if (defaultRegistry) {
    defaultRegistry.clear();
  }
  defaultRegistry = null;
}
