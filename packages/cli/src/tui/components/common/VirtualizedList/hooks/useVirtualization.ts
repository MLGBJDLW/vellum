/**
 * useVirtualization Hook
 *
 * Manages height calculations, measurement, and visible range computation
 * for virtualized list rendering.
 *
 * Architecture:
 * - heightCache: Map<id, height> - Primary source of truth (id-keyed)
 * - blockSumsState: BlockSumsState - Index-based O(1) prefix sums for layout
 * - idToIndexMap: Map<id, index> - Bridges id-based cache to index-based layout
 *
 * @module tui/components/common/VirtualizedList/hooks/useVirtualization
 */

import type { DOMElement } from "ink";
import { measureElement } from "ink";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  type BlockSumsState,
  batchUpdateHeights,
  createBlockSums,
  prefixSum,
  updateHeight as updateBlockHeight,
} from "../utils/blockSums.js";

/**
 * Type of mutation detected in data array.
 * Used for cache invalidation and development warnings.
 */
export type DataMutationType =
  | "none" // No change
  | "append" // Items added at end (cache-safe)
  | "prepend" // Items added at start (requires cache rebuild)
  | "delete" // Items removed (requires cache rebuild)
  | "reorder" // Items reordered (requires cache rebuild)
  | "insert-middle" // Items inserted in middle (requires cache rebuild)
  | "replace"; // Complete data replacement (requires cache rebuild)

/**
 * Detect mutation type between previous and new data arrays.
 * Returns the type of mutation for cache invalidation decisions.
 *
 * @param prevIds - Previous array of item IDs
 * @param newIds - New array of item IDs
 * @returns Detected mutation type
 */
export function detectMutationType(
  prevIds: readonly string[],
  newIds: readonly string[]
): DataMutationType {
  // No change
  if (prevIds.length === 0 && newIds.length === 0) {
    return "none";
  }

  // Complete replacement (empty -> populated or vice versa with no overlap)
  if (prevIds.length === 0) {
    return "append"; // Initial population is treated as append
  }

  if (newIds.length === 0) {
    return "delete"; // All items deleted
  }

  // Check for pure append (most common streaming case)
  if (newIds.length > prevIds.length) {
    const isAppend = prevIds.every((id, index) => newIds[index] === id);
    if (isAppend) {
      return "append";
    }
  }

  // Check for pure prepend
  if (newIds.length > prevIds.length) {
    const offset = newIds.length - prevIds.length;
    const isPrepend = prevIds.every((id, index) => newIds[index + offset] === id);
    if (isPrepend) {
      return "prepend";
    }
  }

  // Check for deletion
  if (newIds.length < prevIds.length) {
    const newIdSet = new Set(newIds);
    const isDelete = prevIds.filter((id) => newIdSet.has(id)).length === newIds.length;
    if (isDelete) {
      return "delete";
    }
  }

  // Check for reorder (same IDs, different order)
  if (prevIds.length === newIds.length) {
    const prevSet = new Set(prevIds);
    const newSet = new Set(newIds);
    const sameIds = prevSet.size === newSet.size && [...prevSet].every((id) => newSet.has(id));
    if (sameIds) {
      const isUnchanged = prevIds.every((id, index) => newIds[index] === id);
      return isUnchanged ? "none" : "reorder";
    }
  }

  // Otherwise it's an insert in the middle or complex change
  return "insert-middle";
}

/**
 * Props for the useVirtualization hook.
 */
export interface UseVirtualizationProps<T = unknown> {
  /** Array of data items */
  readonly data: readonly T[];
  /** Function to extract unique key from item */
  readonly keyExtractor: (item: T, index: number) => string;
  /** Function or fixed value for estimated item height */
  readonly estimatedItemHeight: number | ((index: number) => number);
  /** Current scroll position in pixels */
  readonly scrollTop: number;
  /** Height of the visible container */
  readonly containerHeight: number;
  /**
   * Whether there is active streaming content.
   * When true, measurement interval is reduced for more responsive updates.
   * @default false
   */
  readonly isStreaming?: boolean;
}

/**
 * Legacy props interface for backward compatibility.
 * @deprecated Use UseVirtualizationProps with data and keyExtractor instead
 */
