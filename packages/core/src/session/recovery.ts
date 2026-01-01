// ============================================
// Session Recovery Manager
// ============================================

/**
 * Recovery management for session crash recovery.
 *
 * Provides lightweight recovery logging to detect and recover
 * from crashed sessions. Recovery logs contain metadata only
 * (no full session data) for fast crash detection.
 *
 * @module @vellum/core/session/recovery
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import type { StorageManager } from "./storage.js";
import type { Session } from "./types.js";

// =============================================================================
// Recovery Log Types
// =============================================================================

/**
 * Status of a recovery log entry.
 *
 * - active: Session is currently running
 * - crashed: Session terminated unexpectedly (recovery log exists without clean shutdown)
 * - recovered: Session was recovered from a crash
 */
export type RecoveryLogStatus = "active" | "crashed" | "recovered";

/**
 * Schema for recovery log entries.
 *
 * Recovery logs are lightweight metadata files that track session state
 * for crash detection and recovery. They do NOT contain full session data.
 */
export const RecoveryLogSchema = z.object({
  /** Session identifier */
  sessionId: z.string().uuid(),
  /** Timestamp when the log was written */
  timestamp: z.coerce.date(),
  /** Number of messages in the session at log time */
  messageCount: z.number().int().nonnegative(),
  /** ID of the last message (if any) */
  lastMessageId: z.string().optional(),
  /** Current status of the session */
  status: z.enum(["active", "crashed", "recovered"]),
});

/**
 * Recovery log entry for crash detection.
 *
 * Contains minimal metadata about a session's state for
 * detecting crashes and enabling recovery.
 */
export type RecoveryLog = z.infer<typeof RecoveryLogSchema>;

// =============================================================================
// Recovery Error Types
// =============================================================================

/**
 * Types of recovery-related errors.
 */
export enum RecoveryErrorType {
  /** File system I/O errors */
  IO = "io",
  /** JSON parse errors or schema validation failures */
  PARSE = "parse",
  /** Recovery log not found */
  NOT_FOUND = "not_found",
}

/**
 * Options for creating a RecoveryError.
 */
export interface RecoveryErrorOptions {
  /** The original error that caused this error */
  cause?: Error;
  /** The session ID involved in the error */
  sessionId?: string;
  /** The file path involved in the error */
  path?: string;
}

/**
 * Error class for recovery-related failures.
 *
 * Provides typed errors with context for debugging and error handling.
 */
export class RecoveryError extends Error {
  /** The type/category of this recovery error */
  public readonly type: RecoveryErrorType;
  /** The original error that caused this error */
  public readonly cause?: Error;
  /** The session ID involved in the error */
  public readonly sessionId?: string;
  /** The file path involved in the error */
  public readonly path?: string;

  constructor(message: string, type: RecoveryErrorType, options?: RecoveryErrorOptions) {
    super(message);
    this.name = "RecoveryError";
    this.type = type;
    this.cause = options?.cause;
    this.sessionId = options?.sessionId;
    this.path = options?.path;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RecoveryError);
    }
  }

  /**
   * Creates an I/O error for file system operations.
   */
  static io(message: string, cause?: Error, path?: string): RecoveryError {
    return new RecoveryError(message, RecoveryErrorType.IO, { cause, path });
  }

  /**
   * Creates an error for JSON parsing or validation failures.
   */
  static parse(message: string, cause?: Error, sessionId?: string): RecoveryError {
    return new RecoveryError(message, RecoveryErrorType.PARSE, { cause, sessionId });
  }

  /**
   * Creates an error for missing recovery logs.
   */
  static notFound(sessionId: string): RecoveryError {
    return new RecoveryError(
      `Recovery log not found for session: ${sessionId}`,
      RecoveryErrorType.NOT_FOUND,
      { sessionId }
    );
  }
}

// =============================================================================
// Recovery Manager Class
// =============================================================================

/** File extension for recovery log files */
const RECOVERY_FILE_EXTENSION = ".recovery.json";

/**
 * Manages recovery logs for crash detection and session recovery.
 *
 * RecoveryManager handles:
 * - Writing recovery logs when sessions are active
 * - Reading recovery logs for crash detection
 * - Clearing recovery logs on clean shutdown
 * - Listing all recovery logs for startup recovery
 *
 * Recovery logs are stored as `{sessionId}.recovery.json` files
 * in the `.recovery/` subdirectory under the storage base path.
 *
 * @example
 * ```typescript
 * const recovery = new RecoveryManager('/path/to/sessions');
 *
 * // Write recovery log when session is active
 * await recovery.writeRecoveryLog(session);
 *
 * // Clear on clean shutdown
 * await recovery.clearRecoveryLog(sessionId);
 *
 * // Check for crashed sessions on startup
 * const logs = await recovery.listRecoveryLogs();
 * for (const log of logs) {
 *   if (log.status === 'active') {
 *     // Session crashed - offer recovery
 *   }
 * }
 * ```
 */
