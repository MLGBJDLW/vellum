/**
 * Theme Presets
 *
 * Pre-defined theme configurations for the Vellum TUI.
 * Each theme implements the VellumTheme interface with
 * carefully selected colors for terminal readability.
 *
 * @module theme/presets
 */

import type { VellumTheme } from "./types.js";

// =============================================================================
// Shared Definitions
// =============================================================================

/**
 * Common border definitions shared across all themes
 */
const sharedBorders = {
  radius: {
    none: 0,
    sm: 1,
    md: 2,
    lg: 4,
    full: 999,
  },
  width: {
    none: 0,
    thin: 1,
    medium: 2,
    thick: 3,
  },
  single: {
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    horizontal: "─",
    vertical: "│",
  },
  double: {
    topLeft: "╔",
    topRight: "╗",
    bottomLeft: "╚",
    bottomRight: "╝",
    horizontal: "═",
    vertical: "║",
  },
  rounded: {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│",
  },
  bold: {
    topLeft: "┏",
    topRight: "┓",
    bottomLeft: "┗",
    bottomRight: "┛",
    horizontal: "━",
    vertical: "┃",
  },
} as const;

/**
 * Common spacing definitions shared across all themes
 */
const sharedSpacing = {
  none: 0,
  xs: 1,
  sm: 2,
  md: 4,
  lg: 8,
  xl: 16,
} as const;

/**
 * Common animation definitions shared across all themes
 */
const sharedAnimation = {
  spinner: {
    dots: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    line: ["-", "\\", "|", "/"],
    arc: ["◜", "◠", "◝", "◞", "◡", "◟"],
    bounce: ["⠁", "⠂", "⠄", "⠂"],
  },
  frameInterval: 80,
  cursorBlink: 530,
} as const;

/**
 * Common icons shared across all themes
 */
const sharedIcons = {
  success: "✓",
  error: "✗",
  warning: "⚠",
  info: "ℹ",
  pending: "○",
  checked: "☑",
  unchecked: "☐",
  collapsed: "▸",
  expanded: "▾",
  user: "👤",
  assistant: "🤖",
  tool: "🔧",
  edit: "✎",
  copy: "📋",
} as const;

// =============================================================================
// Dark Theme (Default)
// =============================================================================

/**
 * Dark theme - Default dark mode theme
 *
 * A balanced dark theme with purple accents, suitable for
 * extended terminal sessions with reduced eye strain.
 */
export const darkTheme: VellumTheme = {
  name: "dark",
  mode: "dark",
  colors: {
    primary: "#7c3aed",
    secondary: "#6366f1",
    success: "#10b981",
    error: "#ef4444",
    warning: "#f59e0b",
    info: "#3b82f6",
    muted: "#6b7280",
    accent: "#8b5cf6",
  },
  semantic: {
    text: {
      primary: "#f9fafb",
      secondary: "#d1d5db",
      muted: "#9ca3af",
      inverted: "#111827",
      role: {
        user: "#60a5fa",
        assistant: "#a78bfa",
        system: "#9ca3af",
        tool: "#34d399",
      },
    },
    background: {
      primary: "#111827",
      secondary: "#1f2937",
      elevated: "#374151",
      code: "#0d1117",
    },
    border: {
      default: "#374151",
      focus: "#7c3aed",
      muted: "#1f2937",
    },
    status: {
      pending: "#6b7280",
      running: "#3b82f6",
      complete: "#10b981",
      error: "#ef4444",
      approved: "#10b981",
      rejected: "#ef4444",
    },
    syntax: {
      keyword: "#c084fc",
      string: "#86efac",
      number: "#fbbf24",
      comment: "#6b7280",
      function: "#60a5fa",
      variable: "#f9fafb",
      type: "#67e8f9",
      operator: "#f472b6",
      punctuation: "#9ca3af",
    },
    diff: {
      added: "#065f46",
      removed: "#7f1d1d",
      changed: "#78350f",
      context: "#111827",
    },
  },
  borders: sharedBorders,
  spacing: sharedSpacing,
  animation: sharedAnimation,
  icons: sharedIcons,
} as const;

// =============================================================================
// Light Theme
// =============================================================================

/**
 * Light theme - Default light mode theme
 *
 * A clean light theme suitable for well-lit environments
 * with high contrast for readability.
 */
