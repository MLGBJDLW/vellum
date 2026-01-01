// ============================================
// Session Storage Configuration
// ============================================

/**
 * Storage configuration for session persistence.
 *
 * Provides OS-specific default paths and configuration options
 * for storing session data on disk.
 *
 * @module @vellum/core/session/storage
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import * as zlib from "node:zlib";
import { z } from "zod";
import { type Session, type SessionMetadata, SessionSchema } from "./types.js";

// Promisified zlib functions
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// =============================================================================
// Storage Error Types
// =============================================================================

/**
 * Types of storage-related errors.
 *
 * Used to categorize errors for handling and reporting.
 */
export enum StorageErrorType {
  /** File system I/O errors (read, write, permissions) */
  IO = "io",
  /** JSON parse/stringify errors */
  SERIALIZATION = "serialization",
  /** Session does not exist in storage */
  SESSION_NOT_FOUND = "session_not_found",
  /** Invalid file path format or characters */
  INVALID_PATH = "invalid_path",
}

/**
 * Options for creating a StorageError.
 */
export interface StorageErrorOptions {
  /** The original error that caused this error */
  cause?: Error;
  /** The file path involved in the error */
  path?: string;
  /** The session ID involved in the error */
  sessionId?: string;
}

/**
 * Error class for storage-related failures.
 *
 * Provides typed errors with context for debugging and error handling.
 * Use the static factory methods for common error scenarios.
 *
 * @example
 * ```typescript
 * // Using factory methods
 * throw StorageError.io("Failed to write file", originalError, "/path/to/file");
 * throw StorageError.sessionNotFound("session-123");
 * throw StorageError.serialization("Invalid JSON format", parseError);
 * throw StorageError.invalidPath("/invalid/\0/path");
 * ```
 */
export class StorageError extends Error {
  /** The type/category of this storage error */
  public readonly type: StorageErrorType;
  /** The original error that caused this error */
  public readonly cause?: Error;
  /** The file path involved in the error */
  public readonly path?: string;
  /** The session ID involved in the error */
  public readonly sessionId?: string;

  /**
   * Creates a new StorageError.
   *
   * Prefer using the static factory methods for common cases.
   *
   * @param message - Human-readable error description
   * @param type - The category of storage error
   * @param options - Additional error context
   */
  constructor(message: string, type: StorageErrorType, options?: StorageErrorOptions) {
    super(message);
    this.name = "StorageError";
    this.type = type;
    this.cause = options?.cause;
    this.path = options?.path;
    this.sessionId = options?.sessionId;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StorageError);
    }
  }

  /**
   * Creates an I/O error for file system operations.
   *
   * @param message - Description of the I/O failure
   * @param cause - The original file system error
   * @param path - The file path that caused the error
   * @returns StorageError with type IO
   *
   * @example
   * ```typescript
   * throw StorageError.io("Failed to read session file", err, sessionPath);
   * ```
   */
  static io(message: string, cause?: Error, path?: string): StorageError {
    return new StorageError(message, StorageErrorType.IO, { cause, path });
  }

  /**
   * Creates an error for missing sessions.
   *
   * @param sessionId - The ID of the session that was not found
   * @returns StorageError with type SESSION_NOT_FOUND
   *
   * @example
   * ```typescript
   * throw StorageError.sessionNotFound("session-abc-123");
   * ```
   */
  static sessionNotFound(sessionId: string): StorageError {
    return new StorageError(`Session not found: ${sessionId}`, StorageErrorType.SESSION_NOT_FOUND, {
      sessionId,
    });
  }

  /**
   * Creates an error for JSON serialization/deserialization failures.
   *
   * @param message - Description of the serialization failure
   * @param cause - The original JSON error
   * @returns StorageError with type SERIALIZATION
   *
   * @example
   * ```typescript
   * throw StorageError.serialization("Failed to parse session data", jsonError);
   * ```
   */
  static serialization(message: string, cause?: Error): StorageError {
    return new StorageError(message, StorageErrorType.SERIALIZATION, { cause });
  }

  /**
   * Creates an error for invalid file paths.
   *
   * @param path - The invalid path
   * @returns StorageError with type INVALID_PATH
   *
   * @example
   * ```typescript
   * throw StorageError.invalidPath("../../../etc/passwd");
   * ```
   */
  static invalidPath(path: string): StorageError {
    return new StorageError(`Invalid storage path: ${path}`, StorageErrorType.INVALID_PATH, {
      path,
    });
  }
}

