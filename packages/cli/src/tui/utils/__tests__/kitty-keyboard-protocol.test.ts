import { describe, expect, it, vi } from "vitest";
import {
  detectKittyKeyboardProtocol,
  disableKittyKeyboardProtocol,
  enableKittyKeyboardProtocol,
  isKittySequence,
  KittyModifiers,
  parseEnhancedKey,
} from "../kitty-keyboard-protocol.js";

describe("kitty-keyboard-protocol", () => {
  describe("detectKittyKeyboardProtocol", () => {
    it("should return false in non-TTY environment", async () => {
      const originalIsTTY = process.stdout.isTTY;
      process.stdout.isTTY = false;

      const result = await detectKittyKeyboardProtocol();
      expect(result).toBe(false);

      process.stdout.isTTY = originalIsTTY;
    });
  });

  describe("enableKittyKeyboardProtocol", () => {
    it("should write enable sequence to stdout with flags", () => {
      const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      // First call should write the escape sequence
      enableKittyKeyboardProtocol(0b11111); // All flags

      expect(writeSpy).toHaveBeenCalled();
      const call = writeSpy.mock.calls[0]?.[0] as string;
      expect(call).toContain("\x1b[>");
      expect(call).toContain("u");

      writeSpy.mockRestore();

      // Disable for next test
      disableKittyKeyboardProtocol();
    });

    it("should not write again if already enabled", () => {
      const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      // Enable first
      enableKittyKeyboardProtocol();
      const firstCallCount = writeSpy.mock.calls.length;

      // Second call should be a no-op
      enableKittyKeyboardProtocol();

      expect(writeSpy.mock.calls.length).toBe(firstCallCount);

      writeSpy.mockRestore();
    });
  });

  describe("disableKittyKeyboardProtocol", () => {
    it("should write disable sequence to stdout", () => {
      const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      disableKittyKeyboardProtocol();

      expect(writeSpy).toHaveBeenCalled();
      const call = writeSpy.mock.calls[0]?.[0] as string;
      expect(call).toContain("\x1b[<");
      expect(call).toContain("u");

      writeSpy.mockRestore();
    });
  });

  describe("parseEnhancedKey", () => {
    it("should return undefined for non-CSI sequences", () => {
      expect(parseEnhancedKey("abc")).toBeUndefined();
      expect(parseEnhancedKey("\x1b[A")).toBeUndefined(); // Arrow key, not CSI u
    });

    it("should parse CSI u sequence with modifiers", () => {
      // ESC [ 65 ; 5 u = Ctrl+A (65=A, 5=Ctrl+1)
      const result = parseEnhancedKey("\x1b[65;5u");
      expect(result).toBeDefined();
      expect(result?.char).toBe("A");
      expect(result?.ctrl).toBe(true);
    });

    it("should parse CSI u sequence without modifiers", () => {
      // ESC [ 97 u = 'a' key
      const result = parseEnhancedKey("\x1b[97u");
      expect(result).toBeDefined();
      expect(result?.char).toBe("a");
      expect(result?.ctrl).toBe(false);
      expect(result?.shift).toBe(false);
      expect(result?.alt).toBe(false);
    });
  });

  describe("isKittySequence", () => {
    it("should return true for CSI u sequences", () => {
      expect(isKittySequence("\x1b[65u")).toBe(true);
      expect(isKittySequence("\x1b[65;5u")).toBe(true);
    });

    it("should return true for CSI ~ sequences", () => {
      expect(isKittySequence("\x1b[1~")).toBe(true);
      expect(isKittySequence("\x1b[1;5~")).toBe(true);
    });

    it("should return false for non-Kitty sequences", () => {
      expect(isKittySequence("abc")).toBe(false);
      expect(isKittySequence("\x1b[A")).toBe(false);
    });
  });

  describe("KittyModifiers", () => {
    it("should have expected modifier flags", () => {
      expect(KittyModifiers.SHIFT).toBe(1);
      expect(KittyModifiers.ALT).toBe(2);
      expect(KittyModifiers.CTRL).toBe(4);
      expect(KittyModifiers.SUPER).toBe(8);
      expect(KittyModifiers.HYPER).toBe(16);
      expect(KittyModifiers.META).toBe(32);
    });
  });
});
