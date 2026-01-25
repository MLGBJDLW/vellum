/**
 * useInputHighlight Hook (T009-HL)
 *
 * React hook that memoizes input text highlighting transformations.
 * Provides efficient highlight parsing with caching.
 *
 * @module tui/hooks/useInputHighlight
 */

import { useMemo, useRef } from "react";
import {
  findSegmentAtCursor,
  type HighlightResult,
  type HighlightSegment,
  parseHighlights,
} from "../components/Input/highlight.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the useInputHighlight hook.
 */
export interface UseInputHighlightOptions {
  /** The input text to highlight */
  readonly text: string;
  /** Whether highlighting is enabled */
  readonly enabled?: boolean;
  /** Current cursor position (optional) */
  readonly cursorPosition?: number;
}

/**
 * Return value from useInputHighlight hook.
 */
export interface UseInputHighlightReturn {
  /** Parsed highlight result */
  readonly result: HighlightResult;
  /** Whether any highlights were found */
  readonly hasHighlights: boolean;
  /** The segment containing the cursor (if any) */
  readonly cursorSegment: HighlightSegment | undefined;
  /** Whether highlighting is active */
  readonly isHighlighting: boolean;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for memoized input text highlighting.
 *
 * Caches the highlight parsing result and only recomputes when text changes.
 * Also provides cursor-aware segment information.
 *
 * @param options - Hook configuration
 * @returns Highlight result and metadata
 *
 * @example
 * ```tsx
 * function MyInput({ value, cursorPosition }) {
 *   const { result, hasHighlights, cursorSegment } = useInputHighlight({
 *     text: value,
 *     enabled: true,
 *     cursorPosition,
 *   });
 *
 *   return (
 *     <HighlightedText
 *       text={value}
 *       highlightResult={result}
 *       cursorPosition={cursorPosition}
 *       showCursor
 *     />
 *   );
 * }
 * ```
 */
export function useInputHighlight({
  text,
  enabled = true,
  cursorPosition,
}: UseInputHighlightOptions): UseInputHighlightReturn {
  // Cache for avoiding reparse on cursor-only changes
  const cacheRef = useRef<{ text: string; result: HighlightResult } | null>(null);

  // Parse highlights (memoized by text)
  const result = useMemo(() => {
    // Return empty result if disabled
    if (!enabled) {
      return { segments: [], hasHighlights: false };
    }

    // Check cache first
    if (cacheRef.current?.text === text) {
      return cacheRef.current.result;
    }

    // Parse and cache
    const parsed = parseHighlights(text);
    cacheRef.current = { text, result: parsed };
    return parsed;
  }, [text, enabled]);

  // Find cursor segment (memoized by cursor position and segments)
  const cursorSegment = useMemo(() => {
    if (cursorPosition === undefined || !result.hasHighlights) {
      return undefined;
    }
    return findSegmentAtCursor(result.segments, cursorPosition);
  }, [result.segments, cursorPosition, result.hasHighlights]);

  return useMemo(
    () => ({
      result,
      hasHighlights: result.hasHighlights,
      cursorSegment,
      isHighlighting: enabled && result.hasHighlights,
    }),
    [result, cursorSegment, enabled]
  );
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Hook for multiline input highlighting.
 * Parses each line separately for better performance with large inputs.
 *
 * @param lines - Array of line strings
 * @param enabled - Whether highlighting is enabled
 * @returns Array of highlight results, one per line
 */
export function useMultilineHighlight(
  lines: readonly string[],
  enabled = true
): readonly HighlightResult[] {
  return useMemo(() => {
    if (!enabled) {
      return lines.map(() => ({ segments: [], hasHighlights: false }));
    }
    return lines.map((line) => parseHighlights(line));
  }, [lines, enabled]);
}
