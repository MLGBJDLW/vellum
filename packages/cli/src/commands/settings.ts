/**
 * Settings Slash Commands
 *
 * Provides slash commands for viewing and modifying application settings:
 * - /settings - Show all current settings
 * - /settings [category] - Show specific category
 * - /settings [key] [value] - Set a specific setting
 *
 * @module cli/commands/settings
 */

import { loadConfig } from "@vellum/core";
import {
  type DiffViewMode,
  getAlternateBufferEnabled,
  getDiffViewMode,
  getModeFromSettings,
  getModelSettings,
  getSavedLanguage,
  getThemeFromSettings,
  getThinkingSettings,
  saveUserSetting,
  setAlternateBufferEnabled,
  setDiffViewMode,
  setModeInSettings,
  setThemeInSettings,
  setThinkingSettings,
  type ThinkingSettings,
} from "../tui/i18n/index.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Settings category for grouping related settings.
 */
export type SettingsCategory =
  | "general"
  | "model"
  | "mode"
  | "theme"
  | "language"
  | "diff"
  | "think"
  | "vim"
  | "lsp"
  | "mcp";

/**
 * Valid categories for /settings command.
 */
const VALID_CATEGORIES: readonly SettingsCategory[] = [
  "general",
  "model",
  "mode",
  "theme",
  "language",
  "diff",
  "think",
  "vim",
  "lsp",
  "mcp",
] as const;

/**
 * Category display names and descriptions.
 */
const CATEGORY_INFO: Record<SettingsCategory, { name: string; description: string }> = {
  general: { name: "General", description: "General application settings" },
  model: { name: "Model", description: "LLM provider and model settings" },
  mode: { name: "Mode", description: "Coding mode settings" },
  theme: { name: "Theme", description: "Visual theme settings" },
  language: { name: "Language", description: "Language/locale settings" },
  diff: { name: "Diff", description: "Diff view settings" },
  think: { name: "Thinking", description: "Extended thinking settings" },
  vim: { name: "Vim", description: "Vim mode settings" },
  lsp: { name: "LSP", description: "Language Server Protocol settings" },
  mcp: { name: "MCP", description: "Model Context Protocol settings" },
};

// =============================================================================
// Settings Retrieval Helpers
// =============================================================================

/**
 * Get all current settings organized by category.
 */
function getAllSettings(): Record<SettingsCategory, Record<string, unknown>> {
  // Load config
  const configResult = loadConfig({ suppressDeprecationWarnings: true });
  const config = configResult.ok ? configResult.value : null;

  // Get user settings
  const thinkingSettings = getThinkingSettings();
  const modelSettings = getModelSettings();
  const savedLanguage = getSavedLanguage();
  const diffViewMode = getDiffViewMode();
  const alternateBuffer = getAlternateBufferEnabled();
  const themeFromSettings = getThemeFromSettings();
  const modeFromSettings = getModeFromSettings();

  return {
    general: {
      workingDir: config?.workingDir ?? process.cwd(),
      debug: config?.debug ?? false,
      logLevel: config?.logLevel ?? "info",
      alternateBuffer: alternateBuffer ?? true,
    },
    model: {
      provider: modelSettings?.provider ?? config?.llm?.provider ?? "anthropic",
      model: modelSettings?.modelId ?? config?.llm?.model ?? "claude-sonnet-4-20250514",
      maxTokens: config?.llm?.maxTokens ?? 4096,
      temperature: config?.llm?.temperature ?? 0.7,
    },
    mode: {
      codingMode: modeFromSettings ?? "vibe",
    },
    theme: {
      theme: themeFromSettings ?? config?.theme ?? "dark",
    },
    language: {
      locale: savedLanguage ?? "auto",
    },
    diff: {
      viewMode: diffViewMode ?? config?.diffViewMode ?? "unified",
    },
    think: {
      enabled: thinkingSettings?.enabled ?? config?.thinking?.enabled ?? false,
      budgetTokens: thinkingSettings?.budgetTokens ?? config?.thinking?.budgetTokens ?? 10000,
      priority: thinkingSettings?.priority ?? config?.thinking?.priority ?? "merge",
    },
    vim: {
      enabled: false, // Vim mode is managed via /vim command
    },
    lsp: {
      enabled: true, // LSP is always available
    },
    mcp: {
      // MCP settings would be loaded from config
      servers: "Use /mcp list to view configured servers",
    },
  };
}

