/**
 * useInputHistory Hook (T012)
 *
 * React hook for managing input history with navigation.
 * Supports navigating through previous entries and optional persistence.
 *
 * Storage Strategy:
 * 1. Try localStorage (works in some environments)
 * 2. Fall back to file-based storage (~/.vellum/input-history.json)
 *
 * @module @vellum/cli
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { useCallback, useRef, useState } from "react";

// =============================================================================
// Constants
// =============================================================================

/** Directory for Vellum user data */
const VELLUM_DIR = join(homedir(), ".vellum");

/** File path for input history persistence */
const HISTORY_FILE = join(VELLUM_DIR, "input-history.json");

// =============================================================================
// Storage Abstraction
// =============================================================================

/**
 * Detected storage backend type.
 */
type StorageBackend = "localStorage" | "file" | "none";

/**
 * Check if localStorage is available and functional.
 */
function isLocalStorageAvailable(): boolean {
  try {
    if (typeof globalThis.localStorage === "undefined") {
      return false;
    }
    // Test actual functionality (some environments have localStorage but it throws)
    const testKey = "__vellum_storage_test__";
    globalThis.localStorage.setItem(testKey, "test");
    globalThis.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the best available storage backend.
 * Caches result for performance.
 */
let cachedBackend: StorageBackend | null = null;

function getStorageBackend(): StorageBackend {
  if (cachedBackend !== null) {
    return cachedBackend;
  }

  // Try localStorage first
  if (isLocalStorageAvailable()) {
    cachedBackend = "localStorage";
    return cachedBackend;
  }

  // Fall back to file storage (CLI environment)
  try {
    // Ensure directory exists for file storage
    if (!existsSync(VELLUM_DIR)) {
      mkdirSync(VELLUM_DIR, { recursive: true });
    }
    cachedBackend = "file";
    return cachedBackend;
  } catch {
    // No storage available
    cachedBackend = "none";
    return cachedBackend;
  }
}

// =============================================================================
// File Storage Helpers
// =============================================================================

/**
 * History file structure for multi-key support.
 */
interface HistoryFile {
  [key: string]: string[];
}

/**
 * Read all history data from file.
 */
function readHistoryFile(): HistoryFile {
  try {
    if (!existsSync(HISTORY_FILE)) {
      return {};
    }
    const content = readFileSync(HISTORY_FILE, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as HistoryFile;
    }
    return {};
  } catch {
    // Corrupted file or parse error - return empty
    return {};
  }
}

/**
 * Write history data to file.
 * Ensures directory exists and handles errors gracefully.
 */
function writeHistoryFile(data: HistoryFile): boolean {
  try {
    const dir = dirname(HISTORY_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch {
    // Write failed - log but don't crash
    return false;
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the useInputHistory hook.
 */
export interface UseInputHistoryOptions {
  /** Maximum number of history entries to keep (default: 100) */
  maxItems?: number;
  /** Storage key for persistence (if provided, history will be persisted) */
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

// =============================================================================
// Storage Operations
// =============================================================================

/**
 * Load history from storage (localStorage or file-based).
 */
function loadFromStorage(key: string): string[] {
  const backend = getStorageBackend();

  try {
    if (backend === "localStorage") {
      const stored = globalThis.localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === "string");
        }
      }
    } else if (backend === "file") {
      const historyData = readHistoryFile();
      const entries = historyData[key];
      if (Array.isArray(entries)) {
        return entries.filter((item): item is string => typeof item === "string");
      }
    }
  } catch {
    // Ignore storage errors - return empty array
  }

  return [];
}

/**
 * Save history to storage (localStorage or file-based).
 */
function saveToStorage(key: string, history: string[]): void {
  const backend = getStorageBackend();

  try {
    if (backend === "localStorage") {
      globalThis.localStorage.setItem(key, JSON.stringify(history));
    } else if (backend === "file") {
      const historyData = readHistoryFile();
      historyData[key] = history;
      writeHistoryFile(historyData);
    }
    // backend === "none": silently do nothing
  } catch {
    // Ignore storage errors - history won't persist but app continues
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
