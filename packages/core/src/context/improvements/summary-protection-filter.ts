/**
 * Summary Protection Filter
 *
 * Protects summary messages from cascade compression by filtering them
 * out of compression candidates. This prevents information loss caused by:
 *
 * ```
 * M1-M50 → Summary1 (may lose detail)
 * M51-M90 → Summary2
 * Summary1 + Summary2 → Summary3 ← M1-M50 details permanently lost!
 * ```
 *
 * Supports multiple protection strategies:
 * - `all`: Protect all existing summaries
 * - `recent`: Only protect the most recent N summaries
 * - `weighted`: Protect based on importance (token count, age)
 *
 * @module @vellum/core/context/improvements
 */

import type { ContextMessage } from "../types.js";
import type { SummaryProtectionConfig, SummaryProtectionStrategy } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration for summary protection.
 */
export const DEFAULT_SUMMARY_PROTECTION_CONFIG: SummaryProtectionConfig = {
  enabled: true,
  maxProtectedSummaries: 5,
  strategy: "recent",
};

// ============================================================================
// SummaryProtectionFilter
// ============================================================================

/**
 * Filters summary messages from compression candidates to prevent cascade compression.
 *
 * Cascade compression occurs when summaries themselves get summarized, leading to
 * progressive information loss. This filter identifies and protects summaries
 * based on configurable strategies.
 *
 * @example
 * ```typescript
 * const filter = new SummaryProtectionFilter({
 *   enabled: true,
 *   maxProtectedSummaries: 5,
 *   strategy: 'recent',
 * });
 *
 * // Get IDs of protected summaries
 * const protectedIds = filter.getProtectedIds(allMessages);
 *
 * // Filter candidates before compression
 * const safeCandidates = filter.filterCandidates(candidates, allMessages);
 * ```
 */
export class SummaryProtectionFilter {
  private readonly config: SummaryProtectionConfig;

  /**
   * Create a new SummaryProtectionFilter.
   *
   * @param config - Protection configuration
   */
  constructor(config: Partial<SummaryProtectionConfig> = {}) {
    this.config = {
      ...DEFAULT_SUMMARY_PROTECTION_CONFIG,
      ...config,
    };
  }

  /**
   * Check if a message is a summary message.
   *
   * A message is considered a summary if:
   * - It has `isSummary: true`, OR
   * - It has a `condenseId` property set
   *
   * @param message - Message to check
   * @returns True if the message is a summary
   *
   * @example
   * ```typescript
   * const filter = new SummaryProtectionFilter();
   *
   * // Check via isSummary flag
   * filter.isSummaryMessage({ isSummary: true }); // true
   *
   * // Check via condenseId
   * filter.isSummaryMessage({ condenseId: 'condense-123' }); // true
   *
   * // Regular message
   * filter.isSummaryMessage({ content: 'Hello' }); // false
   * ```
   */
  isSummaryMessage(message: ContextMessage): boolean {
    return message.isSummary === true || message.condenseId !== undefined;
  }

  /**
   * Get all summary messages from a message array.
   *
   * @param messages - Messages to search
   * @returns Array of summary messages
   */
  getSummaryMessages(messages: ContextMessage[]): ContextMessage[] {
    return messages.filter((m) => this.isSummaryMessage(m));
  }

  /**
   * Get IDs of messages that should be protected from compression.
   *
   * The protected set depends on the configured strategy:
   * - `all`: All summary message IDs are protected
   * - `recent`: Only the most recent N summary IDs are protected
   * - `weighted`: Summaries are scored and top N by importance are protected
   *
   * @param messages - All messages to evaluate
   * @returns Set of message IDs that should be protected
   *
   * @example
   * ```typescript
   * const filter = new SummaryProtectionFilter({
   *   strategy: 'recent',
   *   maxProtectedSummaries: 3,
   * });
   *
   * const protectedIds = filter.getProtectedIds(messages);
   * // Returns IDs of the 3 most recent summaries
   * ```
   */
  getProtectedIds(messages: ContextMessage[]): Set<string> {
    // If protection is disabled, return empty set
    if (!this.config.enabled) {
      return new Set();
    }

    const summaries = this.getSummaryMessages(messages);

    // If no summaries exist, return empty set
    if (summaries.length === 0) {
      return new Set();
    }

    // Apply strategy to determine which summaries to protect
    const toProtect = this.applyStrategy(summaries);

    return new Set(toProtect.map((m) => m.id));
  }

  /**
   * Filter compression candidates to remove protected summary messages.
   *
   * This should be called before compression to ensure summaries are not
   * selected for re-compression, which would cause cascade information loss.
   *
   * @param candidates - Messages selected for compression
   * @param allMessages - All messages (used for strategy evaluation)
   * @returns Filtered candidates with protected summaries removed
   *
   * @example
   * ```typescript
   * const filter = new SummaryProtectionFilter({ strategy: 'all' });
   *
   * // Original candidates include summaries
   * const candidates = [msg1, summary1, msg2, summary2, msg3];
   *
   * // After filtering, summaries are removed
   * const safe = filter.filterCandidates(candidates, allMessages);
   * // Returns [msg1, msg2, msg3]
   * ```
   */
  filterCandidates(candidates: ContextMessage[], allMessages: ContextMessage[]): ContextMessage[] {
    // If protection is disabled, return candidates unchanged
    if (!this.config.enabled) {
      return candidates;
    }

    // Get protected IDs from all messages (for strategy evaluation)
    const protectedIds = this.getProtectedIds(allMessages);

    // Filter out protected messages from candidates
    return candidates.filter((m) => !protectedIds.has(m.id));
  }

