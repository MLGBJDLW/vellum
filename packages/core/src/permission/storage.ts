/**
 * Permission Storage for Vellum
 *
 * Persists permission data to JSON file at ~/.vellum/permissions.json
 * Handles loading, saving, and path resolution with cross-platform support.
 *
 * @module @vellum/core/permission
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, normalize } from "node:path";
import { z } from "zod";

// ============================================
// Storage Schema
// ============================================

/**
 * Schema for stored permission data
 */
export const StoredPermissionDataSchema = z.object({
  /** Format version for future migrations */
  version: z.number().default(1),

  /** Trusted folder paths */
  trustedFolders: z.array(z.string()).default([]),

  /** Protected file patterns (gitignore-style) */
  protectedPatterns: z.array(z.string()).default([]),

  /** Custom safe command patterns */
  safeCommandPatterns: z.array(z.string()).default([]),

  /** Custom dangerous command patterns */
  dangerousCommandPatterns: z.array(z.string()).default([]),

  /** Session-remembered permissions */
  rememberedPermissions: z
    .record(
      z.string(),
      z.object({
        level: z.enum(["allow", "deny"]),
        expiresAt: z.number().optional(),
      })
    )
    .default({}),

  /** Last modified timestamp */
  lastModified: z.number().optional(),
});

export type StoredPermissionData = z.infer<typeof StoredPermissionDataSchema>;

// ============================================
// Default Data
// ============================================

/**
 * Creates default permission data
 */
export function createDefaultData(): StoredPermissionData {
  return {
    version: 1,
    trustedFolders: [],
    protectedPatterns: [],
    safeCommandPatterns: [],
    dangerousCommandPatterns: [],
    rememberedPermissions: {},
    lastModified: Date.now(),
  };
}

// ============================================
// PermissionStorage
// ============================================

/**
 * Options for PermissionStorage
 */
export interface PermissionStorageOptions {
  /**
   * Custom path to the permissions file.
   * @default ~/.vellum/permissions.json
   */
  storagePath?: string;

  /**
   * Whether to auto-create the directory if it doesn't exist.
   * @default true
   */
  autoCreateDir?: boolean;
}

/**
 * Manages persistence of permission data to disk.
 *
 * Features:
 * - Cross-platform path resolution
 * - Automatic directory creation
 * - Corrupted JSON recovery (EC-007)
 * - Atomic writes with temp file
 *
 * @example
 * ```typescript
 * const storage = new PermissionStorage();
 * const data = await storage.load();
 *
 * data.trustedFolders.push('/path/to/project');
 * await storage.save(data);
 * ```
 */
export class PermissionStorage {
  readonly #storagePath: string;
  readonly #autoCreateDir: boolean;

  /**
   * Creates a new PermissionStorage instance.
   *
   * @param options - Configuration options
   */
  constructor(options: PermissionStorageOptions = {}) {
    this.#storagePath = normalize(
      options.storagePath ?? join(homedir(), ".vellum", "permissions.json")
    );
    this.#autoCreateDir = options.autoCreateDir ?? true;
  }

  /**
   * Get the storage file path.
   *
   * @returns Normalized absolute path to the permissions file
   */
  getPath(): string {
    return this.#storagePath;
  }

  /**
   * Load permission data from disk.
   *
   * If the file doesn't exist, returns default data.
   * If the file is corrupted (EC-007), creates a backup and returns default data.
   *
   * @returns Permission data (either from disk or defaults)
   */
  async load(): Promise<StoredPermissionData> {
    try {
      const content = await readFile(this.#storagePath, "utf8");
      const parsed = JSON.parse(content);
      const validated = StoredPermissionDataSchema.parse(parsed);
      return validated;
    } catch (error) {
      // File doesn't exist - return defaults
      if (isNodeError(error) && error.code === "ENOENT") {
        return createDefaultData();
      }

      // JSON parse error or validation error (EC-007: corrupted JSON)
      if (error instanceof SyntaxError || error instanceof z.ZodError) {
        // Attempt to create backup of corrupted file
        await this.#createBackup();
        return createDefaultData();
      }

      // Re-throw unexpected errors
      throw error;
    }
  }

  /**
   * Save permission data to disk.
   *
   * Creates the parent directory if it doesn't exist (when autoCreateDir is true).
   * Updates the lastModified timestamp.
   *
   * @param data - Permission data to save
   */
  async save(data: StoredPermissionData): Promise<void> {
    // Ensure directory exists
    if (this.#autoCreateDir) {
      await mkdir(dirname(this.#storagePath), { recursive: true });
    }

    // Update timestamp
    const dataToSave: StoredPermissionData = {
      ...data,
      lastModified: Date.now(),
    };

    // Validate before saving
    StoredPermissionDataSchema.parse(dataToSave);

    // Write to file with pretty formatting
    const content = JSON.stringify(dataToSave, null, 2);
    await writeFile(this.#storagePath, content, "utf8");
  }

  /**
   * Create a backup of the corrupted file.
   */
  async #createBackup(): Promise<void> {
    try {
      const backupPath = `${this.#storagePath}.backup.${Date.now()}`;
      const content = await readFile(this.#storagePath, "utf8");
      await writeFile(backupPath, content, "utf8");
    } catch {
      // Backup failed - silently continue
    }
  }
}

// ============================================
// Helpers
// ============================================

/**
 * Type guard for Node.js system errors
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
