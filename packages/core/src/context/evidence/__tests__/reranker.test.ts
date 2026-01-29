/**
 * Reranker Unit Tests
 * @module context/evidence/__tests__/reranker
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_WEIGHTS, Reranker } from "../reranker.js";
import type { Evidence, Signal } from "../types.js";

// =============================================================================
// Factory Functions
// =============================================================================

function createSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    type: "symbol",
    value: "testSymbol",
    source: "user_message",
    confidence: 0.8,
    ...overrides,
  };
}

function createEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: `evidence-${Math.random().toString(36).slice(2, 9)}`,
    provider: "search",
    path: "src/test.ts",
    range: [1, 10] as const,
    content: "function test() {}",
    tokens: 50,
    baseScore: 0,
    matchedSignals: [],
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("Reranker", () => {
  describe("rank", () => {
    it("should rank evidence by score descending", () => {
      const reranker = new Reranker();

      const evidence = [
        createEvidence({ baseScore: 10 }),
        createEvidence({ baseScore: 50 }),
        createEvidence({ baseScore: 30 }),
      ];

      const ranked = reranker.rank(evidence);

      expect(ranked[0]?.baseScore).toBe(50);
      expect(ranked[1]?.baseScore).toBe(30);
      expect(ranked[2]?.baseScore).toBe(10);

      // Verify finalScore is set
      expect(ranked.every((e) => e.finalScore !== undefined)).toBe(true);
    });

    it("should apply diff weight correctly", () => {
      const reranker = new Reranker();

      const diffEvidence = createEvidence({
        provider: "diff",
        baseScore: 10,
      });
      const searchEvidence = createEvidence({
        provider: "search",
        baseScore: 10,
      });

      const ranked = reranker.rank([diffEvidence, searchEvidence]);

      // Diff evidence should be ranked higher due to +100 bonus
      expect(ranked[0]?.provider).toBe("diff");
      expect(ranked[0]?.finalScore).toBeGreaterThan(ranked[1]?.finalScore ?? 0);

      // Verify diff bonus is applied
      const diffScore = ranked[0]?.finalScore ?? 0;
      const searchScore = ranked[1]?.finalScore ?? 0;
      expect(diffScore - searchScore).toBe(DEFAULT_WEIGHTS.diff);
    });

    it("should apply stack frame boost with depth decay", () => {
      const reranker = new Reranker();

      const evidence = [
        createEvidence({
          baseScore: 0,
          metadata: { stackDepth: 0 },
        }),
        createEvidence({
          baseScore: 0,
          metadata: { stackDepth: 2 },
        }),
        createEvidence({
          baseScore: 0,
          metadata: { stackDepth: 5 },
        }),
      ];

      const ranked = reranker.rank(evidence);

      // Stack depth 0 should have highest score
      const depth0 = ranked.find((e) => e.metadata?.stackDepth === 0);
      const depth2 = ranked.find((e) => e.metadata?.stackDepth === 2);
      const depth5 = ranked.find((e) => e.metadata?.stackDepth === 5);

      expect(depth0?.finalScore).toBeGreaterThan(depth2?.finalScore ?? 0);
      expect(depth2?.finalScore).toBeGreaterThan(depth5?.finalScore ?? 0);

      // Verify decay calculation: stackFrame * (1 - depth * decay)
      // depth=0: 80 * (1 - 0 * 0.1) = 80
      // depth=2: 80 * (1 - 2 * 0.1) = 64
      // depth=5: 80 * (1 - 5 * 0.1) = 40
      expect(depth0?.finalScore).toBe(80);
      expect(depth2?.finalScore).toBe(64);
      expect(depth5?.finalScore).toBe(40);
    });

    it("should apply working set bonus", () => {
      const reranker = new Reranker();

      const workingSetEvidence = createEvidence({
        baseScore: 0,
        matchedSignals: [createSignal({ type: "path", source: "working_set" })],
      });
      const otherEvidence = createEvidence({
        baseScore: 0,
        matchedSignals: [createSignal({ type: "path", source: "user_message" })],
      });

      const ranked = reranker.rank([workingSetEvidence, otherEvidence]);

      // Working set evidence should have bonus
      const wsItem = ranked.find((e) => e.matchedSignals.some((s) => s.source === "working_set"));
      const otherItem = ranked.find((e) =>
        e.matchedSignals.every((s) => s.source !== "working_set")
      );

      expect(wsItem?.finalScore).toBe(DEFAULT_WEIGHTS.workingSet);
      expect(otherItem?.finalScore).toBe(0);
    });

    it("should handle empty evidence array", () => {
      const reranker = new Reranker();
      const ranked = reranker.rank([]);

      expect(ranked).toEqual([]);
    });
  });

  describe("calculateScore", () => {
    it("should return 0 for evidence with no matching signals", () => {
      const reranker = new Reranker();

      const evidence = createEvidence({
        provider: "search", // No bonus
        baseScore: 0,
        matchedSignals: [],
        metadata: undefined, // No stack depth
      });

      const ranked = reranker.rank([evidence]);

      expect(ranked[0]?.finalScore).toBe(0);
    });

    it("should combine multiple feature weights", () => {
      const reranker = new Reranker();

      // Evidence with multiple score sources
      const evidence = createEvidence({
        provider: "lsp",
        baseScore: 20,
        matchedSignals: [
          createSignal({ type: "error_token", source: "error_output" }),
          createSignal({ type: "symbol", source: "working_set" }),
        ],
        metadata: { symbolKind: "function" },
      });

      const ranked = reranker.rank([evidence]);

      // Expected score:
      // baseScore: 20
      // + definition (LSP with symbolKind): 60
      // + keyword bonus (2 matches): 20
      // + working set bonus: 50
      // = 150
      expect(ranked[0]?.finalScore).toBe(150);
    });

    it("should cap score at maxScore", () => {
      const reranker = new Reranker({ maxScore: 100 });

      const evidence = createEvidence({
        provider: "diff", // +100
        baseScore: 50,
        matchedSignals: [createSignal({ source: "working_set" })], // +50
        metadata: { stackDepth: 0 }, // +80
      });

      const ranked = reranker.rank([evidence]);

      // Total would be 50 + 100 + 80 + 50 = 280, but capped at 100
      expect(ranked[0]?.finalScore).toBe(100);
    });

    it("should apply keyword bonus per error_token and symbol", () => {
      const reranker = new Reranker();

      const evidence = createEvidence({
        baseScore: 0,
        matchedSignals: [
          createSignal({ type: "error_token" }),
          createSignal({ type: "error_token" }),
          createSignal({ type: "symbol" }),
          createSignal({ type: "path" }), // Should not count
        ],
      });

      const ranked = reranker.rank([evidence]);

      // 3 keyword matches * 10 = 30
      expect(ranked[0]?.finalScore).toBe(30);
    });
  });

  describe("getWeights / updateWeights", () => {
    it("should return current weights", () => {
      const reranker = new Reranker();
      const weights = reranker.getWeights();

      expect(weights).toEqual(DEFAULT_WEIGHTS);
    });

    it("should update weights", () => {
      const reranker = new Reranker();
      reranker.updateWeights({ diff: 200, keyword: 20 });

      const weights = reranker.getWeights();
      expect(weights.diff).toBe(200);
      expect(weights.keyword).toBe(20);
      // Others should remain default
      expect(weights.stackFrame).toBe(DEFAULT_WEIGHTS.stackFrame);
    });
  });
});
