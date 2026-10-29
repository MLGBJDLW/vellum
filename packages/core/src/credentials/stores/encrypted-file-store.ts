/**
 * Encrypted File Credential Store
 *
 * Secure credential storage using AES-256-GCM encryption with scrypt key derivation.
 * Provides a portable fallback when OS keychain is unavailable.
 *
 * @module credentials/stores/encrypted-file-store
 */

import { execFile } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

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
const LEGACY_DEFAULT_PASSWORD = "vellum-default-key";
const execFileAsync = promisify(execFile);

class CredentialFileChangedError extends Error {}

/** Secure the empty staging file before placing secret bytes in it. */
async function secureSecretFile(filePath: string): Promise<void> {
  if (process.platform !== "win32") {
    await chmod(filePath, SECURE_FILE_MODE);
    return;
  }
  const options = { windowsHide: true, timeout: 5_000, maxBuffer: 16_384 };
  const identity = await execFileAsync("whoami.exe", ["/user", "/fo", "csv", "/nh"], options);
  const sid = identity.stdout.match(/S-1-\d+(?:-\d+)+/)?.[0];
  if (!sid)
    throw new Error("Cannot identify the current Windows account for credential protection");
  await execFileAsync(
    "icacls.exe",
    [filePath, "/inheritance:r", "/grant:r", `*${sid}:F`, "/q"],
    options
  );
}

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
  /** Managed files must never fall back to the retired shared password. */
  keySource?: "managed";
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
  /** Explicit master password. Omit to use an owner-only generated local secret. */
  password?: string;
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
  private password: string | undefined;
  private readonly managedPassword: boolean;
  private managedSecret: Promise<string> | undefined;
  private operation: Promise<void> = Promise.resolve();
  /** Exact revision read from disk, checked under the write lock before publishing. */
  private loadedContent: string | null = null;
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
    this.managedPassword = options.password === undefined;
    this.autoMigrate = options.autoMigrate ?? false;
  }

  /**
   * Check if the store is available
   * File store is available if we have a valid password
   */
  async isAvailable(): Promise<Result<boolean, CredentialStoreError>> {
    if (this.password === "") {
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
    return this.serialize(() => this.getCredential(provider, key));
  }

  private async getCredential(
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
    return this.serialize(() => this.setCredential(credential));
  }

  private async setCredential(credential: Credential): Promise<Result<void, CredentialStoreError>> {
    // Another instance may have saved or migrated since this instance last read.
    this.clearCache();
    // Ensure file exists and is loaded
    const loadResult = await this.loadOrInitFile();
    if (!loadResult.ok) {
      return loadResult;
    }
    const readable = this.verifyReadable();
    if (!readable.ok) return readable;

    // Encrypt the credential
    const encryptResult = this.encrypt(credential);
    if (!encryptResult.ok) {
      return encryptResult;
    }

    // Update cache
    const credKey = getCredentialKey(credential.provider);
    if (this.cache) {
      this.cache = {
        ...this.cache,
        credentials: { ...this.cache.credentials, [credKey]: encryptResult.value },
      };
    }

    // Save to disk
    const saved = await this.saveFile();
    if (!saved.ok) this.clearCache();
    return saved;
  }

  /**
   * Delete a credential
   *
   * @param provider - Provider name
   * @param key - Optional specific key
   */
  async delete(provider: string, key?: string): Promise<Result<boolean, CredentialStoreError>> {
    return this.serialize(() => this.deleteCredential(provider, key));
  }

  private async deleteCredential(
    provider: string,
    key?: string
  ): Promise<Result<boolean, CredentialStoreError>> {
    this.clearCache();
    const loadResult = await this.loadFile();
    if (!loadResult.ok) {
      if (loadResult.error.code === "NOT_FOUND") {
        return Ok(false);
      }
      return loadResult;
    }

    const readable = this.verifyReadable();
    if (!readable.ok) return readable;

    const credKey = getCredentialKey(provider, key);
    const existed = credKey in (this.cache?.credentials ?? {});

    if (!existed) {
      return Ok(false);
    }

    if (this.cache) {
      const credentials = { ...this.cache.credentials };
      delete credentials[credKey];
      this.cache = { ...this.cache, credentials };
    }

    // If no credentials left, delete the file
    if (Object.keys(this.cache?.credentials ?? {}).length === 0) {
      const removed = await this.saveFile(true);
      this.clearCache();
      return removed.ok ? Ok(true) : removed;
    }

    const saveResult = await this.saveFile();
    if (!saveResult.ok) {
      this.clearCache();
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
    return this.serialize(() => this.listCredentials(provider));
  }

  private async listCredentials(
    provider?: string
  ): Promise<Result<readonly CredentialRef[], CredentialStoreError>> {
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
    return this.serialize(() => this.credentialExists(provider, key));
  }

  private async credentialExists(
    provider: string,
    key?: string
  ): Promise<Result<boolean, CredentialStoreError>> {
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

  /** Keep cache/key mutations isolated within an instance, including lazy migration. */
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.operation.then(operation);
    this.operation = pending.then(
      () => undefined,
      () => undefined
    );
    return pending;
  }

  private verifyReadable(): Result<void, CredentialStoreError> {
    for (const entry of Object.values(this.cache?.credentials ?? {})) {
      if (!this.decrypt(entry).ok) {
        return Err(
          createStoreError(
            "DECRYPTION_ERROR",
            "Existing credentials cannot be decrypted; refusing to overwrite them. Restore the matching key file or VELLUM_CREDENTIAL_PASSWORD.",
            "file"
          )
        );
      }
    }
    return Ok(undefined);
  }

  /** Publish a complete protected key atomically; concurrent creators reuse the winner. */
  private async readManagedSecret(create: boolean): Promise<string> {
    const keyPath = `${this.filePath}.key`;
    const read = async () => {
      const info = await lstat(keyPath);
      if (!info.isFile() || info.isSymbolicLink())
        throw new Error("Credential encryption key must be a regular file");
      const value = (await readFile(keyPath, "utf-8")).trim();
      if (!/^[a-f0-9]{64}$/.test(value))
        throw new Error("Credential encryption key is invalid; restore the key file from backup");
      return value;
    };
    try {
      return await read();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (!create)
        throw new Error(
          "Credential encryption key is missing; restore credentials.enc.key from backup. Existing credentials were not changed."
        );
    }
    await mkdir(dirname(keyPath), { recursive: true });
    const stagingPath = `${keyPath}.tmp.${process.pid}.${randomBytes(8).toString("hex")}`;
    const handle = await open(stagingPath, "wx", SECURE_FILE_MODE);
    try {
      await secureSecretFile(stagingPath);
      await handle.writeFile(randomBytes(32).toString("hex"), "utf-8");
      await handle.sync();
    } catch (error) {
      await handle.close();
      await unlink(stagingPath).catch(() => {});
      throw error;
    }
    await handle.close();
    try {
      // link fails with EEXIST rather than overwriting another process's key.
      await link(stagingPath, keyPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    } finally {
      await unlink(stagingPath).catch(() => {});
    }
    return read();
  }

  private getManagedSecret(create: boolean): Promise<string> {
    if (!this.managedSecret) {
      this.managedSecret = this.readManagedSecret(create).catch((error: unknown) => {
        this.managedSecret = undefined;
        throw error;
      });
    }
    return this.managedSecret;
  }

  /**
   * Load the encrypted file from disk
   */
  private async loadFile(): Promise<Result<void, CredentialStoreError>> {
    return this.loadFileContents();
  }

  private async loadFileContents(
    retryMigration = true
  ): Promise<Result<void, CredentialStoreError>> {
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
      this.loadedContent = content;

      // Extract salt and derive key using version from cache
      this.salt = Buffer.from(data.salt, "hex");
      if (this.managedPassword) {
        if (data.keySource === "managed") {
          this.password = await this.getManagedSecret(false);
        } else {
          // Only unmarked legacy files are eligible for migration. Validate all
          // credentials before creating a key or changing the ciphertext.
          this.password = LEGACY_DEFAULT_PASSWORD;
        }
      }
      this.deriveKey();

      if (this.managedPassword) {
        for (const entry of Object.values(data.credentials)) {
          if (!this.decrypt(entry).ok) {
            this.clearCache();
            return Err(
              createStoreError(
                "DECRYPTION_ERROR",
                "Unable to decrypt existing credentials. Restore the matching key file or set VELLUM_CREDENTIAL_PASSWORD for a custom password; the original file was not changed.",
                "file"
              )
            );
          }
        }
        if (data.keySource !== "managed") {
          const managedPassword = await this.getManagedSecret(true);
          const migrated = await this.migrateToCurrentVersion(managedPassword);
          if (!migrated.ok) {
            this.clearCache();
            if (retryMigration && migrated.error.cause instanceof CredentialFileChangedError) {
              return this.loadFileContents(false);
            }
            return migrated;
          }
        }
      }

      // Check if migration is needed
      if (this.autoMigrate && this.needsMigration()) {
        // Auto-migrate to current scrypt version
        // Note: This adds ~200ms latency on first read for files needing migration
        const migrateResult = await this.migrateToCurrentVersion();
        if (!migrateResult.ok) {
          if (migrateResult.error.cause instanceof CredentialFileChangedError) {
            this.clearCache();
            return retryMigration ? this.loadFileContents(false) : migrateResult;
          }
          // Log but don't fail - credentials are still readable with v1 params
          // The migration can be retried later
          console.warn(
            `[EncryptedFileStore] Auto-migration failed: ${migrateResult.error.message}`
          );
        }
      }

      return Ok(undefined);
    } catch (error) {
      this.clearCache();
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
    if (this.managedPassword) {
      try {
        this.password = await this.getManagedSecret(true);
      } catch (error) {
        return Err(
          createStoreError(
            "ENCRYPTION_ERROR",
            `Cannot initialize credential protection: ${error instanceof Error ? error.message : "Unknown error"}`,
            "file"
          )
        );
      }
    }
    this.salt = randomBytes(SALT_LENGTH);
    this.deriveKey(scryptVersion);

    this.cache = {
      version: FORMAT_VERSION,
      scryptVersion: scryptVersion,
      salt: this.salt.toString("hex"),
      credentials: {},
      ...(this.managedPassword ? { keySource: "managed" as const } : {}),
    };

    return Ok(undefined);
  }

  /**
   * Save the encrypted file to disk
   */
  private async saveFile(remove = false): Promise<Result<void, CredentialStoreError>> {
    if (!this.cache) {
      return Err(createStoreError("IO_ERROR", "No data to save", "file"));
    }

    const tempPath = `${this.filePath}.tmp.${process.pid}.${randomBytes(8).toString("hex")}`;
    const lockPath = `${this.filePath}.lock`;
    const expectedContent = this.loadedContent;
    const content = remove ? null : JSON.stringify(this.cache, null, 2);
    let lock: Awaited<ReturnType<typeof open>> | undefined;

    try {
      // Ensure directory exists
      await mkdir(dirname(this.filePath), { recursive: true });

      // Only the lock holder may compare and replace the file. A stale lock is
      // never stolen on a timer: a slow writer must not lose its ownership.
      const deadline = Date.now() + 2_000;
      while (!lock) {
        try {
          lock = await open(lockPath, "wx", SECURE_FILE_MODE);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          if (Date.now() >= deadline) {
            return Err(
              createStoreError(
                "IO_ERROR",
                `Credential store is busy; retry after the other operation finishes. If all Vellum processes have stopped, remove the stale lock at ${lockPath}.`,
                "file"
              )
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
      await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: Date.now() }), "utf-8");

      let currentContent: string | null;
      try {
        currentContent = await readFile(this.filePath, "utf-8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        currentContent = null;
      }
      if (currentContent !== expectedContent) {
        const conflict = new CredentialFileChangedError(
          "Credential file changed in another process; retry the operation. Existing credentials were not overwritten."
        );
        return Err(createStoreError("IO_ERROR", conflict.message, "file", conflict));
      }

      if (content === null) {
        await unlink(this.filePath);
        this.loadedContent = null;
        return Ok(undefined);
      }

      // Atomic write: write to temp file first, then rename
      await writeFile(tempPath, content, { encoding: "utf-8", mode: SECURE_FILE_MODE });
      await chmod(tempPath, SECURE_FILE_MODE);

      // Atomic rename (on most filesystems)
      await rename(tempPath, this.filePath);
      this.loadedContent = content;

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
    } finally {
      if (lock) {
        await lock.close().catch(() => {});
        await unlink(lockPath).catch(() => {});
      }
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
    if (this.password === undefined)
      throw new Error("Credential encryption password is not initialized");

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
    return this.serialize(() => this.checkMigration());
  }

  private async checkMigration(): Promise<Result<boolean, CredentialStoreError>> {
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
    return this.serialize(() => this.migrateFile());
  }

  private async migrateFile(): Promise<Result<void, CredentialStoreError>> {
    this.clearCache();
    const loadResult = await this.loadFile();
    if (!loadResult.ok) {
      if (loadResult.error.code === "NOT_FOUND") {
        return Ok(undefined); // Nothing to migrate
      }
      return loadResult;
    }
    const migrated = await this.migrateToCurrentVersion();
    if (!migrated.ok) this.clearCache();
    return migrated;
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
  private async migrateToCurrentVersion(
    managedPassword?: string
  ): Promise<Result<void, CredentialStoreError>> {
    if (!this.cache || (!this.needsMigration() && managedPassword === undefined)) {
      return Ok(undefined);
    }

    // Save old state for rollback
    const oldSalt = this.salt;
    const oldDerivedKey = this.derivedKey;
    const oldCache = { ...this.cache };
    const oldPassword = this.password;
    const targetVersion =
      managedPassword === undefined ? CURRENT_SCRYPT_VERSION : getNewFileScryptVersion();

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
      if (managedPassword !== undefined) this.password = managedPassword;

      // 3. Derive new key with v2 params
      this.deriveKey(targetVersion);

      // 4. Re-encrypt all credentials with new key
      const newCredentials: Record<string, EncryptedCredentialEntry> = {};
      for (const [key, credential] of decrypted) {
        const result = this.encrypt(credential);
        if (!result.ok) {
          // ROLLBACK on failure
          this.salt = oldSalt;
          this.derivedKey = oldDerivedKey;
          this.cache = oldCache;
          this.password = oldPassword;
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
        ...oldCache,
        version: FORMAT_VERSION,
        scryptVersion: targetVersion,
        salt: newSalt.toString("hex"),
        credentials: newCredentials,
        ...(managedPassword !== undefined ? { keySource: "managed" as const } : {}),
      };

      // 6. Save migrated file
      const saveResult = await this.saveFile();
      if (!saveResult.ok) {
        // ROLLBACK on save failure
        this.salt = oldSalt;
        this.derivedKey = oldDerivedKey;
        this.cache = oldCache;
        this.password = oldPassword;
        return saveResult;
      }

      return Ok(undefined);
    } catch (error) {
      // ROLLBACK on any exception
      this.salt = oldSalt;
      this.derivedKey = oldDerivedKey;
      this.cache = oldCache;
      this.password = oldPassword;
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
    this.loadedContent = null;
    this.salt = null;
    if (this.managedPassword) {
      // A restored key file must replace any previously cached invalid secret.
      // Explicit caller-supplied passwords remain the configured source.
      this.managedSecret = undefined;
      this.password = undefined;
    }
    if (this.derivedKey) {
      this.derivedKey.fill(0);
      this.derivedKey = null;
    }
  }
}