/**
 * Format settings for display.
 */
function formatSettingsDisplay(settings: Record<string, unknown>, category: string): string {
  const lines: string[] = [];
  const info = CATEGORY_INFO[category as SettingsCategory];

  lines.push(`📋 ${info?.name ?? category} Settings`);
  lines.push("");

  for (const [key, value] of Object.entries(settings)) {
    const displayValue = typeof value === "object" ? JSON.stringify(value) : String(value);
    lines.push(`  ${key}: ${displayValue}`);
  }

  return lines.join("\n");
}

/**
 * Format all settings for display.
 */
function formatAllSettings(allSettings: Record<SettingsCategory, Record<string, unknown>>): string {
  const lines: string[] = [];
  lines.push("⚙️  Vellum Settings");
  lines.push("═".repeat(40));
  lines.push("");

  for (const category of VALID_CATEGORIES) {
    const settings = allSettings[category];
    const info = CATEGORY_INFO[category];

    lines.push(`📂 ${info.name}`);
    for (const [key, value] of Object.entries(settings)) {
      const displayValue = typeof value === "object" ? JSON.stringify(value) : String(value);
      lines.push(`   ${key}: ${displayValue}`);
    }
    lines.push("");
  }

  lines.push("─".repeat(40));
  lines.push("Use /settings <category> to view specific category");
  lines.push("Use /settings <key> <value> to modify a setting");

  return lines.join("\n");
}

// =============================================================================
// Settings Modification Helpers
// =============================================================================

/**
 * Map of settable keys to their handlers.
 */
const SETTABLE_KEYS: Record<string, (value: string) => CommandResult> = {
  theme: (value: string) => {
    setThemeInSettings(value);
    return success(`Theme set to: ${value}`);
  },
  mode: (value: string) => {
    if (!["vibe", "plan", "spec"].includes(value)) {
      return error("INVALID_ARGUMENT", `Invalid mode: ${value}. Valid modes: vibe, plan, spec`);
    }
    setModeInSettings(value as "vibe" | "plan" | "spec");
    return success(`Coding mode set to: ${value}`);
  },
  "diff-mode": (value: string) => {
    if (!["unified", "side-by-side"].includes(value)) {
      return error(
        "INVALID_ARGUMENT",
        `Invalid diff mode: ${value}. Valid modes: unified, side-by-side`
      );
    }
    setDiffViewMode(value as DiffViewMode);
    return success(`Diff view mode set to: ${value}`);
  },
  diffMode: (value: string) => SETTABLE_KEYS["diff-mode"]!(value),
  "think.enabled": (value: string) => {
    const enabled = value === "true" || value === "on" || value === "1";
    const current = getThinkingSettings();
    setThinkingSettings({ ...current, enabled } as ThinkingSettings);
    return success(`Extended thinking ${enabled ? "enabled" : "disabled"}`);
  },
  "think.budget": (value: string) => {
    const budget = parseInt(value, 10);
    if (isNaN(budget) || budget < 1000 || budget > 128000) {
      return error("INVALID_ARGUMENT", "Budget must be a number between 1000 and 128000");
    }
    const current = getThinkingSettings();
    setThinkingSettings({ ...current, budgetTokens: budget } as ThinkingSettings);
    return success(`Thinking budget set to: ${budget} tokens`);
  },
  alternateBuffer: (value: string) => {
    const enabled = value === "true" || value === "on" || value === "1";
    setAlternateBufferEnabled(enabled);
    return success(`Alternate buffer ${enabled ? "enabled" : "disabled"}`);
  },
  debug: (value: string) => {
    const enabled = value === "true" || value === "on" || value === "1";
    saveUserSetting("debug", enabled);
    return success(`Debug mode ${enabled ? "enabled" : "disabled"} (restart required)`);
  },
};

