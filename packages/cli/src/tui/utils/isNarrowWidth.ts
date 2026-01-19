/**
 * Narrow Width Detection Utility
 *
 * Simple utility for detecting narrow terminal widths.
 * Used for responsive layout decisions throughout the TUI.
 *
 * @module tui/utils/isNarrowWidth
 */

import { getTerminalWidth, NARROW_WIDTH_BREAKPOINT } from "./ui-sizing.js";

/**
 * Get the narrow width breakpoint constant.
 *
 * @returns The narrow width breakpoint (80 columns)
 *
 * @example
 * ```ts
 * const breakpoint = getNarrowBreakpoint();
 * console.log(`Narrow mode below ${breakpoint} columns`);
 * ```
 */
export function getNarrowBreakpoint(): number {
  return NARROW_WIDTH_BREAKPOINT;
}

/**
 * Check if the terminal is in narrow width mode.
 *
 * Narrow mode is defined as terminal width <= 80 columns.
 * In narrow mode, UI elements should be more compact and
 * non-essential elements may be hidden.
 *
 * @param width - Terminal width to check (defaults to current terminal)
 * @returns True if terminal is narrow (<= 80 columns)
 *
 * @example
 * ```ts
 * if (isNarrowWidth()) {
 *   // Render compact layout
 * } else {
 *   // Render full layout with sidebar
 * }
 *
 * // Or with explicit width
 * const narrow = isNarrowWidth(60); // true
 * ```
 */
export function isNarrowWidth(width?: number): boolean {
  const terminalWidth = width ?? getTerminalWidth();
  return terminalWidth <= NARROW_WIDTH_BREAKPOINT;
}
