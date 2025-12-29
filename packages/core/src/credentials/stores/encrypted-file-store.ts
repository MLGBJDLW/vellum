/**
 * Encrypted File Credential Store
 *
 * Secure credential storage using AES-256-GCM encryption with scrypt key derivation.
 * Provides a portable fallback when OS keychain is unavailable.
 *
 * @module credentials/stores/encrypted-file-store
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { chmod, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
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
 * scrypt parameters per OWASP recommendations
 * N=16384 (2^14), r=8, p=1 provides good security/performance balance
 */
const SCRYPT_PARAMS = {
  N: 16384, // CPU/memory cost parameter
  r: 8, // Block size
  p: 1, // Parallelization
  keyLength: 32, // 256 bits for AES-256
} as const;

/** Salt length in bytes (256 bits) */
const SALT_LENGTH = 32;

/** IV/nonce length for AES-GCM (96 bits recommended) */
const IV_LENGTH = 16;

/** File format version for future compatibility */
const FORMAT_VERSION = 1;

/** Secure file permissions (owner read/write only) */
const SECURE_FILE_MODE = 0o600;

// =============================================================================
// Types
// =============================================================================

/**
 * Encrypted file format structure
 */
interface EncryptedFileFormat {
  /** Format version for compatibility */
  version: number;
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
  private cache: EncryptedFileFormat | null = null;
  private salt: Buffer | null = null;
  private derivedKey: Buffer | null = null;

  /**
   * Create a new EncryptedFileStore
   *
   * @param options - Configuration options
   * @param options.filePath - Path to the encrypted credentials file
   * @param options.password - Master password for encryption
   */
  constructor(options: { filePath: string; password: string }) {
    this.filePath = options.filePath;
    this.password = options.password;
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
    this.cache?.credentials[credKey] = encryptResult.value;

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

    delete this.cache?.credentials[credKey];

    // If no credentials left, delete the file
    if (Object.keys(this.cache?.credentials).length === 0) {
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

      // Extract salt and derive key
      this.salt = Buffer.from(data.salt, "hex");
      this.deriveKey();

      this.cache = data;
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

    // Initialize new file
    this.salt = randomBytes(SALT_LENGTH);
    this.deriveKey();

    this.cache = {
      version: FORMAT_VERSION,
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

    try {
      // Ensure directory exists
      await mkdir(dirname(this.filePath), { recursive: true });

      // Write file
      const content = JSON.stringify(this.cache, null, 2);
      await writeFile(this.filePath, content, { encoding: "utf-8", mode: SECURE_FILE_MODE });

      // Set permissions (redundant on some systems but ensures correct mode)
      await chmod(this.filePath, SECURE_FILE_MODE);

      return Ok(undefined);
    } catch (error) {
      return Err(
        createStoreError(
          "IO_ERROR",
          `Failed to write credential file: ${error instanceof Error ? error.message : String(error)}`,
          "file",
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Derive encryption key from password using scrypt
   */
  private deriveKey(): void {
    if (!this.salt) {
      throw new Error("Salt not initialized");
    }

    this.derivedKey = scryptSync(this.password, this.salt, SCRYPT_PARAMS.keyLength, {
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
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
