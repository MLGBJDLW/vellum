/**
 * Credential Management Type Definitions
 *
 * Core types and Zod schemas for secure credential storage and management.
 * Implements typed credential handling for LLM providers and external services.
 *
 * @module credentials/types
 */

import { z } from "zod";

import type { Result } from "../types/result.js";

// =============================================================================
// T002: CredentialType Schema
// =============================================================================

/**
 * Schema for credential type discriminator
 *
 * - api_key: Standard API key (most common for LLM providers)
 * - oauth_token: OAuth 2.0 access/refresh token pair
 * - bearer_token: Bearer authentication token
 * - service_account: GCP/Azure service account credentials
 * - certificate: Client certificate authentication
 */
export const CredentialTypeSchema = z.enum([
  "api_key",
  "oauth_token",
  "bearer_token",
  "service_account",
  "certificate",
]);

/** Inferred type for credential types */
export type CredentialType = z.infer<typeof CredentialTypeSchema>;

// =============================================================================
// T002: CredentialSource Schema
// =============================================================================

/**
 * Schema for credential source/storage location
 *
 * Priority hierarchy (highest to lowest):
 * - runtime: Passed programmatically at startup
 * - env: Environment variable
 * - keychain: OS-native keychain (most secure persistent)
 * - file: Encrypted file fallback
 * - config: Config file (least secure, not recommended)
 */
export const CredentialSourceSchema = z.enum(["runtime", "env", "keychain", "file", "config"]);

/** Inferred type for credential sources */
export type CredentialSource = z.infer<typeof CredentialSourceSchema>;

// =============================================================================
// T002: CredentialMetadata Schema
// =============================================================================

/**
 * Schema for credential metadata
 *
 * Provides context about the credential without exposing the secret value.
 */
export const CredentialMetadataSchema = z.object({
  /** Human-readable label for the credential */
  label: z.string().optional(),
  /** Target environment (affects which credentials are used) */
  environment: z.enum(["development", "staging", "production"]).optional(),
  /** OAuth scopes or permission boundaries */
  scopes: z.array(z.string()).optional(),
  /** Provider-specific project identifier */
  projectId: z.string().optional(),
  /** Provider-specific region/location */
  region: z.string().optional(),
  /** Custom tags for organization */
  tags: z.record(z.string()).optional(),
});

/** Inferred type for credential metadata */
export type CredentialMetadata = z.infer<typeof CredentialMetadataSchema>;

// =============================================================================
// T002: Credential Schema
// =============================================================================

/**
 * Schema for a complete credential record
 *
 * Contains the credential value along with all metadata for proper
 * identification, validation, and lifecycle management.
 */
export const CredentialSchema = z.object({
  /** Unique identifier for this credential */
  id: z.string(),
  /** Provider this credential is for (e.g., 'anthropic', 'openai') */
  provider: z.string(),
  /** Type of credential */
  type: CredentialTypeSchema,
  /** The secret value (API key, token, etc.) */
  value: z.string(),
  /** Source where this credential was loaded from */
  source: CredentialSourceSchema,
  /** Additional metadata */
  metadata: CredentialMetadataSchema.optional().default({}),
  /** When the credential was created */
  createdAt: z.coerce.date(),
  /** When the credential expires (if applicable) */
  expiresAt: z.coerce.date().optional(),
  /** When the credential was last rotated */
  rotatedAt: z.coerce.date().optional(),
});

/** Inferred type for a complete credential */
export type Credential = z.infer<typeof CredentialSchema>;

// =============================================================================
// T002: Credential Input Schema (for creation)
// =============================================================================

/**
 * Schema for creating a new credential (before defaults are applied)
 */
export const CredentialInputSchema = CredentialSchema.omit({
  id: true,
  createdAt: true,
  source: true,
}).extend({
  source: CredentialSourceSchema.optional(),
});

/** Input type for credential creation */
export type CredentialInput = z.infer<typeof CredentialInputSchema>;

// =============================================================================
// T002: Credential Reference Schema (redacted for listing)
// =============================================================================

/**
 * Schema for credential reference (value redacted for security)
 *
 * Used for listing and displaying credentials without exposing secrets.
 */
export const CredentialRefSchema = CredentialSchema.omit({ value: true }).extend({
  /** Masked hint of the value (e.g., "sk-...abc") */
  maskedHint: z.string().optional(),
});

/** Redacted credential reference type */
export type CredentialRef = z.infer<typeof CredentialRefSchema>;

// =============================================================================
// T002: Validation Result Types
// =============================================================================

/**
 * Result of credential validation against a provider
 */
