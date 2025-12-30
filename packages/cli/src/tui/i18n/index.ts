/**
 * TUI i18n Module
 *
 * Internationalization support for TUI components.
 *
 * @module tui/i18n
 */

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
