/**
 * Settings Integration Unit Tests
 *
 * Tests for language preference storage:
 * - getSavedLanguage() retrieval
 * - saveLanguage() persistence
 * - clearSavedLanguage() removal
 * - File system mocking for all operations
 *
 * @module tui/i18n/__tests__/settings-integration
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSavedLanguage, getSavedLanguage, saveLanguage } from "../settings-integration.js";

// Mock the fs module
vi.mock("node:fs");
vi.mock("node:os");

// =============================================================================
// Test Setup
// =============================================================================

const mockHomedir = "/mock/home";
const mockSettingsDir = path.join(mockHomedir, ".vellum");
const mockSettingsPath = path.join(mockSettingsDir, "settings.json");

describe("settings-integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue(mockHomedir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // T022: getSavedLanguage Tests
  // ===========================================================================

  describe("getSavedLanguage", () => {
    it("returns undefined when settings file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getSavedLanguage();

      expect(result).toBeUndefined();
      expect(fs.existsSync).toHaveBeenCalledWith(mockSettingsPath);
    });

    it("returns locale when settings has valid language", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ language: "zh" }));

      const result = getSavedLanguage();

      expect(result).toBe("zh");
    });

    it("returns English locale when settings has 'en'", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ language: "en" }));

      const result = getSavedLanguage();

      expect(result).toBe("en");
    });

    it("returns undefined on corrupted JSON (no throw)", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("{ invalid json }");

      const result = getSavedLanguage();

      expect(result).toBeUndefined();
    });

    it("returns undefined when language key is missing", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ otherKey: "value" }));

      const result = getSavedLanguage();

      expect(result).toBeUndefined();
    });

    it("returns undefined for unsupported locale in settings", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ language: "fr" }));

      const result = getSavedLanguage();

      expect(result).toBeUndefined();
    });

    it("returns undefined on file read error (no throw)", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("Permission denied");
      });

      const result = getSavedLanguage();

      expect(result).toBeUndefined();
    });

    it("returns undefined when settings is an array (invalid structure)", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(["en"]));

      const result = getSavedLanguage();

      expect(result).toBeUndefined();
    });

    it("returns undefined when settings is null (invalid structure)", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("null");

      const result = getSavedLanguage();

      expect(result).toBeUndefined();
    });
  });

  // ===========================================================================
  // T022: saveLanguage Tests
  // ===========================================================================

  describe("saveLanguage", () => {
    it("creates settings file with language when no file exists", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === mockSettingsPath) return false;
        if (p === mockSettingsDir) return false;
        return false;
      });

      saveLanguage("zh");

      expect(fs.mkdirSync).toHaveBeenCalledWith(mockSettingsDir, { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        mockSettingsPath,
        JSON.stringify({ language: "zh" }, null, 2),
        "utf-8"
      );
    });

    it("updates existing settings file preserving other keys", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === mockSettingsPath) return true;
        if (p === mockSettingsDir) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ otherKey: "value", language: "en" })
      );

      saveLanguage("zh");

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        mockSettingsPath,
        JSON.stringify({ otherKey: "value", language: "zh" }, null, 2),
        "utf-8"
      );
    });

    it("creates directory if it does not exist", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === mockSettingsPath) return false;
        if (p === mockSettingsDir) return false;
        return false;
      });

      saveLanguage("en");

      expect(fs.mkdirSync).toHaveBeenCalledWith(mockSettingsDir, { recursive: true });
    });

    it("handles write errors gracefully (no throw)", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error("Permission denied");
      });

      // Should not throw
      expect(() => saveLanguage("zh")).not.toThrow();
    });
  });

  // ===========================================================================
  // T022: clearSavedLanguage Tests
  // ===========================================================================

  describe("clearSavedLanguage", () => {
    it("removes language key from settings", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ language: "zh", otherKey: "value" })
      );

      clearSavedLanguage();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        mockSettingsPath,
        JSON.stringify({ otherKey: "value" }, null, 2),
        "utf-8"
      );
    });

    it("does nothing when settings file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      clearSavedLanguage();

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it("preserves other settings when clearing language", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          language: "zh",
          theme: "dark",
          customSetting: 123,
        })
      );

      clearSavedLanguage();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        mockSettingsPath,
        JSON.stringify({ theme: "dark", customSetting: 123 }, null, 2),
        "utf-8"
      );
    });

    it("handles corrupted JSON gracefully (no throw)", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("{ invalid }");

      // Should not throw
      expect(() => clearSavedLanguage()).not.toThrow();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it("does nothing when settings has no language key", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ otherKey: "value" }));

      clearSavedLanguage();

      // Still writes since we destructure and create new object
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });
});
