/**
 * OS Keychain Credential Store
 *
 * Secure credential storage using OS-native keychain:
 * - macOS: Keychain
 * - Windows: Credential Vault
 * - Linux: Secret Service (libsecret)
 *
 * Uses `keytar` for cross-platform keychain access.
 *
 * @module credentials/stores/keychain-store
 */

import { Err, Ok, type Result } from "../../types/result.js";

import {
  type Credential,
  type CredentialRef,
  CredentialSchema,
  type CredentialStore,
  type CredentialStoreError,
  createStoreError,
} from "../types.js";

// =============================================================================
// Constants
// =============================================================================

/** Service name for keychain storage */
const SERVICE_NAME = "vellum-credentials";

// =============================================================================
// Keytar Types (for dynamic import)
// =============================================================================

/**
 * Keytar module interface for type safety with dynamic import
 */
interface KeytarModule {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate account name from provider and optional key
 * Format: "{provider}:{key}" or just "{provider}"
 */
function getAccountName(provider: string, key?: string): string {
  return key ? `${provider}:${key}` : provider;
}

/**
 * Parse account name back to provider and key
 */
function parseAccountName(account: string): { provider: string; key?: string } {
  const colonIndex = account.indexOf(":");
  if (colonIndex === -1) {
    return { provider: account };
  }
  return {
    provider: account.slice(0, colonIndex),
    key: account.slice(colonIndex + 1),
  };
}

/**
 * Generate a masked hint from a credential value
 */
function generateMaskedHint(value: string): string {
  if (value.length <= 8) {
    return "***";
  }
  return `${value.slice(0, 3)}...${value.slice(-3)}`;
}

// =============================================================================
// Stored Credential Format
// =============================================================================

/**
 * JSON format stored in keychain
 * Contains credential data along with metadata
 */
interface StoredCredentialData {
  /** Credential ID */
  id: string;
  /** Provider name */
  provider: string;
  /** Credential type */
  type: string;
  /** The secret value */
  value: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: string;
  /** Expiration timestamp */
  expiresAt?: string;
  /** Last rotation timestamp */
  rotatedAt?: string;
}

// =============================================================================
// KeychainStore Implementation
// =============================================================================

/**
 * OS Keychain Credential Store
 *
 * Stores credentials in the OS-native keychain using keytar.
 * Provides the most secure persistent storage option when available.
 *
 * Features:
 * - Native OS security (biometric unlock, secure enclave)
 * - Cross-platform support (macOS, Windows, Linux)
 * - Graceful fallback when unavailable
 * - JSON serialization for full credential metadata
 *
 * @example
 * ```typescript
 * const store = new KeychainStore();
 *
 * // Check availability
 * const available = await store.isAvailable();
 * if (!available.ok || !available.value) {
 *   console.log('Keychain not available, using fallback');
 * }
 *
 * // Store a credential
 * await store.set(credential);
 *
 * // Retrieve it
 * const result = await store.get('anthropic');
 * ```
 */
export class KeychainStore implements CredentialStore {
  readonly name = "keychain" as const;
  readonly priority = 80; // High priority, but below env (90)
  readonly readOnly = false;

  /** Cached keytar module (null if unavailable) */
  private keytarModule: KeytarModule | null = null;
  /** Whether we've attempted to load keytar */
  private keytarLoadAttempted = false;
  /** Error from keytar load attempt */
  private keytarLoadError: Error | null = null;

  /**
   * Attempt to load keytar module dynamically
   * Caches result to avoid repeated import attempts
   */
  private async loadKeytar(): Promise<Result<KeytarModule, CredentialStoreError>> {
    // Return cached result if already attempted
    if (this.keytarLoadAttempted) {
      if (this.keytarModule) {
        return Ok(this.keytarModule);
      }
      return Err(
        createStoreError(
          "STORE_UNAVAILABLE",
          `Keychain access unavailable: ${this.keytarLoadError?.message ?? "keytar module not found"}`,
          "keychain",
          this.keytarLoadError ?? undefined
        )
      );
    }

    this.keytarLoadAttempted = true;

    try {
      // Dynamic import to handle environments where keytar isn't available
      // @ts-expect-error - keytar may not be installed, this is handled at runtime
      const keytar = (await import("keytar")) as KeytarModule & { default?: KeytarModule };
      this.keytarModule = keytar.default ?? keytar;
      return Ok(this.keytarModule);
    } catch (error) {
      this.keytarLoadError = error instanceof Error ? error : new Error(String(error));
      return Err(
        createStoreError(
          "STORE_UNAVAILABLE",
          `Keychain access unavailable: ${this.keytarLoadError.message}`,
          "keychain",
          this.keytarLoadError
        )
      );
    }
  }

  /**
   * Check if the keychain store is available
   *
   * Tests actual keytar functionality by attempting a harmless operation.
   * This catches cases where keytar loads but the underlying service isn't available.
   *
   * Returns false if VELLUM_FORCE_FILE_STORAGE=1 is set, allowing the
   * HybridStore to fall back to encrypted file storage.
   */
  async isAvailable(): Promise<Result<boolean, CredentialStoreError>> {
    // Respect VELLUM_FORCE_FILE_STORAGE environment variable
    const forceFile = process.env.VELLUM_FORCE_FILE_STORAGE;
    if (forceFile === "1" || forceFile === "true") {
      return Ok(false);
    }

    const keytarResult = await this.loadKeytar();
    if (!keytarResult.ok) {
      // Return false, not error - unavailability is expected in some environments
      return Ok(false);
    }

    try {
      // Test keytar by attempting to find credentials (non-destructive)
      await keytarResult.value.findCredentials(SERVICE_NAME);
      return Ok(true);
    } catch (error) {
      // Keytar loaded but backend service unavailable
      return Ok(false);
    }
  }

