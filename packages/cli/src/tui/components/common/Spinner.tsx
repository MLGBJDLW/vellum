/**
 * Spinner Component (Chain 21)
 *
 * Reusable animated spinner for loading states.
 * Extracted from ThinkingBlock for general use.
 *
 * Uses global AnimationContext for centralized timing to prevent
 * flickering from multiple independent timers.
 *
 * Supports both custom animation frames and ink-spinner types.
 *
 * @module tui/components/common/Spinner
 */

import { Text } from "ink";
import InkSpinner from "ink-spinner";
import type React from "react";
import { useAnimationFrame } from "../../context/AnimationContext.js";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Available ink-spinner type names.
 * These are the built-in spinner types from cli-spinners.
 */
export type SpinnerType =
  | "dots"
  | "dots2"
  | "dots3"
  | "dots4"
  | "dots5"
  | "dots6"
  | "dots7"
  | "dots8"
  | "dots9"
  | "dots10"
  | "dots11"
  | "dots12"
  | "line"
  | "line2"
  | "pipe"
  | "simpleDots"
  | "simpleDotsScrolling"
  | "star"
  | "star2"
  | "flip"
  | "hamburger"
  | "growVertical"
  | "growHorizontal"
  | "balloon"
  | "balloon2"
  | "noise"
  | "bounce"
  | "boxBounce"
  | "boxBounce2"
  | "triangle"
  | "arc"
  | "circle"
  | "squareCorners"
  | "circleQuarters"
  | "circleHalves"
  | "squish"
  | "toggle"
  | "toggle2"
  | "toggle3"
  | "toggle4"
  | "toggle5"
  | "toggle6"
  | "toggle7"
  | "toggle8"
  | "toggle9"
  | "toggle10"
  | "toggle11"
  | "toggle12"
  | "toggle13"
  | "arrow"
  | "arrow2"
  | "arrow3"
  | "bouncingBar"
  | "bouncingBall"
  | "smiley"
  | "monkey"
  | "hearts"
  | "clock"
  | "earth"
  | "moon"
  | "runner"
  | "pong"
  | "shark"
  | "dqpb"
  | "weather"
  | "christmas"
  | "grenade"
  | "point"
  | "layer"
  | "betaWave";

/**
 * Props for the Spinner component.
 */
export interface SpinnerProps {
  /** Color of the spinner (default: from theme or "cyan") */
  readonly color?: string;
  /**
   * Animation frames (default: braille spinner)
   * Ignored when `type` is specified.
   */
  readonly frames?: readonly string[];
  /**
   * Animation interval in milliseconds
   * @deprecated No longer used - interval is controlled globally by AnimationContext
   */
  readonly interval?: number;
  /**
   * Use ink-spinner with specified type.
   * When set, this takes precedence over `frames`.
   * @example "dots", "line", "arc", "bounce"
   */
  readonly type?: SpinnerType;
  /**
   * Whether to use ink-spinner (default: false for backward compatibility).
   * Set to true to use ink-spinner even without specifying a type.
   */
  readonly useInkSpinner?: boolean;
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
 * - Support for ink-spinner types
 *
 * @example
 * ```tsx
 * // Basic usage (custom frames)
 * <Spinner />
 *
 * // Custom color
 * <Spinner color="yellow" />
 *
 * // Different style
 * <Spinner frames={SPINNER_STYLES.dots} />
 *
 * // Using ink-spinner type
 * <Spinner type="dots" />
 *
 * // Using ink-spinner with explicit flag
 * <Spinner useInkSpinner type="arc" color="green" />
 * ```
 */
export function Spinner({
  color,
  frames = SPINNER_FRAMES,
  // interval prop kept for backward compatibility but no longer used
  interval: _interval = DEFAULT_INTERVAL_MS,
  type,
  useInkSpinner = false,
}: SpinnerProps): React.JSX.Element {
  const { theme } = useTheme();

  // Use global animation context for custom frames
  const frameIndex = useAnimationFrame(frames);

  const spinnerColor = color ?? theme.colors.info;

  // Use ink-spinner if type is specified or useInkSpinner is true
  if (type || useInkSpinner) {
    return (
      <Text color={spinnerColor}>
        <InkSpinner type={type ?? "dots"} />
      </Text>
    );
  }

  // Default: use custom frames with AnimationContext
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
