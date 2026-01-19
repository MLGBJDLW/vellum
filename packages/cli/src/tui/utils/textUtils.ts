/**
 * Text Utilities (T002 Hardening)
 *
 * Utility functions for text manipulation in the TUI.
 * Provides hard-wrapping to prevent unpredictable terminal soft-wrapping.
 *
 * @module tui/utils/textUtils
 */

import stringWidth from "string-width";

/**
 * Hard-wrap text to prevent terminal soft-wrapping.
 * Forces newlines at column boundaries so terminal doesn't wrap unpredictably.
 *
 * Uses string-width for accurate CJK/Emoji/ANSI handling.
 * This is a simpler implementation that doesn't require wrap-ansi as a direct dependency.
 *
 * @param text - The text to wrap
 * @param columns - Maximum column width
 * @returns Text with hard line breaks inserted
 */
export function hardWrap(text: string, columns: number): string {
  if (!text || columns <= 0) {
    return text;
  }

  const lines = text.split("\n");
  const wrappedLines: string[] = [];

  for (const line of lines) {
    if (stringWidth(line) <= columns) {
      wrappedLines.push(line);
      continue;
    }

    // Need to hard-wrap this line
    let remaining = line;
    while (remaining.length > 0) {
      const segment = truncateToWidth(remaining, columns);
      wrappedLines.push(segment);
      remaining = remaining.slice(segment.length);

      // Safety: prevent infinite loop if no progress
      if (segment.length === 0 && remaining.length > 0) {
        // Force at least one character if we're stuck
        const firstChar = remaining[0] ?? "";
        wrappedLines.push(firstChar);
        remaining = remaining.slice(1);
      }
    }
  }

  return wrappedLines.join("\n");
}

/**
 * Truncate a string to fit within a specified display width.
 * Uses string-width for accurate width calculation.
 *
 * @param str - The string to truncate
 * @param maxWidth - Maximum display width
 * @returns Truncated string that fits within maxWidth
 */
function truncateToWidth(str: string, maxWidth: number): string {
  if (stringWidth(str) <= maxWidth) {
    return str;
  }

  // Binary search for the right length
  let low = 0;
  let high = str.length;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const slice = str.slice(0, mid);
    if (stringWidth(slice) <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return str.slice(0, low);
}

/**
 * Truncate text to fit within a maximum display width with ellipsis.
 * Uses string-width for accurate CJK/Emoji/ANSI handling.
 *
 * @param text - The text to truncate
 * @param maxWidth - Maximum display width in terminal cells
 * @param ellipsis - Ellipsis character (default: "…")
 * @returns Truncated text that fits within maxWidth cells
 */
export function truncateToDisplayWidth(
  text: string,
  maxWidth: number,
  ellipsis: string = "…"
): string {
  if (!text || maxWidth <= 0) return "";

  const textWidth = stringWidth(text);
  if (textWidth <= maxWidth) return text;

  const ellipsisWidth = stringWidth(ellipsis);
  const targetWidth = maxWidth - ellipsisWidth;

  if (targetWidth <= 0) return ellipsis.slice(0, maxWidth);

  // Use existing truncateToWidth for the main content
  const truncated = truncateToWidth(text, targetWidth);
  return truncated + ellipsis;
}
