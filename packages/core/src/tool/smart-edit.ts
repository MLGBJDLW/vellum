/**
 * SmartEdit Engine - T031, T032, T033, T034, T035
 *
 * Intelligent text replacement engine with multiple matching strategies.
 * Used by apply_diff and smart_edit tools to handle context mismatches.
 *
 * Strategy cascade:
 * 1. Exact match - Direct string match (confidence: 1.0)
 * 2. Whitespace normalize - Normalize trailing/leading whitespace (confidence: 0.95)
 * 3. Fuzzy match - Line-by-line similarity scoring (confidence: 0.8-0.95)
 * 4. Block match - Find larger context containing search text (confidence: 0.7-0.9)
 * 5. LLM fallback - Request LLM assistance (confidence: 0)
 *
 * @module tool/smart-edit
 */

// =============================================================================
// T031: Types and Interfaces
// =============================================================================

/**
 * Available matching strategy names
 */
export type StrategyName = "exact" | "whitespace" | "fuzzy" | "block" | "llm";

/**
 * Result of a SmartEdit operation
 */
export interface SmartEditResult {
  /** Whether the edit was successfully applied */
  success: boolean;
  /** The modified text (original if failed) */
  output: string;
  /** The strategy that succeeded (or 'llm' if fallback needed) */
  strategy: StrategyName;
  /** Confidence score of the match (0.0-1.0) */
  confidence: number;
  /** Error message if failed */
  error?: string;
  /** Match details for debugging */
  matchDetails?: {
    /** Position where match was found */
    position?: number;
    /** Length of matched text */
    matchLength?: number;
    /** Similarity score for fuzzy matching */
    similarity?: number;
  };
}

/**
 * Options for SmartEdit engine configuration
 */
export interface SmartEditOptions {
  /**
   * Strategies to attempt, in order.
   * Default: ['exact', 'whitespace', 'fuzzy', 'block', 'llm']
   */
  strategies?: StrategyName[];
  /**
   * Minimum confidence threshold to accept a match.
   * Matches below this threshold will fall through to next strategy.
   * Default: 0.8
   */
  confidenceThreshold?: number;
}

/**
 * SmartEdit engine interface
 */
export interface SmartEditEngine {
  /**
   * Apply a search-and-replace operation using intelligent matching
   *
   * @param original - The original text to modify
   * @param search - The text to find
   * @param replace - The replacement text
   * @returns Result with success status, output, strategy used, and confidence
   */
  apply(original: string, search: string, replace: string): SmartEditResult;

  /**
   * Apply with a specific strategy only
   *
   * @param original - The original text to modify
   * @param search - The text to find
   * @param replace - The replacement text
   * @param strategy - The specific strategy to use
   * @returns Result with success status, output, and confidence
   */
  applyWithStrategy(
    original: string,
    search: string,
    replace: string,
    strategy: StrategyName
  ): SmartEditResult;
}

// =============================================================================
// T032, T033, T034, T035: Strategy Implementations
// =============================================================================

/**
 * Strategy function signature
 */
type StrategyFunction = (
  original: string,
  search: string,
  replace: string
) => SmartEditResult | null;

/**
 * T032: Exact match strategy
 *
 * Performs a direct string match. Returns immediately with confidence 1.0
 * if the search text is found exactly in the original.
 */
function exactMatchStrategy(
  original: string,
  search: string,
  replace: string
): SmartEditResult | null {
  const position = original.indexOf(search);
  if (position === -1) {
    return null;
  }

  // Replace the first occurrence
  const output = original.slice(0, position) + replace + original.slice(position + search.length);

  return {
    success: true,
    output,
    strategy: "exact",
    confidence: 1.0,
    matchDetails: {
      position,
      matchLength: search.length,
    },
  };
}

/**
 * T033: Whitespace normalization strategy
 *
 * Normalizes both original and search text by:
 * - Trimming trailing whitespace from each line
 * - Normalizing line endings (CRLF → LF)
 *
 * Returns confidence 0.95 on match.
 */
