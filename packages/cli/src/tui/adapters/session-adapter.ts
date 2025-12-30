/**
 * Session Persistence Adapter
 *
 * Provides bidirectional synchronization between TUI MessagesContext
 * and @vellum/core session messages for persistence.
 *
 * @module tui/adapters/session-adapter
 */

import type { SessionMessage } from "@vellum/core";
import { useCallback, useEffect, useRef } from "react";
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
      const sessionMessages = messages
        .filter((msg): msg is Message => msg.role !== "tool")
        .map((msg) => toSessionMessage(msg));
      await storage.save(sessionId, sessionMessages);
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
  const { messages, addMessage, clearMessages } = useMessages();

  // State refs for async operations
  const isSavingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const errorRef = useRef<Error | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track previous messages for change detection
  const previousMessagesRef = useRef<readonly Message[]>([]);

  /**
   * Save current messages to session storage
   */
  const saveSession = useCallback(async (): Promise<void> => {
    if (isSavingRef.current) {
      return;
    }

    isSavingRef.current = true;
    errorRef.current = null;

    try {
      const adapter = createSessionAdapter(sessionId, storage);
      await adapter.save(messages);
    } catch (err) {
      errorRef.current = err instanceof Error ? err : new Error(String(err));
    } finally {
      isSavingRef.current = false;
    }
  }, [sessionId, storage, messages]);

  /**
   * Load messages from session storage
   */
  const loadSession = useCallback(async (): Promise<void> => {
    if (isLoadingRef.current) {
      return;
    }

    isLoadingRef.current = true;
    errorRef.current = null;

    try {
      const adapter = createSessionAdapter(sessionId, storage);
      const loadedMessages = await adapter.load();

      if (loadedMessages && loadedMessages.length > 0) {
        // Clear existing messages first
        clearMessages();

        // Add loaded messages
        for (const msg of loadedMessages) {
          addMessage({
            role: msg.role,
            content: msg.content,
            isStreaming: msg.isStreaming,
            toolCalls: msg.toolCalls,
          });
        }

        // Update previous messages ref to avoid triggering auto-save
        previousMessagesRef.current = loadedMessages;
      }
    } catch (err) {
      errorRef.current = err instanceof Error ? err : new Error(String(err));
    } finally {
      isLoadingRef.current = false;
    }
  }, [sessionId, storage, clearMessages, addMessage]);

  /**
   * Clear session storage
   */
  const clearSession = useCallback(async (): Promise<void> => {
    try {
      const adapter = createSessionAdapter(sessionId, storage);
      await adapter.clear();
    } catch (err) {
      errorRef.current = err instanceof Error ? err : new Error(String(err));
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

    // Set new timeout
    saveTimeoutRef.current = setTimeout(() => {
      void saveSession();
      saveTimeoutRef.current = null;
    }, saveDebounceMs);
  }, [saveSession, saveDebounceMs]);

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad) {
      void loadSession();
    }
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

    // Skip if this is the initial load (empty to loaded)
    if (previousMessagesRef.current.length === 0 && messages.length > 0 && isLoadingRef.current) {
      previousMessagesRef.current = messages;
      return;
    }

    // Trigger debounced save
    if (messages.length > 0) {
      debouncedSave();
    }

    previousMessagesRef.current = messages;
  }, [autoSave, messages, debouncedSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    saveSession,
    loadSession,
    clearSession,
    isSaving: isSavingRef.current,
    isLoading: isLoadingRef.current,
    error: errorRef.current,
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
