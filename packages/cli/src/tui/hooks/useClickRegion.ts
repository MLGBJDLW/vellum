/**
 * useClickRegion Hook
 *
 * Registers a rectangular click region in the global ClickRegionRegistry.
 * Reads current bounds and handlers at dispatch, and unregisters on unmount.
 *
 * @module tui/hooks/useClickRegion
 */

import { useEffect, useRef } from "react";
import { type ClickRegionEdges, globalClickRegistry } from "../utils/click-region.js";
import type { MouseEvent } from "../utils/mouse-parser.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Bounding box for a click region.
 */
export interface ClickRegionBounds {
  /** Top offset in terminal rows (1-based) */
  readonly top: number;
  /** Left offset in terminal columns (1-based) */
  readonly left: number;
  /** Width in columns */
  readonly width: number;
  /** Height in rows */
  readonly height: number;
}

/**
 * Options for useClickRegion.
 */
export interface UseClickRegionOptions {
  /** Unique identifier for this region */
  readonly id: string;
  /** Click handler */
  readonly onClick: (event: MouseEvent) => void;
  /** Priority for overlapping regions (higher wins) */
  readonly priority?: number;
  /** Whether the region is active (default: true) */
  readonly enabled?: boolean;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Register a click region that responds to mouse clicks.
 *
 * Registration stays stable across renders; bounds and callbacks are read live.
 * Pass `null` for bounds to make the region non-interactive until layout is known.
 *
 * @example
 * ```tsx
 * useClickRegion(
 *   { id: 'my-button', onClick: handleClick },
 *   { top: 5, left: 10, width: 20, height: 1 }
 * );
 * ```
 */
export function useClickRegion(
  options: UseClickRegionOptions,
  bounds: ClickRegionBounds | null | (() => ClickRegionBounds | null)
): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const { id, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;
    return globalClickRegistry.register({
      id,
      getBounds: (): ClickRegionEdges | null => {
        if (optionsRef.current.enabled === false) return null;
        const current =
          typeof boundsRef.current === "function" ? boundsRef.current() : boundsRef.current;
        if (!current || current.width <= 0 || current.height <= 0) return null;
        return {
          top: current.top,
          left: current.left,
          bottom: current.top + current.height - 1,
          right: current.left + current.width - 1,
        };
      },
      onClick: (event) => optionsRef.current.onClick(event),
      get priority() {
        return optionsRef.current.priority;
      },
    });
  }, [id, enabled]);
}
