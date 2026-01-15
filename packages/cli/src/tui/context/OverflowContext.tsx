/**
 * Overflow Context
 *
 * Tracks which components are currently overflowing their containers.
 * This enables smart truncation and "Show More" functionality.
 *
 * Ported from Gemini CLI for Vellum TUI.
 *
 * @module tui/context/OverflowContext
 */

import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * State tracking which component IDs are currently overflowing
 */
export interface OverflowState {
  /** Set of component IDs that are currently overflowing */
  readonly overflowingIds: ReadonlySet<string>;
}

/**
 * Context value providing overflow state and management functions
 */
export interface OverflowContextValue {
  /** Current overflow state */
  readonly state: OverflowState;
  /**
   * Register a component as overflowing
   * @param id - Unique identifier for the component
   */
  readonly registerOverflow: (id: string) => void;
  /**
   * Unregister a component from the overflow set
   * @param id - Unique identifier for the component
   */
  readonly unregisterOverflow: (id: string) => void;
  /**
   * Check if a specific component is overflowing
   * @param id - Unique identifier for the component
   * @returns true if the component is currently overflowing
   */
  readonly isOverflowing: (id: string) => boolean;
}

/**
 * Props for the OverflowProvider component
 */
export interface OverflowProviderProps {
  /** Children to render within the overflow context */
  readonly children: ReactNode;
}

// =============================================================================
// Context
// =============================================================================

/**
 * Initial overflow state
 */
const initialState: OverflowState = {
  overflowingIds: new Set<string>(),
};

/**
 * React context for overflow state management
 */
export const OverflowContext = createContext<OverflowContextValue | null>(null);

// Set display name for debugging
OverflowContext.displayName = "OverflowContext";

// =============================================================================
// Provider Component
// =============================================================================

/**
 * OverflowProvider manages tracking of overflowing components.
 *
 * Components can register themselves as overflowing when their content
 * exceeds their container bounds, enabling parent components to respond
 * appropriately (e.g., showing truncation indicators or "Show More" buttons).
 *
 * @example
 * ```tsx
 * <OverflowProvider>
 *   <App />
 * </OverflowProvider>
 *
 * // In a child component:
 * const { registerOverflow, unregisterOverflow, isOverflowing } = useOverflow();
 *
 * useEffect(() => {
 *   if (contentHeight > containerHeight) {
 *     registerOverflow('my-component-id');
 *   } else {
 *     unregisterOverflow('my-component-id');
 *   }
 * }, [contentHeight, containerHeight]);
 * ```
 */
export function OverflowProvider({ children }: OverflowProviderProps): React.JSX.Element {
  const [overflowingIds, setOverflowingIds] = useState<ReadonlySet<string>>(
    initialState.overflowingIds
  );

  /**
   * Register a component as overflowing
   */
  const registerOverflow = useCallback((id: string) => {
    setOverflowingIds((prev) => {
      if (prev.has(id)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  /**
   * Unregister a component from the overflow set
   */
  const unregisterOverflow = useCallback((id: string) => {
    setOverflowingIds((prev) => {
      if (!prev.has(id)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  /**
   * Check if a specific component is overflowing
   */
  const isOverflowing = useCallback(
    (id: string): boolean => {
      return overflowingIds.has(id);
    },
    [overflowingIds]
  );

  /**
   * Memoized context value to prevent unnecessary re-renders
   */
  const contextValue = useMemo<OverflowContextValue>(
    () => ({
      state: { overflowingIds },
      registerOverflow,
      unregisterOverflow,
      isOverflowing,
    }),
    [overflowingIds, registerOverflow, unregisterOverflow, isOverflowing]
  );

  return <OverflowContext.Provider value={contextValue}>{children}</OverflowContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access the overflow context.
 *
 * @returns The overflow context value
 * @throws Error if used outside of an OverflowProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { registerOverflow, isOverflowing } = useOverflow();
 *
 *   if (isOverflowing('my-id')) {
 *     return <Text>Content is overflowing!</Text>;
 *   }
 *
 *   return <Text>Content fits</Text>;
 * }
 * ```
 */
export function useOverflow(): OverflowContextValue {
  const context = useContext(OverflowContext);

  if (context === null) {
    throw new Error("useOverflow must be used within an OverflowProvider");
  }

  return context;
}

/**
 * Optional hook that returns null instead of throwing when used outside provider.
 * Useful for components that may be used with or without overflow tracking.
 *
 * @returns The overflow context value or null if not within a provider
 */
export function useOverflowOptional(): OverflowContextValue | null {
  return useContext(OverflowContext);
}
