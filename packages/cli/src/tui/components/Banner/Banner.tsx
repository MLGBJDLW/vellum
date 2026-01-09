/**
 * Banner Component
 *
 * Main ASCII art banner with gradient colors and shimmer animation.
 * Features ancient parchment/scroll styling for the Vellum brand.
 *
 * @module tui/components/Banner/Banner
 */

import { Box, Text, useStdout } from "ink";
import Gradient from "ink-gradient";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { selectAsciiArt } from "./AsciiArt.js";
import { useShimmer } from "./useShimmer.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the Banner component.
 */
export interface BannerProps {
  /** Custom ASCII art override (uses responsive selection by default) */
  readonly customArt?: string;
  /** Whether to show version text */
  readonly showVersion?: boolean;
  /** Version string to display */
  readonly version?: string;
  /** Whether shimmer animation is enabled (default: true) */
  readonly animated?: boolean;
  /** Callback when banner fade-out completes */
  readonly onComplete?: () => void;
  /** Duration to display before fading (ms, default: 2000) */
  readonly displayDuration?: number;
  /** Whether to auto-hide after displayDuration */
  readonly autoHide?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Gradient colors for ancient parchment effect.
 * Brown to gold progression.
 */
const PARCHMENT_GRADIENT = [
  "#8B4513", // Saddle Brown
  "#A0522D", // Sienna
  "#CD853F", // Peru
  "#DAA520", // Goldenrod
  "#FFD700", // Gold
  "#FFFACD", // Lemon Chiffon
];

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Animated gradient text with shimmer sweep effect.
 */
interface AnimatedGradientProps {
  readonly children: string;
  readonly position: number;
}

function AnimatedGradient({ children, position }: AnimatedGradientProps): React.JSX.Element {
  // Shift gradient colors based on shimmer position
  const shiftedColors = useMemo(() => {
    const shift = Math.floor(position * PARCHMENT_GRADIENT.length);
    const colors = [...PARCHMENT_GRADIENT];

    // Rotate colors to create movement effect
    for (let i = 0; i < shift; i++) {
      const first = colors.shift();
      if (first) colors.push(first);
    }

    return colors;
  }, [position]);

  return <Gradient colors={shiftedColors}>{children}</Gradient>;
}

/**
 * Static version display.
 */
interface VersionDisplayProps {
  readonly version: string;
}

function VersionDisplay({ version }: VersionDisplayProps): React.JSX.Element {
  return (
    <Box marginTop={1} justifyContent="center">
      <Text color="#8B4513">v{version}</Text>
      <Text color="#CD853F"> | </Text>
      <Text color="#DAA520" italic>
        AI-Powered Coding Assistant
      </Text>
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * Banner displays the Vellum ASCII art logo with gradient and shimmer effects.
 *
 * Features:
 * - Responsive ASCII art selection based on terminal width
 * - Smooth gradient colors (brown to gold parchment theme)
 * - Animated shimmer sweep effect
 * - Optional version display
 * - Auto-hide capability with callback
 *
 * @example
 * ```tsx
 * // Basic usage
 * <Banner />
 *
 * // With version and auto-hide
 * <Banner
 *   showVersion
 *   version="1.0.0"
 *   autoHide
 *   displayDuration={3000}
 *   onComplete={() => setShowBanner(false)}
 * />
 * ```
 */
export function Banner({
  customArt,
  showVersion = false,
  version = "0.1.0",
  animated = true,
  onComplete,
  displayDuration = 2000,
  autoHide = false,
}: BannerProps): React.JSX.Element | null {
  const { stdout } = useStdout();
  const [visible, setVisible] = useState(true);
  const [opacity, setOpacity] = useState(1);

  // Refs for nested timer cleanup
  const step1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const step2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get terminal dimensions for responsive art selection
  const terminalWidth = stdout?.columns ?? 80;

  // Select appropriate ASCII art
  const asciiArt = useMemo(() => {
    return customArt ?? selectAsciiArt(terminalWidth);
  }, [customArt, terminalWidth]);

  // Shimmer animation - use slower cycle for smoother effect
  const { position } = useShimmer({
    cycleDuration: 3000,
    updateInterval: 150,
    enabled: animated && visible,
  });

  // Auto-hide timer with smooth transition
  useEffect(() => {
    if (!autoHide) return;

    // Use simple timeout - start hiding 300ms before end for quicker transition
    const hideTimer = setTimeout(() => {
      // Quick fade: 0.7 -> 0 in 300ms total
      setOpacity(0.7);

      step1Ref.current = setTimeout(() => {
        setOpacity(0.3);
      }, 100);

      step2Ref.current = setTimeout(() => {
        setOpacity(0);
        setVisible(false);
        onComplete?.();
      }, 200);
    }, displayDuration - 300);

    return () => {
      clearTimeout(hideTimer);
      if (step1Ref.current) clearTimeout(step1Ref.current);
      if (step2Ref.current) clearTimeout(step2Ref.current);
    };
  }, [autoHide, displayDuration, onComplete]);

  if (!visible) return null;

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      paddingX={1}
      paddingY={1}
    >
      {animated ? (
        <AnimatedGradient position={position}>{asciiArt}</AnimatedGradient>
      ) : (
        <Gradient colors={PARCHMENT_GRADIENT}>{asciiArt}</Gradient>
      )}

      {showVersion && <VersionDisplay version={version} />}

      {/* Loading indicator */}
      <Box marginTop={1}>
        <Text color={opacity < 1 ? "#666" : "#8B4513"} dimColor={opacity < 0.5}>
          {opacity < 0.5 ? "Starting..." : "Initializing..."}
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Compact banner for narrow terminals or inline use.
 */
export function CompactBanner(): React.JSX.Element {
  return (
    <Box>
      <Gradient colors={PARCHMENT_GRADIENT}>{"◇ VELLUM ◇"}</Gradient>
    </Box>
  );
}

/**
 * Minimal text-only banner.
 */
export function MinimalBanner(): React.JSX.Element {
  return (
    <Text color="#DAA520" bold>
      VELLUM
    </Text>
  );
}
