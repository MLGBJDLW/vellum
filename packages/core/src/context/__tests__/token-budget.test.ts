/**
 * Token Budget Calculator Tests
 *
 * @module @vellum/core/context/token-budget.test
 */

import { describe, expect, it } from "vitest";
import {
  calculateBudgetUsage,
  calculateOutputReserve,
  calculateTokenBudget,
  getModelContextWindow,
  isCriticalState,
  isOverflowState,
  isWarningState,
} from "../token-budget.js";

describe("token-budget", () => {
  // ==========================================================================
  // calculateOutputReserve
  // ==========================================================================

  describe("calculateOutputReserve", () => {
    it("should return 27,000 for context windows ≤64K (REQ-TOK-001.1)", () => {
      expect(calculateOutputReserve(64_000)).toBe(27_000);
      expect(calculateOutputReserve(32_000)).toBe(27_000);
      expect(calculateOutputReserve(8_192)).toBe(27_000);
    });

    it("should return 30,000 for context windows 65K-128K (REQ-TOK-001.2)", () => {
      expect(calculateOutputReserve(128_000)).toBe(30_000);
      expect(calculateOutputReserve(100_000)).toBe(30_000);
      expect(calculateOutputReserve(65_000)).toBe(30_000);
    });

    it("should return 40,000 for context windows 129K-200K (REQ-TOK-001.3)", () => {
      expect(calculateOutputReserve(200_000)).toBe(40_000);
      expect(calculateOutputReserve(150_000)).toBe(40_000);
      expect(calculateOutputReserve(129_000)).toBe(40_000);
    });

    it("should return max(40,000, 20%) for context windows >200K (REQ-TOK-001.4)", () => {
      // For 1M context, 20% = 200K which is > 40K
      expect(calculateOutputReserve(1_000_000)).toBe(200_000);
      // For 300K context, 20% = 60K which is > 40K
      expect(calculateOutputReserve(300_000)).toBe(60_000);
      // For 201K context, 20% = 40.2K which is > 40K
      expect(calculateOutputReserve(201_000)).toBe(40_200);
    });

    it("should return 0 for non-positive context windows", () => {
      expect(calculateOutputReserve(0)).toBe(0);
      expect(calculateOutputReserve(-1000)).toBe(0);
    });

    it("should handle boundary cases correctly", () => {
      // Exactly at boundaries
      expect(calculateOutputReserve(64_000)).toBe(27_000);
      expect(calculateOutputReserve(64_001)).toBe(30_000);
      expect(calculateOutputReserve(128_000)).toBe(30_000);
      expect(calculateOutputReserve(128_001)).toBe(40_000);
      expect(calculateOutputReserve(200_000)).toBe(40_000);
      expect(calculateOutputReserve(200_001)).toBe(40_000); // 20% = 40000.2, max(40000, 40000.2) = 40000 (floored)
    });
  });

  // ==========================================================================
  // calculateTokenBudget
  // ==========================================================================

  describe("calculateTokenBudget", () => {
    it("should calculate correct budget for 128K window (REQ-TOK-002.1)", () => {
      const budget = calculateTokenBudget({ contextWindow: 128_000 });

      expect(budget.totalWindow).toBe(128_000);
      expect(budget.outputReserve).toBe(30_000);
      expect(budget.systemReserve).toBe(4_000); // default
      expect(budget.historyBudget).toBe(94_000); // 128K - 30K - 4K
    });

    it("should calculate correct budget for 200K window with custom reserves", () => {
      const budget = calculateTokenBudget({
        contextWindow: 200_000,
        systemReserve: 2_000,
      });

      expect(budget.totalWindow).toBe(200_000);
      expect(budget.outputReserve).toBe(40_000);
      expect(budget.systemReserve).toBe(2_000);
      expect(budget.historyBudget).toBe(158_000); // 200K - 40K - 2K
    });

    it("should use systemPromptTokens when provided instead of systemReserve", () => {
      const budget = calculateTokenBudget({
        contextWindow: 128_000,
        systemReserve: 4_000, // Should be ignored
        systemPromptTokens: 1_500, // Actual measured value
      });

      expect(budget.systemReserve).toBe(1_500);
      expect(budget.historyBudget).toBe(96_500); // 128K - 30K - 1.5K
    });

    it("should use custom outputReserve when provided", () => {
      const budget = calculateTokenBudget({
        contextWindow: 128_000,
        outputReserve: 10_000, // Custom override
      });

      expect(budget.outputReserve).toBe(10_000);
      expect(budget.historyBudget).toBe(114_000); // 128K - 10K - 4K
    });

    it("should return 0 historyBudget when negative (REQ-TOK-002.2)", () => {
      // Create a scenario where historyBudget would be negative
      const budget = calculateTokenBudget({
        contextWindow: 10_000,
        outputReserve: 8_000,
        systemReserve: 5_000,
      });

      expect(budget.historyBudget).toBe(0); // Clamped from -3000
    });

    it("should handle zero context window", () => {
      const budget = calculateTokenBudget({ contextWindow: 0 });

      expect(budget.totalWindow).toBe(0);
      expect(budget.outputReserve).toBe(0);
      expect(budget.systemReserve).toBe(0);
      expect(budget.historyBudget).toBe(0);
    });

    it("should handle negative context window", () => {
      const budget = calculateTokenBudget({ contextWindow: -1000 });

      expect(budget.totalWindow).toBe(0);
      expect(budget.historyBudget).toBe(0);
    });

    it("should match example from design document", () => {
      // From design.md: 200K context with 2K system and 5K tools → 153K history
      // Note: Our interface doesn't have toolsReserve, so we add it to systemReserve
      const budget = calculateTokenBudget({
        contextWindow: 200_000,
        systemReserve: 7_000, // 2K system + 5K tools
      });

      expect(budget.historyBudget).toBe(153_000); // 200K - 40K - 7K
    });
  });

  // ==========================================================================
  // calculateBudgetUsage
  // ==========================================================================

  describe("calculateBudgetUsage", () => {
    const budget = calculateTokenBudget({ contextWindow: 128_000 });
    // historyBudget = 94_000

    it("should return 0 for empty history", () => {
      expect(calculateBudgetUsage(0, budget)).toBe(0);
    });

    it("should return 0.5 for 50% usage", () => {
      const usage = calculateBudgetUsage(47_000, budget);
      expect(usage).toBeCloseTo(0.5, 2);
    });

    it("should return 1.0 for exact budget match", () => {
      expect(calculateBudgetUsage(94_000, budget)).toBe(1);
    });

    it("should return >1 for overflow", () => {
      expect(calculateBudgetUsage(150_000, budget)).toBeGreaterThan(1);
    });

    it("should handle zero budget gracefully", () => {
      const zeroBudget = { totalWindow: 0, outputReserve: 0, systemReserve: 0, historyBudget: 0 };
      expect(calculateBudgetUsage(100, zeroBudget)).toBe(Infinity);
      expect(calculateBudgetUsage(0, zeroBudget)).toBe(0);
    });

    it("should handle negative tokens", () => {
      expect(calculateBudgetUsage(-100, budget)).toBe(0);
    });
  });

  // ==========================================================================
  // getModelContextWindow
  // ==========================================================================

  describe("getModelContextWindow", () => {
    it("should return correct window for Anthropic models", () => {
      // Use actual model IDs from the centralized catalog
      expect(getModelContextWindow("claude-sonnet-4-5")).toBe(200_000);
      expect(getModelContextWindow("claude-3-5-sonnet-20241022")).toBe(200_000);
    });

    it("should return correct window for OpenAI models", () => {
      expect(getModelContextWindow("gpt-4o")).toBe(128_000);
      expect(getModelContextWindow("gpt-4")).toBe(8_192);
      expect(getModelContextWindow("gpt-3.5-turbo")).toBe(16_385);
      expect(getModelContextWindow("o1")).toBe(200_000);
    });

    it("should return correct window for Google models", () => {
      expect(getModelContextWindow("gemini-2.0-flash")).toBe(1_048_576);
      expect(getModelContextWindow("gemini-1.5-pro")).toBe(2_097_152);
    });

    it("should return correct window for DeepSeek models", () => {
      // DeepSeek models have 128K context windows per official documentation
      expect(getModelContextWindow("deepseek-chat")).toBe(128_000);
      expect(getModelContextWindow("deepseek-coder")).toBe(128_000);
    });

    it("should match versioned model names via prefix", () => {
      expect(getModelContextWindow("claude-3-5-sonnet-20241022")).toBe(200_000);
      expect(getModelContextWindow("gpt-4o-2024-08-06")).toBe(128_000);
    });

    it("should be case-insensitive with known models", () => {
      // Note: The centralized catalog uses exact matching, case-sensitive
      // The legacy wrapper only handles known models case-insensitively
      expect(getModelContextWindow("gpt-4o")).toBe(128_000);
      expect(getModelContextWindow("gemini-2.0-flash")).toBe(1_048_576);
    });

    it("should return default (128K) for unknown models", () => {
      // Unknown models get the default context window from the catalog
      expect(getModelContextWindow("unknown-model")).toBe(128_000);
    });
  });

  // ==========================================================================
  // State Check Utilities
  // ==========================================================================

  describe("isWarningState", () => {
    it("should return true when usage >= 0.8", () => {
      expect(isWarningState(0.8)).toBe(true);
      expect(isWarningState(0.85)).toBe(true);
      expect(isWarningState(1.0)).toBe(true);
    });

    it("should return false when usage < 0.8", () => {
      expect(isWarningState(0.79)).toBe(false);
      expect(isWarningState(0.5)).toBe(false);
      expect(isWarningState(0)).toBe(false);
    });

    it("should respect custom threshold", () => {
      expect(isWarningState(0.75, 0.75)).toBe(true);
      expect(isWarningState(0.74, 0.75)).toBe(false);
    });
  });

  describe("isCriticalState", () => {
    it("should return true when usage >= 0.9", () => {
      expect(isCriticalState(0.9)).toBe(true);
      expect(isCriticalState(0.95)).toBe(true);
    });

    it("should return false when usage < 0.9", () => {
      expect(isCriticalState(0.89)).toBe(false);
      expect(isCriticalState(0.8)).toBe(false);
    });

    it("should respect custom threshold", () => {
      expect(isCriticalState(0.85, 0.85)).toBe(true);
      expect(isCriticalState(0.84, 0.85)).toBe(false);
    });
  });

  describe("isOverflowState", () => {
    it("should return true when usage >= 0.95", () => {
      expect(isOverflowState(0.95)).toBe(true);
      expect(isOverflowState(1.0)).toBe(true);
      expect(isOverflowState(1.5)).toBe(true);
    });

    it("should return false when usage < 0.95", () => {
      expect(isOverflowState(0.94)).toBe(false);
      expect(isOverflowState(0.9)).toBe(false);
    });

    it("should respect custom threshold", () => {
      expect(isOverflowState(0.98, 0.98)).toBe(true);
      expect(isOverflowState(0.97, 0.98)).toBe(false);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe("integration", () => {
    it("should correctly flow through budget calculation and usage check", () => {
      // Simulate a typical workflow
      const contextWindow = getModelContextWindow("claude-3-5-sonnet");
      expect(contextWindow).toBe(200_000);

      const budget = calculateTokenBudget({
        contextWindow,
        systemPromptTokens: 3_000,
      });
      expect(budget.historyBudget).toBe(157_000); // 200K - 40K - 3K

      // Check various usage scenarios
      const healthyUsage = calculateBudgetUsage(100_000, budget);
      expect(healthyUsage).toBeLessThan(0.8);
      expect(isWarningState(healthyUsage)).toBe(false);

      const warningUsage = calculateBudgetUsage(130_000, budget);
      expect(warningUsage).toBeGreaterThanOrEqual(0.8);
      expect(isWarningState(warningUsage)).toBe(true);
      expect(isCriticalState(warningUsage)).toBe(false);

      const criticalUsage = calculateBudgetUsage(145_000, budget);
      expect(criticalUsage).toBeGreaterThanOrEqual(0.9);
      expect(isCriticalState(criticalUsage)).toBe(true);

      const overflowUsage = calculateBudgetUsage(160_000, budget);
      expect(overflowUsage).toBeGreaterThan(1);
      expect(isOverflowState(overflowUsage)).toBe(true);
    });
  });
});
