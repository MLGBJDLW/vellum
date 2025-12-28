// ============================================
// Similarity Functions for Loop Detection (T019)
// ============================================

/**
 * Text similarity functions using Jaccard similarity with n-grams.
 *
 * Used for detecting when the LLM is stuck producing highly similar responses.
 *
 * @module @vellum/core/agent/similarity
 */

/**
 * Tokenizes text into n-grams (character sequences of length n).
 *
 * The text is normalized by converting to lowercase and collapsing
 * whitespace before tokenization.
 *
 * @example
 * ```typescript
 * const tokens = tokenize("hello world", 3);
 * // Set { "hel", "ell", "llo", "lo ", "o w", " wo", "wor", "orl", "rld" }
 * ```
 *
 * @param text - Input text to tokenize
 * @param n - Size of each n-gram (default: 3)
 * @returns Set of n-gram tokens
 */
export function tokenize(text: string, n = 3): Set<string> {
  const ngrams = new Set<string>();

  // Normalize: lowercase and collapse whitespace
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();

  // Handle short texts
  if (normalized.length < n) {
    if (normalized.length > 0) {
      ngrams.add(normalized);
    }
    return ngrams;
  }

  // Extract n-grams
  for (let i = 0; i <= normalized.length - n; i++) {
    ngrams.add(normalized.substring(i, i + n));
  }

  return ngrams;
}

/**
 * Calculates Jaccard similarity coefficient between two sets.
 *
 * Jaccard similarity = |A ∩ B| / |A ∪ B|
 *
 * Returns a value between 0 (completely different) and 1 (identical).
 *
 * @example
 * ```typescript
 * const setA = new Set(["abc", "bcd", "cde"]);
 * const setB = new Set(["abc", "cde", "efg"]);
 * const similarity = jaccardSimilarity(setA, setB);
 * // 0.5 (intersection: 2, union: 4)
 * ```
 *
 * @param a - First set of tokens
 * @param b - Second set of tokens
 * @returns Similarity coefficient between 0 and 1
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  // Handle empty sets
  if (a.size === 0 && b.size === 0) {
    return 1; // Both empty = identical
  }

  if (a.size === 0 || b.size === 0) {
    return 0; // One empty, one not = no similarity
  }

  // Calculate intersection size
  let intersectionSize = 0;
  for (const item of a) {
    if (b.has(item)) {
      intersectionSize++;
    }
  }

  // Union size = |A| + |B| - |A ∩ B|
  const unionSize = a.size + b.size - intersectionSize;

  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

/**
 * Calculates Jaccard similarity between two text strings.
 *
 * Convenience function that tokenizes both texts and computes similarity.
 *
 * @example
 * ```typescript
 * const similarity = textSimilarity("hello world", "hello there");
 * // Returns similarity coefficient based on 3-gram comparison
 * ```
 *
 * @param textA - First text
 * @param textB - Second text
 * @param n - N-gram size (default: 3)
 * @returns Similarity coefficient between 0 and 1
 */
export function textSimilarity(textA: string, textB: string, n = 3): number {
  const tokensA = tokenize(textA, n);
  const tokensB = tokenize(textB, n);
  return jaccardSimilarity(tokensA, tokensB);
}

/**
 * Calculates the average pairwise similarity among multiple texts.
 *
 * Computes Jaccard similarity for all unique pairs and returns the mean.
 *
 * @example
 * ```typescript
 * const texts = [
 *   "The file was not found",
 *   "The file was not found",
 *   "The file was not found",
 * ];
 * const avgSim = averageSimilarity(texts);
 * // 1.0 (all identical)
 * ```
 *
 * @param texts - Array of texts to compare
 * @param n - N-gram size (default: 3)
 * @returns Average similarity coefficient between 0 and 1
 */
export function averageSimilarity(texts: string[], n = 3): number {
  // Need at least 2 texts to compare
  if (texts.length < 2) {
    return texts.length === 1 ? 1 : 0;
  }

  // Pre-tokenize all texts
  const tokenSets = texts.map((text) => tokenize(text, n));

  // Calculate all pairwise similarities
  let totalSimilarity = 0;
  let pairCount = 0;

  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const setI = tokenSets[i] as Set<string>;
      const setJ = tokenSets[j] as Set<string>;
      totalSimilarity += jaccardSimilarity(setI, setJ);
      pairCount++;
    }
  }

  return pairCount === 0 ? 0 : totalSimilarity / pairCount;
}

/**
 * Calculates the minimum pairwise similarity among multiple texts.
 *
 * Returns the lowest similarity found between any pair.
 *
 * @param texts - Array of texts to compare
 * @param n - N-gram size (default: 3)
 * @returns Minimum similarity coefficient between 0 and 1
 */
export function minSimilarity(texts: string[], n = 3): number {
  if (texts.length < 2) {
    return texts.length === 1 ? 1 : 0;
  }

  const tokenSets = texts.map((text) => tokenize(text, n));
  let minSim = 1;

  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const setI = tokenSets[i] as Set<string>;
      const setJ = tokenSets[j] as Set<string>;
      const sim = jaccardSimilarity(setI, setJ);
      if (sim < minSim) {
        minSim = sim;
      }
    }
  }

  return minSim;
}

/**
 * Calculates the maximum pairwise similarity among multiple texts.
 *
 * Returns the highest similarity found between any pair.
 *
 * @param texts - Array of texts to compare
 * @param n - N-gram size (default: 3)
 * @returns Maximum similarity coefficient between 0 and 1
 */
export function maxSimilarity(texts: string[], n = 3): number {
  if (texts.length < 2) {
    return texts.length === 1 ? 1 : 0;
  }

  const tokenSets = texts.map((text) => tokenize(text, n));
  let maxSim = 0;

  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const setI = tokenSets[i] as Set<string>;
      const setJ = tokenSets[j] as Set<string>;
      const sim = jaccardSimilarity(setI, setJ);
      if (sim > maxSim) {
        maxSim = sim;
      }
    }
  }

  return maxSim;
}

/**
 * Result of similarity analysis on multiple texts.
 */
export interface SimilarityStats {
  /** Average pairwise similarity */
  average: number;
  /** Minimum pairwise similarity */
  min: number;
  /** Maximum pairwise similarity */
  max: number;
  /** Number of texts analyzed */
  count: number;
  /** Number of unique pairs compared */
  pairCount: number;
}

/**
 * Computes comprehensive similarity statistics for multiple texts.
 *
 * @param texts - Array of texts to analyze
 * @param n - N-gram size (default: 3)
 * @returns Similarity statistics
 */
export function computeSimilarityStats(texts: string[], n = 3): SimilarityStats {
  if (texts.length < 2) {
    return {
      average: texts.length === 1 ? 1 : 0,
      min: texts.length === 1 ? 1 : 0,
      max: texts.length === 1 ? 1 : 0,
      count: texts.length,
      pairCount: 0,
    };
  }

  const tokenSets = texts.map((text) => tokenize(text, n));
  let totalSimilarity = 0;
  let minSim = 1;
  let maxSim = 0;
  let pairCount = 0;

  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const setI = tokenSets[i] as Set<string>;
      const setJ = tokenSets[j] as Set<string>;
      const sim = jaccardSimilarity(setI, setJ);
      totalSimilarity += sim;
      pairCount++;
      if (sim < minSim) minSim = sim;
      if (sim > maxSim) maxSim = sim;
    }
  }

  return {
    average: pairCount === 0 ? 0 : totalSimilarity / pairCount,
    min: minSim,
    max: maxSim,
    count: texts.length,
    pairCount,
  };
}
