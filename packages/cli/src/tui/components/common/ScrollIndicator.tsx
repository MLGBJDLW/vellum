/**
 * ScrollIndicator Component
 *
 * Minimal ASCII scrollbar for terminal UIs.
 * Displays a vertical track with a proportionally-sized thumb.
 * Supports animated colors via useAnimatedScrollbar hook.
 *
 * Includes variants:
 * - ScrollIndicator: Full vertical scrollbar with optional percentage
 * - CompactScrollIndicator: Percentage-only display
 * - HorizontalScrollIndicator: Horizontal scrollbar for status bars
 *
 * @module tui/components/common/ScrollIndicator
 */

import { Box, Text } from "ink";
import type React from "react";
import { useMemo } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for ScrollIndicator component.
 */
export interface ScrollIndicatorProps {
  /** Total content height in lines */
  readonly totalHeight: number;
  /** Current offset from bottom */
  readonly offsetFromBottom: number;
  /** Viewport height */
  readonly viewportHeight: number;
  /** Whether to show (default: auto based on content > viewport) */
  readonly show?: boolean;
  /** Animated thumb color (from useAnimatedScrollbar) */
  readonly thumbColor?: string;
  /** Animated track color (from useAnimatedScrollbar) */
  readonly trackColor?: string;
  /** Whether to show percentage below scrollbar (default: false) */
  readonly showPercentage?: boolean;
  /** Text color for percentage display */
  readonly textColor?: string;
}

/**
 * Props for CompactScrollIndicator (percentage only).
 */
export interface CompactScrollIndicatorProps {
  /** Total content height in lines */
  readonly totalHeight: number;
  /** Current offset from bottom */
  readonly offsetFromBottom: number;
  /** Viewport height */
  readonly viewportHeight: number;
  /** Text color */
  readonly textColor?: string;
  /** Whether to show position icons (⊤/⊥/│) */
  readonly showPositionIcon?: boolean;
}

/**
 * Props for HorizontalScrollIndicator.
 */
