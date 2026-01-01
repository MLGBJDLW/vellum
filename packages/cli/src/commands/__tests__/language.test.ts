/**
 * Language Command Unit Tests
 *
 * Tests for /language slash command:
 * - No-argument shows current locale and available languages
 * - Valid locale switches and saves
 * - Invalid locale shows error with suggestions
 * - "auto" clears preference
 *
 * @module cli/commands/__tests__/language
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { languageCommand } from "../language.js";
import type { CommandContext, CommandError, CommandSuccess, ParsedArgs } from "../types.js";

// Mock i18n module
vi.mock("../../tui/i18n/index.js", () => ({
  clearSavedLanguage: vi.fn(),
  getAvailableLocales: vi.fn(() => ["en", "zh"] as const),
  getGlobalLocale: vi.fn(() => "en"),
  getLanguageDisplayName: vi.fn((locale: string) => {
    const names: Record<string, string> = {
      en: "English",
      zh: "中文",
    };
    return names[locale] ?? locale;
  }),
  isLocaleSupported: vi.fn((locale: string) => ["en", "zh"].includes(locale)),
  saveLanguage: vi.fn(),
  setGlobalLocale: vi.fn(),
}));

import {
  clearSavedLanguage,
  getAvailableLocales,
  getGlobalLocale,
  getLanguageDisplayName,
  isLocaleSupported,
  saveLanguage,
  setGlobalLocale,
} from "../../tui/i18n/index.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock CommandContext for testing
 */
function createMockContext(overrides: Partial<ParsedArgs> = {}): CommandContext {
  return {
    session: {
      id: "test-session",
      provider: "anthropic",
      cwd: "/test",
    },
    credentials: {
      resolve: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    } as unknown as CommandContext["credentials"],
    toolRegistry: {
      get: vi.fn(),
      list: vi.fn(),
    } as unknown as CommandContext["toolRegistry"],
    parsedArgs: {
      command: overrides.command ?? "language",
      positional: overrides.positional ?? [],
      named: overrides.named ?? {},
      raw: overrides.raw ?? "/language",
    },
    emit: vi.fn(),
  };
}

// =============================================================================
// T024: Language Command Tests
// =============================================================================

