/**
 * useScrollAnchor Hook
 *
 * Manages scroll position as an anchor (index + offset) for stability
 * during content changes. This approach is more robust than pure pixel-based
 * scrolling when items resize or new items are added.
 *
 * Features:
 * - O(1) anchor compensation when item heights change (using Block Sums)
 * - Automatic scrollTop adjustment to prevent visual "jumping"
 * - Binary search anchor determination for efficient lookups
 *
 * @module tui/components/common/VirtualizedList/hooks/useScrollAnchor
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SCROLL_TO_ITEM_END, type ScrollAnchor } from "../types.js";
import { type BlockSumsState, computeAnchorDelta, prefixSum } from "../utils/blockSums.js";

/** Minimum compensation threshold to avoid floating-point noise */
const COMPENSATION_THRESHOLD = 0.5;

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
  /** Block sums state for O(1) anchor compensation (optional for backward compat) */
  readonly blockSumsState?: BlockSumsState;
  /** Enable anchor compensation (default: true when blockSumsState provided) */
  readonly enableCompensation?: boolean;
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
  /** Current anchor index (viewport top item) */
  readonly anchorIndex: number;
  /** Offset within the anchor item (pixels) */
  readonly anchorOffset: number;
}

/**
 * Compute anchor index using binary search on Block Sums.
 * O(log n) complexity with O(n/BLOCK_SIZE + BLOCK_SIZE) prefix sum queries.
 *
 * @param scrollTop - Current scroll position in pixels
 * @param blockSumsState - Block sums state for efficient prefix queries
 * @param dataLength - Number of items in the list
 * @returns Anchor index and offset within that item
 */
