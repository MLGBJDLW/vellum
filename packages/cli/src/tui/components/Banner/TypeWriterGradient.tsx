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
 * Typing mode for the typewriter effect.
 * - 'line': Reveal one line at a time (faster for multi-line ASCII art)
 * - 'char': Reveal one character at a time (classic typewriter feel)
 */
export type TypeWriterMode = "line" | "char";

/**
 * Props for the TypeWriterGradient component.
 */
export interface TypeWriterGradientProps {
  /** Text content to display with typewriter effect */
  readonly text: string;
  /** Speed: chars/sec for 'char' mode, lines/sec for 'line' mode (default: 3000 chars/sec or 50 lines/sec) */
  readonly speed?: number;
  /** Gradient colors array (start to end) */
  readonly colors: readonly string[];
  /** Callback when typing completes */
  readonly onComplete?: () => void;
  /** Whether to show blinking cursor (default: true) */
  readonly showCursor?: boolean;
  /** Initial delay before typing starts in ms (default: 100) */
  readonly initialDelay?: number;
  /** Typing mode: 'line' for fast multi-line reveal, 'char' for classic typewriter (default: 'line') */
  readonly mode?: TypeWriterMode;
}

// =============================================================================
// Constants
// =============================================================================

/** Default typing speed for char mode (chars per second) - very fast for ASCII art */
const DEFAULT_CHAR_SPEED = 3000;

/** Default typing speed for line mode (lines per second) */
const DEFAULT_LINE_SPEED = 50;

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
  speed,
  colors,
  onComplete,
  showCursor = true,
  initialDelay = 100,
  mode = "line",
}: TypeWriterGradientProps): React.JSX.Element {
  // Split text into lines upfront for line mode
  const allLines = useMemo(() => text.split("\n"), [text]);
  const totalLines = allLines.length;
  const totalChars = text.length;

  // Resolve speed based on mode
  const effectiveSpeed = speed ?? (mode === "line" ? DEFAULT_LINE_SPEED : DEFAULT_CHAR_SPEED);

  // State for visible content (lines for line mode, chars for char mode)
  const [visibleCount, setVisibleCount] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  // Refs for cleanup
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cursorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeCalledRef = useRef(false);

  // Pre-compute gradient steps for performance
  const gradientSteps = useMemo(() => buildGradientSteps(colors, 8), [colors]);

  // Total items to reveal (lines or chars depending on mode)
  const totalItems = mode === "line" ? totalLines : totalChars;

  // Typing effect with chunk-based rendering
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
      // Calculate items per frame for chunk-based typing
      // For line mode: speed=50 lines/sec at 60fps = ~0.8 lines/frame (at least 1)
      // For char mode: speed=3000 chars/sec at 60fps = ~48 chars/frame
      const itemsPerFrame = Math.max(1, Math.ceil(effectiveSpeed / (1000 / FRAME_INTERVAL_MS)));

      typingIntervalRef.current = setInterval(() => {
        setVisibleCount((prev) => {
          const next = prev + itemsPerFrame;

          // Check completion
          if (next >= totalItems) {
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
            return totalItems;
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
  }, [effectiveSpeed, totalItems, initialDelay, onComplete]);

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

  // Build visible lines based on mode
  const visibleLines = useMemo(() => {
    if (mode === "line") {
      // Line mode: show complete lines up to visibleCount
      return allLines.slice(0, visibleCount);
    }
    // Char mode: slice text and split into lines
    const visibleText = text.slice(0, visibleCount);
    return visibleText.split("\n");
  }, [mode, allLines, text, visibleCount]);

  // Calculate visible char count for gradient positioning
  const visibleCharCount = useMemo(() => {
    if (mode === "line") {
      // Sum chars in visible lines + newlines
      return visibleLines.reduce((acc, line, idx) => acc + line.length + (idx > 0 ? 1 : 0), 0);
    }
    return visibleCount;
  }, [mode, visibleLines, visibleCount]);

  // Get cursor color (color at current position)
  const cursorColor = useMemo(() => {
    if (visibleCharCount === 0) return gradientSteps[0] ?? "#FFD700";
    return getCharColor(visibleCharCount - 1, totalChars, gradientSteps);
  }, [visibleCharCount, totalChars, gradientSteps]);

  return (
    <Box flexDirection="column">
      {visibleLines.map((line, lineIndex) => {
        // Calculate character offset for this line (for gradient coloring)
        const lineStartIndex = visibleLines
          .slice(0, lineIndex)
          .reduce((acc, l) => acc + l.length + 1, 0);
        const isLastLine = lineIndex === visibleLines.length - 1;
        const lineKey = `line-${lineIndex}`;

        return (
          <Box key={lineKey} flexDirection="row">
            {line.split("").map((char, charIndex) => {
              const globalIndex = lineStartIndex + charIndex;
              const color = getCharColor(globalIndex, totalChars, gradientSteps);
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
