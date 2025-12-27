/**
 * Credential Management Module
 *
 * Provides secure storage and management of API keys, tokens, and credentials
 * for LLM providers and external services. Implements OS-native keychain
 * integration with encrypted fallback storage.
 *
 * @module credentials
 *
 * @example
 * ```typescript
 * import {
 *   CredentialSchema,
 *   CredentialTypeSchema,
 *   CredentialSourceSchema,
 *   type Credential,
 *   type CredentialStore,
 * } from '@vellum/core/credentials';
 *
 * // Validate a credential
 * const result = CredentialSchema.safeParse(data);
 *
 * // Implement a custom store
 * class MyStore implements CredentialStore {
 *   // ...
 * }
 * ```
 */

// =============================================================================
// Type Exports (T002)
// =============================================================================

export {
  // Types
  type Credential,
  type CredentialInput,
  CredentialInputSchema,
  type CredentialMetadata,
  CredentialMetadataSchema,
  type CredentialRef,
  CredentialRefSchema,
  // Schemas
  CredentialSchema,
  type CredentialSource,
  CredentialSourceSchema,
  // Interface (T003)
  type CredentialStore,
  type CredentialStoreError,
  type CredentialStoreErrorCode,
  CredentialStoreErrorCodeSchema,
  type CredentialType,
  CredentialTypeSchema,
  type CredentialValidationResult,
  // Factory functions
  createStoreError,
  type StoreAvailability,
} from "./types.js";

// =============================================================================
// Security Exports (T006)
// =============================================================================

export {
  constantTimeEquals,
  maskCredential,
  SecureString,
  zeroBuffer,
  zeroString,
} from "./security.js";

// =============================================================================
// Store Exports (T004+)
// =============================================================================

export * from "./stores/index.js";

// =============================================================================
// Resolver Exports (T009)
// =============================================================================

export {
  CredentialResolver,
  type CredentialResolverEvent,
  type CredentialResolverListener,
  type CredentialResolverOptions,
  STORE_PRIORITIES,
} from "./resolver.js";

// =============================================================================
// Manager Exports (T010)
// =============================================================================

export {
  CredentialManager,
  type CredentialManagerEvent,
  type CredentialManagerListener,
  type CredentialManagerOptions,
  type CredentialValidator,
} from "./manager.js";

// =============================================================================
// Provider Format Exports (T020)
// =============================================================================

export * from "./providers/index.js";

// =============================================================================
// Validation Service Exports (T020)
// =============================================================================

export {
  CredentialValidationService,
  type CustomValidator,
  type FormatValidationResult,
  getDefaultValidationService,
  type ValidationServiceOptions,
  validateFormat,
  validateFormatResult,
} from "./validation.js";

// =============================================================================
// Rotation Manager Exports (T027)
// =============================================================================

export {
  RotationManager,
  type RotationManagerEvent,
  type RotationManagerListener,
  type RotationOptions,
  type RotationResult,
} from "./rotation.js";

// =============================================================================
// Refresh Timer Exports (T028, T028B)
// =============================================================================

export {
  createRefreshTimer,
  createRefreshTimerWithBackoff,
  type RefreshCallback,
  RefreshTimer,
  type RefreshTimerConfig,
  type RefreshTimerEvent,
  type RefreshTimerListener,
  type RefreshTimerState,
} from "./refresh.js";

// =============================================================================
// Audit Logger Exports (T029)
// =============================================================================

export {
  type AuditLogEntry,
  AuditLogEntrySchema,
  type AuditLogHandler,
  type AuditLogInput,
  type AuditOperation,
  AuditOperationSchema,
  type AuditTimer,
  type ConsoleHandlerOptions,
  CredentialAuditLogger,
  type CredentialAuditLoggerOptions,
  createBatchHandler,
  createConsoleHandler,
  createDefaultAuditLogger,
  createFileHandler,
  createFilteredHandler,
  createManagerEventListener,
  createSilentAuditLogger,
  type FileHandlerOptions,
} from "./audit.js";
