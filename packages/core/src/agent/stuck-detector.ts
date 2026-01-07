// ============================================
// LLM Stuck Detector (T020)
// ============================================

/**
 * Detects when the LLM is stuck producing repetitive responses.
 *
 * Uses Jaccard similarity with n-grams to identify when recent responses
 * are too similar, indicating the LLM is not making progress.
 *
 * @module @vellum/core/agent/stuck-detector
 */

import { computeSimilarityStats, type SimilarityStats } from "./similarity.js";

/**
 * Result of LLM stuck detection.
 */
export interface StuckResult {
  /** Whether the LLM appears to be stuck */
  isStuck: boolean;
  /** Similarity score that triggered detection (if stuck) */
  similarityScore?: number;
  /** The similarity statistics for the analyzed window */
  stats?: SimilarityStats;
  /** Confidence level of the detection (0-1) */
  confidence: number;
  /** Suggested action */
  suggestedAction?: "continue" | "intervene" | "terminate";
}

/**
 * Configuration for the LLM stuck detector.
 */
export interface StuckDetectorConfig {
  /** Similarity threshold above which to consider stuck (default: 0.85) */
  threshold?: number;
  /** Number of recent responses to compare (default: 3) */
  windowSize?: number;
  /** N-gram size for tokenization (default: 3) */
  ngramSize?: number;
  /** Enable optional LLM judgment for borderline cases */
  enableLLMFallback?: boolean;
  /** Borderline zone boundaries [low, high] (default: [0.75, 0.90]) */
  borderlineZone?: [number, number];
}

/**
 * Default configuration for stuck detection.
 */
export const DEFAULT_STUCK_DETECTOR_CONFIG: Required<StuckDetectorConfig> = {
  threshold: 0.85,
  windowSize: 3,
  ngramSize: 3,
  enableLLMFallback: false,
  borderlineZone: [0.75, 0.9],
};

/**
 * Callback type for LLM judgment fallback.
 */
export type LLMJudgmentCallback = (
  responses: string[],
  stats: SimilarityStats
) => Promise<{ isStuck: boolean; confidence: number }>;

/**
 * Detects when the LLM is stuck producing highly similar responses.
 *
 * Uses text similarity analysis to identify repetitive output patterns
 * that indicate the model is not making progress on the task.
 *
 * @example
 * ```typescript
 * const detector = new LLMStuckDetector({
 *   threshold: 0.85,
 *   windowSize: 3,
 * });
 *
 * const result = detector.detect([
 *   "I cannot access that file.",
 *   "I'm unable to access that file.",
 *   "I can not access that file.",
 * ]);
 *
 * if (result.isStuck) {
 *   console.log(`LLM stuck (similarity: ${result.similarityScore})`);
 * }
 * ```
 */
export class LLMStuckDetector {
  private readonly config: Required<StuckDetectorConfig>;
  private llmJudgmentCallback?: LLMJudgmentCallback;

  constructor(config: StuckDetectorConfig = {}) {
    this.config = { ...DEFAULT_STUCK_DETECTOR_CONFIG, ...config };
  }

  /**
   * Gets the detector configuration.
   */
  getConfig(): Required<StuckDetectorConfig> {
    return { ...this.config };
  }

  /**
   * Sets the LLM judgment callback for borderline cases.
   *
   * @param callback - Async function that queries LLM for judgment
   */
  setLLMJudgmentCallback(callback: LLMJudgmentCallback): void {
    this.llmJudgmentCallback = callback;
  }

