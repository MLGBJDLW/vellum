/**
 * Color Capability Detection and Theme Degradation
 *
 * Provides utilities for detecting terminal color support and
 * gracefully degrading themes for limited color terminals.
 *
 * @module theme/capability
 */

import { ansiTheme, defaultTheme } from "./presets.js";
import type { VellumTheme } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Color capability levels for terminal detection
 */
export type ColorCapability = "none" | "basic" | "256" | "truecolor";

// =============================================================================
// Detection
// =============================================================================

/**
 * Detect the color capability of the current terminal
 */
export function detectColorCapability(): ColorCapability {
  // Check for NO_COLOR environment variable
  if (process.env.NO_COLOR !== undefined) {
    return "none";
  }

  // Check for FORCE_COLOR environment variable
  if (process.env.FORCE_COLOR !== undefined) {
    const level = parseInt(process.env.FORCE_COLOR, 10);
    if (level === 0) return "none";
    if (level === 1) return "basic";
    if (level === 2) return "256";
    if (level >= 3) return "truecolor";
  }

  // Check for COLORTERM environment variable
  const colorTerm = process.env.COLORTERM;
  if (colorTerm === "truecolor" || colorTerm === "24bit") {
    return "truecolor";
  }

  // Check TERM environment variable
  const term = process.env.TERM;
  if (term) {
    if (term.includes("256color") || term.includes("256")) {
      return "256";
    }
    if (term.includes("color") || term === "xterm") {
      return "basic";
    }
    if (term === "dumb") {
      return "none";
    }
  }

  // Default to basic color support
  return "basic";
}

// =============================================================================
// Theme Degradation
// =============================================================================

/**
 * Degrade a theme based on terminal color capability
 *
 * @param theme - The theme to potentially degrade
 * @param capability - The detected color capability
 * @returns A theme appropriate for the terminal's capabilities
 */
export function degradeTheme(theme: VellumTheme, capability: ColorCapability): VellumTheme {
  switch (capability) {
    case "none":
      // Return a monochrome theme variant
      return {
        ...theme,
        colors: {
          ...theme.colors,
          primary: "white",
          secondary: "gray",
          success: "white",
          error: "white",
          warning: "white",
          info: "white",
        },
      };

    case "basic":
      // Return ANSI 16-color compatible theme
      return ansiTheme;
    default:
      // Full color support - return theme as-is
      return theme;
  }
}

// =============================================================================
// Theme Manager
// =============================================================================

/**
 * Theme manager singleton for runtime theme switching
 */
class ThemeManager {
  private currentTheme: VellumTheme = defaultTheme;
  private listeners: Set<(theme: VellumTheme) => void> = new Set();

  getTheme(): VellumTheme {
    return this.currentTheme;
  }

  setTheme(theme: VellumTheme): void {
    this.currentTheme = theme;
    this.notifyListeners();
  }

  subscribe(listener: (theme: VellumTheme) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.currentTheme);
    }
  }
}

let themeManagerInstance: ThemeManager | null = null;

/**
 * Get the global theme manager instance
 */
export function getThemeManager(): ThemeManager {
  if (!themeManagerInstance) {
    themeManagerInstance = new ThemeManager();
  }
  return themeManagerInstance;
}
