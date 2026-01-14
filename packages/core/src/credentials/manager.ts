/**
 * Credential Manager Facade
 *
 * High-level facade for credential management, providing a unified API
 * for resolving, storing, deleting, listing, and validating credentials.
 *
 * @module credentials/manager
 */

import { Err, Ok, type Result } from "../types/result.js";

import { CredentialResolver, type CredentialResolverOptions } from "./resolver.js";
import type {
  Credential,
  CredentialInput,
  CredentialRef,
  CredentialSource,
  CredentialStore,
  CredentialStoreError,
  CredentialValidationResult,
} from "./types.js";
import { CredentialSchema, createStoreError } from "./types.js";

// =============================================================================
// Manager Events
// =============================================================================

/**
 * Events emitted by CredentialManager
 */
export type CredentialManagerEvent =
  | { type: "credential:resolved"; provider: string; key?: string; source: CredentialSource }
  | { type: "credential:stored"; provider: string; store: CredentialSource }
  | { type: "credential:deleted"; provider: string; key?: string; store: CredentialSource }
  | { type: "credential:not_found"; provider: string; key?: string }
  | { type: "credential:validated"; provider: string; valid: boolean }
  | { type: "error"; operation: string; error: CredentialStoreError };

/**
 * Event listener type
 */
export type CredentialManagerListener = (event: CredentialManagerEvent) => void;

// =============================================================================
// Manager Options
// =============================================================================

/**
 * Options for CredentialManager construction
 */
export interface CredentialManagerOptions extends CredentialResolverOptions {
  /** Preferred store for writing (default: first available writable store) */
  readonly preferredWriteStore?: CredentialSource;
  /** Custom credential validator function */
  readonly validator?: CredentialValidator;
}

/**
 * Credential validator function type
 *
 * @param credential - The credential to validate
 * @returns Validation result
 */
export type CredentialValidator = (credential: Credential) => Promise<CredentialValidationResult>;

// =============================================================================
// CredentialManager Implementation
// =============================================================================

/**
 * Credential Manager Facade
 *
 * Provides a unified, high-level API for all credential operations.
 * Wraps the CredentialResolver and individual stores with a clean interface.
 *
 * Features:
 * - Unified resolve/store/delete/list API
 * - Event emission for monitoring and logging
 * - Credential validation support
 * - Automatic store selection for writes
 * - Batch operations support
 *
 * @example
 * ```typescript
 * const manager = new CredentialManager([
 *   new EnvCredentialStore(),
 *   new KeychainStore(),
 *   new EncryptedFileStore({ filePath, password }),
 * ]);
 *
 * // Listen for events
 * manager.on((event) => {
 *   console.log('Credential event:', event.type);
 * });
 *
 * // Resolve a credential
 * const credential = await manager.resolve('anthropic');
 *
 * // Store a new credential
 * await manager.store({
 *   provider: 'openai',
 *   type: 'api_key',
 *   value: 'sk-...',
 * });
 *
 * // List all credentials
 * const all = await manager.list();
 * ```
 */
export class CredentialManager {
  /** Internal resolver for priority-based resolution */
  private readonly resolver: CredentialResolver;

  /** All registered stores */
  private readonly stores: readonly CredentialStore[];

  /** Preferred store name for writes */
  private readonly preferredWriteStore?: CredentialSource;

  /** Custom validator function */
  private readonly validator?: CredentialValidator;

  /** Event listeners */
  private readonly listeners: Set<CredentialManagerListener> = new Set();

  /**
   * Create a new CredentialManager
   *
   * @param stores - Array of credential stores
   * @param options - Manager configuration options
   */
  constructor(stores: readonly CredentialStore[], options: CredentialManagerOptions = {}) {
    this.stores = stores;
    this.resolver = new CredentialResolver(stores, options);
    this.preferredWriteStore = options.preferredWriteStore;
    this.validator = options.validator;
  }

  // ===========================================================================
  // Core Operations
  // ===========================================================================

