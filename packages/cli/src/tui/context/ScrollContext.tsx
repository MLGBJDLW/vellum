/**
 * Scroll Context
 *
 * Centralized scroll state management for the Vellum TUI.
 * Provides a unified API for scroll position tracking and control
 * across virtualized lists and scrollable regions.
 *
 * Ported from Gemini CLI for Vellum TUI.
 *
 * @module tui/context/ScrollContext
 */

import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Current scroll state
 */
export interface ScrollState {
  /** Current scroll position from top (in lines/rows) */
  readonly scrollTop: number;
  /** Maximum scroll position (totalHeight - containerHeight) */
  readonly maxScrollTop: number;
  /** Whether scrolled to the bottom */
  readonly isAtBottom: boolean;
  /** Whether scrolled to the top */
  readonly isAtTop: boolean;
}

/**
 * Context value providing scroll state and control functions
 */
export interface ScrollContextValue {
  /** Current scroll state */
  readonly state: ScrollState;
  /**
   * Scroll to an absolute position
   * @param position - Target scroll position (clamped to valid range)
   */
  readonly scrollTo: (position: number) => void;
  /**
   * Scroll to the bottom of the content
   */
  readonly scrollToBottom: () => void;
  /**
   * Scroll to the top of the content
   */
  readonly scrollToTop: () => void;
  /**
   * Scroll by a relative amount
   * @param delta - Amount to scroll (positive = down, negative = up)
   */
  readonly scrollBy: (delta: number) => void;
  /**
   * Update the content dimensions (called by scrollable components)
   * @param totalHeight - Total content height
   * @param containerHeight - Visible container height
   */
  readonly updateDimensions: (totalHeight: number, containerHeight: number) => void;
  /**
   * Register a scroll callback for external scroll events
   * @param callback - Function called when scroll position changes externally
   * @returns Cleanup function to unregister
   */
  readonly onScrollChange: (callback: (scrollTop: number) => void) => () => void;
}

/**
 * Props for the ScrollProvider component
 */
export interface ScrollProviderProps {
  /** Children to render within the scroll context */
  readonly children: ReactNode;
  /** Initial scroll position (default: 0) */
  readonly initialScrollTop?: number;
  /** Whether to auto-scroll to bottom on new content (default: true) */
  readonly autoScrollToBottom?: boolean;
}

// =============================================================================
// Context
// =============================================================================

/**
 * React context for scroll state management
 */
export const ScrollContext = createContext<ScrollContextValue | null>(null);

// Set display name for debugging
ScrollContext.displayName = "ScrollContext";

// =============================================================================
// Provider Component
// =============================================================================

/**
 * ScrollProvider manages centralized scroll state for the TUI.
 *
 * This provider enables coordinated scrolling across multiple components,
 * such as synchronized sidebar and main content scrolling, or global
 * keyboard-driven scroll control.
 *
 * @example
 * ```tsx
 * <ScrollProvider autoScrollToBottom>
 *   <Layout>
 *     <MessageList />
 *   </Layout>
 * </ScrollProvider>
 *
 * // In a child component:
 * const { state, scrollBy, scrollToBottom } = useScroll();
 *
 * // Handle keyboard scroll
 * useEffect(() => {
 *   if (keyPressed === 'j') scrollBy(1);
 *   if (keyPressed === 'k') scrollBy(-1);
 *   if (keyPressed === 'G') scrollToBottom();
 * }, [keyPressed]);
 * ```
 */
