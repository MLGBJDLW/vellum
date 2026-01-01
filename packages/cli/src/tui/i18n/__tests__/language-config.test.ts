/**
 * Language Config Unit Tests
 *
 * Tests for language configuration constants and utilities:
 * - isLocaleSupported() validation
 * - getLanguageDisplayName() returns native names
 * - getAvailableLocales() returns all locales
 * - SUPPORTED_LOCALES and DEFAULT_LOCALE constants
 *
 * @module tui/i18n/__tests__/language-config
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  getAvailableLocales,
  getLanguageDisplayName,
  isLocaleSupported,
  LANGUAGES,
  type LocaleCode,
  SUPPORTED_LOCALES,
} from "../language-config.js";

// =============================================================================
// T020: isLocaleSupported Tests
// =============================================================================

describe("isLocaleSupported", () => {
  it("returns true for 'en'", () => {
    expect(isLocaleSupported("en")).toBe(true);
  });

  it("returns true for 'zh'", () => {
    expect(isLocaleSupported("zh")).toBe(true);
  });

  it("returns false for 'invalid'", () => {
    expect(isLocaleSupported("invalid")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isLocaleSupported("")).toBe(false);
  });

  it("returns false for unsupported locale codes", () => {
    expect(isLocaleSupported("fr")).toBe(false);
    expect(isLocaleSupported("de")).toBe(false);
    expect(isLocaleSupported("ja")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isLocaleSupported("EN")).toBe(false);
    expect(isLocaleSupported("En")).toBe(false);
    expect(isLocaleSupported("ZH")).toBe(false);
  });

  it("acts as type guard narrowing to LocaleCode", () => {
    const input: string = "en";
    if (isLocaleSupported(input)) {
      // TypeScript should narrow input to LocaleCode here
      const locale: LocaleCode = input;
      expect(locale).toBe("en");
    } else {
      // This should not be reached
      expect.fail("Should have recognized 'en' as supported");
    }
  });
});

// =============================================================================
// T020: getLanguageDisplayName Tests
// =============================================================================

describe("getLanguageDisplayName", () => {
  it("returns 'English' for 'en'", () => {
    expect(getLanguageDisplayName("en")).toBe("English");
  });

  it("returns '中文' for 'zh'", () => {
    expect(getLanguageDisplayName("zh")).toBe("中文");
  });

  it("returns native names for all supported locales", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const name = getLanguageDisplayName(locale);
      expect(name).toBe(LANGUAGES[locale].nativeName);
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// T020: getAvailableLocales Tests
// =============================================================================

describe("getAvailableLocales", () => {
  it("returns array containing 'en'", () => {
    const locales = getAvailableLocales();
    expect(locales).toContain("en");
  });

  it("returns array containing 'zh'", () => {
    const locales = getAvailableLocales();
    expect(locales).toContain("zh");
  });

  it("returns at least 2 locales", () => {
    const locales = getAvailableLocales();
    expect(locales.length).toBeGreaterThanOrEqual(2);
  });

  it("returns readonly array", () => {
    const locales = getAvailableLocales();
    // TypeScript compile-time check - array should be readonly
    expect(Array.isArray(locales)).toBe(true);
  });

  it("returns same reference as SUPPORTED_LOCALES", () => {
    expect(getAvailableLocales()).toBe(SUPPORTED_LOCALES);
  });
});

// =============================================================================
// T020: SUPPORTED_LOCALES Constant Tests
// =============================================================================

describe("SUPPORTED_LOCALES", () => {
  it("contains 'en'", () => {
    expect(SUPPORTED_LOCALES).toContain("en");
  });

  it("contains 'zh'", () => {
    expect(SUPPORTED_LOCALES).toContain("zh");
  });

  it("is a readonly array", () => {
    expect(Array.isArray(SUPPORTED_LOCALES)).toBe(true);
  });

  it("matches keys of LANGUAGES object", () => {
    const languageKeys = Object.keys(LANGUAGES);
    expect([...SUPPORTED_LOCALES].sort()).toEqual(languageKeys.sort());
  });
});

// =============================================================================
// T020: DEFAULT_LOCALE Constant Tests
// =============================================================================

describe("DEFAULT_LOCALE", () => {
  it("is 'en'", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("is a supported locale", () => {
    expect(isLocaleSupported(DEFAULT_LOCALE)).toBe(true);
  });

  it("is included in SUPPORTED_LOCALES", () => {
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
  });
});

// =============================================================================
// T020: LANGUAGES Object Tests
// =============================================================================

describe("LANGUAGES", () => {
  it("has correct structure for English", () => {
    expect(LANGUAGES.en).toEqual({
      locale: "en",
      name: "English",
      nativeName: "English",
      flag: "🇺🇸",
    });
  });

  it("has correct structure for Chinese", () => {
    expect(LANGUAGES.zh).toEqual({
      locale: "zh",
      name: "Chinese",
      nativeName: "中文",
      flag: "🇨🇳",
    });
  });

  it("all entries have required properties", () => {
    for (const [code, info] of Object.entries(LANGUAGES)) {
      expect(info.locale).toBe(code);
      expect(typeof info.name).toBe("string");
      expect(typeof info.nativeName).toBe("string");
      expect(typeof info.flag).toBe("string");
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.nativeName.length).toBeGreaterThan(0);
    }
  });
});
