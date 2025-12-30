/**
 * Theme Module
 *
 * Re-exports all theme-related types and utilities.
 */

// Theme presets
export type { ThemeName } from "./presets.js";
export {
  ansiTheme,
  // Individual themes
  darkTheme,
  defaultTheme,
  draculaTheme,
  // Utility functions
  getTheme,
  getThemeNames,
  getThemeOrDefault,
  githubTheme,
  lightTheme,
  // Theme registry
  themes,
} from "./presets.js";
export type {
  BorderCharacters,
  // Border types
  BorderRadius,
  BorderWidth,
  // Color types
  Color,
  // Utility types
  PartialTheme,
  SemanticColors,
  // Animation types
  SpinnerFrames,
  // Semantic color types
  TextRoleColors,
  ThemeAnimation,
  ThemeBorders,
  ThemeColors,
  ThemeContextValue,
  // Icon types
  ThemeIcons,
  // Main theme types
  ThemeMode,
  ThemeOptions,
  ThemePreset,
  // Spacing types
  ThemeSpacing,
  VellumTheme,
} from "./types.js";
export { THEME_PRESETS } from "./types.js";
