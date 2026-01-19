/**
 * useVirtualization Hook
 *
 * Manages height calculations, measurement, and visible range computation
 * for virtualized list rendering.
 *
 * @module tui/components/common/VirtualizedList/hooks/useVirtualization
 */

import type { DOMElement } from "ink";
import { measureElement } from "ink";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * Props for the useVirtualization hook.
 */
export interface UseVirtualizationProps {
  /** Number of data items */
  readonly dataLength: number;
  /** Function or fixed value for estimated item height */
  readonly estimatedItemHeight: number | ((index: number) => number);
  /** Current scroll position in pixels */
  readonly scrollTop: number;
  /** Height of the visible container */
  readonly containerHeight: number;
}

/**
 * Minimum viewport dimensions to prevent degenerate cases.
 */
export const MIN_VIEWPORT_HEIGHT = 8;
export const MIN_VIEWPORT_WIDTH = 20;

/**
 * Return type for the useVirtualization hook.
 */
export interface UseVirtualizationReturn {
  /** Array of measured or estimated heights */
  readonly heights: readonly number[];
  /** Array of cumulative offsets */
  readonly offsets: readonly number[];
  /** Total height of all content */
  readonly totalHeight: number;
  /** First visible item index */
  readonly startIndex: number;
  /** Last visible item index */
  readonly endIndex: number;
  /** Height of spacer above visible items */
  readonly topSpacerHeight: number;
  /** Height of spacer below visible items */
  readonly bottomSpacerHeight: number;
  /** Ref callback for item elements */
  readonly itemRefCallback: (index: number, el: DOMElement | null) => void;
  /** Ref for the container element */
  readonly containerRef: React.RefObject<DOMElement | null>;
  /** Measured container height */
  readonly measuredContainerHeight: number;
  /** True if the last item exceeds viewport height (needs clipping) */
  readonly isOversize: boolean;
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
 * Get estimated height for an index using the estimator.
 */
function getEstimatedHeight(
  estimator: number | ((index: number) => number),
  index: number
): number {
  return typeof estimator === "function" ? estimator(index) : estimator;
}

/**
 * Hook for managing virtualization state.
 *
 * @param props - Configuration for virtualization
 * @returns Virtualization state and utilities
 */
export function useVirtualization(props: UseVirtualizationProps): UseVirtualizationReturn {
  const { dataLength, estimatedItemHeight, scrollTop, containerHeight } = props;

  // Apply minimum viewport clamping to prevent degenerate cases
  const safeContainerHeight = Math.max(MIN_VIEWPORT_HEIGHT, containerHeight);

  // Container ref for measuring viewport
  const containerRef = useRef<DOMElement | null>(null);
  const [measuredContainerHeight, setMeasuredContainerHeight] = useState(safeContainerHeight);

  // Item refs for measurement
  const itemRefs = useRef<Array<DOMElement | null>>([]);

  // Heights cache - measured or estimated
  const [heights, setHeights] = useState<number[]>(() => {
    const initial: number[] = [];
    for (let i = 0; i < dataLength; i++) {
      initial[i] = getEstimatedHeight(estimatedItemHeight, i);
    }
    return initial;
  });

  // Calculate offsets and total height
  const { totalHeight, offsets } = useMemo(() => {
    const offsets: number[] = [0];
    let totalHeight = 0;
    for (let i = 0; i < dataLength; i++) {
      const height = heights[i] ?? getEstimatedHeight(estimatedItemHeight, i);
      totalHeight += height;
      offsets.push(totalHeight);
    }
    return { totalHeight, offsets };
  }, [heights, dataLength, estimatedItemHeight]);

  // Sync heights array with data length changes
  useEffect(() => {
    setHeights((prevHeights) => {
      if (dataLength === prevHeights.length) {
        return prevHeights;
      }

      const newHeights = [...prevHeights];
      if (dataLength < prevHeights.length) {
        // Shrink
        newHeights.length = dataLength;
      } else {
        // Grow - add estimated heights for new items
        for (let i = prevHeights.length; i < dataLength; i++) {
          newHeights[i] = getEstimatedHeight(estimatedItemHeight, i);
        }
      }
      return newHeights;
    });
  }, [dataLength, estimatedItemHeight]);

  // Calculate visible range with OVERFLOW GUARD
  // This ensures we NEVER render more items than fit in the viewport
  const rawStartIndex = Math.max(0, findLastIndex(offsets, (offset) => offset <= scrollTop) - 1);

  const endIndexOffset = offsets.findIndex((offset) => offset > scrollTop + safeContainerHeight);
  const rawEndIndex =
    endIndexOffset === -1 ? dataLength - 1 : Math.min(dataLength - 1, endIndexOffset);

  // FRAME HEIGHT GUARD: Calculate safe render range to prevent overflow
  // Simplified version: no isOversize (ClippedMessage doesn't exist yet)
  // Always show at least MIN_ITEMS_TO_SHOW to prevent content disappearing
  const { startIndex, endIndex } = useMemo(() => {
    // CRITICAL FIX: Always render at least one item if data exists
    // Previous logic returned empty range causing blank screen
    if (dataLength === 0) {
      return { startIndex: 0, endIndex: -1 };
    }

    // Ensure we have valid indices even if raw calculation failed
    const safeRawEndIndex = rawEndIndex < 0 ? dataLength - 1 : rawEndIndex;
    const safeRawStartIndex = Math.min(rawStartIndex, safeRawEndIndex);

    // Safety: ensure we have valid container height
    const effectiveContainerHeight = Math.max(MIN_VIEWPORT_HEIGHT, safeContainerHeight);

    // If raw range is small enough, just use it directly (don't over-optimize)
    const rawCount = safeRawEndIndex - safeRawStartIndex + 1;
    if (rawCount <= 3) {
      return { startIndex: safeRawStartIndex, endIndex: safeRawEndIndex };
    }

    // For larger ranges, do soft trimming but always keep at least 2 items
    let totalRenderedHeight = 0;
    let safeStartIndex = safeRawEndIndex;
    const MIN_ITEMS_TO_SHOW = 2;

    for (let i = safeRawEndIndex; i >= safeRawStartIndex; i--) {
      const itemHeight = heights[i] ?? getEstimatedHeight(estimatedItemHeight, i);
      // Use actual height, not capped - let Ink handle overflow

      const itemCount = safeRawEndIndex - safeStartIndex + 1;
      if (
        totalRenderedHeight + itemHeight > effectiveContainerHeight &&
        itemCount >= MIN_ITEMS_TO_SHOW
      ) {
        // Would overflow AND we have minimum items - stop
        break;
      }

      totalRenderedHeight += itemHeight;
      safeStartIndex = i;
    }

    return { startIndex: safeStartIndex, endIndex: safeRawEndIndex };
  }, [rawStartIndex, rawEndIndex, heights, safeContainerHeight, estimatedItemHeight, dataLength]);

  // isOversize is kept for API compatibility but always false
  // (ClippedMessage doesn't exist yet, so we can't handle oversize items)
  const isOversize = false;

  // Calculate spacer heights
  const topSpacerHeight = offsets[startIndex] ?? 0;
  const bottomSpacerHeight = totalHeight - (offsets[endIndex + 1] ?? totalHeight);

  // Item ref callback for measurement
  const itemRefCallback = (index: number, el: DOMElement | null) => {
    itemRefs.current[index] = el;
  };

  // Measure container and visible items on every render
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Item measurement logic with height tracking
  useLayoutEffect(() => {
    // Measure container
    if (containerRef.current) {
      const height = Math.round(measureElement(containerRef.current).height);
      if (measuredContainerHeight !== height) {
        setMeasuredContainerHeight(height);
      }
    }

    // Measure visible items
    let newHeights: number[] | null = null;
    for (let i = startIndex; i <= endIndex; i++) {
      const itemRef = itemRefs.current[i];
      if (itemRef) {
        const height = Math.round(measureElement(itemRef).height);
        if (height !== heights[i]) {
          if (!newHeights) {
            newHeights = [...heights];
          }
          newHeights[i] = height;
        }
      }
    }
    if (newHeights) {
      setHeights(newHeights);
    }
  });

  return {
    heights,
    offsets,
    totalHeight,
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
    itemRefCallback,
    containerRef,
    measuredContainerHeight,
    isOversize,
  };
}
