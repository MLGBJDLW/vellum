/**
 * Environment Variable Credential Store
 *
 * Read-only credential store that resolves credentials from environment variables.
 * Supports standard naming conventions for major LLM providers.
 *
 * @module credentials/stores/env-store
 */

import { Err, Ok, type Result } from "../../types/result.js";

import {
  type Credential,
  type CredentialRef,
  type CredentialStore,
  type CredentialStoreError,
  createStoreError,
} from "../types.js";

// =============================================================================
// Environment Variable Mappings
// =============================================================================

/**
 * Standard environment variable names for LLM providers
 */
const PROVIDER_ENV_VARS: Record<string, readonly string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GOOGLE_API_KEY", "GOOGLE_AI_API_KEY", "GEMINI_API_KEY"],
  azure: ["AZURE_OPENAI_API_KEY", "AZURE_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  cohere: ["COHERE_API_KEY"],
  groq: ["GROQ_API_KEY"],
  together: ["TOGETHER_API_KEY"],
  perplexity: ["PERPLEXITY_API_KEY"],
  fireworks: ["FIREWORKS_API_KEY"],
  replicate: ["REPLICATE_API_TOKEN", "REPLICATE_API_KEY"],
  huggingface: ["HUGGINGFACE_API_KEY", "HF_TOKEN", "HF_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  xai: ["XAI_API_KEY"],
} as const;

/**
 * Generate a masked hint from a credential value
 * Shows first 3 and last 3 characters with ellipsis
 */
function generateMaskedHint(value: string): string {
  if (value.length <= 8) {
    return "***";
  }
  return `${value.slice(0, 3)}...${value.slice(-3)}`;
}

/**
 * Normalize provider name to lookup key
 */
function normalizeProvider(provider: string): string {
  return provider.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// =============================================================================
// EnvCredentialStore Implementation
// =============================================================================

/**
 * Environment Variable Credential Store
 *
 * Read-only store that resolves credentials from environment variables.
 * Implements the CredentialStore interface for transparent integration
 * with the credential management system.
 *
 * Features:
 * - Automatic provider -> env var mapping
 * - Support for multiple env var names per provider
 * - Standard credential format output
 *
 * @example
 * ```typescript
 * const store = new EnvCredentialStore();
 *
 * // Get Anthropic API key from ANTHROPIC_API_KEY env var
 * const result = await store.get('anthropic');
 * if (result.ok && result.value) {
 *   console.log('Found:', result.value.maskedHint);
 * }
 * ```
 */
export class EnvCredentialStore implements CredentialStore {
  readonly name = "env" as const;
  readonly priority = 90; // High priority, checked after runtime
  readonly readOnly = true;

  /**
   * Check if the store is available
   * Environment store is always available
   */
  async isAvailable(): Promise<Result<boolean, CredentialStoreError>> {
    return Ok(true);
  }

  /**
   * Get a credential from environment variables
   *
   * @param provider - Provider name (e.g., 'anthropic', 'openai')
   * @param key - Optional specific environment variable name override
   * @returns Credential if found in environment, null otherwise
   */
  async get(
    provider: string,
    key?: string
  ): Promise<Result<Credential | null, CredentialStoreError>> {
    // If a specific key is provided, use it as the env var name
    if (key) {
      const value = process.env[key];
      if (value) {
        return Ok(this.createCredential(provider, key, value));
      }
      return Ok(null);
    }

    // Look up standard env vars for the provider
    const normalizedProvider = normalizeProvider(provider);
    const envVars = PROVIDER_ENV_VARS[normalizedProvider];

    if (!envVars) {
      // Try generic pattern: PROVIDER_API_KEY
      const genericKey = `${provider.toUpperCase()}_API_KEY`;
      const value = process.env[genericKey];
      if (value) {
        return Ok(this.createCredential(provider, genericKey, value));
      }
      return Ok(null);
    }

    // Check each possible env var for this provider
    for (const envVar of envVars) {
      const value = process.env[envVar];
      if (value) {
        return Ok(this.createCredential(provider, envVar, value));
      }
    }

    return Ok(null);
  }

  /**
   * Set operation is not supported (read-only store)
   */
  async set(_credential: Credential): Promise<Result<void, CredentialStoreError>> {
    return Err(
      createStoreError(
        "READ_ONLY",
        "EnvCredentialStore is read-only. Environment variables must be set externally.",
        "env"
      )
    );
  }

  /**
   * Delete operation is not supported (read-only store)
   */
  async delete(_provider: string, _key?: string): Promise<Result<boolean, CredentialStoreError>> {
    return Err(
      createStoreError(
        "READ_ONLY",
        "EnvCredentialStore is read-only. Environment variables must be unset externally.",
        "env"
      )
    );
  }

  /**
   * List all credentials found in environment variables
   *
   * @param provider - Optional filter by provider name
   * @returns Array of credential references (values redacted)
   */
  async list(provider?: string): Promise<Result<readonly CredentialRef[], CredentialStoreError>> {
    const refs: CredentialRef[] = [];

    if (provider) {
      // List for specific provider only
      const result = await this.get(provider);
      if (result.ok && result.value) {
        refs.push(this.toCredentialRef(result.value));
      }
    } else {
      // List all known providers
      for (const providerName of Object.keys(PROVIDER_ENV_VARS)) {
        const result = await this.get(providerName);
        if (result.ok && result.value) {
          refs.push(this.toCredentialRef(result.value));
        }
      }
    }

    return Ok(refs);
  }

  /**
   * Check if a credential exists in environment
   *
   * @param provider - Provider name
   * @param key - Optional specific environment variable name
   */
  async exists(provider: string, key?: string): Promise<Result<boolean, CredentialStoreError>> {
    const result = await this.get(provider, key);
    if (!result.ok) {
      return result;
    }
    return Ok(result.value !== null);
  }

  /**
   * Create a Credential object from environment data
   */
  private createCredential(provider: string, envVar: string, value: string): Credential {
    return {
      id: `env:${provider}:${envVar}`,
      provider,
      type: "api_key",
      value,
      source: "env",
      metadata: {
        label: `${envVar} (environment variable)`,
        tags: { envVar },
      },
      createdAt: new Date(),
    };
  }

  /**
   * Convert a Credential to a CredentialRef (redacted)
   */
  private toCredentialRef(credential: Credential): CredentialRef {
    const { value: _value, ...rest } = credential;
    return {
      ...rest,
      maskedHint: generateMaskedHint(credential.value),
    };
  }
}
