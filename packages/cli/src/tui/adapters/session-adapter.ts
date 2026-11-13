/**
 * Session Persistence Adapter
 *
 * Provides bidirectional synchronization between TUI MessagesContext
 * and @vellum/core session messages for persistence.
 *
 * @module tui/adapters/session-adapter
 */

import type { SessionMessage } from "@vellum/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "../context/MessagesContext.js";
import { useMessages } from "../context/MessagesContext.js";
import { toSessionMessage, toUIMessages } from "./message-adapter.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Session storage interface for persistence
 *
 * Abstracts the underlying storage mechanism to allow for different
 * implementations (file-based, memory, etc.)
 */
export interface SessionStorage {
  /**
   * Save messages to the session
   *
   * @param sessionId - Unique session identifier
   * @param messages - Session messages to persist
   */
  save(sessionId: string, messages: readonly SessionMessage[]): Promise<void>;

  /**
   * Load messages from a session
   *
   * @param sessionId - Unique session identifier
   * @returns Array of session messages, or null if session not found
   */
  load(sessionId: string): Promise<readonly SessionMessage[] | null>;

  /**
   * Clear all messages from a session
   *
   * @param sessionId - Unique session identifier
   */
  clear(sessionId: string): Promise<void>;
}

/**
 * Options for the useSessionAdapter hook
 */
export interface UseSessionAdapterOptions {
  /**
   * Session ID for persistence
   */
  sessionId: string;

  /**
   * Storage implementation for session persistence
   */
  storage: SessionStorage;

  /**
   * Whether to auto-save on message changes
   * @default true
   */
  autoSave?: boolean;

  /**
   * Debounce delay for auto-save in milliseconds
   * @default 500
   */
  saveDebounceMs?: number;

  /**
   * Whether to load session on mount
   * @default true
   */
  autoLoad?: boolean;
}

/**
 * Return value of the useSessionAdapter hook
 */
export interface UseSessionAdapterReturn {
  /**
   * Manually save current messages to session
   */
  saveSession: () => Promise<void>;

  /**
   * Load messages from session and update context
   */
  loadSession: () => Promise<void>;

  /**
   * Clear the session storage
   */
  clearSession: () => Promise<void>;

  /**
   * Whether a save operation is in progress
   */
  isSaving: boolean;

  /**
   * Whether a load operation is in progress
   */
  isLoading: boolean;

  /**
   * Last error that occurred during save/load
   */
  error: Error | null;
}

/**
 * Interface for the Session Adapter (non-hook version)
 */
export interface SessionAdapter {
  /**
   * Save messages to session storage
   *
   * @param messages - UI messages to persist
   */
  save(messages: readonly Message[]): Promise<void>;

  /**
   * Load messages from session storage
   *
   * @returns Array of UI messages, or null if session not found
   */
  load(): Promise<readonly Message[] | null>;

