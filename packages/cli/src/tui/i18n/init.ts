/**
 * i18n Initialization Module
 *
 * Provides locale resolution and initialization functions.
 * Implements the priority chain for determining the active locale.
 *
 * @module tui/i18n/init
 */

import { DEFAULT_LOCALE, isLocaleSupported, type LocaleCode } from "./language-config.js";
import { detectSystemLocale } from "./locale-detection.js";
import { getSavedLanguage } from "./settings-integration.js";
import { setGlobalLocale } from "./tui-namespace.js";

/**
 * Options for resolving the locale.
 */
export interface ResolveLocaleOptions {
  /** CLI --language flag value */
  cliLanguage?: string;
}

/**
 * Source of the resolved locale.
 */
export type ResolvedLocaleSource = "cli-flag" | "env-var" | "settings" | "system" | "default";

/**
 * Result of locale resolution.
 */
export interface ResolvedLocale {
  /** The resolved locale code */
  locale: LocaleCode;
  /** Source that provided the locale */
  source: ResolvedLocaleSource;
}

/**
 * Resolve the locale to use based on priority chain.
 *
 * Priority order (highest to lowest):
 * 1. CLI flag (`options.cliLanguage`) → source: "cli-flag"
 * 2. VELLUM_LANGUAGE environment variable → source: "env-var"
 * 3. Saved settings (user preference) → source: "settings"
 * 4. System locale detection → source: "system"
 * 5. Default locale (en) → source: "default"
 *
 * Each source is validated with `isLocaleSupported()` before use.
 *
 * @param options - Resolution options
 * @returns Resolved locale with source information
 *
 * @example
 * ```typescript
 * // With CLI flag
 * resolveLocale({ cliLanguage: "zh" });
 * // { locale: "zh", source: "cli-flag" }
 *
 * // Without options, uses priority chain
 * resolveLocale();
 * // { locale: "en", source: "settings" } // if saved in settings
 * ```
 */
export function resolveLocale(options?: ResolveLocaleOptions): ResolvedLocale {
  // 1. CLI flag (highest priority)
  if (options?.cliLanguage && isLocaleSupported(options.cliLanguage)) {
    return {
      locale: options.cliLanguage as LocaleCode,
      source: "cli-flag",
    };
  }

  // 2. VELLUM_LANGUAGE environment variable
  const envLocale = process.env.VELLUM_LANGUAGE;
  if (envLocale && isLocaleSupported(envLocale)) {
    return {
      locale: envLocale as LocaleCode,
      source: "env-var",
    };
  }

  // 3. Saved settings
  const savedLocale = getSavedLanguage();
  if (savedLocale && isLocaleSupported(savedLocale)) {
    return {
      locale: savedLocale,
      source: "settings",
    };
  }

  // 4. System locale detection
  const systemDetected = detectSystemLocale();
  if (systemDetected.locale && isLocaleSupported(systemDetected.locale)) {
    return {
      locale: systemDetected.locale,
      source: "system",
    };
  }

  // 5. Default locale (lowest priority)
  return {
    locale: DEFAULT_LOCALE,
    source: "default",
  };
}

/**
 * Initialize the i18n system with resolved locale.
 *
 * Resolves the locale using the priority chain and sets it as
 * the global locale for the application.
 *
 * @param options - Resolution options
 * @returns Resolved locale with source information
 *
 * @example
 * ```typescript
 * // Initialize with CLI flag
 * const result = initI18n({ cliLanguage: "zh" });
 * console.log(`Using ${result.locale} from ${result.source}`);
 *
 * // Initialize without options
 * const result = initI18n();
 * // Uses priority chain: cli-flag → env-var → settings → system → default
 * ```
 */
export function initI18n(options?: ResolveLocaleOptions): ResolvedLocale {
  const resolved = resolveLocale(options);
  setGlobalLocale(resolved.locale);
  return resolved;
}