// =============================================================================
// Storage Configuration Schema
// =============================================================================

/**
 * Storage configuration schema for session persistence
 *
 * Defines the settings for where and how session data is stored:
 * - basePath: Root directory for session storage
 * - maxSessions: Maximum number of sessions to retain (oldest pruned first)
 * - compressionEnabled: Whether to compress session data
 * - indexFileName: Name of the index file for session lookups
 */
export const StorageConfigSchema = z.object({
  /** Base directory path for session storage */
  basePath: z.string(),
  /** Maximum number of sessions to retain (default: 100) */
  maxSessions: z.number().int().positive().default(100),
  /** Whether to enable compression for stored sessions (default: true) */
  compressionEnabled: z.boolean().default(true),
  /** Name of the index file for session metadata (default: "index.json") */
  indexFileName: z.string().default("index.json"),
});

export type StorageConfig = z.infer<typeof StorageConfigSchema>;

// =============================================================================
// Default Storage Path Resolution
// =============================================================================

/**
 * Gets the OS-specific base path for session storage.
 *
 * Platform-specific paths:
 * - Windows: `%APPDATA%/vellum/sessions`
 * - macOS: `~/Library/Application Support/vellum/sessions`
 * - Linux: `~/.local/share/vellum/sessions`
 *
 * @returns The resolved absolute path for session storage
 */
function getDefaultBasePath(): string {
  const platform = process.platform;

  switch (platform) {
    case "win32": {
      // Windows: Use APPDATA environment variable
      const appData = process.env.APPDATA;
      if (appData) {
        return path.join(appData, "vellum", "sessions");
      }
      // Fallback to user home if APPDATA is not set
      return path.join(os.homedir(), "AppData", "Roaming", "vellum", "sessions");
    }

    case "darwin": {
      // macOS: Use Library/Application Support
      return path.join(os.homedir(), "Library", "Application Support", "vellum", "sessions");
    }

    default: {
      // Linux and other Unix-like systems: Use XDG_DATA_HOME or fallback
      const xdgDataHome = process.env.XDG_DATA_HOME;
      if (xdgDataHome) {
        return path.join(xdgDataHome, "vellum", "sessions");
      }
      return path.join(os.homedir(), ".local", "share", "vellum", "sessions");
    }
  }
}

// =============================================================================
// Default Configuration Factory
// =============================================================================

/**
 * Creates a default storage configuration with OS-specific paths.
 *
 * Returns a StorageConfig with:
 * - basePath: OS-specific default path (see getDefaultBasePath)
 * - maxSessions: 100
 * - compressionEnabled: true
 * - indexFileName: "index.json"
 *
 * @returns Default StorageConfig for the current platform
 *
 * @example
 * ```typescript
 * const config = getDefaultStorageConfig();
 * // On Windows: { basePath: "C:\\Users\\...\\AppData\\Roaming\\vellum\\sessions", ... }
 * // On macOS: { basePath: "/Users/.../Library/Application Support/vellum/sessions", ... }
 * // On Linux: { basePath: "/home/.../.local/share/vellum/sessions", ... }
 * ```
 */
export function getDefaultStorageConfig(): StorageConfig {
  return {
    basePath: getDefaultBasePath(),
    maxSessions: 100,
    compressionEnabled: true,
    indexFileName: "index.json",
  };
}

/**
 * Creates a storage configuration with custom overrides.
 *
 * Merges the provided partial config with default values.
 *
 * @param partial - Partial configuration to override defaults
 * @returns Complete StorageConfig with defaults applied
 *
 * @example
 * ```typescript
 * const config = createStorageConfig({ maxSessions: 50 });
 * // Uses default basePath but with custom maxSessions
 * ```
 */
export function createStorageConfig(partial: Partial<StorageConfig> = {}): StorageConfig {
  const defaults = getDefaultStorageConfig();
  return {
    ...defaults,
    ...partial,
  };
}

// =============================================================================
// Storage Manager Class
// =============================================================================

/**
 * Manages session storage on disk with index-based lookups.
 *
 * StorageManager handles:
 * - Directory initialization (sessions + recovery directories)
 * - In-memory index management backed by index.json
 * - CRUD operations on session metadata index
 *
 * Uses private constructor - instantiate via `StorageManager.create()`.
 *
 * @example
 * ```typescript
 * const manager = await StorageManager.create({ maxSessions: 50 });
 * const index = await manager.getIndex();
 * await manager.updateIndex(sessionMetadata);
 * ```
 */
