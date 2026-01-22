/**
 * useScrollAnchor Hook
 *
 * Manages scroll position as an anchor (index + offset) for stability
 * during content changes. This approach is more robust than pure pixel-based
 * scrolling when items resize or new items are added.
 *
 * @module tui/components/common/VirtualizedList/hooks/useScrollAnchor
 */

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { SCROLL_TO_ITEM_END, type ScrollAnchor } from "../types.js";

/**
 * Props for the useScrollAnchor hook.
 */
export interface UseScrollAnchorProps {
  /** Number of data items */
  readonly dataLength: number;
  /** Array of cumulative offsets for each item */
  readonly offsets: readonly number[];
  /** Array of measured or estimated heights */
  readonly heights: readonly number[];
  /** Total height of all content */
  readonly totalHeight: number;
  /** Height of the visible container */
  readonly containerHeight: number;
  /** Initial scroll index */
  readonly initialScrollIndex?: number;
  /** Initial offset within the scroll index */
  readonly initialScrollOffsetInIndex?: number;
}

/**
 * Return type for the useScrollAnchor hook.
 */
export interface UseScrollAnchorReturn {
  /** Current scroll anchor */
  readonly scrollAnchor: ScrollAnchor;
  /** Set the scroll anchor directly */
  readonly setScrollAnchor: (anchor: ScrollAnchor) => void;
  /** Whether currently sticking to bottom (auto-scroll enabled) */
  readonly isStickingToBottom: boolean;
  /** Set sticking to bottom state */
  readonly setIsStickingToBottom: (value: boolean) => void;
  /** Computed pixel scroll position from anchor */
  readonly scrollTop: number;
  /** Get anchor for a given scroll position */
  readonly getAnchorForScrollTop: (scrollTop: number) => ScrollAnchor;
}

/**
 * Find the last index where predicate returns true.
 */
function findLastIndex<T>(
  array: readonly T[],
  predicate: (value: T, index: number) => boolean
): number {
  for (let i = array.length - 1; i >= 0; i--) {
    const item = array[i];
    if (item !== undefined && predicate(item, i)) {
      return i;
    }
  }
  return -1;
}

/**
 * Hook for managing scroll position as an anchor.
 *
 * @param props - Configuration for scroll anchor behavior
 * @returns Scroll anchor state and utilities
 */
