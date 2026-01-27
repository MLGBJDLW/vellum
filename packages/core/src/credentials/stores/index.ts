/**
 * Credential Stores Barrel Export
 *
 * Exports all credential storage backend implementations.
 * Stores are added as they are implemented.
 *
 * @module credentials/stores
 */

// Re-export store interface from types for convenience
export type { CredentialStore, CredentialStoreError } from "../types.js";

// T005: Encrypted File Store
export { EncryptedFileStore, type EncryptedFileStoreOptions } from "./encrypted-file-store.js";
// T004: Environment Variable Store
export { EnvCredentialStore } from "./env-store.js";

// T011: Hybrid Store (auto-switches between keychain and file)
export { HybridCredentialStore, type HybridCredentialStoreOptions } from "./hybrid-store.js";
// T008: OS Keychain Store
export { KeychainStore } from "./keychain-store.js";