export const lightTheme: VellumTheme = {
  name: "light",
  mode: "light",
  colors: {
    primary: "#7c3aed",
    secondary: "#6366f1",
    success: "#059669",
    error: "#dc2626",
    warning: "#d97706",
    info: "#2563eb",
    muted: "#9ca3af",
    accent: "#8b5cf6",
  },
  semantic: {
    text: {
      primary: "#111827",
      secondary: "#374151",
      muted: "#6b7280",
      inverted: "#f9fafb",
      role: {
        user: "#2563eb",
        assistant: "#7c3aed",
        system: "#6b7280",
        tool: "#059669",
      },
    },
    background: {
      primary: "#ffffff",
      secondary: "#f3f4f6",
      elevated: "#e5e7eb",
      code: "#f6f8fa",
    },
    border: {
      default: "#d1d5db",
      focus: "#7c3aed",
      muted: "#e5e7eb",
    },
    status: {
      pending: "#9ca3af",
      running: "#2563eb",
      complete: "#059669",
      error: "#dc2626",
      approved: "#059669",
      rejected: "#dc2626",
    },
    syntax: {
      keyword: "#7c3aed",
      string: "#059669",
      number: "#d97706",
      comment: "#6b7280",
      function: "#2563eb",
      variable: "#111827",
      type: "#0891b2",
      operator: "#be185d",
      punctuation: "#6b7280",
    },
    diff: {
      added: "#d1fae5",
      removed: "#fee2e2",
      changed: "#fef3c7",
      context: "#ffffff",
    },
  },
  borders: sharedBorders,
  spacing: sharedSpacing,
  animation: sharedAnimation,
  icons: sharedIcons,
} as const;

// =============================================================================
// Dracula Theme
// =============================================================================

/**
 * Dracula theme - Popular dark color scheme
 *
 * Based on the Dracula color palette, featuring
 * vibrant colors on a dark background.
 *
 * @see https://draculatheme.com
 */
export const draculaTheme: VellumTheme = {
  name: "dracula",
  mode: "dark",
  colors: {
    primary: "#bd93f9",
    secondary: "#ff79c6",
    success: "#50fa7b",
    error: "#ff5555",
    warning: "#ffb86c",
    info: "#8be9fd",
    muted: "#6272a4",
    accent: "#bd93f9",
  },
  semantic: {
    text: {
      primary: "#f8f8f2",
      secondary: "#f8f8f2",
      muted: "#6272a4",
      inverted: "#282a36",
      role: {
        user: "#8be9fd",
        assistant: "#bd93f9",
        system: "#6272a4",
        tool: "#50fa7b",
      },
    },
    background: {
      primary: "#282a36",
      secondary: "#44475a",
      elevated: "#44475a",
      code: "#21222c",
    },
    border: {
      default: "#44475a",
      focus: "#bd93f9",
      muted: "#383a46",
    },
    status: {
      pending: "#6272a4",
      running: "#8be9fd",
      complete: "#50fa7b",
      error: "#ff5555",
      approved: "#50fa7b",
      rejected: "#ff5555",
    },
    syntax: {
      keyword: "#ff79c6",
      string: "#f1fa8c",
      number: "#bd93f9",
      comment: "#6272a4",
      function: "#50fa7b",
      variable: "#f8f8f2",
      type: "#8be9fd",
      operator: "#ff79c6",
      punctuation: "#f8f8f2",
    },
    diff: {
      added: "#1e3a2f",
      removed: "#3d1f1f",
      changed: "#3d3419",
      context: "#282a36",
    },
  },
  borders: sharedBorders,
  spacing: sharedSpacing,
  animation: sharedAnimation,
  icons: sharedIcons,
} as const;

// =============================================================================
// GitHub Theme
// =============================================================================

/**
 * GitHub theme - GitHub-inspired dark color scheme
 *
 * Based on GitHub's dark theme with familiar colors
 * for developers used to the GitHub interface.
 */
