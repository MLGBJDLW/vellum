/**
 * Semantic Color Token System
 *
 * Provides utility functions for creating semantic color tokens from themes.
 * Inspired by Gemini CLI's approach to semantic color mapping.
 *
 * This module bridges the VellumTheme interface with component-level
 * semantic color needs, ensuring consistent color usage across the TUI.
 *
 * @module theme/semantic-tokens
 */

import type { SemanticColors, VellumTheme } from "./types.js";

// =============================================================================
// Extended Semantic Tokens Interface
// =============================================================================

/**
 * Extended semantic colors with UI-specific tokens
 *
 * Provides more granular semantic mappings for complex UI scenarios
 * like gradient effects, multi-element compositions, and specialized states.
 */
export interface ExtendedSemanticColors extends SemanticColors {
  /** UI element accent colors */
  readonly ui: {
    /** User message accent color */
    readonly user: string;
    /** Assistant message accent color */
    readonly assistant: string;
    /** Tool output accent color */
    readonly tool: string;
    /** System message accent color */
    readonly system: string;
    /** Gradient colors for shimmer/loading effects */
    readonly gradient: readonly string[];
  };

  /** Link and interactive element colors */
  readonly interactive: {
    /** Link text color */
    readonly link: string;
    /** Hover state color */
    readonly hover: string;
    /** Active/pressed state color */
    readonly active: string;
    /** Disabled state color */
    readonly disabled: string;
  };

  /** Additional response-specific text colors */
  readonly response: {
    /** AI response text color */
    readonly text: string;
    /** Code in response */
    readonly code: string;
    /** Emphasis in response */
    readonly emphasis: string;
  };
}

// =============================================================================
// Token Creation Functions
// =============================================================================

/**
 * Create extended semantic tokens from a VellumTheme
 *
 * Maps theme colors to semantic meanings for consistent component styling.
 * Includes both base semantic colors and extended UI-specific tokens.
 *
 * @param theme - The VellumTheme to extract tokens from
 * @returns Extended semantic color tokens
 *
 * @example
 * ```typescript
 * const theme = getTheme('dracula');
 * const tokens = createExtendedSemanticTokens(theme);
 *
 * // Use in component
 * <Text color={tokens.ui.assistant}>AI response</Text>
 * <Box borderColor={tokens.interactive.link}>Click me</Box>
 * ```
 */
export function createExtendedSemanticTokens(theme: VellumTheme): ExtendedSemanticColors {
  return {
    // Base semantic colors from theme
    text: theme.semantic.text,
    background: theme.semantic.background,
    border: theme.semantic.border,
    status: theme.semantic.status,
    syntax: theme.semantic.syntax,
    diff: theme.semantic.diff,

    // Extended UI tokens
    ui: {
      user: theme.semantic.text.role.user,
      assistant: theme.semantic.text.role.assistant,
      tool: theme.semantic.text.role.tool,
      system: theme.semantic.text.role.system,
      gradient: [theme.colors.primary, theme.colors.accent, theme.colors.info],
    },

    // Interactive element tokens
    interactive: {
      link: theme.colors.info,
      hover: theme.colors.accent,
      active: theme.colors.primary,
      disabled: theme.semantic.text.muted,
    },

    // Response-specific tokens
    response: {
      text: theme.semantic.text.primary,
      code: theme.semantic.syntax.variable,
      emphasis: theme.colors.accent,
    },
  };
}

/**
 * Get semantic text color for a message role
 *
 * @param role - Message role (user, assistant, system, tool)
 * @param theme - Current theme
 * @returns Appropriate color for the role
 */
export function getRoleTextColor(
  role: "user" | "assistant" | "system" | "tool",
  theme: VellumTheme
): string {
  return theme.semantic.text.role[role];
}

/**
 * Get semantic border color for a message role
 *
 * @param role - Message role
 * @param theme - Current theme
 * @returns Appropriate border color for the role
 */
export function getRoleBorderColor(
  role: "user" | "assistant" | "system" | "tool",
  theme: VellumTheme
): string {
  switch (role) {
    case "user":
      return theme.semantic.text.role.user;
    case "assistant":
      return theme.colors.primary;
    case "system":
      return theme.semantic.border.muted;
    case "tool":
      return theme.semantic.text.role.tool;
    default:
      return theme.semantic.border.default;
  }
}

/**
 * Get semantic status color
 *
 * @param status - Status type
 * @param theme - Current theme
 * @returns Appropriate color for the status
 */
export function getStatusColor(
  status: "pending" | "running" | "complete" | "error" | "approved" | "rejected",
  theme: VellumTheme
): string {
  return theme.semantic.status[status];
}

/**
 * Get semantic syntax color for code highlighting
 *
 * @param tokenType - Syntax token type
 * @param theme - Current theme
 * @returns Appropriate color for the token
 */
export function getSyntaxColor(
  tokenType: keyof SemanticColors["syntax"],
  theme: VellumTheme
): string {
  return theme.semantic.syntax[tokenType];
}

// =============================================================================
// Color Utility Functions
// =============================================================================

/**
 * Convert hex color to RGB components
 *
 * @param hex - Hex color string (with or without #)
 * @returns RGB object or null if invalid
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result || !result[1] || !result[2] || !result[3]) {
    return null;
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Convert RGB components to hex color
 *
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 * @returns Hex color string with # prefix
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const clamped = Math.max(0, Math.min(255, Math.round(x)));
        return clamped.toString(16).padStart(2, "0");
      })
      .join("")
  );
}

/**
 * Lighten or darken a hex color
 *
 * @param hex - Hex color to adjust
 * @param amount - Amount to adjust (-1 to 1, negative darkens, positive lightens)
 * @returns Adjusted hex color
 */
export function adjustBrightness(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  // Determine direction based on current brightness and amount
  const currentBrightness = (rgb.r + rgb.g + rgb.b) / 3;
  const isDark = currentBrightness < 128;

  // For dark colors, lightening increases values; for light colors, darkening decreases
  const factor = amount > 0 ? 1 + amount : 1 + amount;

  if (isDark) {
    // For dark colors, add a base amount to lighten
    const adjustment = amount * 255;
    return rgbToHex(rgb.r + adjustment, rgb.g + adjustment, rgb.b + adjustment);
  } else {
    // For light colors, multiply to darken
    return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
  }
}

/**
 * Calculate relative luminance of a color
 *
 * @param hex - Hex color string
 * @returns Relative luminance (0-1)
 */
export function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const values = [rgb.r, rgb.g, rgb.b].map((c) => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

/**
 * Check if a color is considered "dark"
 *
 * @param hex - Hex color string
 * @returns True if the color is dark
 */
export function isDarkColor(hex: string): boolean {
  return getLuminance(hex) < 0.5;
}

/**
 * Get contrasting text color for a background
 *
 * @param bgHex - Background hex color
 * @returns White or black hex color for best contrast
 */
export function getContrastingTextColor(bgHex: string): string {
  return isDarkColor(bgHex) ? "#ffffff" : "#000000";
}