export interface HorizontalScrollIndicatorProps {
  /** Total content width/height */
  readonly totalSize: number;
  /** Current offset from end */
  readonly offsetFromEnd: number;
  /** Viewport size */
  readonly viewportSize: number;
  /** Width of the indicator in characters (default: 10) */
  readonly width?: number;
  /** Thumb character (default: █) */
  readonly thumbChar?: string;
  /** Track character (default: ░) */
  readonly trackChar?: string;
  /** Thumb color */
  readonly thumbColor?: string;
  /** Track color */
  readonly trackColor?: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Scrollbar characters */
const CHARS = {
  thumb: "█",
  track: "│",
  horizontalThumb: "█",
  horizontalTrack: "░",
  positionTop: "⊤",
  positionBottom: "⊥",
  positionMiddle: "│",
} as const;

/** Minimum thumb size in lines */
const MIN_THUMB_SIZE = 1;

/** Default horizontal indicator width */
const DEFAULT_HORIZONTAL_WIDTH = 10;

// =============================================================================
// Component
// =============================================================================

/**
 * Vertical scrollbar indicator for terminal UIs.
 *
 * Renders a minimal ASCII scrollbar. Thumb size is proportional
 * to viewport/content ratio. Returns null when not scrollable.
 *
 * Supports animated colors via optional thumbColor/trackColor props
 * from useAnimatedScrollbar hook.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <Box flexDirection="row">
 *   <Box flexGrow={1}>{content}</Box>
 *   <ScrollIndicator
 *     totalHeight={100}
 *     offsetFromBottom={25}
 *     viewportHeight={20}
 *   />
 * </Box>
 *
 * // With animated colors and percentage
 * const { scrollbarColor, trackColor } = useAnimatedScrollbar(isFocused, scrollBy);
 * <ScrollIndicator
 *   totalHeight={100}
 *   offsetFromBottom={25}
 *   viewportHeight={20}
 *   thumbColor={scrollbarColor}
 *   trackColor={trackColor}
 *   showPercentage
 * />
 * ```
 */
export function ScrollIndicator({
  totalHeight,
  offsetFromBottom,
  viewportHeight,
  show,
  thumbColor: animatedThumbColor,
  trackColor: animatedTrackColor,
  showPercentage = false,
  textColor: customTextColor,
}: ScrollIndicatorProps): React.ReactElement | null {
  const { theme } = useTheme();

  // Determine if scrollable
  const isScrollable = totalHeight > viewportHeight;

  // Calculate visibility
  const shouldShow = show ?? isScrollable;

  // Calculate scrollbar metrics and percentage
  const { metrics, percentage } = useMemo(() => {
    if (!isScrollable || viewportHeight <= 0 || totalHeight <= 0) {
      return { metrics: null, percentage: 100 };
    }

    // Thumb size proportional to viewport/content ratio
    const ratio = viewportHeight / totalHeight;
    const thumbSize = Math.max(MIN_THUMB_SIZE, Math.round(viewportHeight * ratio));

    // Track height (use actual viewport height)
    const trackHeight = viewportHeight;

    // Calculate thumb position
    // offsetFromBottom=0 means at bottom, thumb at bottom
    // offsetFromBottom=max means at top, thumb at top
    const maxOffset = totalHeight - viewportHeight;
    const scrollProgress = maxOffset > 0 ? 1 - offsetFromBottom / maxOffset : 1;

    // Thumb position: 0 = top, (trackHeight - thumbSize) = bottom
    const maxThumbPos = trackHeight - thumbSize;
    const thumbPosition = Math.round(scrollProgress * maxThumbPos);

    // Calculate percentage (0% at top, 100% at bottom)
    const pct = Math.round(scrollProgress * 100);

    return {
      metrics: {
        thumbSize,
        thumbPosition,
        trackHeight,
      },
      percentage: pct,
    };
  }, [totalHeight, offsetFromBottom, viewportHeight, isScrollable]);

  // Don't render if not showing or no metrics
  if (!shouldShow || !metrics) {
    return null;
  }

  const { thumbSize, thumbPosition, trackHeight } = metrics;

  // Use animated colors if provided, otherwise fall back to theme
  const trackColor = animatedTrackColor ?? theme.semantic.border.muted;
  const thumbColor = animatedThumbColor ?? theme.semantic.text.muted;
  const textColor = customTextColor ?? theme.semantic.text.muted;

  // Build scrollbar lines
  const lines: React.ReactNode[] = [];
  for (let i = 0; i < trackHeight; i++) {
    const isThumb = i >= thumbPosition && i < thumbPosition + thumbSize;
    lines.push(
      <Text key={i} color={isThumb ? thumbColor : trackColor}>
        {isThumb ? CHARS.thumb : CHARS.track}
      </Text>
    );
  }

  return (
    <Box flexDirection="column" width={1} alignItems="center">
      {lines}
      {showPercentage && (
        <Text color={textColor} dimColor>
          {percentage}%
        </Text>
      )}
    </Box>
  );
}

// =============================================================================
// CompactScrollIndicator
// =============================================================================

/**
 * Compact scroll indicator showing only percentage.
 *
 * Displays scroll position as percentage with optional position icons.
 * Useful for status bars or space-constrained areas.
 *
 * @example
 * ```tsx
 * <CompactScrollIndicator
 *   totalHeight={100}
 *   offsetFromBottom={25}
 *   viewportHeight={20}
 *   showPositionIcon
 * />
 * // Output: "⊥ 75%" (when near bottom)
 * ```
 */
export function CompactScrollIndicator({
  totalHeight,
  offsetFromBottom,
  viewportHeight,
  textColor: customTextColor,
  showPositionIcon = false,
}: CompactScrollIndicatorProps): React.ReactElement | null {
  const { theme } = useTheme();

  // Calculate scroll state
  const scrollState = useMemo(() => {
    const isScrollable = totalHeight > viewportHeight;
    if (!isScrollable || viewportHeight <= 0 || totalHeight <= 0) {
      return null;
    }

    const maxOffset = totalHeight - viewportHeight;
    const scrollProgress = maxOffset > 0 ? 1 - offsetFromBottom / maxOffset : 1;
    const percentage = Math.round(scrollProgress * 100);

    // Determine position (with 1-line threshold for top/bottom)
    const isAtTop = offsetFromBottom >= maxOffset - 1;
    const isAtBottom = offsetFromBottom <= 1;

    return { percentage, isAtTop, isAtBottom };
  }, [totalHeight, offsetFromBottom, viewportHeight]);

  // Don't render if not scrollable
  if (!scrollState) {
    return null;
  }

  const { percentage, isAtTop, isAtBottom } = scrollState;
  const textColor = customTextColor ?? theme.semantic.text.muted;

  // Determine position icon
  const positionIcon = isAtTop
    ? CHARS.positionTop
    : isAtBottom
      ? CHARS.positionBottom
      : CHARS.positionMiddle;

  return (
    <Text color={textColor} dimColor>
      {showPositionIcon && `${positionIcon} `}
      {percentage}%
    </Text>
  );
}

// =============================================================================
// HorizontalScrollIndicator
// =============================================================================

/**
 * Horizontal scroll indicator for status bars.
 *
 * Renders a horizontal track with proportional thumb.
 * Useful for bottom status bars in terminal UIs.
 *
 * @example
 * ```tsx
 * <HorizontalScrollIndicator
 *   totalSize={100}
 *   offsetFromEnd={25}
 *   viewportSize={20}
 *   width={10}
 * />
 * // Output: "░░░░░░██░░" (thumb position based on scroll)
 * ```
 */
export function HorizontalScrollIndicator({
  totalSize,
  offsetFromEnd,
  viewportSize,
  width = DEFAULT_HORIZONTAL_WIDTH,
  thumbChar = CHARS.horizontalThumb,
  trackChar = CHARS.horizontalTrack,
  thumbColor: customThumbColor,
  trackColor: customTrackColor,
}: HorizontalScrollIndicatorProps): React.ReactElement | null {
  const { theme } = useTheme();

  // Calculate scrollbar metrics
  const scrollbar = useMemo(() => {
    const isScrollable = totalSize > viewportSize;
    if (!isScrollable || viewportSize <= 0 || totalSize <= 0) {
      return null;
    }

    // Calculate thumb width (proportional, min 1)
    const ratio = viewportSize / totalSize;
    const thumbWidth = Math.max(1, Math.round(width * ratio));

    // Calculate thumb position
    // offsetFromEnd=0 means at end, thumb at right
    // offsetFromEnd=max means at start, thumb at left
    const maxOffset = totalSize - viewportSize;
    const scrollProgress = maxOffset > 0 ? 1 - offsetFromEnd / maxOffset : 1;

    const scrollableWidth = width - thumbWidth;
    const thumbOffset = Math.round(scrollableWidth * scrollProgress);

    // Build character array
    const chars: Array<{ char: string; isThumb: boolean }> = [];
    for (let i = 0; i < width; i++) {
      const isThumb = i >= thumbOffset && i < thumbOffset + thumbWidth;
      chars.push({
        char: isThumb ? thumbChar : trackChar,
        isThumb,
      });
    }

    return chars;
  }, [totalSize, offsetFromEnd, viewportSize, width, thumbChar, trackChar]);

  // Don't render if not scrollable
  if (!scrollbar) {
    return null;
  }

  const thumbColor = customThumbColor ?? theme.semantic.text.muted;
  const trackColor = customTrackColor ?? theme.semantic.border.muted;

  return (
    <Text>
      {scrollbar.map((item, index) => (
        <Text key={`${index}-${item.char}`} color={item.isThumb ? thumbColor : trackColor}>
          {item.char}
        </Text>
      ))}
    </Text>
  );
}
