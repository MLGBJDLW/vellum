/**
 * Clipboard Service
 *
 * Provides cross-platform clipboard access with error handling
 * for environments that don't support clipboard operations
 * (e.g., WSL, SSH sessions, headless servers).
 *
 * @module tui/services/clipboard
 */

import clipboard from "clipboardy";

// =============================================================================
// Types
// =============================================================================

/**
 * Clipboard history entry
 */
export interface ClipboardHistoryEntry {
  /** The copied text content */
  readonly text: string;
  /** Timestamp when the copy occurred */
  readonly timestamp: number;
  /** Optional label describing the content */
  readonly label?: string;
}

/**
 * Result of a clipboard operation
 */
export type ClipboardResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// =============================================================================
// Configuration
// =============================================================================

/** Maximum number of history entries to keep */
const MAX_HISTORY_SIZE = 10;

// =============================================================================
// Module State
// =============================================================================

/** Clipboard history storage */
const history: ClipboardHistoryEntry[] = [];

/** Cached support status (null = not yet checked) */
let supportedCache: boolean | null = null;

// =============================================================================
// Support Detection
// =============================================================================

/**
 * Check if clipboard operations are supported in the current environment.
 *
 * Clipboard may not be available in:
 * - WSL without X server or clipboard integration
 * - SSH sessions without forwarding
 * - Headless servers
 * - Docker containers without display
 *
 * @returns true if clipboard operations are likely to work
 */
export function isSupported(): boolean {
  if (supportedCache !== null) {
    return supportedCache;
  }

  // Check environment variables that indicate lack of display
  const noDisplay =
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY &&
    process.platform !== "win32" &&
    process.platform !== "darwin";

  // Check for WSL without Windows clipboard access
  const isWsl =
    process.platform === "linux" &&
    (process.env.WSL_DISTRO_NAME !== undefined || process.env.WSL_INTEROP !== undefined);

  // WSL usually has access to clip.exe/powershell.exe for clipboard
  // so we'll optimistically allow it
  if (isWsl) {
    supportedCache = true;
    return true;
  }

  // No display on Linux = likely no clipboard
  if (noDisplay) {
    supportedCache = false;
    return false;
  }

  // Windows and macOS generally support clipboard
  supportedCache = true;
  return true;
}

/**
 * Reset the cached support status.
 * Useful for testing or when environment changes.
 */
export function resetSupportCache(): void {
  supportedCache = null;
}

// =============================================================================
// Core Operations
// =============================================================================

/**
 * Copy text to the system clipboard.
 *
 * @param text - The text to copy
 * @param label - Optional label for history (e.g., "code block", "file content")
 * @returns Result indicating success or failure with error message
 *
 * @example
 * ```typescript
 * const result = await copy("Hello, World!", "greeting");
 * if (result.success) {
 *   console.log("Copied successfully");
 * } else {
 *   console.error("Copy failed:", result.error);
 * }
 * ```
 */
export async function copy(text: string, label?: string): Promise<ClipboardResult> {
  if (!text) {
    return { success: false, error: "Nothing to copy" };
  }

  if (!isSupported()) {
    return {
      success: false,
      error: "Clipboard not supported in this environment",
    };
  }

  try {
    await clipboard.write(text);

    // Add to history
    addToHistory(text, label);

    return { success: true, data: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Provide helpful error messages for common issues
    if (message.includes("xsel") || message.includes("xclip")) {
      return {
        success: false,
        error: "Clipboard requires xsel or xclip on Linux. Install with: sudo apt install xclip",
      };
    }

    return { success: false, error: `Copy failed: ${message}` };
  }
}

/**
 * Synchronous copy operation (best-effort).
 * Falls back gracefully if async fails.
 *
 * @param text - The text to copy
 * @param label - Optional label for history
 * @returns true if copy likely succeeded
 */
export function copySync(text: string, label?: string): boolean {
  if (!text || !isSupported()) {
    return false;
  }

  try {
    clipboard.writeSync(text);
    addToHistory(text, label);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read text from the system clipboard.
 *
 * @returns Result with clipboard content or error
 *
 * @example
 * ```typescript
 * const result = await paste();
 * if (result.success) {
 *   console.log("Clipboard content:", result.data);
 * }
 * ```
 */
export async function paste(): Promise<ClipboardResult<string>> {
  if (!isSupported()) {
    return {
      success: false,
      error: "Clipboard not supported in this environment",
    };
  }

  try {
    const text = await clipboard.read();
    return { success: true, data: text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Paste failed: ${message}` };
  }
}

/**
 * Synchronous paste operation.
 *
 * @returns Clipboard content or empty string on failure
 */
export function pasteSync(): string {
  if (!isSupported()) {
    return "";
  }

  try {
    return clipboard.readSync();
  } catch {
    return "";
  }
}

// =============================================================================
// History Management
// =============================================================================

/**
 * Add an entry to the clipboard history.
 *
 * @param text - The copied text
 * @param label - Optional descriptive label
 */
function addToHistory(text: string, label?: string): void {
  const entry: ClipboardHistoryEntry = {
    text,
    timestamp: Date.now(),
    label,
  };

  // Add to front (most recent first)
  history.unshift(entry);

  // Trim to max size
  if (history.length > MAX_HISTORY_SIZE) {
    history.length = MAX_HISTORY_SIZE;
  }
}

/**
 * Get the clipboard history.
 *
 * @param limit - Maximum entries to return (default: all)
 * @returns Array of history entries, most recent first
 */
export function getHistory(limit?: number): readonly ClipboardHistoryEntry[] {
  if (limit !== undefined && limit > 0) {
    return history.slice(0, limit);
  }
  return [...history];
}

/**
 * Get the most recent clipboard entry.
 *
 * @returns The most recent entry or undefined if history is empty
 */
export function getLastEntry(): ClipboardHistoryEntry | undefined {
  return history[0];
}

/**
 * Clear the clipboard history.
 */
export function clearHistory(): void {
  history.length = 0;
}

/**
 * Get the number of entries in history.
 */
export function getHistorySize(): number {
  return history.length;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Copy text and return a user-friendly status message.
 *
 * @param text - Text to copy
 * @param description - What was copied (for the message)
 * @returns Status message suitable for display
 */
export async function copyWithMessage(
  text: string,
  description: string
): Promise<{ success: boolean; message: string }> {
  const result = await copy(text, description);

  if (result.success) {
    return {
      success: true,
      message: `📋 Copied ${description} (${text.length} chars)`,
    };
  }

  return {
    success: false,
    message: `❌ ${result.error}`,
  };
}

// =============================================================================
// Default Export
// =============================================================================

/**
 * Clipboard service object for convenient access
 */
export const clipboardService = {
  copy,
  copySync,
  paste,
  pasteSync,
  isSupported,
  getHistory,
  getLastEntry,
  clearHistory,
  getHistorySize,
  copyWithMessage,
  resetSupportCache,
} as const;

export default clipboardService;