  /**
   * Clear the session storage
   */
  clear(): Promise<void>;
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a session adapter for a given session and storage
 *
 * This factory creates a stateless adapter that can be used outside of React
 * components for session persistence operations.
 *
 * @param sessionId - Unique session identifier
 * @param storage - Storage implementation
 * @returns Session adapter interface
 *
 * @example
 * ```typescript
 * const storage = createFileSessionStorage('/path/to/sessions');
 * const adapter = createSessionAdapter('session-123', storage);
 *
 * // Save messages
 * await adapter.save(messages);
 *
 * // Load messages
 * const loadedMessages = await adapter.load();
 * ```
 */
export function createSessionAdapter(sessionId: string, storage: SessionStorage): SessionAdapter {
  return {
    async save(messages: readonly Message[]): Promise<void> {
      await storage.save(sessionId, toStoredMessages(messages));
    },

    async load(): Promise<readonly Message[] | null> {
      const sessionMessages = await storage.load(sessionId);
      if (!sessionMessages) {
        return null;
      }
      return toUIMessages(sessionMessages);
    },

    async clear(): Promise<void> {
      await storage.clear(sessionId);
    },
  };
}

function toStoredMessages(messages: readonly Message[]): SessionMessage[] {
  return messages.map(toSessionMessage);
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook that creates a session adapter for persistence
 *
 * Provides automatic synchronization between MessagesContext and
 * session storage, with support for auto-save and auto-load.
 *
 * @param options - Configuration options for the adapter
 * @returns The session adapter interface with save/load/clear methods
 *
 * @example
 * ```tsx
 * function ChatContainer() {
 *   const storage = useMemo(() => createFileSessionStorage('/sessions'), []);
 *   const { saveSession, loadSession, isSaving, error } = useSessionAdapter({
 *     sessionId: 'session-123',
 *     storage,
 *     autoSave: true,
 *     saveDebounceMs: 1000,
 *   });
 *
 *   // Messages will auto-save on change
 *   // Manual save available via saveSession()
 *
 *   return (
 *     <Box>
 *       {isSaving && <Text>Saving...</Text>}
 *       {error && <Text color="red">{error.message}</Text>}
 *       <MessageList />
 *     </Box>
 *   );
 * }
 * ```
 */
export function useSessionAdapter(options: UseSessionAdapterOptions): UseSessionAdapterReturn {
  const { sessionId, storage, autoSave = true, saveDebounceMs = 500, autoLoad = true } = options;

  // Get messages context
  const { messages, setMessages } = useMessages();

  // State refs for async operations
  const isSavingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const [error, setError] = useState<Error | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);
  const loadRequestRef = useRef(0);
  const activeLoadRef = useRef<Promise<void> | null>(null);
  const loadErrorRef = useRef<{ sessionId: string; storage: SessionStorage; error: Error } | null>(
    null
  );
  const activeSessionRef = useRef(sessionId);
  activeSessionRef.current = sessionId;
  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;
  const displayedSessionRef = useRef(sessionId);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queuedSavesRef = useRef(0);

  // Track previous messages for change detection
  const previousMessagesRef = useRef<readonly Message[]>([]);

  const queueSave = useCallback(
    (targetId: string, targetStorage: SessionStorage, targetMessages: readonly Message[]) => {
      // Convert now: queued writes retain their own session and immutable
      // message snapshot even if the UI switches while storage is busy.
      const snapshot = toStoredMessages(targetMessages);
      queuedSavesRef.current += 1;
      isSavingRef.current = true;
      setError(null);
      const operation = saveQueueRef.current.then(async () => {
        try {
          await targetStorage.save(targetId, snapshot);
        } catch (err) {
          const failure = err instanceof Error ? err : new Error(String(err));
          setError(failure);
          throw failure;
        } finally {
          queuedSavesRef.current -= 1;
          isSavingRef.current = queuedSavesRef.current > 0;
        }
      });
      // Keep the queue usable after failures while returning the rejecting
      // operation to explicit callers (session switching must await success).
      saveQueueRef.current = operation.catch(() => {});
      return operation;
    },
    []
  );

  /**
   * Save current messages to session storage
   */
  const saveSession = useCallback(async (): Promise<void> => {
    const cancelPendingSave = () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      pendingSaveRef.current = null;
    };
    cancelPendingSave();
    if (activeSessionRef.current === sessionId) {
      await activeLoadRef.current;
      const failedLoad = loadErrorRef.current;
      if (failedLoad?.sessionId === sessionId && failedLoad.storage === storage) {
        throw failedLoad.error;
      }
    }
    cancelPendingSave();
    await queueSave(
      sessionId,
      storage,
      activeSessionRef.current === sessionId ? messagesRef.current : messages
    );
  }, [sessionId, storage, messages, queueSave]);