export class StorageManager {
  /** Storage configuration */
  private readonly config: StorageConfig;

  /** In-memory session metadata index */
  private index: Map<string, SessionMetadata>;

  /**
   * Private constructor - use StorageManager.create() factory method.
   *
   * @param config - Storage configuration
   * @param index - Initial index state
   */
  private constructor(config: StorageConfig, index: Map<string, SessionMetadata>) {
    this.config = config;
    this.index = index;
  }

  /**
   * Creates a new StorageManager instance.
   *
   * Factory method that:
   * 1. Merges provided config with defaults
   * 2. Ensures storage directories exist
   * 3. Loads existing index from disk
   *
   * @param config - Optional partial configuration to override defaults
   * @returns Initialized StorageManager instance
   *
   * @example
   * ```typescript
   * // Use default config
   * const manager = await StorageManager.create();
   *
   * // Use custom config
   * const manager = await StorageManager.create({
   *   basePath: '/custom/path',
   *   maxSessions: 50
   * });
   * ```
   */
  static async create(config?: Partial<StorageConfig>): Promise<StorageManager> {
    const resolvedConfig = createStorageConfig(config);

    // Ensure storage directories exist
    await StorageManager.ensureDirectories(resolvedConfig.basePath);

    // Load existing index or create empty one
    const index = await StorageManager.loadIndexFromDisk(resolvedConfig);

    return new StorageManager(resolvedConfig, index);
  }

  /**
   * Ensures required storage directories exist.
   *
   * Creates:
   * - Base sessions directory
   * - .recovery subdirectory for crash recovery data
   * - archived subdirectory for archived sessions
   *
   * @param basePath - Base path for session storage
   */
  private static async ensureDirectories(basePath: string): Promise<void> {
    // Create sessions directory
    await fs.mkdir(basePath, { recursive: true });

    // Create .recovery subdirectory for crash recovery
    const recoveryPath = path.join(basePath, ".recovery");
    await fs.mkdir(recoveryPath, { recursive: true });

    // Create archived subdirectory for archived sessions
    const archivedPath = path.join(basePath, "archived");
    await fs.mkdir(archivedPath, { recursive: true });
  }

