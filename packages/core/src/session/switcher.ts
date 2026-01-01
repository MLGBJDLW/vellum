// ============================================
// Session Switcher
// ============================================

/**
 * Session switching and lifecycle management.
 *
 * Provides high-level session switching capabilities with history tracking,
 * event emission, and graceful handling of session transitions.
 *
 * @module @vellum/core/session/switcher
 */

import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { createId } from "@vellum/shared";
import type { PersistenceManager } from "./persistence.js";
import {
  type CreateSessionOptions,
  type Session,
  type SessionCheckpoint,
  updateSessionMetadata,
} from "./types.js";

// =============================================================================
// Fork & Merge Options
// =============================================================================

/**
 * Options for forking a session.
 */
export interface ForkOptions {
  /** Custom title for the forked session (defaults to "{original} (Fork)") */
  newTitle?: string;
  /** Fork from a specific checkpoint ID (forks from current state if not provided) */
  fromCheckpoint?: string;
  /** Whether to include tags from the original session (default: true) */
  includeTags?: boolean;
}

/**
 * Options for merging sessions.
 */
export interface MergeOptions {
  /** Custom title for the merged session (defaults to "Merged: {titles}") */
  newTitle?: string;
  /** Whether to deduplicate messages by content hash (default: false) */
  deduplicateMessages?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Maximum number of sessions to track in switch history.
 */
const MAX_HISTORY_SIZE = 10;

// =============================================================================
// Switcher Events
// =============================================================================

/**
 * Events emitted by SessionSwitcher.
 */
export interface SwitcherEvents {
  /** Emitted when switching from one session to another */
  switch: [from: string | null, to: string];
  /** Emitted when a new session is created */
  newSession: [sessionId: string];
}

// =============================================================================
// Session Switcher Class
// =============================================================================

/**
 * Manages session switching with history tracking.
 *
 * SessionSwitcher provides a high-level interface for creating new sessions
 * and switching between existing sessions. It maintains a history of recent
 * sessions for quick back/forward navigation and emits events for UI updates.
 *
 * @example
 * ```typescript
 * const persistence = new PersistenceManager(storage);
 * const switcher = new SessionSwitcher(persistence);
 *
 * // Create a new session
 * const session = await switcher.createNewSession({ title: "New Task" });
 *
 * // Listen for switch events
 * switcher.on('switch', (from, to) => {
 *   console.log(`Switched from ${from} to ${to}`);
 * });
 *
 * // Switch to another session
 * await switcher.switchTo("another-session-id");
 *
 * // Get recent history for navigation
 * const history = switcher.getHistory();
 * ```
 */
export class SessionSwitcher extends EventEmitter<SwitcherEvents> {
  /** Persistence manager for session operations */
  private readonly persistence: PersistenceManager;

  /** History of recently switched session IDs (most recent first) */
  private switchHistory: string[] = [];

  /**
   * Creates a new SessionSwitcher.
   *
   * @param persistence - PersistenceManager for session load/save operations
   */
  constructor(persistence: PersistenceManager) {
    super();
    this.persistence = persistence;
  }

  // ===========================================================================
  // Properties
  // ===========================================================================

  /**
   * Gets the ID of the currently active session.
   *
   * @returns The current session ID or null if no session is active
   */
  get currentSessionId(): string | null {
    return this.persistence.currentSession?.metadata.id ?? null;
  }

  /**
   * Gets the currently active session.
   *
   * @returns The current session or null if no session is active
   */
  get currentSession(): Session | null {
    return this.persistence.currentSession;
  }

  // ===========================================================================
  // Session Creation
  // ===========================================================================