function computeAnchorFromBlockSums(
  scrollTop: number,
  blockSumsState: BlockSumsState,
  dataLength: number
): { index: number; offset: number } {
  // Edge cases
  if (dataLength === 0) {
    return { index: 0, offset: 0 };
  }
  if (scrollTop <= 0) {
    return { index: 0, offset: 0 };
  }

  // Binary search to find the item whose top edge is <= scrollTop
  // We want the LAST item where prefixSum(i) <= scrollTop
  let low = 0;
  let high = dataLength - 1;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    const itemTop = prefixSum(blockSumsState, mid);

    if (itemTop <= scrollTop) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const anchorIndex = low;
  const anchorTop = prefixSum(blockSumsState, anchorIndex);
  const offset = scrollTop - anchorTop;

  return { index: anchorIndex, offset: Math.max(0, offset) };
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
    blockSumsState,
    enableCompensation = true,
  } = props;

  // Determine if compensation should be active
  const compensationEnabled = enableCompensation && blockSumsState !== undefined;

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

    // If the user was at the bottom, keep sticking even when content shrinks.
    if (wasAtBottom && !isStickingToBottom) {
      setIsStickingToBottom(true);
    }

    const listGrew = dataLength > prevDataLength.current;
    const containerChanged = prevContainerHeight.current !== containerHeight;
    // Detect content height growth (triggers during streaming output)
    const contentHeightGrew = totalHeight > prevTotalHeight.current;
    const contentHeightShrank = totalHeight < prevTotalHeight.current;
    // FIX: Calculate the height delta for more aggressive follow mode
    const heightDelta = totalHeight - prevTotalHeight.current;

    // ENHANCEMENT: Detect if user is "near bottom" - within a few lines
    // This allows auto-follow to kick in even if not exactly at bottom
    const NEAR_BOTTOM_THRESHOLD = 20; // pixels (roughly 2-3 lines)
    const maxScrollTop = Math.max(0, totalHeight - containerHeight);
    const isNearBottom = scrollTop >= maxScrollTop - NEAR_BOTTOM_THRESHOLD;

    // Scroll to end conditions:
    // 1. List grew AND we were already at the bottom (or sticking)
    // 2. We are sticking to bottom AND container size changed
    // 3. We are sticking to bottom AND content height grew (streaming content)
    // 4. Content height grew AND we are near the bottom (auto-follow when close)
    // FIX: When sticking to bottom and content grows, ALWAYS jump to bottom immediately
    // This ensures follow mode works during streaming even with rapid content changes
    if (
      (listGrew && (isStickingToBottom || wasAtBottom)) ||
      (isStickingToBottom && containerChanged) ||
      (isStickingToBottom && contentHeightGrew && heightDelta > 0) ||
      (contentHeightShrank && (isStickingToBottom || wasAtBottom)) ||
      (contentHeightGrew && isNearBottom && !isStickingToBottom)
    ) {
      const atEnd =
        scrollAnchor.index === dataLength - 1 && scrollAnchor.offset === SCROLL_TO_ITEM_END;
      if (!atEnd) {
        setScrollAnchor({
          index: dataLength > 0 ? dataLength - 1 : 0,
          offset: SCROLL_TO_ITEM_END,
        });
      }
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
    scrollAnchor.offset,
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

  // ============================================================================
  // O(1) Anchor Compensation
  // ============================================================================
  // When heights of items BEFORE the anchor change (e.g., during streaming),
  // we need to adjust scrollTop to prevent visual "jumping".
  //
  // Algorithm:
  // 1. Track the prefix sum up to the anchor index
  // 2. When blockSumsState changes, compute delta = newPrefixSum - oldPrefixSum
  // 3. Adjust scrollAnchor offset by delta to maintain visual position

  // Track prefix sum at anchor for compensation calculation
  const prevAnchorPrefixRef = useRef<number>(0);

  // Compute current anchor using Block Sums when available, otherwise use scroll anchor
  const { index: anchorIndex, offset: anchorOffset } = (() => {
    if (blockSumsState && dataLength > 0) {
      // Use binary search on Block Sums for O(log n) anchor determination
      return computeAnchorFromBlockSums(scrollTop, blockSumsState, dataLength);
    }
    // Fallback: use the existing scroll anchor
    return {
      index: scrollAnchor.index,
      offset:
        scrollAnchor.offset === SCROLL_TO_ITEM_END
          ? (heights[scrollAnchor.index] ?? 0)
          : scrollAnchor.offset,
    };
  })();

  // Anchor compensation effect
  // This runs when blockSumsState changes (height updates) and adjusts scroll position
  useEffect(() => {
    // Skip if compensation is disabled or no Block Sums available
    if (!compensationEnabled || !blockSumsState) {
      return;
    }

    // Skip if no valid anchor or sticking to bottom (auto-scroll handles it)
    if (anchorIndex < 0 || isStickingToBottom) {
      // Still update the ref so we have a baseline for next time
      prevAnchorPrefixRef.current = prefixSum(blockSumsState, Math.max(0, anchorIndex));
      return;
    }

    // Compute current prefix sum at anchor
    const currentPrefix = prefixSum(blockSumsState, anchorIndex);

    // Compute delta using the efficient Block Sums function
    const delta = computeAnchorDelta(blockSumsState, prevAnchorPrefixRef.current, anchorIndex);

    // Only compensate if delta exceeds threshold (avoid floating-point noise)
    if (Math.abs(delta) > COMPENSATION_THRESHOLD) {
      // Adjust the anchor offset to compensate for the height change
      // This effectively keeps the same visual position on screen
      setScrollAnchor((prev) => {
        const baseOffset =
          prev.offset === SCROLL_TO_ITEM_END ? (heights[prev.index] ?? 0) : prev.offset;

        const newOffset = baseOffset + delta;

        // If compensation pushes us before this item, we need to adjust index
        if (newOffset < 0 && prev.index > 0) {
          // Use getAnchorForScrollTop to find the correct new anchor
          const newScrollTop = Math.max(0, scrollTop + delta);
          return getAnchorForScrollTop(newScrollTop);
        }

        // Clamp offset to valid range
        const maxOffset = heights[prev.index] ?? 0;
        const clampedOffset = Math.max(0, Math.min(maxOffset, newOffset));

        return {
          index: prev.index,
          offset: clampedOffset,
        };
      });
    }

    // Update reference for next comparison
    prevAnchorPrefixRef.current = currentPrefix;
  }, [
    blockSumsState,
    anchorIndex,
    compensationEnabled,
    isStickingToBottom,
    heights,
    scrollTop,
    getAnchorForScrollTop,
  ]);

  // Initialize prefix ref when compensation becomes enabled
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only run on enable/disable, not every state change
  useEffect(() => {
    if (compensationEnabled && blockSumsState && anchorIndex >= 0) {
      prevAnchorPrefixRef.current = prefixSum(blockSumsState, anchorIndex);
    }
  }, [compensationEnabled]);

  return {
    scrollAnchor,
    setScrollAnchor,
    isStickingToBottom,
    setIsStickingToBottom,
    scrollTop,
    getAnchorForScrollTop,
    anchorIndex,
    anchorOffset,
  };
}
