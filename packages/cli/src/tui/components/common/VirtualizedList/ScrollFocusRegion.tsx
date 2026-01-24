/**
 * Scroll Focus Region
 *
 * Provides nested scroll support for code blocks and other scrollable regions.
 * When focused, wheel events are captured and only affect internal scrolling.
 * When boundaries are reached, events can propagate to the parent.
 *
 * Features:
 * - Focus mode: Captures scroll events when focused
 * - Boundary detection: Propagates to parent at edges
 * - Smooth transitions: Animated focus state changes
 *
 * @module tui/components/common/VirtualizedList/ScrollFocusRegion
 */

import { Box, Text } from "ink";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for ScrollFocusRegion behavior.
 */
export interface ScrollFocusRegionConfig {
  /** Maximum number of visible lines in the viewport */
  readonly maxVisibleLines: number;
  /** Whether focus mode is enabled (captures scroll events when focused) */
  readonly enableFocusMode: boolean;
  /** Threshold in pixels/lines to consider at boundary */
  readonly boundaryThreshold: number;
  /** Duration of focus transition animation in milliseconds */
  readonly focusTransitionMs: number;
}

/**
 * Default configuration values for ScrollFocusRegion.
 */
export const DEFAULT_SCROLL_FOCUS_CONFIG: ScrollFocusRegionConfig = {
  maxVisibleLines: 20,
  enableFocusMode: true,
  boundaryThreshold: 1,
  focusTransitionMs: 150,
} as const;

// ============================================================================
// Types
// ============================================================================

/**
 * Props for the ScrollFocusRegion component.
 */
export interface ScrollFocusRegionProps {
  /** Content lines to display */
  readonly lines: readonly string[];
  /** Configuration overrides */
  readonly config?: Partial<ScrollFocusRegionConfig>;
  /** Whether this region is currently focused */
  readonly isFocused?: boolean;
  /** Callback when focus state changes */
  readonly onFocusChange?: (focused: boolean) => void;
  /**
   * Callback when scroll reaches a boundary.
   * Return true to allow event propagation to parent.
   */
  readonly onBoundaryReached?: (direction: "top" | "bottom") => boolean;
  /** Callback when scroll position changes */
  readonly onScrollChange?: (scrollTop: number, scrollHeight: number) => void;
  /** Optional width constraint */
  readonly width?: number | string;
  /** Whether to show scroll indicators */
  readonly showScrollIndicators?: boolean;
}

/**
 * Internal state for scroll focus management.
 */
export interface ScrollFocusState {
  /** Current scroll position (line index) */
  readonly scrollTop: number;
  /** Total content height (number of lines) */
  readonly contentHeight: number;
  /** Visible viewport height (number of lines) */
  readonly viewportHeight: number;
  /** Whether this region is focused */
  readonly isFocused: boolean;
  /** Whether scroll is at the top boundary */
  readonly atTopBoundary: boolean;
  /** Whether scroll is at the bottom boundary */
  readonly atBottomBoundary: boolean;
}

/**
 * Return type for the useScrollFocus hook.
 */
export interface UseScrollFocusReturn {
  /** Current scroll state */
  readonly state: ScrollFocusState;
  /** Scroll to an absolute line position */
  readonly scrollTo: (position: number) => void;
  /** Scroll by a delta (positive = down, negative = up) */
  readonly scrollBy: (delta: number) => void;
  /** Set focus state to true */
  readonly focus: () => void;
  /** Set focus state to false */
  readonly blur: () => void;
  /** Whether scrolling up is possible */
  readonly canScrollUp: boolean;
  /** Whether scrolling down is possible */
  readonly canScrollDown: boolean;
  /**
   * Handle a wheel event delta.
   * Returns true if the event was consumed (should not propagate).
   */
  readonly handleWheel: (deltaY: number) => boolean;
}

// ============================================================================
// Hook: useScrollFocus
// ============================================================================

/**
 * Hook for managing scroll focus state and behavior.
 *
 * @param lines - Content lines to scroll through
 * @param config - Optional configuration overrides
 * @returns Scroll state and control functions
 *
 * @example
 * ```tsx
 * const { state, handleWheel, scrollBy } = useScrollFocus(codeLines, {
 *   maxVisibleLines: 15,
 * });
 *
 * // In scroll handler
 * const consumed = handleWheel(event.deltaY);
 * if (!consumed) {
 *   // Event should propagate to parent
 * }
 * ```
 */
