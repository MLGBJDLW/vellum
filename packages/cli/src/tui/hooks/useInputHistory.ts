/**
 * useInputHistory Hook (T012)
 *
 * React hook for managing input history with navigation.
 * Supports navigating through previous entries and optional persistence.
 *
 * @module @vellum/cli
 */

import { useCallback, useRef, useState } from "react";

/**
 * Options for the useInputHistory hook.
 */
export interface UseInputHistoryOptions {
  /** Maximum number of history entries to keep (default: 100) */
  maxItems?: number;
  /** localStorage key for persistence (if provided, history will be persisted) */
  persistKey?: string;
}

/**
 * Return value of useInputHistory hook.
 */
export interface UseInputHistoryReturn {
  /** Read-only array of history entries (newest last) */
  history: readonly string[];
  /** Current navigation index (-1 when not navigating) */
  currentIndex: number;
  /** Add a new entry to history */
  addToHistory: (entry: string) => void;
  /** Navigate up (older) or down (newer) through history */
  navigateHistory: (direction: "up" | "down") => string | null;
  /** Clear all history entries */
  clearHistory: () => void;
  /** Get the current entry at navigation index */
  getCurrentEntry: () => string | null;
}

/**
 * Load history from storage.
 */
function loadFromStorage(key: string): string[] {
  try {
    if (typeof globalThis.localStorage !== "undefined") {
      const stored = globalThis.localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === "string");
        }
      }
    }
  } catch {
    // Ignore storage errors
  }
  return [];
}

/**
 * Save history to storage.
 */
function saveToStorage(key: string, history: string[]): void {
  try {
    if (typeof globalThis.localStorage !== "undefined") {
      globalThis.localStorage.setItem(key, JSON.stringify(history));
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook for managing input history with navigation.
 *
 * Provides functionality for storing command history, navigating through
 * previous entries with up/down arrows, and optional persistence.
 *
 * @param options - Configuration options
 * @returns History state and manipulation functions
 *
 * @example
 * ```tsx
 * function InputComponent() {
 *   const [input, setInput] = useState('');
 *   const { navigateHistory, addToHistory } = useInputHistory({ maxItems: 50 });
 *
 *   const handleKeyDown = (key: string) => {
 *     if (key === 'up') {
 *       const prev = navigateHistory('up');
 *       if (prev !== null) setInput(prev);
 *     } else if (key === 'down') {
 *       const next = navigateHistory('down');
 *       if (next !== null) setInput(next);
 *     }
 *   };
 *
 *   const handleSubmit = () => {
 *     if (input.trim()) {
 *       addToHistory(input);
 *       // process input...
 *       setInput('');
 *     }
 *   };
 *
 *   return <TextInput value={input} onSubmit={handleSubmit} />;
 * }
 * ```
 */
export function useInputHistory(options: UseInputHistoryOptions = {}): UseInputHistoryReturn {
  const { maxItems = 100, persistKey } = options;

  // Initialize history from storage if persistKey provided
  const [history, setHistory] = useState<string[]>(() => {
    if (persistKey) {
      return loadFromStorage(persistKey);
    }
    return [];
  });

  // Current navigation index: -1 means not navigating (at the "new entry" position)
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Ref to track the temp entry when user starts navigating
  const tempEntryRef = useRef<string>("");

  /**
   * Add a new entry to history.
   * Skips if entry is empty or same as the last entry (no consecutive duplicates).
   * Resets navigation index.
   */
  const addToHistory = useCallback(
    (entry: string) => {
      const trimmed = entry.trim();
      if (!trimmed) {
        return;
      }

      setHistory((prev) => {
        // Skip if same as last entry (no consecutive duplicates)
        if (prev.length > 0 && prev[prev.length - 1] === trimmed) {
          return prev;
        }

        const newHistory = [...prev, trimmed];

        // Trim to maxItems if exceeded
        const trimmedHistory =
          newHistory.length > maxItems ? newHistory.slice(-maxItems) : newHistory;

        // Persist if key provided
        if (persistKey) {
          saveToStorage(persistKey, trimmedHistory);
        }

        return trimmedHistory;
      });

      // Reset navigation index
      setCurrentIndex(-1);
      tempEntryRef.current = "";
    },
    [maxItems, persistKey]
  );

  /**
   * Navigate through history.
   * 'up' moves to older entries, 'down' moves to newer entries.
   * Returns the entry at the new position, or null if at boundary.
   */
  const navigateHistory = useCallback(
    (direction: "up" | "down"): string | null => {
      if (history.length === 0) {
        return null;
      }

      let newIndex: number;

      if (direction === "up") {
        // Moving to older entries
        if (currentIndex === -1) {
          // Start navigating from the most recent entry
          newIndex = history.length - 1;
        } else if (currentIndex > 0) {
          // Move to older entry
          newIndex = currentIndex - 1;
        } else {
          // Already at the oldest entry
          return null;
        }
      } else {
        // direction === 'down'
        // Moving to newer entries
        if (currentIndex === -1) {
          // Not navigating, nothing to do
          return null;
        }
        if (currentIndex < history.length - 1) {
          // Move to newer entry
          newIndex = currentIndex + 1;
        } else {
          // At the newest entry, return to "new entry" position
          setCurrentIndex(-1);
          return tempEntryRef.current || null;
        }
      }

      setCurrentIndex(newIndex);
      return history[newIndex] ?? null;
    },
    [history, currentIndex]
  );

  /**
   * Clear all history entries.
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
    tempEntryRef.current = "";

    if (persistKey) {
      saveToStorage(persistKey, []);
    }
  }, [persistKey]);

  /**
   * Get the current entry at navigation index.
   * Returns null if not navigating or history is empty.
   */
  const getCurrentEntry = useCallback((): string | null => {
    if (currentIndex === -1 || history.length === 0) {
      return null;
    }
    return history[currentIndex] ?? null;
  }, [history, currentIndex]);

  return {
    history,
    currentIndex,
    addToHistory,
    navigateHistory,
    clearHistory,
    getCurrentEntry,
  };
}
