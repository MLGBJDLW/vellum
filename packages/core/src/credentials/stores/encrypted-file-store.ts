/**
 * Encrypted File Credential Store
 *
 * Secure credential storage using AES-256-GCM encryption with scrypt key derivation.
 * Provides a portable fallback when OS keychain is unavailable.
 *
 * @module credentials/stores/encrypted-file-store
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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
// Encryption Constants
// =============================================================================

/**
 * Legacy scrypt parameters (v1) - kept for backward compatibility
 * N=16384 (2^14), r=8, p=1 provides good security/performance balance
 */
const LEGACY_SCRYPT_PARAMS = {
  N: 16384, // 2^14 - CPU/memory cost parameter
  r: 8, // Block size
  p: 1, // Parallelization
  keyLength: 32, // 256 bits for AES-256
} as const;

/**
 * Current scrypt parameters (v2) - OWASP 2023 compliant
 * N=65536 (2^16) provides stronger protection against hardware attacks
 */
const CURRENT_SCRYPT_PARAMS = {
  N: 65536, // 2^16 - CPU/memory cost parameter
  r: 8, // Block size
  p: 1, // Parallelization
  keyLength: 32, // 256 bits for AES-256
} as const;

/** Current scrypt version for new encryptions */
const CURRENT_SCRYPT_VERSION = 2;

/** Salt length in bytes (256 bits) */
const SALT_LENGTH = 32;

/** IV/nonce length for AES-GCM (96 bits recommended) */
const IV_LENGTH = 16;

/** File format version for future compatibility */
const FORMAT_VERSION = 1;

/** Secure file permissions (owner read/write only) */
const SECURE_FILE_MODE = 0o600;

/**
 * Check if running in test environment where memory is constrained.
 * In test mode, v1 params (~4MB RAM) are used instead of v2 (~64MB RAM).
 */
function isTestEnvironment(): boolean {
  return (
    process.env.VITEST !== undefined ||
    process.env.JEST_WORKER_ID !== undefined ||
    process.env.VELLUM_SCRYPT_TEST_MODE === "1"
  );
}

/**
 * Get the scrypt version to use for new files.
 * Returns v1 in test environments due to memory constraints (~64MB for v2).
 */
function getNewFileScryptVersion(): number {
  return isTestEnvironment() ? 1 : CURRENT_SCRYPT_VERSION;
}

// =============================================================================
// Types
// =============================================================================

/**
 * Encrypted file format structure
 */
interface EncryptedFileFormat {
  /** Format version for compatibility */
  version: number;
  /** scrypt version: 1=N=16384, 2=N=65536. undefined treated as v1 */
  scryptVersion?: number;
  /** Salt for key derivation (hex encoded) */
  salt: string;
  /** Credentials map: provider -> encrypted data (hex encoded) */
  credentials: Record<string, EncryptedCredentialEntry>;
}

/**
 * Individual encrypted credential entry
 */
interface EncryptedCredentialEntry {
  /** IV/nonce (hex encoded) */
  iv: string;
  /** Encrypted data (hex encoded) */
  data: string;
  /** Auth tag (hex encoded) */
  authTag: string;
  /** Timestamp for ordering */
  updatedAt: string;
}

/**
 * Configuration options for EncryptedFileStore
 */
export interface EncryptedFileStoreOptions {
  /** Path to the encrypted credentials file */
  filePath: string;
  /** Master password for encryption */
  password: string;
  /**
   * Automatically migrate to current scrypt version on file load.
   * When true, files using legacy v1 params will be upgraded to v2.
   * Default: false (opt-in migration for backward compatibility)
   *
   * Note: v2 requires ~64MB RAM, ensure environment supports this.
   */
  autoMigrate?: boolean;
}

/**
 * Helper to generate credential storage key
 */
