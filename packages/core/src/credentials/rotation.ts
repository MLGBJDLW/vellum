/**
 * Credential Rotation Manager
 *
 * Provides atomic credential rotation with rollback capabilities.
 * Ensures credentials are updated safely without service disruption.
 *
 * @module credentials/rotation
 */

import type { CredentialManager } from "./manager.js";
import type {
  Credential,
  CredentialInput,
  CredentialSource,
  CredentialValidationResult,
} from "./types.js";

// =============================================================================
// Rotation Types
// =============================================================================

/**
 * Result of a credential rotation operation
 */
export interface RotationResult {
  /** Whether the rotation succeeded */
  readonly success: boolean;
  /** The new credential (if successful) */
  readonly newCredential?: Credential;
  /** The old credential (preserved on failure) */
  readonly oldCredential?: Credential;
  /** Error message if rotation failed */
  readonly error?: string;
  /** Whether a rollback was performed */
  readonly rolledBack: boolean;
  /** Timestamp of the rotation attempt */
  readonly timestamp: Date;
}

/**
 * Options for rotation operation
 */
export interface RotationOptions {
  /** Validate the new credential before committing */
  readonly validate?: boolean;
  /** Custom validation function */
  readonly validator?: (credential: Credential) => Promise<CredentialValidationResult>;
  /** Target store for the new credential */
  readonly targetStore?: CredentialSource;
  /** Whether to delete the old credential after successful rotation */
  readonly deleteOld?: boolean;
}

/**
 * Events emitted by RotationManager
 */
export type RotationManagerEvent =
  | {
      type: "credential:rotated";
      provider: string;
      key?: string;
      oldSource?: CredentialSource;
      newSource: CredentialSource;
    }
  | {
      type: "credential:rotation_failed";
      provider: string;
      key?: string;
      error: string;
      rolledBack: boolean;
    };

/**
 * Event listener type
 */
export type RotationManagerListener = (event: RotationManagerEvent) => void;

// =============================================================================
// RotationManager Implementation
// =============================================================================

/**
 * Credential Rotation Manager
 *
 * Provides atomic credential rotation with automatic rollback on failure.
 * Ensures service continuity during credential updates.
 *
 * Rotation Process:
 * 1. Backup existing credential (if any)
 * 2. Validate new credential (optional)
 * 3. Store new credential
 * 4. Verify new credential is retrievable
 * 5. Delete old credential (if configured)
 * 6. Rollback on any failure
 *
 * @example
 * ```typescript
 * const manager = new CredentialManager([...stores]);
 * const rotator = new RotationManager(manager);
 *
 * // Listen for rotation events
 * rotator.on((event) => {
 *   if (event.type === 'credential:rotated') {
 *     console.log(`Rotated ${event.provider} credential`);
 *   }
 * });
 *
 * // Rotate a credential
 * const result = await rotator.rotate('openai', 'sk-new-key-...');
 * if (result.success) {
 *   console.log('Rotation successful');
 * } else {
 *   console.log('Rotation failed:', result.error);
 * }
 * ```
 */
export class RotationManager {
  /** Underlying credential manager */
  private readonly manager: CredentialManager;

  /** Event listeners */
  private readonly listeners: Set<RotationManagerListener> = new Set();

  /**
   * Create a new RotationManager
   *
   * @param manager - The CredentialManager instance to use
   */
  constructor(manager: CredentialManager) {
    this.manager = manager;
  }

