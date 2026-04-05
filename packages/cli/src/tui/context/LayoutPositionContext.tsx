/**
 * Layout Position Context
 *
 * Tracks the absolute terminal position of the content area within Layout,
 * enabling child components (e.g. VirtualizedList items) to compute their
 * absolute terminal coordinates for click-region registration.
 *
 * @module tui/context/LayoutPositionContext
 */

import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Absolute terminal bounds of the content area.
 */
export interface ContentBounds {
  /** Absolute terminal row where content area starts (0-based) */
  readonly top: number;
  /** Left column of content area */
  readonly left: number;
  /** Width of content area in columns */
  readonly width: number;
  /** Height of content area in visible rows */
  readonly height: number;
}

/**
 * Registered position of a component within the content area.
 */
interface RegisteredPosition {
  readonly relativeTop: number;
  readonly height: number;
  readonly left: number;
  readonly width: number;
}

/**
 * Value provided by LayoutPositionContext.
 */
export interface LayoutPositionContextValue {
  /** Absolute terminal bounds of the content area */
  readonly contentBounds: ContentBounds;
  /** Convert a relative row within content area to absolute terminal row */
  readonly toAbsoluteRow: (relativeRow: number) => number;
  /** Convert a relative col within content area to absolute terminal col */
  readonly toAbsoluteCol: (relativeCol: number) => number;
  /** Register a component's position within the content area */
  readonly registerPosition: (
    id: string,
    bounds: { relativeTop: number; height: number; left: number; width: number }
  ) => void;
  /** Unregister a component's position */
  readonly unregisterPosition: (id: string) => void;
}

// =============================================================================
// Context
// =============================================================================

const LayoutPositionContext = createContext<LayoutPositionContextValue | null>(null);
LayoutPositionContext.displayName = "LayoutPositionContext";

// =============================================================================
// Provider
// =============================================================================

/**
 * Props for LayoutPositionProvider.
 */
export interface LayoutPositionProviderProps {
  /** Content bounds computed by Layout */
  readonly contentBounds: ContentBounds;
  /** Children to render */
  readonly children: ReactNode;
}

/**
 * Provides layout position context to child components.
 *
 * Wraps the content body area within Layout so that children can
 * convert relative positions to absolute terminal coordinates.
 */
export function LayoutPositionProvider({
  contentBounds,
  children,
}: LayoutPositionProviderProps): React.JSX.Element {
  // Mutable map for registered positions — mutations don't trigger re-renders
  const positionsRef = useRef<Map<string, RegisteredPosition>>(new Map());

  const toAbsoluteRow = useCallback(
    (relativeRow: number): number => contentBounds.top + relativeRow,
    [contentBounds.top]
  );

  const toAbsoluteCol = useCallback(
    (relativeCol: number): number => contentBounds.left + relativeCol,
    [contentBounds.left]
  );

  const registerPosition = useCallback(
    (id: string, bounds: { relativeTop: number; height: number; left: number; width: number }) => {
      positionsRef.current.set(id, bounds);
    },
    []
  );

  const unregisterPosition = useCallback((id: string) => {
    positionsRef.current.delete(id);
  }, []);

  const value = useMemo<LayoutPositionContextValue>(
    () => ({
      contentBounds,
      toAbsoluteRow,
      toAbsoluteCol,
      registerPosition,
      unregisterPosition,
    }),
    [contentBounds, toAbsoluteRow, toAbsoluteCol, registerPosition, unregisterPosition]
  );

  return <LayoutPositionContext.Provider value={value}>{children}</LayoutPositionContext.Provider>;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Access the layout position context.
 * Returns null when called outside a LayoutPositionProvider (graceful degradation).
 */
export function useLayoutPositionContext(): LayoutPositionContextValue | null {
  return useContext(LayoutPositionContext);
}

export { LayoutPositionContext };
