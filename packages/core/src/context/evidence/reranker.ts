/**
 * Reranker Module - Multi-feature Evidence Scoring
 *
 * Combines multiple signals to produce a final ranking score for evidence items.
 * Inspired by Aider's PageRank approach but with explicit, tunable feature weights.
 *
 * @packageDocumentation
 * @module context/evidence/reranker
 */

import type { Evidence, Signal } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Feature weights for evidence scoring.
 * Based on expert analysis and Aider insights.
 */
export interface RerankerWeights {
  /** Weight for diff-based evidence (+100 for diff provider) */
  readonly diff: number;
  /** Weight for stack frame proximity (+80 for stack frames) */
  readonly stackFrame: number;
  /** Weight for definition matches (+60 for LSP definitions) */
  readonly definition: number;
  /** Weight for reference matches (+30 for references) */
  readonly reference: number;
  /** Weight per keyword match (+10 per match) */
  readonly keyword: number;
  /** Weight for working set files (+50 for active files) */
  readonly workingSet: number;
  /** Decay factor for stack depth (0.1 = 10% decay per level) */
  readonly stackDepthDecay: number;
}

/**
 * Configuration options for the Reranker.
 */
export interface RerankerConfig {
  /** Custom weights to override defaults */
  readonly weights?: Partial<RerankerWeights>;
  /** Maximum final score for normalization (default: 1000) */
  readonly maxScore?: number;
  /** Enable PageRank-style graph scoring (future enhancement) */
  readonly useGraphRanking?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default weights for evidence scoring.
 * These values are based on expert analysis and empirical testing.
 */
export const DEFAULT_WEIGHTS: RerankerWeights = {
  diff: 100,
  stackFrame: 80,
  definition: 60,
  reference: 30,
  keyword: 10,
  workingSet: 50,
  stackDepthDecay: 0.1,
} as const;

// =============================================================================
// Reranker Implementation
// =============================================================================

/**
 * Multi-feature evidence reranker.
 *
 * Combines multiple scoring features to produce a final ranking:
 * - Provider type bonus (diff > LSP definition > reference)
 * - Stack frame proximity with depth decay
 * - Keyword match accumulation
 * - Working set membership bonus
 *
 * @example
 * ```typescript
 * const reranker = new Reranker({ maxScore: 500 });
 * const ranked = reranker.rank(evidence);
 * // ranked is sorted by finalScore DESC
 * ```
 */
export class Reranker {
  private weights: RerankerWeights;
  private readonly maxScore: number;

  /**
   * Create a new Reranker instance.
   * @param config - Configuration options
   */
  constructor(config: RerankerConfig = {}) {
    this.weights = {
      ...DEFAULT_WEIGHTS,
      ...config.weights,
    };
    this.maxScore = config.maxScore ?? 1000;
    // Note: config.useGraphRanking is reserved for future PageRank implementation
  }

  /**
   * Rank evidence items by multi-feature score.
   *
   * @param evidence - Evidence items to rank
   * @returns Evidence array sorted by finalScore in descending order
   */
  rank(evidence: readonly Evidence[]): Evidence[] {
    // Calculate final scores for all items
    const scored = evidence.map((item) => ({
      ...item,
      finalScore: this.calculateScore(item),
    }));

    // Sort by final score descending
    return scored.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
  }

  /**
   * Calculate multi-feature score for a single evidence item.
   *
   * Scoring algorithm:
   * 1. Start with baseScore from provider
   * 2. Add provider-specific bonus (diff: +100, LSP definition: +60)
   * 3. Add stack frame bonus with depth decay
   * 4. Add keyword match bonus (per match)
   * 5. Add working set bonus if applicable
   * 6. Normalize to maxScore
   *
   * @param evidence - Evidence item to score
   * @returns Final calculated score
   */
  private calculateScore(evidence: Evidence): number {
    let score = evidence.baseScore;

    // Provider-based bonus
    score += this.getProviderBonus(evidence);

    // Stack frame bonus with depth decay
    score += this.getStackFrameBonus(evidence);

    // Keyword match bonus (accumulates per match)
    score += this.getKeywordBonus(evidence.matchedSignals);

    // Working set bonus
    score += this.getWorkingSetBonus(evidence.matchedSignals);

    // Normalize to max score
    return Math.min(score, this.maxScore);
  }

  /**
   * Calculate provider-specific bonus.
   *
   * - diff provider: +weights.diff (100)
   * - lsp provider with symbolKind: +weights.definition (60)
   */
  private getProviderBonus(evidence: Evidence): number {
    switch (evidence.provider) {
      case "diff":
        return this.weights.diff;
      case "lsp":
        // Only add definition bonus if we have symbol metadata
        if (evidence.metadata?.symbolKind) {
          return this.weights.definition;
        }
        return 0;
      default:
        return 0;
    }
  }

  /**
   * Calculate stack frame proximity bonus with depth decay.
   *
   * Formula: stackFrame * (1 - depth * stackDepthDecay)
   * Example with depth=2: 80 * (1 - 2 * 0.1) = 80 * 0.8 = 64
   */
  private getStackFrameBonus(evidence: Evidence): number {
    const stackDepth = evidence.metadata?.stackDepth;

    if (stackDepth === undefined || typeof stackDepth !== "number") {
      return 0;
    }

    const decayFactor = 1 - stackDepth * this.weights.stackDepthDecay;
    const bonus = this.weights.stackFrame * decayFactor;

    // Ensure non-negative bonus
    return Math.max(0, bonus);
  }

  /**
   * Calculate keyword match bonus.
   *
   * Each error_token or symbol signal adds +weights.keyword (10).
   */
  private getKeywordBonus(signals: readonly Signal[]): number {
    const keywordMatches = signals.filter(
      (s) => s.type === "error_token" || s.type === "symbol"
    ).length;

    return keywordMatches * this.weights.keyword;
  }

  /**
   * Calculate working set bonus.
   *
   * If any signal has source='working_set', add +weights.workingSet (50).
   */
  private getWorkingSetBonus(signals: readonly Signal[]): number {
    const isFromWorkingSet = signals.some((s) => s.source === "working_set");
    return isFromWorkingSet ? this.weights.workingSet : 0;
  }

  /**
   * Get current reranker weights.
   *
   * @returns Current weight configuration
   */
  getWeights(): RerankerWeights {
    return { ...this.weights };
  }

  /**
   * Update reranker weights (for adaptive optimization).
   *
   * Note: This creates a new weights object with merged values.
   * The Reranker is designed to be mutable for runtime weight tuning.
   *
   * @param newWeights - Partial weights to update
   */
  updateWeights(newWeights: Partial<RerankerWeights>): void {
    Object.assign(this.weights, newWeights);
  }
}
