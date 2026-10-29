/**
 * VirtualizedList Component
 *
 * A high-performance virtualized list component for terminal UIs.
 * Only renders items that are currently visible in the viewport,
 * with support for variable height items and auto-scroll to bottom.
 *
 * Uses native scroll support in @jrichman/ink (overflowY="scroll" + scrollTop).
 * Ported from Gemini CLI with Vellum adaptations.
 *
 * @module tui/components/common/VirtualizedList
 */

import { Box, type DOMElement } from "ink";
import type React from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { tuiConfig } from "../../theme/tokens.js";
import { getVisibleClickBounds } from "../Clickable.js";
import {
  type FollowMode,
  useBatchedScroll,
  useScrollAnchor,
  useScrollPastEnd,
  useSmoothScroll,
  useStickyBottom,
  useVirtualization,
} from "./hooks/index.js";
import { useScrollbarDrag } from "./hooks/useScrollbarDrag.js";
import { VirtualizedItemPositionProvider } from "./ItemPositionContext.js";
import { useAnchorManager } from "./scrollAnchorAPI.js";
import { SCROLL_TO_ITEM_END, type VirtualizedListProps, type VirtualizedListRef } from "./types.js";
import { findOffsetIndex } from "./utils/blockSums.js";

/**
 * VirtualizedList - Only renders visible items for optimal performance.
 *
 * Features:
 * - Virtual rendering: Only items in viewport are mounted
 * - Height estimation: Supports fixed or variable item heights
 * - Auto-scroll: Sticks to bottom when new items added
 * - Anchor-based scrolling: Stable during content changes
 * - Imperative API: Control scrolling programmatically
 *
 * @example
 * ```tsx
 * const listRef = useRef<VirtualizedListRef<Message>>(null);
 *
 * <VirtualizedList
 *   ref={listRef}
 *   data={messages}
 *   renderItem={({ item }) => <MessageItem message={item} />}
 *   keyExtractor={(item) => item.id}
 *   estimatedItemHeight={3}
 *   initialScrollIndex={SCROLL_TO_ITEM_END}
 *   initialScrollOffsetInIndex={SCROLL_TO_ITEM_END}
 * />
 *
 * // Scroll programmatically
 * listRef.current?.scrollToEnd();
 * listRef.current?.scrollBy(-10);
 * ```
 */
