/**
 * BudgetAllocator Unit Tests
 * @module context/evidence/__tests__/budget-allocator
 */

import { describe, expect, it } from "vitest";

import { BudgetAllocator } from "../budget-allocator.js";
import type { Evidence } from "../types.js";

// =============================================================================
// Factory Functions
// =============================================================================

function createEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: `evidence-${Math.random().toString(36).slice(2, 9)}`,
    provider: "search",
    path: "src/test.ts",
    range: [1, 10] as const,
    content: "function test() {}",
    tokens: 100,
    baseScore: 50,
    finalScore: 50,
    matchedSignals: [],
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("BudgetAllocator", () => {
  describe("allocate", () => {
    it("should allocate budget by provider ratios", () => {
      const allocator = new BudgetAllocator({ contextWindow: 100_000 });
      const allocation = allocator.allocate();

      // Total = 100k - 4k output - 2k system = 94k
      expect(allocation.total).toBe(94_000);

      // Summary = 5% of 94k = 4700
      expect(allocation.summary).toBe(4700);

      // Working set = 15% of 94k = 14100
      expect(allocation.workingSet).toBe(14_100);

      // Evidence budget = 94k - 4700 - 14100 = 75200
      const evidenceBudget = allocation.total - allocation.summary - allocation.workingSet;
      expect(evidenceBudget).toBe(75_200);

      // Provider allocations (default ratios: diff 40%, lsp 35%, search 25%)
      expect(allocation.perProvider.diff).toBe(Math.floor(evidenceBudget * 0.4)); // 30080
      expect(allocation.perProvider.lsp).toBe(Math.floor(evidenceBudget * 0.35)); // 26320
      expect(allocation.perProvider.search).toBe(Math.floor(evidenceBudget * 0.25)); // 18800
    });

    it("should handle empty provider list", () => {
      const allocator = new BudgetAllocator({
        contextWindow: 100_000,
        providerRatios: { diff: 0, lsp: 0, search: 0 },
      });

      const allocation = allocator.allocate();

      // All provider budgets should be 0
      expect(allocation.perProvider.diff).toBe(0);
      expect(allocation.perProvider.lsp).toBe(0);
      expect(allocation.perProvider.search).toBe(0);

      // Remaining should capture all evidence budget
      expect(allocation.remaining).toBeGreaterThan(0);
    });

    it("should respect custom reserves", () => {
      const allocator = new BudgetAllocator({
        contextWindow: 100_000,
        outputReserve: 10_000,
        systemReserve: 5_000,
      });

      const allocation = allocator.allocate();

      // Total = 100k - 10k - 5k = 85k
      expect(allocation.total).toBe(85_000);
    });

    it("should respect custom ratios", () => {
      const allocator = new BudgetAllocator({
        contextWindow: 100_000,
        summaryRatio: 0.1, // 10%
        workingSetRatio: 0.2, // 20%
        providerRatios: { diff: 0.5, lsp: 0.3, search: 0.2 },
      });

      const allocation = allocator.allocate();

      // Summary = 10% of 94k = 9400
      expect(allocation.summary).toBe(9400);

      // Working set = 20% of 94k = 18800
      expect(allocation.workingSet).toBe(18_800);

      // Evidence budget = 94k - 9400 - 18800 = 65800
      const evidenceBudget = 65_800;

      expect(allocation.perProvider.diff).toBe(Math.floor(evidenceBudget * 0.5));
      expect(allocation.perProvider.lsp).toBe(Math.floor(evidenceBudget * 0.3));
      expect(allocation.perProvider.search).toBe(Math.floor(evidenceBudget * 0.2));
    });

    it("should handle small context window", () => {
      const allocator = new BudgetAllocator({
        contextWindow: 5_000, // Very small
      });

      const allocation = allocator.allocate();

      // Total = 5k - 4k output - 2k system = -1k -> clamped to 0
      // But reserves exceed window, so available should be 0 or near 0
      expect(allocation.total).toBe(0);
      expect(allocation.summary).toBe(0);
      expect(allocation.workingSet).toBe(0);
    });

    it("should calculate remaining tokens correctly", () => {
      const allocator = new BudgetAllocator({ contextWindow: 100_000 });
      const allocation = allocator.allocate();

      const providersTotal =
        allocation.perProvider.diff + allocation.perProvider.lsp + allocation.perProvider.search;

      const evidenceBudget = allocation.total - allocation.summary - allocation.workingSet;

      // Remaining = evidence budget - sum of provider allocations (due to floor rounding)
      expect(allocation.remaining).toBe(evidenceBudget - providersTotal);
    });
  });

  describe("fitToBudget", () => {
    it("should truncate evidence to fit budget", () => {
      const allocator = new BudgetAllocator({ contextWindow: 100_000 });
      const allocation = allocator.allocate();

      // Create evidence that exceeds budget
      const largeEvidence = Array.from({ length: 50 }, (_, i) =>
        createEvidence({
          provider: "diff",
          tokens: 1000,
          finalScore: 100 - i, // Descending scores
        })
      );

      const fitted = allocator.fitToBudget(largeEvidence, allocation);

      // Should not exceed diff provider budget
      const totalTokens = fitted.reduce((sum, e) => sum + e.tokens, 0);
      expect(totalTokens).toBeLessThanOrEqual(allocation.perProvider.diff);
    });

    it("should preserve high-score evidence", () => {
      const allocator = new BudgetAllocator({ contextWindow: 100_000 });
      const allocation = allocator.allocate();

      const evidence = [
        createEvidence({ provider: "diff", tokens: 500, finalScore: 100 }),
        createEvidence({ provider: "diff", tokens: 500, finalScore: 90 }),
        createEvidence({ provider: "diff", tokens: 500, finalScore: 80 }),
        createEvidence({ provider: "diff", tokens: 500, finalScore: 10 }),
      ];

      const fitted = allocator.fitToBudget(evidence, allocation);

      // Higher scored evidence should be included
      expect(fitted[0]?.finalScore).toBe(100);
      expect(fitted[1]?.finalScore).toBe(90);
      expect(fitted[2]?.finalScore).toBe(80);
      expect(fitted[3]?.finalScore).toBe(10);
    });

    it("should respect per-provider limits", () => {
      const allocator = new BudgetAllocator({
        contextWindow: 100_000,
        providerRatios: { diff: 0.1, lsp: 0.1, search: 0.8 }, // Small diff budget
      });
      const allocation = allocator.allocate();

      // Create mixed provider evidence
      const evidence = [
        createEvidence({ provider: "diff", tokens: 5000, finalScore: 100 }),
        createEvidence({ provider: "diff", tokens: 5000, finalScore: 90 }),
        createEvidence({ provider: "search", tokens: 1000, finalScore: 80 }),
        createEvidence({ provider: "search", tokens: 1000, finalScore: 70 }),
      ];

      const fitted = allocator.fitToBudget(evidence, allocation);

      // Diff items may be limited by their provider budget
      const diffItems = fitted.filter((e) => e.provider === "diff");
      const diffTokens = diffItems.reduce((sum, e) => sum + e.tokens, 0);
      expect(diffTokens).toBeLessThanOrEqual(allocation.perProvider.diff);

      // Search items should mostly fit
      const searchItems = fitted.filter((e) => e.provider === "search");
      expect(searchItems.length).toBeGreaterThan(0);
    });

    it("should handle empty evidence array", () => {
      const allocator = new BudgetAllocator({ contextWindow: 100_000 });
      const allocation = allocator.allocate();

      const fitted = allocator.fitToBudget([], allocation);

      expect(fitted).toEqual([]);
    });

    it("should skip evidence with zero or negative tokens", () => {
      const allocator = new BudgetAllocator({ contextWindow: 100_000 });
      const allocation = allocator.allocate();

      const evidence = [
        createEvidence({ tokens: 0, finalScore: 100 }),
        createEvidence({ tokens: -10, finalScore: 90 }),
        createEvidence({ tokens: 100, finalScore: 80 }),
      ];

      const fitted = allocator.fitToBudget(evidence, allocation);

      expect(fitted).toHaveLength(1);
      expect(fitted[0]?.tokens).toBe(100);
    });

    it("should stop when total budget exceeded", () => {
      // Create allocator with very small evidence budget
      const allocator = new BudgetAllocator({
        contextWindow: 10_000,
        outputReserve: 1000,
        systemReserve: 1000,
        summaryRatio: 0.4, // Large summary ratio to leave small evidence budget
        workingSetRatio: 0.4,
      });
      const allocation = allocator.allocate();

      // Evidence budget is very small
      const evidenceBudget = allocation.total - allocation.summary - allocation.workingSet;

      const evidence = [
        createEvidence({ provider: "diff", tokens: evidenceBudget + 100, finalScore: 100 }),
        createEvidence({ provider: "search", tokens: 100, finalScore: 90 }),
      ];

      const fitted = allocator.fitToBudget(evidence, allocation);

      // First item exceeds budget, should be skipped
      // Second item should fit
      const totalTokens = fitted.reduce((sum, e) => sum + e.tokens, 0);
      expect(totalTokens).toBeLessThanOrEqual(evidenceBudget);
    });

    it("should skip items that exceed provider budget but continue processing", () => {
      const allocator = new BudgetAllocator({
        contextWindow: 100_000,
        providerRatios: { diff: 0.01, lsp: 0.01, search: 0.98 }, // Tiny diff/lsp budgets
      });
      const allocation = allocator.allocate();

      const evidence = [
        createEvidence({ provider: "diff", tokens: 50000, finalScore: 100 }), // Exceeds diff budget
        createEvidence({ provider: "search", tokens: 1000, finalScore: 90 }), // Should be included
        createEvidence({ provider: "search", tokens: 1000, finalScore: 80 }), // Should be included
      ];

      const fitted = allocator.fitToBudget(evidence, allocation);

      // Diff item should be skipped, but search items should be included
      expect(fitted.some((e) => e.provider === "diff")).toBe(false);
      expect(fitted.filter((e) => e.provider === "search").length).toBe(2);
    });
  });
});
