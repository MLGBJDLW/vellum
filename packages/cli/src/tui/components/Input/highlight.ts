/**
 * Input Highlight Utilities (T009-HL)
 *
 * Provides text highlighting for special patterns in user input:
 * - @mentions: File paths and folder references
 * - Slash commands: /mode, /model, /help, etc.
 * - URLs: http:// and https:// links
 * - Inline code: `backtick-wrapped` code
 *
 * @module tui/components/Input/highlight
 */

import chalk from "chalk";

// =============================================================================
// Types
// =============================================================================

/**
 * Types of highlightable patterns.
 */
export type HighlightType = "mention" | "command" | "url" | "code";

/**
 * A segment of highlighted text.
 */
export interface HighlightSegment {
  /** The text content */
  readonly text: string;
  /** The type of highlight, or undefined for plain text */
  readonly type?: HighlightType;
  /** Start index in original string */
  readonly start: number;
  /** End index in original string (exclusive) */
  readonly end: number;
}

/**
 * Result of parsing input for highlights.
 */
export interface HighlightResult {
  /** Array of text segments with highlight info */
  readonly segments: readonly HighlightSegment[];
  /** Whether any highlights were found */
  readonly hasHighlights: boolean;
}

// =============================================================================
// Patterns
// =============================================================================
// Caching
// =============================================================================

/**
 * LRU cache for highlight results to avoid recomputing on every keystroke.
 * Limited to 50 entries to prevent memory bloat.
 */
const HIGHLIGHT_CACHE_SIZE = 50;
const highlightCache = new Map<string, HighlightResult>();

/**
 * Add result to cache with LRU eviction.
 */
function cacheResult(input: string, result: HighlightResult): void {
  // Evict oldest entry if at capacity
  if (highlightCache.size >= HIGHLIGHT_CACHE_SIZE) {
    const firstKey = highlightCache.keys().next().value;
    if (firstKey !== undefined) {
      highlightCache.delete(firstKey);
    }
  }
  highlightCache.set(input, result);
}

/**
 * Get cached result if available.
 */
function getCachedResult(input: string): HighlightResult | undefined {
  const cached = highlightCache.get(input);
  if (cached) {
    // Move to end for LRU (delete and re-add)
    highlightCache.delete(input);
    highlightCache.set(input, cached);
  }
  return cached;
}

// =============================================================================
// Patterns
// =============================================================================

/**
 * Pattern definitions for highlighting.
 * Order matters - patterns are matched in priority order.
 */
