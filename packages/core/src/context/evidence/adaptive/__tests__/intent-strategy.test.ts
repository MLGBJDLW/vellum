/**
 * IntentAwareProviderStrategy Unit Tests
 *
 * Tests for the intent-aware strategy provider.
 *
 * @module context/evidence/adaptive/__tests__/intent-strategy.test
 */

import { describe, expect, it } from "vitest";
import type { RerankerWeights } from "../../reranker.js";
import { IntentAwareProviderStrategy, type IntentStrategy } from "../intent-strategy.js";
import type { TaskIntent } from "../task-intent-classifier.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates default base weights for testing.
 */
function createBaseWeights(): RerankerWeights {
  return {
    diff: 100,
    stackFrame: 80,
    definition: 60,
    reference: 30,
    keyword: 10,
    workingSet: 50,
    stackDepthDecay: 0.1,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("IntentAwareProviderStrategy", () => {
  describe("constructor", () => {
    it("should create strategy with default config", () => {
      const strategy = new IntentAwareProviderStrategy();
      expect(strategy).toBeDefined();
    });

    it("should create strategy with custom strategies", () => {
      const strategy = new IntentAwareProviderStrategy({
        customStrategies: {
          debug: {
            budgetRatios: { diff: 0.7, lsp: 0.2, search: 0.1 },
          },
        },
      });

      const debugStrategy = strategy.getStrategy("debug");
      expect(debugStrategy.budgetRatios.diff).toBe(0.7);
    });
  });

  describe("getStrategy()", () => {
    it("should return debug strategy for debug intent", () => {
      const strategy = new IntentAwareProviderStrategy();

      const debugStrategy = strategy.getStrategy("debug");

      expect(debugStrategy).toBeDefined();
      expect(debugStrategy.budgetRatios).toBeDefined();
      expect(debugStrategy.weightModifiers).toBeDefined();
      expect(debugStrategy.providerPriority).toBeDefined();
    });

    it("should return implement strategy for implement intent", () => {
      const strategy = new IntentAwareProviderStrategy();

      const implStrategy = strategy.getStrategy("implement");

      expect(implStrategy).toBeDefined();
      expect(implStrategy.providerPriority[0]).toBe("lsp"); // LSP first for impl
    });

    it("should return refactor strategy for refactor intent", () => {
      const strategy = new IntentAwareProviderStrategy();

      const refactorStrategy = strategy.getStrategy("refactor");

      expect(refactorStrategy).toBeDefined();
      // Refactor prioritizes LSP for understanding references
      expect(refactorStrategy.providerPriority[0]).toBe("lsp");
    });

    it("should return explore strategy for explore intent", () => {
      const strategy = new IntentAwareProviderStrategy();

      const exploreStrategy = strategy.getStrategy("explore");

      expect(exploreStrategy).toBeDefined();
      expect(exploreStrategy.providerPriority[0]).toBe("search");
    });

    it("should return test strategy for test intent", () => {
      const strategy = new IntentAwareProviderStrategy();

      const testStrategy = strategy.getStrategy("test");

      expect(testStrategy).toBeDefined();
      expect(testStrategy.budgetRatios.diff).toBeGreaterThan(0);
    });

    it("should return review strategy for review intent", () => {
      const strategy = new IntentAwareProviderStrategy();

      const reviewStrategy = strategy.getStrategy("review");

      expect(reviewStrategy).toBeDefined();
      // Review heavily favors diff
      expect(reviewStrategy.budgetRatios.diff).toBeGreaterThanOrEqual(0.5);
    });

    it("should return unknown strategy for unknown intent", () => {
      const strategy = new IntentAwareProviderStrategy();

      const unknownStrategy = strategy.getStrategy("unknown");

      expect(unknownStrategy).toBeDefined();
      // Unknown should have balanced ratios
      expect(unknownStrategy.budgetRatios.diff).toBeGreaterThan(0);
      expect(unknownStrategy.budgetRatios.lsp).toBeGreaterThan(0);
      expect(unknownStrategy.budgetRatios.search).toBeGreaterThan(0);
    });
  });

  describe("applyWeightModifiers()", () => {
    it("should apply weight modifiers", () => {
      const strategy = new IntentAwareProviderStrategy();
      const baseWeights = createBaseWeights();

      const modified = strategy.applyWeightModifiers(baseWeights, "debug");

      // Debug strategy should modify stackFrame and diff weights
      expect(modified.stackFrame).toBe(120); // Debug boosts stackFrame
      expect(modified.diff).toBe(150); // Debug boosts diff
    });

    it("should preserve base weights when no modifier exists", () => {
      const strategy = new IntentAwareProviderStrategy();
      const baseWeights = createBaseWeights();

      const modified = strategy.applyWeightModifiers(baseWeights, "debug");

      // workingSet should remain unchanged if no modifier
      expect(modified.workingSet).toBe(baseWeights.workingSet);
      expect(modified.stackDepthDecay).toBe(baseWeights.stackDepthDecay);
    });

    it("should apply different modifiers per intent", () => {
      const strategy = new IntentAwareProviderStrategy();
      const baseWeights = createBaseWeights();

      const debugMod = strategy.applyWeightModifiers(baseWeights, "debug");
      const exploreMod = strategy.applyWeightModifiers(baseWeights, "explore");

      // Different intents should produce different results
      expect(debugMod.stackFrame).not.toBe(exploreMod.stackFrame);
    });

    it("should apply modifiers for implement intent", () => {
      const strategy = new IntentAwareProviderStrategy();
      const baseWeights = createBaseWeights();

      const modified = strategy.applyWeightModifiers(baseWeights, "implement");

      // Implement should boost definition weight
      expect(modified.definition).toBe(100);
    });
  });

  describe("getBudgetRatios()", () => {
    it("should return different budget ratios per intent", () => {
      const strategy = new IntentAwareProviderStrategy();

      const debugRatios = strategy.getBudgetRatios("debug");
      const implementRatios = strategy.getBudgetRatios("implement");
      const exploreRatios = strategy.getBudgetRatios("explore");

      // Debug favors diff
      expect(debugRatios.diff).toBeGreaterThan(debugRatios.search);

      // Implement favors LSP
      expect(implementRatios.lsp).toBeGreaterThan(implementRatios.search);

      // Explore favors search
      expect(exploreRatios.search).toBeGreaterThanOrEqual(exploreRatios.lsp);
    });

    it("should return ratios that sum to approximately 1", () => {
      const strategy = new IntentAwareProviderStrategy();
      const intents: TaskIntent[] = [
        "debug",
        "implement",
        "refactor",
        "explore",
        "test",
        "review",
        "unknown",
      ];

      for (const intent of intents) {
        const ratios = strategy.getBudgetRatios(intent);
        const sum = ratios.diff + ratios.lsp + ratios.search;
        expect(sum).toBeCloseTo(1, 1); // Within 0.1 of 1.0
      }
    });

    it("should return debug ratios with diff priority", () => {
      const strategy = new IntentAwareProviderStrategy();

      const ratios = strategy.getBudgetRatios("debug");

      expect(ratios.diff).toBe(0.5);
      expect(ratios.lsp).toBe(0.3);
      expect(ratios.search).toBe(0.2);
    });

    it("should return review ratios with high diff priority", () => {
      const strategy = new IntentAwareProviderStrategy();

      const ratios = strategy.getBudgetRatios("review");

      expect(ratios.diff).toBe(0.6);
    });
  });

  describe("updateStrategy()", () => {
    it("should track feedback history", () => {
      const strategy = new IntentAwareProviderStrategy();

      strategy.updateStrategy("debug", { success: true });
      strategy.updateStrategy("debug", { success: false });
      strategy.updateStrategy("debug", { success: true });

      const stats = strategy.getFeedbackStats("debug");
      expect(stats).toBeDefined();
      expect(stats?.sampleCount).toBe(3);
      expect(stats?.successRate).toBeCloseTo(0.67, 1); // 2/3
    });

    it("should return undefined stats for intent with no feedback", () => {
      const strategy = new IntentAwareProviderStrategy();

      const stats = strategy.getFeedbackStats("implement");

      expect(stats).toBeUndefined();
    });

    it("should apply explicit adjustments", () => {
      const strategy = new IntentAwareProviderStrategy();

      strategy.updateStrategy("debug", {
        success: true,
        adjustments: {
          budgetRatios: { diff: 0.6, lsp: 0.3, search: 0.1 },
        },
      });

      const ratios = strategy.getBudgetRatios("debug");
      expect(ratios.diff).toBe(0.6);
    });
  });

  describe("custom strategies", () => {
    it("should merge custom strategies with defaults", () => {
      const strategy = new IntentAwareProviderStrategy({
        customStrategies: {
          debug: {
            weightModifiers: { stackFrame: 200 },
          },
        },
      });

      const debugStrategy = strategy.getStrategy("debug");

      // Custom modifier applied
      expect(debugStrategy.weightModifiers.stackFrame).toBe(200);
      // Default values preserved
      expect(debugStrategy.budgetRatios).toBeDefined();
      expect(debugStrategy.providerPriority).toBeDefined();
    });

    it("should allow complete strategy override", () => {
      const customStrategy: Partial<IntentStrategy> = {
        budgetRatios: { diff: 0.1, lsp: 0.1, search: 0.8 },
        weightModifiers: { keyword: 100 },
        providerPriority: ["search", "diff", "lsp"],
      };

      const strategy = new IntentAwareProviderStrategy({
        customStrategies: {
          explore: customStrategy,
        },
      });

      const exploreStrategy = strategy.getStrategy("explore");

      expect(exploreStrategy.budgetRatios.search).toBe(0.8);
      expect(exploreStrategy.weightModifiers.keyword).toBe(100);
      expect(exploreStrategy.providerPriority[0]).toBe("search");
    });
  });

  describe("additionalContext", () => {
    it("should include additional context in debug strategy", () => {
      const strategy = new IntentAwareProviderStrategy();

      const debugStrategy = strategy.getStrategy("debug");

      expect(debugStrategy.additionalContext).toBeDefined();
      expect(debugStrategy.additionalContext).toContain("error_logs");
      expect(debugStrategy.additionalContext).toContain("recent_changes");
    });

    it("should not include additional context for unknown strategy", () => {
      const strategy = new IntentAwareProviderStrategy();

      const unknownStrategy = strategy.getStrategy("unknown");

      expect(unknownStrategy.additionalContext).toBeUndefined();
    });
  });
});
