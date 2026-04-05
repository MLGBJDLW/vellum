/**
 * useLayoutPosition Hook
 *
 * Converts relative content-area positions to absolute terminal coordinates
 * using LayoutPositionContext. Returns absolute bounds suitable for
 * useClickRegion registration.
 *
 * @module tui/hooks/useLayoutPosition
 */

import { useEffect, useMemo } from "react";

import { useLayoutPositionContext } from "../context/LayoutPositionContext.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the useLayoutPosition hook.
 */
export interface UseLayoutPositionOptions {
  /** Unique identifier for this component */
  readonly id: string;
  /** Relative row position within the content area (from VirtualizedList) */
  readonly relativeTop: number;
  /** Component height in terminal rows */
  readonly height: number;
  /** Whether this position is currently visible */
  readonly visible: boolean;
}

/**
 * Absolute terminal bounds of a component.
 */
export interface AbsoluteBounds {
  /** Absolute terminal row (1-based, for click regions) */
  readonly top: number;
  /** Absolute terminal column (1-based) */
  readonly left: number;
  /** Width in columns */
  readonly width: number;
  /** Height in rows */
  readonly height: number;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Compute absolute terminal bounds for a component positioned within
 * the Layout content area.
 *
 * Returns null when:
 * - No LayoutPositionContext is available (graceful degradation)
 * - The component is not visible
 * - The component is outside the content viewport
 *
 * @example
 * ```tsx
 * const { absoluteBounds } = useLayoutPosition({
 *   id: 'msg-42',
 *   relativeTop: 5,
 *   height: 3,
 *   visible: true,
 * });
 * ```
 */
export function useLayoutPosition(options: UseLayoutPositionOptions): {
  absoluteBounds: AbsoluteBounds | null;
} {
  const { id, relativeTop, height, visible } = options;
  const ctx = useLayoutPositionContext();

  // Register/unregister position in the context
  useEffect(() => {
    if (!ctx || !visible) return;

    ctx.registerPosition(id, {
      relativeTop,
      height,
      left: 0,
      width: ctx.contentBounds.width,
    });

    return () => {
      ctx.unregisterPosition(id);
    };
  }, [ctx, id, relativeTop, height, visible]);

  const absoluteBounds = useMemo<AbsoluteBounds | null>(() => {
    if (!ctx || !visible) return null;

    const { contentBounds } = ctx;

    // Check if the component is within the visible content viewport
    if (relativeTop + height <= 0 || relativeTop >= contentBounds.height) {
      return null;
    }

    // Convert to absolute terminal coordinates (1-based for click regions)
    return {
      top: ctx.toAbsoluteRow(relativeTop) + 1,
      left: ctx.toAbsoluteCol(0) + 1,
      width: contentBounds.width,
      height: Math.min(height, contentBounds.height - relativeTop),
    };
  }, [ctx, relativeTop, height, visible]);

  return { absoluteBounds };
}
