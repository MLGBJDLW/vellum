/**
 * Tests for threshold configuration module
 *
 * @module @vellum/core/context/__tests__/threshold.test
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addModelThreshold,
  clearCustomThresholds,
  getAllThresholdConfigs,
  getThresholdConfig,
  getThresholdProfile,
  MODEL_THRESHOLDS,
  matchesModelPattern,
  THRESHOLD_PROFILES,
  type ThresholdProfile,
  validateThresholds,
} from "../threshold.js";

describe("threshold", () => {
  // Clean up custom thresholds between tests
  beforeEach(() => {
    clearCustomThresholds();
  });

  afterEach(() => {
    clearCustomThresholds();
  });

  describe("THRESHOLD_PROFILES", () => {
    it("should have three profiles: conservative, balanced, aggressive", () => {
      expect(THRESHOLD_PROFILES).toHaveProperty("conservative");
      expect(THRESHOLD_PROFILES).toHaveProperty("balanced");
      expect(THRESHOLD_PROFILES).toHaveProperty("aggressive");
    });

    it("should have correct conservative profile values", () => {
      expect(THRESHOLD_PROFILES.conservative).toEqual({
        warning: 0.7,
        critical: 0.8,
        overflow: 0.9,
      });
    });

    it("should have correct balanced profile values", () => {
      expect(THRESHOLD_PROFILES.balanced).toEqual({
        warning: 0.75,
        critical: 0.85,
        overflow: 0.95,
      });
    });

    it("should have correct aggressive profile values", () => {
      expect(THRESHOLD_PROFILES.aggressive).toEqual({
        warning: 0.85,
        critical: 0.92,
        overflow: 0.97,
      });
    });

    it("should have profiles with ascending thresholds", () => {
      for (const [, profile] of Object.entries(THRESHOLD_PROFILES)) {
        expect(profile.warning).toBeLessThan(profile.critical);
        expect(profile.critical).toBeLessThan(profile.overflow);
      }
    });
  });

  describe("matchesModelPattern", () => {
    it("should match exact model names", () => {
      expect(matchesModelPattern("gpt-4", "gpt-4")).toBe(true);
      expect(matchesModelPattern("gpt-4", "gpt-4-turbo")).toBe(false);
    });

    it("should match wildcard at end", () => {
      expect(matchesModelPattern("deepseek-chat", "deepseek*")).toBe(true);
      expect(matchesModelPattern("deepseek-coder", "deepseek*")).toBe(true);
      expect(matchesModelPattern("deepseek", "deepseek*")).toBe(true);
      expect(matchesModelPattern("not-deepseek", "deepseek*")).toBe(false);
    });

    it("should match wildcard at start", () => {
      expect(matchesModelPattern("gpt-4-turbo", "*turbo")).toBe(true);
      expect(matchesModelPattern("gpt-3.5-turbo", "*turbo")).toBe(true);
      expect(matchesModelPattern("turbo", "*turbo")).toBe(true);
      expect(matchesModelPattern("turbo-fast", "*turbo")).toBe(false);
    });

    it("should match wildcard in middle", () => {
      expect(matchesModelPattern("claude-3-opus", "claude*opus")).toBe(true);
      expect(matchesModelPattern("claude-opus", "claude*opus")).toBe(true);
      expect(matchesModelPattern("opus", "claude*opus")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(matchesModelPattern("GPT-4", "gpt-4")).toBe(true);
      expect(matchesModelPattern("gpt-4", "GPT-4")).toBe(true);
      expect(matchesModelPattern("DeepSeek-Chat", "deepseek*")).toBe(true);
    });

    it("should handle multiple wildcards", () => {
      expect(matchesModelPattern("claude-3-5-sonnet-20240620", "claude*sonnet*")).toBe(true);
      expect(matchesModelPattern("claude-sonnet", "claude*sonnet*")).toBe(true);
    });

    it("should escape regex special characters", () => {
      expect(matchesModelPattern("model.v1", "model.v1")).toBe(true);
      expect(matchesModelPattern("modelXv1", "model.v1")).toBe(false);
      expect(matchesModelPattern("model+version", "model+*")).toBe(true);
    });
  });

  describe("getThresholdProfile", () => {
    it("should return conservative for Claude Opus models", () => {
      expect(getThresholdProfile("claude-3-opus")).toBe("conservative");
      expect(getThresholdProfile("claude-3-opus-20240229")).toBe("conservative");
      expect(getThresholdProfile("claude-opus-4")).toBe("conservative");
    });

    it("should return balanced for Claude Sonnet models", () => {
      expect(getThresholdProfile("claude-3-5-sonnet")).toBe("balanced");
      expect(getThresholdProfile("claude-3-5-sonnet-20240620")).toBe("balanced");
      expect(getThresholdProfile("claude-sonnet-4")).toBe("balanced");
    });

    it("should return aggressive for DeepSeek models (REQ-CFG-002)", () => {
      expect(getThresholdProfile("deepseek-chat")).toBe("aggressive");
      expect(getThresholdProfile("deepseek-coder")).toBe("aggressive");
      expect(getThresholdProfile("deepseek-v3")).toBe("aggressive");
    });

    it("should return conservative for o1 reasoning models", () => {
      expect(getThresholdProfile("o1")).toBe("conservative");
      expect(getThresholdProfile("o1-preview")).toBe("conservative");
      expect(getThresholdProfile("o1-mini")).toBe("conservative");
    });

    it("should return balanced for GPT-4 models", () => {
      expect(getThresholdProfile("gpt-4o")).toBe("balanced");
      expect(getThresholdProfile("gpt-4o-mini")).toBe("balanced");
      expect(getThresholdProfile("gpt-4-turbo")).toBe("balanced");
    });

    it("should return aggressive for Gemini models (REQ-CFG-002)", () => {
      expect(getThresholdProfile("gemini-1.5-pro")).toBe("aggressive");
      expect(getThresholdProfile("gemini-2.0-flash")).toBe("aggressive");
    });

    it("should return balanced (default) for unknown models", () => {
      expect(getThresholdProfile("unknown-model")).toBe("balanced");
      expect(getThresholdProfile("my-custom-llm")).toBe("balanced");
    });
  });

  describe("getThresholdConfig", () => {
    it("should return conservative thresholds for Claude Opus (REQ-CFG-002)", () => {
      const config = getThresholdConfig("claude-opus-4");
      expect(config).toEqual({
        warning: 0.7,
        critical: 0.8,
        overflow: 0.9,
      });
    });

    it("should return aggressive thresholds for DeepSeek (REQ-CFG-002)", () => {
      const config = getThresholdConfig("deepseek-chat");
      expect(config).toEqual({
        warning: 0.85,
        critical: 0.92,
        overflow: 0.97,
      });
    });

    it("should return custom overrides for Gemini (REQ-CFG-002)", () => {
      const config = getThresholdConfig("gemini-1.5-pro");
      // Gemini has custom threshold overrides
      expect(config).toEqual({
        warning: 0.88,
        critical: 0.94,
        overflow: 0.98,
      });
    });

    it("should return balanced thresholds for unknown models", () => {
      const config = getThresholdConfig("unknown-model");
      expect(config).toEqual({
        warning: 0.75,
        critical: 0.85,
        overflow: 0.95,
      });
    });

    it("should use specified default profile for unknown models", () => {
      const config = getThresholdConfig("unknown-model", "aggressive");
      expect(config).toEqual({
        warning: 0.85,
        critical: 0.92,
        overflow: 0.97,
      });
    });

    it("should return a new object each time (immutability)", () => {
      const config1 = getThresholdConfig("gpt-4o");
      const config2 = getThresholdConfig("gpt-4o");
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });
  });

  describe("addModelThreshold", () => {
    it("should add custom threshold that takes precedence", () => {
      // Before: GPT-4o uses balanced
      expect(getThresholdProfile("gpt-4o")).toBe("balanced");

      // Add custom override
      addModelThreshold({
        model: "gpt-4o*",
        profile: "aggressive",
        reason: "Custom override for testing",
      });

      // After: GPT-4o uses aggressive
      expect(getThresholdProfile("gpt-4o")).toBe("aggressive");
      expect(getThresholdConfig("gpt-4o")).toEqual({
        warning: 0.85,
        critical: 0.92,
        overflow: 0.97,
      });
    });

    it("should support custom threshold values", () => {
      addModelThreshold({
        model: "my-model",
        profile: "balanced",
        thresholds: {
          warning: 0.6,
          critical: 0.7,
          overflow: 0.8,
        },
      });

      const config = getThresholdConfig("my-model");
      expect(config).toEqual({
        warning: 0.6,
        critical: 0.7,
        overflow: 0.8,
      });
    });

    it("should support partial threshold overrides", () => {
      addModelThreshold({
        model: "partial-override",
        profile: "balanced",
        thresholds: {
          warning: 0.6, // Only override warning
        },
      });

      const config = getThresholdConfig("partial-override");
      expect(config).toEqual({
        warning: 0.6, // Custom
        critical: 0.85, // From balanced
        overflow: 0.95, // From balanced
      });
    });

    it("should allow later additions to take precedence", () => {
      addModelThreshold({
        model: "test-model",
        profile: "conservative",
      });

      addModelThreshold({
        model: "test-model",
        profile: "aggressive",
      });

      // Later addition wins
      expect(getThresholdProfile("test-model")).toBe("aggressive");
    });
  });

  describe("clearCustomThresholds", () => {
    it("should remove all custom thresholds", () => {
      addModelThreshold({
        model: "custom-1",
        profile: "aggressive",
      });
      addModelThreshold({
        model: "custom-2",
        profile: "conservative",
      });

      clearCustomThresholds();

      // Both should now use default (balanced)
      expect(getThresholdProfile("custom-1")).toBe("balanced");
      expect(getThresholdProfile("custom-2")).toBe("balanced");
    });

    it("should not affect built-in configurations", () => {
      clearCustomThresholds();

      // Built-in should still work
      expect(getThresholdProfile("deepseek-chat")).toBe("aggressive");
      expect(getThresholdProfile("claude-3-opus")).toBe("conservative");
    });
  });

  describe("getAllThresholdConfigs", () => {
    it("should return built-in configurations", () => {
      const all = getAllThresholdConfigs();
      expect(all.length).toBeGreaterThan(0);

      // Should include some known built-in configs
      const hasDeepseek = all.some((c) => c.model === "deepseek*");
      const hasClaudeOpus = all.some((c) => c.model.includes("opus"));
      expect(hasDeepseek).toBe(true);
      expect(hasClaudeOpus).toBe(true);
    });

    it("should include custom configurations first", () => {
      addModelThreshold({
        model: "my-custom-model",
        profile: "aggressive",
      });

      const all = getAllThresholdConfigs();

      // Custom should be first
      expect(all[0]?.model).toBe("my-custom-model");
    });

    it("should return readonly array", () => {
      const all = getAllThresholdConfigs();
      expect(Array.isArray(all)).toBe(true);
    });
  });

  describe("validateThresholds", () => {
    it("should validate correct thresholds", () => {
      const result = validateThresholds({
        warning: 0.75,
        critical: 0.85,
        overflow: 0.95,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject warning >= critical", () => {
      const result = validateThresholds({
        warning: 0.9,
        critical: 0.85,
        overflow: 0.95,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("warning") && e.includes("critical"))).toBe(true);
    });

    it("should reject critical >= overflow", () => {
      const result = validateThresholds({
        warning: 0.75,
        critical: 0.96,
        overflow: 0.95,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("critical") && e.includes("overflow"))).toBe(
        true
      );
    });

    it("should reject values <= 0", () => {
      const result = validateThresholds({
        warning: 0,
        critical: 0.85,
        overflow: 0.95,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("warning") && e.includes("0"))).toBe(true);
    });

    it("should reject values >= 1", () => {
      const result = validateThresholds({
        warning: 0.75,
        critical: 0.85,
        overflow: 1.0,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("overflow") && e.includes("1"))).toBe(true);
    });

    it("should report multiple errors", () => {
      const result = validateThresholds({
        warning: 0.95,
        critical: 0.85,
        overflow: 0.75,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it("should validate all built-in profiles", () => {
      for (const [, profile] of Object.entries(THRESHOLD_PROFILES)) {
        const result = validateThresholds(profile);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe("MODEL_THRESHOLDS", () => {
    it("should be a readonly array", () => {
      expect(Array.isArray(MODEL_THRESHOLDS)).toBe(true);
      expect(MODEL_THRESHOLDS.length).toBeGreaterThan(0);
    });

    it("should have valid profiles for all entries", () => {
      const validProfiles: ThresholdProfile[] = ["conservative", "balanced", "aggressive"];

      for (const config of MODEL_THRESHOLDS) {
        expect(validProfiles).toContain(config.profile);
      }
    });

    it("should have valid custom thresholds where specified", () => {
      for (const config of MODEL_THRESHOLDS) {
        if (config.thresholds) {
          // Merge with profile defaults to get full config
          const fullThresholds = {
            warning: config.thresholds.warning ?? THRESHOLD_PROFILES[config.profile].warning,
            critical: config.thresholds.critical ?? THRESHOLD_PROFILES[config.profile].critical,
            overflow: config.thresholds.overflow ?? THRESHOLD_PROFILES[config.profile].overflow,
          };

          const result = validateThresholds(fullThresholds);
          expect(result.valid).toBe(true);
        }
      }
    });
  });
});