export const githubTheme: VellumTheme = {
  name: "github-dark",
  mode: "dark",
  colors: {
    primary: "#58a6ff",
    secondary: "#bc8cff",
    success: "#3fb950",
    error: "#f85149",
    warning: "#d29922",
    info: "#58a6ff",
    muted: "#8b949e",
    accent: "#58a6ff",
  },
  semantic: {
    text: {
      primary: "#c9d1d9",
      secondary: "#8b949e",
      muted: "#6e7681",
      inverted: "#0d1117",
      role: {
        user: "#58a6ff",
        assistant: "#bc8cff",
        system: "#8b949e",
        tool: "#3fb950",
      },
    },
    background: {
      primary: "#0d1117",
      secondary: "#161b22",
      elevated: "#21262d",
      code: "#161b22",
    },
    border: {
      default: "#30363d",
      focus: "#58a6ff",
      muted: "#21262d",
    },
    status: {
      pending: "#8b949e",
      running: "#58a6ff",
      complete: "#3fb950",
      error: "#f85149",
      approved: "#3fb950",
      rejected: "#f85149",
    },
    syntax: {
      keyword: "#ff7b72",
      string: "#a5d6ff",
      number: "#79c0ff",
      comment: "#8b949e",
      function: "#d2a8ff",
      variable: "#c9d1d9",
      type: "#7ee787",
      operator: "#ff7b72",
      punctuation: "#c9d1d9",
    },
    diff: {
      added: "#12261e",
      removed: "#3c1f1e",
      changed: "#2d2a0f",
      context: "#0d1117",
    },
  },
  borders: sharedBorders,
  spacing: sharedSpacing,
  animation: sharedAnimation,
  icons: sharedIcons,
} as const;

// =============================================================================
// ANSI Theme
// =============================================================================

/**
 * ANSI theme - Basic ANSI color compatibility
 *
 * Uses standard ANSI color names for maximum compatibility
 * with terminals that don't support extended colors.
 * Perfect for SSH sessions and minimal terminal emulators.
 */
export const ansiTheme: VellumTheme = {
  name: "ansi",
  mode: "dark",
  colors: {
    primary: "cyan",
    secondary: "magenta",
    success: "green",
    error: "red",
    warning: "yellow",
    info: "blue",
    muted: "gray",
    accent: "cyan",
  },
  semantic: {
    text: {
      primary: "white",
      secondary: "white",
      muted: "gray",
      inverted: "black",
      role: {
        user: "cyan",
        assistant: "magenta",
        system: "gray",
        tool: "green",
      },
    },
    background: {
      primary: "black",
      secondary: "black",
      elevated: "black",
      code: "black",
    },
    border: {
      default: "gray",
      focus: "cyan",
      muted: "gray",
    },
    status: {
      pending: "gray",
      running: "blue",
      complete: "green",
      error: "red",
      approved: "green",
      rejected: "red",
    },
    syntax: {
      keyword: "magenta",
      string: "green",
      number: "yellow",
      comment: "gray",
      function: "cyan",
      variable: "white",
      type: "cyan",
      operator: "magenta",
      punctuation: "white",
    },
    diff: {
      added: "green",
      removed: "red",
      changed: "yellow",
      context: "black",
    },
  },
  borders: sharedBorders,
  spacing: sharedSpacing,
  animation: {
    spinner: {
      // Use ASCII-only spinners for maximum compatibility
      dots: [".", "o", "O", "o"],
      line: ["-", "\\", "|", "/"],
      arc: ["(", ")", "(", ")"],
      bounce: [".", "o", ".", "o"],
    },
    frameInterval: 100,
    cursorBlink: 530,
  },
  icons: {
    // Use ASCII-only icons for maximum compatibility
    success: "+",
    error: "x",
    warning: "!",
    info: "i",
    pending: "o",
    checked: "[x]",
    unchecked: "[ ]",
    collapsed: ">",
    expanded: "v",
    user: "U:",
    assistant: "A:",
    tool: "T:",
    edit: "*",
    copy: "=",
  },
} as const;

// =============================================================================
// Theme Registry
// =============================================================================

/**
 * Record of all available theme presets
 *
 * Provides easy access to themes by name and enables
 * iteration over available themes.
 */
export const themes = {
  dark: darkTheme,
  light: lightTheme,
  dracula: draculaTheme,
  "github-dark": githubTheme,
  ansi: ansiTheme,
} as const;

/**
 * Type for theme names in the registry
 */
export type ThemeName = keyof typeof themes;

/**
 * Default theme used when no preference is specified
 */
export const defaultTheme = darkTheme;

/**
 * Get a theme by name
 *
 * @param name - Theme name to retrieve
 * @returns The requested theme or undefined
 */
export function getTheme(name: string): VellumTheme | undefined {
  return themes[name as ThemeName];
}

/**
 * Get a theme by name with fallback to default
 *
 * @param name - Theme name to retrieve
 * @returns The requested theme or the default theme
 */
export function getThemeOrDefault(name: string): VellumTheme {
  return getTheme(name) ?? defaultTheme;
}

/**
 * List all available theme names
 *
 * @returns Array of theme names
 */
export function getThemeNames(): readonly ThemeName[] {
  return Object.keys(themes) as ThemeName[];
}
