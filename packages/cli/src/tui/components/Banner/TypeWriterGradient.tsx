/**
 * TypeWriterGradient Component
 *
 * Renders text with a typewriter effect where characters appear one by one,
 * each colored according to its position in a gradient.
 * Shows a blinking cursor at the end during typing.
 *
 * @module tui/components/Banner/TypeWriterGradient
 */

import { Box, Text } from "ink";
import type React from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { interpolateColor } from "./ShimmerText.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the TypeWriterGradient component.
 */
export interface TypeWriterGradientProps {
  /** Text content to display with typewriter effect */
  readonly text: string;
  /** Characters per second (default: 200) */
  readonly speed?: number;
  /** Gradient colors array (start to end) */
  readonly colors: readonly string[];
  /** Callback when typing completes */
  readonly onComplete?: () => void;
  /** Whether to show blinking cursor (default: true) */
  readonly showCursor?: boolean;
  /** Initial delay before typing starts in ms (default: 100) */
  readonly initialDelay?: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Default typing speed (chars per second) */
const DEFAULT_SPEED = 1500;

/** Cursor blink interval in ms */
const CURSOR_BLINK_INTERVAL = 500;

/** Frame interval for chunk-based typing (targeting ~60fps) */
const FRAME_INTERVAL_MS = 16;

/** Cursor character */
const CURSOR_CHAR = "█";

// =============================================================================
// Color Calculation
// =============================================================================

/**
 * Build interpolated gradient steps for smoother color transitions.
 */
function buildGradientSteps(colors: readonly string[], stepsPerSegment: number): string[] {
  if (colors.length === 0) return [];
  if (colors.length === 1) return [colors[0] ?? "#000000"];

  const steps: string[] = [];

  for (let i = 0; i < colors.length - 1; i += 1) {
    const start = colors[i] ?? "#000000";
    const end = colors[i + 1] ?? start;
    for (let step = 0; step < stepsPerSegment; step += 1) {
      const t = step / stepsPerSegment;
      steps.push(interpolateColor(start, end, t));
    }
  }

  steps.push(colors[colors.length - 1] ?? "#000000");
  return steps;
}

/**
 * Get color for a character based on its position in the total text.
 * Uses interpolated gradient for smooth transitions.
 */
function getCharColor(charIndex: number, totalChars: number, gradientSteps: string[]): string {
  if (totalChars <= 1 || gradientSteps.length === 0) {
    return gradientSteps[0] ?? "#FFFFFF";
  }

  // Map character position (0 to totalChars-1) to gradient position (0 to 1)
  const position = charIndex / (totalChars - 1);
  const stepIndex = Math.min(
    Math.floor(position * (gradientSteps.length - 1)),
    gradientSteps.length - 1
  );

  return gradientSteps[stepIndex] ?? gradientSteps[0] ?? "#FFFFFF";
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Single colored character.
 * Memoized to prevent unnecessary re-renders.
 */
interface ColoredCharProps {
  readonly char: string;
  readonly color: string;
}

const ColoredChar = memo(function ColoredChar({
  char,
  color,
}: ColoredCharProps): React.JSX.Element {
  return <Text color={color}>{char}</Text>;
});

/**
 * Blinking cursor component.
 */
interface CursorProps {
  readonly visible: boolean;
  readonly color: string;
}

const Cursor = memo(function Cursor({ visible, color }: CursorProps): React.JSX.Element | null {
  if (!visible) return null;
  return <Text color={color}>{CURSOR_CHAR}</Text>;
});

// =============================================================================
// Main Component
// =============================================================================

/**
 * TypeWriterGradient displays text with a typewriter effect.
 *
 * Characters appear one by one from left to right, with each character
 * colored according to its position in the provided gradient.
 * A blinking cursor appears at the end during typing.
 *
 * @example
 * ```tsx
 * <TypeWriterGradient
 *   text={asciiArt}
 *   speed={200}
 *   colors={['#8B4513', '#DAA520', '#FFD700']}
 *   showCursor
 *   onComplete={() => setTypingDone(true)}
 * />
 * ```
 */
export const TypeWriterGradient = memo(function TypeWriterGradient({
  text,
  speed = DEFAULT_SPEED,
  colors,
  onComplete,
  showCursor = true,
  initialDelay = 100,
}: TypeWriterGradientProps): React.JSX.Element {
  // State for visible character count
  const [visibleChars, setVisibleChars] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  // Refs for cleanup
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cursorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeCalledRef = useRef(false);

  // Calculate total printable characters (excluding ANSI but including all visible chars)
  const totalChars = text.length;

  // Pre-compute gradient steps for performance
  const gradientSteps = useMemo(() => buildGradientSteps(colors, 8), [colors]);

  // Typing effect with chunk-based rendering for high speeds
  useEffect(() => {
    // Clear any existing intervals
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
    }
    if (initialDelayRef.current) {
      clearTimeout(initialDelayRef.current);
    }

    // Start after initial delay
    initialDelayRef.current = setTimeout(() => {
      // Calculate chars per frame for chunk-based typing
      // At 60fps (16ms intervals), speed=1500 means ~24 chars per frame
      const charsPerFrame = Math.max(1, Math.ceil(speed / (1000 / FRAME_INTERVAL_MS)));

      typingIntervalRef.current = setInterval(() => {
        setVisibleChars((prev) => {
          const next = prev + charsPerFrame;

          // Check completion
          if (next >= totalChars) {
            if (typingIntervalRef.current) {
              clearInterval(typingIntervalRef.current);
              typingIntervalRef.current = null;
            }
            setIsComplete(true);
            if (!completeCalledRef.current) {
              completeCalledRef.current = true;
              // Small delay before calling onComplete to let final render happen
              setTimeout(() => onComplete?.(), 50);
            }
            return totalChars;
          }

          return next;
        });
      }, FRAME_INTERVAL_MS);
    }, initialDelay);

    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
      }
      if (initialDelayRef.current) {
        clearTimeout(initialDelayRef.current);
      }
    };
  }, [speed, totalChars, initialDelay, onComplete]);

