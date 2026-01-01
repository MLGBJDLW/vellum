// ============================================
// Session Persistence Manager
// ============================================

/**
 * PersistenceManager provides auto-save and session lifecycle management.
 *
 * Handles automatic saving of sessions at intervals and after message thresholds,
 * with event emission for save success/failure notifications.
 *
 * @module @vellum/core/session/persistence
 */

import { EventEmitter } from "node:events";
import type { SessionMessage } from "./message.js";
import type { StorageManager } from "./storage.js";
import {
  addCheckpoint,
  addMessage,
  type CreateSessionOptions,
  createCheckpoint,
  createSession,
  type Session,
  type SessionCheckpoint,
  updateSessionMetadata,
} from "./types.js";

// =============================================================================
// Persistence Configuration
// =============================================================================

/**
 * Configuration for persistence behavior.
 *
 * Controls auto-save timing and thresholds.
 */
export interface PersistenceConfig {
  /** Whether auto-save is enabled (default: true) */
  autoSaveEnabled: boolean;
  /** Interval between auto-saves in seconds (default: 30) */
  autoSaveIntervalSecs: number;
  /** Maximum unsaved messages before triggering save (default: 5) */
  maxUnsavedMessages: number;
}

/**
 * Default persistence configuration values.
 */
export const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  autoSaveEnabled: true,
  autoSaveIntervalSecs: 30,
  maxUnsavedMessages: 5,
};

// =============================================================================
// Persistence Events
// =============================================================================

/**
 * Events emitted by PersistenceManager.
 */
export interface PersistenceEvents {
  /** Emitted after a successful save */
  save: [session: Session];
  /** Emitted when a save operation fails */
  error: [error: Error, session: Session | null];
}

// =============================================================================
// Persistence Manager Class
// =============================================================================

/**
 * Manages session persistence with auto-save support.
 *
 * PersistenceManager wraps StorageManager to provide:
 * - Automatic periodic saving
 * - Save on message threshold
 * - Session lifecycle management (new, load, close)
 * - Event emission for save/error notifications
 *
 * @example
 * ```typescript
 * const storage = await StorageManager.create();
 * const persistence = new PersistenceManager(storage, {
 *   autoSaveIntervalSecs: 60,
 *   maxUnsavedMessages: 10
 * });
 *
 * // Create a new session
 * await persistence.newSession({ title: "My Session" });
 *
 * // Handle messages
 * persistence.on('save', (session) => console.log('Saved:', session.metadata.id));
 * persistence.on('error', (err) => console.error('Save failed:', err));
 *
 * await persistence.onMessage(message);
 *
 * // Close when done
 * await persistence.closeSession();
 * ```
 */
export class PersistenceManager extends EventEmitter<PersistenceEvents> {
  /** Storage manager for disk operations */
  private readonly storage: StorageManager;

  /** Persistence configuration */
  private readonly config: PersistenceConfig;

  /** Currently active session */
  private _currentSession: Session | null = null;

  /** Count of messages since last save */
  private unsavedCount = 0;

  /** Auto-save interval timer */
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Creates a new PersistenceManager.
   *
   * @param storage - StorageManager for disk operations
   * @param config - Optional persistence configuration (merged with defaults)
   */
  constructor(storage: StorageManager, config?: Partial<PersistenceConfig>) {
    super();
    this.storage = storage;
    this.config = {
      ...DEFAULT_PERSISTENCE_CONFIG,
      ...config,
    };
  }

  // ===========================================================================
  // Properties
  // ===========================================================================

  /**
   * Gets the currently active session.
   *
   * @returns The current session or null if no session is active
   */
  get currentSession(): Session | null {
    return this._currentSession;
  }

  /**
   * Gets the persistence configuration.
   *
   * @returns Current persistence configuration
   */
  getConfig(): PersistenceConfig {
    return { ...this.config };
  }

  /**
   * Gets the number of unsaved messages.
   *
   * @returns Count of messages since last save
   */
  getUnsavedCount(): number {
    return this.unsavedCount;
  }

  /**
   * Checks if auto-save is currently running.
   *
   * @returns True if auto-save timer is active
   */
  isAutoSaveRunning(): boolean {
    return this.autoSaveTimer !== null;
  }

