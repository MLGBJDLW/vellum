/**
 * useBatchedScroll Hook
 *
 * Manages batched scroll state updates to allow multiple scroll operations
 * within the same tick to accumulate properly.
 *
 * Ported from Gemini CLI.
 *
 * @module tui/components/common/VirtualizedList/hooks/useBatchedScroll
 */

import { useCallback, useEffect, useRef } from "react";

/**
 * Return type for the useBatchedScroll hook.
 */
export interface UseBatchedScrollReturn {
  /** Get the current or pending scroll position */
  readonly getScrollTop: () => number;
  /** Set a pending scroll position for the next render */
  readonly setPendingScrollTop: (scrollTop: number) => void;
}

/**
 * A hook to manage batched scroll state updates.
 *
 * It allows multiple scroll operations within the same tick to accumulate
 * by keeping track of a 'pending' state that resets after render.
 *
 * @param currentScrollTop - The current scroll position from state
 * @returns Object with getScrollTop and setPendingScrollTop functions
 *
 * @example
 * ```tsx
 * const { getScrollTop, setPendingScrollTop } = useBatchedScroll(scrollTop);
 *
 * // In scroll handler:
 * const current = getScrollTop();
 * const next = current + delta;
 * setPendingScrollTop(next);
 * ```
 */
export function useBatchedScroll(currentScrollTop: number): UseBatchedScrollReturn {
  const pendingScrollTopRef = useRef<number | null>(null);
  // Use a ref for currentScrollTop to allow getScrollTop to be stable
  const currentScrollTopRef = useRef(currentScrollTop);

  // Reset pending state after each render and update current ref
  useEffect(() => {
    currentScrollTopRef.current = currentScrollTop;
    pendingScrollTopRef.current = null;
  });

  const getScrollTop = useCallback(
    () => pendingScrollTopRef.current ?? currentScrollTopRef.current,
    []
  );

  const setPendingScrollTop = useCallback((newScrollTop: number) => {
    pendingScrollTopRef.current = newScrollTop;
  }, []);

  return { getScrollTop, setPendingScrollTop };
}
