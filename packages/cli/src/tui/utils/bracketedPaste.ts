/**
 * Bracketed Paste Mode Utilities
 *
 * Provides functions to enable/disable bracketed paste mode in terminals.
 * When enabled, pasted text is wrapped with escape sequences that allow
 * applications to distinguish between typed and pasted text.
 *
 * @module tui/utils/bracketedPaste
 */

import { getActiveStdout } from "../buffered-stdout.js";

// =============================================================================
// Constants
// =============================================================================

/** ANSI escape sequence to enable bracketed paste mode */
const ENABLE_BRACKETED_PASTE = "\x1b[?2004h";

/** ANSI escape sequence to disable bracketed paste mode */
const DISABLE_BRACKETED_PASTE = "\x1b[?2004l";

/** Escape sequence sent by terminal at start of pasted content */
export const PASTE_START = "\x1b[200~";

/** Escape sequence sent by terminal at end of pasted content */
export const PASTE_END = "\x1b[201~";

// =============================================================================
// Functions
// =============================================================================

/**
 * Enable bracketed paste mode.
 *
 * When enabled, the terminal wraps pasted content with escape sequences:
 * - Start: ESC [ 200 ~
 * - End: ESC [ 201 ~
 *
 * This allows applications to distinguish between typed and pasted text.
 */
export function enableBracketedPaste(): void {
  getActiveStdout().write(ENABLE_BRACKETED_PASTE);
}

/**
 * Disable bracketed paste mode.
 *
 * Should be called when the application exits to restore terminal state.
 */
export function disableBracketedPaste(): void {
  getActiveStdout().write(DISABLE_BRACKETED_PASTE);
}

/**
 * Check if a string contains the paste start sequence.
 */
export function hasPasteStart(data: string): boolean {
  return data.includes(PASTE_START);
}

/**
 * Check if a string contains the paste end sequence.
 */
export function hasPasteEnd(data: string): boolean {
  return data.includes(PASTE_END);
}

/**
 * Extract pasted content from bracketed paste sequences.
 *
 * @param data - Raw input data that may contain paste sequences
 * @returns Object containing the extracted paste content and whether extraction was complete
 */
export function extractPasteContent(data: string): {
  content: string;
  complete: boolean;
  remaining: string;
} {
  const startIdx = data.indexOf(PASTE_START);
  if (startIdx === -1) {
    return { content: "", complete: false, remaining: data };
  }

  const contentStart = startIdx + PASTE_START.length;
  const endIdx = data.indexOf(PASTE_END, contentStart);

  if (endIdx === -1) {
    // Paste sequence started but not ended - partial paste
    return {
      content: data.slice(contentStart),
      complete: false,
      remaining: data.slice(0, startIdx),
    };
  }

  // Complete paste sequence found
  const pastedContent = data.slice(contentStart, endIdx);
  const beforePaste = data.slice(0, startIdx);
  const afterPaste = data.slice(endIdx + PASTE_END.length);

  return {
    content: pastedContent,
    complete: true,
    remaining: beforePaste + afterPaste,
  };
}
