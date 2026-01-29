/**
 * VirtualizedList Component
 *
 * A high-performance virtualized list component for terminal UIs.
 * Only renders items that are currently visible in the viewport,
 * with support for variable height items and auto-scroll to bottom.
 *
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useScrollOptional } from "../../../context/ScrollContext.js";
import { tuiConfig } from "../../theme/tokens.js";
import {
  type FollowMode,
  useBatchedScroll,
  useScrollAnchor,
  useScrollPastEnd,
  useSmoothScroll,
  useStickyBottom,
  useVirtualization,
} from "./hooks/index.js";
import { useAnchorManager } from "./scrollAnchorAPI.js";
import { SCROLL_TO_ITEM_END, type VirtualizedListProps, type VirtualizedListRef } from "./types.js";

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
    onScrollTopChange,
    onStickingToBottomChange,
    onFollowModeChange,
    alignToBottom = false,
    isStreaming = false,
    enableSmoothScroll = true,
    enableScrollPastEnd = false,
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

  // ScrollTop used by the virtualization window (kept in sync with anchor scrollTop).
  const [virtualScrollTop, setVirtualScrollTop] = useState(0);

  // Virtualization with actual scroll position
  const {
    heights: _heights,
    offsets,
    totalHeight,
    startIndex,
    endIndex,
    // Note: spacer heights not used in Ink (no real scroll support)
    // topSpacerHeight and bottomSpacerHeight are kept in hook for API compat
    setItemRef,
    containerRef,
    measuredContainerHeight,
    triggerMeasure,
    blockSumsState,
  } = useVirtualization({
    data,
    keyExtractor,
    estimatedItemHeight,
    scrollTop: virtualScrollTop,
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

  // Keep virtualization scrollTop in sync with the anchor-derived scrollTop.
  useLayoutEffect(() => {
    if (Math.abs(anchorScrollTop - virtualScrollTop) > 0.5) {
      setVirtualScrollTop(anchorScrollTop);
    }
  }, [anchorScrollTop, virtualScrollTop]);

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
  });

  // Smooth scroll animation
  const smoothScroll = useSmoothScroll({
    targetScrollTop: anchorScrollTop,
    maxScroll: totalHeight - effectiveContainerHeight,
    enabled: enableSmoothScroll,
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
    enableSmoothScroll,
    smoothScroll,
    setScrollAnchor,
    data.length,
  ]);

  // Auto-scroll when in auto/locked mode and new content arrives
  useEffect(() => {
    if (stickyBottom.shouldAutoScroll && data.length > 0) {
      // Only scroll if we actually need scrolling (content exceeds viewport)
      const maxScroll = totalHeight - effectiveContainerHeight;
      if (maxScroll > 0) {
        if (enableSmoothScroll) {
          // Use smooth scroll for animated transition
          smoothScroll.jumpTo(maxScroll);
        } else {
          // Direct scroll
          setScrollAnchor({
            index: data.length - 1,
            offset: SCROLL_TO_ITEM_END,
          });
        }
      }
    }
  }, [
    data.length,
    stickyBottom.shouldAutoScroll,
    enableSmoothScroll,
    smoothScroll,
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
    if (onScrollTopChange) {
      onScrollTopChange(anchorScrollTop);
    }
  }, [anchorScrollTop, onScrollTopChange]);

  // Notify parent of sticking state changes
  useEffect(() => {
    if (onStickingToBottomChange) {
      onStickingToBottomChange(isStickingToBottom);
    }
  }, [isStickingToBottom, onStickingToBottomChange]);

  // Imperative handle for external control
  useImperativeHandle(
    ref,
    () => ({
      scrollBy: (delta: number) => {
        // Track scroll direction for sticky bottom FSM
        stickyBottom.handleScroll(delta, "programmatic");

        const currentScrollTop = getScrollTop();
        const maxScroll = totalHeight - effectiveContainerHeight;
        const newScrollTop = Math.max(0, Math.min(maxScroll, currentScrollTop + delta));

        // Handle overscroll when at bottom
        if (enableScrollPastEnd && currentScrollTop >= maxScroll && delta > 0) {
          scrollPastEnd.handleOverscroll(scrollPastEnd.overscrollAmount + delta);
          return;
        }

        if (enableSmoothScroll) {
          smoothScroll.jumpTo(newScrollTop);
        } else {
          setPendingScrollTop(newScrollTop);
          setScrollAnchor(getAnchorForScrollTop(newScrollTop));
        }
      },

      scrollTo: (offset: number) => {
        stickyBottom.handleScroll(offset - anchorScrollTop, "programmatic");
        const newScrollTop = Math.max(
          0,
          Math.min(totalHeight - effectiveContainerHeight, offset)
        );

        if (enableSmoothScroll) {
          smoothScroll.jumpTo(newScrollTop);
        } else {
          setPendingScrollTop(newScrollTop);
          setScrollAnchor(getAnchorForScrollTop(newScrollTop));
        }
      },

      scrollToEnd: () => {
        // Use scrollToBottomAndLock for explicit "go to bottom" action
        stickyBottom.scrollToBottomAndLock();
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
          stickyBottom.handleScroll(newScrollTop - anchorScrollTop, "programmatic");

          if (enableSmoothScroll) {
            smoothScroll.jumpTo(newScrollTop);
          } else {
            setPendingScrollTop(newScrollTop);
            setScrollAnchor(getAnchorForScrollTop(newScrollTop));
          }
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
            stickyBottom.handleScroll(newScrollTop - anchorScrollTop, "programmatic");

            if (enableSmoothScroll) {
              smoothScroll.jumpTo(newScrollTop);
            } else {
              setPendingScrollTop(newScrollTop);
              setScrollAnchor(getAnchorForScrollTop(newScrollTop));
            }
          }
        }
      },

      getScrollIndex: () => scrollAnchor.index,

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
      scrollAnchor,
      anchorScrollTop,
      totalHeight,
      getAnchorForScrollTop,
      data,
      effectiveContainerHeight,
      getScrollTop,
      setPendingScrollTop,
      setScrollAnchor,
      triggerMeasure,
      stickyBottom,
      smoothScroll,
      scrollPastEnd,
      anchorManager,
      enableSmoothScroll,
      enableScrollPastEnd,
    ]
  );

  // ==========================================================================
  // ScrollContext Integration
  // ==========================================================================
  const scrollContext = useScrollOptional();
  const lastReportedScrollTop = useRef<number>(anchorScrollTop);
  const lastReportedDimensions = useRef({
    totalHeight: -1,
    containerHeight: -1,
  });

  // Report dimensions to ScrollContext when they change
  useEffect(() => {
    if (!scrollContext) {
      return;
    }
    if (
      lastReportedDimensions.current.totalHeight === totalHeight &&
      lastReportedDimensions.current.containerHeight === effectiveContainerHeight
    ) {
      return;
    }
    lastReportedDimensions.current = {
      totalHeight,
      containerHeight: effectiveContainerHeight,
    };
    scrollContext.updateDimensions(totalHeight, effectiveContainerHeight);
  }, [scrollContext, totalHeight, effectiveContainerHeight]);

  // Sync internal scrollTop changes to ScrollContext (debounced to avoid loops)
  useEffect(() => {
    if (scrollContext && anchorScrollTop !== lastReportedScrollTop.current) {
      lastReportedScrollTop.current = anchorScrollTop;
      // Only sync if the context's scrollTop differs significantly
      const contextScrollTop = scrollContext.state.scrollTop;
      if (Math.abs(anchorScrollTop - contextScrollTop) > 1) {
        scrollContext.scrollTo(anchorScrollTop);
      }
    }
  }, [scrollContext, anchorScrollTop]);

  // Listen for external scroll commands from ScrollContext
  useEffect(() => {
    if (!scrollContext) return;

    const unsubscribe = scrollContext.onScrollChange((externalScrollTop) => {
      // Avoid reacting to our own updates
      if (Math.abs(externalScrollTop - anchorScrollTop) <= 1) return;

      // Apply external scroll command
      const newScrollTop = Math.max(
        0,
        Math.min(totalHeight - effectiveContainerHeight, externalScrollTop)
      );
      setPendingScrollTop(newScrollTop);
      setScrollAnchor(getAnchorForScrollTop(newScrollTop));

      // Update sticking state based on position
      const atBottom = newScrollTop >= totalHeight - effectiveContainerHeight - 1;
      setIsStickingToBottom(atBottom);
    });

    return unsubscribe;
  }, [
    scrollContext,
    anchorScrollTop,
    totalHeight,
    effectiveContainerHeight,
    setPendingScrollTop,
    setScrollAnchor,
    getAnchorForScrollTop,
    setIsStickingToBottom,
  ]);

  // Respond to scrollToBottom via context state changes
  useEffect(() => {
    if (scrollContext?.state.isAtBottom && !isStickingToBottom && data.length > 0) {
      // Context indicates we should be at bottom but we're not sticking
      // This happens when scrollToBottom() is called on the context
      setIsStickingToBottom(true);
      setScrollAnchor({
        index: data.length - 1,
        offset: SCROLL_TO_ITEM_END,
      });
    }
  }, [
    scrollContext?.state.isAtBottom,
    isStickingToBottom,
    data.length,
    setIsStickingToBottom,
    setScrollAnchor,
  ]);

  // Create ref callback wrapper (now id-based for stable refs across insertions/deletions)
  const createItemRef = useCallback((id: string) => setItemRef(id), [setItemRef]);

  // FIX: When in follow mode with few messages, force rendering ALL messages (0 to last).
  // This prevents TWO bugs:
  // 1. startIndex skipping early messages due to over-estimated scrollTop
  // 2. endIndex not including the LAST message when scrollTop=0 but totalHeight > containerHeight
  //    (because endIndex is calculated as "first offset > scrollTop + containerHeight - 1")
  //
  // The second bug is why scrollbar appearing causes content to jump up - the newest
  // message isn't rendered because its offset exceeds the calculated viewport!
  const FORCE_RENDER_ALL_THRESHOLD = 20; // Render all if fewer than this many messages
  const forceRenderAll = stickyBottom.shouldAutoScroll && data.length <= FORCE_RENDER_ALL_THRESHOLD;
  const effectiveStartIndex = forceRenderAll ? 0 : startIndex;
  const effectiveEndIndex = forceRenderAll ? data.length - 1 : endIndex;

  // Render visible items
  const renderedItems = useMemo(() => {
    const items: React.ReactElement[] = [];
    for (let i = effectiveStartIndex; i <= effectiveEndIndex; i++) {
      const item = data[i];
      if (item) {
        const id = keyExtractor(item, i);
        items.push(
          <Box key={id} width="100%" ref={createItemRef(id)}>
            {renderItem({ item, index: i })}
          </Box>
        );
      }
    }
    return items;
  }, [effectiveStartIndex, effectiveEndIndex, data, keyExtractor, renderItem, createItemRef]);

  // Note: scrollbarThumbColor and scrollTop are reserved for future native scroll support
  // Standard Ink doesn't support overflowY="scroll", only "hidden" or "visible"
  // Gemini CLI uses a forked Ink (@jrichman/ink) with scroll support
  void scrollbarThumbColor;

  // CRITICAL: Ink doesn't support real CSS scrolling.
  // overflow="hidden" just clips content, it doesn't scroll.
  // We must NOT use spacers - instead, render visible items directly at the top.
  // The "scrolling" effect is achieved by changing which items are rendered (startIndex/endIndex).
  //
  // For alignToBottom: use justifyContent="flex-end" to push content to bottom
  // when total content height is less than container height.
  //
  // FIX: Expert analysis identified that estimated totalHeight can be unstable during streaming,
  // causing incorrect shouldAlignToBottom decisions. The height estimates can be wildly off
  // due to ANSI codes, wrap width miscalculation, or streaming content changes.
  //
  // CRITICAL INSIGHT: The root cause of "floating in middle" is:
  // 1. When totalHeight is OVER-estimated, scrollTop = totalHeight - containerHeight is large
  // 2. This causes startIndex to skip early messages (they're "above" the viewport)
  // 3. But actual rendered content is less than containerHeight
  // 4. With flex-start, content sits at top with blank space below
  //
  // Solution: When in follow mode (shouldAutoScroll), ALWAYS use flex-end.
  // This ensures content sticks to bottom even when estimates are wrong.
  // Only use flex-start when user has manually scrolled up (not following).
  const renderingFromStart = startIndex === 0;
  const estimatedContentFits = totalHeight < effectiveContainerHeight;
  const inFollowMode = stickyBottom.shouldAutoScroll;

  // Use flex-end when:
  // - alignToBottom is requested AND
  // - EITHER content fits OR we're in follow mode (following new content)
  // Only use flex-start when user has scrolled up and is NOT following
  const shouldAlignToBottom = alignToBottom && (estimatedContentFits || inFollowMode);

  // Debug logging removed (was noisy in production).

  return (
    <Box
      ref={containerRef as React.RefObject<DOMElement>}
      overflowY="hidden"
      overflowX="hidden"
      width="100%"
      height="100%"
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      paddingRight={1}
      justifyContent={shouldAlignToBottom ? "flex-end" : "flex-start"}
    >
      <Box flexShrink={0} width="100%" flexDirection="column">
        {/* Render visible items directly - no spacers needed in Ink */}
        {/* In Ink, "scrolling" = changing which items we render */}
        {renderedItems}
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

export { VirtualizedList };
export type { VirtualizedListProps, VirtualizedListRef };