function VirtualizedListInner<T>(
  props: VirtualizedListProps<T>,
  ref: React.Ref<VirtualizedListRef<T>>
) {
  const {
    data,
    renderItem,
    estimatedItemHeight,
    keyExtractor,
    initialScrollIndex,
    initialScrollOffsetInIndex,
    scrollbarThumbColor,
    onScrollStateChange,
    onStickingToBottomChange,
    onFollowModeChange,
    alignToBottom = false,
    isStreaming = false,
    enableSmoothScroll = true,
    enableScrollPastEnd = false,
    enableMouseInteraction = true,
  } = props;

  // Note: theme reserved for future scrollbar styling
  // const { theme } = useTheme();

  // FIX: Initialize container height dynamically from terminal dimensions
  // instead of hardcoded 24 lines. This prevents incorrect scroll calculations
  // on first render when terminal size differs from the default.
  const [containerHeight, setContainerHeight] = useState(() => {
    // Use actual terminal rows if available, with fallback to reasonable default
    const terminalRows = process.stdout.rows;
    // Reserve some space for UI elements (header, input, status)
    // Values configurable via VELLUM_RESERVED_LINES and VELLUM_DEFAULT_ROWS
    const { reservedLines, defaultRows } = tuiConfig.virtualization;
    // CRITICAL: Ensure fallback is robust to avoid premature scrollbar
    return Math.max(8, (terminalRows || defaultRows || 24) - reservedLines);
  });

  // Ref to track authoritative scroll position (updated synchronously after useScrollAnchor)
  // This breaks the render-cycle delay that caused scrollbar/content desync on PageUp/Down.
  const scrollTopRef = useRef(0);

  // Virtualization with actual scroll position
  const {
    heights: _heights,
    offsets,
    totalHeight,
    startIndex: _startIndex,
    endIndex: _endIndex,
    setItemRef,
    containerRef,
    measuredContainerHeight,
    triggerMeasure,
    blockSumsState,
  } = useVirtualization({
    data,
    keyExtractor,
    estimatedItemHeight,
    scrollTop: scrollTopRef.current,
    containerHeight,
    isStreaming,
  });

  const effectiveContainerHeight =
    measuredContainerHeight > 0 ? measuredContainerHeight : containerHeight;

  // Scroll anchor management (uses real offsets/heights + block sums compensation)
  const {
    scrollAnchor,
    setScrollAnchor,
    isStickingToBottom,
    setIsStickingToBottom,
    scrollTop: anchorScrollTop,
    getAnchorForScrollTop,
  } = useScrollAnchor({
    dataLength: data.length,
    offsets,
    heights: _heights,
    totalHeight,
    containerHeight: effectiveContainerHeight,
    initialScrollIndex,
    initialScrollOffsetInIndex,
    blockSumsState,
  });

  // Update scroll ref synchronously (not in effect) to ensure next render uses correct value
  scrollTopRef.current = anchorScrollTop;

  const needsScroll = totalHeight > effectiveContainerHeight;
  const renderScrollTop = needsScroll ? anchorScrollTop : 0;

  // Compute corrected visible range using anchorScrollTop (not the stale _startIndex/_endIndex)
  // This fixes the 1-render delay that caused scrollbar to move but content to stay put.
  const { startIndex, endIndex } = useMemo(() => {
    if (data.length === 0) {
      return { startIndex: 0, endIndex: -1 };
    }

    const start = Math.min(data.length - 1, findOffsetIndex(offsets, renderScrollTop));
    const end = Math.min(
      data.length - 1,
      findOffsetIndex(offsets, renderScrollTop + effectiveContainerHeight)
    );
    return { startIndex: Math.max(0, start), endIndex: Math.max(0, end) };
  }, [renderScrollTop, effectiveContainerHeight, offsets, data.length]);

  // FIX: Debounce container height updates to prevent rapid state changes
  // that can cause rendering race conditions and jittery UI
  const containerHeightUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValidHeightRef = useRef(containerHeight);

  useEffect(() => {
    if (measuredContainerHeight > 0) {
      const rows = process.stdout.rows || 24;
      // FIX: Use a more conservative minimum (8 lines) to prevent degenerate cases
      const MIN_CONTAINER_HEIGHT = 8;
      const safeHeight = Math.max(MIN_CONTAINER_HEIGHT, Math.min(measuredContainerHeight, rows));

      // Only update if the change is significant (more than 1 line difference)
      // This prevents micro-updates from causing layout thrashing
      if (Math.abs(safeHeight - lastValidHeightRef.current) > 1) {
        // Clear any pending update
        if (containerHeightUpdateTimeoutRef.current) {
          clearTimeout(containerHeightUpdateTimeoutRef.current);
        }

        // CRITICAL FIX: If the change is specific to initialization (e.g. 8 -> real height),
        // update IMMEDIATELY to prevent "premature scrollbar" and layout jumps.
        // We detect this by checking if the old height was the fallback small value.
        const isInitialAdjustment = lastValidHeightRef.current <= 15 && safeHeight > 15;

        if (isInitialAdjustment) {
          lastValidHeightRef.current = safeHeight;
          setContainerHeight(safeHeight);
        } else {
          // Debounce the update to batch rapid changes during resize/animation
          containerHeightUpdateTimeoutRef.current = setTimeout(() => {
            lastValidHeightRef.current = safeHeight;
            setContainerHeight(safeHeight);
          }, 16); // One frame at 60fps
        }
      }
    }

    // Cleanup on unmount
    return () => {
      if (containerHeightUpdateTimeoutRef.current) {
        clearTimeout(containerHeightUpdateTimeoutRef.current);
      }
    };
  }, [measuredContainerHeight]);

  // Batched scroll for smooth updates
  const { getScrollTop, setPendingScrollTop } = useBatchedScroll(anchorScrollTop);

  // =========================================================================
  // New Hooks Integration (v2.0)
  // =========================================================================

  // Sticky bottom with 3-state Follow Mode FSM
  const stickyBottom = useStickyBottom({
    scrollTop: anchorScrollTop,
    maxScroll: totalHeight - effectiveContainerHeight,
    containerHeight: effectiveContainerHeight,
    totalContentHeight: totalHeight,
    dataLength: data.length,
    isStreaming,
    initiallyFollowing:
      initialScrollIndex === undefined ||
      initialScrollIndex === SCROLL_TO_ITEM_END ||
      (initialScrollIndex >= data.length - 1 && initialScrollOffsetInIndex === SCROLL_TO_ITEM_END),
  });

  // Smooth scroll animation
  const smoothScroll = useSmoothScroll({
    targetScrollTop: anchorScrollTop,
    maxScroll: totalHeight - effectiveContainerHeight,
    // Follow mode derives its position from the tail anchor. Feeding that same
    // position through an animation callback would write a numeric anchor back.
    enabled: enableSmoothScroll && !stickyBottom.shouldAutoScroll,
    onScrollUpdate: (newScrollTop) => {
      setPendingScrollTop(newScrollTop);
      setScrollAnchor(getAnchorForScrollTop(newScrollTop));
    },
  });

  // Scroll past end (overscroll with rubberband)
  const scrollPastEnd = useScrollPastEnd({
    maxLines: enableScrollPastEnd ? 3 : 0,
  });

  // Anchor manager for programmatic scroll control
  const anchorManager = useAnchorManager();

  // Track follow mode changes
  const prevFollowModeRef = useRef<FollowMode>(stickyBottom.followMode);
  useEffect(() => {
    if (stickyBottom.followMode !== prevFollowModeRef.current) {
      prevFollowModeRef.current = stickyBottom.followMode;
      onFollowModeChange?.(stickyBottom.followMode);
    }
  }, [stickyBottom.followMode, onFollowModeChange]);

  // Sync sticky bottom state with legacy isStickingToBottom
  useEffect(() => {
    const shouldStick = stickyBottom.shouldAutoScroll;
    if (shouldStick !== isStickingToBottom) {
      setIsStickingToBottom(shouldStick);
    }
  }, [stickyBottom.shouldAutoScroll, isStickingToBottom, setIsStickingToBottom]);

  // FIX: Detect layout mode transition and sync scrollTop
  // When content grows from flex-end (no scroll needed) to flex-start (scroll needed),
  // we must set scrollTop to maxScroll to keep content aligned to bottom.
  const prevShouldAlignToBottomRef = useRef(
    alignToBottom && totalHeight < effectiveContainerHeight
  );
  const currentShouldAlignToBottom = alignToBottom && totalHeight < effectiveContainerHeight;

  useEffect(() => {
    const wasFittingInViewport = prevShouldAlignToBottomRef.current;
    const nowNeedsScroll = !currentShouldAlignToBottom && alignToBottom;

    // Layout mode switched from flex-end (fit in viewport) to flex-start (needs scroll)
    if (wasFittingInViewport && nowNeedsScroll && stickyBottom.shouldAutoScroll) {
      const maxScroll = totalHeight - effectiveContainerHeight;
      if (maxScroll > 0) {
        // CRITICAL FIX: When transitioning from fitting to scrolling, we MUST SNAP to bottom immediately.
        // Using smooth scroll here causes a visual "jump" (0 -> max) behavior if the animation starts from 0.
        // We force the scroll anchor to the end instantly to maintain "stickiness".
        setScrollAnchor({
          index: data.length - 1,
          offset: SCROLL_TO_ITEM_END,
        });
        // Important: Force pending scroll top to prevent smooth scroll fighting back
        setPendingScrollTop(maxScroll);
      }
    }

    prevShouldAlignToBottomRef.current = currentShouldAlignToBottom;
  }, [
    currentShouldAlignToBottom,
    alignToBottom,
    stickyBottom.shouldAutoScroll,
    totalHeight,
    effectiveContainerHeight,
    setScrollAnchor,
    data.length,
    setPendingScrollTop,
  ]);

  // Auto-scroll when in auto/locked mode and new content arrives
  useEffect(() => {
    if (stickyBottom.shouldAutoScroll && data.length > 0) {
      // Only scroll if we actually need scrolling (content exceeds viewport)
      const maxScroll = totalHeight - effectiveContainerHeight;
      if (maxScroll > 0) {
        setScrollAnchor({
          index: data.length - 1,
          offset: SCROLL_TO_ITEM_END,
        });
      }
    }
  }, [
    data.length,
    stickyBottom.shouldAutoScroll,
    totalHeight,
    effectiveContainerHeight,
    setScrollAnchor,
  ]);

  // Reset overscroll when content changes
  useEffect(() => {
    if (scrollPastEnd.isOverscrolled) {
      scrollPastEnd.resetOverscroll();
    }
  }, [scrollPastEnd.isOverscrolled, scrollPastEnd.resetOverscroll]);

  // Notify parent of scroll changes and dimension updates
  useEffect(() => {
    onScrollStateChange?.({
      scrollTop: anchorScrollTop,
      scrollHeight: totalHeight,
      innerHeight: effectiveContainerHeight,
      followMode: stickyBottom.followMode,
      newMessageCount: stickyBottom.newMessageCount,
    });
  }, [
    anchorScrollTop,
    onScrollStateChange,
    totalHeight,
    effectiveContainerHeight,
    stickyBottom.newMessageCount,
    stickyBottom.followMode,
  ]);

  // Notify parent of sticking state changes
  useEffect(() => {
    if (onStickingToBottomChange) {
      onStickingToBottomChange(isStickingToBottom);
    }
  }, [isStickingToBottom, onStickingToBottomChange]);

  // Imperative handle for external control
  const scrollTo = useCallback(
    (offset: number) => {
      const maxScroll = Math.max(0, totalHeight - effectiveContainerHeight);
      const newScrollTop = Math.max(0, Math.min(maxScroll, offset));
      stickyBottom.handleScroll(newScrollTop - getScrollTop(), "programmatic", newScrollTop);
      setIsStickingToBottom(newScrollTop >= maxScroll);
      if (enableSmoothScroll) {
        smoothScroll.jumpTo(newScrollTop);
      } else {
        setPendingScrollTop(newScrollTop);
        setScrollAnchor(getAnchorForScrollTop(newScrollTop));
      }
    },
    [
      totalHeight,
      effectiveContainerHeight,
      stickyBottom,
      getScrollTop,
      setIsStickingToBottom,
      enableSmoothScroll,
      smoothScroll,
      setPendingScrollTop,
      setScrollAnchor,
      getAnchorForScrollTop,
    ]
  );

  useScrollbarDrag({
    containerRef,
    enabled: enableMouseInteraction,
    scrollTop: anchorScrollTop,
    maxScroll: Math.max(0, totalHeight - effectiveContainerHeight),
    viewportHeight: effectiveContainerHeight,
    scrollTo,
  });

  useImperativeHandle(
    ref,
    () => ({
      scrollBy: (delta: number) => {
        const currentScrollTop = getScrollTop();
        const maxScroll = totalHeight - effectiveContainerHeight;
        const newScrollTop = Math.max(0, Math.min(maxScroll, currentScrollTop + delta));

        // Handle overscroll when at bottom
        if (enableScrollPastEnd && currentScrollTop >= maxScroll && delta > 0) {
          scrollPastEnd.handleOverscroll(scrollPastEnd.overscrollAmount + delta);
          return;
        }

        scrollTo(newScrollTop);
      },

      scrollTo,

      scrollToEnd: () => {
        // Use scrollToBottomAndLock for explicit "go to bottom" action
        stickyBottom.scrollToBottomAndLock();
        setIsStickingToBottom(true);
        scrollPastEnd.resetOverscroll();

        if (data.length > 0) {
          if (enableSmoothScroll) {
            smoothScroll.jumpTo(totalHeight - effectiveContainerHeight);
          } else {
            setScrollAnchor({
              index: data.length - 1,
              offset: SCROLL_TO_ITEM_END,
            });
          }
        }
      },

      scrollToIndex: ({ index, viewOffset = 0, viewPosition = 0 }) => {
        const offset = offsets[index];
        if (offset !== undefined) {
          const newScrollTop = Math.max(
            0,
            Math.min(
              totalHeight - effectiveContainerHeight,
              offset - viewPosition * effectiveContainerHeight + viewOffset
            )
          );
          scrollTo(newScrollTop);
        }
      },

      scrollToItem: ({ item, viewOffset = 0, viewPosition = 0 }) => {
        const index = data.indexOf(item);
        if (index !== -1) {
          const offset = offsets[index];
          if (offset !== undefined) {
            const newScrollTop = Math.max(
              0,
              Math.min(
                totalHeight - effectiveContainerHeight,
                offset - viewPosition * effectiveContainerHeight + viewOffset
              )
            );
            scrollTo(newScrollTop);
          }
        }
      },

      getScrollIndex: () => scrollAnchor.index,

      getViewportBounds: () => {
        const bounds = getVisibleClickBounds(containerRef.current);
        return bounds
          ? {
              top: bounds.top - 1,
              left: bounds.left - 1,
              width: bounds.width,
              height: bounds.height,
            }
          : null;
      },
      getScrollState: () => ({
        scrollTop: getScrollTop(),
        scrollHeight: totalHeight,
        innerHeight: effectiveContainerHeight,
      }),

      isAtBottom: () => stickyBottom.isAtBottom,

      forceRemeasure: () => {
        triggerMeasure();
      },

      // =====================================================================
      // New APIs (v2.0)
      // =====================================================================

      /** Get current follow mode state */
      getFollowMode: () => stickyBottom.followMode,

      /** Get new message count (accumulated while follow is off) */
      getNewMessageCount: () => stickyBottom.newMessageCount,

      /** Clear new message count (e.g., when banner is dismissed) */
      clearNewMessageCount: () => stickyBottom.clearNewMessageCount(),

      /** Handle wheel scroll event */
      handleWheel: (delta: number) => {
        stickyBottom.handleScroll(delta, "wheel");
      },

      /** Handle keyboard scroll event */
      handleKeyboardScroll: (delta: number) => {
        stickyBottom.handleScroll(delta, "keyboard");
      },

      /** Get anchor manager for external anchor control */
      getAnchorManager: () => anchorManager,

      /** Current overscroll amount (for scroll past end) */
      getOverscrollAmount: () => scrollPastEnd.overscrollAmount,

      /** Start bounce-back animation */
      startBounce: () => scrollPastEnd.startBounce(),

      /** Check if smooth scroll animation is in progress */
      isAnimating: () => smoothScroll.isAnimating,

      /** Stop smooth scroll animation */
      stopAnimation: () => smoothScroll.stop(),
    }),
    [
      offsets,
      containerRef,
      scrollAnchor,
      totalHeight,
      data,
      effectiveContainerHeight,
      getScrollTop,
      setScrollAnchor,
      triggerMeasure,
      stickyBottom,
      smoothScroll,
      scrollPastEnd,
      anchorManager,
      enableSmoothScroll,
      enableScrollPastEnd,
      scrollTo,
      setIsStickingToBottom,
    ]
  );

  // Create ref callback wrapper (now id-based for stable refs across insertions/deletions)
  const createItemRef = useCallback((id: string) => setItemRef(id), [setItemRef]);

  // Render visible items (virtualization: only items in startIndex..endIndex)
  const renderedItems = useMemo(() => {
    const items: React.ReactElement[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const item = data[i];
      if (item) {
        const id = keyExtractor(item, i);
        const itemOffset = offsets[i] ?? 0;
        const itemHeight = (offsets[i + 1] ?? totalHeight) - itemOffset;
        const relativeTop = itemOffset - renderScrollTop;
        items.push(
          <Box key={id} width="100%" ref={createItemRef(id)}>
            <VirtualizedItemPositionProvider
              position={{ index: i, relativeTop, height: itemHeight }}
            >
              {renderItem({ item, index: i })}
            </VirtualizedItemPositionProvider>
          </Box>
        );
      }
    }
    return items;
  }, [
    startIndex,
    endIndex,
    data,
    keyExtractor,
    renderItem,
    createItemRef,
    offsets,
    renderScrollTop,
    totalHeight,
  ]);

  // Spacer heights for proper scroll position (from useVirtualization)
  const { topSpacerHeight, bottomSpacerHeight } = useMemo(() => {
    const top = offsets[startIndex] ?? 0;
    const bottom = totalHeight - (offsets[endIndex + 1] ?? totalHeight);
    return { topSpacerHeight: top, bottomSpacerHeight: bottom };
  }, [offsets, startIndex, endIndex, totalHeight]);

  // Use native scroll when content exceeds viewport
  const effectiveScrollTop = renderScrollTop;
  const alignToBottomSpacerHeight =
    alignToBottom && !needsScroll
      ? Math.max(0, Math.round(effectiveContainerHeight - totalHeight))
      : 0;

  return (
    <Box
      ref={containerRef as React.RefObject<DOMElement>}
      overflowY="scroll"
      overflowX="hidden"
      scrollTop={effectiveScrollTop}
      scrollbarThumbColor={scrollbarThumbColor ?? "gray"}
      width="100%"
      height="100%"
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      paddingRight={1}
    >
      <Box flexShrink={0} width="100%" flexDirection="column">
        {/* Align short content to bottom when requested */}
        {alignToBottomSpacerHeight > 0 && <Box height={alignToBottomSpacerHeight} flexShrink={0} />}
        {/* Top spacer for items above visible range */}
        <Box height={topSpacerHeight} flexShrink={0} />
        {/* Visible items only */}
        {renderedItems}
        {/* Bottom spacer for items below visible range */}
        <Box height={bottomSpacerHeight} flexShrink={0} />
      </Box>
    </Box>
  );
}

/**
 * VirtualizedList with forwardRef support for generic types.
 */
const VirtualizedList = forwardRef(VirtualizedListInner) as <T>(
  props: VirtualizedListProps<T> & { ref?: React.Ref<VirtualizedListRef<T>> }
) => React.ReactElement;

// Add display name for debugging
(VirtualizedList as React.FC).displayName = "VirtualizedList";

export type { VirtualizedListProps, VirtualizedListRef };
export { VirtualizedList };
