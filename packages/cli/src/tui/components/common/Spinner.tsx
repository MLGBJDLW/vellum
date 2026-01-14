/**
 * Spinner Component (Chain 21)
 *
 * Reusable animated spinner for loading states.
 * Extracted from ThinkingBlock for general use.
 *
 * Uses global AnimationContext for centralized timing to prevent
 * flickering from multiple independent timers.
 *
 * @module tui/components/common/Spinner
 */

import { Text } from "ink";
import type React from "react";
import { useAnimationFrame } from "../../context/AnimationContext.js";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the Spinner component.
 */
export interface SpinnerProps {
  /** Color of the spinner (default: from theme or "cyan") */
  readonly color?: string;
  /** Animation frames (default: braille spinner) */
  readonly frames?: readonly string[];
  /**
   * Animation interval in milliseconds
   * @deprecated No longer used - interval is controlled globally by AnimationContext
   */
  readonly interval?: number;
}

/**
 * Props for the LoadingIndicator component.
 */
export interface LoadingIndicatorProps {
  /** Message to display alongside the spinner */
  readonly message?: string;
  /** Whether to show the spinner (default: true) */
  readonly showSpinner?: boolean;
  /** Color for the spinner */
  readonly spinnerColor?: string;
  /** Spinner animation frames */
  readonly frames?: readonly string[];
  /** Whether the indicator is dimmed */
  readonly dimmed?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Default spinner animation frames (braille pattern) */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

/** Alternative spinner styles */
export const SPINNER_STYLES = {
  /** Braille dots (default) */
  braille: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  /** Classic dots */
  dots: ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"],
  /** Simple line */
  line: ["-", "\\", "|", "/"],
  /** Growing dots */
  growDots: [".", "..", "...", "...."],
  /** Bouncing ball */
  bounce: ["⠁", "⠂", "⠄", "⠂"],
  /** Arc spinner */
  arc: ["◜", "◠", "◝", "◞", "◡", "◟"],
  /** Box spinner */
  box: ["▖", "▘", "▝", "▗"],
} as const;

/** Default animation interval in milliseconds
 * @deprecated Interval is now controlled globally by AnimationContext (120ms default, 150ms for VS Code)
 */
const DEFAULT_INTERVAL_MS = 120;

// =============================================================================
// Spinner Component
// =============================================================================

/**
 * Spinner - Animated loading indicator.
 *
 * Features:
 * - Configurable animation frames
 * - Adjustable speed
 * - Custom colors
 * - Multiple built-in styles
 *
 * @example
 * ```tsx
 * // Basic usage
 * <Spinner />
 *
 * // Custom color
 * <Spinner color="yellow" />
 *
 * // Different style
 * <Spinner frames={SPINNER_STYLES.dots} />
 *
 * // Slower animation
 * <Spinner interval={150} />
 * ```
 */
export function Spinner({
  color,
  frames = SPINNER_FRAMES,
  // interval prop kept for backward compatibility but no longer used
  interval: _interval = DEFAULT_INTERVAL_MS,
}: SpinnerProps): React.JSX.Element {
  const { theme } = useTheme();

  // Use global animation context instead of local timer
  // This prevents flickering from multiple independent timers
  const frameIndex = useAnimationFrame(frames);

  const spinnerColor = color ?? theme.colors.info;

  return <Text color={spinnerColor}>{frames[frameIndex]}</Text>;
}

// =============================================================================
// LoadingIndicator Component
// =============================================================================

/**
 * LoadingIndicator - Spinner with optional message.
 *
 * Combines a spinner with a loading message for common loading states.
 *
 * @example
 * ```tsx
 * // Basic loading
 * <LoadingIndicator message="Loading..." />
 *
 * // Without spinner (just text)
 * <LoadingIndicator message="Please wait" showSpinner={false} />
 *
 * // Dimmed style
 * <LoadingIndicator message="Processing..." dimmed />
 * ```
 */
export function LoadingIndicator({
  message = "Loading...",
  showSpinner = true,
  spinnerColor,
  frames,
  dimmed = false,
}: LoadingIndicatorProps): React.JSX.Element {
  return (
    <Text dimColor={dimmed}>
      {showSpinner && (
        <>
          <Spinner color={spinnerColor} frames={frames} />{" "}
        </>
      )}
      {message}
    </Text>
  );
}

// =============================================================================
// Exports
// =============================================================================

export default Spinner;
