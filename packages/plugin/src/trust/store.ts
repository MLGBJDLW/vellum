/**
 * TrustStore - Persistent storage for plugin trust decisions.
 *
 * Provides JSON file-based persistence for trust entries, with automatic
 * backup and recovery for corrupted files.
 *
 * @module trust/store
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { z } from "zod";

import { type TrustedPlugin, TrustedPluginSchema } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/** Current schema version for the trust store file */
const TRUST_STORE_VERSION = 1;

/** Default file name for the trust store */
const DEFAULT_TRUST_FILE = "trusted-plugins.json";

/** Backup file suffix for corrupted files */
const BACKUP_SUFFIX = ".backup";

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when trust store operations fail.
 *
 * Contains detailed information about what went wrong during trust store
 * operations, including the file path and specific error details.
 *
 * @example
 * ```typescript
 * try {
 *   await trustStore.save();
 * } catch (error) {
 *   if (error instanceof TrustStoreError) {
 *     console.error(`Trust store error at ${error.filePath}: ${error.message}`);
 *   }
 * }
 * ```
 */
export class TrustStoreError extends Error {
  /** Path to the trust store file */
  public readonly filePath: string;

  /** Type of operation that failed */
  public readonly operation: "load" | "save" | "backup" | "delete";

  /** Additional error details */
  public readonly details: unknown;

  /** Original error that caused this error, if any */
  public readonly cause?: Error;

  constructor(
    message: string,
    filePath: string,
    operation: "load" | "save" | "backup" | "delete",
    details?: unknown,
    cause?: Error
  ) {
    super(message);
    this.name = "TrustStoreError";
    this.filePath = filePath;
    this.operation = operation;
    this.details = details;
    this.cause = cause;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TrustStoreError);
    }
  }
}

// =============================================================================
// File Schema
// =============================================================================

/**
 * Schema for the trust store file format.
 */
export const TrustStoreFileSchema = z.object({
  /** Schema version for forward compatibility */
  version: z.number().int().positive(),
  /** Map of plugin names to their trust entries */
  plugins: z.record(z.string(), TrustedPluginSchema),
});

/**
 * Type for the trust store file contents.
 */
export type TrustStoreFile = z.infer<typeof TrustStoreFileSchema>;

// =============================================================================
// TrustStore Class
// =============================================================================

/**
 * Persistent store for plugin trust decisions.
 *
 * Manages trust entries for plugins with JSON file-based persistence.
 * Handles edge cases like missing files, corrupted data, and permission errors.
 *
 * @example
 * ```typescript
 * const store = new TrustStore();
 * await store.load();
 *
 * // Check if a plugin is trusted
 * const trust = store.get("my-plugin");
 * if (trust) {
 *   console.log(`Plugin trusted since ${trust.trustedAt}`);
 * }
 *
 * // Add trust for a new plugin
 * store.set("new-plugin", {
 *   pluginName: "new-plugin",
 *   version: "1.0.0",
 *   trustedAt: new Date().toISOString(),
 *   capabilities: ["execute-hooks"],
 *   contentHash: "abc123...",
 *   trustLevel: "full"
 * });
 * await store.save();
 * ```
 */
export class TrustStore {
  /** Path to the trust store JSON file */
  private readonly filePath: string;

  /** In-memory cache of trust entries */
  private plugins: Map<string, TrustedPlugin>;

  /** Whether the store has been loaded from disk */
  private loaded: boolean;

  /**
   * Creates a new TrustStore instance.
   *
   * @param filePath - Path to the trust store JSON file.
   *   Defaults to ~/.vellum/trusted-plugins.json
   *
   * @example
   * ```typescript
   * // Use default location
   * const store = new TrustStore();
   *
   * // Use custom location
   * const customStore = new TrustStore("/custom/path/trust.json");
   * ```
   */
  constructor(filePath?: string) {
    this.filePath = filePath ?? this.getDefaultFilePath();
    this.plugins = new Map();
    this.loaded = false;
  }