describe("languageCommand", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset mock implementations
    vi.mocked(getGlobalLocale).mockReturnValue("en");
    vi.mocked(getAvailableLocales).mockReturnValue(["en", "zh"]);
    vi.mocked(getLanguageDisplayName).mockImplementation((locale: string) => {
      const names: Record<string, string> = {
        en: "English",
        zh: "中文",
      };
      return names[locale] ?? locale;
    });
    vi.mocked(isLocaleSupported).mockImplementation((locale: string) =>
      ["en", "zh"].includes(locale)
    );
  });

  describe("command metadata", () => {
    it("has correct name", () => {
      expect(languageCommand.name).toBe("language");
    });

    it("has description", () => {
      expect(languageCommand.description).toBeTruthy();
    });

    it("has lang alias", () => {
      expect(languageCommand.aliases).toContain("lang");
    });

    it("is a builtin command", () => {
      expect(languageCommand.kind).toBe("builtin");
    });

    it("is in config category", () => {
      expect(languageCommand.category).toBe("config");
    });
  });

  describe("no arguments - show current", () => {
    it("shows current locale", async () => {
      const ctx = createMockContext({ positional: [] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const success = result as CommandSuccess;
      expect(success.message).toContain("Current language: en");
    });

    it("shows available languages", async () => {
      const ctx = createMockContext({ positional: [] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const success = result as CommandSuccess;
      expect(success.message).toContain("Available languages:");
      expect(success.message).toContain("en (English)");
      expect(success.message).toContain("zh (中文)");
    });

    it("includes usage hint", async () => {
      const ctx = createMockContext({ positional: [] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const success = result as CommandSuccess;
      expect(success.message).toContain("/language <code>");
      expect(success.message).toContain("/language auto");
    });

    it("returns data with current and available locales", async () => {
      const ctx = createMockContext({ positional: [] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const success = result as CommandSuccess;
      expect(success.data).toEqual({
        currentLocale: "en",
        availableLocales: ["en", "zh"],
      });
    });
  });

  describe("valid locale - switch language", () => {
    it("switches to Chinese with /language zh", async () => {
      const ctx = createMockContext({ positional: ["zh"] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("success");
      expect(saveLanguage).toHaveBeenCalledWith("zh");
      expect(setGlobalLocale).toHaveBeenCalledWith("zh");
    });

    it("saves the language preference", async () => {
      const ctx = createMockContext({ positional: ["zh"] });

      await languageCommand.execute(ctx);

      expect(saveLanguage).toHaveBeenCalledWith("zh");
    });

    it("sets global locale immediately", async () => {
      const ctx = createMockContext({ positional: ["en"] });

      await languageCommand.execute(ctx);

      expect(setGlobalLocale).toHaveBeenCalledWith("en");
    });

    it("returns success message with locale info", async () => {
      const ctx = createMockContext({ positional: ["zh"] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const success = result as CommandSuccess;
      expect(success.message).toContain("Language changed to zh");
      expect(success.message).toContain("中文");
    });

    it("returns data with locale and display name", async () => {
      const ctx = createMockContext({ positional: ["zh"] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const success = result as CommandSuccess;
      expect(success.data).toEqual({
        locale: "zh",
        displayName: "中文",
      });
    });

    it("sets refresh flag for UI update", async () => {
      const ctx = createMockContext({ positional: ["zh"] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const success = result as CommandSuccess;
      expect(success.refresh).toBe(true);
    });

    it("handles uppercase input", async () => {
      const ctx = createMockContext({ positional: ["ZH"] });

      const result = await languageCommand.execute(ctx);

      // Will be lowercased and validated
      expect(result.kind).toBe("success");
      expect(saveLanguage).toHaveBeenCalledWith("zh");
    });

    it("handles whitespace in input", async () => {
      const ctx = createMockContext({ positional: ["  zh  "] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("success");
      expect(saveLanguage).toHaveBeenCalledWith("zh");
    });
  });

  describe("invalid locale - show error", () => {
    it("shows error for invalid locale code", async () => {
      const ctx = createMockContext({ positional: ["invalid"] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("error");
      const error = result as CommandError;
      expect(error.message).toContain('Unknown language: "invalid"');
    });

    it("does not save invalid locale", async () => {
      const ctx = createMockContext({ positional: ["fr"] });

      await languageCommand.execute(ctx);

      expect(saveLanguage).not.toHaveBeenCalled();
      expect(setGlobalLocale).not.toHaveBeenCalled();
    });

    it("includes available languages in suggestions", async () => {
      const ctx = createMockContext({ positional: ["invalid"] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("error");
      const error = result as CommandError;
      expect(error.suggestions).toBeDefined();
      expect(error.suggestions?.some((s) => s.includes("en"))).toBe(true);
      expect(error.suggestions?.some((s) => s.includes("zh"))).toBe(true);
    });

    it("suggests auto option", async () => {
      const ctx = createMockContext({ positional: ["invalid"] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("error");
      const error = result as CommandError;
      expect(error.suggestions?.some((s) => s.includes("auto"))).toBe(true);
    });

    it("returns INVALID_ARGUMENT error code", async () => {
      const ctx = createMockContext({ positional: ["xyz"] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("error");
      const error = result as CommandError;
      expect(error.code).toBe("INVALID_ARGUMENT");
    });
  });

  describe("auto - clear preference", () => {
    it("clears saved language preference", async () => {
      const ctx = createMockContext({ positional: ["auto"] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("success");
      expect(clearSavedLanguage).toHaveBeenCalled();
    });

    it("returns success message about auto-detection", async () => {
      const ctx = createMockContext({ positional: ["auto"] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const success = result as CommandSuccess;
      expect(success.message).toContain("preference cleared");
      expect(success.message).toContain("Auto-detection");
    });

    it("returns data with mode auto", async () => {
      const ctx = createMockContext({ positional: ["auto"] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const success = result as CommandSuccess;
      expect(success.data).toEqual({ mode: "auto" });
    });

    it("does not set global locale immediately", async () => {
      const ctx = createMockContext({ positional: ["auto"] });

      await languageCommand.execute(ctx);

      expect(setGlobalLocale).not.toHaveBeenCalled();
    });

    it("handles AUTO uppercase", async () => {
      const ctx = createMockContext({ positional: ["AUTO"] });

      const result = await languageCommand.execute(ctx);

      expect(result.kind).toBe("success");
      expect(clearSavedLanguage).toHaveBeenCalled();
    });
  });
});
