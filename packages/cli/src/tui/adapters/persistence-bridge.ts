/**
 * Persistence Bridge
 *
 * Provides bidirectional conversion and synchronization between
 * TUI Message types and @vellum/core SessionMessage types for
 * advanced persistence operations.
 *
 * @module tui/adapters/persistence-bridge
 */

import type { PersistenceManager, Session, SessionMessage } from "@vellum/core";
import type { Message } from "../context/MessagesContext.js";
import { toSessionMessage, toUIMessage } from "./message-adapter.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Synchronization state for incremental updates
 */
export interface SyncState {
  /** Last synchronized message index */
  lastSyncedIndex: number;
  /** Session ID being tracked */
  sessionId: string | null;
}

/**
 * Sync result from a synchronization operation
 */
export interface SyncResult {
  /** Whether sync was successful */
  success: boolean;
  /** Number of messages synced */
  syncedCount: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Event callbacks for persistence bridge
 */
export interface PersistenceBridgeCallbacks {
  /** Called when a save operation completes */
  onSave?: (session: Session) => void;
  /** Called when a save operation fails */
  onError?: (error: Error) => void;
  /** Called when a checkpoint is created */
  onCheckpointCreated?: (checkpointId: string) => void;
  /** Called when a rollback completes */
  onRollbackComplete?: (success: boolean) => void;
}

/**
 * Options for creating a persistence bridge
 */
export interface PersistenceBridgeOptions {
  /** PersistenceManager instance */
  persistence: PersistenceManager;
  /** Optional callbacks */
  callbacks?: PersistenceBridgeCallbacks;
}

// =============================================================================
// Persistence Bridge Class
// =============================================================================

/**
 * Bridge between TUI messages and PersistenceManager.
 *
 * Handles:
 * - Message ↔ SessionMessage bidirectional conversion
 * - EventEmitter → callback bridging
 * - Incremental synchronization (only sync changes)
 *
 * @example
 * ```typescript
 * const bridge = createPersistenceBridge({
 *   persistence: persistenceManager,
 *   callbacks: {
 *     onSave: (session) => console.log('Saved:', session.metadata.id),
 *     onError: (err) => console.error('Error:', err.message),
 *   },
 * });
 *
 * // Sync messages incrementally
 * await bridge.syncMessages(uiMessages);
 *
 * // Full sync from persistence to UI
 * const uiMessages = bridge.loadAsUIMessages();
 * ```
 */
export class PersistenceBridge {
  private readonly persistence: PersistenceManager;
  private readonly callbacks: PersistenceBridgeCallbacks;
  private syncState: SyncState;
  private eventListenersAttached = false;

  constructor(options: PersistenceBridgeOptions) {
    this.persistence = options.persistence;
    this.callbacks = options.callbacks ?? {};
    this.syncState = {
      lastSyncedIndex: 0,
      sessionId: null,
    };
  }

  // ===========================================================================
  // Event Bridging
  // ===========================================================================

  /**
   * Attach event listeners to bridge PersistenceManager events to callbacks.
   */
  attachEventListeners(): void {
    if (this.eventListenersAttached) {
      return;
    }

    this.persistence.on("save", (session) => {
      this.callbacks.onSave?.(session);
    });

    this.persistence.on("error", (error) => {
      this.callbacks.onError?.(error);
    });

    this.eventListenersAttached = true;
  }

  /**
   * Detach event listeners.
   */
  detachEventListeners(): void {
    if (!this.eventListenersAttached) {
      return;
    }

    this.persistence.removeAllListeners("save");
    this.persistence.removeAllListeners("error");
    this.eventListenersAttached = false;
  }

  // ===========================================================================
  // Message Conversion
  // ===========================================================================

  /**
   * Convert UI messages to session messages.
   *
   * @param messages - Array of UI messages
   * @returns Array of session messages
   */
  toSessionMessages(messages: readonly Message[]): SessionMessage[] {
    return messages
      .filter((msg): msg is Message => msg.role !== "tool" && msg.role !== "tool_group")
      .map((msg) => toSessionMessage(msg));
  }

