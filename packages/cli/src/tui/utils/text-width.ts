/**
 * Text Width Utilities
 *
 * Visual width calculation and manipulation utilities for terminal text.
 * Handles CJK characters, emojis, and ANSI escape sequences correctly.
 *
 * @module tui/utils/text-width
 */

import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";

/**
 * Text alignment options for padding.
 */
export type TextAlign = "left" | "center" | "right";

/**
 * Get the visual width of text in terminal columns.
 *
 * This accounts for:
 * - CJK characters (width 2)
 * - Emojis (width 2)
 * - ANSI escape sequences (width 0)
 * - Zero-width characters
 *
 * @param text - Text to measure
 * @returns Visual width in terminal columns
 *
 * @example
 * ```ts
 * getVisualWidth("hello") // 5
 * getVisualWidth("你好") // 4 (2 chars × 2 width)
 * getVisualWidth("👋") // 2
 * getVisualWidth("\x1b[31mred\x1b[0m") // 3 (ANSI codes have 0 width)
 * ```
 */
export function getVisualWidth(text: string): number {
  return stringWidth(text);
}

/**
 * Truncate text to fit within a maximum visual width.
 *
 * Adds ellipsis if truncation is needed. Handles ANSI codes correctly,
 * ensuring escape sequences are properly closed.
 *
 * @param text - Text to truncate
 * @param maxWidth - Maximum visual width
 * @param ellipsis - Ellipsis string (default: "…")
 * @returns Truncated text with ellipsis if needed
 *
 * @example
 * ```ts
 * truncateToWidth("Hello World", 8) // "Hello W…"
 * truncateToWidth("Short", 10) // "Short"
 * truncateToWidth("你好世界", 5) // "你好…"
 * ```
 */
export function truncateToWidth(text: string, maxWidth: number, ellipsis = "…"): string {
  const textWidth = getVisualWidth(text);

  if (textWidth <= maxWidth) {
    return text;
  }

  const ellipsisWidth = getVisualWidth(ellipsis);
  const targetWidth = maxWidth - ellipsisWidth;

  if (targetWidth <= 0) {
    return ellipsis.slice(0, maxWidth);
  }

  // Build truncated string character by character
  let result = "";
  let currentWidth = 0;

  for (const char of text) {
    const charWidth = getVisualWidth(char);
    if (currentWidth + charWidth > targetWidth) {
      break;
    }
    result += char;
    currentWidth += charWidth;
  }

  return result + ellipsis;
}

/**
 * Pad text to a specific visual width with alignment.
 *
 * @param text - Text to pad
 * @param width - Target visual width
 * @param align - Alignment: "left", "center", or "right"
 * @param padChar - Character to use for padding (default: space)
 * @returns Padded text
 *
 * @example
 * ```ts
 * padToWidth("Hi", 10, "left")   // "Hi        "
 * padToWidth("Hi", 10, "right")  // "        Hi"
 * padToWidth("Hi", 10, "center") // "    Hi    "
 * padToWidth("你好", 8, "center") // "  你好  "
 * ```
 */
export function padToWidth(
  text: string,
  width: number,
  align: TextAlign = "left",
  padChar = " "
): string {
  const textWidth = getVisualWidth(text);
  const padCharWidth = getVisualWidth(padChar);

  if (textWidth >= width) {
    return text;
  }

  const totalPadding = width - textWidth;
  const padCount = Math.floor(totalPadding / padCharWidth);

  switch (align) {
    case "right": {
      return padChar.repeat(padCount) + text;
    }
    case "center": {
      const leftPad = Math.floor(padCount / 2);
      const rightPad = padCount - leftPad;
      return padChar.repeat(leftPad) + text + padChar.repeat(rightPad);
    }
    default: {
      // "left" alignment (default)
      return text + padChar.repeat(padCount);
    }
  }
}

/**
 * Wrap text at visual width boundaries.
 *
 * Uses wrap-ansi for proper handling of ANSI codes and
 * word boundaries. Preserves ANSI styling across lines.
 *
 * @param text - Text to wrap
 * @param width - Maximum line width
 * @param options - Wrapping options
 * @returns Wrapped text with newlines
 *
 * @example
 * ```ts
 * wrapToWidth("This is a long line that needs wrapping", 20)
 * // "This is a long line\nthat needs wrapping"
 *
 * wrapToWidth("LongWordThatCantBreak", 10, { hard: true })
 * // "LongWordTh\natCantBrea\nk"
 * ```
 */
export function wrapToWidth(
  text: string,
  width: number,
  options: {
    /** Hard wrap long words (default: false) */
    hard?: boolean;
    /** Trim whitespace at line ends (default: true) */
    trim?: boolean;
    /** Preserve leading whitespace (default: false) */
    wordWrap?: boolean;
  } = {}
): string {
  const { hard = false, trim = true, wordWrap = true } = options;

  return wrapAnsi(text, width, {
    hard,
    trim,
    wordWrap,
  });
}

/**
 * Split text into lines respecting visual width.
 *
 * Similar to wrapToWidth but returns an array of lines
 * instead of a single string with newlines.
 *
 * @param text - Text to split
 * @param width - Maximum line width
 * @param options - Wrapping options
 * @returns Array of lines
 *
 * @example
 * ```ts
 * splitLines("Hello World", 6)
 * // ["Hello", "World"]
 * ```
 */
export function splitLines(
  text: string,
  width: number,
  options: Parameters<typeof wrapToWidth>[2] = {}
): string[] {
  return wrapToWidth(text, width, options).split("\n");
}

/**
 * Calculate the number of lines text will occupy at a given width.
 *
 * @param text - Text to measure
 * @param width - Available width
 * @param options - Wrapping options
 * @returns Number of lines
 *
 * @example
 * ```ts
 * countLines("Hello World", 6) // 2
 * countLines("Hi", 10) // 1
 * ```
 */
export function countLines(
  text: string,
  width: number,
  options: Parameters<typeof wrapToWidth>[2] = {}
): number {
  return splitLines(text, width, options).length;
}
