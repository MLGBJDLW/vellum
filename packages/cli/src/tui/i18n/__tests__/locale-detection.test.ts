/**
 * Locale Detection Unit Tests
 *
 * Tests for system locale detection:
 * - parseLocaleString() parsing POSIX locale formats
 * - detectSystemLocale() with env var mocking
 * - Priority chain: LC_ALL > LC_MESSAGES > LANG
 *
 * @module tui/i18n/__tests__/locale-detection
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detectSystemLocale, parseLocaleString } from "../locale-detection.js";

// =============================================================================
// T021: parseLocaleString Tests
// =============================================================================

describe("parseLocaleString", () => {
  describe("valid locale strings", () => {
    it("parses 'zh_CN.UTF-8' correctly", () => {
      const result = parseLocaleString("zh_CN.UTF-8");
      expect(result).toEqual({ language: "zh", territory: "CN" });
    });

    it("parses 'en_US' correctly", () => {
      const result = parseLocaleString("en_US");
      expect(result).toEqual({ language: "en", territory: "US" });
    });

    it("parses language-only format 'en'", () => {
      const result = parseLocaleString("en");
      expect(result).toEqual({ language: "en" });
    });

    it("parses language-only format 'zh'", () => {
      const result = parseLocaleString("zh");
      expect(result).toEqual({ language: "zh" });
    });

    it("parses locale with encoding 'en_US.UTF-8'", () => {
      const result = parseLocaleString("en_US.UTF-8");
      expect(result).toEqual({ language: "en", territory: "US" });
    });

    it("parses locale with modifier 'en_US.UTF-8@euro'", () => {
      const result = parseLocaleString("en_US.UTF-8@euro");
      expect(result).toEqual({ language: "en", territory: "US" });
    });

    it("handles uppercase language codes by lowercasing", () => {
      const result = parseLocaleString("EN_US");
      expect(result).toEqual({ language: "en", territory: "US" });
    });

    it("handles lowercase territory codes by uppercasing", () => {
      const result = parseLocaleString("en_us");
      expect(result).toEqual({ language: "en", territory: "US" });
    });

    it("parses three-letter language codes", () => {
      const result = parseLocaleString("deu_DE");
      expect(result).toEqual({ language: "deu", territory: "DE" });
    });
  });

  describe("invalid locale strings", () => {
    it("returns null for 'C'", () => {
      expect(parseLocaleString("C")).toBeNull();
    });

    it("returns null for 'POSIX'", () => {
      expect(parseLocaleString("POSIX")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseLocaleString("")).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
      expect(parseLocaleString("   ")).toBeNull();
    });

    it("returns null for single character", () => {
      expect(parseLocaleString("e")).toBeNull();
    });

    it("handles whitespace around valid locale", () => {
      const result = parseLocaleString("  en_US  ");
      expect(result).toEqual({ language: "en", territory: "US" });
    });
  });
});

// =============================================================================
// T021: detectSystemLocale Tests
// =============================================================================

describe("detectSystemLocale", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env before each test
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear all locale-related env vars
    delete process.env.LC_ALL;
    delete process.env.LC_MESSAGES;
    delete process.env.LANG;
    delete process.env.VELLUM_LANGUAGE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("priority chain", () => {
    it("LC_ALL has highest priority", () => {
      process.env.LC_ALL = "zh_CN.UTF-8";
      process.env.LC_MESSAGES = "en_US.UTF-8";
      process.env.LANG = "en_US.UTF-8";

      const result = detectSystemLocale();

      expect(result.locale).toBe("zh");
      expect(result.source).toBe("LC_ALL");
    });

    it("LC_MESSAGES is second priority when LC_ALL not set", () => {
      process.env.LC_MESSAGES = "zh_CN.UTF-8";
      process.env.LANG = "en_US.UTF-8";

      const result = detectSystemLocale();

      expect(result.locale).toBe("zh");
      expect(result.source).toBe("LC_MESSAGES");
    });

    it("LANG is third priority when LC_ALL and LC_MESSAGES not set", () => {
      process.env.LANG = "zh_CN.UTF-8";

      const result = detectSystemLocale();

      expect(result.locale).toBe("zh");
      expect(result.source).toBe("LANG");
    });

    it("VELLUM_LANGUAGE is checked after POSIX vars", () => {
      process.env.VELLUM_LANGUAGE = "zh";

      const result = detectSystemLocale();

      expect(result.locale).toBe("zh");
      expect(result.source).toBe("VELLUM_LANGUAGE");
    });

    it("skips invalid locale in LC_ALL and checks next", () => {
      process.env.LC_ALL = "C";
      process.env.LANG = "zh_CN.UTF-8";

      const result = detectSystemLocale();

      expect(result.locale).toBe("zh");
      expect(result.source).toBe("LANG");
    });
  });

  describe("supported locale detection", () => {
    it("detects English locale from LANG", () => {
      process.env.LANG = "en_US.UTF-8";

      const result = detectSystemLocale();

      expect(result.locale).toBe("en");
      expect(result.source).toBe("LANG");
    });

    it("detects Chinese locale from LANG", () => {
      process.env.LANG = "zh_CN.UTF-8";

      const result = detectSystemLocale();

      expect(result.locale).toBe("zh");
      expect(result.source).toBe("LANG");
    });

    it("returns null locale for unsupported language", () => {
      process.env.LANG = "fr_FR.UTF-8";

      const result = detectSystemLocale();

      // May return default on Windows or null on other platforms
      if (process.platform === "win32") {
        expect(result.locale).toBe("en");
        expect(result.source).toBeNull();
      } else {
        expect(result.locale).toBeNull();
        expect(result.source).toBeNull();
      }
    });
  });

  describe("edge cases", () => {
    it("returns appropriate result when no env vars set", () => {
      const result = detectSystemLocale();

      // Windows returns default, others return null
      if (process.platform === "win32") {
        expect(result.locale).toBe("en");
        expect(result.source).toBeNull();
      } else {
        expect(result.locale).toBeNull();
        expect(result.source).toBeNull();
      }
    });

    it("handles empty env var values", () => {
      process.env.LC_ALL = "";
      process.env.LANG = "en_US.UTF-8";

      const result = detectSystemLocale();

      expect(result.locale).toBe("en");
      expect(result.source).toBe("LANG");
    });

    it("validates VELLUM_LANGUAGE against supported locales", () => {
      process.env.VELLUM_LANGUAGE = "invalid";

      const result = detectSystemLocale();

      // Should not use invalid VELLUM_LANGUAGE
      if (process.platform === "win32") {
        expect(result.locale).toBe("en");
      } else {
        expect(result.locale).toBeNull();
      }
    });

    it("accepts valid VELLUM_LANGUAGE", () => {
      process.env.VELLUM_LANGUAGE = "en";

      const result = detectSystemLocale();

      expect(result.locale).toBe("en");
      expect(result.source).toBe("VELLUM_LANGUAGE");
    });
  });
});
