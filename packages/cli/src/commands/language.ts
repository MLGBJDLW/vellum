/**
 * Language Command
 *
 * Slash command for viewing and changing the TUI language setting.
 *
 * @module cli/commands/language
 */

import {
  clearSavedLanguage,
  getAvailableLocales,
  getGlobalLocale,
  getLanguageDisplayName,
  isLocaleSupported,
  type LocaleCode,
  saveLanguage,
  setGlobalLocale,
} from "../tui/i18n/index.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";

// =============================================================================
// T011/T012: Language Command Implementation
// =============================================================================

/**
 * Format a locale for display with its native name.
 *
 * @param locale - The locale code
 * @returns Formatted string like "zh (中文)"
 */
function formatLocale(locale: LocaleCode): string {
  return `${locale} (${getLanguageDisplayName(locale)})`;
}

/**
 * Build the list of available languages for display.
 *
 * @returns Formatted list of available locales
 */
function buildLanguageList(): string {
  const locales = getAvailableLocales();
  return locales.map((locale) => `  • ${formatLocale(locale)}`).join("\n");
}

/**
 * Handle no-argument case: show current locale and list available languages.
 *
 * @returns Success result with current language info
 */
function handleShowCurrent(): CommandResult {
  const currentLocale = getGlobalLocale();
  const availableList = buildLanguageList();

  const message = [
    `Current language: ${currentLocale}`,
    "",
    "Available languages:",
    availableList,
    "",
    'Use "/language <code>" to switch, or "/language auto" for auto-detection.',
  ].join("\n");

  return {
    kind: "success",
    message,
    data: {
      currentLocale,
      availableLocales: getAvailableLocales(),
    },
  };
}

/**
 * Handle "auto" argument: clear saved preference and use auto-detection.
 *
 * @returns Success result confirming auto mode
 */
function handleAutoDetect(): CommandResult {
  clearSavedLanguage();

  return {
    kind: "success",
    message:
      "Language preference cleared. Auto-detection will be used.\nRestart the application for the change to take effect.",
    data: {
      mode: "auto",
    },
  };
}

/**
 * Handle valid locale code: switch to that language and save preference.
 *
 * @param locale - The valid locale code to switch to
 * @returns Success result confirming language change
 */
function handleValidLocale(locale: LocaleCode): CommandResult {
  // Save the preference for future sessions
  saveLanguage(locale);

  // Switch immediately for the current session
  setGlobalLocale(locale);

  return {
    kind: "success",
    message: `Language changed to ${formatLocale(locale)}.`,
    data: {
      locale,
      displayName: getLanguageDisplayName(locale),
    },
    refresh: true,
  };
}

/**
 * Handle invalid locale code: show error with suggestions.
 *
 * @param input - The invalid locale string provided
 * @returns Error result with available options
 */
function handleInvalidLocale(input: string): CommandResult {
  const availableList = buildLanguageList();

  return {
    kind: "error",
    code: "INVALID_ARGUMENT",
    message: `Unknown language: "${input}"`,
    suggestions: [
      `Available languages:\n${availableList}`,
      'Use "/language auto" for auto-detection',
    ],
  };
}

/**
 * Language command - view or change the current language setting
 *
 * Usage:
 *   /language          - Show current language and available options
 *   /language <code>   - Switch to a specific language (e.g., /language zh)
 *   /language auto     - Clear preference and use auto-detection
 */
export const languageCommand: SlashCommand = {
  name: "language",
  description: "Change or view current language setting",
  kind: "builtin",
  category: "config",
  aliases: ["lang"],
  positionalArgs: [
    {
      name: "locale",
      type: "string",
      description: 'Language code (e.g., "en", "zh") or "auto"',
      required: false,
    },
  ],
  examples: [
    "/language - Show current language",
    "/language zh - Switch to Chinese",
    "/language auto - Use auto-detection",
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const { parsedArgs } = ctx;

    // Case 1: No arguments - show current locale and available options
    if (parsedArgs.positional.length === 0) {
      return handleShowCurrent();
    }

    const localeArg = String(parsedArgs.positional[0]).toLowerCase().trim();

    // Case 2: "auto" - clear saved preference
    if (localeArg === "auto") {
      return handleAutoDetect();
    }

    // Case 3: Valid locale code - switch to that language
    if (isLocaleSupported(localeArg)) {
      return handleValidLocale(localeArg);
    }

    // Case 4: Invalid locale code - show error with suggestions
    return handleInvalidLocale(localeArg);
  },
};