  /**
   * Apply the configured protection strategy to determine which summaries to protect.
   *
   * @param summaries - All summary messages
   * @returns Summaries that should be protected
   */
  private applyStrategy(summaries: ContextMessage[]): ContextMessage[] {
    switch (this.config.strategy) {
      case "all":
        return summaries;

      case "recent":
        return this.applyRecentStrategy(summaries);

      case "weighted":
        return this.applyWeightedStrategy(summaries);

      default: {
        // Exhaustive check - TypeScript will error if a strategy is missed
        const _exhaustive: never = this.config.strategy;
        throw new Error(`Unknown protection strategy: ${_exhaustive}`);
      }
    }
  }

  /**
   * Apply 'recent' strategy - protect the most recent N summaries.
   *
   * Summaries are sorted by createdAt timestamp (descending), and the
   * most recent `maxProtectedSummaries` are protected.
   *
   * @param summaries - All summary messages
   * @returns Most recent N summaries to protect
   */
  private applyRecentStrategy(summaries: ContextMessage[]): ContextMessage[] {
    const { maxProtectedSummaries } = this.config;

    // Sort by createdAt descending (most recent first)
    const sorted = [...summaries].sort((a, b) => {
      const timeA = a.createdAt ?? 0;
      const timeB = b.createdAt ?? 0;
      return timeB - timeA;
    });

    // Take the most recent N
    return sorted.slice(0, maxProtectedSummaries);
  }

  /**
   * Apply 'weighted' strategy - protect summaries by importance score.
   *
   * Importance is calculated based on:
   * - Token count (larger summaries = more important)
   * - Recency (newer summaries = more important)
   * - Compression metadata (higher compressed count = more important)
   *
   * @param summaries - All summary messages
   * @returns Top N summaries by importance
   */
  private applyWeightedStrategy(summaries: ContextMessage[]): ContextMessage[] {
    const { maxProtectedSummaries } = this.config;

    // Calculate importance score for each summary
    const scored = summaries.map((summary) => ({
      summary,
      score: this.calculateImportanceScore(summary, summaries),
    }));

    // Sort by score descending (most important first)
    scored.sort((a, b) => b.score - a.score);

    // Take the top N
    return scored.slice(0, maxProtectedSummaries).map((s) => s.summary);
  }

  /**
   * Calculate importance score for a summary.
   *
   * Scoring factors (each normalized to 0-1 range):
   * - Token ratio: summary.tokens / maxTokens (40% weight)
   * - Recency: age-based decay (40% weight)
   * - Compressed count: from metadata (20% weight)
   *
   * @param summary - Summary to score
   * @param allSummaries - All summaries for normalization
   * @returns Importance score (0-100)
   */
  private calculateImportanceScore(
    summary: ContextMessage,
    allSummaries: ContextMessage[]
  ): number {
    // Factor 1: Token count (larger = more important)
    const maxTokens = Math.max(...allSummaries.map((s) => s.tokens ?? 0), 1);
    const tokenScore = (summary.tokens ?? 0) / maxTokens;

    // Factor 2: Recency (newer = more important)
    const now = Date.now();
    const timestamps = allSummaries.map((s) => s.createdAt ?? now);
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps, now);
    const timeRange = maxTime - minTime || 1;
    const recencyScore = ((summary.createdAt ?? now) - minTime) / timeRange;

    // Factor 3: Compressed message count (more = more important)
    const compressedCount = (summary.metadata?.compressedCount as number | undefined) ?? 0;
    const maxCompressed = Math.max(
      ...allSummaries.map((s) => (s.metadata?.compressedCount as number | undefined) ?? 0),
      1
    );
    const compressedScore = compressedCount / maxCompressed;

    // Weighted combination
    const weights = {
      tokens: 0.4,
      recency: 0.4,
      compressed: 0.2,
    };

    const score =
      tokenScore * weights.tokens +
      recencyScore * weights.recency +
      compressedScore * weights.compressed;

    return score * 100;
  }

  /**
   * Get statistics about summary protection.
   *
   * Useful for debugging and monitoring protection behavior.
   *
   * @param messages - All messages to analyze
   * @returns Protection statistics
   */
  getProtectionStats(messages: ContextMessage[]): SummaryProtectionStats {
    const allSummaries = this.getSummaryMessages(messages);
    const protectedIds = this.getProtectedIds(messages);

    return {
      totalSummaries: allSummaries.length,
      protectedCount: protectedIds.size,
      unprotectedCount: allSummaries.length - protectedIds.size,
      strategy: this.config.strategy,
      maxProtected: this.config.maxProtectedSummaries,
      enabled: this.config.enabled,
    };
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Statistics about summary protection state.
 */
export interface SummaryProtectionStats {
  /** Total number of summary messages */
  totalSummaries: number;
  /** Number of protected summaries */
  protectedCount: number;
  /** Number of unprotected summaries */
  unprotectedCount: number;
  /** Current protection strategy */
  strategy: SummaryProtectionStrategy;
  /** Maximum summaries to protect */
  maxProtected: number;
  /** Whether protection is enabled */
  enabled: boolean;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a SummaryProtectionFilter with optional configuration.
 *
 * Factory function for convenient filter creation.
 *
 * @param config - Optional configuration overrides
 * @returns Configured SummaryProtectionFilter instance
 *
 * @example
 * ```typescript
 * // Default configuration
 * const filter = createSummaryProtectionFilter();
 *
 * // Custom configuration
 * const filter = createSummaryProtectionFilter({
 *   strategy: 'all',
 *   maxProtectedSummaries: 10,
 * });
 * ```
 */
export function createSummaryProtectionFilter(
  config?: Partial<SummaryProtectionConfig>
): SummaryProtectionFilter {
  return new SummaryProtectionFilter(config);
}