function getCredentialKey(provider: string, key?: string): string {
  return key ? `${provider}:${key}` : provider;
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
// EncryptedFileStore Implementation
// =============================================================================

/**
 * Encrypted File Credential Store
 *
 * Stores credentials in an AES-256-GCM encrypted JSON file with scrypt
 * key derivation. Provides secure persistent storage when OS keychain
 * is not available.
 *
 * Security features:
 * - AES-256-GCM authenticated encryption
 * - scrypt key derivation (resistant to hardware attacks)
 * - Unique IV per credential
 * - 0o600 file permissions
 * - Version header for forward compatibility
 *
 * @example
 * ```typescript
 * const store = new EncryptedFileStore({
 *   filePath: '~/.vellum/credentials.enc',
 *   password: process.env.VELLUM_MASTER_PASSWORD!,
 * });
 *
 * // Store a credential
 * await store.set(credential);
 *
 * // Retrieve it
 * const result = await store.get('anthropic');
 * ```
 */
export class EncryptedFileStore implements CredentialStore {
  readonly name = "file" as const;
  readonly priority = 50; // Lower than keychain
  readonly readOnly = false;

  private readonly filePath: string;
  private readonly password: string;
  private readonly autoMigrate: boolean;
  private cache: EncryptedFileFormat | null = null;
  private salt: Buffer | null = null;
  private derivedKey: Buffer | null = null;

  /**
   * Create a new EncryptedFileStore
   *
   * @param options - Configuration options
   * @param options.filePath - Path to the encrypted credentials file
   * @param options.password - Master password for encryption
   * @param options.autoMigrate - Auto-migrate legacy scrypt params (default: false)
   */
  constructor(options: EncryptedFileStoreOptions) {
    this.filePath = options.filePath;
    this.password = options.password;
    this.autoMigrate = options.autoMigrate ?? false;
  }

  /**
   * Check if the store is available
   * File store is available if we have a valid password
   */
  async isAvailable(): Promise<Result<boolean, CredentialStoreError>> {
    if (!this.password) {
      return Ok(false);
    }

    // Try to access the file directory
    try {
      const dir = dirname(this.filePath);
      await mkdir(dir, { recursive: true });
      return Ok(true);
    } catch (error) {
      return Err(
        createStoreError(
          "IO_ERROR",
          `Cannot access credential store directory: ${error instanceof Error ? error.message : String(error)}`,
          "file",
          error instanceof Error ? error : undefined
        )
      );
    }
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
    const loadResult = await this.loadFile();
    if (!loadResult.ok) {
      // File not found is not an error, just means no credentials stored yet
      if (loadResult.error.code === "NOT_FOUND") {
        return Ok(null);
      }
      return loadResult;
    }

    const credKey = getCredentialKey(provider, key);
    const entry = this.cache?.credentials[credKey];

    if (!entry) {
      return Ok(null);
    }

    // Decrypt the credential
    const decryptResult = this.decrypt(entry);
    if (!decryptResult.ok) {
      return decryptResult;
    }

    return Ok(decryptResult.value);
  }

  /**
   * Store a credential
   *
   * @param credential - The credential to store
   */
  async set(credential: Credential): Promise<Result<void, CredentialStoreError>> {
    // Ensure file exists and is loaded
    const loadResult = await this.loadOrInitFile();
    if (!loadResult.ok) {
      return loadResult;
    }

    // Encrypt the credential
    const encryptResult = this.encrypt(credential);
    if (!encryptResult.ok) {
      return encryptResult;
    }

    // Update cache
    const credKey = getCredentialKey(credential.provider);
    if (this.cache) {
      this.cache.credentials[credKey] = encryptResult.value;
    }

    // Save to disk
    return this.saveFile();
  }

  /**
   * Delete a credential
   *
   * @param provider - Provider name
   * @param key - Optional specific key
   */
  async delete(provider: string, key?: string): Promise<Result<boolean, CredentialStoreError>> {
    const loadResult = await this.loadFile();
    if (!loadResult.ok) {
      if (loadResult.error.code === "NOT_FOUND") {
        return Ok(false);
      }
      return loadResult;
    }

    const credKey = getCredentialKey(provider, key);
    const existed = credKey in (this.cache?.credentials ?? {});

    if (!existed) {
      return Ok(false);
    }

    if (this.cache) {
      delete this.cache.credentials[credKey];
    }

    // If no credentials left, delete the file
    if (Object.keys(this.cache?.credentials ?? {}).length === 0) {
      try {
        await unlink(this.filePath);
        this.cache = null;
        this.salt = null;
        this.derivedKey = null;
      } catch {
        // Ignore errors deleting empty file
      }
      return Ok(true);
    }

    const saveResult = await this.saveFile();
    if (!saveResult.ok) {
      return saveResult;
    }

    return Ok(true);
  }

  /**
   * List all credentials (values redacted)
   *
   * @param provider - Optional filter by provider
   */
  async list(provider?: string): Promise<Result<readonly CredentialRef[], CredentialStoreError>> {
    const loadResult = await this.loadFile();
    if (!loadResult.ok) {
      if (loadResult.error.code === "NOT_FOUND") {
        return Ok([]);
      }
      return loadResult;
    }

    const refs: CredentialRef[] = [];

    for (const [credKey, entry] of Object.entries(this.cache?.credentials ?? {})) {
      // Filter by provider if specified
      const entryProvider = credKey.split(":")[0];
      if (provider && entryProvider !== provider) {
        continue;
      }

      // Decrypt to get full credential data
      const decryptResult = this.decrypt(entry);
      if (!decryptResult.ok) {
        continue; // Skip corrupted entries
      }

      const credential = decryptResult.value;
      const { value: _value, ...rest } = credential;
      refs.push({
        ...rest,
        maskedHint: generateMaskedHint(credential.value),
      });
    }

    return Ok(refs);
  }

  /**
   * Check if a credential exists
   *
   * @param provider - Provider name
   * @param key - Optional specific key
   */
  async exists(provider: string, key?: string): Promise<Result<boolean, CredentialStoreError>> {
    const loadResult = await this.loadFile();
    if (!loadResult.ok) {
      if (loadResult.error.code === "NOT_FOUND") {
        return Ok(false);
      }
      return loadResult;
    }

    const credKey = getCredentialKey(provider, key);
    return Ok(credKey in (this.cache?.credentials ?? {}));
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Load the encrypted file from disk
   */
  private async loadFile(): Promise<Result<void, CredentialStoreError>> {
    if (this.cache !== null) {
      return Ok(undefined);
    }

    try {
      // Check file exists
      await stat(this.filePath);

      // Read and parse
      const content = await readFile(this.filePath, "utf-8");
      const data = JSON.parse(content) as EncryptedFileFormat;

      // Validate format version
      if (data.version !== FORMAT_VERSION) {
        return Err(
          createStoreError(
            "DECRYPTION_ERROR",
            `Unsupported credential file format version: ${data.version}`,
            "file"
          )
        );
      }

      // Set cache first so deriveKey() can read scryptVersion
      this.cache = data;

      // Extract salt and derive key using version from cache
      this.salt = Buffer.from(data.salt, "hex");
      this.deriveKey();

      // Check if migration is needed
      if (this.autoMigrate && this.needsMigration()) {
        // Auto-migrate to current scrypt version
        // Note: This adds ~200ms latency on first read for files needing migration
        const migrateResult = await this.migrateToCurrentVersion();
        if (!migrateResult.ok) {
          // Log but don't fail - credentials are still readable with v1 params
          // The migration can be retried later
          console.warn(
            `[EncryptedFileStore] Auto-migration failed: ${migrateResult.error.message}`
          );
        }
      }

      return Ok(undefined);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return Err(createStoreError("NOT_FOUND", "Credential file not found", "file"));
      }

      return Err(
        createStoreError(
          "IO_ERROR",
          `Failed to read credential file: ${error instanceof Error ? error.message : String(error)}`,
          "file",
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Load existing file or initialize a new one
   */
  private async loadOrInitFile(): Promise<Result<void, CredentialStoreError>> {
    const loadResult = await this.loadFile();

    if (loadResult.ok) {
      return loadResult;
    }

    if (loadResult.error.code !== "NOT_FOUND") {
      return loadResult;
    }

    // Initialize new file with current scrypt version
    // Note: In test environments, v1 is used due to memory constraints (~64MB for v2)
    const scryptVersion = getNewFileScryptVersion();
    this.salt = randomBytes(SALT_LENGTH);
    this.deriveKey(scryptVersion);

    this.cache = {
      version: FORMAT_VERSION,
      scryptVersion: scryptVersion,
      salt: this.salt.toString("hex"),
      credentials: {},
    };

    return Ok(undefined);
  }

  /**
   * Save the encrypted file to disk
   */
  private async saveFile(): Promise<Result<void, CredentialStoreError>> {
    if (!this.cache) {
      return Err(createStoreError("IO_ERROR", "No data to save", "file"));
    }

    const tempPath = `${this.filePath}.tmp.${Date.now()}`;

    try {
      // Ensure directory exists
      await mkdir(dirname(this.filePath), { recursive: true });

      const content = JSON.stringify(this.cache, null, 2);

      // Atomic write: write to temp file first, then rename
      await writeFile(tempPath, content, { encoding: "utf-8", mode: SECURE_FILE_MODE });
      await chmod(tempPath, SECURE_FILE_MODE);

      // Atomic rename (on most filesystems)
      await rename(tempPath, this.filePath);

      return Ok(undefined);
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await unlink(tempPath);
      } catch {
        /* ignore cleanup errors */
      }

      return Err(
        createStoreError(
          "IO_ERROR",
          `Failed to save credential file: ${error instanceof Error ? error.message : String(error)}`,
          "file",
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Derive encryption key from password using scrypt
   *
   * @param scryptVersion - Optional scrypt version to use (1 or 2)
   *                        If not provided, uses version from cache or defaults to v1
   */
  private deriveKey(scryptVersion?: number): void {
    if (!this.salt) {
      throw new Error("Salt not initialized");
    }

    // Determine which params to use:
    // - Explicit v2 requested, OR
    // - No version specified but cache indicates v2
    const params =
      scryptVersion === 2 || (scryptVersion === undefined && this.cache?.scryptVersion === 2)
        ? CURRENT_SCRYPT_PARAMS
        : LEGACY_SCRYPT_PARAMS;

    this.derivedKey = scryptSync(this.password, this.salt, params.keyLength, {
      N: params.N,
      r: params.r,
      p: params.p,
      maxmem: 128 * params.N * params.r * 2, // Memory required by scrypt + safety margin
    });
  }

  /**
   * Encrypt a credential
   */
  private encrypt(credential: Credential): Result<EncryptedCredentialEntry, CredentialStoreError> {
    if (!this.derivedKey) {
      return Err(createStoreError("ENCRYPTION_ERROR", "Encryption key not initialized", "file"));
    }

    try {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv("aes-256-gcm", this.derivedKey, iv);

      const plaintext = JSON.stringify(credential);
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
      const authTag = cipher.getAuthTag();

      return Ok({
        iv: iv.toString("hex"),
        data: encrypted.toString("hex"),
        authTag: authTag.toString("hex"),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return Err(
        createStoreError(
          "ENCRYPTION_ERROR",
          `Failed to encrypt credential: ${error instanceof Error ? error.message : String(error)}`,
          "file",
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Decrypt a credential entry
   */
  private decrypt(entry: EncryptedCredentialEntry): Result<Credential, CredentialStoreError> {
    if (!this.derivedKey) {
      return Err(createStoreError("DECRYPTION_ERROR", "Encryption key not initialized", "file"));
    }

    try {
      const iv = Buffer.from(entry.iv, "hex");
      const data = Buffer.from(entry.data, "hex");
      const authTag = Buffer.from(entry.authTag, "hex");

      const decipher = createDecipheriv("aes-256-gcm", this.derivedKey, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf-8");

      const parsed = JSON.parse(decrypted);

      // Validate against schema
      const validated = CredentialSchema.safeParse(parsed);
      if (!validated.success) {
        return Err(
          createStoreError(
            "DECRYPTION_ERROR",
            `Invalid credential format: ${validated.error.message}`,
            "file"
          )
        );
      }

      return Ok(validated.data);
    } catch (error) {
      return Err(
        createStoreError(
          "DECRYPTION_ERROR",
          `Failed to decrypt credential: ${error instanceof Error ? error.message : String(error)}`,
          "file",
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Check if credentials need migration to stronger scrypt parameters.
   * Returns true if file exists and uses older (v1) scrypt parameters.
   * @returns true if migration is needed, false otherwise
   */
  async checkNeedsMigration(): Promise<Result<boolean, CredentialStoreError>> {
    const loadResult = await this.loadFile();
    if (!loadResult.ok) {
      if (loadResult.error.code === "NOT_FOUND") {
        return Ok(false);
      }
      return loadResult;
    }
    return Ok(this.needsMigration());
  }

  /**
   * Migrate credentials to current (v2) scrypt parameters.
   * This upgrades from N=16384 to N=65536 for stronger protection.
   * The operation is atomic - either all credentials migrate or none.
   *
   * @returns Result indicating success or failure
   */
  async migrate(): Promise<Result<void, CredentialStoreError>> {
    const loadResult = await this.loadFile();
    if (!loadResult.ok) {
      if (loadResult.error.code === "NOT_FOUND") {
        return Ok(undefined); // Nothing to migrate
      }
      return loadResult;
    }
    return this.migrateToCurrentVersion();
  }

  /**
   * Check if the credential file needs migration to current scrypt version.
   * Returns true if file exists and uses older scrypt parameters.
   */
  private needsMigration(): boolean {
    if (!this.cache) return false;
    // undefined or 1 means legacy v1, needs upgrade to v2
    return this.cache.scryptVersion !== CURRENT_SCRYPT_VERSION;
  }

  /**
   * Migrate all credentials from legacy scrypt params to current version.
   * This is an atomic operation - either all credentials migrate or none.
   */
  private async migrateToCurrentVersion(): Promise<Result<void, CredentialStoreError>> {
    if (!this.cache || !this.needsMigration()) {
      return Ok(undefined);
    }

    // Save old state for rollback
    const oldSalt = this.salt;
    const oldDerivedKey = this.derivedKey;
    const oldCache = { ...this.cache };

    try {
      // 1. Decrypt all credentials using OLD key (already derived with v1 params)
      const decrypted = new Map<string, Credential>();
      for (const [key, entry] of Object.entries(this.cache.credentials)) {
        const result = this.decrypt(entry);
        if (!result.ok) {
          return Err(
            createStoreError(
              "MIGRATION_ERROR",
              `Failed to decrypt credential '${key}' during migration: ${result.error.message}`,
              "file"
            )
          );
        }
        decrypted.set(key, result.value);
      }

      // 2. Generate new salt for v2 (security best practice)
      const newSalt = randomBytes(SALT_LENGTH);
      this.salt = newSalt;

      // 3. Derive new key with v2 params
      this.deriveKey(CURRENT_SCRYPT_VERSION);

      // 4. Re-encrypt all credentials with new key
      const newCredentials: Record<string, EncryptedCredentialEntry> = {};
      for (const [key, credential] of decrypted) {
        const result = this.encrypt(credential);
        if (!result.ok) {
          // ROLLBACK on failure
          this.salt = oldSalt;
          this.derivedKey = oldDerivedKey;
          this.cache = oldCache;
          return Err(
            createStoreError(
              "MIGRATION_ERROR",
              `Failed to re-encrypt credential '${key}' during migration`,
              "file"
            )
          );
        }
        newCredentials[key] = result.value;
      }

      // 5. Update cache with new version
      this.cache = {
        version: FORMAT_VERSION,
        scryptVersion: CURRENT_SCRYPT_VERSION,
        salt: newSalt.toString("hex"),
        credentials: newCredentials,
      };

      // 6. Save migrated file
      const saveResult = await this.saveFile();
      if (!saveResult.ok) {
        // ROLLBACK on save failure
        this.salt = oldSalt;
        this.derivedKey = oldDerivedKey;
        this.cache = oldCache;
        return saveResult;
      }

      return Ok(undefined);
    } catch (error) {
      // ROLLBACK on any exception
      this.salt = oldSalt;
      this.derivedKey = oldDerivedKey;
      this.cache = oldCache;
      return Err(
        createStoreError(
          "MIGRATION_ERROR",
          `Migration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          "file"
        )
      );
    }
  }

  /**
   * Clear cached data (for testing or security)
   */
  clearCache(): void {
    this.cache = null;
    this.salt = null;
    if (this.derivedKey) {
      this.derivedKey.fill(0);
      this.derivedKey = null;
    }
  }
}