/**
 * Set a setting value.
 */
function setSetting(key: string, value: string): CommandResult {
  const handler = SETTABLE_KEYS[key];
  if (!handler) {
    const validKeys = Object.keys(SETTABLE_KEYS).join(", ");
    return error("INVALID_ARGUMENT", `Unknown setting key: ${key}\n\nSettable keys: ${validKeys}`);
  }
  return handler(value);
}

// =============================================================================
// /settings Command
// =============================================================================

/**
 * /settings command - View and modify application settings.
 *
 * Usage:
 * - /settings - Show all settings
 * - /settings <category> - Show settings for a category
 * - /settings <key> <value> - Set a specific setting
 */
export const settingsCommand: SlashCommand = {
  name: "settings",
  description: "View and modify application settings",
  kind: "builtin",
  category: "config",
  aliases: ["prefs", "preferences"],
  positionalArgs: [
    {
      name: "keyOrCategory",
      type: "string",
      description: "Category name or setting key",
      required: false,
    },
    {
      name: "value",
      type: "string",
      description: "Value to set (when setting a key)",
      required: false,
    },
  ],
  examples: [
    "/settings                      - Show all settings",
    "/settings general              - Show general settings",
    "/settings model                - Show model settings",
    "/settings theme dark           - Set theme to dark",
    "/settings mode vibe            - Set coding mode to vibe",
    "/settings think.enabled true   - Enable extended thinking",
    "/settings diff-mode unified    - Set diff view mode",
  ],
  subcommands: [
    ...VALID_CATEGORIES.map((cat) => ({
      name: cat,
      description: CATEGORY_INFO[cat].description,
    })),
    { name: "theme", description: "Set theme (e.g., dark, light, dracula)" },
    { name: "mode", description: "Set coding mode (vibe, plan, spec)" },
    { name: "diff-mode", description: "Set diff view mode (unified, side-by-side)" },
    { name: "think.enabled", description: "Enable/disable extended thinking" },
    { name: "think.budget", description: "Set thinking budget tokens" },
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const keyOrCategory = ctx.parsedArgs.positional[0] as string | undefined;
    const value = ctx.parsedArgs.positional[1] as string | undefined;

    // No arguments - show all settings
    if (!keyOrCategory) {
      const allSettings = getAllSettings();
      return success(formatAllSettings(allSettings));
    }

    // Check if it's a category
    if (VALID_CATEGORIES.includes(keyOrCategory as SettingsCategory) && !value) {
      const allSettings = getAllSettings();
      const categorySettings = allSettings[keyOrCategory as SettingsCategory];
      return success(formatSettingsDisplay(categorySettings, keyOrCategory));
    }

    // Check if setting a value
    if (value !== undefined) {
      return setSetting(keyOrCategory, value);
    }

    // Check if it's a known setting key (show its value)
    if (Object.keys(SETTABLE_KEYS).includes(keyOrCategory)) {
      const allSettings = getAllSettings();
      // Find the setting across categories
      for (const category of VALID_CATEGORIES) {
        const settings = allSettings[category];
        const normalizedKey = keyOrCategory.replace(".", "");
        for (const [k, v] of Object.entries(settings)) {
          if (k === keyOrCategory || k === normalizedKey) {
            return success(`${keyOrCategory}: ${v}`);
          }
        }
      }
    }

    // Unknown key/category
    return error(
      "INVALID_ARGUMENT",
      `Unknown setting or category: ${keyOrCategory}\n\nCategories: ${VALID_CATEGORIES.join(", ")}\nSettable keys: ${Object.keys(SETTABLE_KEYS).join(", ")}`
    );
  },
};

// =============================================================================
// Export Collection
// =============================================================================

/**
 * All settings-related slash commands.
 */
export const settingsSlashCommands: readonly SlashCommand[] = [settingsCommand] as const;