export class RecoveryManager {
  /** Path to the .recovery directory */
  private readonly recoveryPath: string;

  /**
   * Creates a new RecoveryManager.
   *
   * @param basePath - Base path for session storage (recovery logs will be in `.recovery/` subdirectory)
   */
  constructor(basePath: string) {
    this.recoveryPath = path.join(basePath, ".recovery");
  }

  /**
   * Gets the file path for a session's recovery log.
   *
   * @param sessionId - Session identifier
   * @returns Full path to the recovery log file
   */
  private getLogPath(sessionId: string): string {
    return path.join(this.recoveryPath, `${sessionId}${RECOVERY_FILE_EXTENSION}`);
  }

  /**
   * Ensures the recovery directory exists.
   *
   * Called automatically by write operations.
   */
  private async ensureDirectory(): Promise<void> {
    await fs.mkdir(this.recoveryPath, { recursive: true });
  }

  /**
   * Writes a recovery log for a session.
   *
   * Creates or updates the recovery log file with current session metadata.
   * The log is marked as 'active' to indicate the session is running.
   *
   * @param session - Session to write recovery log for
   *
   * @example
   * ```typescript
   * // Call periodically or after each message
   * await recovery.writeRecoveryLog(session);
   * ```
   */
  async writeRecoveryLog(session: Session): Promise<void> {
    await this.ensureDirectory();

    const lastMessage = session.messages.at(-1);
    const log: RecoveryLog = {
      sessionId: session.metadata.id,
      timestamp: new Date(),
      messageCount: session.messages.length,
      lastMessageId: lastMessage?.id,
      status: "active",
    };

    const logPath = this.getLogPath(session.metadata.id);
    const content = JSON.stringify(log, null, 2);

    try {
      await fs.writeFile(logPath, content, "utf-8");
    } catch (error) {
      throw RecoveryError.io(
        `Failed to write recovery log for session: ${session.metadata.id}`,
        error instanceof Error ? error : undefined,
        logPath
      );
    }
  }

  /**
   * Clears (deletes) a recovery log for a session.
   *
   * Should be called on clean session shutdown to indicate
   * the session ended normally.
   *
   * @param sessionId - Session identifier
   *
   * @example
   * ```typescript
   * // Call when session ends normally
   * await recovery.clearRecoveryLog(sessionId);
   * ```
   */
  async clearRecoveryLog(sessionId: string): Promise<void> {
    const logPath = this.getLogPath(sessionId);

    try {
      await fs.unlink(logPath);
    } catch (error) {
      // Ignore ENOENT (file doesn't exist) - already cleared
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw RecoveryError.io(
        `Failed to clear recovery log for session: ${sessionId}`,
        error instanceof Error ? error : undefined,
        logPath
      );
    }
  }