  /**
   * Detects if the LLM is stuck based on recent responses.
   *
   * @param messages - Array of recent LLM response texts
   * @returns StuckResult indicating whether the LLM is stuck
   */
  detect(messages: string[]): StuckResult {
    // Not enough messages to detect
    if (messages.length < this.config.windowSize) {
      return {
        isStuck: false,
        confidence: 1.0,
        suggestedAction: "continue",
      };
    }

    // Get the last N messages
    const recentMessages = messages.slice(-this.config.windowSize);

    // Compute similarity statistics
    const stats = computeSimilarityStats(recentMessages, this.config.ngramSize);

    // Determine if stuck based on average similarity
    const similarity = stats.average;
    const isAboveThreshold = similarity >= this.config.threshold;

    // Calculate confidence based on how far from threshold
    const distance = Math.abs(similarity - this.config.threshold);
    const maxDistance = 0.15; // Maximum distance for confidence calculation
    const confidence = Math.min(1.0, distance / maxDistance);

    // Determine suggested action
    let suggestedAction: "continue" | "intervene" | "terminate";
    if (similarity >= this.config.borderlineZone[1]) {
      suggestedAction = "terminate";
    } else if (similarity >= this.config.borderlineZone[0]) {
      suggestedAction = "intervene";
    } else {
      suggestedAction = "continue";
    }

    return {
      isStuck: isAboveThreshold,
      similarityScore: similarity,
      stats,
      confidence: isAboveThreshold ? confidence : 1.0 - confidence,
      suggestedAction,
    };
  }

  /**
   * Asynchronous detection with optional LLM judgment fallback.
   *
   * For borderline cases (similarity in the borderline zone), this method
   * can optionally consult an LLM for additional judgment.
   *
   * @param messages - Array of recent LLM response texts
   * @returns Promise resolving to StuckResult
   */
  async detectAsync(messages: string[]): Promise<StuckResult> {
    const result = this.detect(messages);

    // If not in borderline zone or LLM fallback disabled, return immediate result
    if (!this.config.enableLLMFallback || !this.llmJudgmentCallback) {
      return result;
    }

    const similarity = result.similarityScore ?? 0;
    const [lowBound, highBound] = this.config.borderlineZone;

    // Only use LLM fallback for borderline cases
    if (similarity < lowBound || similarity >= highBound) {
      return result;
    }

    // Borderline case - consult LLM
    try {
      const recentMessages = messages.slice(-this.config.windowSize);
      // result.stats is always defined when result comes from detect() which calls computeSimilarityStats
      const stats = result.stats ?? { average: 0, min: 0, max: 0, count: 0, pairCount: 0 };
      const llmResult = await this.llmJudgmentCallback(recentMessages, stats);

      return {
        isStuck: llmResult.isStuck,
        similarityScore: similarity,
        stats: result.stats,
        confidence: llmResult.confidence,
        suggestedAction: llmResult.isStuck ? "intervene" : "continue",
      };
    } catch {
      // LLM fallback failed, use similarity-based result
      return result;
    }
  }

  /**
   * Quick check if similarity indicates potential stuck state.
   *
   * @param similarity - Pre-computed similarity score
   * @returns Whether the similarity indicates a stuck state
   */
  isStuckFromSimilarity(similarity: number): boolean {
    return similarity >= this.config.threshold;
  }
}

/**
 * Creates a stuck detector with default configuration.
 */
export function createStuckDetector(config?: StuckDetectorConfig): LLMStuckDetector {
  return new LLMStuckDetector(config);
}

/**
 * Convenience function to detect if messages indicate stuck state.
 *
 * @param messages - Array of recent LLM response texts
 * @param threshold - Similarity threshold (default: 0.85)
 * @param windowSize - Number of messages to compare (default: 3)
 * @returns StuckResult
 */
export function detectStuck(messages: string[], threshold = 0.85, windowSize = 3): StuckResult {
  const detector = new LLMStuckDetector({ threshold, windowSize });
  return detector.detect(messages);
}

/**
 * Extracts text content from message objects for stuck detection.
 *
 * @param messages - Array of message objects with text content
 * @returns Array of text strings
 */
export function extractTextFromMessages<T extends { text?: string; content?: string }>(
  messages: T[]
): string[] {
  return messages.map((msg) => msg.text ?? msg.content ?? "").filter((text) => text.length > 0);
}
