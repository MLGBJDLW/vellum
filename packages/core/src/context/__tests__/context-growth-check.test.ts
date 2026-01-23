/**
 * Tests for Context Growth Validator
 *
 * Covers:
 * - REQ-005: Growth validation for compression operations
 *
 * @module @vellum/core/context/__tests__/context-growth-check.test
 */

import { describe, expect, it } from "vitest";
import {
  ContextGrowthValidator,
  createGrowthValidator,
  validateGrowth,
} from "../context-growth-check.js";
import { CompactionError, CompactionErrorCode } from "../errors.js";

// ============================================================================
// ContextGrowthValidator Tests
// ============================================================================

describe("ContextGrowthValidator", () => {
  describe("constructor", () => {
    it("should create validator with default options", () => {
      const validator = new ContextGrowthValidator();
      expect(validator.getMaxAllowedRatio()).toBe(1.0);
    });

    it("should respect custom maxAllowedRatio", () => {
      const validator = new ContextGrowthValidator({ maxAllowedRatio: 0.8 });
      expect(validator.getMaxAllowedRatio()).toBe(0.8);
    });
  });

  describe("validate() - valid compression", () => {
    it("should pass when summary is smaller than original", () => {
      const validator = new ContextGrowthValidator();

      const result = validator.validate(1000, 300);

      expect(result.isValid).toBe(true);
      expect(result.originalTokens).toBe(1000);
      expect(result.summaryTokens).toBe(300);
      expect(result.ratio).toBe(0.3);
      expect(result.tokensSaved).toBe(700);
    });

    it("should calculate correct ratio for various compressions", () => {
      const validator = new ContextGrowthValidator();

      // 50% compression
      expect(validator.validate(1000, 500).ratio).toBe(0.5);

      // 10% compression (very efficient)
      expect(validator.validate(1000, 100).ratio).toBe(0.1);

      // 90% compression (borderline)
      expect(validator.validate(1000, 900).ratio).toBe(0.9);
    });

    it("should return correct tokensSaved", () => {
      const validator = new ContextGrowthValidator();

      expect(validator.validate(1000, 300).tokensSaved).toBe(700);
      expect(validator.validate(5000, 1000).tokensSaved).toBe(4000);
      expect(validator.validate(100, 10).tokensSaved).toBe(90);
    });
  });

  describe("validate() - context growth error", () => {
    it("should throw CONTEXT_GROWTH when summary equals original", () => {
      const validator = new ContextGrowthValidator();

      expect(() => validator.validate(1000, 1000)).toThrow(CompactionError);

      try {
        validator.validate(1000, 1000);
      } catch (error) {
        expect(CompactionError.isCompactionError(error)).toBe(true);
        const compactionError = error as CompactionError;
        expect(compactionError.code).toBe(CompactionErrorCode.CONTEXT_GROWTH);
        expect(compactionError.originalTokens).toBe(1000);
        expect(compactionError.resultingTokens).toBe(1000);
      }
    });

    it("should throw CONTEXT_GROWTH when summary is larger than original", () => {
      const validator = new ContextGrowthValidator();

      expect(() => validator.validate(1000, 1200)).toThrow(CompactionError);

      try {
        validator.validate(1000, 1200);
      } catch (error) {
        expect(CompactionError.isCompactionError(error)).toBe(true);
        const compactionError = error as CompactionError;
        expect(compactionError.code).toBe(CompactionErrorCode.CONTEXT_GROWTH);
        expect(compactionError.message).toContain("20% larger");
      }
    });

    it("should include growth percentage in error message", () => {
      const validator = new ContextGrowthValidator();

      try {
        validator.validate(1000, 1500);
      } catch (error) {
        const compactionError = error as CompactionError;
        expect(compactionError.message).toContain("50% larger");
      }
    });
  });

  describe("validate() - edge cases", () => {
    it("should handle zero original tokens with zero summary", () => {
      const validator = new ContextGrowthValidator();

      const result = validator.validate(0, 0);

      expect(result.isValid).toBe(true);
      expect(result.ratio).toBe(0);
      expect(result.tokensSaved).toBe(0);
    });

    it("should throw when compressing zero tokens into non-zero summary", () => {
      const validator = new ContextGrowthValidator();

      expect(() => validator.validate(0, 100)).toThrow(CompactionError);

      try {
        validator.validate(0, 100);
      } catch (error) {
        const compactionError = error as CompactionError;
        expect(compactionError.code).toBe(CompactionErrorCode.CONTEXT_GROWTH);
        expect(compactionError.message).toContain("Cannot compress zero tokens");
      }
    });

    it("should handle very small token counts", () => {
      const validator = new ContextGrowthValidator();

      const result = validator.validate(10, 3);

      expect(result.isValid).toBe(true);
      expect(result.ratio).toBe(0.3);
      expect(result.tokensSaved).toBe(7);
    });

    it("should handle very large token counts", () => {
      const validator = new ContextGrowthValidator();

      const result = validator.validate(1_000_000, 300_000);

      expect(result.isValid).toBe(true);
      expect(result.ratio).toBe(0.3);
      expect(result.tokensSaved).toBe(700_000);
    });
  });

  describe("validate() - throwOnFailure option", () => {
    it("should return result with isValid: false when throwOnFailure is false", () => {
      const validator = new ContextGrowthValidator({ throwOnFailure: false });

      const result = validator.validate(1000, 1200);

      expect(result.isValid).toBe(false);
      expect(result.originalTokens).toBe(1000);
      expect(result.summaryTokens).toBe(1200);
      expect(result.ratio).toBe(1.2);
      expect(result.tokensSaved).toBe(-200);
    });

    it("should not throw with throwOnFailure: false even for equal tokens", () => {
      const validator = new ContextGrowthValidator({ throwOnFailure: false });

      const result = validator.validate(1000, 1000);

      expect(result.isValid).toBe(false);
      expect(result.tokensSaved).toBe(0);
    });
  });

  describe("validate() - custom maxAllowedRatio", () => {
    it("should enforce stricter ratio when configured", () => {
      const validator = new ContextGrowthValidator({ maxAllowedRatio: 0.5 });

      // 40% ratio should pass (< 0.5)
      expect(validator.validate(1000, 400).isValid).toBe(true);

      // 60% ratio should fail (>= 0.5)
      expect(() => validator.validate(1000, 600)).toThrow(CompactionError);
    });

    it("should allow loose ratio when configured", () => {
      const validator = new ContextGrowthValidator({ maxAllowedRatio: 1.5 });

      // 120% should pass (< 1.5)
      expect(validator.validate(1000, 1200).isValid).toBe(true);

      // 160% should fail (>= 1.5)
      expect(() => validator.validate(1000, 1600)).toThrow(CompactionError);
    });
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("createGrowthValidator", () => {
  it("should create validator with default options", () => {
    const validator = createGrowthValidator();
    expect(validator).toBeInstanceOf(ContextGrowthValidator);
    expect(validator.getMaxAllowedRatio()).toBe(1.0);
  });

  it("should create validator with custom options", () => {
    const validator = createGrowthValidator({ maxAllowedRatio: 0.7 });
    expect(validator.getMaxAllowedRatio()).toBe(0.7);
  });
});

describe("validateGrowth", () => {
  it("should validate valid compression", () => {
    const result = validateGrowth(1000, 300);

    expect(result.isValid).toBe(true);
    expect(result.ratio).toBe(0.3);
  });

  it("should throw on context growth", () => {
    expect(() => validateGrowth(1000, 1200)).toThrow(CompactionError);
  });
});