  /**
   * Reads a recovery log for a session.
   *
   * Returns the recovery log if it exists, null otherwise.
   * Handles corrupted files gracefully by returning null.
   *
   * @param sessionId - Session identifier
   * @returns Recovery log if exists and valid, null otherwise
   *
   * @example
   * ```typescript
   * const log = await recovery.getRecoveryLog(sessionId);
   * if (log && log.status === 'active') {
   *   // Session crashed - the log indicates it was running
   * }
   * ```
   */
  async getRecoveryLog(sessionId: string): Promise<RecoveryLog | null> {
    const logPath = this.getLogPath(sessionId);

    try {
      const content = await fs.readFile(logPath, "utf-8");
      const data = JSON.parse(content);
      const result = RecoveryLogSchema.safeParse(data);

      if (!result.success) {
        // Corrupted file - return null instead of throwing
        return null;
      }

      return result.data;
    } catch (error) {
      // File doesn't exist or can't be read - return null
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return null;
      }

      // JSON parse error - return null (corrupted file)
      if (error instanceof SyntaxError) {
        return null;
      }

      // Unexpected error - still return null for graceful handling
      return null;
    }
  }

  /**
   * Lists all recovery logs in the recovery directory.
   *
   * Returns all valid recovery logs. Invalid or corrupted files
   * are skipped silently.
   *
   * @returns Array of recovery logs
   *
   * @example
   * ```typescript
   * // Check for crashed sessions on startup
   * const logs = await recovery.listRecoveryLogs();
   * const crashed = logs.filter(log => log.status === 'active');
   * if (crashed.length > 0) {
   *   console.log('Found crashed sessions:', crashed.map(l => l.sessionId));
   * }
   * ```
   */
  async listRecoveryLogs(): Promise<RecoveryLog[]> {
    try {
      await this.ensureDirectory();
      const files = await fs.readdir(this.recoveryPath);
      const recoveryFiles = files.filter((f) => f.endsWith(RECOVERY_FILE_EXTENSION));

      const logs: RecoveryLog[] = [];

      for (const file of recoveryFiles) {
        const sessionId = file.replace(RECOVERY_FILE_EXTENSION, "");
        const log = await this.getRecoveryLog(sessionId);
        if (log) {
          logs.push(log);
        }
      }

      return logs;
    } catch (error) {
      // Directory doesn't exist or can't be read - return empty array
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return [];
      }

      throw RecoveryError.io(
        "Failed to list recovery logs",
        error instanceof Error ? error : undefined,
        this.recoveryPath
      );
    }
  }

  /**
   * Updates a recovery log's status.
   *
   * Used to mark a session as 'recovered' after crash recovery.
   *
   * @param sessionId - Session identifier
   * @param status - New status for the recovery log
   *
   * @example
   * ```typescript
   * // After recovering a crashed session
   * await recovery.updateRecoveryLogStatus(sessionId, 'recovered');
   * ```
   */
  async updateRecoveryLogStatus(sessionId: string, status: RecoveryLogStatus): Promise<void> {
    const log = await this.getRecoveryLog(sessionId);

    if (!log) {
      throw RecoveryError.notFound(sessionId);
    }

    const updatedLog: RecoveryLog = {
      ...log,
      status,
      timestamp: new Date(),
    };

    const logPath = this.getLogPath(sessionId);
    const content = JSON.stringify(updatedLog, null, 2);

    try {
      await fs.writeFile(logPath, content, "utf-8");
    } catch (error) {
      throw RecoveryError.io(
        `Failed to update recovery log status for session: ${sessionId}`,
        error instanceof Error ? error : undefined,
        logPath
      );
    }
  }

  // ===========================================================================
  // Crash Recovery Methods (T014)
  // ===========================================================================

  /**
   * Scans recovery logs and identifies sessions that need recovery.
   *
   * For each recovery log:
   * - Checks if corresponding session exists in storage
   * - If session exists and log shows 'active' status, marks as crashed
   * - Returns list of sessions that need recovery
   *
   * @param storageManager - StorageManager to check session existence
   * @returns Array of crashed session info sorted by timestamp (most recent first)
   *
   * @example
   * ```typescript
   * const crashed = await recovery.checkAndRecover(storageManager);
   * for (const info of crashed) {
   *   console.log(`Session ${info.sessionId} needs recovery`);
   * }
   * ```
   */
  async checkAndRecover(storageManager: StorageManager): Promise<CrashedSessionInfo[]> {
    const crashedSessions: CrashedSessionInfo[] = [];

    // Get all recovery logs
    const logs = await this.listRecoveryLogs();

    for (const log of logs) {
      // Only process 'active' logs - these indicate a crashed session
      if (log.status !== "active") {
        continue;
      }

      // Check if the session data still exists
      const sessionExists = await storageManager.exists(log.sessionId);

      if (sessionExists) {
        // Session exists and was marked active - it crashed
        crashedSessions.push({
          sessionId: log.sessionId,
          log,
          sessionExists: true,
        });

        // Update the log to mark it as crashed
        try {
          await this.updateRecoveryLogStatus(log.sessionId, "crashed");
        } catch {
          // Log error but continue processing other sessions
          console.warn(`Failed to update recovery status for session ${log.sessionId}`);
        }
      }
    }

    // Sort by timestamp, most recent first
    crashedSessions.sort((a, b) => b.log.timestamp.getTime() - a.log.timestamp.getTime());

    return crashedSessions;
  }

  /**
   * Performs startup recovery check.
   *
   * - Calls checkAndRecover to find crashed sessions
   * - Returns most recent session that needs recovery (by timestamp)
   * - Cleans up recovery logs for sessions that no longer exist
   * - Handles corrupted files: logs warning and deletes
   *
   * @param storageManager - StorageManager to check session existence
   * @returns Startup check result with most recent crashed session
   *
   * @example
   * ```typescript
   * const result = await recovery.startupCheck(storageManager);
   * if (result.sessionToRecover) {
   *   console.log(`Offering to recover session ${result.sessionToRecover.sessionId}`);
   * }
   * if (result.corruptedCleaned > 0) {
   *   console.log(`Cleaned up ${result.corruptedCleaned} corrupted recovery logs`);
   * }
   * ```
   */
  async startupCheck(storageManager: StorageManager): Promise<StartupCheckResult> {
    let corruptedCleaned = 0;

    // Scan for corrupted files and clean them up
    try {
      await this.ensureDirectory();
      const files = await fs.readdir(this.recoveryPath);
      const recoveryFiles = files.filter((f) => f.endsWith(RECOVERY_FILE_EXTENSION));

      for (const file of recoveryFiles) {
        const sessionId = file.replace(RECOVERY_FILE_EXTENSION, "");
        const logPath = this.getLogPath(sessionId);

        try {
          const content = await fs.readFile(logPath, "utf-8");
          const data = JSON.parse(content);
          const result = RecoveryLogSchema.safeParse(data);

          if (!result.success) {
            // Corrupted file - log warning and delete
            console.warn(`Corrupted recovery log for session ${sessionId}, deleting`);
            await this.safeDeleteFile(logPath);
            corruptedCleaned++;
            continue;
          }

          // Check if session no longer exists - clean up orphaned logs
          const sessionExists = await storageManager.exists(sessionId);
          if (!sessionExists && result.data.status !== "active") {
            // Session doesn't exist and wasn't active - safe to clean up
            await this.safeDeleteFile(logPath);
          }
        } catch (error) {
          if (error instanceof SyntaxError) {
            // JSON parse error - corrupted file
            console.warn(`Corrupted recovery log for session ${sessionId}, deleting`);
            await this.safeDeleteFile(logPath);
            corruptedCleaned++;
          }
          // Other errors - skip this file
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read - continue with empty state
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        console.warn("Failed to scan recovery directory for corrupted files:", error);
      }
    }

    // Now check for crashed sessions
    const crashedSessions = await this.checkAndRecover(storageManager);

    return {
      sessionToRecover: crashedSessions[0] ?? null,
      totalCrashed: crashedSessions.length,
      corruptedCleaned,
    };
  }

  /**
   * Marks a session as active in recovery logs.
   *
   * Writes a recovery log with 'active' status. Should be called
   * when a session starts to enable crash detection.
   *
   * @param sessionId - Session identifier to mark as active
   * @param messageCount - Current number of messages in the session (default: 0)
   * @param lastMessageId - ID of the last message (if any)
   *
   * @example
   * ```typescript
   * // Call when session starts
   * await recovery.markSessionActive(session.metadata.id);
   *
   * // Or with message info
   * await recovery.markSessionActive(sessionId, 5, 'msg-123');
   * ```
   */
  async markSessionActive(
    sessionId: string,
    messageCount = 0,
    lastMessageId?: string
  ): Promise<void> {
    await this.ensureDirectory();

    const log: RecoveryLog = {
      sessionId,
      timestamp: new Date(),
      messageCount,
      lastMessageId,
      status: "active",
    };

    const logPath = this.getLogPath(sessionId);
    const content = JSON.stringify(log, null, 2);

    try {
      await fs.writeFile(logPath, content, "utf-8");
    } catch (error) {
      throw RecoveryError.io(
        `Failed to mark session as active: ${sessionId}`,
        error instanceof Error ? error : undefined,
        logPath
      );
    }
  }

  /**
   * Marks a session as closed by clearing its recovery log.
   *
   * Removes the recovery log file to indicate the session ended normally.
   * Should be called when a session ends cleanly.
   *
   * @param sessionId - Session identifier to mark as closed
   *
   * @example
   * ```typescript
   * // Call when session ends normally
   * await recovery.markSessionClosed(sessionId);
   * ```
   */
  async markSessionClosed(sessionId: string): Promise<void> {
    // Delegate to existing clearRecoveryLog method
    await this.clearRecoveryLog(sessionId);
  }

  /**
   * Safely deletes a file, ignoring errors.
   *
   * Used for cleanup operations where failure is acceptable.
   *
   * @param filePath - Path to file to delete
   */
  private async safeDeleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore errors during cleanup
    }
  }
}

// =============================================================================
// Exported Types for Crash Recovery (T014)
// =============================================================================

/**
 * Information about a crashed session that needs recovery.
 */
export interface CrashedSessionInfo {
  /** Session ID that needs recovery */
  sessionId: string;
  /** Recovery log for the session */
  log: RecoveryLog;
  /** Whether the session data exists in storage */
  sessionExists: boolean;
}

/**
 * Result of startup recovery check.
 */
export interface StartupCheckResult {
  /** Most recent session that needs recovery (if any) */
  sessionToRecover: CrashedSessionInfo | null;
  /** Total number of sessions that need recovery */
  totalCrashed: number;
  /** Number of corrupted recovery logs that were cleaned up */
  corruptedCleaned: number;
}