  /**
   * Convert session messages to UI messages.
   *
   * @param sessionMessages - Array of session messages
   * @returns Array of UI messages
   */
  toUIMessages(sessionMessages: readonly SessionMessage[]): Message[] {
    return sessionMessages.map((msg) => toUIMessage(msg));
  }

  /**
   * Load current session messages as UI messages.
   *
   * @returns Array of UI messages, or empty array if no session
   */
  loadAsUIMessages(): Message[] {
    const session = this.persistence.currentSession;
    if (!session) {
      return [];
    }
    return this.toUIMessages(session.messages);
  }

  // ===========================================================================
  // Incremental Synchronization
  // ===========================================================================

  /**
   * Sync UI messages to persistence incrementally.
   *
   * Only processes messages that haven't been synced yet.
   *
   * @param messages - Current UI messages
   * @returns Sync result
   */
  async syncMessages(messages: readonly Message[]): Promise<SyncResult> {
    const session = this.persistence.currentSession;
    if (!session) {
      return {
        success: false,
        syncedCount: 0,
        error: "No active session",
      };
    }

    // Reset sync state if session changed
    if (this.syncState.sessionId !== session.metadata.id) {
      this.syncState = {
        lastSyncedIndex: 0,
        sessionId: session.metadata.id,
      };
    }

    // Get new messages since last sync
    const newMessages = messages.slice(this.syncState.lastSyncedIndex);
    if (newMessages.length === 0) {
      return {
        success: true,
        syncedCount: 0,
      };
    }

    try {
      // Convert and add each new message
      for (const msg of newMessages) {
        if (msg.role === "tool" || msg.role === "tool_group") {
          continue;
        }
        const sessionMsg = toSessionMessage(msg);
        await this.persistence.onMessage(sessionMsg);
      }

      // Update sync state
      this.syncState.lastSyncedIndex = messages.length;

      return {
        success: true,
        syncedCount: newMessages.length,
      };
    } catch (error) {
      return {
        success: false,
        syncedCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Reset sync state (e.g., after rollback or session change).
   */
  resetSyncState(): void {
    this.syncState = {
      lastSyncedIndex: 0,
      sessionId: this.persistence.currentSession?.metadata.id ?? null,
    };
  }

  // ===========================================================================
  // Checkpoint Operations
  // ===========================================================================

  /**
   * Create a checkpoint and notify via callback.
   *
   * @param description - Optional checkpoint description
   * @returns Checkpoint ID or null if failed
   */
  async createCheckpoint(description?: string): Promise<string | null> {
    try {
      const checkpointId = await this.persistence.createCheckpointAt(description);
      this.callbacks.onCheckpointCreated?.(checkpointId);
      return checkpointId;
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Rollback to a checkpoint and notify via callback.
   *
   * @param checkpointId - ID of checkpoint to rollback to
   * @returns Success status
   */
  async rollbackToCheckpoint(checkpointId: string): Promise<boolean> {
    try {
      const success = await this.persistence.rollbackToCheckpoint(checkpointId);
      this.callbacks.onRollbackComplete?.(success);
      if (success) {
        this.resetSyncState();
      }
      return success;
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      this.callbacks.onRollbackComplete?.(false);
      return false;
    }
  }

  // ===========================================================================
  // Disposal
  // ===========================================================================

  /**
   * Dispose the bridge and clean up resources.
   */
  dispose(): void {
    this.detachEventListeners();
    this.syncState = {
      lastSyncedIndex: 0,
      sessionId: null,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new persistence bridge instance.
 *
 * @param options - Bridge configuration options
 * @returns Configured PersistenceBridge instance
 */
export function createPersistenceBridge(options: PersistenceBridgeOptions): PersistenceBridge {
  const bridge = new PersistenceBridge(options);
  bridge.attachEventListeners();
  return bridge;
}