export function useScrollFocus(
  lines: readonly string[],
  config?: Partial<ScrollFocusRegionConfig>
): UseScrollFocusReturn {
  // Merge config with defaults
  const mergedConfig = useMemo(
    () => ({
      ...DEFAULT_SCROLL_FOCUS_CONFIG,
      ...config,
    }),
    [config]
  );

  const { maxVisibleLines, enableFocusMode, boundaryThreshold } = mergedConfig;

  // Calculate dimensions
  const contentHeight = lines.length;
  const viewportHeight = Math.min(maxVisibleLines, contentHeight);
  const maxScrollTop = Math.max(0, contentHeight - viewportHeight);

  // State
  const [scrollTop, setScrollTop] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  // Track last scroll direction for boundary detection
  const lastDeltaRef = useRef<number>(0);

  // Compute boundary states
  const atTopBoundary = scrollTop <= boundaryThreshold;
  const atBottomBoundary = scrollTop >= maxScrollTop - boundaryThreshold;

  // Scroll capabilities
  const canScrollUp = scrollTop > 0;
  const canScrollDown = scrollTop < maxScrollTop;

  /**
   * Scroll to an absolute position (clamped to valid range).
   */
  const scrollTo = useCallback(
    (position: number) => {
      const clamped = Math.max(0, Math.min(maxScrollTop, Math.round(position)));
      setScrollTop(clamped);
    },
    [maxScrollTop]
  );

  /**
   * Scroll by a delta amount.
   */
  const scrollBy = useCallback(
    (delta: number) => {
      setScrollTop((prev) => {
        const next = prev + delta;
        return Math.max(0, Math.min(maxScrollTop, Math.round(next)));
      });
    },
    [maxScrollTop]
  );

  /**
   * Set focus state.
   */
  const focus = useCallback(() => {
    if (enableFocusMode) {
      setIsFocused(true);
    }
  }, [enableFocusMode]);

  /**
   * Clear focus state.
   */
  const blur = useCallback(() => {
    setIsFocused(false);
  }, []);

  /**
   * Handle wheel event.
   * Returns true if the event was consumed (should not propagate to parent).
   */
  const handleWheel = useCallback(
    (deltaY: number): boolean => {
      // If focus mode is disabled or not focused, don't consume
      if (!enableFocusMode || !isFocused) {
        return false;
      }

      // If content fits in viewport, don't consume
      if (contentHeight <= viewportHeight) {
        return false;
      }

      lastDeltaRef.current = deltaY;

      // Check if we're at a boundary and trying to scroll past it
      const scrollingUp = deltaY < 0;
      const scrollingDown = deltaY > 0;

      if (scrollingUp && atTopBoundary) {
        // At top, trying to scroll up - propagate to parent
        return false;
      }

      if (scrollingDown && atBottomBoundary) {
        // At bottom, trying to scroll down - propagate to parent
        return false;
      }

      // Perform the scroll
      scrollBy(deltaY);
      return true;
    },
    [
      enableFocusMode,
      isFocused,
      contentHeight,
      viewportHeight,
      atTopBoundary,
      atBottomBoundary,
      scrollBy,
    ]
  );

  // Build state object
  const state: ScrollFocusState = useMemo(
    () => ({
      scrollTop,
      contentHeight,
      viewportHeight,
      isFocused,
      atTopBoundary,
      atBottomBoundary,
    }),
    [scrollTop, contentHeight, viewportHeight, isFocused, atTopBoundary, atBottomBoundary]
  );

  return {
    state,
    scrollTo,
    scrollBy,
    focus,
    blur,
    canScrollUp,
    canScrollDown,
    handleWheel,
  };
}

// ============================================================================
// Component: ScrollFocusRegion
// ============================================================================

/**
 * A scrollable region that captures focus and manages nested scrolling.
 *
 * Use this component to wrap code blocks or other content that should
 * have independent scroll behavior when focused.
 *
 * @example
 * ```tsx
 * <ScrollFocusRegion
 *   lines={codeBlock.split('\n')}
 *   isFocused={selectedBlockId === block.id}
 *   onBoundaryReached={(dir) => {
 *     // Move focus to parent list
 *     setSelectedBlockId(null);
 *     return true;
 *   }}
 *   config={{ maxVisibleLines: 15 }}
 * />
 * ```
 */