  // ===========================================================================
  // Auto-Save Management
  // ===========================================================================

  /**
   * Starts the auto-save interval timer.
   *
   * If auto-save is disabled in config or already running, this is a no-op.
   * The timer will trigger save() at the configured interval.
   *
   * @example
   * ```typescript
   * persistence.startAutoSave();
   * // Auto-save will run every config.autoSaveIntervalSecs seconds
   * ```
   */
  startAutoSave(): void {
    // Don't start if disabled or already running
    if (!this.config.autoSaveEnabled || this.autoSaveTimer !== null) {
      return;
    }

    const intervalMs = this.config.autoSaveIntervalSecs * 1000;
    this.autoSaveTimer = setInterval(() => {
      void this.autoSaveTick();
    }, intervalMs);

    // Prevent timer from keeping Node.js process alive
    if (this.autoSaveTimer.unref) {
      this.autoSaveTimer.unref();
    }
  }

  /**
   * Stops the auto-save interval timer.
   *
   * Clears the timer if running. Safe to call even if not running.
   *
   * @example
   * ```typescript
   * persistence.stopAutoSave();
   * ```
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer !== null) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Internal auto-save tick handler.
   *
   * Called by the interval timer. Only saves if there are unsaved changes.
   */
  private async autoSaveTick(): Promise<void> {
    if (this._currentSession === null || this.unsavedCount === 0) {
      return;
    }

    await this.save();
  }

  // ===========================================================================
  // Message Handling
  // ===========================================================================

  /**
   * Handles a new message being added to the session.
   *
   * Increments the unsaved count and triggers a save if the threshold
   * (maxUnsavedMessages) is reached.
   *
   * @param message - The message being added
   * @throws Error if no session is currently active
   *
   * @example
   * ```typescript
   * // After receiving a message from the agent loop
   * await persistence.onMessage(assistantMessage);
   * ```
   */
  async onMessage(message: SessionMessage): Promise<void> {
    if (this._currentSession === null) {
      throw new Error("No active session. Call newSession() or loadSession() first.");
    }

    // Update session with new message
    this._currentSession = addMessage(this._currentSession, message);
    this.unsavedCount++;

    // Check if we should save based on message threshold
    if (this.unsavedCount >= this.config.maxUnsavedMessages) {
      await this.save();
    }
  }

  // ===========================================================================
  // Save Operations
  // ===========================================================================

  /**
   * Persists the current session to disk.
   *
   * Saves the session via StorageManager and resets the unsaved count.
   * Emits 'save' event on success, 'error' event on failure.
   *
   * @throws Error if no session is currently active
   *
   * @example
   * ```typescript
   * await persistence.save();
   * ```
   */
  async save(): Promise<void> {
    if (this._currentSession === null) {
      throw new Error("No active session. Call newSession() or loadSession() first.");
    }

    try {
      // Update the updatedAt timestamp before saving
      this._currentSession = updateSessionMetadata(this._currentSession, {
        updatedAt: new Date(),
        lastActive: new Date(),
      });

      await this.storage.save(this._currentSession);
      this.unsavedCount = 0;
      this.emit("save", this._currentSession);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit("error", err, this._currentSession);
      throw err;
    }
  }

  // ===========================================================================
  // Session Lifecycle
  // ===========================================================================

  /**
   * Loads an existing session and sets it as current.
   *
   * Stops any existing auto-save, loads the session from storage,
   * and restarts auto-save if enabled.
   *
   * @param sessionId - The ID of the session to load
   * @returns The loaded session
   * @throws StorageError if session not found or load fails
   *
   * @example
   * ```typescript
   * const session = await persistence.loadSession("123e4567-e89b-12d3-a456-426614174000");
   * console.log(session.metadata.title);
   * ```
   */
  async loadSession(sessionId: string): Promise<Session> {
    // Stop existing auto-save if running
    this.stopAutoSave();

    // Load session from storage
    const session = await this.storage.load(sessionId);

    // Set as current and reset state
    this._currentSession = session;
    this.unsavedCount = 0;

    // Start auto-save if enabled
    if (this.config.autoSaveEnabled) {
      this.startAutoSave();
    }

    return session;
  }

