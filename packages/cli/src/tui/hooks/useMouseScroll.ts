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
import type { ContentBounds } from "../context/LayoutPositionContext.js";
import {
  useMouseContextOptional,
  useMouseInteractionActivate,
  useMouseInteractionEnabled,
} from "../context/MouseContext.js";
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
  /** Route wheel input only to this zero-based terminal region. A live resolver
   * is measured for each event; null means hidden or not yet laid out.
   */
  readonly bounds?: ContentBounds | (() => ContentBounds | null);
  /** Menus consume wheel input before background history (default: 10). */
  readonly priority?: number;
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
    bounds,
    priority = 10,
  } = options;

  const mouseCtx = useMouseContextOptional();
  const interactionEnabled = useMouseInteractionEnabled();
  const activate = useMouseInteractionActivate();

  const handleWheel = useCallback(
    (event: MouseEvent) => {
      if (!enabled || !interactionEnabled || !onScroll) return false;
      const currentBounds = typeof bounds === "function" ? bounds() : bounds;
      if (currentBounds === null) return false;
      if (
        currentBounds &&
        (event.col - 1 < currentBounds.left ||
          event.col - 1 >= currentBounds.left + currentBounds.width ||
          event.row - 1 < currentBounds.top ||
          event.row - 1 >= currentBounds.top + currentBounds.height)
      )
        return false;

      const delta = event.action === "wheelup" ? -scrollSpeed : scrollSpeed;

      activate?.();
      onScroll(delta);
      return true;
    },
    [enabled, interactionEnabled, activate, onScroll, scrollSpeed, bounds]
  );

  useEffect(() => {
    if (!mouseCtx || !enabled || !interactionEnabled) return;

    const unsubscribe = mouseCtx.onWheel(handleWheel, priority);
    return unsubscribe;
  }, [mouseCtx, enabled, interactionEnabled, handleWheel, priority]);
}
