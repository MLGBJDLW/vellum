/**
 * VirtualizedList Item Position Context
 *
 * Provides each rendered VirtualizedList item with its relative position
 * within the content area. This enables child components (e.g. Clickable)
 * to compute their absolute terminal coordinates.
 *
 * @module tui/components/common/VirtualizedList/ItemPositionContext
 */

import React, { createContext, type ReactNode, useContext, useMemo } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Position info for a single VirtualizedList item.
 */
export interface ItemPosition {
  /** Item index in the data array */
  readonly index: number;
  /** Relative row offset from the top of the content area (accounting for scroll) */
  readonly relativeTop: number;
  /** Height of this item in terminal rows */
  readonly height: number;
}

// =============================================================================
// Context
// =============================================================================

const VirtualizedItemPositionContext = createContext<ItemPosition | null>(null);
VirtualizedItemPositionContext.displayName = "VirtualizedItemPositionContext";

// =============================================================================
// Provider
// =============================================================================

/**
 * Props for VirtualizedItemPositionProvider.
 */
export interface VirtualizedItemPositionProviderProps {
  /** Item position data */
  readonly position: ItemPosition;
  /** Children to render */
  readonly children: ReactNode;
}

/**
 * Wraps each visible VirtualizedList item with its position context.
 */
export function VirtualizedItemPositionProvider({
  position,
  children,
}: VirtualizedItemPositionProviderProps): React.JSX.Element {
  const value = useMemo(
    () => position,
    [position],
  );

  return (
    <VirtualizedItemPositionContext.Provider value={value}>
      {children}
    </VirtualizedItemPositionContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Access the current VirtualizedList item's position.
 * Returns null when called outside a VirtualizedList item render.
 */
export function useVirtualizedItemPosition(): ItemPosition | null {
  return useContext(VirtualizedItemPositionContext);
}