  /**
   * Rotate a credential atomically
   *
   * Replaces an existing credential with a new value. If rotation fails,
   * the old credential is preserved (rollback).
   *
   * @param provider - Provider name (e.g., 'anthropic', 'openai')
   * @param newValue - The new credential value
   * @param key - Optional specific key within provider namespace
   * @param options - Rotation options
   * @returns Result with rotation details
   */
  async rotate(
    provider: string,
    newValue: string,
    key?: string,
    options: RotationOptions = {}
  ): Promise<RotationResult> {
    const timestamp = new Date();
    let oldCredential: Credential | null = null;
    let newCredential: Credential | undefined;
    let rolledBack = false;

    try {
      // Step 1: Backup existing credential
      const existingResult = await this.manager.resolve(provider, key);
      if (existingResult.ok && existingResult.value) {
        oldCredential = existingResult.value;
      }

      // Step 2: Prepare new credential input
      const input: CredentialInput = {
        provider,
        type: oldCredential?.type ?? "api_key",
        value: newValue,
        metadata: {
          ...oldCredential?.metadata,
          // Preserve existing metadata
        },
        expiresAt: oldCredential?.expiresAt,
        rotatedAt: timestamp,
      };

      // Step 3: Validate new credential if requested
      if (options.validate && options.validator) {
        // Create a temporary credential object for validation
        const tempCredential: Credential = {
          id: `temp:${provider}:${Date.now()}`,
          provider,
          type: input.type,
          value: newValue,
          source: options.targetStore ?? "keychain",
          metadata: input.metadata ?? {},
          createdAt: timestamp,
          expiresAt: input.expiresAt,
          rotatedAt: timestamp,
        };

        const validationResult = await options.validator(tempCredential);
        if (!validationResult.valid) {
          this.emit({
            type: "credential:rotation_failed",
            provider,
            key,
            error: validationResult.error ?? "Validation failed",
            rolledBack: false,
          });

          return {
            success: false,
            oldCredential: oldCredential ?? undefined,
            error: validationResult.error ?? "New credential validation failed",
            rolledBack: false,
            timestamp,
          };
        }
      }

      // Step 4: Store new credential
      const storeResult = await this.manager.store(input, options.targetStore);
      if (!storeResult.ok) {
        this.emit({
          type: "credential:rotation_failed",
          provider,
          key,
          error: storeResult.error.message,
          rolledBack: false,
        });

        return {
          success: false,
          oldCredential: oldCredential ?? undefined,
          error: `Failed to store new credential: ${storeResult.error.message}`,
          rolledBack: false,
          timestamp,
        };
      }

      newCredential = storeResult.value;

      // Step 5: Verify new credential is retrievable
      const verifyResult = await this.manager.resolve(provider, key);
      if (!verifyResult.ok || !verifyResult.value) {
        // Rollback: attempt to restore old credential
        rolledBack = await this.rollback(oldCredential, options.targetStore);

        this.emit({
          type: "credential:rotation_failed",
          provider,
          key,
          error: "Failed to verify new credential",
          rolledBack,
        });

        return {
          success: false,
          oldCredential: oldCredential ?? undefined,
          error: "Failed to verify new credential after storage",
          rolledBack,
          timestamp,
        };
      }

      // Verify the value matches
      if (verifyResult.value.value !== newValue) {
        // Rollback: stored value doesn't match
        rolledBack = await this.rollback(oldCredential, options.targetStore);

        this.emit({
          type: "credential:rotation_failed",
          provider,
          key,
          error: "Stored credential value mismatch",
          rolledBack,
        });

        return {
          success: false,
          oldCredential: oldCredential ?? undefined,
          error: "Stored credential value does not match expected value",
          rolledBack,
          timestamp,
        };
      }

      // Step 6: Delete old credential from different store if configured
      if (options.deleteOld && oldCredential && oldCredential.source !== newCredential.source) {
        // Delete from the old store only
        const oldStore = this.manager.getStore(oldCredential.source);
        if (oldStore && !oldStore.readOnly) {
          await oldStore.delete(provider, key);
        }
      }

      // Invalidate cache to ensure fresh reads
      this.manager.invalidateCache(provider, key);

      this.emit({
        type: "credential:rotated",
        provider,
        key,
        oldSource: oldCredential?.source,
        newSource: newCredential.source,
      });

      return {
        success: true,
        newCredential,
        oldCredential: oldCredential ?? undefined,
        rolledBack: false,
        timestamp,
      };
    } catch (error) {
      // Unexpected error - attempt rollback
      rolledBack = await this.rollback(oldCredential, options.targetStore);

      const errorMessage = error instanceof Error ? error.message : String(error);

      this.emit({
        type: "credential:rotation_failed",
        provider,
        key,
        error: errorMessage,
        rolledBack,
      });

      return {
        success: false,
        oldCredential: oldCredential ?? undefined,
        error: `Unexpected error during rotation: ${errorMessage}`,
        rolledBack,
        timestamp,
      };
    }
  }