  /**
   * Get a credential from the keychain
   *
   * @param provider - Provider name (e.g., 'anthropic')
   * @param key - Optional specific key within provider namespace
   */
  async get(
    provider: string,
    key?: string
  ): Promise<Result<Credential | null, CredentialStoreError>> {
    const keytarResult = await this.loadKeytar();
    if (!keytarResult.ok) {
      return keytarResult;
    }

    const account = getAccountName(provider, key);

    try {
      const password = await keytarResult.value.getPassword(SERVICE_NAME, account);

      if (!password) {
        return Ok(null);
      }

      // Parse stored JSON
      const parsed = this.parseStoredCredential(password, provider, key);
      if (!parsed.ok) {
        return parsed;
      }

      return Ok(parsed.value);
    } catch (error) {
      return Err(
        createStoreError(
          "IO_ERROR",
          `Failed to read from keychain: ${error instanceof Error ? error.message : String(error)}`,
          "keychain",
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Store a credential in the keychain
   *
   * @param credential - The credential to store
   */
  async set(credential: Credential): Promise<Result<void, CredentialStoreError>> {
    const keytarResult = await this.loadKeytar();
    if (!keytarResult.ok) {
      return keytarResult;
    }

    const account = getAccountName(credential.provider);

    try {
      // Serialize credential to JSON for storage
      const storedData: StoredCredentialData = {
        id: credential.id,
        provider: credential.provider,
        type: credential.type,
        value: credential.value,
        metadata: credential.metadata,
        createdAt: credential.createdAt.toISOString(),
        expiresAt: credential.expiresAt?.toISOString(),
        rotatedAt: credential.rotatedAt?.toISOString(),
      };

      const jsonString = JSON.stringify(storedData);

      await keytarResult.value.setPassword(SERVICE_NAME, account, jsonString);
      return Ok(undefined);
    } catch (error) {
      return Err(
        createStoreError(
          "IO_ERROR",
          `Failed to write to keychain: ${error instanceof Error ? error.message : String(error)}`,
          "keychain",
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Delete a credential from the keychain
   *
   * @param provider - Provider name
   * @param key - Optional specific key
   */
  async delete(provider: string, key?: string): Promise<Result<boolean, CredentialStoreError>> {
    const keytarResult = await this.loadKeytar();
    if (!keytarResult.ok) {
      return keytarResult;
    }

    const account = getAccountName(provider, key);

    try {
      const deleted = await keytarResult.value.deletePassword(SERVICE_NAME, account);
      return Ok(deleted);
    } catch (error) {
      return Err(
        createStoreError(
          "IO_ERROR",
          `Failed to delete from keychain: ${error instanceof Error ? error.message : String(error)}`,
          "keychain",
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * List all credentials in the keychain for this service
   *
   * @param provider - Optional filter by provider name
   */
  async list(provider?: string): Promise<Result<readonly CredentialRef[], CredentialStoreError>> {
    const keytarResult = await this.loadKeytar();
    if (!keytarResult.ok) {
      return keytarResult;
    }

    try {
      const entries = await keytarResult.value.findCredentials(SERVICE_NAME);
      const refs: CredentialRef[] = [];

      for (const entry of entries) {
        const parsed = parseAccountName(entry.account);

        // Filter by provider if specified
        if (provider && parsed.provider !== provider) {
          continue;
        }

        // Parse the stored credential
        const credentialResult = this.parseStoredCredential(
          entry.password,
          parsed.provider,
          parsed.key
        );

        if (credentialResult.ok && credentialResult.value) {
          refs.push(this.toCredentialRef(credentialResult.value));
        }
      }

      return Ok(refs);
    } catch (error) {
      return Err(
        createStoreError(
          "IO_ERROR",
          `Failed to list keychain credentials: ${error instanceof Error ? error.message : String(error)}`,
          "keychain",
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Check if a credential exists in the keychain
   *
   * @param provider - Provider name
   * @param key - Optional specific key
   */
  async exists(provider: string, key?: string): Promise<Result<boolean, CredentialStoreError>> {
    const result = await this.get(provider, key);
    if (!result.ok) {
      return result;
    }
    return Ok(result.value !== null);
  }

  /**
   * Parse stored JSON back to Credential
   */
  private parseStoredCredential(
    jsonString: string,
    provider: string,
    key?: string
  ): Result<Credential, CredentialStoreError> {
    try {
      const data = JSON.parse(jsonString) as StoredCredentialData;

      // Validate with Zod schema
      const credential = CredentialSchema.parse({
        id: data.id ?? `keychain:${getAccountName(provider, key)}`,
        provider: data.provider ?? provider,
        type: data.type ?? "api_key",
        value: data.value,
        source: "keychain",
        metadata: data.metadata ?? {},
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        rotatedAt: data.rotatedAt ? new Date(data.rotatedAt) : undefined,
      });

      return Ok(credential);
    } catch (error) {
      return Err(
        createStoreError(
          "DECRYPTION_ERROR",
          `Failed to parse keychain credential: ${error instanceof Error ? error.message : String(error)}`,
          "keychain",
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Convert a Credential to a CredentialRef (value redacted)
   */
  private toCredentialRef(credential: Credential): CredentialRef {
    const { value, ...rest } = credential;
    return {
      ...rest,
      maskedHint: generateMaskedHint(value),
    };
  }
}
