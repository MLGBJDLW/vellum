/**
 * TUI i18n Module
 *
 * Internationalization support for TUI components.
 *
 * @module tui/i18n
 */

// Initialization
export type { ResolvedLocale, ResolvedLocaleSource, ResolveLocaleOptions } from "./init.js";
export { initI18n, resolveLocale } from "./init.js";
export type { LanguageInfo, LocaleCode } from "./language-config.js";
// Language configuration
export {
  DEFAULT_LOCALE,
  getAvailableLocales,
  getLanguageDisplayName,
  isLocaleSupported,
  LANGUAGES,
  SUPPORTED_LOCALES,
} from "./language-config.js";
// Locale detection
export type { DetectedLocale, LocaleSource, ParsedLocale } from "./locale-detection.js";
export { detectSystemLocale, parseLocaleString } from "./locale-detection.js";
// Settings integration
export {
  clearSavedLanguage,
  getAlternateBufferEnabled,
  getBannerSeen,
  getSavedLanguage,
  getUISettings,
  saveLanguage,
  setAlternateBufferEnabled,
  setBannerSeen,
  type UISettings,
} from "./settings-integration.js";

// Hook and utilities
export {
  getGlobalLocale,
  setGlobalLocale,
  translate,
  useTUITranslation,
} from "./tui-namespace.js";

// Types
export type {
  TranslationFunction,
  TUITranslationKey,
  TUITranslations,
  UseTUITranslationReturn,
} from "./types.js";