export const ScrollFocusRegion: React.FC<ScrollFocusRegionProps> = ({
  lines,
  config,
  isFocused: externalFocused,
  onFocusChange,
  onBoundaryReached,
  onScrollChange,
  width,
  showScrollIndicators = true,
}) => {
  // Merge config
  const mergedConfig = useMemo(
    () => ({
      ...DEFAULT_SCROLL_FOCUS_CONFIG,
      ...config,
    }),
    [config]
  );

  const { maxVisibleLines } = mergedConfig;

  // Use the scroll focus hook
  const {
    state,
    scrollTo: _scrollTo,
    scrollBy: _scrollBy,
    focus,
    blur,
    canScrollUp,
    canScrollDown,
    handleWheel,
  } = useScrollFocus(lines, config);

  // These are exposed for external use via the regionRef
  void _scrollTo;
  void _scrollBy;

  // Sync external focus state
  const prevExternalFocusedRef = useRef(externalFocused);
  if (externalFocused !== prevExternalFocusedRef.current) {
    prevExternalFocusedRef.current = externalFocused;
    if (externalFocused) {
      focus();
    } else {
      blur();
    }
  }

  // Notify parent of focus changes
  const prevInternalFocusedRef = useRef(state.isFocused);
  if (state.isFocused !== prevInternalFocusedRef.current) {
    prevInternalFocusedRef.current = state.isFocused;
    onFocusChange?.(state.isFocused);
  }

  // Notify parent of scroll changes
  const prevScrollTopRef = useRef(state.scrollTop);
  if (state.scrollTop !== prevScrollTopRef.current) {
    prevScrollTopRef.current = state.scrollTop;
    onScrollChange?.(state.scrollTop, state.contentHeight);
  }

  /**
   * Handle scroll input (exposed for parent integration).
   * Returns true if event was consumed.
   */
  const handleScrollInput = useCallback(
    (deltaY: number): boolean => {
      const consumed = handleWheel(deltaY);

      // If not consumed and we're at a boundary, notify parent
      if (!consumed && onBoundaryReached) {
        const direction = deltaY < 0 ? "top" : "bottom";
        const shouldPropagate = onBoundaryReached(direction);
        // Event propagation is handled by the return value
        return !shouldPropagate;
      }

      return consumed;
    },
    [handleWheel, onBoundaryReached]
  );

  // Calculate visible lines
  const visibleLines = useMemo(() => {
    const start = state.scrollTop;
    const end = Math.min(start + maxVisibleLines, lines.length);
    return lines.slice(start, end);
  }, [lines, state.scrollTop, maxVisibleLines]);

  // Determine if scrolling is needed
  const needsScrolling = lines.length > maxVisibleLines;

  // Build scroll indicator
  const scrollIndicator = useMemo(() => {
    if (!showScrollIndicators || !needsScrolling) {
      return null;
    }

    // Simple text-based indicator
    const indicators: string[] = [];
    if (canScrollUp) {
      indicators.push("↑");
    }
    if (canScrollDown) {
      indicators.push("↓");
    }

    return indicators.length > 0 ? indicators.join(" ") : null;
  }, [showScrollIndicators, needsScrolling, canScrollUp, canScrollDown]);

  // Expose handleScrollInput for parent components
  // This is done through a data attribute that parent can detect
  const regionRef = useRef<{
    handleScrollInput: (deltaY: number) => boolean;
    isFocused: boolean;
  }>({
    handleScrollInput,
    isFocused: state.isFocused,
  });

  // Keep ref updated
  regionRef.current.handleScrollInput = handleScrollInput;
  regionRef.current.isFocused = state.isFocused;

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle={state.isFocused ? "round" : undefined}
      borderColor={state.isFocused ? "cyan" : undefined}
      // W1: data-scrollable attributes for TUI framework nested scroll detection
      data-scrollable="true"
      data-scroll-direction="vertical"
      data-scroll-status={state.isFocused ? "focused" : "idle"}
      data-scroll-can-up={canScrollUp ? "true" : "false"}
      data-scroll-can-down={canScrollDown ? "true" : "false"}
    >
      {/* Content area */}
      <Box flexDirection="column">
        {visibleLines.map((line, idx) => (
          <Text key={`${state.scrollTop}-${idx}`} wrap="truncate">
            {line}
          </Text>
        ))}
      </Box>

      {/* Scroll indicator (inline) */}
      {scrollIndicator && (
        <Box justifyContent="flex-end">
          <Text dimColor>
            {scrollIndicator} ({state.scrollTop + 1}-
            {Math.min(state.scrollTop + maxVisibleLines, lines.length)}/{lines.length})
          </Text>
        </Box>
      )}
    </Box>
  );
};

// ============================================================================
// Utility: createScrollFocusHandler
// ============================================================================

/**
 * Creates a scroll handler that integrates with ScrollFocusRegion.
 *
 * Use this to create a unified scroll handler that checks nested regions
 * before propagating to the parent scroll container.
 *
 * @param regions - Map of region IDs to their scroll handlers
 * @param focusedRegionId - Currently focused region ID (or null)
 * @param parentScrollBy - Parent scroll function
 * @returns Unified scroll handler
 *
 * @example
 * ```tsx
 * const handleScroll = createScrollFocusHandler(
 *   regionHandlers,
 *   focusedBlockId,
 *   (delta) => listRef.current?.scrollBy(delta)
 * );
 *
 * // Use in scroll event
 * handleScroll(event.deltaY);
 * ```
 */
export function createScrollFocusHandler(
  regions: Map<string, (deltaY: number) => boolean>,
  focusedRegionId: string | null,
  parentScrollBy: (delta: number) => void
): (deltaY: number) => void {
  return (deltaY: number) => {
    // If a region is focused, try to let it handle the scroll
    if (focusedRegionId) {
      const handler = regions.get(focusedRegionId);
      if (handler) {
        const consumed = handler(deltaY);
        if (consumed) {
          return; // Event was consumed by the focused region
        }
      }
    }

    // No focused region or event wasn't consumed - scroll parent
    parentScrollBy(deltaY);
  };
}

export default ScrollFocusRegion;
