/**
 * Citation Collector Module
 *
 * Provides utilities for collecting and managing citations
 * (grounding chunks) from streaming responses.
 *
 * @module @vellum/core/streaming/citation
 */

import type { GroundingChunk } from "@vellum/provider";

// =============================================================================
// T019: CitationCollector Class
// =============================================================================

/**
 * Collects and manages citations from a stream.
 *
 * Handles deduplication of citations by URI and provides
 * sorted access by relevance score.
 *
 * @example
 * ```typescript
 * const collector = new CitationCollector();
 *
 * collector.processCitation({
 *   uri: 'https://example.com/doc1',
 *   title: 'Example Document',
 *   relevanceScore: 0.95,
 * });
 *
 * collector.processCitation({
 *   uri: 'https://example.com/doc2',
 *   title: 'Another Document',
 *   relevanceScore: 0.85,
 * });
 *
 * const sorted = collector.getSortedCitations();
 * // Returns citations sorted by relevance (highest first)
 * ```
 */
export class CitationCollector {
  private citations: Map<string, GroundingChunk> = new Map();

  /**
   * Process a citation event.
   *
   * Uses URI as key for deduplication - if a citation with the same
   * URI is already tracked, it will be replaced.
   *
   * @param chunk - The grounding chunk to add
   */
  processCitation(chunk: GroundingChunk): void {
    // Use URI as key for deduplication
    this.citations.set(chunk.uri, chunk);
  }

  /**
   * Get all citations sorted by relevance score (descending).
   *
   * Citations without a relevance score are treated as having score 0.
   *
   * @returns Array of citations sorted by relevance
   */
  getSortedCitations(): GroundingChunk[] {
    return [...this.citations.values()].sort((a, b) => {
      const scoreA = a.relevanceScore ?? 0;
      const scoreB = b.relevanceScore ?? 0;
      return scoreB - scoreA; // Descending
    });
  }

  /**
   * Get citation count.
   */
  get count(): number {
    return this.citations.size;
  }

  /**
   * Check if collector has any citations.
   *
   * @returns True if at least one citation has been collected
   */
  hasCitations(): boolean {
    return this.citations.size > 0;
  }

  /**
   * Reset collector.
   *
   * Clears all collected citations.
   */
  reset(): void {
    this.citations.clear();
  }
}
