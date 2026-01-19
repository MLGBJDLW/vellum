/**
 * HighlightedText Component (T009-HL)
 *
 * React component that renders text with syntax highlighting for
 * special patterns (@mentions, /commands, URLs, `code`).
 *
 * @module tui/components/Input/HighlightedText
 */

import { Text } from "ink";
import { memo, useMemo } from "react";
import {
  type HighlightResult,
  type HighlightSegment,
  type HighlightType,
  parseHighlights,
  splitSegmentAtCursor,
} from "./highlight.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the HighlightedText component.
 */
export interface HighlightedTextProps {
  /** The text to highlight */
  readonly text: string;
  /** Pre-parsed highlight result (optional, for performance) */
  readonly highlightResult?: HighlightResult;
  /** Current cursor position (optional, for cursor rendering) */
  readonly cursorPosition?: number;
  /** Whether cursor should be shown */
  readonly showCursor?: boolean;
  /** Line start position for multiline support */
  readonly lineStartPosition?: number;
}

// =============================================================================
// Style Mapping
// =============================================================================

/**
 * Map highlight types to Ink Text props.
 */
function getTextProps(type?: HighlightType): Record<string, boolean | string> {
  if (!type) {
    return {};
  }

  switch (type) {
    case "mention":
      return { color: "cyan" };
    case "command":
      return { color: "green" };
    case "url":
      return { color: "blue", underline: true };
    case "code":
      return { dimColor: true };
    default:
      return {};
  }
}

// =============================================================================
// Segment Renderers
// =============================================================================

/**
 * Render a single segment without cursor.
 */
function SegmentText({ segment }: { segment: HighlightSegment }) {
  const props = getTextProps(segment.type);
  return <Text {...props}>{segment.text}</Text>;
}

/**
 * Render a segment with cursor at specified position.
 */
function SegmentWithCursor({
  segment,
  cursorPosition,
}: {
  segment: HighlightSegment;
  cursorPosition: number;
}) {
  const { before, cursorChar, after } = splitSegmentAtCursor(segment, cursorPosition);
  const props = getTextProps(segment.type);

  return (
    <Text {...props}>
      {before || null}
      <Text inverse>{cursorChar}</Text>
      {after || null}
    </Text>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * HighlightedText renders text with syntax highlighting for special patterns.
 *
 * Supports:
 * - @mentions (cyan)
 * - /commands (green)
 * - URLs (blue underline)
 * - `code` (dim)
 *
 * @example
 * ```tsx
 * // Basic usage
 * <HighlightedText text="Check @file.ts with /help" />
 *
 * // With cursor
 * <HighlightedText
 *   text="Type /mode to change"
 *   cursorPosition={5}
 *   showCursor
 * />
 *
 * // With pre-parsed result for performance
 * const result = parseHighlights(text);
 * <HighlightedText text={text} highlightResult={result} />
 * ```
 */
function HighlightedTextComponent({
  text,
  highlightResult,
  cursorPosition,
  showCursor = false,
  lineStartPosition = 0,
}: HighlightedTextProps) {
  // Parse highlights if not provided
  const result = useMemo(() => {
    return highlightResult ?? parseHighlights(text);
  }, [text, highlightResult]);

  // Adjust cursor position for line offset
  const adjustedCursor =
    cursorPosition !== undefined ? cursorPosition - lineStartPosition : undefined;

  // Check if cursor is within this text's range
  const cursorInRange =
    showCursor &&
    adjustedCursor !== undefined &&
    adjustedCursor >= 0 &&
    adjustedCursor <= text.length;

  // If no highlights and no cursor, render plain text
  if (!result.hasHighlights && !cursorInRange) {
    return <Text>{text || " "}</Text>;
  }

  // If no highlights but has cursor, render with cursor
  if (!result.hasHighlights && cursorInRange && adjustedCursor !== undefined) {
    const before = text.slice(0, adjustedCursor);
    const cursorChar = text[adjustedCursor] || " ";
    const after = text.slice(adjustedCursor + 1);

    return (
      <Text>
        {before || null}
        <Text inverse>{cursorChar}</Text>
        {after || null}
      </Text>
    );
  }

  // Render segments with potential cursor
  return (
    <Text>
      {result.segments.map((segment, index) => {
        // Check if cursor is in this segment
        const cursorInSegment =
          cursorInRange &&
          adjustedCursor !== undefined &&
          adjustedCursor >= segment.start - lineStartPosition &&
          adjustedCursor < segment.end - lineStartPosition;

        // Handle cursor at very end (after last segment)
        const cursorAtEnd =
          cursorInRange &&
          adjustedCursor !== undefined &&
          adjustedCursor === text.length &&
          index === result.segments.length - 1;

        if (cursorInSegment && adjustedCursor !== undefined) {
          return (
            <SegmentWithCursor
              key={`seg-${segment.start}`}
              segment={{
                ...segment,
                // Adjust segment positions for line offset
                start: segment.start - lineStartPosition,
                end: segment.end - lineStartPosition,
              }}
              cursorPosition={adjustedCursor}
            />
          );
        }

        // Render segment plus cursor at end if needed
        if (cursorAtEnd) {
          const props = getTextProps(segment.type);
          return (
            <Text key={`seg-${segment.start}`}>
              <Text {...props}>{segment.text}</Text>
              <Text inverse> </Text>
            </Text>
          );
        }

        return <SegmentText key={`seg-${segment.start}`} segment={segment} />;
      })}
    </Text>
  );
}

/**
 * Memoized HighlightedText to prevent unnecessary re-renders.
 */
export const HighlightedText = memo(HighlightedTextComponent, (prev, next) => {
  return (
    prev.text === next.text &&
    prev.cursorPosition === next.cursorPosition &&
    prev.showCursor === next.showCursor &&
    prev.lineStartPosition === next.lineStartPosition &&
    prev.highlightResult === next.highlightResult
  );
});

export default HighlightedText;