  /**
   * Load messages from session storage
   */
  const loadSession = useCallback(async (): Promise<void> => {
    const request = ++loadRequestRef.current;
    let finishLoad!: () => void;
    const pendingLoad = new Promise<void>((resolve) => {
      finishLoad = resolve;
    });
    activeLoadRef.current = pendingLoad;
    loadErrorRef.current = null;
    isLoadingRef.current = true;
    setError(null);
    let initialMessages = messagesRef.current;
    if (displayedSessionRef.current !== sessionId) {
      displayedSessionRef.current = sessionId;
      initialMessages = [];
      messagesRef.current = initialMessages;
      previousMessagesRef.current = initialMessages;
      setMessages(initialMessages);
    }

    try {
      const adapter = createSessionAdapter(sessionId, storage);
      const loadedMessages = await adapter.load();

      if (request !== loadRequestRef.current || activeSessionRef.current !== sessionId) return;
      // A user may already have started the selected session while its disk
      // read was pending. Keep that newer transcript and persist its edits.
      if (messagesRef.current !== initialMessages) {
        previousMessagesRef.current = messagesRef.current;
        if (autoSaveRef.current) {
          void queueSave(sessionId, storage, messagesRef.current).catch(() => {});
        }
        return;
      }
      // Replace atomically, preserving message IDs, reasoning and token usage.
      // Missing/empty sessions must not retain the previous transcript.
      const nextMessages = loadedMessages ?? [];
      messagesRef.current = nextMessages;
      previousMessagesRef.current = nextMessages;
      setMessages(nextMessages);
    } catch (err) {
      if (request === loadRequestRef.current && activeSessionRef.current === sessionId) {
        const failure = err instanceof Error ? err : new Error(String(err));
        loadErrorRef.current = { sessionId, storage, error: failure };
        setError(failure);
      }
    } finally {
      if (request === loadRequestRef.current) isLoadingRef.current = false;
      if (activeLoadRef.current === pendingLoad) activeLoadRef.current = null;
      finishLoad();
    }
  }, [sessionId, storage, setMessages, queueSave]);

  /**
   * Clear session storage
   */
  const clearSession = useCallback(async (): Promise<void> => {
    try {
      const adapter = createSessionAdapter(sessionId, storage);
      await adapter.clear();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [sessionId, storage]);

  /**
   * Debounced save function
   */
  const debouncedSave = useCallback((): void => {
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    pendingSaveRef.current = saveSession;
    // The callback retains its original session ID when selection changes.
    saveTimeoutRef.current = setTimeout(() => {
      void saveSession().catch(() => {});
      saveTimeoutRef.current = null;
      pendingSaveRef.current = null;
    }, saveDebounceMs);
  }, [saveSession, saveDebounceMs]);

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad) {
      void loadSession();
    }
    return () => {
      loadRequestRef.current += 1;
    };
  }, [autoLoad, loadSession]);

  // Auto-save on message changes
  useEffect(() => {
    if (!autoSave) {
      return;
    }

    // Skip if messages haven't changed
    if (messages === previousMessagesRef.current) {
      return;
    }

    // Never save a previous session's render while the selected one loads.
    if (isLoadingRef.current) return;

    // Trigger debounced save
    if (messages.length > 0) {
      debouncedSave();
    }

    previousMessagesRef.current = messages;
  }, [autoSave, messages, debouncedSave]);

  // Flush edits to their original session before another session replaces them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: selection/storage changes must flush the previous scope's pending save.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        const pendingSave = pendingSaveRef.current;
        pendingSaveRef.current = null;
        void pendingSave?.().catch(() => {});
      }
    };
  }, [sessionId, storage]);

  return {
    saveSession,
    loadSession,
    clearSession,
    isSaving: isSavingRef.current,
    isLoading: isLoadingRef.current,
    error,
  };
}

// =============================================================================
// Memory Storage Implementation
// =============================================================================

/**
 * In-memory session storage implementation
 *
 * Useful for testing and temporary sessions that don't need
 * to persist across application restarts.
 *
 * @example
 * ```typescript
 * const storage = createMemorySessionStorage();
 * const adapter = createSessionAdapter('session-123', storage);
 *
 * await adapter.save(messages);
 * const loaded = await adapter.load();
 * ```
 */
export function createMemorySessionStorage(): SessionStorage {
  const sessions = new Map<string, readonly SessionMessage[]>();

  return {
    async save(sessionId: string, messages: readonly SessionMessage[]): Promise<void> {
      sessions.set(sessionId, [...messages]);
    },

    async load(sessionId: string): Promise<readonly SessionMessage[] | null> {
      const messages = sessions.get(sessionId);
      return messages ? [...messages] : null;
    },

    async clear(sessionId: string): Promise<void> {
      sessions.delete(sessionId);
    },
  };
}
