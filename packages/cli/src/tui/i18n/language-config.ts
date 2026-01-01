/**
 * Language Configuration Module
 *
 * Core language configuration for i18n support.
 * Defines supported locales and provides validation utilities.
 *
 * @module tui/i18n/language-config
 */

/**
 * Supported locale codes.
 * Add new locales here as they are implemented.
 */
export type LocaleCode = "en" | "zh";

/**
 * Metadata for a supported language.
 */
export interface LanguageInfo {
  /** ISO locale code */
  readonly locale: LocaleCode;
  /** English name of the language */
  readonly name: string;
  /** Native name of the language */
  readonly nativeName: string;
  /** Flag emoji for the language */
  readonly flag: string;
}

/**
 * Language metadata for all supported locales.
 */
export const LANGUAGES: Record<LocaleCode, LanguageInfo> = {
  en: {
    locale: "en",
    name: "English",
    nativeName: "English",
    flag: "🇺🇸",
  },
  zh: {
    locale: "zh",
    name: "Chinese",
    nativeName: "中文",
    flag: "🇨🇳",
  },
} as const;

/**
 * Array of all supported locale codes.
 */
export const SUPPORTED_LOCALES: readonly LocaleCode[] = Object.keys(LANGUAGES) as LocaleCode[];

/**
 * Default locale used when no locale is specified.
 */
export const DEFAULT_LOCALE: LocaleCode = "en";

/**
 * Type guard to check if a string is a supported locale code.
 *
 * @param locale - The locale string to validate
 * @returns True if the locale is supported
 *
 * @example
 * ```typescript
 * const userLocale = getUserLocale();
 * if (isLocaleSupported(userLocale)) {
 *   // userLocale is now typed as LocaleCode
 *   setLocale(userLocale);
 * }
 * ```
 */
export function isLocaleSupported(locale: string): locale is LocaleCode {
  return locale in LANGUAGES;
}

/**
 * Get the native display name for a locale.
 *
 * @param locale - The locale code
 * @returns The native name of the language
 *
 * @example
 * ```typescript
 * getLanguageDisplayName("zh"); // "中文"
 * getLanguageDisplayName("en"); // "English"
 * ```
 */
export function getLanguageDisplayName(locale: LocaleCode): string {
  return LANGUAGES[locale].nativeName;
}

/**
 * Get all available locale codes.
 *
 * @returns Readonly array of supported locale codes
 *
 * @example
 * ```typescript
 * const locales = getAvailableLocales();
 * // ["en", "zh"]
 * ```
 */
export function getAvailableLocales(): readonly LocaleCode[] {
  return SUPPORTED_LOCALES;
}
