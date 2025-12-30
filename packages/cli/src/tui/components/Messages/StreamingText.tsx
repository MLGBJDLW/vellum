/**
 * StreamingText Component (T019)
 *
 * Displays text content with an animated blinking cursor while streaming.
 * The cursor is removed when streaming completes, and an optional callback
 * is invoked.
 *
 * @module tui/components/Messages/StreamingText
 */

import { Text } from "ink";
import { useEffect, useRef, useState } from "react";

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
}

// =============================================================================
// Constants
// =============================================================================

/** Default cursor character */
const DEFAULT_CURSOR_CHAR = "▊";

/** Cursor blink interval in milliseconds */
const CURSOR_BLINK_INTERVAL_MS = 500;

// =============================================================================
// Main Component
// =============================================================================

/**
 * StreamingText displays text with an animated cursor while streaming.
 *
 * Features:
 * - Displays text content
 * - Shows blinking cursor at end while streaming
 * - Removes cursor when streaming completes
 * - Supports cursor customization (character and blink behavior)
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
 * ```
 */
export function StreamingText({
  content,
  isStreaming,
  cursorChar = DEFAULT_CURSOR_CHAR,
  cursorBlink = true,
  onComplete,
}: StreamingTextProps): React.JSX.Element {
  // Track cursor visibility for blinking effect
  const [cursorVisible, setCursorVisible] = useState(true);

  // Track previous streaming state to detect completion
  const prevIsStreamingRef = useRef<boolean | null>(null);

  // Handle cursor blinking animation
  useEffect(() => {
    // Only blink if streaming and blink is enabled
    if (!isStreaming || !cursorBlink) {
      setCursorVisible(true);
      return;
    }

    const intervalId = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, CURSOR_BLINK_INTERVAL_MS);

    // Cleanup interval on unmount or when streaming stops
    return () => {
      clearInterval(intervalId);
    };
  }, [isStreaming, cursorBlink]);

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

  // Determine cursor to display
  const cursor = isStreaming && cursorVisible ? cursorChar : "";

  return (
    <Text wrap="wrap">
      {content}
      {cursor}
    </Text>
  );
}