  /**
   * Rotate with a full credential input
   *
   * Allows specifying all credential properties, not just the value.
   *
   * @param input - Full credential input
   * @param key - Optional specific key
   * @param options - Rotation options
   * @returns Result with rotation details
   */
  async rotateWithInput(
    input: CredentialInput,
    key?: string,
    options: RotationOptions = {}
  ): Promise<RotationResult> {
    const timestamp = new Date();
    let oldCredential: Credential | null = null;
    let newCredential: Credential | undefined;
    let rolledBack = false;

    try {
      // Backup existing
      const existingResult = await this.manager.resolve(input.provider, key);
      if (existingResult.ok && existingResult.value) {
        oldCredential = existingResult.value;
      }

      // Ensure rotatedAt is set
      const inputWithRotation: CredentialInput = {
        ...input,
        rotatedAt: timestamp,
      };

      // Validate if requested
      if (options.validate && options.validator) {
        const tempCredential: Credential = {
          id: `temp:${input.provider}:${Date.now()}`,
          provider: input.provider,
          type: input.type,
          value: input.value,
          source: options.targetStore ?? "keychain",
          metadata: input.metadata ?? {},
          createdAt: timestamp,
          expiresAt: input.expiresAt,
          rotatedAt: timestamp,
        };

        const validationResult = await options.validator(tempCredential);
        if (!validationResult.valid) {
          this.emit({
            type: "credential:rotation_failed",
            provider: input.provider,
            key,
            error: validationResult.error ?? "Validation failed",
            rolledBack: false,
          });

          return {
            success: false,
            oldCredential: oldCredential ?? undefined,
            error: validationResult.error ?? "New credential validation failed",
            rolledBack: false,
            timestamp,
          };
        }
      }

      // Store new credential
      const storeResult = await this.manager.store(inputWithRotation, options.targetStore);
      if (!storeResult.ok) {
        this.emit({
          type: "credential:rotation_failed",
          provider: input.provider,
          key,
          error: storeResult.error.message,
          rolledBack: false,
        });

        return {
          success: false,
          oldCredential: oldCredential ?? undefined,
          error: `Failed to store new credential: ${storeResult.error.message}`,
          rolledBack: false,
          timestamp,
        };
      }

      newCredential = storeResult.value;

      // Verify
      const verifyResult = await this.manager.resolve(input.provider, key);
      if (!verifyResult.ok || !verifyResult.value) {
        rolledBack = await this.rollback(oldCredential, options.targetStore);

        this.emit({
          type: "credential:rotation_failed",
          provider: input.provider,
          key,
          error: "Failed to verify new credential",
          rolledBack,
        });

        return {
          success: false,
          oldCredential: oldCredential ?? undefined,
          error: "Failed to verify new credential after storage",
          rolledBack,
          timestamp,
        };
      }

      // Delete old if configured
      if (options.deleteOld && oldCredential && oldCredential.source !== newCredential.source) {
        const oldStore = this.manager.getStore(oldCredential.source);
        if (oldStore && !oldStore.readOnly) {
          await oldStore.delete(input.provider, key);
        }
      }

      this.manager.invalidateCache(input.provider, key);

      this.emit({
        type: "credential:rotated",
        provider: input.provider,
        key,
        oldSource: oldCredential?.source,
        newSource: newCredential.source,
      });

      return {
        success: true,
        newCredential,
        oldCredential: oldCredential ?? undefined,
        rolledBack: false,
        timestamp,
      };
    } catch (error) {
      rolledBack = await this.rollback(oldCredential, options.targetStore);

      const errorMessage = error instanceof Error ? error.message : String(error);

      this.emit({
        type: "credential:rotation_failed",
        provider: input.provider,
        key,
        error: errorMessage,
        rolledBack,
      });

      return {
        success: false,
        oldCredential: oldCredential ?? undefined,
        error: `Unexpected error during rotation: ${errorMessage}`,
        rolledBack,
        timestamp,
      };
    }
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
  on(listener: RotationManagerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Emit an event to all listeners
   */
  private emit(event: RotationManagerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Attempt to rollback to the old credential
   *
   * @returns True if rollback was successful
   */
  private async rollback(
    oldCredential: Credential | null,
    targetStore?: CredentialSource
  ): Promise<boolean> {
    if (!oldCredential) {
      // Nothing to rollback to
      return false;
    }

    try {
      // Re-store the old credential
      const input: CredentialInput = {
        provider: oldCredential.provider,
        type: oldCredential.type,
        value: oldCredential.value,
        metadata: oldCredential.metadata,
        expiresAt: oldCredential.expiresAt,
        rotatedAt: oldCredential.rotatedAt,
      };

      const result = await this.manager.store(input, targetStore ?? oldCredential.source);
      return result.ok;
    } catch {
      return false;
    }
  }
}