  /**
   * Resolve a credential from the store chain
   *
   * Queries stores in priority order until a credential is found.
   * Emits credential:resolved or credential:not_found events.
   *
   * @param provider - Provider name (e.g., 'anthropic', 'openai')
   * @param key - Optional specific key within provider namespace
   * @returns Result with credential or null if not found
   */
  async resolve(
    provider: string,
    key?: string
  ): Promise<Result<Credential | null, CredentialStoreError>> {
    console.log(`[CredentialManager] resolve() called for ${provider}`);
    const result = await this.resolver.resolve(provider, key);
    console.log(
      `[CredentialManager] resolve() result:`,
      result.ok ? (result.value ? "found" : "not found") : "error"
    );

    if (!result.ok) {
      this.emit({ type: "error", operation: "resolve", error: result.error });
      return result;
    }

    if (result.value) {
      this.emit({
        type: "credential:resolved",
        provider,
        key,
        source: result.value.source,
      });
    } else {
      this.emit({ type: "credential:not_found", provider, key });
    }

    return result;
  }

  /**
   * Store a credential
   *
   * Writes to the preferred writable store (keychain > file by default).
   * Validates the credential before storing if validator is configured.
   *
   * @param input - Credential input (without id/createdAt)
   * @param storeName - Optional specific store to write to
   * @returns Result with the stored credential
   */
  async store(
    input: CredentialInput,
    storeName?: CredentialSource
  ): Promise<Result<Credential, CredentialStoreError>> {
    // Determine target store
    const store = storeName
      ? this.resolver.getStore(storeName)
      : await this.getPreferredWritableStore();

    if (!store) {
      const error = createStoreError(
        "STORE_UNAVAILABLE",
        storeName
          ? `Store '${storeName}' not found or not available`
          : "No writable store available",
        storeName ?? "runtime"
      );
      this.emit({ type: "error", operation: "store", error });
      return Err(error);
    }

    if (store.readOnly) {
      const error = createStoreError("READ_ONLY", `Store '${store.name}' is read-only`, store.name);
      this.emit({ type: "error", operation: "store", error });
      return Err(error);
    }

    // Create full credential with defaults
    const credential = this.createCredential(input, store.name);

    // Validate schema
    const parseResult = CredentialSchema.safeParse(credential);
    if (!parseResult.success) {
      const error = createStoreError(
        "INVALID_CREDENTIAL",
        `Invalid credential: ${parseResult.error.message}`,
        store.name
      );
      this.emit({ type: "error", operation: "store", error });
      return Err(error);
    }

    // Custom validation if configured
    if (this.validator) {
      const validationResult = await this.validator(parseResult.data);
      this.emit({
        type: "credential:validated",
        provider: credential.provider,
        valid: validationResult.valid,
      });

      if (!validationResult.valid) {
        const error = createStoreError(
          "INVALID_CREDENTIAL",
          `Credential validation failed: ${validationResult.error ?? "Unknown error"}`,
          store.name
        );
        this.emit({ type: "error", operation: "store", error });
        return Err(error);
      }
    }

    // Store the credential
    const storeResult = await store.set(parseResult.data);

    if (!storeResult.ok) {
      this.emit({ type: "error", operation: "store", error: storeResult.error });
      return storeResult;
    }

    // Invalidate cache for this provider
    this.resolver.invalidateCache(credential.provider);

    this.emit({
      type: "credential:stored",
      provider: credential.provider,
      store: store.name,
    });

    return Ok(parseResult.data);
  }

  /**
   * Delete a credential from writable stores
   *
   * Removes the credential from all writable stores that contain it.
   *
   * @param provider - Provider name
   * @param key - Optional specific key
   * @returns Result with count of stores credential was deleted from
   */
  async delete(provider: string, key?: string): Promise<Result<number, CredentialStoreError>> {
    const writableStores = this.resolver.getWritableStores();
    let deletedCount = 0;
    let lastError: CredentialStoreError | null = null;

    for (const store of writableStores) {
      const availResult = await store.isAvailable();
      if (!availResult.ok || !availResult.value) {
        continue;
      }

      const result = await store.delete(provider, key);

      if (!result.ok) {
        lastError = result.error;
        continue;
      }

      if (result.value) {
        deletedCount++;
        this.emit({
          type: "credential:deleted",
          provider,
          key,
          store: store.name,
        });
      }
    }

    // Invalidate cache regardless
    this.resolver.invalidateCache(provider, key);

    if (deletedCount === 0 && lastError) {
      this.emit({ type: "error", operation: "delete", error: lastError });
      return Err(lastError);
    }

    if (deletedCount === 0) {
      this.emit({ type: "credential:not_found", provider, key });
    }

    return Ok(deletedCount);
  }

