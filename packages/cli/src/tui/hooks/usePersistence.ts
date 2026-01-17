/**
 * usePersistence Hook
 *
 * React hook for managing session persistence with auto-save,
 * checkpoints, and rollback support. Integrates with @vellum/core
 * PersistenceManager for advanced persistence features.
 *
 * @module tui/hooks/usePersistence
 */

import type { PersistenceManager, Session, SessionCheckpoint, StorageManager } from "@vellum/core";
import { PersistenceManager as PersistenceManagerClass } from "@vellum/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPersistenceBridge,
  type PersistenceBridge,
  type PersistenceBridgeCallbacks,
} from "../adapters/persistence-bridge.js";
import {
  type SessionStorage,
  type UseSessionAdapterOptions,
  type UseSessionAdapterReturn,
  useSessionAdapter,
} from "../adapters/session-adapter.js";
import { useMessages } from "../context/MessagesContext.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Persistence status for UI display
 */
export type PersistenceStatus = "idle" | "saving" | "saved" | "error";

/**
 * Options for the usePersistence hook
 */
export interface UsePersistenceOptions {
  /** Session ID for persistence */
  readonly sessionId: string;
  /** Storage implementation for basic persistence */
  readonly storage: SessionStorage;
  /** Whether to enable advanced persistence features */
  readonly enableAdvancedPersistence?: boolean;
  /** Storage manager for advanced persistence (required if enableAdvancedPersistence=true) */
  readonly storageManager?: StorageManager;
  /** PersistenceManager instance (optional, created if storageManager provided) */
  readonly persistenceManager?: PersistenceManager;
  /** Whether to auto-save on message changes */
  readonly autoSave?: boolean;
  /** Debounce delay for auto-save in milliseconds */
  readonly saveDebounceMs?: number;
  /** Whether to auto-load session on mount */
  readonly autoLoad?: boolean;
  /** Callback when save completes */
  readonly onSave?: (session: Session) => void;
  /** Callback when save fails */
  readonly onError?: (error: Error) => void;
  /** Callback when checkpoint is created */
  readonly onCheckpointCreated?: (checkpointId: string) => void;
  /** Callback when rollback completes */
  readonly onRollbackComplete?: (success: boolean) => void;
}

/**
 * Return value of the usePersistence hook
 */