  /**
   * Loads a session's data without setting it as current.
   *
   * Useful for reading session data without affecting the current session state,
   * such as during fork or merge operations.
   *
   * @param sessionId - The ID of the session to load
   * @returns The loaded session, or null if not found
   *
   * @example
   * ```typescript
   * const session = await persistence.loadSessionData("session-id");
   * if (session) {
   *   console.log(session.metadata.title);
   * }
   * ```
   */
  async loadSessionData(sessionId: string): Promise<Session | null> {
    try {
      return await this.storage.load(sessionId);
    } catch {
      return null;
    }
  }

  /**
   * Saves a session's data without setting it as current.
   *
   * Useful for saving forked or merged sessions without affecting the
   * current session state.
   *
   * @param session - The session to save
   *
   * @example
   * ```typescript
   * await persistence.saveSessionData(forkedSession);
   * ```
   */
  async saveSessionData(session: Session): Promise<void> {
    await this.storage.save(session);
  }

  /**
   * Creates a new session and sets it as current.
   *
   * Stops any existing auto-save, creates a new session,
   * saves it to storage, and restarts auto-save if enabled.
   *
   * @param options - Options for creating the new session
   * @returns The new session
   *
   * @example
   * ```typescript
   * const session = await persistence.newSession({
   *   title: "Code Review Session",
   *   mode: "code",
   *   workingDirectory: "/path/to/project"
   * });
   * ```
   */
  async newSession(options?: CreateSessionOptions): Promise<Session> {
    // Stop existing auto-save if running
    this.stopAutoSave();

    // Create new session
    const session = createSession(options);

    // Set as current and reset state
    this._currentSession = session;
    this.unsavedCount = 0;

    // Save immediately to create the file
    try {
      await this.storage.save(session);
      this.emit("save", session);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit("error", err, session);
      throw err;
    }

    // Start auto-save if enabled
    if (this.config.autoSaveEnabled) {
      this.startAutoSave();
    }

    return session;
  }

  /**
   * Closes the current session.
   *
   * Saves the session if there are unsaved changes, stops auto-save,
   * and clears the current session.
   *
   * @example
   * ```typescript
   * await persistence.closeSession();
   * // persistence.currentSession is now null
   * ```
   */
  async closeSession(): Promise<void> {
    // Stop auto-save first
    this.stopAutoSave();

    // Save if there are unsaved changes
    if (this._currentSession !== null && this.unsavedCount > 0) {
      try {
        await this.save();
      } catch (error) {
        // Error already emitted by save(), just log and continue closing
        console.warn("Failed to save session on close:", error);
      }
    }

    // Clear current session
    this._currentSession = null;
    this.unsavedCount = 0;
  }

  // ===========================================================================
  // Checkpoint Management
  // ===========================================================================

  /**
   * Creates a checkpoint at the current message index.
   *
   * Checkpoints are lightweight index pointers that allow rollback
   * to a previous conversation state. The session is auto-saved after creation.
   *
   * @param description - Optional description of the checkpoint
   * @returns The ID of the created checkpoint
   * @throws Error if no session is currently active
   *
   * @example
   * ```typescript
   * const checkpointId = await persistence.createCheckpointAt("Before refactoring");
   * // Later: await persistence.rollbackToCheckpoint(checkpointId);
   * ```
   */
  async createCheckpointAt(description?: string): Promise<string> {
    if (this._currentSession === null) {
      throw new Error("No active session. Call newSession() or loadSession() first.");
    }

    // Create checkpoint at current message index
    const checkpoint = createCheckpoint(this._currentSession, { description });

    // Add checkpoint to session
    this._currentSession = addCheckpoint(this._currentSession, checkpoint);

    // Auto-save session
    await this.save();

    return checkpoint.id;
  }