  /**
   * Creates a new session and sets it as current.
   *
   * If a session is currently active, it will be saved before creating
   * the new session. The new session is automatically added to the
   * switch history.
   *
   * @param options - Options for creating the new session
   * @returns The newly created session
   *
   * @example
   * ```typescript
   * const session = await switcher.createNewSession({
   *   title: "Code Review",
   *   mode: "code",
   *   workingDirectory: "/path/to/project"
   * });
   * ```
   */
  async createNewSession(options?: CreateSessionOptions): Promise<Session> {
    // Save current session if exists
    const previousId = this.currentSessionId;
    if (previousId !== null) {
      await this.saveCurrentSession();
    }

    // Create new session via persistence
    const session = await this.persistence.newSession(options);
    const newId = session.metadata.id;

    // Add to switch history
    this.addToHistory(newId);

    // Emit events
    this.emit("newSession", newId);
    this.emit("switch", previousId, newId);

    return session;
  }

  // ===========================================================================
  // Session Switching
  // ===========================================================================

  /**
   * Switches to an existing session by ID.
   *
   * Saves the current session if one is active, loads the target session,
   * updates its lastActive timestamp, and adds it to the switch history.
   *
   * @param sessionId - The ID of the session to switch to
   * @returns The loaded session
   * @throws Error if the session does not exist or cannot be loaded
   *
   * @example
   * ```typescript
   * try {
   *   const session = await switcher.switchTo("session-uuid");
   *   console.log(`Switched to: ${session.metadata.title}`);
   * } catch (error) {
   *   console.error("Session not found");
   * }
   * ```
   */
  async switchTo(sessionId: string): Promise<Session> {
    // Don't switch if already on this session
    if (this.currentSessionId === sessionId) {
      const session = this.persistence.currentSession;
      if (session) {
        return session;
      }
    }

    // Save current session if exists
    const previousId = this.currentSessionId;
    if (previousId !== null) {
      await this.saveCurrentSession();
    }

    // Load target session
    let session = await this.persistence.loadSession(sessionId);

    // Update lastActive timestamp
    session = updateSessionMetadata(session, {
      lastActive: new Date(),
    });

    // Save the updated lastActive
    await this.persistence.save();

    // Add to switch history
    this.addToHistory(sessionId);

    // Emit switch event
    this.emit("switch", previousId, sessionId);

    return session;
  }

  // ===========================================================================
  // History Management
  // ===========================================================================

  /**
   * Gets the list of recently switched session IDs.
   *
   * Returns up to MAX_HISTORY_SIZE (10) session IDs, ordered from most
   * recently switched to least recently switched. Useful for implementing
   * back/forward navigation in the UI.
   *
   * @returns Array of recent session IDs (most recent first)
   *
   * @example
   * ```typescript
   * const history = switcher.getHistory();
   * // ["latest-id", "previous-id", "older-id", ...]
   *
   * // Navigate back
   * if (history.length > 1) {
   *   await switcher.switchTo(history[1]);
   * }
   * ```
   */
  getHistory(): string[] {
    return [...this.switchHistory];
  }

