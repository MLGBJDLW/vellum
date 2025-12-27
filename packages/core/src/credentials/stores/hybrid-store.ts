/**
 * Hybrid Credential Store
 *
 * Auto-switching credential store that uses OS keychain when available,
 * falling back to encrypted file storage transparently.
 *
 * @module credentials/stores/hybrid-store
 */

import type { Result } from "../../types/result.js";

import type { Credential, CredentialRef, CredentialStore, CredentialStoreError } from "../types.js";

import { EncryptedFileStore } from "./encrypted-file-store.js";
import { KeychainStore } from "./keychain-store.js";

// =============================================================================
// Environment Variable Constants
// =============================================================================

/**
 * Environment variable to force file-based storage
 * Useful for CI/CD, headless servers, and containers
 */
const FORCE_FILE_STORAGE_ENV = "VELLUM_FORCE_FILE_STORAGE";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if file storage is forced via environment variable
 */
function isFileStorageForced(): boolean {
  const value = process.env[FORCE_FILE_STORAGE_ENV];
  return value === "1" || value === "true";
}

// =============================================================================
// HybridStore Options
// =============================================================================

/**
 * Options for HybridCredentialStore construction
 */
export interface HybridCredentialStoreOptions {
  /**
   * Path to the encrypted credentials file (used for fallback)
   */
  readonly filePath: string;

  /**
   * Password for encrypted file storage
   */
  readonly password: string;

  /**
   * Force file storage regardless of keychain availability
   * Overrides VELLUM_FORCE_FILE_STORAGE env var (defaults to env var value)
   */
  readonly forceFileStorage?: boolean;
}

// =============================================================================
// HybridCredentialStore Implementation
// =============================================================================

/**
 * Hybrid Credential Store
 *
 * Provides transparent credential storage with automatic backend selection:
 * - Primary: OS keychain (when available and not forced to file)
 * - Fallback: Encrypted file storage
 *
 * The store auto-detects keychain availability at construction and
 * automatically falls back to file storage when keychain is unavailable.
 *
 * Features:
 * - Transparent API - callers don't need to know which backend is used
 * - Respects VELLUM_FORCE_FILE_STORAGE=1 environment variable
 * - Auto-detection of keychain availability
 * - Lazy initialization of actual store
 *
 * @example
 * ```typescript
 * const store = new HybridCredentialStore({
 *   filePath: '~/.vellum/credentials.enc',
 *   password: process.env.VELLUM_MASTER_PASSWORD!,
 * });
 *
 * // Uses keychain if available, otherwise encrypted file
 * await store.set(credential);
 *
 * // Retrieve transparently
 * const result = await store.get('anthropic');
 * ```
 */
export class HybridCredentialStore implements CredentialStore {
  readonly name = "keychain" as const; // Reports as keychain for compatibility
  readonly priority = 80; // Same as keychain
  readonly readOnly = false;

  private readonly options: HybridCredentialStoreOptions;
  private readonly forceFileStorage: boolean;

  /** The actual backing store (keychain or file) */
  private backingStore: CredentialStore | null = null;

  /** Whether initialization has been attempted */
  private initialized = false;

  /** Whether keychain was detected as available */
  private keychainAvailable = false;

  /**
   * Create a new HybridCredentialStore
   *
   * @param options - Configuration options
   */
  constructor(options: HybridCredentialStoreOptions) {
    this.options = options;
    // Check forceFileStorage option first, then fall back to env var
    this.forceFileStorage = options.forceFileStorage ?? isFileStorageForced();
  }

  /**
   * Initialize the backing store based on availability
   *
   * Called lazily on first operation to determine which store to use.
   */
  private async initializeStore(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    // If file storage is forced, use file store directly
    if (this.forceFileStorage) {
      this.backingStore = new EncryptedFileStore({
        filePath: this.options.filePath,
        password: this.options.password,
      });
      this.keychainAvailable = false;
      return;
    }

    // Try keychain first
    const keychainStore = new KeychainStore();
    const keychainResult = await keychainStore.isAvailable();

    if (keychainResult.ok && keychainResult.value) {
      // Keychain is available, use it
      this.backingStore = keychainStore;
      this.keychainAvailable = true;
      return;
    }

    // Fall back to encrypted file store
    this.backingStore = new EncryptedFileStore({
      filePath: this.options.filePath,
      password: this.options.password,
    });
    this.keychainAvailable = false;
  }

  /**
   * Get the backing store, initializing if needed
   */
  private async getBackingStore(): Promise<CredentialStore> {
    await this.initializeStore();
    // After initialization, backingStore is guaranteed to be set
    return this.backingStore!;
  }

  /**
   * Check which backend is currently active
   *
   * @returns 'keychain' if using OS keychain, 'file' if using encrypted file
   */
  async getActiveBackend(): Promise<"keychain" | "file"> {
    await this.initializeStore();
    return this.keychainAvailable ? "keychain" : "file";
  }

  /**
   * Check if the store is available
   *
   * HybridStore is available if either keychain or file storage is available.
   */
  async isAvailable(): Promise<Result<boolean, CredentialStoreError>> {
    const store = await this.getBackingStore();
    return store.isAvailable();
  }

  /**
   * Get a credential by provider
   *
   * @param provider - Provider name (e.g., 'anthropic')
   * @param key - Optional specific key within provider namespace
   */
  async get(
    provider: string,
    key?: string
  ): Promise<Result<Credential | null, CredentialStoreError>> {
    const store = await this.getBackingStore();
    return store.get(provider, key);
  }

  /**
   * Store a credential
   *
   * @param credential - The credential to store
   */
  async set(credential: Credential): Promise<Result<void, CredentialStoreError>> {
    const store = await this.getBackingStore();
    return store.set(credential);
  }

  /**
   * Delete a credential
   *
   * @param provider - Provider name
   * @param key - Optional specific key within provider namespace
   */
  async delete(provider: string, key?: string): Promise<Result<boolean, CredentialStoreError>> {
    const store = await this.getBackingStore();
    return store.delete(provider, key);
  }

  /**
   * List all stored credentials (references only, values redacted)
   *
   * @param provider - Optional filter by provider
   */
  async list(provider?: string): Promise<Result<readonly CredentialRef[], CredentialStoreError>> {
    const store = await this.getBackingStore();
    return store.list(provider);
  }

  /**
   * Check if a credential exists
   *
   * @param provider - Provider name
   * @param key - Optional specific key within provider namespace
   */
  async exists(provider: string, key?: string): Promise<Result<boolean, CredentialStoreError>> {
    const store = await this.getBackingStore();
    return store.exists(provider, key);
  }

  /**
   * Check if file storage is being forced
   */
  isForceFileStorage(): boolean {
    return this.forceFileStorage;
  }

  /**
   * Check if keychain was detected as available
   * Only accurate after first operation has been performed.
   */
  isKeychainAvailable(): boolean {
    return this.keychainAvailable;
  }
}
