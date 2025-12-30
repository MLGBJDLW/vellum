/**
 * Theme Provider and Hook
 *
 * Provides theming context for the Vellum TUI with support for
 * preset themes and runtime theme switching.
 *
 * @module tui/theme/provider
 */

import type { ThemeContextValue, ThemePreset, VellumTheme } from "@vellum/shared";
import { defaultTheme, getThemeOrDefault, type ThemeName, themes } from "@vellum/shared";
import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

// =============================================================================
// Context
// =============================================================================

/**
 * React context for theme state
 *
 * Initialized as undefined to detect usage outside provider
 */
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access the current theme
 *
 * Must be used within a ThemeProvider component.
 *
 * @returns The current theme context value
 * @throws Error if used outside ThemeProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { theme, setTheme } = useTheme();
 *   return <Box color={theme.colors.primary}>Hello</Box>;
 * }
 * ```
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error(
      "useTheme must be used within a ThemeProvider. " +
        "Ensure your component is wrapped in <ThemeProvider>."
    );
  }

  return context;
}

// =============================================================================
// Provider Props
// =============================================================================

/**
 * Props for the ThemeProvider component
 */
export interface ThemeProviderProps {
  /**
   * Initial theme - can be a theme name string or a VellumTheme object
   *
   * @default "dark"
   */
  readonly theme?: ThemeName | ThemePreset | VellumTheme;

  /**
   * Children to render within the theme context
   */
  readonly children: ReactNode;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Resolve a theme input to a VellumTheme object
 *
 * @param themeInput - Theme name, preset, or object
 * @returns Resolved VellumTheme object
 */
function resolveTheme(themeInput: ThemeName | ThemePreset | VellumTheme | undefined): VellumTheme {
  // Handle undefined - use default
  if (themeInput === undefined) {
    return defaultTheme;
  }

  // Handle string theme names (both ThemeName and ThemePreset)
  if (typeof themeInput === "string") {
    return getThemeOrDefault(themeInput);
  }

  // Handle VellumTheme objects - return as-is
  return themeInput;
}

/**
 * Get the opposite mode theme name
 *
 * @param currentTheme - Current theme
 * @returns Theme name with opposite mode
 */
function getOppositeMode(currentTheme: VellumTheme): ThemeName {
  const targetMode = currentTheme.mode === "dark" ? "light" : "dark";

  // Try to find a theme with the same base name but different mode
  // For example: dracula -> light, light -> dark
  const themeNames = Object.keys(themes) as ThemeName[];

  // First, look for a theme with opposite mode
  const sameFamily = themeNames.find((name) => {
    const theme = themes[name];
    return theme.mode === targetMode;
  });

  return sameFamily ?? (targetMode === "dark" ? "dark" : "light");
}

// =============================================================================
// Provider Component
// =============================================================================

/**
 * Theme provider component
 *
 * Provides theme context to all child components, enabling access to
 * the current theme via the useTheme hook.
 *
 * @example
 * ```tsx
 * // Using a theme name
 * <ThemeProvider theme="dark">
 *   <App />
 * </ThemeProvider>
 *
 * // Using a theme preset
 * <ThemeProvider theme="dracula">
 *   <App />
 * </ThemeProvider>
 *
 * // Using a custom theme object
 * <ThemeProvider theme={customTheme}>
 *   <App />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({
  theme: initialTheme,
  children,
}: ThemeProviderProps): React.JSX.Element {
  // State for the current theme
  const [currentTheme, setCurrentTheme] = useState<VellumTheme>(() => resolveTheme(initialTheme));

  /**
   * Set theme by name or object
   */
  const setTheme = useCallback((newTheme: ThemePreset | VellumTheme): void => {
    const resolved = resolveTheme(newTheme);
    setCurrentTheme(resolved);
  }, []);

  /**
   * Toggle between dark and light modes
   */
  const toggleMode = useCallback((): void => {
    const oppositeName = getOppositeMode(currentTheme);
    const oppositeTheme = themes[oppositeName];
    setCurrentTheme(oppositeTheme);
  }, [currentTheme]);

  /**
   * Memoized context value
   */
  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme: currentTheme,
      themeName: currentTheme.name,
      setTheme,
      toggleMode,
    }),
    [currentTheme, setTheme, toggleMode]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

// =============================================================================
// Exports
// =============================================================================

export { ThemeContext };
export type { ThemeContextValue };
