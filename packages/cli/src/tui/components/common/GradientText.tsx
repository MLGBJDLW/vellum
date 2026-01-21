/**
 * GradientText Component
 *
 * Terminal-compatible gradient text implementation that applies
 * color gradients by coloring each character segment individually.
 *
 * Uses theme brand colors by default for consistent Vellum styling.
 *
 * @module tui/components/common/GradientText
 */

import { Text } from "ink";
import type React from "react";
import { memo, useMemo } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Gradient direction for text coloring.
 * - horizontal: Left to right gradient across text
 * - vertical: Top to bottom (simulated by alternating chars)
 */
export type GradientDirection = "horizontal" | "vertical";

/**
 * Props for the GradientText component.
 */
export interface GradientTextProps {
  /** The text to display with gradient coloring */
  readonly text: string;
  /** Array of colors to use for the gradient (min 2 colors) */
  readonly colors?: readonly string[];
  /** Direction of the gradient (default: 'horizontal') */
  readonly direction?: GradientDirection;
  /** Whether to apply bold styling */
  readonly bold?: boolean;
  /** Whether to apply dim styling */
  readonly dimColor?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Split text into segments for gradient coloring.
 * Each segment gets assigned a color from the gradient.
 *
 * @param text - The text to split
 * @param colorCount - Number of colors in the gradient
 * @returns Array of text segments
 */
function splitIntoSegments(text: string, colorCount: number): string[] {
  if (!text || colorCount <= 0) {
    return [text];
  }

  // For very short text, just assign one color per character
  if (text.length <= colorCount) {
    return [...text];
  }

  // Calculate segment size (distribute chars evenly across colors)
  const baseSegmentSize = Math.floor(text.length / colorCount);
  const remainder = text.length % colorCount;

  const segments: string[] = [];
  let currentIndex = 0;

  for (let i = 0; i < colorCount; i++) {
    // Add 1 extra char to first 'remainder' segments to distribute evenly
    const segmentSize = baseSegmentSize + (i < remainder ? 1 : 0);
    const segment = text.slice(currentIndex, currentIndex + segmentSize);
    if (segment) {
      segments.push(segment);
    }
    currentIndex += segmentSize;
  }

  return segments;
}

/**
 * Get a subset of colors for vertical gradient simulation.
 * Alternates between first and last colors.
 *
 * @param colors - Full color array
 * @returns Colors for vertical effect
 */
function getVerticalColors(colors: readonly string[]): readonly string[] {
  if (colors.length < 2) {
    return colors;
  }
  // For vertical, alternate between start and end colors
  return [colors[0]!, colors[colors.length - 1]!];
}

// =============================================================================
// Component
// =============================================================================

/**
 * GradientText renders text with a color gradient effect.
 *
 * Terminal gradients work by coloring each character/segment individually.
 * This component splits the text into segments and applies colors from
 * the provided gradient array (or theme brand colors by default).
 *
 * @example
 * ```tsx
 * // Using theme brand colors (default)
 * <GradientText text="VELLUM" />
 *
 * // Custom colors
 * <GradientText
 *   text="Hello World"
 *   colors={['#ff0000', '#00ff00', '#0000ff']}
 * />
 *
 * // Vertical gradient (alternating)
 * <GradientText text="Status" direction="vertical" />
 * ```
 */
function GradientTextImpl({
  text,
  colors,
  direction = "horizontal",
  bold = false,
  dimColor = false,
}: GradientTextProps): React.ReactElement {
  const { theme } = useTheme();

  // Use theme brand colors as default gradient
  const gradientColors = useMemo((): readonly string[] => {
    if (colors && colors.length >= 2) {
      return colors;
    }

    // Default: theme brand gradient (goldenrod → peru → sienna)
    return [
      theme.brand.highlight, // Gold #FFD700
      theme.brand.primary, // Goldenrod #DAA520
      theme.brand.secondary, // Peru #CD853F
      theme.brand.mid, // Sienna #A0522D
    ] as const;
  }, [colors, theme.brand]);

  // Apply direction transformation
  const effectiveColors = useMemo(() => {
    return direction === "vertical" ? getVerticalColors(gradientColors) : gradientColors;
  }, [direction, gradientColors]);

  // Split text into gradient segments
  const segments = useMemo(() => {
    return splitIntoSegments(text, effectiveColors.length);
  }, [text, effectiveColors.length]);

  // Handle empty text
  if (!text) {
    return <Text>{""}</Text>;
  }

  // Render gradient segments
  return (
    <Text>
      {segments.map((segment, index) => {
        const color = effectiveColors[index % effectiveColors.length];
        return (
          <Text key={`${index}-${segment}`} color={color} bold={bold} dimColor={dimColor}>
            {segment}
          </Text>
        );
      })}
    </Text>
  );
}

/**
 * Memoized GradientText component.
 * Re-renders only when props actually change.
 */
export const GradientText = memo(GradientTextImpl);

// =============================================================================
// Preset Gradients
// =============================================================================

/**
 * Preset gradient configurations for common use cases.
 * Import and spread into GradientText props.
 */
export const GRADIENT_PRESETS = {
  /** Warm gold/amber gradient (default brand) */
  brand: undefined, // Uses default theme.brand colors

  /** Success/positive gradient (green tones) */
  success: ["#10b981", "#34d399", "#6ee7b7"] as const,

  /** Warning gradient (amber/orange tones) */
  warning: ["#f59e0b", "#fbbf24", "#fcd34d"] as const,

  /** Error gradient (red tones) */
  error: ["#ef4444", "#f87171", "#fca5a5"] as const,

  /** Info gradient (blue tones) */
  info: ["#3b82f6", "#60a5fa", "#93c5fd"] as const,

  /** Purple/violet gradient (primary UI) */
  primary: ["#7c3aed", "#8b5cf6", "#a78bfa"] as const,

  /** Sunset gradient (warm spectrum) */
  sunset: ["#f59e0b", "#ef4444", "#ec4899"] as const,

  /** Ocean gradient (cool spectrum) */
  ocean: ["#0ea5e9", "#3b82f6", "#6366f1"] as const,
} as const;

/**
 * Type for preset gradient names.
 */
export type GradientPreset = keyof typeof GRADIENT_PRESETS;
