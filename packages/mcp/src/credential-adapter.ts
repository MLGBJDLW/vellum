// ============================================
// T046: Credential Manager Adapter for OAuth
// ============================================

/**
 * Adapter to bridge @vellum/core CredentialManager to OAuthCredentialManager interface.
 * This allows McpHub to use the core credential system for OAuth token persistence.
 *
 * @module mcp/credential-adapter
 */

import type {
  OAuthCredentialInput,
  OAuthCredentialManager,
  OAuthStoredCredential,
} from "./McpOAuthManager.js";

/**
 * Minimal interface for core CredentialManager.
 * Matches the subset of the API we need for the adapter.
 */
export interface CoreCredentialManager {
  /**
   * Resolve a credential from the store chain.
   * @param provider - Provider name (e.g., 'mcp:server-hash')
   * @param key - Optional specific key within provider namespace
   * @returns Result with credential or null
   */
  resolve(
    provider: string,
    key?: string
  ): Promise<{ ok: boolean; value?: CoreCredential | null; error?: unknown }>;

  /**
   * Store a credential.
   * @param input - Credential input data
   * @param storeName - Optional specific store to write to
   * @returns Result with stored credential
   */
  store(
    input: CoreCredentialInput,
    storeName?: string
  ): Promise<{ ok: boolean; value?: CoreCredential; error?: unknown }>;

  /**
   * Delete a credential from writable stores.
   * @param provider - Provider name
   * @param key - Optional specific key
   * @returns Result with count of stores credential was deleted from
   */
  delete(provider: string, key?: string): Promise<{ ok: boolean; value?: number; error?: unknown }>;
}

/**
 * Core credential structure (simplified).
 */
export interface CoreCredential {
  provider: string;
  type: string;
  value: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Core credential input structure (simplified).
 */
export interface CoreCredentialInput {
  provider: string;
  type: string;
  value: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Creates an OAuthCredentialManager adapter from a core CredentialManager.
 *
 * The adapter translates between the Result-based API of @vellum/core
 * CredentialManager and the simpler OAuthCredentialManager interface
 * expected by McpOAuthManager.
 *
 * @param coreManager - The core CredentialManager instance
 * @returns An OAuthCredentialManager adapter
 *
 * @example
 * ```typescript
 * import { CredentialManager } from '@vellum/core';
 * import { createOAuthCredentialAdapter, McpHub } from '@vellum/mcp';
 *
 * const coreManager = new CredentialManager([...stores]);
 * const oauthAdapter = createOAuthCredentialAdapter(coreManager);
 *
 * const hub = new McpHub({
 *   getMcpServersPath: () => Promise.resolve('~/.vellum/mcp.json'),
 *   getSettingsDirectoryPath: () => Promise.resolve('~/.vellum'),
 *   clientVersion: '1.0.0',
 *   credentialManager: oauthAdapter,
 * });
 * ```
 */
export function createOAuthCredentialAdapter(
  coreManager: CoreCredentialManager
): OAuthCredentialManager {
  return {
    /**
     * Resolve a credential by key.
     * The key is expected to be in format `mcp:<serverId>`.
     */
    async resolve(key: string): Promise<OAuthStoredCredential | null> {
      // The key format is `mcp:serverId`, so we use it as the provider
      const result = await coreManager.resolve(key);

      if (!result.ok || !result.value) {
        return null;
      }

      const credential = result.value;

      // Verify it's an oauth_token type
      if (credential.type !== "oauth_token") {
        return null;
      }

      // Map to OAuthStoredCredential format
      return {
        provider: credential.provider,
        type: "oauth_token",
        value: credential.value,
        expiresAt: credential.expiresAt,
        metadata: credential.metadata as OAuthStoredCredential["metadata"],
      };
    },

    /**
     * Store a credential.
     * Uses the input.provider as the key if key is not provided.
     */
    async store(input: OAuthCredentialInput, key?: string): Promise<void> {
      const credentialKey = key ?? input.provider;

      await coreManager.store({
        provider: credentialKey,
        type: input.type,
        value: input.value,
        expiresAt: input.expiresAt,
        metadata: input.metadata,
      });

      // We ignore the result - the interface expects void
      // In production, you might want to log errors
    },

    /**
     * Delete a credential by key.
     */
    async delete(key: string): Promise<void> {
      await coreManager.delete(key);
      // We ignore the result - the interface expects void
    },
  };
}

/**
 * Type guard to check if an object implements CoreCredentialManager interface.
 * Useful for duck-typing when the exact type is not available.
 */
export function isCoreCredentialManager(obj: unknown): obj is CoreCredentialManager {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof (obj as CoreCredentialManager).resolve === "function" &&
    typeof (obj as CoreCredentialManager).store === "function" &&
    typeof (obj as CoreCredentialManager).delete === "function"
  );
}
