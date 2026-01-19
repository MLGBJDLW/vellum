/**
 * Terminal UI Sizing Utilities
 *
 * Centralized utilities for calculating terminal dimensions and responsive layouts.
 * Ported from Gemini CLI patterns for consistent responsive behavior.
 *
 * @module tui/utils/ui-sizing
 */

/** Default terminal width when stdout is not a TTY */
const DEFAULT_TERMINAL_WIDTH = 80;

/** Default terminal height when stdout is not a TTY */
const DEFAULT_TERMINAL_HEIGHT = 24;

/** Minimum width for narrow terminal detection */
const NARROW_WIDTH_BREAKPOINT = 80;

/** Maximum width for responsive scaling (beyond this, use fixed percentage) */
const WIDE_WIDTH_BREAKPOINT = 132;

/** Content width percentage at narrow width (98%) */
const NARROW_CONTENT_RATIO = 0.98;

/** Content width percentage at wide width (90%) */
const WIDE_CONTENT_RATIO = 0.9;

/**
 * Linear interpolation between two values.
 *
 * @param min - Minimum value (at t=0)
 * @param max - Maximum value (at t=1)
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated value
 *
 * @example
 * ```ts
 * lerp(0, 100, 0.5) // 50
 * lerp(10, 20, 0.25) // 12.5
 * ```
 */
export function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

/**
 * Clamp a value to a specified range.
 *
 * @param value - Value to clamp
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Clamped value
 *
 * @example
 * ```ts
 * clamp(150, 0, 100) // 100
 * clamp(-10, 0, 100) // 0
 * clamp(50, 0, 100) // 50
 * ```
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Get the current terminal width.
 *
 * @param fallback - Fallback width if terminal size cannot be determined
 * @returns Terminal width in columns
 *
 * @example
 * ```ts
 * const width = getTerminalWidth();
 * console.log(`Terminal is ${width} columns wide`);
 * ```
 */
export function getTerminalWidth(fallback = DEFAULT_TERMINAL_WIDTH): number {
  return process.stdout.columns ?? fallback;
}

/**
 * Get the current terminal height.
 *
 * @param fallback - Fallback height if terminal size cannot be determined
 * @returns Terminal height in rows
 *
 * @example
 * ```ts
 * const height = getTerminalHeight();
 * console.log(`Terminal is ${height} rows tall`);
 * ```
 */
export function getTerminalHeight(fallback = DEFAULT_TERMINAL_HEIGHT): number {
  return process.stdout.rows ?? fallback;
}

/**
 * Calculate the maximum content width for responsive layouts.
 *
 * Uses linear interpolation between narrow and wide breakpoints:
 * - At 80 columns: 98% width (maximize space in small terminals)
 * - At 132 columns: 90% width (comfortable reading width)
 * - Below 80: Use full available width minus minimal padding
 * - Above 132: Cap at 90% of terminal width
 *
 * @param terminalWidth - Terminal width (defaults to current terminal)
 * @returns Maximum content width in columns
 *
 * @example
 * ```ts
 * // In a 100-column terminal
 * const maxWidth = getMaxContentWidth(100);
 * // Returns ~94 columns (interpolated between 98% and 90%)
 * ```
 */
export function getMaxContentWidth(terminalWidth?: number): number {
  const width = terminalWidth ?? getTerminalWidth();

  // Below narrow breakpoint: use almost full width
  if (width <= NARROW_WIDTH_BREAKPOINT) {
    return Math.floor(width * NARROW_CONTENT_RATIO);
  }

  // Above wide breakpoint: cap at wide ratio
  if (width >= WIDE_WIDTH_BREAKPOINT) {
    return Math.floor(width * WIDE_CONTENT_RATIO);
  }

  // Interpolate between breakpoints
  const t = (width - NARROW_WIDTH_BREAKPOINT) / (WIDE_WIDTH_BREAKPOINT - NARROW_WIDTH_BREAKPOINT);
  const ratio = lerp(NARROW_CONTENT_RATIO, WIDE_CONTENT_RATIO, t);

  return Math.floor(width * ratio);
}

/**
 * Calculate content padding for centered layouts.
 *
 * @param terminalWidth - Terminal width (defaults to current terminal)
 * @returns Object with left and right padding values
 *
 * @example
 * ```ts
 * const { left, right } = getContentPadding(100);
 * // For centered content at 94 cols in 100 col terminal:
 * // left = 3, right = 3
 * ```
 */
export function getContentPadding(terminalWidth?: number): {
  left: number;
  right: number;
} {
  const width = terminalWidth ?? getTerminalWidth();
  const contentWidth = getMaxContentWidth(width);
  const totalPadding = width - contentWidth;

  // Distribute padding evenly, with any remainder going to the right
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;

  return {
    left: leftPadding,
    right: rightPadding,
  };
}

/**
 * Get terminal dimensions as an object.
 *
 * @returns Object with width and height
 *
 * @example
 * ```ts
 * const { width, height } = getTerminalSize();
 * ```
 */
export function getTerminalSize(): { width: number; height: number } {
  return {
    width: getTerminalWidth(),
    height: getTerminalHeight(),
  };
}

// Re-export constants for external use
export {
  DEFAULT_TERMINAL_HEIGHT,
  DEFAULT_TERMINAL_WIDTH,
  NARROW_CONTENT_RATIO,
  NARROW_WIDTH_BREAKPOINT,
  WIDE_CONTENT_RATIO,
  WIDE_WIDTH_BREAKPOINT,
};