  /**
   * Clears the switch history.
   *
   * Useful when starting fresh or after session cleanup.
   */
  clearHistory(): void {
    this.switchHistory = [];
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Saves the current session if it exists and has unsaved changes.
   */
  private async saveCurrentSession(): Promise<void> {
    if (this.persistence.currentSession !== null) {
      try {
        await this.persistence.save();
      } catch (error) {
        // Log but don't fail the switch operation
        console.warn("Failed to save current session before switch:", error);
      }
    }
  }

  /**
   * Adds a session ID to the switch history.
   *
   * Removes the ID if it already exists (to avoid duplicates),
   * then adds it to the front. Trims history to MAX_HISTORY_SIZE.
   *
   * @param sessionId - The session ID to add
   */
  private addToHistory(sessionId: string): void {
    // Remove if already in history (move to front)
    const existingIndex = this.switchHistory.indexOf(sessionId);
    if (existingIndex !== -1) {
      this.switchHistory.splice(existingIndex, 1);
    }

    // Add to front
    this.switchHistory.unshift(sessionId);

    // Trim to max size
    if (this.switchHistory.length > MAX_HISTORY_SIZE) {
      this.switchHistory = this.switchHistory.slice(0, MAX_HISTORY_SIZE);
    }
  }

  // ===========================================================================
  // Fork & Merge Operations
  // ===========================================================================

  /**
   * Forks a session, creating a deep clone with a new ID.
   *
   * The forked session is an independent copy that can be modified without
   * affecting the original. Optionally forks from a specific checkpoint,
   * which truncates messages to that point.
   *
   * @param sessionId - ID of the session to fork (defaults to current session)
   * @param options - Fork configuration options
   * @returns The newly created forked session
   * @throws Error if no session is specified and no current session exists
   * @throws Error if the specified session cannot be found
   * @throws Error if the specified checkpoint does not exist
   *
   * @example
   * ```typescript
   * // Fork current session
   * const forked = await switcher.forkSession();
   *
   * // Fork a specific session with custom title
   * const forked = await switcher.forkSession("session-id", {
   *   newTitle: "Experimental Branch"
   * });
   *
   * // Fork from a checkpoint
   * const forked = await switcher.forkSession("session-id", {
   *   fromCheckpoint: "checkpoint-id"
   * });
   * ```
   */
  async forkSession(sessionId?: string, options: ForkOptions = {}): Promise<Session> {
    const { newTitle, fromCheckpoint, includeTags = true } = options;

    // Determine source session
    let sourceSession: Session | null = null;

    if (sessionId !== undefined) {
      // Load the specified session (don't switch to it)
      sourceSession = await this.persistence.loadSessionData(sessionId);
    } else if (this.currentSession !== null) {
      sourceSession = this.currentSession;
    }

    if (sourceSession === null) {
      throw new Error(
        sessionId !== undefined
          ? `Session not found: ${sessionId}`
          : "No session to fork. Provide a session ID or ensure a session is active."
      );
    }

    // Handle checkpoint-based fork
    let messages = deepCloneMessages(sourceSession.messages);
    let checkpoints = deepCloneCheckpoints(sourceSession.checkpoints);

    if (fromCheckpoint !== undefined) {
      const checkpoint = sourceSession.checkpoints.find((cp) => cp.id === fromCheckpoint);
      if (checkpoint === undefined) {
        throw new Error(`Checkpoint not found: ${fromCheckpoint}`);
      }
      // Truncate messages to checkpoint's message index
      messages = messages.slice(0, checkpoint.messageIndex);
      // Clear checkpoints (forked session starts fresh)
      checkpoints = [];
    } else {
      // Clear checkpoints for fork (new history starts here)
      checkpoints = [];
    }

    // Generate new session ID
    const newId = createId();
    const now = new Date();

    // Build tags for forked session
    const tags: string[] = [`forked-from:${sourceSession.metadata.id}`];
    if (includeTags) {
      // Add original tags, filtering out any existing forked-from tags
      const originalTags = sourceSession.metadata.tags.filter(
        (tag) => !tag.startsWith("forked-from:")
      );
      tags.push(...originalTags);
    }

    // Create the forked session
    const forkedSession: Session = {
      metadata: {
        ...sourceSession.metadata,
        id: newId,
        title: newTitle ?? `${sourceSession.metadata.title} (Fork)`,
        createdAt: now,
        updatedAt: now,
        lastActive: now,
        tags,
        messageCount: messages.length,
      },
      messages,
      checkpoints,
    };

    // Save the forked session
    await this.persistence.saveSessionData(forkedSession);

    // Add to history
    this.addToHistory(newId);

    // Emit new session event
    this.emit("newSession", newId);

    return forkedSession;
  }

  /**
   * Merges multiple sessions into a new combined session.
   *
   * Messages from all source sessions are combined and sorted chronologically
   * by their timestamp. Tags from all sources are deduplicated and combined.
   *
   * @param sourceIds - Array of session IDs to merge
   * @param options - Merge configuration options
   * @returns The newly created merged session
   * @throws Error if fewer than 2 session IDs are provided
   * @throws Error if any source session cannot be found
   *
   * @example
   * ```typescript
   * // Basic merge
   * const merged = await switcher.mergeSessions(["session-1", "session-2"]);
   *
   * // Merge with custom title and deduplication
   * const merged = await switcher.mergeSessions(
   *   ["session-1", "session-2", "session-3"],
   *   { newTitle: "Combined Research", deduplicateMessages: true }
   * );
   * ```
   */
  async mergeSessions(sourceIds: string[], options: MergeOptions = {}): Promise<Session> {
    const { newTitle, deduplicateMessages = false } = options;

    if (sourceIds.length < 2) {
      throw new Error("At least 2 sessions are required for merge.");
    }

    // Load all source sessions
    const sourceSessions: Session[] = [];
    for (const id of sourceIds) {
      const session = await this.persistence.loadSessionData(id);
      if (session === null) {
        throw new Error(`Session not found: ${id}`);
      }
      sourceSessions.push(session);
    }

    // Collect and sort messages chronologically
    let allMessages = sourceSessions.flatMap((session) => deepCloneMessages(session.messages));

    // Sort by createdAt timestamp
    allMessages.sort((a, b) => {
      const timeA = a.metadata.createdAt;
      const timeB = b.metadata.createdAt;
      return timeA - timeB;
    });

    // Deduplicate if requested
    if (deduplicateMessages) {
      const seen = new Set<string>();
      allMessages = allMessages.filter((message) => {
        const hash = computeMessageHash(message);
        if (seen.has(hash)) {
          return false;
        }
        seen.add(hash);
        return true;
      });
    }

    // Collect and deduplicate tags from all sources
    const allTags = new Set<string>();
    for (const session of sourceSessions) {
      for (const tag of session.metadata.tags) {
        allTags.add(tag);
      }
    }

    // Build merged session title
    const titles = sourceSessions.map((s) => s.metadata.title);
    const mergedTitle = newTitle ?? `Merged: ${titles.join(", ")}`;

    // Calculate total token count
    const totalTokenCount = sourceSessions.reduce(
      (sum, session) => sum + session.metadata.tokenCount,
      0
    );

    // Create the merged session
    const newId = createId();
    const now = new Date();

    const mergedSession: Session = {
      metadata: {
        id: newId,
        title: mergedTitle,
        createdAt: now,
        updatedAt: now,
        lastActive: now,
        status: "active",
        mode: sourceSessions[0]?.metadata.mode ?? "chat", // Use first session's mode
        tags: Array.from(allTags),
        workingDirectory: sourceSessions[0]?.metadata.workingDirectory ?? process.cwd(),
        tokenCount: totalTokenCount,
        messageCount: allMessages.length,
        summary: undefined,
      },
      messages: allMessages,
      checkpoints: [], // Merged session starts with no checkpoints
    };

    // Save the merged session
    await this.persistence.saveSessionData(mergedSession);

    // Add to history
    this.addToHistory(newId);

    // Emit new session event
    this.emit("newSession", newId);

    return mergedSession;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Deep clones an array of messages to avoid reference issues.
 */
function deepCloneMessages(messages: Session["messages"]): Session["messages"] {
  return JSON.parse(JSON.stringify(messages)) as Session["messages"];
}

/**
 * Deep clones an array of checkpoints to avoid reference issues.
 */
function deepCloneCheckpoints(checkpoints: SessionCheckpoint[]): SessionCheckpoint[] {
  return JSON.parse(JSON.stringify(checkpoints)) as SessionCheckpoint[];
}

/**
 * Computes a hash for message content to enable deduplication.
 */
function computeMessageHash(message: Session["messages"][number]): string {
  const content = JSON.stringify({
    role: message.role,
    parts: message.parts,
  });
  return createHash("sha256").update(content).digest("hex");
}
