// ============================================
// Legacy Mode Mapping - Tests
// ============================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitDeprecationWarning,
  getLegacyTemperature,
  InvalidModeError,
  isLegacyMode,
  isValidCodingMode,
  LEGACY_MODE_MAP,
  LEGACY_MODES,
  legacyToNewMode,
  type NormalizationResult,
  normalizeMode,
} from "../legacy-modes.js";

describe("Legacy Mode Mapping", () => {
  // ============================================
  // T049: Legacy Mode Map
  // ============================================
  describe("LEGACY_MODE_MAP", () => {
    it("should contain mapping for 'code' → 'vibe'", () => {
      expect(LEGACY_MODE_MAP.code).toEqual({ mode: "vibe" });
    });

    it("should contain mapping for 'draft' → 'vibe' with temperature 0.8", () => {
      expect(LEGACY_MODE_MAP.draft).toEqual({ mode: "vibe", temperature: 0.8 });
    });

    it("should contain mapping for 'debug' → 'vibe' with temperature 0.1", () => {
      expect(LEGACY_MODE_MAP.debug).toEqual({ mode: "vibe", temperature: 0.1 });
    });

    it("should contain mapping for 'ask' → 'plan'", () => {
      expect(LEGACY_MODE_MAP.ask).toEqual({ mode: "plan" });
    });

    it("should contain identity mapping for 'plan' → 'plan'", () => {
      expect(LEGACY_MODE_MAP.plan).toEqual({ mode: "plan" });
    });

    it("should have exactly 5 legacy mappings", () => {
      expect(Object.keys(LEGACY_MODE_MAP)).toHaveLength(5);
    });
  });

  describe("LEGACY_MODES", () => {
    it("should include all legacy mode names", () => {
      expect(LEGACY_MODES).toContain("code");
      expect(LEGACY_MODES).toContain("draft");
      expect(LEGACY_MODES).toContain("debug");
      expect(LEGACY_MODES).toContain("ask");
      expect(LEGACY_MODES).toContain("plan");
    });

    it("should have exactly 5 entries", () => {
      expect(LEGACY_MODES).toHaveLength(5);
    });
  });

  // ============================================
  // T050: normalizeMode() Function
  // ============================================
  describe("normalizeMode", () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      // Clear any environment variable
      delete process.env.VELLUM_SUPPRESS_DEPRECATION;
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it("should pass through 'vibe' unchanged", () => {
      const result = normalizeMode("vibe");
      expect(result).toEqual<NormalizationResult>({
        mode: "vibe",
        wasLegacy: false,
        originalName: "vibe",
      });
    });

    it("should pass through 'plan' (new name) unchanged", () => {
      const result = normalizeMode("plan");
      // 'plan' exists in both legacy and new - should prefer new
      expect(result.mode).toBe("plan");
      // 'plan' is valid in new system, so wasLegacy should be false
      expect(result.wasLegacy).toBe(false);
      expect(result.originalName).toBe("plan");
    });

    it("should pass through 'spec' unchanged", () => {
      const result = normalizeMode("spec");
      expect(result).toEqual<NormalizationResult>({
        mode: "spec",
        wasLegacy: false,
        originalName: "spec",
      });
    });

    it("should normalize 'code' to 'vibe'", () => {
      const result = normalizeMode("code");
      expect(result.mode).toBe("vibe");
      expect(result.wasLegacy).toBe(true);
      expect(result.originalName).toBe("code");
      expect(result.temperatureOverride).toBeUndefined();
    });

    it("should normalize 'draft' to 'vibe' with temperature 0.8", () => {
      const result = normalizeMode("draft");
      expect(result.mode).toBe("vibe");
      expect(result.wasLegacy).toBe(true);
      expect(result.originalName).toBe("draft");
      expect(result.temperatureOverride).toBe(0.8);
    });

    it("should normalize 'debug' to 'vibe' with temperature 0.1", () => {
      const result = normalizeMode("debug");
      expect(result.mode).toBe("vibe");
      expect(result.wasLegacy).toBe(true);
      expect(result.originalName).toBe("debug");
      expect(result.temperatureOverride).toBe(0.1);
    });

    it("should normalize 'ask' to 'plan'", () => {
      const result = normalizeMode("ask");
      expect(result.mode).toBe("plan");
      expect(result.wasLegacy).toBe(true);
      expect(result.originalName).toBe("ask");
      expect(result.temperatureOverride).toBeUndefined();
    });

    it("should throw InvalidModeError for unknown mode", () => {
      expect(() => normalizeMode("foo")).toThrow(InvalidModeError);
      expect(() => normalizeMode("unknown")).toThrow(InvalidModeError);
      expect(() => normalizeMode("")).toThrow(InvalidModeError);
    });

    it("should include valid options in error message", () => {
      try {
        normalizeMode("invalid");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidModeError);
        const invalidError = error as InvalidModeError;
        expect(invalidError.invalidMode).toBe("invalid");
        expect(invalidError.validOptions).toContain("vibe");
        expect(invalidError.validOptions).toContain("plan");
        expect(invalidError.validOptions).toContain("spec");
        expect(invalidError.validOptions).toContain("code");
        expect(invalidError.validOptions).toContain("draft");
      }
    });

    it("should emit deprecation warning for legacy modes", () => {
      normalizeMode("code");
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "⚠️ 'code' mode is deprecated. Use 'vibe' instead."
      );
    });

    it("should not emit deprecation warning for new modes", () => {
      normalizeMode("vibe");
      normalizeMode("spec");
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // T051: Deprecation Warning Emission
  // ============================================
  describe("emitDeprecationWarning", () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      delete process.env.VELLUM_SUPPRESS_DEPRECATION;
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
      delete process.env.VELLUM_SUPPRESS_DEPRECATION;
    });

    it("should log deprecation warning by default", () => {
      emitDeprecationWarning("code", "vibe");
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "⚠️ 'code' mode is deprecated. Use 'vibe' instead."
      );
    });

    it("should suppress warning when VELLUM_SUPPRESS_DEPRECATION=true", () => {
      process.env.VELLUM_SUPPRESS_DEPRECATION = "true";
      emitDeprecationWarning("code", "vibe");
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should not suppress warning when VELLUM_SUPPRESS_DEPRECATION=false", () => {
      process.env.VELLUM_SUPPRESS_DEPRECATION = "false";
      emitDeprecationWarning("code", "vibe");
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it("should not suppress warning when VELLUM_SUPPRESS_DEPRECATION is empty", () => {
      process.env.VELLUM_SUPPRESS_DEPRECATION = "";
      emitDeprecationWarning("draft", "vibe");
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it("should format warning message correctly for all legacy modes", () => {
      emitDeprecationWarning("draft", "vibe");
      expect(consoleWarnSpy).toHaveBeenLastCalledWith(
        "⚠️ 'draft' mode is deprecated. Use 'vibe' instead."
      );

      emitDeprecationWarning("debug", "vibe");
      expect(consoleWarnSpy).toHaveBeenLastCalledWith(
        "⚠️ 'debug' mode is deprecated. Use 'vibe' instead."
      );

      emitDeprecationWarning("ask", "plan");
      expect(consoleWarnSpy).toHaveBeenLastCalledWith(
        "⚠️ 'ask' mode is deprecated. Use 'plan' instead."
      );
    });
  });

  // ============================================
  // T052: legacyToNewMode() Function
  // ============================================
  describe("legacyToNewMode", () => {
    it("should return 'vibe' for 'code'", () => {
      expect(legacyToNewMode("code")).toBe("vibe");
    });

    it("should return 'vibe' for 'draft'", () => {
      expect(legacyToNewMode("draft")).toBe("vibe");
    });

    it("should return 'vibe' for 'debug'", () => {
      expect(legacyToNewMode("debug")).toBe("vibe");
    });

    it("should return 'plan' for 'ask'", () => {
      expect(legacyToNewMode("ask")).toBe("plan");
    });

    it("should return 'plan' for 'plan' (identity)", () => {
      expect(legacyToNewMode("plan")).toBe("plan");
    });

    it("should return undefined for unknown modes", () => {
      expect(legacyToNewMode("vibe")).toBeUndefined();
      expect(legacyToNewMode("spec")).toBeUndefined();
      expect(legacyToNewMode("foo")).toBeUndefined();
      expect(legacyToNewMode("")).toBeUndefined();
    });
  });

  // ============================================
  // Helper Functions
  // ============================================
  describe("isValidCodingMode", () => {
    it("should return true for valid coding modes", () => {
      expect(isValidCodingMode("vibe")).toBe(true);
      expect(isValidCodingMode("plan")).toBe(true);
      expect(isValidCodingMode("spec")).toBe(true);
    });

    it("should return false for legacy modes", () => {
      expect(isValidCodingMode("code")).toBe(false);
      expect(isValidCodingMode("draft")).toBe(false);
      expect(isValidCodingMode("debug")).toBe(false);
      expect(isValidCodingMode("ask")).toBe(false);
    });

    it("should return false for invalid modes", () => {
      expect(isValidCodingMode("foo")).toBe(false);
      expect(isValidCodingMode("")).toBe(false);
    });
  });

  describe("isLegacyMode", () => {
    it("should return true for legacy modes (excluding plan)", () => {
      expect(isLegacyMode("code")).toBe(true);
      expect(isLegacyMode("draft")).toBe(true);
      expect(isLegacyMode("debug")).toBe(true);
      expect(isLegacyMode("ask")).toBe(true);
    });

    it("should return false for 'plan' (exists in both systems)", () => {
      // 'plan' is valid in the new system, so it's not considered legacy
      expect(isLegacyMode("plan")).toBe(false);
    });

    it("should return false for new coding modes", () => {
      expect(isLegacyMode("vibe")).toBe(false);
      expect(isLegacyMode("spec")).toBe(false);
    });

    it("should return false for unknown modes", () => {
      expect(isLegacyMode("foo")).toBe(false);
      expect(isLegacyMode("")).toBe(false);
    });
  });

  describe("getLegacyTemperature", () => {
    it("should return temperature for draft mode", () => {
      expect(getLegacyTemperature("draft")).toBe(0.8);
    });

    it("should return temperature for debug mode", () => {
      expect(getLegacyTemperature("debug")).toBe(0.1);
    });

    it("should return undefined for modes without temperature override", () => {
      expect(getLegacyTemperature("code")).toBeUndefined();
      expect(getLegacyTemperature("ask")).toBeUndefined();
      expect(getLegacyTemperature("plan")).toBeUndefined();
    });

    it("should return undefined for unknown modes", () => {
      expect(getLegacyTemperature("vibe")).toBeUndefined();
      expect(getLegacyTemperature("spec")).toBeUndefined();
      expect(getLegacyTemperature("foo")).toBeUndefined();
    });
  });

  // ============================================
  // InvalidModeError
  // ============================================
  describe("InvalidModeError", () => {
    it("should have correct name", () => {
      const error = new InvalidModeError("foo", ["vibe", "plan", "spec"]);
      expect(error.name).toBe("InvalidModeError");
    });

    it("should store invalid mode", () => {
      const error = new InvalidModeError("invalid", ["vibe", "plan"]);
      expect(error.invalidMode).toBe("invalid");
    });

    it("should store valid options", () => {
      const options = ["vibe", "plan", "spec"];
      const error = new InvalidModeError("foo", options);
      expect(error.validOptions).toEqual(options);
    });

    it("should format error message correctly", () => {
      const error = new InvalidModeError("foo", ["a", "b", "c"]);
      expect(error.message).toBe("Invalid mode 'foo'. Valid options: a, b, c");
    });

    it("should be an instance of Error", () => {
      const error = new InvalidModeError("foo", []);
      expect(error).toBeInstanceOf(Error);
    });
  });

  // ============================================
  // Integration: normalizeMode with suppression
  // ============================================
  describe("normalizeMode with VELLUM_SUPPRESS_DEPRECATION", () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
      delete process.env.VELLUM_SUPPRESS_DEPRECATION;
    });

    it("should normalize legacy mode but suppress warning", () => {
      process.env.VELLUM_SUPPRESS_DEPRECATION = "true";

      const result = normalizeMode("code");

      expect(result.mode).toBe("vibe");
      expect(result.wasLegacy).toBe(true);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should normalize all legacy modes without warnings when suppressed", () => {
      process.env.VELLUM_SUPPRESS_DEPRECATION = "true";

      normalizeMode("code");
      normalizeMode("draft");
      normalizeMode("debug");
      normalizeMode("ask");

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });
});