const HIGHLIGHT_PATTERNS: readonly { type: HighlightType; pattern: RegExp }[] = [
  // URLs: Match http:// or https:// followed by non-whitespace
  {
    type: "url",
    pattern: /https?:\/\/[^\s]+/g,
  },
  // Inline code: Backtick-wrapped text (non-greedy, no nested backticks)
  {
    type: "code",
    pattern: /`[^`]+`/g,
  },
  // Slash commands: /word at start of input or after whitespace
  {
    type: "command",
    pattern: /(?:^|\s)(\/[a-zA-Z][a-zA-Z0-9_-]*)/g,
  },
  // @mentions: @path/to/file or @filename.ext
  {
    type: "mention",
    pattern: /@[\w./-]+/g,
  },
];

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Find all highlight matches in the input text.
 * Returns matches sorted by start position.
 */
function findMatches(
  input: string
): Array<{ type: HighlightType; start: number; end: number; text: string }> {
  const matches: Array<{ type: HighlightType; start: number; end: number; text: string }> = [];

  for (const { type, pattern } of HIGHLIGHT_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    let match = pattern.exec(input);

    while (match !== null) {
      // For command pattern, we capture group 1 (the actual command without leading whitespace)
      const text = type === "command" && match[1] ? match[1] : match[0];
      const start =
        type === "command" && match[1] ? match.index + match[0].indexOf(match[1]) : match.index;
      const end = start + text.length;

      matches.push({ type, start, end, text });
      match = pattern.exec(input);
    }
  }

  // Sort by start position
  return matches.sort((a, b) => a.start - b.start);
}

/**
 * Remove overlapping matches, keeping earlier/higher priority matches.
 */
function removeOverlaps(
  matches: Array<{ type: HighlightType; start: number; end: number; text: string }>
): Array<{ type: HighlightType; start: number; end: number; text: string }> {
  const result: Array<{ type: HighlightType; start: number; end: number; text: string }> = [];

  for (const match of matches) {
    // Check if this match overlaps with any existing match
    const overlaps = result.some(
      (existing) => match.start < existing.end && match.end > existing.start
    );

    if (!overlaps) {
      result.push(match);
    }
  }

  return result;
}

/**
 * Parse input text and identify highlighted segments.
 * Results are cached to avoid redundant regex processing.
 *
 * @param input - The input text to parse
 * @returns HighlightResult with segments and metadata
 *
 * @example
 * ```ts
 * const result = parseHighlights("Check @file.ts with /help");
 * // result.segments = [
 * //   { text: "Check ", start: 0, end: 6 },
 * //   { text: "@file.ts", type: "mention", start: 6, end: 14 },
 * //   { text: " with ", start: 14, end: 20 },
 * //   { text: "/help", type: "command", start: 20, end: 25 }
 * // ]
 * ```
 */
export function parseHighlights(input: string): HighlightResult {
  if (!input) {
    return { segments: [], hasHighlights: false };
  }

  // Check cache first
  const cached = getCachedResult(input);
  if (cached) {
    return cached;
  }

  const matches = removeOverlaps(findMatches(input));
  const segments: HighlightSegment[] = [];
  let currentPos = 0;

  for (const match of matches) {
    // Add plain text before this match
    if (match.start > currentPos) {
      segments.push({
        text: input.slice(currentPos, match.start),
        start: currentPos,
        end: match.start,
      });
    }

    // Add the highlighted segment
    segments.push({
      text: match.text,
      type: match.type,
      start: match.start,
      end: match.end,
    });

    currentPos = match.end;
  }

  // Add remaining plain text
  if (currentPos < input.length) {
    segments.push({
      text: input.slice(currentPos),
      start: currentPos,
      end: input.length,
    });
  }

  const result: HighlightResult = {
    segments,
    hasHighlights: matches.length > 0,
  };

  // Cache the result for future lookups
  cacheResult(input, result);

  return result;
}

// =============================================================================
// Styling Functions
// =============================================================================

/**
 * Apply chalk styling to a highlight type.
 *
 * @param text - The text to style
 * @param type - The highlight type
 * @returns Styled string with ANSI codes
 */
export function applyHighlightStyle(text: string, type?: HighlightType): string {
  if (!type) {
    return text;
  }

  switch (type) {
    case "mention":
      return chalk.cyan(text);
    case "command":
      return chalk.green(text);
    case "url":
      return chalk.blue.underline(text);
    case "code":
      return chalk.dim(text);
    default:
      return text;
  }
}

/**
 * Get the style description for a highlight type (for accessibility/testing).
 *
 * @param type - The highlight type
 * @returns Human-readable style description
 */
export function getHighlightStyleDescription(type?: HighlightType): string {
  if (!type) {
    return "plain";
  }

  switch (type) {
    case "mention":
      return "cyan";
    case "command":
      return "green";
    case "url":
      return "blue underline";
    case "code":
      return "dim";
    default:
      return "plain";
  }
}

/**
 * Apply highlights to input and return styled string.
 * This is a convenience function for simple use cases.
 *
 * @param input - The input text to highlight
 * @returns Styled string with ANSI codes
 *
 * @example
 * ```ts
 * const styled = highlightInput("Check @file.ts with /help");
 * console.log(styled); // Cyan @file.ts, green /help
 * ```
 */
export function highlightInput(input: string): string {
  const { segments } = parseHighlights(input);
  return segments.map((seg) => applyHighlightStyle(seg.text, seg.type)).join("");
}

// =============================================================================
// Cursor-Aware Functions
// =============================================================================

/**
 * Find which segment contains a given cursor position.
 *
 * @param segments - Array of highlight segments
 * @param cursorPosition - The cursor position to locate
 * @returns The segment containing the cursor, or undefined if not found
 */
export function findSegmentAtCursor(
  segments: readonly HighlightSegment[],
  cursorPosition: number
): HighlightSegment | undefined {
  return segments.find((seg) => cursorPosition >= seg.start && cursorPosition < seg.end);
}

/**
 * Split a segment at a cursor position for rendering with cursor indicator.
 *
 * @param segment - The segment to split
 * @param cursorPosition - The cursor position within the segment
 * @returns Object with before, cursor char, and after portions
 */
export function splitSegmentAtCursor(
  segment: HighlightSegment,
  cursorPosition: number
): {
  before: string;
  cursorChar: string;
  after: string;
  localPosition: number;
} {
  const localPosition = cursorPosition - segment.start;
  const before = segment.text.slice(0, localPosition);
  const cursorChar = segment.text[localPosition] || " ";
  const after = segment.text.slice(localPosition + 1);

  return { before, cursorChar, after, localPosition };
}
