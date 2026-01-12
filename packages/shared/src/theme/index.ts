/**
 * Theme Module
 *
 * Re-exports all theme-related types and utilities.
 */

// Icon system (centralized icon management with auto-detection)
export type { IconSet, IconSupport } from "./icons.js";
export {
  asciiIcons,
  getIconSupport,
  getIcons,
  icons,
  nerdFontIcons,
  resetIconDetection,
  setIconSet,
  unicodeIcons,
} from "./icons.js";
// Theme presets
export type { ThemeName } from "./presets.js";
export {
  ansiTheme,
  catppuccinMochaTheme,
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
  nordTheme,
  parchmentTheme,
  // Theme registry
  themes,
  tokyoNightTheme,
} from "./presets.js";

// Semantic token utilities
export type { ExtendedSemanticColors } from "./semantic-tokens.js";
export {
  adjustBrightness,
  createExtendedSemanticTokens,
  getContrastingTextColor,
  getLuminance,
  getRoleBorderColor,
  getRoleTextColor,
  getStatusColor,
  getSyntaxColor,
  hexToRgb,
  isDarkColor,
  rgbToHex,
} from "./semantic-tokens.js";
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
  // Brand colors
  ThemeBrand,
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
