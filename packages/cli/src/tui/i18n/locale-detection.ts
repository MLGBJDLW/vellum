/**
 * Locale Detection Module
 *
 * Detects system locale from environment variables.
 * Follows POSIX locale conventions with Windows fallback support.
 *
 * @module tui/i18n/locale-detection
 */

import { DEFAULT_LOCALE, isLocaleSupported, type LocaleCode } from "./language-config.js";

/**
 * Result of parsing a POSIX locale string.
 */
export interface ParsedLocale {
  /** ISO 639-1 language code (e.g., "en", "zh") */
  language: string;
  /** ISO 3166-1 territory code (e.g., "US", "CN") */
  territory?: string;
}

/**
 * Source of locale detection.
 */
export type LocaleSource = "LC_ALL" | "LC_MESSAGES" | "LANG" | "VELLUM_LANGUAGE" | null;

/**
 * Result of system locale detection.
 */
export interface DetectedLocale {
  /** Detected locale code, or null if not detected */
  locale: LocaleCode | null;
  /** Source environment variable that provided the locale */
  source: LocaleSource;
}

/**
 * Parse a POSIX locale string into language and territory components.
 *
 * Handles formats like:
 * - "en" → { language: "en" }
 * - "en_US" → { language: "en", territory: "US" }
 * - "zh_CN.UTF-8" → { language: "zh", territory: "CN" }
 * - "en_US.UTF-8@modifier" → { language: "en", territory: "US" }
 *
 * @param localeString - The POSIX locale string to parse
 * @returns Parsed locale object, or null if invalid or unset ("C", "POSIX")
 *
 * @example
 * ```typescript
 * parseLocaleString("zh_CN.UTF-8"); // { language: "zh", territory: "CN" }
 * parseLocaleString("en");          // { language: "en" }
 * parseLocaleString("C");           // null
 * parseLocaleString("");            // null
 * ```
 */
export function parseLocaleString(localeString: string): ParsedLocale | null {
  // Handle empty, null-like, or POSIX default values
  const trimmed = localeString.trim();
  if (!trimmed || trimmed === "C" || trimmed === "POSIX") {
    return null;
  }

  // Remove encoding (e.g., ".UTF-8") and modifier (e.g., "@euro")
  // Format: language[_territory][.encoding][@modifier]
  const withoutModifier = trimmed.split("@")[0] ?? trimmed;
  const withoutEncoding = withoutModifier.split(".")[0] ?? withoutModifier;

  // Split into language and territory
  const parts = withoutEncoding.split("_");
  const languagePart = parts[0];
  if (!languagePart) {
    return null;
  }
  const language = languagePart.toLowerCase();

  // Validate language code (should be 2-3 characters)
  if (language.length < 2 || language.length > 3) {
    return null;
  }

  const result: ParsedLocale = { language };

  // Add territory if present
  if (parts[1]) {
    result.territory = parts[1].toUpperCase();
  }

  return result;
}

/**
 * Environment variables to check for locale, in priority order.
 */
const LOCALE_ENV_VARS = ["LC_ALL", "LC_MESSAGES", "LANG"] as const;

/**
 * Map parsed locale to a supported LocaleCode.
 *
 * Handles territory variants by first trying language-territory (e.g., "pt-BR"),
 * then falling back to just the language code.
 *
 * @param parsed - Parsed locale object
 * @returns Supported LocaleCode or null
 */
function mapToSupportedLocale(parsed: ParsedLocale): LocaleCode | null {
  // Try language-territory format first (e.g., "pt-BR")
  if (parsed.territory) {
    const withTerritory = `${parsed.language}-${parsed.territory}`;
    if (isLocaleSupported(withTerritory)) {
      return withTerritory as LocaleCode;
    }
  }

  // Fall back to just the language code
  if (isLocaleSupported(parsed.language)) {
    return parsed.language as LocaleCode;
  }

  return null;
}

/**
 * Detect system locale from environment variables.
 *
 * Checks environment variables in priority order:
 * 1. LC_ALL
 * 2. LC_MESSAGES
 * 3. LANG
 * 4. VELLUM_LANGUAGE (custom override)
 *
 * On Windows, if no locale is found, returns DEFAULT_LOCALE as fallback.
 *
 * @returns Detection result with locale code and source
 *
 * @example
 * ```typescript
 * // On a system with LANG=zh_CN.UTF-8
 * detectSystemLocale(); // { locale: "zh", source: "LANG" }
 *
 * // On Windows with no locale set
 * detectSystemLocale(); // { locale: "en", source: null }
 * ```
 */
export function detectSystemLocale(): DetectedLocale {
  // Check standard POSIX locale environment variables
  for (const envVar of LOCALE_ENV_VARS) {
    const value = process.env[envVar];
    if (value) {
      const parsed = parseLocaleString(value);
      if (parsed) {
        const locale = mapToSupportedLocale(parsed);
        if (locale) {
          return { locale, source: envVar };
        }
      }
    }
  }

  // Check custom VELLUM_LANGUAGE environment variable
  const vellumLang = process.env.VELLUM_LANGUAGE;
  if (vellumLang && isLocaleSupported(vellumLang)) {
    return { locale: vellumLang as LocaleCode, source: "VELLUM_LANGUAGE" };
  }

  // Windows fallback: use default locale since LANG/LC_* are typically not set
  if (process.platform === "win32") {
    return { locale: DEFAULT_LOCALE, source: null };
  }

  // No locale detected
  return { locale: null, source: null };
}
