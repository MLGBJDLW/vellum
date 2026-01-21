/**
 * Fuzzy Search Service
 *
 * Provides fuzzy matching capabilities using fuzzysort for
 * improved file selection and command search experience.
 *
 * @module tui/services/fuzzy-search
 */

import fuzzysort from "fuzzysort";

// =============================================================================
// Types
// =============================================================================

/**
 * A range of character indices for highlighting matched portions.
 */
export interface HighlightRange {
  /** Start index (inclusive) */
  readonly start: number;
  /** End index (exclusive) */
  readonly end: number;
}

/**
 * Result from a fuzzy match operation.
 */
export interface FuzzyMatchResult {
  /** Whether the text matches the pattern */
  readonly matches: boolean;
  /** Match score (higher is better, null if no match) */
  readonly score: number | null;
  /** Character index ranges to highlight */
  readonly highlights: readonly HighlightRange[];
}

/**
 * A single fuzzy search result with the original item.
 */
export interface FuzzyResult<T> {
  /** The original item */
  readonly item: T;
  /** Match score (higher is better) */
  readonly score: number;
  /** Highlighted ranges for the matched field */
  readonly highlights: readonly HighlightRange[];
  /** The matched string target */
  readonly target: string;
}

/**
 * Options for fuzzy search operations.
 */
export interface FuzzySearchOptions {
  /** Maximum number of results to return (default: unlimited) */
  readonly limit?: number;
  /** Minimum score threshold (default: -10000) */
  readonly threshold?: number;
  /** Whether to allow typos/transpositions (default: false for speed) */
  readonly allowTypo?: boolean;
}

/**
 * Options for multi-field fuzzy search.
 */
