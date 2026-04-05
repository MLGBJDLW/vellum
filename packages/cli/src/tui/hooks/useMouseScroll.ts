/**
 * Mouse Scroll Hook
 *
 * Bridges mouse wheel events from MouseContext to scroll actions.
 * Converts wheel ticks to scroll deltas and integrates with
 * the existing scroll controller (follow/manual mode).
 *
 * Gracefully degrades when no MouseProvider is present.
 *
 * @module tui/hooks/useMouseScroll
 */

import { useCallback, useEffect } from "react";

import { useMouseContextOptional } from "../context/MouseContext.js";
import type { MouseEvent } from "../utils/mouse-parser.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for useMouseScroll hook.
 */
export interface UseMouseScrollOptions {
  /** Lines to scroll per wheel tick. Default: 3 */
  readonly scrollSpeed?: number;
  /** Whether scroll is enabled */
  readonly enabled?: boolean;
  /** Callback when scroll position changes */
  readonly onScroll?: (delta: number) => void;
}

// =============================================================================
// Default values
// =============================================================================

const DEFAULT_SCROLL_SPEED = 3;

// =============================================================================
// Hook
// =============================================================================

/**
 * Subscribe to mouse wheel events and convert them to scroll deltas.
 *
 * - `wheelup`   → negative delta (scroll up / toward top)
 * - `wheeldown` → positive delta (scroll down / toward bottom)
 *
 * Works alongside keyboard scroll without conflict.
 * If no `MouseProvider` is in the tree, the hook is a no-op.
 */
export function useMouseScroll(options: UseMouseScrollOptions = {}): void {
  const {
    scrollSpeed = DEFAULT_SCROLL_SPEED,
    enabled = true,
    onScroll,
  } = options;

  const mouseCtx = useMouseContextOptional();

  const handleWheel = useCallback(
    (event: MouseEvent) => {
      if (!enabled || !onScroll) return;

      const delta =
        event.action === "wheelup" ? -scrollSpeed : scrollSpeed;

      onScroll(delta);
    },
    [enabled, onScroll, scrollSpeed],
  );

  useEffect(() => {
    if (!mouseCtx || !enabled) return;

    const unsubscribe = mouseCtx.onWheel(handleWheel);
    return unsubscribe;
  }, [mouseCtx, enabled, handleWheel]);
}
