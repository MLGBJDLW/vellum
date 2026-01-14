/**
 * Settings Integration Module
 *
 * Manages language preference storage in user settings file.
 * Provides graceful error handling for all file operations.
 *
 * @module tui/i18n/settings-integration
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { isLocaleSupported, type LocaleCode } from "./language-config.js";

/**
 * UI configuration options.
 */
export interface UISettings {
  /** Enable alternate screen buffer (default: true) */
  alternateBuffer?: boolean;
}

/**
 * Settings file structure.
 */
interface VellumSettings {
  language?: LocaleCode;
  bannerSeen?: boolean;
  ui?: UISettings;
  [key: string]: unknown;
}

/**
 * Get the path to the Vellum settings directory.
 *
 * @returns Absolute path to ~/.vellum/
 */
function getSettingsDir(): string {
  return path.join(os.homedir(), ".vellum");
}

/**
 * Get the path to the Vellum settings file.
 *
 * @returns Absolute path to ~/.vellum/settings.json
 */
function getSettingsPath(): string {
  return path.join(getSettingsDir(), "settings.json");
}

/**
 * Read and parse the settings file.
 *
 * @returns Parsed settings object, or null on any error
 */
function readSettings(): VellumSettings | null {
  try {
    const settingsPath = getSettingsPath();
    if (!fs.existsSync(settingsPath)) {
      return null;
    }
    const content = fs.readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;

    // Validate that parsed content is an object
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    return parsed as VellumSettings;
  } catch {
    // Silently handle any error (file not found, permission, parse error, etc.)
    return null;
  }
}

/**
 * Write settings to the settings file.
 *
 * Creates the settings directory if it doesn't exist.
 *
 * @param settings - Settings object to write
 * @returns True if successful, false on any error
 */
function writeSettings(settings: VellumSettings): boolean {
  try {
    const settingsDir = getSettingsDir();
    const settingsPath = getSettingsPath();

    // Ensure settings directory exists
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }

    const content = JSON.stringify(settings, null, 2);
    fs.writeFileSync(settingsPath, content, "utf-8");
    return true;
  } catch {
    // Silently handle any error (permission, disk space, etc.)
    return false;
  }
}

/**
 * Get the saved language preference from settings.
 *
 * @returns Saved locale code, or undefined if not set or invalid
 *
 * @example
 * ```typescript
 * const savedLang = getSavedLanguage();
 * if (savedLang) {
 *   setLocale(savedLang);
 * }
 * ```
 */
export function getSavedLanguage(): LocaleCode | undefined {
  const settings = readSettings();
  if (!settings?.language) {
    return undefined;
  }

  // Validate that the saved language is still supported
  if (!isLocaleSupported(settings.language)) {
    return undefined;
  }

  return settings.language;
}

/**
 * Save language preference to settings.
 *
 * Creates the settings file and directory if they don't exist.
 * Preserves other settings in the file.
 *
 * @param locale - The locale code to save
 *
 * @example
 * ```typescript
 * saveLanguage("zh");
 * // Now getSavedLanguage() returns "zh"
 * ```
 */
export function saveLanguage(locale: LocaleCode): void {
  const existingSettings = readSettings() ?? {};
  const newSettings: VellumSettings = {
    ...existingSettings,
    language: locale,
  };
  writeSettings(newSettings);
}

/**
 * Remove language preference from settings.
 *
 * Preserves other settings in the file.
 * Does nothing if settings file doesn't exist.
 *
 * @example
 * ```typescript
 * clearSavedLanguage();
 * // Now getSavedLanguage() returns undefined
 * ```
 */
export function clearSavedLanguage(): void {
  const settings = readSettings();
  if (!settings) {
    return;
  }

  // Remove the language property while preserving others
  const { language: _, ...rest } = settings;
  writeSettings(rest as VellumSettings);
}

/**
 * Check whether the startup banner has been shown before.
 *
 * @returns True if the banner has been shown, false otherwise
 */
export function getBannerSeen(): boolean {
  const settings = readSettings();
  return settings?.bannerSeen === true;
}

/**
 * Persist the banner seen flag.
 *
 * @param seen - Whether the banner has been shown
 */
export function setBannerSeen(seen: boolean): void {
  const existingSettings = readSettings() ?? {};
  const newSettings: VellumSettings = {
    ...existingSettings,
    bannerSeen: seen,
  };
  writeSettings(newSettings);
}

// =============================================================================
// UI Settings
// =============================================================================

/**
 * Get the alternate buffer preference from settings.
 *
 * @returns True if alternate buffer is enabled (default: true), false if disabled
 *
 * @example
 * ```typescript
 * const altBufferEnabled = getAlternateBufferEnabled();
 * ```
 */
export function getAlternateBufferEnabled(): boolean {
  const settings = readSettings();
  // Default to true if not set
  return settings?.ui?.alternateBuffer ?? true;
}

/**
 * Save alternate buffer preference to settings.
 *
 * Creates the settings file and directory if they don't exist.
 * Preserves other settings in the file.
 *
 * @param enabled - Whether to enable alternate buffer
 *
 * @example
 * ```typescript
 * setAlternateBufferEnabled(false);
 * // Now getAlternateBufferEnabled() returns false
 * ```
 */
export function setAlternateBufferEnabled(enabled: boolean): void {
  const existingSettings = readSettings() ?? {};
  const newSettings: VellumSettings = {
    ...existingSettings,
    ui: {
      ...existingSettings.ui,
      alternateBuffer: enabled,
    },
  };
  writeSettings(newSettings);
}

/**
 * Get all UI settings.
 *
 * @returns UI settings object with defaults applied
 */
export function getUISettings(): UISettings {
  const settings = readSettings();
  return {
    alternateBuffer: settings?.ui?.alternateBuffer ?? true,
  };
}
