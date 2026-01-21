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
 * Includes scene-based animations for contextual loading states.
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
 * Scene-based spinner types for contextual loading states.
 * Each scene has a unique animation that conveys the operation type.
 */
export type SpinnerScene =
  | "default" // Default braille spinner
  | "thinking" // AI thinking: 🤔 💭 💡 ✨
  | "writing" // File writing: ✎. ✎.. ✎...
  | "searching" // Search operation: 🔍 🔎
  | "loading" // Generic loading: ◐ ◓ ◑ ◒
  | "streaming"; // Stream output: ▰▰▰▱▱▱

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
   * Scene-based spinner animation (default: 'default').
   * Provides contextual animations for different operation types.
   * Takes precedence over `frames` when specified (unless 'default').
   */
  readonly scene?: SpinnerScene;
  /**
   * Label to display after the spinner.
   * Useful for providing context about the current operation.
   */
  readonly label?: string;
  /**
   * Animation frames (default: braille spinner)
   * Ignored when `type` or non-default `scene` is specified.
   */
  readonly frames?: readonly string[];
  /**
   * Animation interval in milliseconds
   * @deprecated No longer used - interval is controlled globally by AnimationContext
   */
  readonly interval?: number;
  /**
   * Use ink-spinner with specified type.
   * When set, this takes precedence over `frames` and `scene`.
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

/**
 * Scene-based animation frames for contextual loading states.
 * Each scene provides a unique visual representation of the operation.
 */
export const SCENE_FRAMES = {
  /** Default braille spinner */
  default: ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"],
  /** AI thinking animation */
  thinking: ["🤔", "💭", "💡", "✨"],
  /** File writing animation */
  writing: ["✎", "✎.", "✎..", "✎..."],
  /** Search operation animation */
  searching: ["🔍", "🔎"],
  /** Generic loading animation */
  loading: ["◐", "◓", "◑", "◒"],
  /** Streaming data animation */
  streaming: ["▰▱▱▱", "▰▰▱▱", "▰▰▰▱", "▰▰▰▰", "▱▰▰▰", "▱▱▰▰", "▱▱▱▰"],
} as const;

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
 * - Scene-based animations for contextual loading states
 * - Adjustable speed
 * - Custom colors
 * - Multiple built-in styles
 * - Support for ink-spinner types
 * - Optional label display
 *
 * @example
 * ```tsx
 * // Basic usage (custom frames)
 * <Spinner />
 *
 * // Scene-based animation
 * <Spinner scene="thinking" label="Analyzing..." />
 *
 * // Writing scene
 * <Spinner scene="writing" label="Saving file..." />
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
  scene = "default",
  label,
  frames = SPINNER_FRAMES,
  // interval prop kept for backward compatibility but no longer used
  interval: _interval = DEFAULT_INTERVAL_MS,
  type,
  useInkSpinner = false,
}: SpinnerProps): React.JSX.Element {
  const { theme } = useTheme();

  // Determine which frames to use based on scene
  const effectiveFrames = scene !== "default" ? SCENE_FRAMES[scene] : frames;

  // Use global animation context for custom frames
  const frameIndex = useAnimationFrame(effectiveFrames);

  const spinnerColor = color ?? theme.semantic.text.primary;

  // Use ink-spinner if type is specified or useInkSpinner is true
  if (type || useInkSpinner) {
    return (
      <Text color={spinnerColor}>
        <InkSpinner type={type ?? "dots"} />
        {label && <Text> {label}</Text>}
      </Text>
    );
  }

  // Default: use custom frames with AnimationContext
  return (
    <Text color={spinnerColor}>
      {effectiveFrames[frameIndex]}
      {label && <Text> {label}</Text>}
    </Text>
  );
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