  /**
   * Loads index from disk.
   *
   * Reads index.json and deserializes to Map.
   * Returns empty Map if file doesn't exist.
   *
   * @param config - Storage configuration
   * @returns Map of session IDs to metadata
   */
  private static async loadIndexFromDisk(
    config: StorageConfig
  ): Promise<Map<string, SessionMetadata>> {
    const indexPath = path.join(config.basePath, config.indexFileName);

    try {
      const content = await fs.readFile(indexPath, "utf-8");
      const parsed = JSON.parse(content);

      // Deserialize Object to Map
      return new Map(Object.entries(parsed));
    } catch (error) {
      // Return empty Map if file doesn't exist or is invalid
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new Map();
      }
      // Log but don't throw for parse errors - start fresh
      console.warn(`Failed to parse index file at ${indexPath}, starting fresh:`, error);
      return new Map();
    }
  }

  /**
   * Saves current index to disk.
   *
   * Serializes Map as Object for JSON storage.
   * Uses atomic write pattern (write to temp, then rename).
   */
  private async saveIndex(): Promise<void> {
    const indexPath = path.join(this.config.basePath, this.config.indexFileName);

    // Serialize Map as Object for JSON
    const serialized = JSON.stringify(Object.fromEntries(this.index), null, 2);

    // Write atomically: write to temp file, then rename
    const tempPath = `${indexPath}.tmp`;
    await fs.writeFile(tempPath, serialized, "utf-8");
    await fs.rename(tempPath, indexPath);
  }

  /**
   * Gets the current session index.
   *
   * Returns a copy of the in-memory index Map.
   *
   * @returns Map of session IDs to metadata
   *
   * @example
   * ```typescript
   * const index = await manager.getIndex();
   * for (const [id, metadata] of index) {
   *   console.log(`Session ${id}: ${metadata.title}`);
   * }
   * ```
   */
  async getIndex(): Promise<Map<string, SessionMetadata>> {
    // Return a copy to prevent external mutation
    return new Map(this.index);
  }

  /**
   * Updates or adds a session entry in the index.
   *
   * Persists the change to disk immediately.
   *
   * @param metadata - Session metadata to add/update
   *
   * @example
   * ```typescript
   * await manager.updateIndex({
   *   id: '123e4567-e89b-12d3-a456-426614174000',
   *   title: 'My Session',
   *   // ... other metadata fields
   * });
   * ```
   */
  async updateIndex(metadata: SessionMetadata): Promise<void> {
    this.index.set(metadata.id, metadata);
    await this.saveIndex();
  }

  /**
   * Removes a session entry from the index.
   *
   * Persists the change to disk immediately.
   * No-op if session ID doesn't exist.
   *
   * @param sessionId - ID of session to remove
   *
   * @example
   * ```typescript
   * await manager.removeFromIndex('123e4567-e89b-12d3-a456-426614174000');
   * ```
   */
  async removeFromIndex(sessionId: string): Promise<void> {
    if (this.index.delete(sessionId)) {
      await this.saveIndex();
    }
  }

  /**
   * Gets the storage configuration.
   *
   * @returns Current storage configuration
   */
  getConfig(): StorageConfig {
    return this.config;
  }

  // ===========================================================================
  // Session CRUD Operations
  // ===========================================================================

  /**
   * Saves a session to disk.
   *
   * Serializes the session to JSON, optionally compresses with gzip,
   * and writes atomically (temp file then rename).
   *
   * @param session - The session to save
   * @throws StorageError on I/O or serialization failure
   *
   * @example
   * ```typescript
   * const session = createSession({ title: "My Session" });
   * await manager.save(session);
   * ```
   */
  async save(session: Session): Promise<void> {
    const sessionId = session.metadata.id;
    const extension = this.config.compressionEnabled ? ".json.gz" : ".json";
    const filePath = path.join(this.config.basePath, `${sessionId}${extension}`);
    const tempPath = `${filePath}.tmp`;

    try {
      // Serialize session to JSON
      let content: string;
      try {
        content = JSON.stringify(session, null, 2);
      } catch (err) {
        throw StorageError.serialization(
          `Failed to serialize session: ${sessionId}`,
          err instanceof Error ? err : undefined
        );
      }

      // Compress if enabled
      let data: Buffer | string = content;
      if (this.config.compressionEnabled) {
        try {
          data = await gzip(Buffer.from(content, "utf-8"));
        } catch (err) {
          throw StorageError.io(
            `Failed to compress session: ${sessionId}`,
            err instanceof Error ? err : undefined,
            filePath
          );
        }
      }

      // Atomic write: write to temp file, then rename
      try {
        await fs.writeFile(tempPath, data);
        await fs.rename(tempPath, filePath);
      } catch (err) {
        // Clean up temp file on failure
        try {
          await fs.unlink(tempPath);
        } catch {
          // Ignore cleanup errors
        }
        throw StorageError.io(
          `Failed to write session file: ${sessionId}`,
          err instanceof Error ? err : undefined,
          filePath
        );
      }

      // Update index with session metadata
      await this.updateIndex(session.metadata);

      // Enforce retention policy after saving
      await this.enforceRetentionPolicy();
    } catch (err) {
      if (err instanceof StorageError) {
        throw err;
      }
      throw StorageError.io(
        `Failed to save session: ${sessionId}`,
        err instanceof Error ? err : undefined,
        filePath
      );
    }
  }

  /**
   * Loads a session from disk.
   *
   * Tries loading compressed (.json.gz) first, then uncompressed (.json).
   * Validates loaded data against Session schema.
   *
   * @param sessionId - The ID of the session to load
   * @returns The loaded session
   * @throws StorageError.sessionNotFound if session doesn't exist
   * @throws StorageError on I/O or serialization failure
   *
   * @example
   * ```typescript
   * const session = await manager.load("123e4567-e89b-12d3-a456-426614174000");
   * console.log(session.metadata.title);
   * ```
   */
  async load(sessionId: string): Promise<Session> {
    // Read file content (tries .gz first, then .json)
    const { content, isCompressed, filePath } = await this.readSessionFile(sessionId);

    // Decompress if needed
    const jsonContent = await this.decompressIfNeeded(content, isCompressed, sessionId, filePath);

    // Parse and validate
    return this.parseAndValidateSession(jsonContent, sessionId);
  }

  /**
   * Reads session file from disk, trying compressed first then uncompressed.
   */
  private async readSessionFile(
    sessionId: string
  ): Promise<{ content: Buffer; isCompressed: boolean; filePath: string }> {
    const gzPath = path.join(this.config.basePath, `${sessionId}.json.gz`);
    const jsonPath = path.join(this.config.basePath, `${sessionId}.json`);

    // Try compressed file first
    try {
      const content = await fs.readFile(gzPath);
      return { content, isCompressed: true, filePath: gzPath };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw StorageError.io(
          `Failed to read session file: ${sessionId}`,
          err instanceof Error ? err : undefined,
          gzPath
        );
      }
    }

    // Try uncompressed file
    try {
      const content = await fs.readFile(jsonPath);
      return { content, isCompressed: false, filePath: jsonPath };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw StorageError.sessionNotFound(sessionId);
      }
      throw StorageError.io(
        `Failed to read session file: ${sessionId}`,
        err instanceof Error ? err : undefined,
        jsonPath
      );
    }
  }

  /**
   * Decompresses content if it was gzipped.
   */
  private async decompressIfNeeded(
    content: Buffer,
    isCompressed: boolean,
    sessionId: string,
    filePath: string
  ): Promise<string> {
    if (!isCompressed) {
      return content.toString("utf-8");
    }

    try {
      const decompressed = await gunzip(content);
      return decompressed.toString("utf-8");
    } catch (err) {
      throw StorageError.io(
        `Failed to decompress session: ${sessionId}`,
        err instanceof Error ? err : undefined,
        filePath
      );
    }
  }

  /**
   * Parses JSON and validates against Session schema.
   */
  private parseAndValidateSession(jsonContent: string, sessionId: string): Session {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (err) {
      throw StorageError.serialization(
        `Failed to parse session JSON: ${sessionId}`,
        err instanceof Error ? err : undefined
      );
    }

    const result = SessionSchema.safeParse(parsed);
    if (!result.success) {
      throw StorageError.serialization(
        `Invalid session data: ${sessionId}`,
        new Error(result.error.message)
      );
    }

    return result.data;
  }

  /**
   * Deletes a session from disk.
   *
   * Removes the session file (.json.gz or .json) and updates the index.
   *
   * @param sessionId - The ID of the session to delete
   * @returns true if session was deleted, false if not found
   *
   * @example
   * ```typescript
   * const deleted = await manager.delete("123e4567-e89b-12d3-a456-426614174000");
   * if (deleted) {
   *   console.log("Session deleted");
   * }
   * ```
   */
  async delete(sessionId: string): Promise<boolean> {
    const gzPath = path.join(this.config.basePath, `${sessionId}.json.gz`);
    const jsonPath = path.join(this.config.basePath, `${sessionId}.json`);

    let deleted = false;

    // Try to delete compressed file
    try {
      await fs.unlink(gzPath);
      deleted = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw StorageError.io(
          `Failed to delete session file: ${sessionId}`,
          err instanceof Error ? err : undefined,
          gzPath
        );
      }
    }

    // Try to delete uncompressed file (might exist if compression was toggled)
    try {
      await fs.unlink(jsonPath);
      deleted = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw StorageError.io(
          `Failed to delete session file: ${sessionId}`,
          err instanceof Error ? err : undefined,
          jsonPath
        );
      }
    }

    // Remove from index if anything was deleted or if entry exists
    if (deleted || this.index.has(sessionId)) {
      await this.removeFromIndex(sessionId);
      return true;
    }

    return false;
  }

  /**
   * Checks if a session exists on disk.
   *
   * Checks for both compressed (.json.gz) and uncompressed (.json) files.
   *
   * @param sessionId - The ID of the session to check
   * @returns true if session file exists, false otherwise
   *
   * @example
   * ```typescript
   * if (await manager.exists("session-123")) {
   *   const session = await manager.load("session-123");
   * }
   * ```
   */
  async exists(sessionId: string): Promise<boolean> {
    const gzPath = path.join(this.config.basePath, `${sessionId}.json.gz`);
    const jsonPath = path.join(this.config.basePath, `${sessionId}.json`);

    // Check compressed file first
    try {
      await fs.access(gzPath);
      return true;
    } catch {
      // Not found, try uncompressed
    }

    // Check uncompressed file
    try {
      await fs.access(jsonPath);
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Retention Policy & Archiving
  // ===========================================================================

  /**
   * Enforces the retention policy by archiving excess sessions.
   *
   * Gets all sessions from the index, sorts by lastActive date (oldest first),
   * and archives sessions that exceed maxSessions.
   *
   * @returns Number of sessions archived
   *
   * @example
   * ```typescript
   * const archivedCount = await manager.enforceRetentionPolicy();
   * if (archivedCount > 0) {
   *   console.log(`Archived ${archivedCount} old sessions`);
   * }
   * ```
   */
  async enforceRetentionPolicy(): Promise<number> {
    const sessions = Array.from(this.index.values());

    // If within limit, nothing to do
    if (sessions.length <= this.config.maxSessions) {
      return 0;
    }

    // Sort by lastActive date (oldest first)
    sessions.sort((a, b) => {
      const dateA = a.lastActive instanceof Date ? a.lastActive : new Date(a.lastActive);
      const dateB = b.lastActive instanceof Date ? b.lastActive : new Date(b.lastActive);
      return dateA.getTime() - dateB.getTime();
    });

    // Calculate how many to archive
    const excessCount = sessions.length - this.config.maxSessions;
    const sessionsToArchive = sessions.slice(0, excessCount);

    // Archive each excess session
    let archivedCount = 0;
    for (const session of sessionsToArchive) {
      try {
        await this.archiveSession(session.id);
        archivedCount++;
      } catch (err) {
        // Log but continue archiving other sessions
        console.warn(`Failed to archive session ${session.id}:`, err);
      }
    }

    // Log notification in Chinese as requested
    if (archivedCount > 0) {
      console.log(`已自动归档 ${archivedCount} 个旧会话`);
    }

    return archivedCount;
  }

  /**
   * Resolves the source and destination paths for archiving a session.
   *
   * @param gzPath - Path to compressed session file
   * @param jsonPath - Path to uncompressed session file
   * @param archivedGzPath - Destination path for compressed file
   * @param archivedJsonPath - Destination path for uncompressed file
   * @param sessionId - Session ID for error reporting
   * @returns Object with sourcePath and destPath
   * @throws StorageError.sessionNotFound if neither file exists
   */
  private async resolveArchivePaths(
    gzPath: string,
    jsonPath: string,
    archivedGzPath: string,
    archivedJsonPath: string,
    sessionId: string
  ): Promise<{ sourcePath: string; destPath: string }> {
    // Check which file exists
    try {
      await fs.access(gzPath);
      return { sourcePath: gzPath, destPath: archivedGzPath };
    } catch {
      try {
        await fs.access(jsonPath);
        return { sourcePath: jsonPath, destPath: archivedJsonPath };
      } catch {
        // Neither file exists
        throw StorageError.sessionNotFound(sessionId);
      }
    }
  }

  /**
   * Archives a session by moving it to the archived directory.
   *
   * - Moves session file to archived/ subdirectory
   * - Updates metadata status to 'archived'
   * - Removes from active index
   * - Adds to archived index (archived-index.json)
   *
   * @param sessionId - The ID of the session to archive
   * @throws StorageError.sessionNotFound if session doesn't exist
   * @throws StorageError.io on file system errors
   *
   * @example
   * ```typescript
   * await manager.archiveSession("123e4567-e89b-12d3-a456-426614174000");
   * ```
   */
  async archiveSession(sessionId: string): Promise<void> {
    const archivedDir = path.join(this.config.basePath, "archived");

    // Ensure archived directory exists
    await fs.mkdir(archivedDir, { recursive: true });

    // Find the session file (try .gz first, then .json)
    const gzPath = path.join(this.config.basePath, `${sessionId}.json.gz`);
    const jsonPath = path.join(this.config.basePath, `${sessionId}.json`);
    const archivedGzPath = path.join(archivedDir, `${sessionId}.json.gz`);
    const archivedJsonPath = path.join(archivedDir, `${sessionId}.json`);

    // Determine source and destination paths
    const { sourcePath, destPath } = await this.resolveArchivePaths(
      gzPath,
      jsonPath,
      archivedGzPath,
      archivedJsonPath,
      sessionId
    );

    // Load session to update metadata
    const session = await this.load(sessionId);

    // Update metadata status to archived
    session.metadata.status = "archived";
    session.metadata.updatedAt = new Date();

    // Serialize and write to archived location
    try {
      let content: string;
      try {
        content = JSON.stringify(session, null, 2);
      } catch (err) {
        throw StorageError.serialization(
          `Failed to serialize session for archiving: ${sessionId}`,
          err instanceof Error ? err : undefined
        );
      }

      // Compress if original was compressed
      let data: Buffer | string = content;
      if (sourcePath.endsWith(".json.gz")) {
        try {
          data = await gzip(Buffer.from(content, "utf-8"));
        } catch (err) {
          throw StorageError.io(
            `Failed to compress session for archiving: ${sessionId}`,
            err instanceof Error ? err : undefined,
            destPath
          );
        }
      }

      // Write to archived location
      const tempPath = `${destPath}.tmp`;
      await fs.writeFile(tempPath, data);
      await fs.rename(tempPath, destPath);

      // Delete original file
      await fs.unlink(sourcePath);
    } catch (err) {
      if (err instanceof StorageError) {
        throw err;
      }
      throw StorageError.io(
        `Failed to archive session: ${sessionId}`,
        err instanceof Error ? err : undefined,
        destPath
      );
    }

    // Remove from active index
    await this.removeFromIndex(sessionId);

    // Add to archived index
    await this.updateArchivedIndex(session.metadata);
  }

  /**
   * Updates the archived sessions index.
   *
   * @param metadata - Session metadata to add to archived index
   */
  private async updateArchivedIndex(metadata: SessionMetadata): Promise<void> {
    const archivedIndexPath = path.join(this.config.basePath, "archived", "archived-index.json");

    // Load existing archived index
    let archivedIndex: Record<string, SessionMetadata> = {};
    try {
      const content = await fs.readFile(archivedIndexPath, "utf-8");
      archivedIndex = JSON.parse(content);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Failed to parse archived index, starting fresh:`, err);
      }
    }

    // Add/update entry
    archivedIndex[metadata.id] = metadata;

    // Write back atomically
    const tempPath = `${archivedIndexPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(archivedIndex, null, 2), "utf-8");
    await fs.rename(tempPath, archivedIndexPath);
  }

  /**
   * Gets all archived sessions.
   *
   * Lists sessions from the archived-index.json file.
   *
   * @returns Array of archived session metadata
   *
   * @example
   * ```typescript
   * const archived = await manager.getArchivedSessions();
   * for (const session of archived) {
   *   console.log(`Archived: ${session.title} (${session.id})`);
   * }
   * ```
   */
  async getArchivedSessions(): Promise<SessionMetadata[]> {
    const archivedIndexPath = path.join(this.config.basePath, "archived", "archived-index.json");

    try {
      const content = await fs.readFile(archivedIndexPath, "utf-8");
      const parsed = JSON.parse(content);
      return Object.values(parsed) as SessionMetadata[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      console.warn(`Failed to read archived index:`, err);
      return [];
    }
  }

  /**
   * Loads an archived session from disk.
   *
   * @param sessionId - The ID of the archived session to load
   * @returns The loaded session
   * @throws StorageError.sessionNotFound if session doesn't exist in archive
   *
   * @example
   * ```typescript
   * const session = await manager.loadArchivedSession("123e4567-e89b-12d3-a456-426614174000");
   * ```
   */
  async loadArchivedSession(sessionId: string): Promise<Session> {
    const archivedDir = path.join(this.config.basePath, "archived");
    const gzPath = path.join(archivedDir, `${sessionId}.json.gz`);
    const jsonPath = path.join(archivedDir, `${sessionId}.json`);

    // Try compressed file first
    try {
      const content = await fs.readFile(gzPath);
      const jsonContent = await this.decompressIfNeeded(content, true, sessionId, gzPath);
      return this.parseAndValidateSession(jsonContent, sessionId);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT" && !(err instanceof StorageError)) {
        throw StorageError.io(
          `Failed to read archived session file: ${sessionId}`,
          err instanceof Error ? err : undefined,
          gzPath
        );
      }
    }

    // Try uncompressed file
    try {
      const content = await fs.readFile(jsonPath);
      return this.parseAndValidateSession(content.toString("utf-8"), sessionId);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw StorageError.sessionNotFound(sessionId);
      }
      throw StorageError.io(
        `Failed to read archived session file: ${sessionId}`,
        err instanceof Error ? err : undefined,
        jsonPath
      );
    }
  }
}
