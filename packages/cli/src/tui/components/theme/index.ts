/**
 * Theme Component Exports
 *
 * Design tokens and theme utilities for TUI components.
 * This module provides a simple, component-focused theme API
 * while leveraging the full theme system from @vellum/shared.
 *
 * @module tui/components/theme
 */

// =============================================================================
// Design Tokens
// =============================================================================

export type {
  BackgroundColorToken,
  BorderColorToken,
  // Token key types
  ColorToken,
  FontSizeToken,
  FontWeightToken,
  IconToken,
  LineHeightToken,
  SpacingToken,
  StatusColorToken,
  TextColorToken,
  Tokens,
} from "./tokens.js";
export {
  animationTiming,
  backgroundColors,
  borderCharsBold,
  borderCharsDouble,
  borderCharsRounded,
  borderCharsSingle,
  borderColors,
  // Borders
  borderRadius,
  borderWidth,
  // Core colors
  colors,
  // Typography
  fontSizes,
  fontWeights,
  // Icons
  icons,
  lineHeights,
  // Spacing
  spacing,
  // Animation
  spinnerFrames,
  statusColors,
  textColors,
  // Grouped tokens
  tokens,
} from "./tokens.js";

// =============================================================================
// Theme Utilities
// =============================================================================

import {
  type ColorToken,
  colors,
  type FontSizeToken,
  fontSizes,
  type SpacingToken,
  spacing,
} from "./tokens.js";

/**
 * Get a color value by token name
 *
 * @param token - Color token name
 * @returns Hex color string
 *
 * @example
 * ```typescript
 * const primaryColor = getColor('primary'); // '#7C3AED'
 * const errorColor = getColor('error');     // '#EF4444'
 * ```
 */
export function getColor(token: ColorToken): string {
  return colors[token];
}

/**
 * Get a spacing value by token name
 *
 * @param token - Spacing token name
 * @returns Spacing value in characters
 *
 * @example
 * ```typescript
 * const padding = getSpacing('md'); // 4
 * const margin = getSpacing('lg');  // 8
 * ```
 */
export function getSpacing(token: SpacingToken): number {
  return spacing[token];
}

/**
 * Get a font size value by token name
 *
 * @param token - Font size token name
 * @returns Font size value
 *
 * @example
 * ```typescript
 * const bodySize = getFontSize('md'); // 14
 * const headingSize = getFontSize('xl'); // 20
 * ```
 */
export function getFontSize(token: FontSizeToken): number {
  return fontSizes[token];
}

/**
 * Create spacing object for padding/margin
 *
 * @param top - Top spacing token
 * @param right - Right spacing token (optional, defaults to top)
 * @param bottom - Bottom spacing token (optional, defaults to top)
 * @param left - Left spacing token (optional, defaults to right)
 * @returns Spacing value or object
 *
 * @example
 * ```typescript
 * createSpacing('md');           // 4
 * createSpacing('sm', 'md');     // { vertical: 2, horizontal: 4 }
 * createSpacing('xs', 'sm', 'md', 'lg'); // { top: 1, right: 2, bottom: 4, left: 8 }
 * ```
 */
export function createSpacing(top: SpacingToken): number;
export function createSpacing(
  vertical: SpacingToken,
  horizontal: SpacingToken
): { vertical: number; horizontal: number };
export function createSpacing(
  top: SpacingToken,
  right: SpacingToken,
  bottom: SpacingToken,
  left: SpacingToken
): { top: number; right: number; bottom: number; left: number };
export function createSpacing(
  first: SpacingToken,
  second?: SpacingToken,
  third?: SpacingToken,
  fourth?: SpacingToken
):
  | number
  | { vertical: number; horizontal: number }
  | { top: number; right: number; bottom: number; left: number } {
  if (second === undefined) {
    return spacing[first];
  }
  if (third === undefined || fourth === undefined) {
    return {
      vertical: spacing[first],
      horizontal: spacing[second],
    };
  }
  return {
    top: spacing[first],
    right: spacing[second],
    bottom: spacing[third],
    left: spacing[fourth],
  };
}

/**
 * Check if a string is a valid color token
 *
 * @param value - String to check
 * @returns True if valid color token
 */
export function isColorToken(value: string): value is ColorToken {
  return value in colors;
}

/**
 * Check if a string is a valid spacing token
 *
 * @param value - String to check
 * @returns True if valid spacing token
 */
export function isSpacingToken(value: string): value is SpacingToken {
  return value in spacing;
}

/**
 * Get all color tokens as an array
 *
 * @returns Array of color token names
 */
export function getColorTokens(): ColorToken[] {
  return Object.keys(colors) as ColorToken[];
}

/**
 * Get all spacing tokens as an array
 *
 * @returns Array of spacing token names
 */
export function getSpacingTokens(): SpacingToken[] {
  return Object.keys(spacing) as SpacingToken[];
}

// =============================================================================
// Re-exports from main theme module
// =============================================================================

// Re-export shared theme types for convenience
export type {
  ThemeContextValue,
  ThemeName,
  VellumTheme,
} from "@vellum/shared";

// Re-export theme provider from main theme module
export {
  ThemeContext,
  ThemeProvider,
  type ThemeProviderProps,
  useTheme,
} from "../../theme/index.js";