function whitespaceNormalizeStrategy(
  original: string,
  search: string,
  replace: string
): SmartEditResult | null {
  // Normalize function
  const normalize = (text: string): string => {
    return text
      .replace(/\r\n/g, "\n") // CRLF → LF
      .split("\n")
      .map((line) => line.trimEnd()) // Trim trailing whitespace per line
      .join("\n");
  };

  const normalizedOriginal = normalize(original);
  const normalizedSearch = normalize(search);

  const position = normalizedOriginal.indexOf(normalizedSearch);
  if (position === -1) {
    return null;
  }

  // Find the corresponding position in the original text
  // We need to map normalized position back to original position
  const originalPosition = mapNormalizedPositionToOriginal(original, position);
  const originalEndPosition = findOriginalEndPosition(
    original,
    originalPosition,
    normalizedSearch.length,
    normalizedOriginal
  );

  // Replace in original text
  const output =
    original.slice(0, originalPosition) + replace + original.slice(originalEndPosition);

  return {
    success: true,
    output,
    strategy: "whitespace",
    confidence: 0.95,
    matchDetails: {
      position: originalPosition,
      matchLength: originalEndPosition - originalPosition,
    },
  };
}

/**
 * Map a position in normalized text back to original text
 */
function mapNormalizedPositionToOriginal(original: string, normalizedPos: number): number {
  // Normalize and track character mapping
  let normalizedIndex = 0;
  let originalIndex = 0;

  while (normalizedIndex < normalizedPos && originalIndex < original.length) {
    const char = original[originalIndex];

    // Skip CR in CRLF
    if (char === "\r" && original[originalIndex + 1] === "\n") {
      originalIndex++;
      continue;
    }

    // Check for trailing whitespace before newline (which gets trimmed)
    if (char === " " || char === "\t") {
      // Look ahead to see if this is trailing whitespace
      let lookAhead = originalIndex;
      while (
        lookAhead < original.length &&
        (original[lookAhead] === " " || original[lookAhead] === "\t")
      ) {
        lookAhead++;
      }
      if (
        lookAhead >= original.length ||
        original[lookAhead] === "\n" ||
        original[lookAhead] === "\r"
      ) {
        // This is trailing whitespace, skip it in original
        originalIndex = lookAhead;
        continue;
      }
    }

    normalizedIndex++;
    originalIndex++;
  }

  return originalIndex;
}

/**
 * Find the end position in original text that corresponds to the end of a match
 */
function findOriginalEndPosition(
  original: string,
  originalStart: number,
  normalizedLength: number,
  _normalizedOriginal: string
): number {
  let normalizedCount = 0;
  let originalIndex = originalStart;

  while (normalizedCount < normalizedLength && originalIndex < original.length) {
    const char = original[originalIndex];

    // Skip CR in CRLF
    if (char === "\r" && original[originalIndex + 1] === "\n") {
      originalIndex++;
      continue;
    }

    // Check for trailing whitespace before newline
    if (char === " " || char === "\t") {
      let lookAhead = originalIndex;
      while (
        lookAhead < original.length &&
        (original[lookAhead] === " " || original[lookAhead] === "\t")
      ) {
        lookAhead++;
      }
      if (
        lookAhead >= original.length ||
        original[lookAhead] === "\n" ||
        original[lookAhead] === "\r"
      ) {
        originalIndex = lookAhead;
        continue;
      }
    }

    normalizedCount++;
    originalIndex++;
  }

  return originalIndex;
}

/**
 * T034: Line fuzzy matching strategy
 *
 * Splits text into lines and computes per-line similarity using
 * Levenshtein distance. Applies if overall similarity exceeds threshold.
 *
 * Confidence equals the computed similarity score.
 */
function fuzzyMatchStrategy(
  original: string,
  search: string,
  replace: string,
  threshold = 0.8
): SmartEditResult | null {
  const originalLines = original.split("\n");
  const searchLines = search.split("\n");

  if (searchLines.length === 0) {
    return null;
  }

  // Try to find the best matching position
  const bestMatch = findBestFuzzyMatch(originalLines, searchLines, threshold);

  if (!bestMatch) {
    return null;
  }

  // Apply the replacement
  const outputLines = [
    ...originalLines.slice(0, bestMatch.startLine),
    ...replace.split("\n"),
    ...originalLines.slice(bestMatch.startLine + searchLines.length),
  ];

  return {
    success: true,
    output: outputLines.join("\n"),
    strategy: "fuzzy",
    confidence: bestMatch.similarity,
    matchDetails: {
      position: bestMatch.startLine,
      matchLength: searchLines.length,
      similarity: bestMatch.similarity,
    },
  };
}

/**
 * Find the best fuzzy match position in original lines
 */