  /**
   * Rolls back the session to a previous checkpoint.
   *
   * This is a destructive operation that:
   * - Truncates messages to the checkpoint's messageIndex
   * - Removes all checkpoints created after this one
   * - Updates session metadata (updatedAt, messageCount, tokenCount)
   * - Auto-saves the session
   *
   * @param checkpointId - The ID of the checkpoint to rollback to
   * @returns True if rollback succeeded, false if checkpoint not found
   * @throws Error if no session is currently active
   *
   * @example
   * ```typescript
   * const success = await persistence.rollbackToCheckpoint(checkpointId);
   * if (success) {
   *   console.log("Rolled back successfully");
   * }
   * ```
   */
  async rollbackToCheckpoint(checkpointId: string): Promise<boolean> {
    if (this._currentSession === null) {
      throw new Error("No active session. Call newSession() or loadSession() first.");
    }

    // Find checkpoint by ID
    const checkpointIndex = this._currentSession.checkpoints.findIndex(
      (cp) => cp.id === checkpointId
    );

    if (checkpointIndex === -1) {
      return false;
    }

    const checkpoint = this._currentSession.checkpoints[checkpointIndex];
    // This should never be undefined since we checked checkpointIndex !== -1
    if (checkpoint === undefined) {
      return false;
    }

    // Truncate messages to checkpoint's messageIndex
    const truncatedMessages = this._currentSession.messages.slice(0, checkpoint.messageIndex);

    // Remove checkpoints after this one (keep only checkpoints up to and including this one)
    const remainingCheckpoints = this._currentSession.checkpoints.slice(0, checkpointIndex + 1);

    // Recalculate token count from remaining messages
    const tokenCount = truncatedMessages.reduce((sum, msg) => {
      return sum + (msg.metadata.tokens?.input ?? 0) + (msg.metadata.tokens?.output ?? 0);
    }, 0);

    // Update session with truncated state
    this._currentSession = {
      ...this._currentSession,
      messages: truncatedMessages,
      checkpoints: remainingCheckpoints,
      metadata: {
        ...this._currentSession.metadata,
        updatedAt: new Date(),
        messageCount: truncatedMessages.length,
        tokenCount,
      },
    };

    // Auto-save session
    await this.save();

    return true;
  }

  /**
   * Gets all checkpoints for the current session.
   *
   * @returns Array of checkpoints, or empty array if no session is active
   *
   * @example
   * ```typescript
   * const checkpoints = persistence.getCheckpoints();
   * checkpoints.forEach(cp => console.log(cp.description, cp.messageIndex));
   * ```
   */
  getCheckpoints(): SessionCheckpoint[] {
    if (this._currentSession === null) {
      return [];
    }
    return [...this._currentSession.checkpoints];
  }

  /**
   * Deletes a checkpoint from the current session.
   *
   * @param checkpointId - The ID of the checkpoint to delete
   * @returns True if checkpoint was deleted, false if not found
   * @throws Error if no session is currently active
   *
   * @example
   * ```typescript
   * const deleted = await persistence.deleteCheckpoint(checkpointId);
   * ```
   */
  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    if (this._currentSession === null) {
      throw new Error("No active session. Call newSession() or loadSession() first.");
    }

    const checkpointIndex = this._currentSession.checkpoints.findIndex(
      (cp) => cp.id === checkpointId
    );

    if (checkpointIndex === -1) {
      return false;
    }

    // Remove checkpoint from array
    this._currentSession = {
      ...this._currentSession,
      checkpoints: [
        ...this._currentSession.checkpoints.slice(0, checkpointIndex),
        ...this._currentSession.checkpoints.slice(checkpointIndex + 1),
      ],
      metadata: {
        ...this._currentSession.metadata,
        updatedAt: new Date(),
      },
    };

    // Auto-save session
    await this.save();

    return true;
  }

  // ===========================================================================
  // Disposal
  // ===========================================================================

  /**
   * Disposes the PersistenceManager.
   *
   * Stops auto-save and clears state. Does NOT save the current session.
   * Use closeSession() if you want to save before disposing.
   *
   * @example
   * ```typescript
   * // Save and close gracefully
   * await persistence.closeSession();
   *
   * // Or dispose without saving
   * persistence.dispose();
   * ```
   */
  dispose(): void {
    this.stopAutoSave();
    this._currentSession = null;
    this.unsavedCount = 0;
    this.removeAllListeners();
  }
}
