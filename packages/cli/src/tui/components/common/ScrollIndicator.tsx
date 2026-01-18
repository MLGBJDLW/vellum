/**
 * ScrollIndicator Component
 *
 * Minimal ASCII scrollbar for terminal UIs.
 * Displays a vertical track with a proportionally-sized thumb.
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
}

// =============================================================================
// Constants
// =============================================================================

/** Scrollbar characters */
const CHARS = {
  thumb: "█",
  track: "│",
} as const;

/** Minimum thumb size in lines */
const MIN_THUMB_SIZE = 1;

// =============================================================================
// Component
// =============================================================================

/**
 * Vertical scrollbar indicator for terminal UIs.
 *
 * Renders a minimal ASCII scrollbar. Thumb size is proportional
 * to viewport/content ratio. Returns null when not scrollable.
 *
 * @example
 * ```tsx
 * <Box flexDirection="row">
 *   <Box flexGrow={1}>{content}</Box>
 *   <ScrollIndicator
 *     totalHeight={100}
 *     offsetFromBottom={25}
 *     viewportHeight={20}
 *   />
 * </Box>
 * ```
 */
export function ScrollIndicator({
  totalHeight,
  offsetFromBottom,
  viewportHeight,
  show,
}: ScrollIndicatorProps): React.ReactElement | null {
  const { theme } = useTheme();

  // Determine if scrollable
  const isScrollable = totalHeight > viewportHeight;

  // Calculate visibility
  const shouldShow = show ?? isScrollable;

  // Calculate scrollbar metrics
  const metrics = useMemo(() => {
    if (!isScrollable || viewportHeight <= 0 || totalHeight <= 0) {
      return null;
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

    return {
      thumbSize,
      thumbPosition,
      trackHeight,
    };
  }, [totalHeight, offsetFromBottom, viewportHeight, isScrollable]);

  // Don't render if not showing or no metrics
  if (!shouldShow || !metrics) {
    return null;
  }

  const { thumbSize, thumbPosition, trackHeight } = metrics;
  const trackColor = theme.semantic.border.muted;
  const thumbColor = theme.semantic.text.muted;

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
    <Box flexDirection="column" width={1}>
      {lines}
    </Box>
  );
}