export function useScrollAnchor(props: UseScrollAnchorProps): UseScrollAnchorReturn {
  const {
    dataLength,
    offsets,
    heights,
    totalHeight,
    containerHeight,
    initialScrollIndex,
    initialScrollOffsetInIndex,
  } = props;

  // Initialize scroll anchor based on initial props
  const [scrollAnchor, setScrollAnchor] = useState<ScrollAnchor>(() => {
    const scrollToEnd =
      initialScrollIndex === SCROLL_TO_ITEM_END ||
      (typeof initialScrollIndex === "number" &&
        initialScrollIndex >= dataLength - 1 &&
        initialScrollOffsetInIndex === SCROLL_TO_ITEM_END);

    if (scrollToEnd) {
      return {
        index: dataLength > 0 ? dataLength - 1 : 0,
        offset: SCROLL_TO_ITEM_END,
      };
    }

    if (typeof initialScrollIndex === "number") {
      return {
        index: Math.max(0, Math.min(dataLength - 1, initialScrollIndex)),
        offset: initialScrollOffsetInIndex ?? 0,
      };
    }

    return { index: 0, offset: 0 };
  });

  // Track whether we're sticking to bottom (auto-scroll)
  const [isStickingToBottom, setIsStickingToBottom] = useState(() => {
    const scrollToEnd =
      initialScrollIndex === SCROLL_TO_ITEM_END ||
      (typeof initialScrollIndex === "number" &&
        initialScrollIndex >= dataLength - 1 &&
        initialScrollOffsetInIndex === SCROLL_TO_ITEM_END);
    return scrollToEnd;
  });

  // Track if initial scroll has been set
  const isInitialScrollSet = useRef(false);

  // Convert scroll position to anchor
  // FIX: Added bounds validation to prevent invalid anchor indices
  const getAnchorForScrollTop = useCallback(
    (scrollTop: number): ScrollAnchor => {
      // Handle edge cases
      if (dataLength === 0) {
        return { index: 0, offset: 0 };
      }
      if (scrollTop <= 0) {
        return { index: 0, offset: 0 };
      }

      const index = findLastIndex(offsets, (offset) => offset <= scrollTop);
      if (index === -1) {
        return { index: 0, offset: 0 };
      }

      // FIX: Ensure index is within valid bounds
      const safeIndex = Math.max(0, Math.min(dataLength - 1, index));
      const offsetValue = offsets[safeIndex] ?? 0;
      const itemHeight = heights[safeIndex] ?? 0;

      // FIX: Clamp offset to be within the item's height
      const rawOffset = scrollTop - offsetValue;
      const safeOffset = Math.max(0, Math.min(itemHeight, rawOffset));

      return { index: safeIndex, offset: safeOffset };
    },
    [offsets, dataLength, heights]
  );

  // Compute pixel scroll position from anchor
  const scrollTop = (() => {
    const offset = offsets[scrollAnchor.index];
    if (typeof offset !== "number") {
      return 0;
    }

    if (scrollAnchor.offset === SCROLL_TO_ITEM_END) {
      const itemHeight = heights[scrollAnchor.index] ?? 0;
      return Math.max(0, offset + itemHeight - containerHeight);
    }

    return Math.max(0, offset + scrollAnchor.offset);
  })();

  // Track previous values for auto-scroll logic
  const prevDataLength = useRef(dataLength);
  const prevTotalHeight = useRef(totalHeight);
  const prevScrollTop = useRef(scrollTop);
  const prevContainerHeight = useRef(containerHeight);

  // Handle auto-scroll and anchor adjustments
  useLayoutEffect(() => {
    const contentPreviouslyFit = prevTotalHeight.current <= prevContainerHeight.current;
    const wasScrolledToBottomPixels =
      prevScrollTop.current >= prevTotalHeight.current - prevContainerHeight.current - 1;
    const wasAtBottom = contentPreviouslyFit || wasScrolledToBottomPixels;

    // If the user was at the bottom, they are now sticking
    if (wasAtBottom && scrollTop >= prevScrollTop.current) {
      setIsStickingToBottom(true);
    }

    const listGrew = dataLength > prevDataLength.current;
    const containerChanged = prevContainerHeight.current !== containerHeight;
    // Detect content height growth (triggers during streaming output)
    const contentHeightGrew = totalHeight > prevTotalHeight.current;

    // Scroll to end conditions:
    // 1. List grew AND we were already at the bottom (or sticking)
    // 2. We are sticking to bottom AND container size changed
    // 3. We are sticking to bottom AND content height grew (streaming content)
    if (
      (listGrew && (isStickingToBottom || wasAtBottom)) ||
      (isStickingToBottom && containerChanged) ||
      (isStickingToBottom && contentHeightGrew)
    ) {
      setScrollAnchor({
        index: dataLength > 0 ? dataLength - 1 : 0,
        offset: SCROLL_TO_ITEM_END,
      });
      if (!isStickingToBottom) {
        setIsStickingToBottom(true);
      }
    }
    // List shrunk or scroll position is invalid
    else if (
      (scrollAnchor.index >= dataLength || scrollTop > totalHeight - containerHeight) &&
      dataLength > 0
    ) {
      const newScrollTop = Math.max(0, totalHeight - containerHeight);
      setScrollAnchor(getAnchorForScrollTop(newScrollTop));
    } else if (dataLength === 0) {
      // List is empty, reset to top
      setScrollAnchor({ index: 0, offset: 0 });
    }

    // Update refs for next render
    prevDataLength.current = dataLength;
    prevTotalHeight.current = totalHeight;
    prevScrollTop.current = scrollTop;
    prevContainerHeight.current = containerHeight;
  }, [
    dataLength,
    totalHeight,
    scrollTop,
    containerHeight,
    scrollAnchor.index,
    getAnchorForScrollTop,
    isStickingToBottom,
  ]);

  // Handle initial scroll position
  useLayoutEffect(() => {
    if (
      isInitialScrollSet.current ||
      offsets.length <= 1 ||
      totalHeight <= 0 ||
      containerHeight <= 0
    ) {
      return;
    }

    if (typeof initialScrollIndex === "number") {
      const scrollToEnd =
        initialScrollIndex === SCROLL_TO_ITEM_END ||
        (initialScrollIndex >= dataLength - 1 && initialScrollOffsetInIndex === SCROLL_TO_ITEM_END);

      if (scrollToEnd) {
        setScrollAnchor({
          index: dataLength - 1,
          offset: SCROLL_TO_ITEM_END,
        });
        setIsStickingToBottom(true);
        isInitialScrollSet.current = true;
        return;
      }

      const index = Math.max(0, Math.min(dataLength - 1, initialScrollIndex));
      const offset = initialScrollOffsetInIndex ?? 0;
      const newScrollTop = (offsets[index] ?? 0) + offset;

      const clampedScrollTop = Math.max(0, Math.min(totalHeight - containerHeight, newScrollTop));

      setScrollAnchor(getAnchorForScrollTop(clampedScrollTop));
      isInitialScrollSet.current = true;
    }
  }, [
    initialScrollIndex,
    initialScrollOffsetInIndex,
    offsets,
    totalHeight,
    containerHeight,
    getAnchorForScrollTop,
    dataLength,
  ]);

  return {
    scrollAnchor,
    setScrollAnchor,
    isStickingToBottom,
    setIsStickingToBottom,
    scrollTop,
    getAnchorForScrollTop,
  };
}
