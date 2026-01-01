/**
 * i18n Init Unit Tests
 *
 * Tests for locale resolution and initialization:
 * - resolveLocale() priority chain
 * - initI18n() initialization
 * - Source tracking for each priority level
 *
 * @module tui/i18n/__tests__/init
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initI18n, type ResolvedLocale, resolveLocale } from "../init.js";
import { DEFAULT_LOCALE } from "../language-config.js";

// Mock dependencies
vi.mock("../locale-detection.js", () => ({
  detectSystemLocale: vi.fn(),
}));

vi.mock("../settings-integration.js", () => ({
  getSavedLanguage: vi.fn(),
}));

vi.mock("../tui-namespace.js", () => ({
  setGlobalLocale: vi.fn(),
}));

import { detectSystemLocale } from "../locale-detection.js";
import { getSavedLanguage } from "../settings-integration.js";
import { setGlobalLocale } from "../tui-namespace.js";

// =============================================================================
// Test Setup
// =============================================================================

describe("init", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.VELLUM_LANGUAGE;

    // Default mock returns
    vi.mocked(detectSystemLocale).mockReturnValue({ locale: null, source: null });
    vi.mocked(getSavedLanguage).mockReturnValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // T023: resolveLocale Priority Chain Tests
  // ===========================================================================

  describe("resolveLocale", () => {
    describe("priority 1: CLI flag", () => {
      it("CLI flag has highest priority", () => {
        // Set up all sources with different values
        process.env.VELLUM_LANGUAGE = "en";
        vi.mocked(getSavedLanguage).mockReturnValue("en");
        vi.mocked(detectSystemLocale).mockReturnValue({ locale: "en", source: "LANG" });

        const result = resolveLocale({ cliLanguage: "zh" });

        expect(result.locale).toBe("zh");
        expect(result.source).toBe("cli-flag");
      });

      it("returns cli-flag source for valid CLI language", () => {
        const result = resolveLocale({ cliLanguage: "en" });

        expect(result.locale).toBe("en");
        expect(result.source).toBe("cli-flag");
      });

      it("skips invalid CLI language and checks next priority", () => {
        process.env.VELLUM_LANGUAGE = "zh";

        const result = resolveLocale({ cliLanguage: "invalid" });

        expect(result.locale).toBe("zh");
        expect(result.source).toBe("env-var");
      });

      it("skips empty CLI language", () => {
        process.env.VELLUM_LANGUAGE = "zh";

        const result = resolveLocale({ cliLanguage: "" });

        expect(result.locale).toBe("zh");
        expect(result.source).toBe("env-var");
      });
    });

    describe("priority 2: VELLUM_LANGUAGE env var", () => {
      it("uses VELLUM_LANGUAGE when CLI flag not provided", () => {
        process.env.VELLUM_LANGUAGE = "zh";
        vi.mocked(getSavedLanguage).mockReturnValue("en");

        const result = resolveLocale();

        expect(result.locale).toBe("zh");
        expect(result.source).toBe("env-var");
      });

      it("returns env-var source", () => {
        process.env.VELLUM_LANGUAGE = "en";

        const result = resolveLocale();

        expect(result.source).toBe("env-var");
      });

      it("skips invalid VELLUM_LANGUAGE", () => {
        process.env.VELLUM_LANGUAGE = "invalid";
        vi.mocked(getSavedLanguage).mockReturnValue("zh");

        const result = resolveLocale();

        expect(result.locale).toBe("zh");
        expect(result.source).toBe("settings");
      });
    });

    describe("priority 3: settings file", () => {
      it("uses saved settings when env var not set", () => {
        vi.mocked(getSavedLanguage).mockReturnValue("zh");

        const result = resolveLocale();

        expect(result.locale).toBe("zh");
        expect(result.source).toBe("settings");
      });

      it("returns settings source", () => {
        vi.mocked(getSavedLanguage).mockReturnValue("en");

        const result = resolveLocale();

        expect(result.source).toBe("settings");
      });

      it("skips invalid saved language (already filtered by getSavedLanguage)", () => {
        // getSavedLanguage already validates, so this tests undefined return
        vi.mocked(getSavedLanguage).mockReturnValue(undefined);
        vi.mocked(detectSystemLocale).mockReturnValue({ locale: "zh", source: "LANG" });

        const result = resolveLocale();

        expect(result.locale).toBe("zh");
        expect(result.source).toBe("system");
      });
    });

    describe("priority 4: system locale", () => {
      it("uses system locale when settings not available", () => {
        vi.mocked(detectSystemLocale).mockReturnValue({ locale: "zh", source: "LANG" });

        const result = resolveLocale();

        expect(result.locale).toBe("zh");
        expect(result.source).toBe("system");
      });

      it("returns system source", () => {
        vi.mocked(detectSystemLocale).mockReturnValue({ locale: "en", source: "LC_ALL" });

        const result = resolveLocale();

        expect(result.source).toBe("system");
      });

      it("skips unsupported system locale", () => {
        // detectSystemLocale returns null for unsupported
        vi.mocked(detectSystemLocale).mockReturnValue({ locale: null, source: null });

        const result = resolveLocale();

        expect(result.locale).toBe(DEFAULT_LOCALE);
        expect(result.source).toBe("default");
      });
    });

    describe("priority 5: default locale", () => {
      it('falls back to DEFAULT_LOCALE ("en") when no source available', () => {
        const result = resolveLocale();

        expect(result.locale).toBe("en");
        expect(result.source).toBe("default");
      });

      it("returns default source", () => {
        const result = resolveLocale();

        expect(result.source).toBe("default");
      });

      it("DEFAULT_LOCALE is 'en'", () => {
        expect(DEFAULT_LOCALE).toBe("en");
      });
    });

    describe("options handling", () => {
      it("works with undefined options", () => {
        const result = resolveLocale(undefined);

        expect(result).toBeDefined();
        expect(result.locale).toBe("en");
      });

      it("works with empty options object", () => {
        const result = resolveLocale({});

        expect(result).toBeDefined();
        expect(result.locale).toBe("en");
      });
    });
  });

  // ===========================================================================
  // T023: initI18n Tests
  // ===========================================================================

  describe("initI18n", () => {
    it("resolves and sets global locale", () => {
      vi.mocked(getSavedLanguage).mockReturnValue("zh");

      const result = initI18n();

      expect(setGlobalLocale).toHaveBeenCalledWith("zh");
      expect(result.locale).toBe("zh");
      expect(result.source).toBe("settings");
    });

    it("passes CLI language option to resolveLocale", () => {
      const result = initI18n({ cliLanguage: "zh" });

      expect(setGlobalLocale).toHaveBeenCalledWith("zh");
      expect(result.locale).toBe("zh");
      expect(result.source).toBe("cli-flag");
    });

    it("returns resolved locale information", () => {
      process.env.VELLUM_LANGUAGE = "en";

      const result = initI18n();

      expect(result).toEqual({
        locale: "en",
        source: "env-var",
      } satisfies ResolvedLocale);
    });

    it("sets default locale when no sources available", () => {
      const result = initI18n();

      expect(setGlobalLocale).toHaveBeenCalledWith("en");
      expect(result.locale).toBe("en");
      expect(result.source).toBe("default");
    });

    it("respects full priority chain", () => {
      // Set up lower priority sources
      process.env.VELLUM_LANGUAGE = "en";
      vi.mocked(getSavedLanguage).mockReturnValue("en");
      vi.mocked(detectSystemLocale).mockReturnValue({ locale: "en", source: "LANG" });

      // CLI flag should win
      const result = initI18n({ cliLanguage: "zh" });

      expect(result.locale).toBe("zh");
      expect(result.source).toBe("cli-flag");
    });
  });
});