export interface CredentialValidationResult {
  /** Whether the credential is valid */
  readonly valid: boolean;
  /** Error message if validation failed */
  readonly error?: string;
  /** Additional validation details */
  readonly details?: {
    /** Provider-reported account/user info */
    readonly accountInfo?: string;
    /** Remaining quota/credits (if available) */
    readonly quota?: number;
    /** Rate limit information */
    readonly rateLimit?: {
      readonly remaining: number;
      readonly resetAt: Date;
    };
  };
}

// =============================================================================
// T002: Store Availability Types
// =============================================================================

/**
 * Information about which credential storage backends are available
 */
export interface StoreAvailability {
  /** Whether OS keychain is available */
  readonly keychain: boolean;
  /** Error message if keychain is unavailable */
  readonly keychainError?: string;
  /** Whether encrypted file storage is available */
  readonly file: boolean;
  /** Error message if file storage is unavailable */
  readonly fileError?: string;
  /** Whether environment variables are available */
  readonly env: boolean;
  /** Whether file storage is forced (VELLUM_FORCE_FILE_STORAGE) */
  readonly forceFileStorage: boolean;
}

// =============================================================================
// T003: CredentialStore Interface
// =============================================================================

/**
 * Interface for credential storage backends
 *
 * Implemented by different storage mechanisms:
 * - EnvStore: Environment variables (read-only)
 * - KeychainStore: OS-native keychain
 * - EncryptedFileStore: AES-256-GCM encrypted file fallback
 *
 * All methods return Result types for explicit error handling.
 */
export interface CredentialStore {
  /** Name identifying this store (e.g., 'keychain', 'env', 'file') */
  readonly name: CredentialSource;

  /** Priority for this store (higher = checked first) */
  readonly priority: number;

  /** Whether this store is read-only (e.g., env store) */
  readonly readOnly: boolean;

  /**
   * Check if the store is available and functional
   *
   * @returns Result with availability status
   */
  isAvailable(): Promise<Result<boolean, CredentialStoreError>>;

  /**
   * Get a credential by provider
   *
   * @param provider - Provider name (e.g., 'anthropic')
   * @param key - Optional specific key within provider namespace
   * @returns Result with credential or null if not found
   */
  get(provider: string, key?: string): Promise<Result<Credential | null, CredentialStoreError>>;

  /**
   * Store a credential
   *
   * @param credential - The credential to store
   * @returns Result indicating success or failure
   * @throws CredentialStoreError if store is read-only
   */
  set(credential: Credential): Promise<Result<void, CredentialStoreError>>;

  /**
   * Delete a credential
   *
   * @param provider - Provider name
   * @param key - Optional specific key within provider namespace
   * @returns Result with true if deleted, false if not found
   */
  delete(provider: string, key?: string): Promise<Result<boolean, CredentialStoreError>>;

  /**
   * List all credentials (values redacted)
   *
   * @param provider - Optional filter by provider
   * @returns Result with array of credential references
   */
  list(provider?: string): Promise<Result<readonly CredentialRef[], CredentialStoreError>>;

  /**
   * Check if a credential exists
   *
   * @param provider - Provider name
   * @param key - Optional specific key within provider namespace
   * @returns Result with existence status
   */
  exists(provider: string, key?: string): Promise<Result<boolean, CredentialStoreError>>;
}

// =============================================================================
// T003: CredentialStore Error Types
// =============================================================================

/**
 * Error codes for credential store operations
 */
export const CredentialStoreErrorCodeSchema = z.enum([
  "STORE_UNAVAILABLE",
  "ACCESS_DENIED",
  "NOT_FOUND",
  "ALREADY_EXISTS",
  "INVALID_CREDENTIAL",
  "ENCRYPTION_ERROR",
  "DECRYPTION_ERROR",
  "READ_ONLY",
  "IO_ERROR",
  "UNKNOWN",
]);

export type CredentialStoreErrorCode = z.infer<typeof CredentialStoreErrorCodeSchema>;

/**
 * Error from credential store operations
 */
export interface CredentialStoreError {
  /** Error code for programmatic handling */
  readonly code: CredentialStoreErrorCode;
  /** Human-readable error message */
  readonly message: string;
  /** Store that produced the error */
  readonly store: CredentialSource;
  /** Original error if wrapping another error */
  readonly cause?: Error;
}

// =============================================================================
// Factory Functions for Store Errors
// =============================================================================

/**
 * Create a CredentialStoreError
 *
 * @param code - Error code
 * @param message - Error message
 * @param store - Store that produced the error
 * @param cause - Original error if wrapping
 */
export function createStoreError(
  code: CredentialStoreErrorCode,
  message: string,
  store: CredentialSource,
  cause?: Error
): CredentialStoreError {
  return { code, message, store, cause };
}
