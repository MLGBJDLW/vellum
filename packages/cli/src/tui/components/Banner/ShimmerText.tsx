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
 * Map of CSS named colors to hex values.
 * Covers the 16 basic ANSI terminal colors plus common web colors.
 */
const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  red: "#FF0000",
  green: "#008000",
  yellow: "#FFFF00",
  blue: "#0000FF",
  magenta: "#FF00FF",
  cyan: "#00FFFF",
  white: "#FFFFFF",
  gray: "#808080",
  grey: "#808080",
  orange: "#FFA500",
  pink: "#FFC0CB",
  purple: "#800080",
  brown: "#A52A2A",
  lime: "#00FF00",
  navy: "#000080",
  teal: "#008080",
  olive: "#808000",
  maroon: "#800000",
  aqua: "#00FFFF",
  fuchsia: "#FF00FF",
  silver: "#C0C0C0",
};

/**
 * Clamp RGB values to 0-255.
 */
function clampRgb(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Parse hex color to RGB components.
 */
function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length === 3) {
    const rChar = cleaned[0];
    const gChar = cleaned[1];
    const bChar = cleaned[2];
    if (!rChar || !gChar || !bChar) return null;
    const r = parseInt(rChar + rChar, 16);
    const g = parseInt(gChar + gChar, 16);
    const b = parseInt(bChar + bChar, 16);
    if ([r, g, b].some((value) => Number.isNaN(value))) return null;
    return { r, g, b };
  }
  if (cleaned.length === 6) {
    const bigint = parseInt(cleaned, 16);
    if (Number.isNaN(bigint)) return null;
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    };
  }
  return null;
}

/**
 * Convert ANSI 256 color code to RGB.
 */
function ansi256ToRgb(code: number): { r: number; g: number; b: number } | null {
  if (!Number.isFinite(code)) return null;
  if (code < 0 || code > 255) return null;

  // Standard 16 colors
  const ansi16: Array<{ r: number; g: number; b: number }> = [
    { r: 0, g: 0, b: 0 }, // 0 black
    { r: 128, g: 0, b: 0 }, // 1 red
    { r: 0, g: 128, b: 0 }, // 2 green
    { r: 128, g: 128, b: 0 }, // 3 yellow
    { r: 0, g: 0, b: 128 }, // 4 blue
    { r: 128, g: 0, b: 128 }, // 5 magenta
    { r: 0, g: 128, b: 128 }, // 6 cyan
    { r: 192, g: 192, b: 192 }, // 7 white (light gray)
    { r: 128, g: 128, b: 128 }, // 8 bright black (dark gray)
    { r: 255, g: 0, b: 0 }, // 9 bright red
    { r: 0, g: 255, b: 0 }, // 10 bright green
    { r: 255, g: 255, b: 0 }, // 11 bright yellow
    { r: 0, g: 0, b: 255 }, // 12 bright blue
    { r: 255, g: 0, b: 255 }, // 13 bright magenta
    { r: 0, g: 255, b: 255 }, // 14 bright cyan
    { r: 255, g: 255, b: 255 }, // 15 bright white
  ];

  if (code < 16) {
    return ansi16[code] ?? null;
  }

  if (code >= 232) {
    const gray = (code - 232) * 10 + 8;
    return { r: gray, g: gray, b: gray };
  }

  const index = code - 16;
  const r = Math.floor(index / 36);
  const g = Math.floor((index % 36) / 6);
  const b = index % 6;
  const toChannel = (value: number) => (value === 0 ? 0 : value * 40 + 55);

  return { r: toChannel(r), g: toChannel(g), b: toChannel(b) };
}

/**
 * Parse color string to RGB components.
 * Supports hex, named colors, rgb()/rgba(), and ansi256().
 */
function parseColorToRgb(color: string): { r: number; g: number; b: number } {
  const trimmed = color.trim().toLowerCase();
  if (!trimmed) {
    return { r: 128, g: 128, b: 128 };
  }

  const named = NAMED_COLORS[trimmed];
  if (named) {
    return parseHexColor(named) ?? { r: 128, g: 128, b: 128 };
  }

  const hexMatch = trimmed.match(/^#?[0-9a-f]{3}$|^#?[0-9a-f]{6}$/i);
  if (hexMatch) {
    return parseHexColor(trimmed) ?? { r: 128, g: 128, b: 128 };
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/
  );
  if (rgbMatch) {
    const r = clampRgb(Number.parseInt(rgbMatch[1] ?? "0", 10));
    const g = clampRgb(Number.parseInt(rgbMatch[2] ?? "0", 10));
    const b = clampRgb(Number.parseInt(rgbMatch[3] ?? "0", 10));
    return { r, g, b };
  }

  const ansiMatch = trimmed.match(/^ansi256\(\s*(\d{1,3})\s*\)$/i);
  if (ansiMatch) {
    const code = Number.parseInt(ansiMatch[1] ?? "", 10);
    return ansi256ToRgb(code) ?? { r: 128, g: 128, b: 128 };
  }

  return { r: 128, g: 128, b: 128 };
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
  const base = parseColorToRgb(baseColor);
  const highlight = parseColorToRgb(highlightColor);

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
