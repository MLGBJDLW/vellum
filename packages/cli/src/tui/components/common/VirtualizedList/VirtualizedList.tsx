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
  useMemo,
  useRef,
  useState,
} from "react";
import { useScrollOptional } from "../../../context/ScrollContext.js";
import { useBatchedScroll, useScrollAnchor, useVirtualization } from "./hooks/index.js";
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
    alignToBottom = false,
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
    const reservedLines = 10;
    return Math.max(8, (terminalRows || 24) - reservedLines);
  });

  // Initial virtualization pass with estimated heights
  const initialVirtualization = useVirtualization({
    dataLength: data.length,
    estimatedItemHeight,
    scrollTop: 0,
    containerHeight,
  });

  // Scroll anchor management
  const {
    scrollAnchor,
    setScrollAnchor,
    isStickingToBottom,
    setIsStickingToBottom,
    scrollTop,
    getAnchorForScrollTop,
  } = useScrollAnchor({
    dataLength: data.length,
    offsets: initialVirtualization.offsets,
    heights: initialVirtualization.heights,
    totalHeight: initialVirtualization.totalHeight,
    containerHeight,
    initialScrollIndex,
    initialScrollOffsetInIndex,
  });

  // Full virtualization with actual scroll position
  const {
    heights: _heights,
    offsets,
    totalHeight,
    startIndex,
    endIndex,
    // Note: spacer heights not used in Ink (no real scroll support)
    // topSpacerHeight and bottomSpacerHeight are kept in hook for API compat
    itemRefCallback,
    containerRef,
    measuredContainerHeight,
  } = useVirtualization({
    dataLength: data.length,
    estimatedItemHeight,
    scrollTop,
    containerHeight,
  });

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

        // Debounce the update to batch rapid changes
        containerHeightUpdateTimeoutRef.current = setTimeout(() => {
          lastValidHeightRef.current = safeHeight;
          setContainerHeight(safeHeight);
        }, 16); // One frame at 60fps
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
  const { getScrollTop, setPendingScrollTop } = useBatchedScroll(scrollTop);

  // Notify parent of scroll changes and dimension updates
  useEffect(() => {
    if (onScrollTopChange) {
      onScrollTopChange(scrollTop);
    }
  }, [scrollTop, onScrollTopChange]);

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
        if (delta < 0) {
          setIsStickingToBottom(false);
        }
        const currentScrollTop = getScrollTop();
        const newScrollTop = Math.max(
          0,
          Math.min(totalHeight - measuredContainerHeight, currentScrollTop + delta)
        );
        setPendingScrollTop(newScrollTop);
        setScrollAnchor(getAnchorForScrollTop(newScrollTop));
      },

      scrollTo: (offset: number) => {
        setIsStickingToBottom(false);
        const newScrollTop = Math.max(0, Math.min(totalHeight - measuredContainerHeight, offset));
        setPendingScrollTop(newScrollTop);
        setScrollAnchor(getAnchorForScrollTop(newScrollTop));
      },

      scrollToEnd: () => {
        setIsStickingToBottom(true);
        if (data.length > 0) {
          setScrollAnchor({
            index: data.length - 1,
            offset: SCROLL_TO_ITEM_END,
          });
        }
      },

      scrollToIndex: ({ index, viewOffset = 0, viewPosition = 0 }) => {
        setIsStickingToBottom(false);
        const offset = offsets[index];
        if (offset !== undefined) {
          const newScrollTop = Math.max(
            0,
            Math.min(
              totalHeight - measuredContainerHeight,
              offset - viewPosition * measuredContainerHeight + viewOffset
            )
          );
          setPendingScrollTop(newScrollTop);
          setScrollAnchor(getAnchorForScrollTop(newScrollTop));
        }
      },

      scrollToItem: ({ item, viewOffset = 0, viewPosition = 0 }) => {
        setIsStickingToBottom(false);
        const index = data.indexOf(item);
        if (index !== -1) {
          const offset = offsets[index];
          if (offset !== undefined) {
            const newScrollTop = Math.max(
              0,
              Math.min(
                totalHeight - measuredContainerHeight,
                offset - viewPosition * measuredContainerHeight + viewOffset
              )
            );
            setPendingScrollTop(newScrollTop);
            setScrollAnchor(getAnchorForScrollTop(newScrollTop));
          }
        }
      },

      getScrollIndex: () => scrollAnchor.index,

      getScrollState: () => ({
        scrollTop: getScrollTop(),
        scrollHeight: totalHeight,
        innerHeight: measuredContainerHeight,
      }),

      isAtBottom: () => isStickingToBottom,
    }),
    [
      offsets,
      scrollAnchor,
      totalHeight,
      getAnchorForScrollTop,
      data,
      measuredContainerHeight,
      getScrollTop,
      setPendingScrollTop,
      setScrollAnchor,
      setIsStickingToBottom,
      isStickingToBottom,
    ]
  );

  // ==========================================================================
  // ScrollContext Integration
  // ==========================================================================
  const scrollContext = useScrollOptional();
  const lastReportedScrollTop = useRef<number>(scrollTop);
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
      lastReportedDimensions.current.containerHeight === measuredContainerHeight
    ) {
      return;
    }
    lastReportedDimensions.current = {
      totalHeight,
      containerHeight: measuredContainerHeight,
    };
    scrollContext.updateDimensions(totalHeight, measuredContainerHeight);
  }, [scrollContext, totalHeight, measuredContainerHeight]);

  // Sync internal scrollTop changes to ScrollContext (debounced to avoid loops)
  useEffect(() => {
    if (scrollContext && scrollTop !== lastReportedScrollTop.current) {
      lastReportedScrollTop.current = scrollTop;
      // Only sync if the context's scrollTop differs significantly
      const contextScrollTop = scrollContext.state.scrollTop;
      if (Math.abs(scrollTop - contextScrollTop) > 1) {
        scrollContext.scrollTo(scrollTop);
      }
    }
  }, [scrollContext, scrollTop]);

  // Listen for external scroll commands from ScrollContext
  useEffect(() => {
    if (!scrollContext) return;

    const unsubscribe = scrollContext.onScrollChange((externalScrollTop) => {
      // Avoid reacting to our own updates
      if (Math.abs(externalScrollTop - scrollTop) <= 1) return;

      // Apply external scroll command
      const newScrollTop = Math.max(
        0,
        Math.min(totalHeight - measuredContainerHeight, externalScrollTop)
      );
      setPendingScrollTop(newScrollTop);
      setScrollAnchor(getAnchorForScrollTop(newScrollTop));

      // Update sticking state based on position
      const atBottom = newScrollTop >= totalHeight - measuredContainerHeight - 1;
      setIsStickingToBottom(atBottom);
    });

    return unsubscribe;
  }, [
    scrollContext,
    scrollTop,
    totalHeight,
    measuredContainerHeight,
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

  // Create ref callback wrapper
  const createItemRef = useCallback(
    (index: number) => (el: DOMElement | null) => {
      itemRefCallback(index, el);
    },
    [itemRefCallback]
  );

  // Render visible items
  const renderedItems = useMemo(() => {
    const items: React.ReactElement[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const item = data[i];
      if (item) {
        items.push(
          <Box key={keyExtractor(item, i)} width="100%" ref={createItemRef(i)}>
            {renderItem({ item, index: i })}
          </Box>
        );
      }
    }
    return items;
  }, [startIndex, endIndex, data, keyExtractor, renderItem, createItemRef]);

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
  const shouldAlignToBottom = alignToBottom && totalHeight < measuredContainerHeight;

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