function findBestFuzzyMatch(
  originalLines: string[],
  searchLines: string[],
  threshold: number
): { startLine: number; similarity: number } | null {
  let bestMatch: { startLine: number; similarity: number } | null = null;

  // Slide through original looking for best match
  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    const windowLines = originalLines.slice(i, i + searchLines.length);
    const similarity = computeBlockSimilarity(windowLines, searchLines);

    if (similarity >= threshold) {
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { startLine: i, similarity };
      }
    }
  }

  return bestMatch;
}

/**
 * Compute similarity between two arrays of lines
 */
function computeBlockSimilarity(lines1: string[], lines2: string[]): number {
  if (lines1.length !== lines2.length) {
    return 0;
  }

  if (lines1.length === 0) {
    return 1.0;
  }

  let totalSimilarity = 0;
  for (let i = 0; i < lines1.length; i++) {
    const line1 = lines1[i];
    const line2 = lines2[i];
    if (line1 !== undefined && line2 !== undefined) {
      totalSimilarity += computeLineSimilarity(line1, line2);
    }
  }

  return totalSimilarity / lines1.length;
}

/**
 * Compute similarity between two strings using Levenshtein distance
 */
function computeLineSimilarity(str1: string, str2: string): number {
  if (str1 === str2) {
    return 1.0;
  }

  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) {
    return 1.0;
  }

  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
}

/**
 * Compute Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Create distance matrix
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= m; i++) {
    dp[i]![0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0]![j] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const row = dp[i];
      const prevRow = dp[i - 1];
      if (row && prevRow) {
        if (str1[i - 1] === str2[j - 1]) {
          row[j] = prevRow[j - 1] ?? 0;
        } else {
          row[j] = 1 + Math.min(prevRow[j] ?? 0, row[j - 1] ?? 0, prevRow[j - 1] ?? 0);
        }
      }
    }
  }

  return dp[m]?.[n] ?? Math.max(m, n);
}

/**
 * T035: Block matching strategy
 *
 * Finds a larger context block that contains the search text,
 * even if there are minor differences. Uses anchor lines (first/last)
 * to locate the block.
 *
 * Confidence ranges from 0.7-0.9 based on match quality.
 */
function blockMatchStrategy(
  original: string,
  search: string,
  replace: string
): SmartEditResult | null {
  const originalLines = original.split("\n");
  const searchLines = search.split("\n");

  if (searchLines.length < 2) {
    // Block matching requires at least 2 lines for anchoring
    return null;
  }

  // Use first and last lines as anchors
  const firstSearchLine = (searchLines[0] ?? "").trim();
  const lastSearchLine = (searchLines[searchLines.length - 1] ?? "").trim();

  // Find potential anchor positions
  const anchorMatches = findBlockAnchors(
    originalLines,
    firstSearchLine,
    lastSearchLine,
    searchLines.length
  );

  if (anchorMatches.length === 0) {
    return null;
  }

  // Find the best matching block
  let bestBlock: { startLine: number; endLine: number; confidence: number } | null = null;

  for (const anchor of anchorMatches) {
    const blockLines = originalLines.slice(anchor.startLine, anchor.endLine + 1);
    const similarity = computeBlockSimilarity(blockLines, searchLines);

    // For block matching, we accept lower thresholds
    const confidence = 0.7 + similarity * 0.2; // Scale to 0.7-0.9 range

    if (similarity >= 0.5) {
      // More lenient for block matching
      if (!bestBlock || confidence > bestBlock.confidence) {
        bestBlock = { ...anchor, confidence };
      }
    }
  }

  if (!bestBlock) {
    return null;
  }

  // Apply the replacement
  const outputLines = [
    ...originalLines.slice(0, bestBlock.startLine),
    ...replace.split("\n"),
    ...originalLines.slice(bestBlock.endLine + 1),
  ];

  return {
    success: true,
    output: outputLines.join("\n"),
    strategy: "block",
    confidence: bestBlock.confidence,
    matchDetails: {
      position: bestBlock.startLine,
      matchLength: bestBlock.endLine - bestBlock.startLine + 1,
    },
  };
}

/**
 * Find potential block anchors by matching first/last lines
 */
