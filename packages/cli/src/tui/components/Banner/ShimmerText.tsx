/**
 * ShimmerText Component for Banner
 *
 * Renders text with a flowing shimmer/glow effect.
 * Uses the useShimmer hook for animation state.
 *
 * @module tui/components/Banner/ShimmerText
 */

import { Text } from "ink";
import React, { useMemo } from "react";
import { calculateShimmerIntensity, type ShimmerConfig, useShimmer } from "./useShimmer.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the BannerShimmerText component.
 */
export interface BannerShimmerTextProps {
  /** Text content to display with shimmer effect */
  readonly children: string;
  /** Base color (default: '#8B4513' - saddle brown) */
  readonly baseColor?: string;
  /** Highlight color for shimmer peak (default: '#FFD700' - gold) */
  readonly highlightColor?: string;
  /** Shimmer animation configuration */
  readonly shimmerConfig?: ShimmerConfig;
  /** Whether shimmer is enabled (default: true) */
  readonly enabled?: boolean;
  /** Width of the shimmer effect (0-1, default: 0.15) */
  readonly shimmerWidth?: number;
  /** Whether text should be bold */
  readonly bold?: boolean;
}

// =============================================================================
// Color Interpolation
// =============================================================================

/**
 * Parse hex color to RGB components.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace("#", "");
  const bigint = parseInt(cleaned, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

/**
 * Convert RGB to hex string.
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Interpolate between two colors based on intensity (0-1).
 */
export function interpolateColor(
  baseColor: string,
  highlightColor: string,
  intensity: number
): string {
  const base = hexToRgb(baseColor);
  const highlight = hexToRgb(highlightColor);

  const r = base.r + (highlight.r - base.r) * intensity;
  const g = base.g + (highlight.g - base.g) * intensity;
  const b = base.b + (highlight.b - base.b) * intensity;

  return rgbToHex(r, g, b);
}

// =============================================================================
// Character-Level Shimmer Component
// =============================================================================

/**
 * Single character with shimmer color applied.
 * Memoized to prevent unnecessary re-renders.
 */
interface ShimmerCharProps {
  readonly char: string;
  readonly color: string;
  readonly bold?: boolean;
}

const ShimmerChar = React.memo(function ShimmerChar({
  char,
  color,
  bold,
}: ShimmerCharProps): React.JSX.Element {
  return (
    <Text color={color} bold={bold}>
      {char}
    </Text>
  );
});

// =============================================================================
// Main Component
// =============================================================================

/**
 * BannerShimmerText renders text with a flowing shimmer effect.
 *
 * The shimmer sweeps from left to right, creating a glow effect
 * that transitions from the base color to the highlight color.
 *
 * @example
 * ```tsx
 * <BannerShimmerText
 *   baseColor="#8B4513"
 *   highlightColor="#FFD700"
 * >
 *   VELLUM
 * </BannerShimmerText>
 * ```
 */
export function BannerShimmerText({
  children,
  baseColor = "#8B4513",
  highlightColor = "#FFD700",
  shimmerConfig,
  enabled = true,
  shimmerWidth = 0.15,
  bold = false,
}: BannerShimmerTextProps): React.JSX.Element {
  const { position } = useShimmer({
    ...shimmerConfig,
    enabled,
  });

  // Calculate color for each character based on shimmer position
  const coloredChars = useMemo(() => {
    const chars = children.split("");
    const totalChars = chars.length;

    return chars.map((char, index) => {
      // Skip whitespace - render as-is
      if (char === " " || char === "\n" || char === "\t") {
        return { char, color: baseColor, isWhitespace: true };
      }

      const intensity = calculateShimmerIntensity(index, totalChars, position, shimmerWidth);

      const color = interpolateColor(baseColor, highlightColor, intensity);
      return { char, color, isWhitespace: false };
    });
  }, [children, position, baseColor, highlightColor, shimmerWidth]);

  return (
    <Text>
      {coloredChars.map((item, index) => (
        <ShimmerChar
          key={`${index}-${item.char}`}
          char={item.char}
          color={item.isWhitespace ? baseColor : item.color}
          bold={bold}
        />
      ))}
    </Text>
  );
}

/**
 * Multi-line shimmer text that processes each line.
 */
export interface MultiLineShimmerProps extends Omit<BannerShimmerTextProps, "children"> {
  /** Lines of text to render */
  readonly lines: string[];
}

export function MultiLineShimmer({ lines, ...props }: MultiLineShimmerProps): React.JSX.Element {
  return (
    <>
      {lines.map((line, index) => (
        // Using index as key is acceptable here since lines array is static and order never changes
        // biome-ignore lint/suspicious/noArrayIndexKey: lines are static banner content that never reorders
        <BannerShimmerText key={index} {...props}>
          {line}
        </BannerShimmerText>
      ))}
    </>
  );
}
