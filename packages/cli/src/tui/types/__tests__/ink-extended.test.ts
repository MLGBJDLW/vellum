/**
 * Tests for Extended Ink Key Utilities
 */
import type { Key } from "ink";
import { describe, expect, it } from "vitest";
import { type ExtendedKey, extendKey, isEndKey, isHomeKey } from "../ink-extended.js";

describe("ink-extended", () => {
  // Base key object for testing
  const baseKey: Key = {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
  };

  describe("extendKey", () => {
    it("extends key object with home and end properties", () => {
      const result = extendKey("a", baseKey);
      expect(result).toHaveProperty("home");
      expect(result).toHaveProperty("end");
    });

    it("preserves original key properties", () => {
      const key: Key = { ...baseKey, ctrl: true, shift: true };
      const result = extendKey("a", key);
      expect(result.ctrl).toBe(true);
      expect(result.shift).toBe(true);
    });

    it("detects Home key (CSI H)", () => {
      const result = extendKey("\x1b[H", baseKey);
      expect(result.home).toBe(true);
      expect(result.end).toBe(false);
    });

    it("detects Home key (CSI 1 ~)", () => {
      const result = extendKey("\x1b[1~", baseKey);
      expect(result.home).toBe(true);
    });

    it("detects Home key (SS3 H)", () => {
      const result = extendKey("\x1bOH", baseKey);
      expect(result.home).toBe(true);
    });

    it("detects End key (CSI F)", () => {
      const result = extendKey("\x1b[F", baseKey);
      expect(result.end).toBe(true);
      expect(result.home).toBe(false);
    });

    it("detects End key (CSI 4 ~)", () => {
      const result = extendKey("\x1b[4~", baseKey);
      expect(result.end).toBe(true);
    });

    it("detects End key (SS3 F)", () => {
      const result = extendKey("\x1bOF", baseKey);
      expect(result.end).toBe(true);
    });

    it("returns false for both when regular input", () => {
      const result = extendKey("a", baseKey);
      expect(result.home).toBe(false);
      expect(result.end).toBe(false);
    });

    it("returns false for both on empty string", () => {
      const result = extendKey("", baseKey);
      expect(result.home).toBe(false);
      expect(result.end).toBe(false);
    });
  });

  describe("isHomeKey", () => {
    it("returns true for Home sequences", () => {
      expect(isHomeKey("\x1b[H")).toBe(true);
      expect(isHomeKey("\x1b[1~")).toBe(true);
      expect(isHomeKey("\x1bOH")).toBe(true);
    });

    it("returns false for non-Home input", () => {
      expect(isHomeKey("a")).toBe(false);
      expect(isHomeKey("\x1b[F")).toBe(false); // End key
      expect(isHomeKey("")).toBe(false);
    });
  });

  describe("isEndKey", () => {
    it("returns true for End sequences", () => {
      expect(isEndKey("\x1b[F")).toBe(true);
      expect(isEndKey("\x1b[4~")).toBe(true);
      expect(isEndKey("\x1bOF")).toBe(true);
    });

    it("returns false for non-End input", () => {
      expect(isEndKey("a")).toBe(false);
      expect(isEndKey("\x1b[H")).toBe(false); // Home key
      expect(isEndKey("")).toBe(false);
    });
  });

  describe("ExtendedKey type", () => {
    it("is assignable from extendKey result", () => {
      const result: ExtendedKey = extendKey("a", baseKey);
      expect(result.home).toBeDefined();
      expect(result.end).toBeDefined();
    });
  });
});