export interface UsePersistenceReturn extends UseSessionAdapterReturn {
  /** Current persistence status */
  readonly status: PersistenceStatus;
  /** Number of unsaved messages */
  readonly unsavedCount: number;
  /** Whether auto-save is running */
  readonly autoSaveRunning: boolean;
  /** Timestamp of last successful save */
  readonly lastSavedAt: Date | null;
  /** All checkpoints for current session */
  readonly checkpoints: readonly SessionCheckpoint[];
  /** Create a new checkpoint */
  readonly createCheckpoint: (description?: string) => Promise<string | null>;
  /** Rollback to a checkpoint */
  readonly rollbackToCheckpoint: (checkpointId: string) => Promise<boolean>;
  /** Delete a checkpoint */
  readonly deleteCheckpoint: (checkpointId: string) => Promise<boolean>;
  /** Get messages that will be lost on rollback */
  readonly getMessagesToLose: (checkpointId: string) => number;
  /** Whether advanced persistence is enabled */
  readonly isAdvancedEnabled: boolean;
  /** Force an immediate save */
  readonly forceSave: () => Promise<void>;
  /** Start auto-save timer */
  readonly startAutoSave: () => void;
  /** Stop auto-save timer */
  readonly stopAutoSave: () => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * usePersistence - Hook for session persistence management.
 *
 * Combines basic session adapter functionality with advanced
 * persistence features when PersistenceManager is available.
 *
 * Features:
 * - Basic: Auto-save, manual save, load, clear
 * - Advanced: Checkpoints, rollback, incremental sync
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const persistence = usePersistence({
 *     sessionId: 'session-123',
 *     storage: sessionStorage,
 *     enableAdvancedPersistence: true,
 *     storageManager: storageManager,
 *     onSave: (session) => console.log('Saved:', session.metadata.id),
 *   });
 *
 *   return (
 *     <Box>
 *       <Text>Status: {persistence.status}</Text>
 *       <Text>Unsaved: {persistence.unsavedCount}</Text>
 *       <Button onClick={() => persistence.createCheckpoint('Manual save')}>
 *         Create Checkpoint
 *       </Button>
 *     </Box>
 *   );
 * }
 * ```
 */
export function usePersistence(options: UsePersistenceOptions): UsePersistenceReturn {
  const {
    sessionId,
    storage,
    enableAdvancedPersistence = false,
    storageManager,
    persistenceManager: externalPersistenceManager,
    autoSave = true,
    saveDebounceMs = 500,
    autoLoad = true,
    onSave,
    onError,
    onCheckpointCreated,
    onRollbackComplete,
  } = options;

  // Get messages context
  const { messages, setMessages } = useMessages();

  // ==========================================================================
  // State
  // ==========================================================================

  const [status, setStatus] = useState<PersistenceStatus>("idle");
  const [unsavedCount, setUnsavedCount] = useState(0);
  const [autoSaveRunning, setAutoSaveRunning] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [checkpoints, setCheckpoints] = useState<readonly SessionCheckpoint[]>([]);

  // ==========================================================================
  // Refs
  // ==========================================================================

  const persistenceManagerRef = useRef<PersistenceManager | null>(
    externalPersistenceManager ?? null
  );
  const bridgeRef = useRef<PersistenceBridge | null>(null);
  const previousMessageCountRef = useRef(0);

  // ==========================================================================
  // Basic Session Adapter
  // ==========================================================================

  const sessionAdapterOptions: UseSessionAdapterOptions = useMemo(
    () => ({
      sessionId,
      storage,
      autoSave: autoSave && !enableAdvancedPersistence,
      saveDebounceMs,
      autoLoad,
    }),
    [sessionId, storage, autoSave, enableAdvancedPersistence, saveDebounceMs, autoLoad]
  );

  const sessionAdapter = useSessionAdapter(sessionAdapterOptions);

  // ==========================================================================
  // Advanced Persistence Setup
  // ==========================================================================

  const isAdvancedEnabled = enableAdvancedPersistence && storageManager !== undefined;

  // Create PersistenceManager and Bridge when advanced mode is enabled
  useEffect(() => {
    if (!isAdvancedEnabled || !storageManager) {
      return;
    }

    // Use external manager or create new one
    const manager =
      externalPersistenceManager ??
      new PersistenceManagerClass(storageManager, {
        autoSaveEnabled: autoSave,
        autoSaveIntervalSecs: Math.ceil(saveDebounceMs / 1000),
        maxUnsavedMessages: 5,
      });

    persistenceManagerRef.current = manager;

    // Create bridge with callbacks
    const callbacks: PersistenceBridgeCallbacks = {
      onSave: (session) => {
        setStatus("saved");
        setLastSavedAt(new Date());
        setUnsavedCount(0);
        setCheckpoints(session.checkpoints);
        onSave?.(session);
      },
      onError: (error) => {
        setStatus("error");
        onError?.(error);
      },
      onCheckpointCreated: (checkpointId) => {
        const session = manager.currentSession;
        if (session) {
          setCheckpoints(session.checkpoints);
        }
        onCheckpointCreated?.(checkpointId);
      },
      onRollbackComplete: (success) => {
        if (success) {
          const session = manager.currentSession;
          if (session) {
            setCheckpoints(session.checkpoints);
          }
        }
        onRollbackComplete?.(success);
      },
    };

    const bridge = createPersistenceBridge({
      persistence: manager,
      callbacks,
    });

    bridgeRef.current = bridge;

    // Start auto-save if enabled
    if (autoSave) {
      manager.startAutoSave();
      setAutoSaveRunning(true);
    }

    return () => {
      bridge.dispose();
      bridgeRef.current = null;

      // Only dispose manager if we created it
      if (!externalPersistenceManager) {
        manager.dispose();
      }
      persistenceManagerRef.current = null;
      setAutoSaveRunning(false);
    };
  }, [
    isAdvancedEnabled,
    storageManager,
    externalPersistenceManager,
    autoSave,
    saveDebounceMs,
    onSave,
    onError,
    onCheckpointCreated,
    onRollbackComplete,
  ]);

  // Track unsaved message count
  useEffect(() => {
    if (!isAdvancedEnabled) {
      return;
    }

    const manager = persistenceManagerRef.current;
    if (!manager) {
      return;
    }

    const newCount = messages.length - previousMessageCountRef.current;
    if (newCount > 0) {
      setUnsavedCount((prev) => prev + newCount);
      setStatus("idle");
    }
    previousMessageCountRef.current = messages.length;
  }, [messages.length, isAdvancedEnabled]);

  // ==========================================================================
  // Checkpoint Operations
  // ==========================================================================

  const createCheckpoint = useCallback(
    async (description?: string): Promise<string | null> => {
      if (!isAdvancedEnabled) {
        return null;
      }

      const bridge = bridgeRef.current;
      if (!bridge) {
        return null;
      }

      setStatus("saving");
      const checkpointId = await bridge.createCheckpoint(description);
      if (!checkpointId) {
        setStatus("error");
      }
      return checkpointId;
    },
    [isAdvancedEnabled]
  );

  const rollbackToCheckpoint = useCallback(
    async (checkpointId: string): Promise<boolean> => {
      if (!isAdvancedEnabled) {
        return false;
      }

      const bridge = bridgeRef.current;
      const manager = persistenceManagerRef.current;
      if (!bridge || !manager) {
        return false;
      }

      setStatus("saving");
      const success = await bridge.rollbackToCheckpoint(checkpointId);

      if (success) {
        // Update UI messages from rolled-back session
        const uiMessages = bridge.loadAsUIMessages();
        setMessages(uiMessages);
        previousMessageCountRef.current = uiMessages.length;
        setStatus("saved");
      } else {
        setStatus("error");
      }

      return success;
    },
    [isAdvancedEnabled, setMessages]
  );

  const deleteCheckpoint = useCallback(
    async (checkpointId: string): Promise<boolean> => {
      if (!isAdvancedEnabled) {
        return false;
      }

      const manager = persistenceManagerRef.current;
      if (!manager) {
        return false;
      }

      try {
        const success = await manager.deleteCheckpoint(checkpointId);
        if (success) {
          setCheckpoints(manager.getCheckpoints());
        }
        return success;
      } catch {
        return false;
      }
    },
    [isAdvancedEnabled]
  );

  const getMessagesToLose = useCallback(
    (checkpointId: string): number => {
      const checkpoint = checkpoints.find((cp) => cp.id === checkpointId);
      if (!checkpoint) {
        return 0;
      }
      return messages.length - checkpoint.messageIndex;
    },
    [checkpoints, messages.length]
  );

  // ==========================================================================
  // Save Operations
  // ==========================================================================

  const forceSave = useCallback(async (): Promise<void> => {
    if (isAdvancedEnabled) {
      const manager = persistenceManagerRef.current;
      if (!manager) {
        return;
      }

      setStatus("saving");
      try {
        await manager.save();
        setStatus("saved");
        setLastSavedAt(new Date());
        setUnsavedCount(0);
      } catch {
        setStatus("error");
      }
    } else {
      await sessionAdapter.saveSession();
    }
  }, [isAdvancedEnabled, sessionAdapter]);

  const startAutoSave = useCallback((): void => {
    if (!isAdvancedEnabled) {
      return;
    }

    const manager = persistenceManagerRef.current;
    if (manager) {
      manager.startAutoSave();
      setAutoSaveRunning(true);
    }
  }, [isAdvancedEnabled]);

  const stopAutoSave = useCallback((): void => {
    if (!isAdvancedEnabled) {
      return;
    }

    const manager = persistenceManagerRef.current;
    if (manager) {
      manager.stopAutoSave();
      setAutoSaveRunning(false);
    }
  }, [isAdvancedEnabled]);

  // ==========================================================================
  // Return Value
  // ==========================================================================

  return {
    // Basic session adapter methods
    saveSession: forceSave,
    loadSession: sessionAdapter.loadSession,
    clearSession: sessionAdapter.clearSession,
    isSaving: sessionAdapter.isSaving || status === "saving",
    isLoading: sessionAdapter.isLoading,
    error: sessionAdapter.error,

    // Advanced persistence state
    status,
    unsavedCount,
    autoSaveRunning,
    lastSavedAt,
    checkpoints,

    // Checkpoint operations
    createCheckpoint,
    rollbackToCheckpoint,
    deleteCheckpoint,
    getMessagesToLose,

    // Control methods
    isAdvancedEnabled,
    forceSave,
    startAutoSave,
    stopAutoSave,
  };
}

// =============================================================================
// Exports
// =============================================================================

export type {
  PersistenceBridge,
  PersistenceBridgeCallbacks,
} from "../adapters/persistence-bridge.js";
