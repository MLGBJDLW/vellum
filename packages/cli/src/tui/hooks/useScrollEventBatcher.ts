/**
 * Scroll Event Batcher Hook
 *
 * Batches multiple scroll events within the same tick to prevent jitter.
 * Useful when multiple sources can trigger scroll updates simultaneously.
 *
 * @module tui/hooks/useScrollEventBatcher
 */

import { useCallback, useRef, useState } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Batching strategy for combining scroll deltas
 */
export type BatchStrategy = "sum" | "last" | "max" | "min";

/**
 * Configuration for scroll event batcher behavior
 */
export interface ScrollEventBatcherConfig {
  /** Batch window in ms (default: 0 - same tick only) */
  readonly batchWindow?: number;
  /** Strategy for combining batched deltas (default: 'sum') */
  readonly strategy?: BatchStrategy;
  /** Maximum absolute delta to allow (default: Infinity) */
  readonly maxDelta?: number;
}

/**
 * Return type for useScrollEventBatcher hook
 */
export interface UseScrollEventBatcherReturn {
  /** Queue a scroll delta (will be batched) */
  readonly queueScroll: (delta: number) => void;
  /** Number of pending deltas in current batch */
  readonly pendingCount: number;
  /** Force flush any pending scroll */
  readonly flush: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: Required<ScrollEventBatcherConfig> = {
  batchWindow: 0,
  strategy: "sum",
  maxDelta: Infinity,
};

// =============================================================================
// Strategy Functions
// =============================================================================

/**
 * Combine deltas based on strategy
 */
function combineDelta(deltas: number[], strategy: BatchStrategy): number {
  if (deltas.length === 0) return 0;

  switch (strategy) {
    case "sum":
      return deltas.reduce((a, b) => a + b, 0);
    case "last": {
      const lastDelta = deltas[deltas.length - 1];
      return lastDelta !== undefined ? lastDelta : 0;
    }
    case "max":
      return Math.max(...deltas);
    case "min":
      return Math.min(...deltas);
    default:
      return deltas.reduce((a, b) => a + b, 0);
  }
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for batching scroll events
 *
 * Collects scroll deltas within a batch window and combines them
 * according to the configured strategy before calling the scroll handler.
 *
 * @param onScroll - Handler called with combined delta after batching
 * @param config - Optional batching configuration
 * @returns Batched scroll controls
 *
 * @example
 * ```tsx
 * const { queueScroll } = useScrollEventBatcher(
 *   (delta) => scrollController.scrollBy(delta),
 *   { strategy: 'sum' }
 * );
 *
 * // Multiple calls in same tick get batched
 * queueScroll(1);
 * queueScroll(2);
 * queueScroll(3);
 * // onScroll called once with delta=6
 * ```
 */
export function useScrollEventBatcher(
  onScroll: (delta: number) => void,
  config: ScrollEventBatcherConfig = {}
): UseScrollEventBatcherReturn {
  // Merge config with defaults
  const { batchWindow, strategy, maxDelta } = { ...DEFAULT_CONFIG, ...config };

  // State
  const [pendingCount, setPendingCount] = useState(0);

  // Refs
  const pendingDeltasRef = useRef<number[]>([]);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScrollRef = useRef(onScroll);

  // Keep onScroll ref updated
  onScrollRef.current = onScroll;

  /**
   * Flush pending deltas
   */
  const flush = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }

    const deltas = pendingDeltasRef.current;
    if (deltas.length === 0) return;

    // Combine deltas based on strategy
    let combinedDelta = combineDelta(deltas, strategy);

    // Clamp to maxDelta
    if (Math.abs(combinedDelta) > maxDelta) {
      combinedDelta = Math.sign(combinedDelta) * maxDelta;
    }

    // Clear pending state
    pendingDeltasRef.current = [];
    setPendingCount(0);

    // Execute scroll
    onScrollRef.current(combinedDelta);
  }, [strategy, maxDelta]);

  /**
   * Queue a scroll delta
   */
  const queueScroll = useCallback(
    (delta: number) => {
      // Add to pending deltas
      pendingDeltasRef.current.push(delta);
      setPendingCount((c) => c + 1);

      // Schedule flush
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }

      if (batchWindow === 0) {
        // Batch within same tick using microtask
        queueMicrotask(flush);
      } else {
        // Batch within time window
        flushTimeoutRef.current = setTimeout(flush, batchWindow);
      }
    },
    [batchWindow, flush]
  );

  return {
    queueScroll,
    pendingCount,
    flush,
  };
}
