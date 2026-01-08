/**
 * TypeWriter Component (Chain 14)
 *
 * Character-by-character text animation effect.
 * Useful for dramatic text reveals and welcome messages.
 *
 * @module tui/components/common/TypeWriter
 */

import { Text } from "ink";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the TypeWriter component.
 */
export interface TypeWriterProps {
  /** Text to animate */
  readonly text: string;
  /** Characters per second (default: 50) */
  readonly speed?: number;
  /** Callback when animation completes */
  readonly onComplete?: () => void;
  /** Text color */
  readonly color?: string;
  /** Whether text is bold */
  readonly bold?: boolean;
  /** Whether text is dimmed */
  readonly dimmed?: boolean;
  /** Whether to show cursor during animation */
  readonly showCursor?: boolean;
  /** Cursor character (default: "▌") */
  readonly cursor?: string;
  /** Delay before starting animation in ms (default: 0) */
  readonly delay?: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Default typing speed (characters per second) */
const DEFAULT_SPEED = 50;

/** Default cursor character */
const DEFAULT_CURSOR = "▌";

// =============================================================================
// TypeWriter Component
// =============================================================================

/**
 * TypeWriter - Animated text reveal effect.
 *
 * Features:
 * - Configurable typing speed
 * - Optional blinking cursor
 * - Completion callback
 * - Delay before starting
 * - Full text styling support
 *
 * @example
 * ```tsx
 * // Basic usage
 * <TypeWriter text="Hello, World!" />
 *
 * // Fast typing with callback
 * <TypeWriter
 *   text="Welcome to Vellum!"
 *   speed={100}
 *   onComplete={() => console.log('Done!')}
 * />
 *
 * // Styled with cursor
 * <TypeWriter
 *   text="Loading configuration..."
 *   color="cyan"
 *   showCursor
 *   speed={30}
 * />
 *
 * // With delay
 * <TypeWriter
 *   text="Ready!"
 *   delay={1000}
 * />
 * ```
 */
export function TypeWriter({
  text,
  speed = DEFAULT_SPEED,
  onComplete,
  color,
  bold,
  dimmed,
  showCursor = false,
  cursor = DEFAULT_CURSOR,
  delay = 0,
}: TypeWriterProps): React.JSX.Element {
  const [displayedChars, setDisplayedChars] = useState(0);
  const [isStarted, setIsStarted] = useState(delay === 0);
  const [showCursorBlink, setShowCursorBlink] = useState(true);

  // Calculate interval from speed (chars per second)
  const intervalMs = Math.max(1, Math.floor(1000 / speed));

  // Handle delay before starting
  useEffect(() => {
    if (delay > 0) {
      const delayTimer = setTimeout(() => {
        setIsStarted(true);
      }, delay);
      return () => clearTimeout(delayTimer);
    }
  }, [delay]);

  // Animate character by character
  useEffect(() => {
    if (!isStarted) return;

    if (displayedChars >= text.length) {
      onComplete?.();
      return;
    }

    const timer = setTimeout(() => {
      setDisplayedChars((prev) => prev + 1);
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [displayedChars, text.length, intervalMs, isStarted, onComplete]);

  // Cursor blink effect
  useEffect(() => {
    if (!showCursor || displayedChars >= text.length) return;

    const blinkTimer = setInterval(() => {
      setShowCursorBlink((prev) => !prev);
    }, 500);

    return () => clearInterval(blinkTimer);
  }, [showCursor, displayedChars, text.length]);

  // Reset when text changes
  const resetAnimation = useCallback(() => {
    setDisplayedChars(0);
    setIsStarted(delay === 0);
  }, [delay]);

  // Use a ref to track text changes to avoid unnecessary effect dependencies
  const prevTextRef = useRef(text);
  useEffect(() => {
    if (prevTextRef.current !== text) {
      prevTextRef.current = text;
      resetAnimation();
    }
  }, [text, resetAnimation]);

  const displayedText = text.slice(0, displayedChars);
  const isAnimating = displayedChars < text.length;
  const cursorChar = showCursor && isAnimating && showCursorBlink ? cursor : "";

  return (
    <Text color={color} bold={bold} dimColor={dimmed}>
      {displayedText}
      {cursorChar}
    </Text>
  );
}

// =============================================================================
// Exports
// =============================================================================

export default TypeWriter;
