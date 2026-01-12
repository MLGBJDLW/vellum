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
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { selectAsciiArt } from "./AsciiArt.js";
import { interpolateColor } from "./ShimmerText.js";
import { TypeWriterGradient } from "./TypeWriterGradient.js";
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
  /** Shimmer cycle duration in milliseconds (default: 3000) */
  readonly cycleDuration?: number;
  /** Shimmer update interval in milliseconds (default: 100) */
  readonly updateInterval?: number;
  /** Callback when banner fade-out completes */
  readonly onComplete?: () => void;
  /** Duration to display before fading (ms, default: 2000) */
  readonly displayDuration?: number;
  /** Whether to auto-hide after displayDuration */
  readonly autoHide?: boolean;
  /** Number of animation cycles before stopping (default: infinite) */
  readonly cycles?: number;
  /** Whether to show typewriter effect on startup (default: true) */
  readonly typewriter?: boolean;
  /** Typewriter speed: lines/sec for line mode, chars/sec for char mode (default: 50 lines/sec) */
  readonly typewriterSpeed?: number;
  /** Typewriter mode: 'line' reveals whole lines, 'char' reveals characters (default: 'line') */
  readonly typewriterMode?: "line" | "char";
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

/** Interpolated steps per gradient segment for smoother shimmer shifts. */
const GRADIENT_STEPS_PER_SEGMENT = 12;

const PARCHMENT_GRADIENT_STEPS = buildGradientSteps(PARCHMENT_GRADIENT, GRADIENT_STEPS_PER_SEGMENT);

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

/**
 * Animated gradient text with shimmer sweep effect.
 * Memoized to prevent unnecessary re-renders.
 */
const AnimatedGradient = memo(function AnimatedGradient({
  children,
  position,
}: AnimatedGradientProps): React.JSX.Element {
  // Calculate discrete color shift to reduce re-computation
  // Only recalculates when shift index actually changes
  const colorShift =
    Math.floor(position * PARCHMENT_GRADIENT_STEPS.length) % PARCHMENT_GRADIENT_STEPS.length;

  // Shift gradient colors based on discrete colorShift value
  const shiftedColors = useMemo(() => {
    if (colorShift === 0) return PARCHMENT_GRADIENT_STEPS;
    return [
      ...PARCHMENT_GRADIENT_STEPS.slice(colorShift),
      ...PARCHMENT_GRADIENT_STEPS.slice(0, colorShift),
    ];
  }, [colorShift]); // Depend on discrete value, not continuous position

  return <Gradient colors={shiftedColors}>{children}</Gradient>;
});

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
  cycleDuration,
  updateInterval,
  onComplete,
  displayDuration = 2000,
  autoHide = false,
  cycles,
  typewriter = true,
  typewriterSpeed,
  typewriterMode = "line",
}: BannerProps): React.JSX.Element | null {
  const { stdout } = useStdout();
  const [visible, setVisible] = useState(true);
  const [opacity, setOpacity] = useState(1);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [typingComplete, setTypingComplete] = useState(!typewriter);

  // Refs for nested timer cleanup
  const step1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const step2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get terminal dimensions for responsive art selection
  const terminalWidth = stdout?.columns ?? 80;

  // Select appropriate ASCII art
  const asciiArt = useMemo(() => {
    return customArt ?? selectAsciiArt(terminalWidth);
  }, [customArt, terminalWidth]);

  // Shimmer animation tuned for smoother motion without excessive redraws
  // Stop animation when cycles complete
  // Only start shimmer after typing completes
  const { position } = useShimmer({
    cycleDuration: cycleDuration ?? 3000,
    updateInterval,
    enabled: animated && visible && !animationComplete && typingComplete,
    maxCycles: cycles,
    onComplete: () => setAnimationComplete(true),
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

  // Determine if animation should show (not complete or no cycles limit)
  const showAnimation = animated && !animationComplete;

  // Determine which phase we're in
  const isTypingPhase = typewriter && !typingComplete;
  const isShimmerPhase = typingComplete && showAnimation;

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      paddingX={1}
      paddingY={1}
    >
      {isTypingPhase ? (
        <TypeWriterGradient
          text={asciiArt}
          speed={typewriterSpeed}
          colors={PARCHMENT_GRADIENT}
          showCursor
          mode={typewriterMode}
          onComplete={() => setTypingComplete(true)}
        />
      ) : isShimmerPhase ? (
        <AnimatedGradient position={position}>{asciiArt}</AnimatedGradient>
      ) : (
        <Gradient colors={PARCHMENT_GRADIENT}>{asciiArt}</Gradient>
      )}

      {showVersion && version ? <VersionDisplay version={version} /> : null}

      {/* Loading indicator - hide after animation complete */}
      {!animationComplete && (
        <Box marginTop={1}>
          <Text color={opacity < 1 ? "#666" : "#8B4513"} dimColor={opacity < 0.5}>
            {opacity < 0.5 ? "Starting..." : "Initializing..."}
          </Text>
        </Box>
      )}
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

// =============================================================================
// Header Banner (Compact CLI Header)
// =============================================================================

/**
 * Props for the HeaderBanner component.
 */
export interface HeaderBannerProps {
  /** Whether shimmer animation is enabled (default: true) */
  readonly animated?: boolean;
}

/**
 * Compact header banner with animated gradient for use at CLI top.
 * Displays a single-line parchment-styled logo with continuous shimmer.
 */
export function HeaderBanner({ animated = true }: HeaderBannerProps): React.JSX.Element {
  const { position } = useShimmer({
    cycleDuration: 3000,
    enabled: animated,
  });

  // Calculate discrete color shift to reduce re-computation
  const colorShift =
    Math.floor(position * PARCHMENT_GRADIENT_STEPS.length) % PARCHMENT_GRADIENT_STEPS.length;

  // Shift gradient colors based on discrete colorShift value
  const shiftedColors = useMemo(() => {
    if (colorShift === 0) return PARCHMENT_GRADIENT_STEPS;
    return [
      ...PARCHMENT_GRADIENT_STEPS.slice(colorShift),
      ...PARCHMENT_GRADIENT_STEPS.slice(0, colorShift),
    ];
  }, [colorShift]); // Depend on discrete value, not continuous position

  // Compact ASCII art for header (single line with decorations)
  const headerArt = "═══╣ ◊ ╠═══  V E L L U M  ═══╣ ◊ ╠═══";

  return (
    <Box justifyContent="center" width="100%">
      {animated ? (
        <Gradient colors={shiftedColors}>{headerArt}</Gradient>
      ) : (
        <Gradient colors={PARCHMENT_GRADIENT}>{headerArt}</Gradient>
      )}
    </Box>
  );
}