export function ScrollProvider({
  children,
  initialScrollTop = 0,
  autoScrollToBottom = true,
}: ScrollProviderProps): React.JSX.Element {
  // Scroll position state
  const [scrollTop, setScrollTop] = useState(initialScrollTop);
  const scrollTopRef = useRef(scrollTop);

  // Content dimensions (updated by scrollable components)
  const [dimensions, setDimensions] = useState({
    totalHeight: 0,
    containerHeight: 0,
  });
  const dimensionsRef = useRef(dimensions);

  // Track if user has scrolled away from bottom
  const [userScrolledAway, setUserScrolledAway] = useState(false);

  // Callback registry for external scroll listeners
  const scrollCallbacks = useRef<Set<(scrollTop: number) => void>>(new Set());

  /**
   * Calculate derived scroll state
   */
  const maxScrollTop = Math.max(0, dimensions.totalHeight - dimensions.containerHeight);
  const isAtBottom = scrollTop >= maxScrollTop - 1; // Allow 1-line tolerance
  const isAtTop = scrollTop <= 0;

  // Keep scrollTopRef in sync for update guards
  scrollTopRef.current = scrollTop;

  /**
   * Notify all registered callbacks of scroll change
   */
  const notifyScrollChange = useCallback((newScrollTop: number) => {
    for (const callback of scrollCallbacks.current) {
      callback(newScrollTop);
    }
  }, []);

  /**
   * Scroll to an absolute position (clamped to valid range)
   */
  const scrollTo = useCallback(
    (position: number) => {
      const clamped = Math.max(0, Math.min(maxScrollTop, position));
      setScrollTop(clamped);
      setUserScrolledAway(clamped < maxScrollTop - 1);
      notifyScrollChange(clamped);
    },
    [maxScrollTop, notifyScrollChange]
  );

  /**
   * Scroll to the bottom
   */
  const scrollToBottom = useCallback(() => {
    setScrollTop(maxScrollTop);
    setUserScrolledAway(false);
    notifyScrollChange(maxScrollTop);
  }, [maxScrollTop, notifyScrollChange]);

  /**
   * Scroll to the top
   */
  const scrollToTop = useCallback(() => {
    setScrollTop(0);
    setUserScrolledAway(true);
    notifyScrollChange(0);
  }, [notifyScrollChange]);

  /**
   * Scroll by a relative amount
   */
  const scrollBy = useCallback(
    (delta: number) => {
      setScrollTop((prev) => {
        const newPos = Math.max(0, Math.min(maxScrollTop, prev + delta));
        if (delta < 0) {
          setUserScrolledAway(true);
        } else if (newPos >= maxScrollTop - 1) {
          setUserScrolledAway(false);
        }
        notifyScrollChange(newPos);
        return newPos;
      });
    },
    [maxScrollTop, notifyScrollChange]
  );

  /**
   * Update content dimensions (called by scrollable components)
   */
  const updateDimensions = useCallback(
    (totalHeight: number, containerHeight: number) => {
      const prev = dimensionsRef.current;
      if (prev.totalHeight === totalHeight && prev.containerHeight === containerHeight) {
        return;
      }

      const next = { totalHeight, containerHeight };
      dimensionsRef.current = next;
      setDimensions(next);

      // Auto-scroll to bottom if enabled and user hasn't scrolled away
      if (autoScrollToBottom && !userScrolledAway) {
        const newMax = Math.max(0, totalHeight - containerHeight);
        if (scrollTopRef.current !== newMax) {
          scrollTopRef.current = newMax;
          setScrollTop(newMax);
          notifyScrollChange(newMax);
        }
      }
    },
    [autoScrollToBottom, userScrolledAway, notifyScrollChange]
  );

  /**
   * Register a scroll change callback
   */
  const onScrollChange = useCallback((callback: (scrollTop: number) => void): (() => void) => {
    scrollCallbacks.current.add(callback);
    return () => {
      scrollCallbacks.current.delete(callback);
    };
  }, []);

  /**
   * Memoized scroll state
   */
  const state = useMemo<ScrollState>(
    () => ({
      scrollTop,
      maxScrollTop,
      isAtBottom,
      isAtTop,
    }),
    [scrollTop, maxScrollTop, isAtBottom, isAtTop]
  );

  /**
   * Memoized context value
   */
  const contextValue = useMemo<ScrollContextValue>(
    () => ({
      state,
      scrollTo,
      scrollToBottom,
      scrollToTop,
      scrollBy,
      updateDimensions,
      onScrollChange,
    }),
    [state, scrollTo, scrollToBottom, scrollToTop, scrollBy, updateDimensions, onScrollChange]
  );

  return <ScrollContext.Provider value={contextValue}>{children}</ScrollContext.Provider>;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to access the scroll context.
 *
 * @returns The scroll context value
 * @throws Error if used outside of a ScrollProvider
 *
 * @example
 * ```tsx
 * function ScrollIndicator() {
 *   const { state } = useScroll();
 *
 *   return (
 *     <Text>
 *       {state.isAtTop ? '⬆ Top' : state.isAtBottom ? '⬇ Bottom' : `${state.scrollTop}/${state.maxScrollTop}`}
 *     </Text>
 *   );
 * }
 * ```
 */
export function useScroll(): ScrollContextValue {
  const context = useContext(ScrollContext);

  if (context === null) {
    throw new Error("useScroll must be used within a ScrollProvider");
  }

  return context;
}

/**
 * Optional hook that returns null instead of throwing when used outside provider.
 * Useful for components that may work with or without scroll context.
 *
 * @returns The scroll context value or null if not within a provider
 */
export function useScrollOptional(): ScrollContextValue | null {
  return useContext(ScrollContext);
}

/**
 * Hook that returns only the scroll state (no control functions).
 * Useful for read-only scroll position display.
 *
 * @returns The current scroll state
 * @throws Error if used outside of a ScrollProvider
 */
export function useScrollState(): ScrollState {
  const { state } = useScroll();
  return state;
}