  /**
   * List all credentials across stores
   *
   * Aggregates credentials from all available stores.
   * Returns redacted credential references (no values).
   *
   * @param provider - Optional filter by provider
   * @returns Result with array of credential references
   */
  async list(provider?: string): Promise<Result<readonly CredentialRef[], CredentialStoreError>> {
    return this.resolver.list(provider);
  }

  /**
   * Validate a credential
   *
   * Uses the configured validator to check if a credential is valid.
   * If no validator is configured, performs only schema validation.
   *
   * @param credential - The credential to validate
   * @returns Validation result
   */
  async validate(credential: Credential): Promise<CredentialValidationResult> {
    // Schema validation first
    const parseResult = CredentialSchema.safeParse(credential);
    if (!parseResult.success) {
      return {
        valid: false,
        error: `Schema validation failed: ${parseResult.error.message}`,
      };
    }

    // Custom validation
    if (this.validator) {
      const result = await this.validator(parseResult.data);
      this.emit({
        type: "credential:validated",
        provider: credential.provider,
        valid: result.valid,
      });
      return result;
    }

    return { valid: true };
  }

  /**
   * Check if a credential exists
   *
   * @param provider - Provider name
   * @param key - Optional specific key
   * @returns Result with existence status
   */
  async exists(provider: string, key?: string): Promise<Result<boolean, CredentialStoreError>> {
    return this.resolver.exists(provider, key);
  }

  // ===========================================================================
  // Store Access
  // ===========================================================================

  /**
   * Get the internal resolver
   *
   * @returns The CredentialResolver instance
   */
  getResolver(): CredentialResolver {
    return this.resolver;
  }

  /**
   * Get all registered stores
   *
   * @returns Readonly array of stores
   */
  getStores(): readonly CredentialStore[] {
    return this.stores;
  }

  /**
   * Get a specific store by name
   *
   * @param name - Store name
   * @returns The store or undefined
   */
  getStore(name: CredentialSource): CredentialStore | undefined {
    return this.resolver.getStore(name);
  }

  /**
   * Get store availability information
   *
   * @returns Object with availability status per store
   */
  async getStoreAvailability(): Promise<Record<CredentialSource, boolean>> {
    const availability: Partial<Record<CredentialSource, boolean>> = {};

    for (const store of this.stores) {
      const result = await store.isAvailable();
      availability[store.name] = result.ok && result.value;
    }

    return availability as Record<CredentialSource, boolean>;
  }

  // ===========================================================================
  // Cache Management
  // ===========================================================================

  /**
   * Invalidate resolver cache
   *
   * @param provider - Optional provider to invalidate
   * @param key - Optional specific key
   */
  invalidateCache(provider?: string, key?: string): void {
    this.resolver.invalidateCache(provider, key);
  }

  /**
   * Get cache statistics
   *
   * @returns Cache size and TTL info
   */
  getCacheStats(): { size: number; ttlMs: number } {
    return this.resolver.getCacheStats();
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Add an event listener
   *
   * @param listener - Function to call on events
   * @returns Unsubscribe function
   */
  on(listener: CredentialManagerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: CredentialManagerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Get the preferred writable store
   *
   * Priority: configured preference > keychain > file
   */
  private async getPreferredWritableStore(): Promise<CredentialStore | undefined> {
    const writableStores = this.resolver.getWritableStores();

    // Check configured preference first
    if (this.preferredWriteStore) {
      const preferred = writableStores.find((s) => s.name === this.preferredWriteStore);
      if (preferred) {
        const availResult = await preferred.isAvailable();
        if (availResult.ok && availResult.value) {
          return preferred;
        }
      }
    }

    // Fall back to first available writable store (already sorted by priority)
    for (const store of writableStores) {
      const availResult = await store.isAvailable();
      if (availResult.ok && availResult.value) {
        return store;
      }
    }

    return undefined;
  }

  /**
   * Create a full Credential from input
   */
  private createCredential(input: CredentialInput, source: CredentialSource): Credential {
    return {
      id: `${source}:${input.provider}:${Date.now()}`,
      provider: input.provider,
      type: input.type,
      value: input.value,
      source: input.source ?? source,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
      expiresAt: input.expiresAt,
      rotatedAt: input.rotatedAt,
    };
  }
}
