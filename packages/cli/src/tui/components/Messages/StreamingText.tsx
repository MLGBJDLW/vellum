/**
 * StreamingText Component (T019)
 *
 * Displays text content with an animated blinking cursor while streaming.
 * Supports optional typewriter effect for smoother character-by-character display.
 * The cursor is removed when streaming completes, and an optional callback
 * is invoked.
 *
 * @module tui/components/Messages/StreamingText
 */

import { Text } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import stringWidth from "string-width";
import { useAnimation } from "../../context/AnimationContext.js";
import { sanitize } from "../../utils/textSanitizer.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the StreamingText component.
 */
export interface StreamingTextProps {
  /** The text content to display */
  readonly content: string;
  /** Whether the text is currently streaming */
  readonly isStreaming: boolean;
  /** Character to use for the cursor (default: '▊') */
  readonly cursorChar?: string;
  /** Whether the cursor should blink (default: true) */
  readonly cursorBlink?: boolean;
  /** Callback invoked when streaming completes */
  readonly onComplete?: () => void;
  /** Enable typewriter effect for smoother display (default: true) */
  readonly typewriterEffect?: boolean;
  /** Delay between characters in ms when typewriter is enabled (default: 8) */
  readonly typewriterSpeed?: number;
  /**
   * Optional formatting function to apply inline styles to text.
   * Receives the sanitized text and returns styled React nodes.
   * Called on each render with the current display text.
   */
  readonly formatFn?: (text: string) => React.ReactNode;
}

// =============================================================================
// Constants
// =============================================================================

/** Default cursor character */
const DEFAULT_CURSOR_CHAR = "▊";

/** Default typewriter speed (characters per interval) */
const DEFAULT_TYPEWRITER_SPEED_MS = 8;

/** Characters to release per tick for faster catch-up */
const CHARS_PER_TICK = 3;

// =============================================================================
// Main Component
// =============================================================================

/** Only the live cursor subscribes to animation ticks. Keep its terminal cells
 * occupied while hidden so Ink wraps and measures both frames identically. */
export function StreamingCursor({ glyph, blink }: { glyph: string; blink: boolean }) {
  const { frame, isPaused } = useAnimation();
  const visible = !blink || isPaused || Math.floor(frame / 4) % 2 === 0;
  return <Text>{visible ? glyph : "\u2800".repeat(stringWidth(glyph))}</Text>;
}

/**
 * StreamingText displays text with an animated cursor while streaming.
 *
 * Features:
 * - Displays text content
 * - Shows blinking cursor at end while streaming
 * - Removes cursor when streaming completes
 * - Supports cursor customization (character and blink behavior)
 * - Optional typewriter effect for smoother display
 * - Calls onComplete callback when isStreaming changes to false
 *
 * @example
 * ```tsx
 * // Basic usage
 * <StreamingText
 *   content={text}
 *   isStreaming={isTyping}
 * />
 *
 * // With completion callback
 * <StreamingText
 *   content={text}
 *   isStreaming={isTyping}
 *   onComplete={() => enableInput()}
 * />
 *
 * // Custom cursor
 * <StreamingText
 *   content={text}
 *   isStreaming={isTyping}
 *   cursorChar="_"
 *   cursorBlink={false}
 * />
 *
 * // With typewriter effect
 * <StreamingText
 *   content={text}
 *   isStreaming={isTyping}
 *   typewriterEffect={true}
 *   typewriterSpeed={10}
 * />
 * ```
 */
export function StreamingText({
  content,
  isStreaming,
  cursorChar = DEFAULT_CURSOR_CHAR,
  cursorBlink = true,
  onComplete,
  typewriterEffect = true,
  typewriterSpeed = DEFAULT_TYPEWRITER_SPEED_MS,
  formatFn,
}: StreamingTextProps): React.JSX.Element {
  // Track previous streaming state to detect completion
  const prevIsStreamingRef = useRef<boolean | null>(null);

  // Typewriter effect state - initialize to full length if not streaming on mount
  const [displayedLength, setDisplayedLength] = useState(() => (isStreaming ? 0 : content.length));
  const prevContentLengthRef = useRef(content.length);

  // Handle typewriter effect - gradually reveal characters
  useEffect(() => {
    // Skip typewriter if disabled
    if (!typewriterEffect) {
      setDisplayedLength(content.length);
      return;
    }

    // When streaming stops, immediately show all content
    if (!isStreaming) {
      setDisplayedLength(content.length);
      return;
    }

    // If we're caught up, nothing to do
    if (displayedLength >= content.length) {
      return;
    }

    // Release characters progressively
    const timer = setTimeout(() => {
      setDisplayedLength((prev) => {
        // Release multiple chars per tick for faster catch-up when behind
        const behind = content.length - prev;
        const charsToRelease = behind > 20 ? Math.min(behind, CHARS_PER_TICK * 3) : CHARS_PER_TICK;
        return Math.min(prev + charsToRelease, content.length);
      });
    }, typewriterSpeed);

    return () => clearTimeout(timer);
  }, [content.length, displayedLength, isStreaming, typewriterEffect, typewriterSpeed]);

  // Reset displayed length when content is cleared (new message)
  useEffect(() => {
    if (content.length < prevContentLengthRef.current) {
      // Content was reset (new message started)
      setDisplayedLength(0);
    }
    prevContentLengthRef.current = content.length;
  }, [content.length]);

  // Handle streaming completion callback
  useEffect(() => {
    // Only trigger callback if we were previously streaming and now we're not
    // Skip on initial mount (prevIsStreamingRef.current is null)
    if (prevIsStreamingRef.current === true && !isStreaming) {
      onComplete?.();
    }

    // Update ref after callback logic
    prevIsStreamingRef.current = isStreaming;
  }, [isStreaming, onComplete]);

  // Sanitize content (normalize line endings, strip dangerous ANSI)
  const sanitizedContent = useMemo(() => sanitize(content), [content]);

  // Determine what text to display
  const displayText = typewriterEffect
    ? sanitizedContent.slice(0, displayedLength)
    : sanitizedContent;

  // Determine cursor to display (show cursor while typewriter is still catching up)
  const showCursor = isStreaming || (typewriterEffect && displayedLength < sanitizedContent.length);

  // Apply formatting function if provided, otherwise render plain text
  const formattedContent = useMemo(
    () => (formatFn ? formatFn(displayText) : displayText),
    [formatFn, displayText]
  );

  return (
    <Text wrap="wrap">
      {formattedContent}
      {showCursor && <StreamingCursor glyph={cursorChar} blink={cursorBlink} />}
    </Text>
  );
}
