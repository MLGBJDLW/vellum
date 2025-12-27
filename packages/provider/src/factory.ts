import {
  type CredentialManagerLike,
  ProviderRegistry,
  type ProviderRegistryConfig,
} from "./registry.js";
import type { Provider, ProviderCredential, ProviderType } from "./types.js";

// Re-export CredentialManagerLike for backward compatibility
export type { CredentialManagerLike } from "./registry.js";

/**
 * Legacy provider cache for getProvider/clearProviderCache
 */
const legacyProviders: Map<ProviderType, Provider> = new Map();

/**
 * Internal registry for createProvider delegation
 */
let internalRegistry: ProviderRegistry | null = null;

/**
 * Get or create the internal registry
 */
function getInternalRegistry(options: CreateProviderOptions = {}): ProviderRegistry {
  // Create new registry if options specify a credential manager
  if (options.credentialManager) {
    return new ProviderRegistry({
      credentialManager: options.credentialManager,
      enableCache: false, // Don't cache in internal registry, let factory handle caching
    });
  }

  // Use or create default internal registry
  if (!internalRegistry) {
    internalRegistry = new ProviderRegistry({ enableCache: false });
  }
  return internalRegistry;
}

/**
 * Configuration for provider creation
 */
export interface ProviderConfig {
  /** Provider type to create */
  type: ProviderType;
  /** Optional direct credential (takes precedence over credentialManager) */
  credential?: ProviderCredential;
}

/**
 * Options for createProvider function
 */
export interface CreateProviderOptions {
  /** Credential manager for resolving credentials from stores */
  credentialManager?: CredentialManagerLike;
  /** Auto-configure provider with resolved credential (default: true) */
  autoConfigureCredential?: boolean;
}

/**
 * Create a provider instance for the given type
 *
 * If a credentialManager is provided, attempts to resolve and configure
 * the provider with the appropriate credential.
 *
 * @param config - Provider configuration (type and optional direct credential)
 * @param options - Optional credential manager and configuration options
 * @returns Configured provider instance
 * @throws Error if provider type is unknown
 *
 * @deprecated Use ProviderRegistry.get() instead. This function will be removed in a future version.
 *
 * @example
 * ```typescript
 * // Recommended: Use ProviderRegistry
 * import { ProviderRegistry } from '@vellum/provider';
 * const registry = new ProviderRegistry({ credentialManager: manager });
 * const provider = await registry.get({ type: 'anthropic' });
 *
 * // Legacy usage (deprecated)
 * const provider = await createProvider({ type: 'anthropic' });
 * ```
 */
export async function createProvider(
  config: ProviderConfig | ProviderType,
  options: CreateProviderOptions = {}
): Promise<Provider> {
  // Emit deprecation warning
  console.warn(
    "[DEPRECATED] createProvider() is deprecated. Use ProviderRegistry.get() instead. " +
      "See https://github.com/vellum/vellum/blob/main/packages/provider/MIGRATION.md"
  );

  // Normalize config to ProviderConfig
  const normalizedConfig: ProviderConfig = typeof config === "string" ? { type: config } : config;

  const { type, credential: directCredential } = normalizedConfig;
  const { autoConfigureCredential = true } = options;

  // When autoConfigureCredential is false, don't use credential manager
  const registry = autoConfigureCredential ? getInternalRegistry(options) : getInternalRegistry(); // No credential manager

  // Build registry config
  const registryConfig: ProviderRegistryConfig = {
    type,
    credential: autoConfigureCredential ? directCredential : undefined,
  };

  return registry.get(registryConfig);
}

/**
 * Synchronous provider creation (legacy/backward compatible)
 *
 * Creates a provider without credential resolution. Provider will
 * use environment variables for configuration.
 *
 * @param type - Provider type to create
 * @returns Unconfigured provider instance
 * @deprecated Use ProviderRegistry.getSync() instead. This function will be removed in a future version.
 */
export function createProviderSync(type: ProviderType): Provider {
  // Emit deprecation warning
  console.warn(
    "[DEPRECATED] createProviderSync() is deprecated. Use ProviderRegistry.getSync() instead. " +
      "See https://github.com/vellum/vellum/blob/main/packages/provider/MIGRATION.md"
  );

  const registry = getInternalRegistry();
  return registry.getSync(type);
}

/**
 * Get or create a cached provider instance
 *
 * Note: This function uses synchronous creation and cached instances.
 * For credential manager support, use ProviderRegistry instead.
 *
 * @param type - Provider type
 * @returns Cached provider instance
 * @deprecated Use ProviderRegistry.get() or ProviderRegistry.getSync() instead.
 */
export function getProvider(type: ProviderType): Provider {
  // Emit deprecation warning
  console.warn(
    "[DEPRECATED] getProvider() is deprecated. Use ProviderRegistry instead. " +
      "See https://github.com/vellum/vellum/blob/main/packages/provider/MIGRATION.md"
  );

  const existing = legacyProviders.get(type);
  if (existing) {
    return existing;
  }
  const registry = getInternalRegistry();
  const provider = registry.getSync(type);
  legacyProviders.set(type, provider);
  return provider;
}

/**
 * Clear the provider cache
 *
 * Useful for testing or when credentials change.
 *
 * @deprecated Use ProviderRegistry.clear() instead.
 */
export function clearProviderCache(): void {
  legacyProviders.clear();
  if (internalRegistry) {
    internalRegistry.clear();
    internalRegistry = null;
  }
}
