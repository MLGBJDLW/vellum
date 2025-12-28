// ============================================
// State Persister (T023)
// ============================================

/**
 * State persistence for agent sessions.
 *
 * Provides file-based snapshot storage for session recovery
 * after crashes or graceful shutdowns.
 *
 * @module @vellum/core/agent/state-persister
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SessionMessage } from "../session/index.js";
import type { AgentState, StateContext } from "./state.js";

/**
 * Snapshot of a session state for persistence.
 */
export interface SessionSnapshot {
  /** Unique session identifier */
  id: string;
  /** Current agent state */
  state: AgentState;
  /** Session messages */
  messages: SessionMessage[];
  /** Additional context for the session */
  context: SnapshotContext;
  /** Timestamp when snapshot was created */
  timestamp: number;
  /** Schema version for forward compatibility */
  version: number;
}

/**
 * Context saved in a snapshot.
 */
export interface SnapshotContext {
  /** State context */
  stateContext: StateContext;
  /** Working directory */
  cwd: string;
  /** Project root directory */
  projectRoot?: string;
  /** Provider type */
  providerType: string;
  /** Model identifier */
  model: string;
  /** Mode name */
  mode: string;
  /** Token usage */
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/**
 * Current snapshot schema version.
 */
export const SNAPSHOT_VERSION = 1;

/**
 * Default session directory name.
 */
export const DEFAULT_SESSION_DIR = ".vellum/sessions";

/**
 * Interface for state persistence implementations.
 */
export interface StatePersister {
  /**
   * Saves a session snapshot.
   *
   * @param snapshot - The snapshot to save
   */
  save(snapshot: SessionSnapshot): Promise<void>;

  /**
   * Loads a session snapshot by ID.
   *
   * @param sessionId - The session identifier
   * @returns The snapshot or null if not found
   */
  load(sessionId: string): Promise<SessionSnapshot | null>;

  /**
   * Deletes a session snapshot.
   *
   * @param sessionId - The session identifier
   */
  delete(sessionId: string): Promise<void>;

  /**
   * Lists all session IDs.
   *
   * @returns Array of session IDs
   */
  list(): Promise<string[]>;
}

/**
 * Options for FileStatePersister.
 */
export interface FileStatePersisterOptions {
  /** Base directory for session files (default: project root) */
  baseDir?: string;
  /** Session directory name (default: .vellum/sessions) */
  sessionDir?: string;
}

/**
 * File-based state persister.
 *
 * Saves session snapshots as JSON files in the project's
 * .vellum/sessions directory.
 *
 * @example
 * ```typescript
 * const persister = new FileStatePersister({
 *   baseDir: '/path/to/project',
 * });
 *
 * await persister.save({
 *   id: 'session-123',
 *   state: 'idle',
 *   messages: [],
 *   context: { ... },
 *   timestamp: Date.now(),
 *   version: 1,
 * });
 *
 * const snapshot = await persister.load('session-123');
 * ```
 */
export class FileStatePersister implements StatePersister {
  private readonly sessionsPath: string;

  constructor(options?: FileStatePersisterOptions) {
    const baseDir = options?.baseDir ?? process.cwd();
    const sessionDir = options?.sessionDir ?? DEFAULT_SESSION_DIR;
    this.sessionsPath = path.join(baseDir, sessionDir);
  }

  /**
   * Gets the file path for a session.
   *
   * @param sessionId - The session identifier
   * @returns Full file path
   */
  private getFilePath(sessionId: string): string {
    // Sanitize session ID to prevent directory traversal
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.sessionsPath, `${safeId}.json`);
  }

  /**
   * Ensures the sessions directory exists.
   */
  private async ensureDirectory(): Promise<void> {
    await fs.mkdir(this.sessionsPath, { recursive: true });
  }

  /**
   * Saves a session snapshot to disk.
   *
   * @param snapshot - The snapshot to save
   */
  async save(snapshot: SessionSnapshot): Promise<void> {
    await this.ensureDirectory();

    const filePath = this.getFilePath(snapshot.id);
    const data = JSON.stringify(snapshot, null, 2);

    // Write atomically using temp file + rename
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, data, "utf-8");
    await fs.rename(tempPath, filePath);
  }

  /**
   * Loads a session snapshot from disk.
   *
   * @param sessionId - The session identifier
   * @returns The snapshot or null if not found
   */
  async load(sessionId: string): Promise<SessionSnapshot | null> {
    const filePath = this.getFilePath(sessionId);

    try {
      const data = await fs.readFile(filePath, "utf-8");
      const snapshot = JSON.parse(data) as SessionSnapshot;

      // Validate basic structure
      if (!snapshot.id || !snapshot.state || snapshot.version === undefined) {
        return null;
      }

      return snapshot;
    } catch (error) {
      // Return null for file not found or parse errors
      if (isNodeError(error) && (error.code === "ENOENT" || error.code === "EACCES")) {
        return null;
      }
      if (error instanceof SyntaxError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Deletes a session snapshot from disk.
   *
   * @param sessionId - The session identifier
   */
  async delete(sessionId: string): Promise<void> {
    const filePath = this.getFilePath(sessionId);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
      if (isNodeError(error) && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
  }

  /**
   * Lists all session IDs.
   *
   * @returns Array of session IDs
   */
  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.sessionsPath);
      return files.filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -5)); // Remove .json extension
    } catch (error) {
      // Return empty array if directory doesn't exist
      if (isNodeError(error) && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  /**
   * Gets the path to the sessions directory.
   */
  getSessionsPath(): string {
    return this.sessionsPath;
  }
}

/**
 * Type guard for Node.js errors with code property.
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/**
 * Creates a snapshot from current session state.
 *
 * @param id - Session identifier
 * @param state - Current agent state
 * @param messages - Session messages
 * @param context - Snapshot context
 * @returns SessionSnapshot
 */
export function createSnapshot(
  id: string,
  state: AgentState,
  messages: SessionMessage[],
  context: SnapshotContext
): SessionSnapshot {
  return {
    id,
    state,
    messages,
    context,
    timestamp: Date.now(),
    version: SNAPSHOT_VERSION,
  };
}

/**
 * Validates a snapshot structure.
 *
 * @param snapshot - The snapshot to validate
 * @returns true if valid
 */
export function isValidSnapshot(snapshot: unknown): snapshot is SessionSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }

  const s = snapshot as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.state === "string" &&
    Array.isArray(s.messages) &&
    typeof s.context === "object" &&
    s.context !== null &&
    typeof s.timestamp === "number" &&
    typeof s.version === "number"
  );
}

/**
 * In-memory state persister for testing.
 */
export class MemoryStatePersister implements StatePersister {
  private readonly snapshots = new Map<string, SessionSnapshot>();

  async save(snapshot: SessionSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, { ...snapshot });
  }

  async load(sessionId: string): Promise<SessionSnapshot | null> {
    const snapshot = this.snapshots.get(sessionId);
    return snapshot ? { ...snapshot } : null;
  }

  async delete(sessionId: string): Promise<void> {
    this.snapshots.delete(sessionId);
  }

  async list(): Promise<string[]> {
    return Array.from(this.snapshots.keys());
  }

  /**
   * Clears all snapshots (for testing).
   */
  clear(): void {
    this.snapshots.clear();
  }
}