  // Cursor blink effect (only while typing)
  useEffect(() => {
    if (!showCursor || isComplete) {
      setCursorVisible(false);
      if (cursorIntervalRef.current) {
        clearInterval(cursorIntervalRef.current);
        cursorIntervalRef.current = null;
      }
      return;
    }

    cursorIntervalRef.current = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, CURSOR_BLINK_INTERVAL);

    return () => {
      if (cursorIntervalRef.current) {
        clearInterval(cursorIntervalRef.current);
      }
    };
  }, [showCursor, isComplete]);

  // Build visible text with colors
  const visibleText = text.slice(0, visibleChars);

  // Split into lines for proper rendering
  const lines = visibleText.split("\n");

  // Get cursor color (color at current position)
  const cursorColor = useMemo(() => {
    if (visibleChars === 0) return gradientSteps[0] ?? "#FFD700";
    return getCharColor(visibleChars - 1, totalChars, gradientSteps);
  }, [visibleChars, totalChars, gradientSteps]);

  return (
    <Box flexDirection="column">
      {lines.map((line, lineIndex) => {
        // Calculate character offset for this line
        const lineStartIndex = lines.slice(0, lineIndex).reduce((acc, l) => acc + l.length + 1, 0);
        const isLastLine = lineIndex === lines.length - 1;
        // Use lineIndex as key since lines don't reorder in static ASCII art
        const lineKey = `line-${lineIndex}`;

        return (
          <Box key={lineKey} flexDirection="row">
            {line.split("").map((char, charIndex) => {
              const globalIndex = lineStartIndex + charIndex;
              const color = getCharColor(globalIndex, totalChars, gradientSteps);
              // Use globalIndex as unique key since characters don't reorder
              const charKey = `char-${globalIndex}`;

              return <ColoredChar key={charKey} char={char} color={color} />;
            })}
            {/* Show cursor at end of last line during typing */}
            {isLastLine && showCursor && !isComplete && (
              <Cursor visible={cursorVisible} color={cursorColor} />
            )}
          </Box>
        );
      })}
    </Box>
  );
});

export default TypeWriterGradient;
