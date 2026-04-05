/**
 * useClickRegion Hook
 *
 * Registers a rectangular click region in the global ClickRegionRegistry.
 * Updates the region on each render and unregisters on unmount.
 *
 * @module tui/hooks/useClickRegion
 */

import { useEffect, useRef } from "react";
import { globalClickRegistry } from "../utils/click-region.js";
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
 * The region is registered/updated on each render and unregistered on unmount.
 * Pass `null` for bounds to skip registration (e.g., when position is unknown).
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
  bounds: ClickRegionBounds | null
): void {
  const unregisterRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    // Clean up previous registration
    unregisterRef.current?.();
    unregisterRef.current = null;

    const { id, onClick, priority, enabled = true } = optionsRef.current;

    // Skip if disabled or no bounds
    if (!enabled || !bounds) return;

    // Validate bounds
    if (bounds.width <= 0 || bounds.height <= 0) return;

    unregisterRef.current = globalClickRegistry.register({
      id,
      top: bounds.top,
      left: bounds.left,
      bottom: bounds.top + bounds.height - 1,
      right: bounds.left + bounds.width - 1,
      onClick,
      priority,
    });

    return () => {
      unregisterRef.current?.();
      unregisterRef.current = null;
    };
  }, [bounds]);
}
