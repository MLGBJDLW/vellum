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
import { isConptyTerminal } from "../utils/detectTerminal.js";
import { isLocaleSupported, type LocaleCode } from "./language-config.js";

/**
 * UI configuration options.
 */
export interface UISettings {
  /** Enable alternate screen buffer (default: true) */
  alternateBuffer?: boolean;
}

/**
 * Thinking display mode.
 * - "full": Show thinking content (default, current behavior)
 * - "compact": Only show thinking header, no content preview
 */
export type ThinkingDisplayMode = "full" | "compact";

/**
 * Thinking mode configuration.
 */
export interface ThinkingSettings {
  enabled?: boolean;
  budgetTokens?: number;
  priority?: "global" | "mode" | "merge";
  displayMode?: ThinkingDisplayMode;
  expandedByDefault?: boolean;
  autoCollapse?: boolean;
  autoCollapseDelayMs?: number;
}

/**
 * Model configuration.
 */
export interface ModelSettings {
  provider?: string;
  modelId?: string;
}

/**
 * Diff view display mode configuration.
 */
export type DiffViewMode = "unified" | "side-by-side";

/**
 * Settings file structure.
 */
export interface VellumSettings {
  language?: LocaleCode;
  bannerSeen?: boolean;
  ui?: UISettings;
  thinking?: ThinkingSettings;
  theme?: string;
  model?: ModelSettings;
  mode?: string; // "vibe" | "plan" | "spec"
  diffViewMode?: DiffViewMode;
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
 * Load the current settings from the settings file.
 *
 * @returns Current settings object, or empty object if file doesn't exist
 */
export function loadSettings(): VellumSettings {
  return readSettings() ?? {};
}

/**
 * Save settings to the settings file.
 *
 * @param settings - Complete settings object to save
 * @returns True if successful, false on error
 */
export function saveSettings(settings: VellumSettings): boolean {
  return writeSettings(settings);
}

/**
 * Save a single user setting by key.
 *
 * This is a convenience helper that loads current settings,
 * updates the specified key, and saves back to disk.
 *
 * @param key - The setting key to update
 * @param value - The new value for the setting
 *
 * @example
 * ```typescript
 * await saveUserSetting("thinking", { enabled: true, budgetTokens: 20000 });
 * await saveUserSetting("theme", "dracula");
 * await saveUserSetting("mode", "plan");
 * ```
 */
export async function saveUserSetting<K extends keyof VellumSettings>(
  key: K,
  value: VellumSettings[K]
): Promise<void> {
  const current = loadSettings();
  const updated = { ...current, [key]: value };
  saveSettings(updated);
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
export function getAlternateBufferSetting(): boolean | undefined {
  const settings = readSettings();
  return settings?.ui?.alternateBuffer;
}

export function getDefaultAlternateBufferEnabled(): boolean {
  return !isConptyTerminal();
}

export function getAlternateBufferEnabled(): boolean {
  const explicit = getAlternateBufferSetting();
  if (typeof explicit === "boolean") {
    return explicit;
  }
  return getDefaultAlternateBufferEnabled();
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
    alternateBuffer: settings?.ui?.alternateBuffer ?? getDefaultAlternateBufferEnabled(),
  };
}

// =============================================================================
// Thinking Settings
// =============================================================================

/**
 * Get the saved thinking settings.
 *
 * @returns Thinking settings object, or undefined if not saved
 *
 * @example
 * ```typescript
 * const thinking = getThinkingSettings();
 * if (thinking?.enabled) {
 *   enableThinking(thinking.budgetTokens);
 * }
 * ```
 */
export function getThinkingSettings(): ThinkingSettings | undefined {
  const settings = readSettings();
  return settings?.thinking;
}

/**
 * Save thinking settings.
 *
 * @param thinking - Thinking settings to save
 */
export function setThinkingSettings(thinking: ThinkingSettings): void {
  const existingSettings = readSettings() ?? {};
  const newSettings: VellumSettings = {
    ...existingSettings,
    thinking,
  };
  writeSettings(newSettings);
}

/**
 * Get the thinking display mode preference.
 *
 * @returns Display mode ("full" or "compact"), defaults to "full"
 *
 * @example
 * ```typescript
 * const mode = getThinkingDisplayMode();
 * // mode is "full" | "compact"
 * ```
 */
export function getThinkingDisplayMode(): ThinkingDisplayMode {
  const settings = readSettings();
  const mode = settings?.thinking?.displayMode;
  if (mode === "full" || mode === "compact") {
    return mode;
  }
  return "full"; // Default
}

/**
 * Set the thinking display mode preference.
 *
 * @param mode - Display mode to save ("full" or "compact")
 *
 * @example
 * ```typescript
 * setThinkingDisplayMode("compact");
 * // Now thinking blocks will be compact by default
 * ```
 */
export function setThinkingDisplayMode(mode: ThinkingDisplayMode): void {
  const existingSettings = readSettings() ?? {};
  const existingThinking = existingSettings.thinking ?? {};
  const newSettings: VellumSettings = {
    ...existingSettings,
    thinking: {
      ...existingThinking,
      displayMode: mode,
    },
  };
  writeSettings(newSettings);
}

/**
 * Listeners for thinking expanded-by-default changes.
 */
type ThinkingExpandedByDefaultListener = (expanded: boolean) => void;
const thinkingExpandedByDefaultListeners: Set<ThinkingExpandedByDefaultListener> = new Set();

/**
 * Listeners for thinking auto-collapse changes.
 */
type ThinkingAutoCollapseListener = (enabled: boolean) => void;
const thinkingAutoCollapseListeners: Set<ThinkingAutoCollapseListener> = new Set();

/**
 * Listeners for thinking auto-collapse delay changes.
 */
type ThinkingAutoCollapseDelayListener = (delayMs: number) => void;
const thinkingAutoCollapseDelayListeners: Set<ThinkingAutoCollapseDelayListener> = new Set();

/**
 * Subscribe to thinking expanded-by-default changes.
 *
 * @param listener - Callback function for expanded-by-default changes
 * @returns Unsubscribe function
 */
export function subscribeToThinkingExpandedByDefault(
  listener: ThinkingExpandedByDefaultListener
): () => void {
  thinkingExpandedByDefaultListeners.add(listener);
  return () => {
    thinkingExpandedByDefaultListeners.delete(listener);
  };
}

/**
 * Notify all expanded-by-default listeners.
 */
function notifyThinkingExpandedByDefault(expanded: boolean): void {
  for (const listener of thinkingExpandedByDefaultListeners) {
    listener(expanded);
  }
}

/**
 * Notify all auto-collapse listeners.
 */
function notifyThinkingAutoCollapse(enabled: boolean): void {
  for (const listener of thinkingAutoCollapseListeners) {
    listener(enabled);
  }
}

/**
 * Notify all auto-collapse delay listeners.
 */
function notifyThinkingAutoCollapseDelay(delayMs: number): void {
  for (const listener of thinkingAutoCollapseDelayListeners) {
    listener(delayMs);
  }
}

/**
 * Get the thinking expanded by default preference.
 *
 * @returns True if thinking blocks start expanded by default (default: true)
 *
 * @example
 * ```typescript
 * const expanded = getThinkingExpandedByDefault();
 * // expanded is true | false
 * ```
 */
export function getThinkingExpandedByDefault(): boolean {
  const settings = readSettings();
  const value = settings?.thinking?.expandedByDefault;
  // Default to true (expanded) if not set
  return value !== false;
}

/**
 * Set the thinking expanded by default preference.
 *
 * @param expanded - Whether thinking blocks start expanded by default
 *
 * @example
 * ```typescript
 * setThinkingExpandedByDefault(false);
 * // Now thinking blocks will be collapsed by default
 * ```
 */
export function setThinkingExpandedByDefault(expanded: boolean): void {
  const existingSettings = readSettings() ?? {};
  const existingThinking = existingSettings.thinking ?? {};
  const newSettings: VellumSettings = {
    ...existingSettings,
    thinking: {
      ...existingThinking,
      expandedByDefault: expanded,
    },
  };
  writeSettings(newSettings);
  notifyThinkingExpandedByDefault(expanded);
}

/**
 * Subscribe to thinking auto-collapse changes.
 *
 * @param listener - Callback function for auto-collapse changes
 * @returns Unsubscribe function
 */
export function subscribeToThinkingAutoCollapse(
  listener: ThinkingAutoCollapseListener
): () => void {
  thinkingAutoCollapseListeners.add(listener);
  return () => {
    thinkingAutoCollapseListeners.delete(listener);
  };
}

/**
 * Subscribe to thinking auto-collapse delay changes.
 *
 * @param listener - Callback function for delay changes
 * @returns Unsubscribe function
 */
export function subscribeToThinkingAutoCollapseDelay(
  listener: ThinkingAutoCollapseDelayListener
): () => void {
  thinkingAutoCollapseDelayListeners.add(listener);
  return () => {
    thinkingAutoCollapseDelayListeners.delete(listener);
  };
}

/** Default delay for auto-collapse in milliseconds. */
const DEFAULT_THINKING_AUTO_COLLAPSE_DELAY_MS = 300;

/**
 * Get the thinking auto-collapse preference.
 *
 * @returns True if thinking blocks auto-collapse after streaming ends (default: false)
 */
export function getThinkingAutoCollapse(): boolean {
  const settings = readSettings();
  const value = settings?.thinking?.autoCollapse;
  return value === true;
}

/**
 * Set the thinking auto-collapse preference.
 *
 * @param enabled - Whether to auto-collapse thinking blocks after streaming
 */
export function setThinkingAutoCollapse(enabled: boolean): void {
  const existingSettings = readSettings() ?? {};
  const existingThinking = existingSettings.thinking ?? {};
  const newSettings: VellumSettings = {
    ...existingSettings,
    thinking: {
      ...existingThinking,
      autoCollapse: enabled,
    },
  };
  writeSettings(newSettings);
  notifyThinkingAutoCollapse(enabled);
}

/**
 * Get the thinking auto-collapse delay in milliseconds.
 *
 * @returns Delay in ms (default: 300)
 */
export function getThinkingAutoCollapseDelayMs(): number {
  const settings = readSettings();
  const value = settings?.thinking?.autoCollapseDelayMs;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return DEFAULT_THINKING_AUTO_COLLAPSE_DELAY_MS;
}

/**
 * Set the thinking auto-collapse delay in milliseconds.
 *
 * @param delayMs - Delay in ms (>= 0)
 */
export function setThinkingAutoCollapseDelayMs(delayMs: number): void {
  const safeDelay =
    typeof delayMs === "number" && Number.isFinite(delayMs) && delayMs >= 0
      ? Math.floor(delayMs)
      : DEFAULT_THINKING_AUTO_COLLAPSE_DELAY_MS;
  const existingSettings = readSettings() ?? {};
  const existingThinking = existingSettings.thinking ?? {};
  const newSettings: VellumSettings = {
    ...existingSettings,
    thinking: {
      ...existingThinking,
      autoCollapseDelayMs: safeDelay,
    },
  };
  writeSettings(newSettings);
  notifyThinkingAutoCollapseDelay(safeDelay);
}

// =============================================================================
// Theme Settings
// =============================================================================

/**
 * Get the saved theme preference.
 *
 * @returns Theme name, or undefined if not saved
 */
export function getThemeFromSettings(): string | undefined {
  const settings = readSettings();
  return settings?.theme;
}

/**
 * Save theme preference.
 *
 * @param theme - Theme name to save
 */
export function setThemeInSettings(theme: string): void {
  const existingSettings = readSettings() ?? {};
  const newSettings: VellumSettings = {
    ...existingSettings,
    theme,
  };
  writeSettings(newSettings);
}

// =============================================================================
// Mode Settings
// =============================================================================

/**
 * Get the saved mode preference.
 *
 * @returns Mode name, or undefined if not saved
 */
export function getModeFromSettings(): string | undefined {
  const settings = readSettings();
  return settings?.mode;
}

/**
 * Save mode preference.
 *
 * @param mode - Mode name to save
 */
export function setModeInSettings(mode: string): void {
  const existingSettings = readSettings() ?? {};
  const newSettings: VellumSettings = {
    ...existingSettings,
    mode,
  };
  writeSettings(newSettings);
}

// =============================================================================
// Model Settings
// =============================================================================

/**
 * Get the saved model configuration.
 *
 * @returns Model settings, or undefined if not saved
 */
export function getModelSettings(): ModelSettings | undefined {
  const settings = readSettings();
  return settings?.model;
}

/**
 * Save model configuration.
 *
 * @param model - Model settings to save
 */
export function setModelSettings(model: ModelSettings): void {
  const existingSettings = readSettings() ?? {};
  const newSettings: VellumSettings = {
    ...existingSettings,
    model,
  };
  writeSettings(newSettings);
}

// =============================================================================
// Diff View Mode Settings
// =============================================================================

/**
 * Get the saved diff view mode preference.
 *
 * @returns Diff view mode ("unified" or "side-by-side"), or undefined if not saved
 *
 * @example
 * ```typescript
 * const mode = getDiffViewMode();
 * // mode is "unified" | "side-by-side" | undefined
 * ```
 */
export function getDiffViewMode(): DiffViewMode | undefined {
  const settings = readSettings();
  const mode = settings?.diffViewMode;
  // Validate the value
  if (mode === "unified" || mode === "side-by-side") {
    return mode;
  }
  return undefined;
}

/**
 * Save diff view mode preference.
 *
 * @param mode - Diff view mode to save ("unified" or "side-by-side")
 *
 * @example
 * ```typescript
 * setDiffViewMode("side-by-side");
 * // Now getDiffViewMode() returns "side-by-side"
 * ```
 */
export function setDiffViewMode(mode: DiffViewMode): void {
  const existingSettings = readSettings() ?? {};
  const newSettings: VellumSettings = {
    ...existingSettings,
    diffViewMode: mode,
  };
  writeSettings(newSettings);
}