function findBlockAnchors(
  originalLines: string[],
  firstSearchLine: string,
  lastSearchLine: string,
  searchLineCount: number
): Array<{ startLine: number; endLine: number }> {
  const anchors: Array<{ startLine: number; endLine: number }> = [];

  for (let i = 0; i <= originalLines.length - searchLineCount; i++) {
    const firstOriginalLine = originalLines[i]?.trim() ?? "";
    const expectedEndLine = i + searchLineCount - 1;

    if (expectedEndLine >= originalLines.length) continue;

    const lastOriginalLine = originalLines[expectedEndLine]?.trim() ?? "";

    // Check if first and last lines are similar enough
    const firstSimilarity = computeLineSimilarity(firstOriginalLine, firstSearchLine);
    const lastSimilarity = computeLineSimilarity(lastOriginalLine, lastSearchLine);

    if (firstSimilarity >= 0.7 && lastSimilarity >= 0.7) {
      anchors.push({ startLine: i, endLine: expectedEndLine });
    }
  }

  return anchors;
}

/**
 * T035: LLM fallback strategy
 *
 * Returns a special result indicating LLM assistance is needed.
 * This is used when all other strategies fail and the edit
 * requires human or AI understanding to resolve.
 */
function llmFallbackStrategy(original: string, search: string, _replace: string): SmartEditResult {
  return {
    success: false,
    output: original,
    strategy: "llm",
    confidence: 0,
    error: `No automatic match found for search text. LLM assistance may be required to resolve the mismatch.`,
    matchDetails: {
      matchLength: search.length,
    },
  };
}

// =============================================================================
// T031: SmartEdit Engine Factory
// =============================================================================

/** Default strategy order */
const DEFAULT_STRATEGIES: StrategyName[] = ["exact", "whitespace", "fuzzy", "block", "llm"];

/** Default confidence threshold */
const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Create a SmartEdit engine with configurable strategies
 *
 * @param options - Engine configuration options
 * @returns Configured SmartEditEngine instance
 *
 * @example
 * ```typescript
 * // Use default configuration
 * const engine = createSmartEditEngine();
 * const result = engine.apply(original, search, replace);
 *
 * // Use only exact and whitespace strategies
 * const strictEngine = createSmartEditEngine({
 *   strategies: ['exact', 'whitespace'],
 *   confidenceThreshold: 0.95,
 * });
 * ```
 */
export function createSmartEditEngine(options?: SmartEditOptions): SmartEditEngine {
  const strategies = options?.strategies ?? DEFAULT_STRATEGIES;
  const confidenceThreshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

  // Map strategy names to functions
  const strategyMap: Record<StrategyName, StrategyFunction> = {
    exact: exactMatchStrategy,
    whitespace: whitespaceNormalizeStrategy,
    fuzzy: (original, search, replace) =>
      fuzzyMatchStrategy(original, search, replace, confidenceThreshold),
    block: blockMatchStrategy,
    llm: llmFallbackStrategy,
  };

  return {
    apply(original: string, search: string, replace: string): SmartEditResult {
      // Try each strategy in order
      for (const strategyName of strategies) {
        const strategyFn = strategyMap[strategyName];
        if (!strategyFn) continue;

        const result = strategyFn(original, search, replace);

        // Strategy succeeded and meets confidence threshold
        if (result !== null) {
          // LLM fallback always returns (as failure indicator)
          if (strategyName === "llm") {
            return result;
          }

          // Other strategies need to meet confidence threshold
          if (result.confidence >= confidenceThreshold) {
            return result;
          }
        }
      }

      // No strategy succeeded - return LLM fallback
      return llmFallbackStrategy(original, search, replace);
    },

    applyWithStrategy(
      original: string,
      search: string,
      replace: string,
      strategy: StrategyName
    ): SmartEditResult {
      const strategyFn = strategyMap[strategy];
      if (!strategyFn) {
        return {
          success: false,
          output: original,
          strategy,
          confidence: 0,
          error: `Unknown strategy: ${strategy}`,
        };
      }

      const result = strategyFn(original, search, replace);

      // If strategy didn't match, return failure
      if (result === null) {
        return {
          success: false,
          output: original,
          strategy,
          confidence: 0,
          error: `Strategy '${strategy}' did not find a match`,
        };
      }

      return result;
    },
  };
}

// =============================================================================
// Utility Exports for Testing
// =============================================================================

/**
 * Exported for testing purposes
 * @internal
 */
export const _internal = {
  levenshteinDistance,
  computeLineSimilarity,
  computeBlockSimilarity,
  findBestFuzzyMatch,
  findBlockAnchors,
};
