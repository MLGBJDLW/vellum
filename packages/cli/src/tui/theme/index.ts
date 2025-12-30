/**
 * TUI Theme
 *
 * Theme configuration and styling utilities for the Vellum TUI.
 */

// Re-export types from shared for convenience
export type { ThemeContextValue, ThemeName, VellumTheme } from "@vellum/shared";
// Theme provider and hook
export {
  ThemeContext,
  ThemeProvider,
  type ThemeProviderProps,
  useTheme,
} from "./provider.js";
