/**
 * ShimmerText Component (T061)
 *
 * A skeleton loading component with animated shimmer effect.
 * Uses ANSI gradient colors for smooth terminal animations.
 *
 * @module tui/components/common/ShimmerText
 */

import { Text } from "ink";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ShimmerText component.
 */
export interface ShimmerTextProps {
  /** Width of the shimmer bar in characters (default: 20) */
  readonly width?: number;
  /** Animation speed - time per frame in ms (default: 100) */
  readonly speed?: number;
  /** Base color for the shimmer (default: from theme) */
  readonly color?: string;
  /** Highlight color for the shimmer wave (default: from theme) */
  readonly highlightColor?: string;
  /** Character to use for the shimmer bar (default: '█') */
  readonly char?: string;
  /** Whether animation is active (default: true) */
  readonly animate?: boolean;
  /** Optional prefix text before the shimmer */
  readonly prefix?: string;
  /** Optional suffix text after the shimmer */
  readonly suffix?: string;
}

/**
 * Shimmer animation style presets.
 */
export type ShimmerStyle = "default" | "pulse" | "wave" | "dots";

/**
 * Props for ShimmerBlock component.
 */
export interface ShimmerBlockProps {
  /** Number of lines to show */
  readonly lines?: number;
  /** Width of each line (can vary for natural look) */
  readonly width?: number | "random";
  /** Style preset */
  readonly style?: ShimmerStyle;
  /** Animation speed */
  readonly speed?: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Default shimmer width */
const DEFAULT_WIDTH = 20;

/** Default animation speed (ms per frame) */
const DEFAULT_SPEED = 100;

/** Default shimmer character */
const DEFAULT_CHAR = "█";

/** Shimmer gradient characters (light to dark) */
const GRADIENT_CHARS = ["░", "▒", "▓", "█", "▓", "▒", "░"];

/** Dot animation frames */
const DOT_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a shimmer gradient string at the current animation position.
 */
function generateShimmerGradient(
  width: number,
  position: number,
  char: string,
  highlightWidth: number = 5
): string {
  const result: string[] = [];

  for (let i = 0; i < width; i++) {
    const distance = Math.abs(i - position);

    if (distance < highlightWidth) {
      // Use gradient character based on distance from highlight center
      const gradientIndex = Math.min(distance, GRADIENT_CHARS.length - 1);
      result.push(GRADIENT_CHARS[gradientIndex] ?? char);
    } else {
      result.push(char);
    }
  }

  return result.join("");
}

/**
 * Generate a pulse effect (all chars fade in/out together).
 */
function generatePulseEffect(width: number, frame: number, char: string): string {
  const pulseIndex = frame % GRADIENT_CHARS.length;
  const pulseChar = GRADIENT_CHARS[pulseIndex] ?? char;
  return pulseChar.repeat(width);
}

/**
 * Generate a wave effect (ripple from left to right).
 */
function generateWaveEffect(width: number, frame: number): string {
  const result: string[] = [];
  const waveLength = 8;

  for (let i = 0; i < width; i++) {
    const phase = ((i + frame) % waveLength) / waveLength;
    const charIndex = Math.floor(phase * GRADIENT_CHARS.length);
    result.push(GRADIENT_CHARS[charIndex] ?? "█");
  }

  return result.join("");
}

/**
 * Generate random line widths for natural-looking skeleton.
 */
function getRandomWidth(baseWidth: number, index: number): number {
  // Use deterministic "random" based on index for consistency
  const variance = Math.sin(index * 0.7) * 0.3 + 0.7; // 0.4 to 1.0
  return Math.floor(baseWidth * variance);
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * ShimmerText displays an animated loading placeholder.
 *
 * Creates a smooth shimmer animation effect commonly used for
 * skeleton loading states. The animation moves a highlight
 * across the text from left to right.
 *
 * @example
 * ```tsx
 * // Basic shimmer
 * <ShimmerText width={30} />
 *
 * // With custom styling
 * <ShimmerText
 *   width={40}
 *   speed={80}
 *   color="gray"
 *   highlightColor="white"
 * />
 *
 * // As a loading indicator with text
 * <ShimmerText
 *   width={20}
 *   prefix="Loading: "
 *   suffix=" ..."
 * />
 * ```
 */
export function ShimmerText({
  width = DEFAULT_WIDTH,
  speed = DEFAULT_SPEED,
  color,
  highlightColor,
  char = DEFAULT_CHAR,
  animate = true,
  prefix = "",
  suffix = "",
}: ShimmerTextProps): React.JSX.Element {
  const { theme } = useTheme();
  const [position, setPosition] = useState(0);

  // Animation loop
  useEffect(() => {
    if (!animate) return;

    const timer = setInterval(() => {
      setPosition((prev) => (prev + 1) % (width + 10)); // Extra for smooth wrap
    }, speed);

    return () => clearInterval(timer);
  }, [animate, speed, width]);

  // Generate shimmer text
  const shimmerText = useMemo(() => {
    if (!animate) {
      return char.repeat(width);
    }
    return generateShimmerGradient(width, position, char);
  }, [width, position, char, animate]);

  // Determine colors - highlightColor reserved for future gradient support
  const baseColor = color ?? theme.colors.muted;
  void highlightColor; // Reserved for future use

  return (
    <Text>
      {prefix && <Text>{prefix}</Text>}
      <Text color={baseColor}>{shimmerText}</Text>
      {suffix && <Text>{suffix}</Text>}
    </Text>
  );
}

// =============================================================================
// Variant Components
// =============================================================================

/**
 * ShimmerBlock displays multiple shimmer lines for content placeholders.
 *
 * @example
 * ```tsx
 * // Show 3 lines of skeleton content
 * <ShimmerBlock lines={3} width={50} />
 *
 * // Random widths for natural look
 * <ShimmerBlock lines={4} width="random" />
 * ```
 */
export function ShimmerBlock({
  lines = 3,
  width = 40,
  style = "default",
  speed = DEFAULT_SPEED,
}: ShimmerBlockProps): React.JSX.Element {
  const { theme } = useTheme();
  const [frame, setFrame] = useState(0);

  // Animation loop
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => prev + 1);
    }, speed);

    return () => clearInterval(timer);
  }, [speed]);

  // Generate lines
  const lineElements = useMemo(() => {
    const result: React.JSX.Element[] = [];

    for (let i = 0; i < lines; i++) {
      const lineWidth = width === "random" ? getRandomWidth(50, i) : width;

      let lineContent: string;
      switch (style) {
        case "pulse":
          lineContent = generatePulseEffect(lineWidth, frame, "█");
          break;
        case "wave":
          lineContent = generateWaveEffect(lineWidth, frame);
          break;
        case "dots":
          lineContent = DOT_FRAMES[frame % DOT_FRAMES.length]!.repeat(Math.ceil(lineWidth / 2));
          break;
        default:
          lineContent = generateShimmerGradient(lineWidth, (frame + i * 3) % (lineWidth + 10), "█");
      }

      result.push(
        <Text key={i} color={theme.colors.muted}>
          {lineContent}
        </Text>
      );
    }

    return result;
  }, [lines, width, style, frame, theme.colors.muted]);

  return <>{lineElements}</>;
}

/**
 * ShimmerDots displays animated loading dots.
 *
 * @example
 * ```tsx
 * <ShimmerDots />
 * // Output: ⠋ → ⠙ → ⠹ → ...
 * ```
 */
export function ShimmerDots({ speed = 80 }: { speed?: number }): React.JSX.Element {
  const { theme } = useTheme();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % DOT_FRAMES.length);
    }, speed);

    return () => clearInterval(timer);
  }, [speed]);

  return <Text color={theme.colors.primary}>{DOT_FRAMES[frame]}</Text>;
}

/**
 * InlineShimmer for inline loading states within text.
 *
 * @example
 * ```tsx
 * <Text>Loading <InlineShimmer width={10} /> content...</Text>
 * ```
 */
export function InlineShimmer({
  width = 8,
  speed = 100,
}: {
  width?: number;
  speed?: number;
}): React.JSX.Element {
  const { theme } = useTheme();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % (width * 2));
    }, speed);

    return () => clearInterval(timer);
  }, [speed, width]);

  const content = useMemo(() => {
    return generateShimmerGradient(width, frame % (width + 5), "▓", 3);
  }, [width, frame]);

  return <Text color={theme.colors.muted}>{content}</Text>;
}