export interface UseVirtualizationPropsLegacy {
  /** Number of data items */
  readonly dataLength: number;
  /** Function or fixed value for estimated item height */
  readonly estimatedItemHeight: number | ((index: number) => number);
  /** Current scroll position in pixels */
  readonly scrollTop: number;
  /** Height of the visible container */
  readonly containerHeight: number;
  /**
   * Whether there is active streaming content.
   * When true, measurement interval is reduced for more responsive updates.
   * @default false
   */
  readonly isStreaming?: boolean;
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
  /** Array of measured or estimated heights (index-based, for compatibility) */
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
  /**
   * Ref callback factory for item elements (id-based).
   * Returns a ref callback for the given item id.
   * Automatically cleans up refs when element unmounts (null passed).
   */
  readonly setItemRef: (id: string) => (element: DOMElement | null) => void;
  /** Ref for the container element */
  readonly containerRef: React.RefObject<DOMElement | null>;
  /** Measured container height */
  readonly measuredContainerHeight: number;
  /** True if the last item exceeds viewport height (needs clipping) */
  readonly isOversize: boolean;
  /**
   * Trigger an immediate re-measurement of visible items.
   * Call this when you know heights have changed (e.g., ThinkingBlock expand/collapse).
   */
  readonly triggerMeasure: () => void;
  /**
   * Update measured height for an item by ID.
   * Keeps heightCache (id-based) and blockSumsState (index-based) in sync.
   */
  readonly updateMeasuredHeight: (id: string, measuredHeight: number) => void;
  /** Block sums state for O(1) prefix sum queries */
  readonly blockSumsState: BlockSumsState;
  /** Map from item ID to current index */
  readonly idToIndexMap: ReadonlyMap<string, number>;
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
 * Minimum valid height for any item to prevent invisible/zero-height items
 */
const MIN_ITEM_HEIGHT = 1;

/**
 * Get estimated height for an index using the estimator.
 * FIX: Always returns at least MIN_ITEM_HEIGHT to prevent zero/negative heights
 * that can cause infinite scroll loops or invisible items.
 */
function getEstimatedHeight(
  estimator: number | ((index: number) => number),
  index: number
): number {
  const estimated = typeof estimator === "function" ? estimator(index) : estimator;
  // FIX: Ensure height is always valid (positive integer)
  return Math.max(MIN_ITEM_HEIGHT, Math.round(estimated));
}

/**
 * Type guard to check if props are legacy format
 */
function isLegacyProps<T>(
  props: UseVirtualizationProps<T> | UseVirtualizationPropsLegacy
): props is UseVirtualizationPropsLegacy {
  return "dataLength" in props && !("data" in props);
}

/**
 * Hook for managing virtualization state.
 *
 * Supports two API modes:
 * 1. Modern: data + keyExtractor (enables id-based height caching)
 * 2. Legacy: dataLength only (backward compatible, uses index-based keys)
 *
 * @param props - Configuration for virtualization
 * @returns Virtualization state and utilities
 */
export function useVirtualization<T = unknown>(
  props: UseVirtualizationProps<T> | UseVirtualizationPropsLegacy
): UseVirtualizationReturn {
  // Normalize props to support both legacy and modern API
  const isLegacy = isLegacyProps(props);
  const data = isLegacy ? null : (props as UseVirtualizationProps<T>).data;
  const keyExtractor = isLegacy
    ? (_item: unknown, index: number) => String(index)
    : (props as UseVirtualizationProps<T>).keyExtractor;
  const dataLength = isLegacy
    ? (props as UseVirtualizationPropsLegacy).dataLength
    : (props as UseVirtualizationProps<T>).data.length;

  const { estimatedItemHeight, scrollTop, containerHeight, isStreaming = false } = props;

  // Apply minimum viewport clamping to prevent degenerate cases
  const safeContainerHeight = Math.max(MIN_VIEWPORT_HEIGHT, containerHeight);

  // Container ref for measuring viewport
  const containerRef = useRef<DOMElement | null>(null);
  const [measuredContainerHeight, setMeasuredContainerHeight] = useState(safeContainerHeight);

  // Item refs for measurement (id-based Map for stable references across insertions/deletions)
  const itemRefs = useRef<Map<string, DOMElement>>(new Map());

  // ============================================================================
  // ID-to-Index Mapping (bridges id-based cache to index-based layout)
  // ============================================================================
  const idToIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    if (data) {
      data.forEach((item, index) => {
        map.set(keyExtractor(item, index), index);
      });
    } else {
      // Legacy mode: use string indices as keys
      for (let i = 0; i < dataLength; i++) {
        map.set(String(i), i);
      }
    }
    return map;
  }, [data, keyExtractor, dataLength]);

  // ============================================================================
  // Height Cache (id-based) - Primary source of truth for measured heights
  // ============================================================================
  const heightCache = useRef<Map<string, number>>(new Map());

  // ============================================================================
  // Block Sums State (index-based) - O(1) prefix sum queries for layout
  // ============================================================================
  const [blockSumsState, setBlockSumsState] = useState<BlockSumsState>(() => {
    const initialHeights: number[] = [];
    for (let i = 0; i < dataLength; i++) {
      initialHeights[i] = getEstimatedHeight(estimatedItemHeight, i);
    }
    return createBlockSums(initialHeights);
  });

  // Derived heights array for backward compatibility
  // This mirrors blockSumsState.heights for existing consumers
  const heights = blockSumsState.heights as number[];

  // Track previous data IDs for mutation detection
  const prevDataIdsRef = useRef<readonly string[]>([]);

  // ============================================================================
  // Sync block sums with data length changes (with mutation detection)
  // ============================================================================
  useEffect(() => {
    // Build current IDs array for mutation detection
    const currentIds: string[] = [];
    if (data) {
      for (let i = 0; i < dataLength; i++) {
        currentIds.push(keyExtractor(data[i] as T, i));
      }
    } else {
      for (let i = 0; i < dataLength; i++) {
        currentIds.push(String(i));
      }
    }

    // Detect mutation type
    const mutationType = detectMutationType(prevDataIdsRef.current, currentIds);
    prevDataIdsRef.current = currentIds;

    // In development, warn about non-append mutations that require cache rebuild
    if (
      process.env.NODE_ENV !== "production" &&
      mutationType !== "none" &&
      mutationType !== "append"
    ) {
      console.warn(
        `[VirtualizedList] Non-append mutation detected: ${mutationType}. ` +
          `Height cache will be rebuilt. This may cause a brief layout shift. ` +
          `For optimal performance, prefer append-only data updates.`
      );
    }

    setBlockSumsState((prevState: BlockSumsState): BlockSumsState => {
      const prevLength = prevState.heights.length;

      if (dataLength === prevLength && mutationType === "none") {
        return prevState;
      }

      // For non-append mutations, rebuild cache from scratch
      // This ensures correct layout after prepend, delete, reorder, or insert-middle
      if (mutationType !== "none" && mutationType !== "append") {
        const newHeights: number[] = [];
        for (let i = 0; i < dataLength; i++) {
          const id = currentIds[i] as string;
          const cachedHeight = heightCache.current.get(id);
          newHeights[i] = cachedHeight ?? getEstimatedHeight(estimatedItemHeight, i);
        }
        return createBlockSums(newHeights);
      }

      if (dataLength < prevLength) {
        // Shrink: rebuild with fewer items
        // Preserve heights from heightCache where available
        const newHeights: number[] = [];
        for (let i = 0; i < dataLength; i++) {
          const id = data ? keyExtractor(data[i] as T, i) : String(i);
          const cachedHeight = heightCache.current.get(id);
          newHeights[i] =
            cachedHeight ??
            (prevState.heights[i] as number) ??
            getEstimatedHeight(estimatedItemHeight, i);
        }
        return createBlockSums(newHeights);
      }

      // Grow (append): add estimated heights for new items only
      const newHeights: number[] = [...prevState.heights];

      for (let i = prevLength; i < dataLength; i++) {
        const id = data ? keyExtractor(data[i] as T, i) : String(i);
        const cachedHeight = heightCache.current.get(id);
        const height = cachedHeight ?? getEstimatedHeight(estimatedItemHeight, i);
        newHeights.push(height);
      }

      return createBlockSums(newHeights);
    });
  }, [dataLength, data, keyExtractor, estimatedItemHeight]);

  // ============================================================================
  // Update measured height (keeps heightCache and blockSumsState in sync)
  // ============================================================================
  const updateMeasuredHeight = useCallback(
    (id: string, measuredHeight: number) => {
      const index = idToIndexMap.get(id);
      if (index === undefined) return;

      // Ensure valid height
      const safeHeight = Math.max(MIN_ITEM_HEIGHT, Math.round(measuredHeight));

      // Check if height actually changed
      const currentHeight = heightCache.current.get(id);
      if (currentHeight === safeHeight) return;

      // Update heightCache (id -> height)
      heightCache.current.set(id, safeHeight);

      // Update Block Sums (index -> height)
      setBlockSumsState((prev: BlockSumsState) => updateBlockHeight(prev, index, safeHeight));
    },
    [idToIndexMap]
  );

  // Calculate offsets and total height (using block sums)
  const { totalHeight, offsets } = useMemo(() => {
    const offsets: number[] = [0];
    for (let i = 0; i < dataLength; i++) {
      offsets.push(prefixSum(blockSumsState, i + 1));
    }
    return { totalHeight: blockSumsState.totalHeight, offsets };
  }, [blockSumsState, dataLength]);

  // Calculate visible range with OVERFLOW GUARD
  // This ensures we NEVER render more items than fit in the viewport
  // FIX: Improved off-by-one handling - findLastIndex returns the index where offset <= scrollTop
  // We don't need to subtract 1; that was causing negative indices and blank areas
  const foundStartIndex = findLastIndex(offsets, (offset) => offset <= scrollTop);
  // If no offset found (scrollTop < 0 or empty), start at 0
  // Otherwise use the found index directly (no -1 subtraction)
  const rawStartIndex = Math.max(0, foundStartIndex === -1 ? 0 : foundStartIndex);

  const endIndexOffset = offsets.findIndex((offset) => offset > scrollTop + safeContainerHeight);
  // FIX: Handle edge case where no offset exceeds viewport - show all remaining items
  const rawEndIndex =
    endIndexOffset === -1
      ? dataLength - 1
      : Math.min(dataLength - 1, Math.max(0, endIndexOffset - 1));

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

  // Number of extra refs to keep beyond visible range (prevents thrashing on scroll)
  const OVERSCAN_BUFFER = 4;

  /**
   * Ref callback factory for item elements (id-based).
   * Automatically cleans up refs when element unmounts.
   */
  const setItemRef = useCallback(
    (id: string) => (element: DOMElement | null) => {
      if (element) {
        itemRefs.current.set(id, element);
      } else {
        itemRefs.current.delete(id);
      }
    },
    []
  );

  /**
   * Clean up refs that are no longer in the visible range.
   * Keeps a buffer of OVERSCAN_BUFFER * 2 refs to prevent thrashing during scroll.
   */
  const cleanupRefs = useCallback((visibleIds: Set<string>) => {
    const refsToDelete: string[] = [];

    itemRefs.current.forEach((_, id) => {
      if (!visibleIds.has(id)) {
        refsToDelete.push(id);
      }
    });

    // Keep some buffer refs to avoid frequent re-creation
    const maxExtraRefs = OVERSCAN_BUFFER * 2;
    if (refsToDelete.length > maxExtraRefs) {
      // Delete oldest refs first (those furthest from visible range)
      refsToDelete.slice(0, refsToDelete.length - maxExtraRefs).forEach((id) => {
        itemRefs.current.delete(id);
      });
    }
  }, []);

  // Track previous values to avoid unnecessary measurements
  const prevStartIndexRef = useRef(startIndex);
  const prevEndIndexRef = useRef(endIndex);
  const prevDataLengthRef = useRef(dataLength);

  // Periodic measurement tick to catch dynamic content height changes
  // This ensures collapsible content like ThinkingBlock gets re-measured when expanded
  const [measureTick, setMeasureTick] = useState(0);

  // Dynamic measurement interval: faster during streaming for responsive updates
  const STREAMING_INTERVAL_MS = 50; // Fast updates during streaming
  const NORMAL_INTERVAL_MS = 250; // Normal interval when idle
  const remeasureInterval = isStreaming ? STREAMING_INTERVAL_MS : NORMAL_INTERVAL_MS;

  // Manual trigger for immediate re-measurement (e.g., ThinkingBlock expand/collapse)
  const triggerMeasure = useCallback(() => {
    setMeasureTick((t) => t + 1);
  }, []);

  // Set up periodic measurement timer with dynamic interval
  useEffect(() => {
    const timer = setInterval(() => {
      setMeasureTick((t) => t + 1);
    }, remeasureInterval);
    return () => clearInterval(timer);
  }, [remeasureInterval]);

  // Cleanup refs when visible items change
  // This prevents memory leaks from accumulated refs of scrolled-out items
  useEffect(() => {
    if (!data) return; // Skip cleanup in legacy mode

    const visibleIds = new Set<string>();
    for (let i = startIndex; i <= endIndex; i++) {
      const item = data[i];
      if (item) {
        visibleIds.add(keyExtractor(item, i));
      }
    }
    cleanupRefs(visibleIds);
  }, [data, startIndex, endIndex, keyExtractor, cleanupRefs]);

  // Helper to get item ref by index (bridges id-based refs with index-based measurement)
  const getItemRefByIndex = useCallback(
    (index: number): DOMElement | undefined => {
      const id = data ? keyExtractor(data[index] as T, index) : String(index);
      return itemRefs.current.get(id);
    },
    [data, keyExtractor]
  );

  // Measure container and visible items when visible range changes or on periodic tick
  // FIX: Added proper dependency array to prevent measuring on every single render
  // which was causing extreme CPU usage and frame drops
  // FIX2: Added periodic re-measurement to catch dynamic content changes (ThinkingBlock expand/collapse)
  // FIX3: Enhanced detection for significant height changes (>5px threshold) to catch collapsible content
  // biome-ignore lint/correctness/useExhaustiveDependencies: measureTick intentionally triggers periodic re-measurement
  useLayoutEffect(() => {
    // Check if we actually need to re-measure
    const rangeChanged =
      prevStartIndexRef.current !== startIndex ||
      prevEndIndexRef.current !== endIndex ||
      prevDataLengthRef.current !== dataLength;

    prevStartIndexRef.current = startIndex;
    prevEndIndexRef.current = endIndex;
    prevDataLengthRef.current = dataLength;

    // Measure container
    if (containerRef.current) {
      const height = Math.round(measureElement(containerRef.current).height);
      if (measuredContainerHeight !== height && height > 0) {
        setMeasuredContainerHeight(height);
      }
    }

    // FIX3: Check for significant height changes in visible items
    // This catches ThinkingBlock expand/collapse which can cause large height deltas
    const HEIGHT_CHANGE_THRESHOLD = 5; // pixels
    let forceRemeasure = false;

    for (let i = startIndex; i <= endIndex; i++) {
      const itemRef = getItemRefByIndex(i);
      if (itemRef) {
        const currentHeight = Math.round(measureElement(itemRef).height);
        const cachedHeight = heights[i] ?? 0;
        if (Math.abs(currentHeight - cachedHeight) > HEIGHT_CHANGE_THRESHOLD) {
          forceRemeasure = true;
          break;
        }
      }
    }

    // Measure visible items when:
    // 1. Range changed (scroll/data update)
    // 2. Initial mount (heights.length === 0)
    // 3. measureTick changed (periodic check for dynamic content)
    // 4. FIX3: Significant height change detected (forceRemeasure)
    // Note: measureTick is in deps, so this runs periodically
    if (!rangeChanged && heights.length > 0 && !forceRemeasure) {
      // No changes needed - skip expensive remeasurement
      return;
    }

    // Collect all height updates for batch processing
    const heightUpdates: Array<{ index: number; height: number }> = [];

    // Measure visible items
    for (let i = startIndex; i <= endIndex; i++) {
      const itemRef = getItemRefByIndex(i);
      if (itemRef) {
        const measuredHeight = Math.round(measureElement(itemRef).height);
        // Only update if height actually changed and is valid
        if (measuredHeight > 0 && measuredHeight !== heights[i]) {
          heightUpdates.push({ index: i, height: measuredHeight });
        }
      }
    }

    // ENHANCEMENT: During streaming, always measure the last item even if it's
    // outside the visible range. This ensures streaming content height is captured
    // immediately rather than waiting for it to scroll into view.
    if (isStreaming && dataLength > 0) {
      const lastIndex = dataLength - 1;
      // Only if last item wasn't already measured in the loop above
      if (lastIndex > endIndex || lastIndex < startIndex) {
        const lastItemRef = getItemRefByIndex(lastIndex);
        if (lastItemRef) {
          const measuredHeight = Math.round(measureElement(lastItemRef).height);
          if (measuredHeight > 0 && measuredHeight !== heights[lastIndex]) {
            heightUpdates.push({ index: lastIndex, height: measuredHeight });
          }
        }
      }
    }

    // Apply all height updates via block sums (maintains sync)
    if (heightUpdates.length > 0) {
      // Update heightCache for each item
      for (const { index, height } of heightUpdates) {
        const id = data ? keyExtractor(data[index] as T, index) : String(index);
        heightCache.current.set(id, height);
      }

      // Batch update block sums state
      setBlockSumsState((prev: BlockSumsState) => batchUpdateHeights(prev, heightUpdates));
    }
  }, [
    startIndex,
    endIndex,
    dataLength,
    data,
    keyExtractor,
    heights,
    measuredContainerHeight,
    measureTick,
    isStreaming,
    getItemRefByIndex,
  ]);

  return {
    heights,
    offsets,
    totalHeight,
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
    setItemRef,
    containerRef,
    measuredContainerHeight,
    isOversize,
    triggerMeasure,
    updateMeasuredHeight,
    blockSumsState,
    idToIndexMap,
  };
}