  /**
   * Gets the default file path for the trust store.
   *
   * @returns Default path: ~/.vellum/trusted-plugins.json
   */
  private getDefaultFilePath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, ".vellum", DEFAULT_TRUST_FILE);
  }

  /**
   * Retrieves trust information for a plugin.
   *
   * @param pluginName - Name of the plugin to look up
   * @returns Trust entry if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const trust = store.get("my-plugin");
   * if (trust?.trustLevel === "full") {
   *   // Plugin has full trust
   * }
   * ```
   */
  get(pluginName: string): TrustedPlugin | undefined {
    return this.plugins.get(pluginName);
  }

  /**
   * Sets or updates trust information for a plugin.
   *
   * @param pluginName - Name of the plugin
   * @param trust - Trust entry to store
   *
   * @example
   * ```typescript
   * store.set("my-plugin", {
   *   pluginName: "my-plugin",
   *   version: "2.0.0",
   *   trustedAt: new Date().toISOString(),
   *   capabilities: ["execute-hooks", "spawn-subagent"],
   *   contentHash: "sha256:...",
   *   trustLevel: "full"
   * });
   * ```
   */
  set(pluginName: string, trust: TrustedPlugin): void {
    this.plugins.set(pluginName, trust);
  }

  /**
   * Removes trust for a plugin.
   *
   * @param pluginName - Name of the plugin to remove trust for
   * @returns true if the plugin was removed, false if it wasn't found
   *
   * @example
   * ```typescript
   * if (store.delete("deprecated-plugin")) {
   *   console.log("Plugin trust revoked");
   *   await store.save();
   * }
   * ```
   */
  delete(pluginName: string): boolean {
    return this.plugins.delete(pluginName);
  }

  /**
   * Lists all trusted plugins.
   *
   * @returns Array of all trust entries
   *
   * @example
   * ```typescript
   * const allTrusted = store.list();
   * console.log(`${allTrusted.length} plugins trusted`);
   * ```
   */
  list(): TrustedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Persists the trust store to disk.
   *
   * Creates the directory if it doesn't exist. Atomic write is performed
   * by writing to a temp file first then renaming.
   *
   * @throws {TrustStoreError} If the file cannot be written due to permissions
   *   or other filesystem errors
   *
   * @example
   * ```typescript
   * store.set("my-plugin", trustEntry);
   * await store.save(); // Persists to disk
   * ```
   */
  async save(): Promise<void> {
    const fileContent: TrustStoreFile = {
      version: TRUST_STORE_VERSION,
      plugins: Object.fromEntries(this.plugins),
    };

    const jsonContent = JSON.stringify(fileContent, null, 2);

    try {
      // Ensure directory exists
      const dirPath = path.dirname(this.filePath);
      await fs.mkdir(dirPath, { recursive: true });

      // Write to temp file first for atomic operation
      const tempPath = `${this.filePath}.tmp`;
      await fs.writeFile(tempPath, jsonContent, "utf-8");

      // Rename temp file to actual file (atomic on most filesystems)
      await fs.rename(tempPath, this.filePath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for permission errors
      if (this.isPermissionError(error)) {
        throw new TrustStoreError(
          `Permission denied writing to trust store: ${errorMessage}`,
          this.filePath,
          "save",
          { errorCode: (error as NodeJS.ErrnoException).code },
          error instanceof Error ? error : undefined
        );
      }

      throw new TrustStoreError(
        `Failed to save trust store: ${errorMessage}`,
        this.filePath,
        "save",
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Loads the trust store from disk.
   *
   * Handles missing files gracefully (starts with empty store).
   * Corrupted files are backed up and a new empty store is created.
   *
   * @throws {TrustStoreError} If the file cannot be read due to permissions
   *
   * @example
   * ```typescript
   * const store = new TrustStore();
   * await store.load(); // Load existing trust data
   * ```
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(content);
      const result = TrustStoreFileSchema.safeParse(parsed);

      if (!result.success) {
        // File is corrupted - backup and recreate
        await this.handleCorruptedFile(content, result.error);
        return;
      }

      // Load plugins into memory
      this.plugins.clear();
      for (const [name, trust] of Object.entries(result.data.plugins)) {
        this.plugins.set(name, trust);
      }

      this.loaded = true;
    } catch (error) {
      // File doesn't exist - start with empty store
      if (this.isNotFoundError(error)) {
        this.plugins.clear();
        this.loaded = true;
        return;
      }

      // Permission error
      if (this.isPermissionError(error)) {
        throw new TrustStoreError(
          `Permission denied reading trust store: ${
            error instanceof Error ? error.message : String(error)
          }`,
          this.filePath,
          "load",
          { errorCode: (error as NodeJS.ErrnoException).code },
          error instanceof Error ? error : undefined
        );
      }

      // JSON parse error - corrupted file
      if (error instanceof SyntaxError) {
        await this.handleCorruptedFile("", error);
        return;
      }

      throw new TrustStoreError(
        `Failed to load trust store: ${error instanceof Error ? error.message : String(error)}`,
        this.filePath,
        "load",
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Handles a corrupted trust store file by backing it up and creating a new empty store.
   *
   * @param originalContent - The corrupted file content
   * @param parseError - The error that occurred during parsing
   */
  private async handleCorruptedFile(
    _originalContent: string,
    parseError: Error | z.ZodError
  ): Promise<void> {
    const backupPath = `${this.filePath}${BACKUP_SUFFIX}`;

    try {
      // Backup the corrupted file
      await fs.copyFile(this.filePath, backupPath);
    } catch (backupError) {
      // If backup fails due to source not existing, that's OK
      if (!this.isNotFoundError(backupError)) {
        throw new TrustStoreError(
          `Failed to backup corrupted trust store: ${
            backupError instanceof Error ? backupError.message : String(backupError)
          }`,
          this.filePath,
          "backup",
          { parseError: parseError.message },
          backupError instanceof Error ? backupError : undefined
        );
      }
    }

    // Start with empty store
    this.plugins.clear();
    this.loaded = true;
  }

  /**
   * Checks if an error is a file not found error.
   */
  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    );
  }

  /**
   * Checks if an error is a permission error.
   */
  private isPermissionError(error: unknown): boolean {
    if (!(error instanceof Error) || !("code" in error)) {
      return false;
    }
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EACCES" || code === "EPERM";
  }

  /**
   * Gets the file path of this trust store.
   *
   * @returns The file path
   */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Checks if the store has been loaded from disk.
   *
   * @returns true if load() has been called successfully
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Gets the number of trusted plugins.
   *
   * @returns Count of trust entries
   */
  size(): number {
    return this.plugins.size;
  }

  /**
   * Clears all trust entries from memory.
   * Does not persist to disk - call save() to persist.
   */
  clear(): void {
    this.plugins.clear();
  }

  /**
   * Checks if a plugin exists in the trust store.
   *
   * @param pluginName - Name of the plugin to check
   * @returns true if the plugin has a trust entry
   */
  has(pluginName: string): boolean {
    return this.plugins.has(pluginName);
  }
}
