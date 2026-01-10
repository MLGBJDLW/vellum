/**
 * Theme Slash Commands
 *
 * Provides slash commands for theme management:
 * - /theme - Show current theme and list available themes
 * - /theme <name> - Switch to a specific theme
 * - /theme dark - Switch to dark theme
 * - /theme light - Switch to light theme
 * - /theme dracula - Switch to dracula theme
 * etc.
 *
 * @module cli/commands/theme
 */

import type { ThemeContextValue } from "@vellum/shared";
import { getThemeNames, themes } from "@vellum/shared";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Module State
// =============================================================================

/**
 * Available theme names derived from the themes registry.
 */
const availableThemes = getThemeNames();

/**
 * Reference to ThemeContext setter.
 * Set by the App component when initialized.
 */
let themeContextValue: ThemeContextValue | null = null;

/**
 * Set the ThemeContextValue instance for theme commands.
 * Called by the App component during initialization.
 *
 * @param ctx - The ThemeContextValue instance to use, or null to clear
 */
export function setThemeContext(ctx: ThemeContextValue | null): void {
  themeContextValue = ctx;
}

/**
 * Get the current ThemeContextValue instance.
 * Returns null if not yet initialized.
 */
export function getThemeContext(): ThemeContextValue | null {
  return themeContextValue;
}

// =============================================================================
// Theme Description Helpers
// =============================================================================

/**
 * Get icon indicator for a theme mode.
 */
function getThemeModeIcon(mode: "dark" | "light"): string {
  return mode === "dark" ? "●" : "○";
}

/**
 * Format theme information for display.
 */
function formatThemeInfo(name: string, isCurrent: boolean): string {
  const theme = themes[name as keyof typeof themes];
  if (!theme) return `  ? ${name}`;
  const icon = getThemeModeIcon(theme.mode);
  const marker = isCurrent ? " <- current" : "";
  return `  ${icon} ${name} (${theme.mode})${marker}`;
}

// =============================================================================
// /theme Command - Show Current Theme and Options
// =============================================================================

/**
 * /theme command - Display current theme and switch to a specific theme.
 *
 * Without arguments, shows the current theme and lists all available themes.
 * With a theme name argument, switches to that theme.
 */
export const themeCommand: SlashCommand = {
  name: "theme",
  description: "Show current theme or switch themes",
  kind: "builtin",
  category: "config",
  aliases: ["themes"],
  positionalArgs: [
    {
      name: "name",
      type: "string",
      description: "Theme name to switch to",
      required: false,
    },
  ],
  examples: [
    "/theme           - Show current theme and options",
    "/theme dark      - Switch to dark theme",
    "/theme light     - Switch to light theme",
    "/theme dracula   - Switch to Dracula theme",
  ],
  subcommands: availableThemes.map((t) => ({
    name: t,
    description: `Apply ${t} theme`,
  })),

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const requestedTheme = ctx.parsedArgs.positional[0] as string | undefined;

    // If a theme is specified, switch to it
    if (requestedTheme) {
      return switchToTheme(requestedTheme);
    }

    // Show current theme and list options
    if (!themeContextValue) {
      // No context available - show static info
      const themeList = availableThemes
        .map((name) => formatThemeInfo(name, name === "dark"))
        .join("\n");

      const lines = [
        "=== Themes ===",
        "",
        "Available themes:",
        themeList,
        "",
        "Theme system not yet initialized. Using default: dark",
        "",
        "Usage: /theme <name>",
      ];
      return success(lines.join("\n"));
    }

    const current = themeContextValue.themeName;
    const themeList = availableThemes
      .map((name: string) => formatThemeInfo(name, name === current))
      .join("\n");

    const lines = [
      "=== Themes ===",
      "",
      `Current theme: ${getThemeModeIcon(themes[current as keyof typeof themes]?.mode ?? "dark")} ${current}`,
      "",
      "Available themes:",
      themeList,
      "",
      "Usage: /theme <name>",
    ];

    return success(lines.join("\n"));
  },
};

// =============================================================================
// Theme Switch Helper
// =============================================================================

/**
 * Switch to a specified theme with validation.
 *
 * @param themeName - Theme name to switch to
 * @returns Command result
 */
function switchToTheme(themeName: string): CommandResult {
  const normalizedName = themeName.toLowerCase();

  // Validate theme name
  if (!availableThemes.includes(normalizedName as (typeof availableThemes)[number])) {
    return error("INVALID_ARGUMENT", `Unknown theme: "${themeName}"`, [
      `Available themes: ${availableThemes.join(", ")}`,
    ]);
  }

  const themeObj = themes[normalizedName as keyof typeof themes];

  // If no context, return informative message
  if (!themeContextValue) {
    return success(
      `Theme system not initialized. Would switch to ${getThemeModeIcon(themeObj?.mode ?? "dark")} ${normalizedName}.`
    );
  }

  // Check if already using this theme
  if (themeContextValue.themeName === normalizedName) {
    return success(
      `Already using ${getThemeModeIcon(themeObj?.mode ?? "dark")} ${normalizedName} theme.`
    );
  }

  // Execute the switch - pass the theme object directly
  themeContextValue.setTheme(themeObj);
  return success(
    `${getThemeModeIcon(themeObj?.mode ?? "dark")} Switched to ${normalizedName} theme.`
  );
}

// =============================================================================
// Export Theme Command
// =============================================================================

/**
 * All theme-related slash commands for registration.
 *
 * Note: Theme shortcuts (e.g., /dark, /light) have been removed.
 * Use /theme <name> for theme switching with subcommand autocomplete.
 */
export const themeSlashCommands: SlashCommand[] = [themeCommand];