export interface MultiFieldSearchOptions<T> extends FuzzySearchOptions {
  /** Fields to search with optional weights */
  readonly keys: readonly (keyof T | { key: keyof T; weight?: number })[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert fuzzysort indexes to highlight ranges.
 * Fuzzysort returns individual matching character indices.
 */
function indicesToRanges(indices: readonly number[] | null): HighlightRange[] {
  if (!indices || indices.length === 0) return [];

  const ranges: HighlightRange[] = [];
  const firstIndex = indices[0];
  if (firstIndex === undefined) return [];

  let start = firstIndex;
  let end = start + 1;

  for (let i = 1; i < indices.length; i++) {
    const idx = indices[i];
    if (idx === undefined) continue;
    if (idx === end) {
      // Consecutive, extend current range
      end = idx + 1;
    } else {
      // Gap, push current range and start new one
      ranges.push({ start, end });
      start = idx;
      end = idx + 1;
    }
  }

  // Push final range
  ranges.push({ start, end });

  return ranges;
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Perform fuzzy matching on a single text string.
 *
 * @param text - The text to match against
 * @param pattern - The search pattern
 * @returns Match result with score and highlight ranges
 *
 * @example
 * ```ts
 * const result = fuzzyMatch("autocomplete", "acp");
 * // { matches: true, score: -20, highlights: [{ start: 0, end: 1 }, { start: 4, end: 6 }] }
 * ```
 */
export function fuzzyMatch(text: string, pattern: string): FuzzyMatchResult {
  if (!pattern) {
    return { matches: true, score: 0, highlights: [] };
  }

  if (!text) {
    return { matches: false, score: null, highlights: [] };
  }

  const result = fuzzysort.single(pattern, text);

  if (!result) {
    return { matches: false, score: null, highlights: [] };
  }

  return {
    matches: true,
    score: result.score,
    highlights: indicesToRanges(result.indexes),
  };
}

/**
 * Search an array of items using fuzzy matching on a single field.
 *
 * @param items - Array of items to search
 * @param query - Search query string
 * @param key - Optional key to search (for object arrays)
 * @param options - Search options
 * @returns Sorted array of fuzzy results (best matches first)
 *
 * @example
 * ```ts
 * // String array
 * const commands = ['/help', '/history', '/hello'];
 * const results = fuzzySearch(commands, 'hel');
 *
 * // Object array with key
 * const options = [{ name: 'help' }, { name: 'history' }];
 * const results = fuzzySearch(options, 'hel', 'name');
 * ```
 */
export function fuzzySearch<T>(
  items: readonly T[],
  query: string,
  key?: keyof T,
  options: FuzzySearchOptions = {}
): FuzzyResult<T>[] {
  const { limit, threshold = -10000 } = options;

  if (!query) {
    // No query - return all items with neutral score
    const results: FuzzyResult<T>[] = items.map((item) => ({
      item,
      score: 0,
      highlights: [],
      target: key ? String(item[key]) : String(item),
    }));
    return limit ? results.slice(0, limit) : results;
  }

  if (key) {
    // Object array search
    const fuzzysortResults = fuzzysort.go(query, [...items] as object[], {
      key: key as string,
      limit,
      threshold,
    });

    return fuzzysortResults.map((result) => ({
      item: result.obj as T,
      score: result.score,
      highlights: indicesToRanges(result.indexes),
      target: result.target,
    }));
  }

  // String array search
  const fuzzysortResults = fuzzysort.go(query, [...items] as string[], {
    limit,
    threshold,
  });

  return fuzzysortResults.map((result) => ({
    item: result.target as T,
    score: result.score,
    highlights: indicesToRanges(result.indexes),
    target: result.target,
  }));
}

/**
 * Search items across multiple fields with optional weighting.
 *
 * @param items - Array of items to search
 * @param query - Search query string
 * @param options - Multi-field search options including keys to search
 * @returns Sorted array of fuzzy results (best matches first)
 *
 * @example
 * ```ts
 * const options = [
 *   { name: 'help', description: 'Show help message', aliases: ['h', '?'] },
 *   { name: 'history', description: 'View command history' },
 * ];
 *
 * const results = fuzzySearchMulti(options, 'help', {
 *   keys: ['name', { key: 'description', weight: 0.5 }],
 * });
 * ```
 */
export function fuzzySearchMulti<T extends object>(
  items: readonly T[],
  query: string,
  options: MultiFieldSearchOptions<T>
): FuzzyResult<T>[] {
  const { keys, limit, threshold = -10000 } = options;

  if (!query) {
    // No query - return all items
    const results: FuzzyResult<T>[] = items.map((item) => {
      const firstKey = typeof keys[0] === "object" ? keys[0].key : keys[0];
      return {
        item,
        score: 0,
        highlights: [],
        target: firstKey ? String(item[firstKey as keyof T]) : "",
      };
    });
    return limit ? results.slice(0, limit) : results;
  }

  // Normalize keys to array of strings for fuzzysort
  const keyStrings = keys.map((k) => (typeof k === "object" ? String(k.key) : String(k)));

  // Use fuzzysort.go with keys array
  const fuzzysortResults = fuzzysort.go(query, [...items] as object[], {
    keys: keyStrings,
    limit,
    threshold,
  });

  return fuzzysortResults.map((result) => {
    // Find best matching key result
    let bestKeyIndex = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < result.length; i++) {
      const keyResult = result[i];
      if (keyResult && keyResult.score > bestScore) {
        bestScore = keyResult.score;
        bestKeyIndex = i;
      }
    }

    const bestResult = result[bestKeyIndex];

    return {
      item: result.obj as T,
      score: result.score, // Combined score from fuzzysort
      highlights: bestResult ? indicesToRanges(bestResult.indexes) : [],
      target: bestResult?.target ?? "",
    };
  });
}

/**
 * Quick check if a pattern matches text (no scoring/highlighting).
 * More performant for simple "does it match?" checks.
 *
 * @param text - Text to check
 * @param pattern - Pattern to match
 * @returns True if pattern matches text
 */
export function fuzzyTest(text: string, pattern: string): boolean {
  if (!pattern) return true;
  if (!text) return false;

  const result = fuzzysort.single(pattern, text);
  return result !== null;
}

/**
 * Highlight matched characters in a string.
 * Returns an array of segments with highlight flags.
 *
 * @param text - Original text
 * @param highlights - Highlight ranges from fuzzy match
 * @returns Array of text segments with highlight info
 *
 * @example
 * ```ts
 * const segments = getHighlightSegments("autocomplete", [{ start: 0, end: 1 }, { start: 4, end: 6 }]);
 * // [
 * //   { text: 'a', highlighted: true },
 * //   { text: 'uto', highlighted: false },
 * //   { text: 'co', highlighted: true },
 * //   { text: 'mplete', highlighted: false }
 * // ]
 * ```
 */
export interface FuzzyHighlightSegment {
  readonly text: string;
  readonly highlighted: boolean;
}

export function getHighlightSegments(
  text: string,
  highlights: readonly HighlightRange[]
): FuzzyHighlightSegment[] {
  if (!highlights.length) {
    return [{ text, highlighted: false }];
  }

  const segments: FuzzyHighlightSegment[] = [];
  let lastEnd = 0;

  for (const range of highlights) {
    // Add non-highlighted segment before this range
    if (range.start > lastEnd) {
      segments.push({
        text: text.slice(lastEnd, range.start),
        highlighted: false,
      });
    }

    // Add highlighted segment
    segments.push({
      text: text.slice(range.start, range.end),
      highlighted: true,
    });

    lastEnd = range.end;
  }

  // Add remaining non-highlighted text
  if (lastEnd < text.length) {
    segments.push({
      text: text.slice(lastEnd),
      highlighted: false,
    });
  }

  return segments;
}

// =============================================================================
// Prepared Search (for large lists with repeated searches)
// =============================================================================

/**
 * Create a prepared searcher for a static list of items.
 * More efficient when searching the same list multiple times.
 *
 * @param items - Items to prepare for searching
 * @param key - Key to index (for objects)
 * @returns Prepared searcher function
 *
 * @example
 * ```ts
 * const commands = [{ name: 'help' }, { name: 'history' }];
 * const search = createPreparedSearch(commands, 'name');
 *
 * // Efficient repeated searches
 * const results1 = search('hel');
 * const results2 = search('his');
 * ```
 */
export function createPreparedSearch<T>(
  items: readonly T[],
  key?: keyof T
): (query: string, options?: FuzzySearchOptions) => FuzzyResult<T>[] {
  // Pre-prepare all targets for faster searching
  const prepared = key
    ? items.map((item) => ({
        item,
        prepared: fuzzysort.prepare(String(item[key])),
      }))
    : ([...items] as string[]).map((item) => ({
        item: item as T,
        prepared: fuzzysort.prepare(item),
      }));

  return (query: string, options: FuzzySearchOptions = {}): FuzzyResult<T>[] => {
    const { limit, threshold = -10000 } = options;

    if (!query) {
      const results: FuzzyResult<T>[] = prepared.map(({ item, prepared: p }) => ({
        item,
        score: 0,
        highlights: [],
        target: p.target,
      }));
      return limit ? results.slice(0, limit) : results;
    }

    // Search prepared targets
    const targets = prepared.map((p) => p.prepared);
    const fuzzysortResults = fuzzysort.go(query, targets, {
      limit,
      threshold,
    });

    return fuzzysortResults.map((result) => {
      // Find original item by target match
      const match = prepared.find((p) => p.prepared.target === result.target);
      return {
        item: match?.item ?? (result.target as T),
        score: result.score,
        highlights: indicesToRanges(result.indexes),
        target: result.target,
      };
    });
  };
}
