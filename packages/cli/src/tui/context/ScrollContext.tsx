/**
 * Scroll Context
 *
 * Centralized scroll state management for the Vellum TUI.
 * Provides a unified API for scroll position tracking and control
 * across virtualized lists and scrollable regions.
 *
 * Split into two contexts to prevent unnecessary re-renders:
 * - ScrollStateContext: Reactive state (scrollTop, maxScroll, etc.)
 * - ScrollActionsContext: Stable action functions (scrollTo, scrollBy, etc.)
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
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createScrollNormalizerWithReset,
  getScrollConfig,
  type ScrollNormalizerWithReset,
} from "../utils/terminal-scroll.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Current scroll state (reactive - changes trigger re-renders)
 */
export interface ScrollState {
  /** Current scroll position from top (in lines/rows) */
  readonly scrollTop: number;
  /** Maximum scroll position (totalHeight - containerHeight) */
  readonly maxScrollTop: number;
  /** @alias maxScrollTop - Alias for compatibility */
  readonly maxScroll: number;
  /** Whether scrolled to the bottom */
  readonly isAtBottom: boolean;
  /** Whether scrolled to the top */
  readonly isAtTop: boolean;
  /** Visible container height */
  readonly containerHeight: number;
  /** Total content height */
  readonly totalContentHeight: number;
}

/**
 * Scroll actions (stable - references never change)
 */
export interface ScrollActions {
  /**
   * Scroll to an absolute position
   * @param offset - Target scroll position (clamped to valid range)
   */
  readonly scrollTo: (offset: number) => void;
  /**
   * Scroll by a relative amount
   * @param delta - Amount to scroll (positive = down, negative = up)
   */
  readonly scrollBy: (delta: number) => void;
  /**
   * Scroll to the bottom of the content
   */
  readonly scrollToBottom: () => void;
  /**
   * Scroll to the top of the content
   */
  readonly scrollToTop: () => void;
  /**
   * Register a scrollable region
   * @param id - Unique identifier for the scrollable region
   */
  readonly registerScrollable: (id: string) => void;
  /**
   * Unregister a scrollable region
   * @param id - Identifier of the scrollable region to remove
   */
  readonly unregisterScrollable: (id: string) => void;
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
 * Combined context value (for backward compatibility)
 * @deprecated Use useScrollState() and useScrollActions() separately for better performance
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
// Contexts
// =============================================================================

/**
 * React context for scroll state (reactive)
 */
export const ScrollStateContext = createContext<ScrollState | null>(null);
ScrollStateContext.displayName = "ScrollStateContext";

/**
 * React context for scroll actions (stable)
 */
export const ScrollActionsContext = createContext<ScrollActions | null>(null);
ScrollActionsContext.displayName = "ScrollActionsContext";

/**
 * React context for scroll state management (combined - for backward compatibility)
 * @deprecated Use ScrollStateContext and ScrollActionsContext separately
 */
export const ScrollContext = createContext<ScrollContextValue | null>(null);
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
 * The provider is split into two contexts for performance optimization:
 * - ScrollStateContext: Contains reactive state that triggers re-renders
 * - ScrollActionsContext: Contains stable action functions that never change
 *
 * @example
 * ```tsx
 * <ScrollProvider autoScrollToBottom>
 *   <Layout>
 *     <MessageList />
 *   </Layout>
 * </ScrollProvider>
 *
 * // In a child component - use separate hooks for better performance:
 * const { scrollTop, isAtBottom } = useScrollState(); // Only re-renders on state change
 * const { scrollBy, scrollToBottom } = useScrollActions(); // Never causes re-renders
 *
 * // Or use the combined hook for backward compatibility:
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

  // Registered scrollable regions
  const scrollableRegions = useRef<Set<string>>(new Set());

  // Terminal scroll normalizer for consistent scroll speed across terminals
  const scrollNormalizerRef = useRef<ScrollNormalizerWithReset | null>(null);
  if (!scrollNormalizerRef.current) {
    const config = getScrollConfig();
    scrollNormalizerRef.current = createScrollNormalizerWithReset(
      config.eventsPerTick,
      config.linesPerEvent
    );
  }

  // Cleanup scroll normalizer on unmount
  useEffect(() => {
    return () => {
      scrollNormalizerRef.current?.reset();
    };
  }, []);

  // Refs for stable action callbacks (avoid stale closures)
  const maxScrollTopRef = useRef(0);
  const autoScrollToBottomRef = useRef(autoScrollToBottom);
  const userScrolledAwayRef = useRef(userScrolledAway);

  /**
   * Calculate derived scroll state
   */
  const maxScrollTop = Math.max(0, dimensions.totalHeight - dimensions.containerHeight);
  const isAtBottom = scrollTop >= maxScrollTop - 1; // Allow 1-line tolerance
  const isAtTop = scrollTop <= 0;

  // Keep refs in sync
  scrollTopRef.current = scrollTop;
  maxScrollTopRef.current = maxScrollTop;
  autoScrollToBottomRef.current = autoScrollToBottom;
  userScrolledAwayRef.current = userScrolledAway;
  dimensionsRef.current = dimensions;

  /**
   * Notify all registered callbacks of scroll change
   */
  const notifyScrollChange = useCallback((newScrollTop: number) => {
    for (const callback of scrollCallbacks.current) {
      callback(newScrollTop);
    }
  }, []);

  // ==========================================================================
  // Stable Actions (useCallback with empty deps for referential stability)
  // ==========================================================================

  /**
   * Scroll to an absolute position (clamped to valid range)
   */
  const scrollTo = useCallback(
    (position: number) => {
      const clamped = Math.max(0, Math.min(maxScrollTopRef.current, position));
      setScrollTop(clamped);
      setUserScrolledAway(clamped < maxScrollTopRef.current - 1);
      notifyScrollChange(clamped);
    },
    [notifyScrollChange]
  );

  /**
   * Scroll to the bottom
   */
  const scrollToBottom = useCallback(() => {
    const maxScroll = maxScrollTopRef.current;
    setScrollTop(maxScroll);
    setUserScrolledAway(false);
    notifyScrollChange(maxScroll);
  }, [notifyScrollChange]);

  /**
   * Scroll to the top
   */
  const scrollToTop = useCallback(() => {
    setScrollTop(0);
    setUserScrolledAway(true);
    notifyScrollChange(0);
  }, [notifyScrollChange]);

  /**
   * Scroll by a relative amount.
   * Raw delta is normalized through terminal-scroll normalizer for consistent
   * scroll speed across VS Code, iTerm2, Windows Terminal, etc.
   */
  const scrollBy = useCallback(
    (delta: number) => {
      // Normalize scroll delta for consistent behavior across terminals
      const normalizedDelta = scrollNormalizerRef.current
        ? scrollNormalizerRef.current.normalize(delta)
        : delta;

      // Skip if normalizer consumed the delta (accumulating fractional scrolls)
      if (normalizedDelta === 0) {
        return;
      }

      setScrollTop((prev) => {
        const maxScroll = maxScrollTopRef.current;
        const newPos = Math.max(0, Math.min(maxScroll, prev + normalizedDelta));
        if (normalizedDelta < 0) {
          setUserScrolledAway(true);
        } else if (newPos >= maxScroll - 1) {
          setUserScrolledAway(false);
        }
        notifyScrollChange(newPos);
        return newPos;
      });
    },
    [notifyScrollChange]
  );

  /**
   * Register a scrollable region
   */
  const registerScrollable = useCallback((id: string) => {
    scrollableRegions.current.add(id);
  }, []);

  /**
   * Unregister a scrollable region
   */
  const unregisterScrollable = useCallback((id: string) => {
    scrollableRegions.current.delete(id);
  }, []);

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
      if (autoScrollToBottomRef.current && !userScrolledAwayRef.current) {
        const newMax = Math.max(0, totalHeight - containerHeight);
        if (scrollTopRef.current !== newMax) {
          scrollTopRef.current = newMax;
          setScrollTop(newMax);
          notifyScrollChange(newMax);
        }
      }
    },
    [notifyScrollChange]
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

  // ==========================================================================
  // Memoized Context Values
  // ==========================================================================

  /**
   * Memoized scroll state (reactive - changes on scroll)
   */
  const stateValue = useMemo<ScrollState>(
    () => ({
      scrollTop,
      maxScrollTop,
      maxScroll: maxScrollTop, // Alias for compatibility
      isAtBottom,
      isAtTop,
      containerHeight: dimensions.containerHeight,
      totalContentHeight: dimensions.totalHeight,
    }),
    [
      scrollTop,
      maxScrollTop,
      isAtBottom,
      isAtTop,
      dimensions.containerHeight,
      dimensions.totalHeight,
    ]
  );

  /**
   * Memoized scroll actions (stable - never changes after mount)
   */
  const actionsValue = useMemo<ScrollActions>(
    () => ({
      scrollTo,
      scrollBy,
      scrollToBottom,
      scrollToTop,
      registerScrollable,
      unregisterScrollable,
      updateDimensions,
      onScrollChange,
    }),
    [
      scrollTo,
      scrollBy,
      scrollToBottom,
      scrollToTop,
      registerScrollable,
      unregisterScrollable,
      updateDimensions,
      onScrollChange,
    ]
  );

  /**
   * Memoized combined context value (for backward compatibility)
   */
  const contextValue = useMemo<ScrollContextValue>(
    () => ({
      state: stateValue,
      scrollTo,
      scrollToBottom,
      scrollToTop,
      scrollBy,
      updateDimensions,
      onScrollChange,
    }),
    [stateValue, scrollTo, scrollToBottom, scrollToTop, scrollBy, updateDimensions, onScrollChange]
  );

  return (
    <ScrollActionsContext.Provider value={actionsValue}>
      <ScrollStateContext.Provider value={stateValue}>
        <ScrollContext.Provider value={contextValue}>{children}</ScrollContext.Provider>
      </ScrollStateContext.Provider>
    </ScrollActionsContext.Provider>
  );
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to access the scroll state (reactive).
 * Only re-renders when scroll state changes.
 *
 * @returns The current scroll state
 * @throws Error if used outside of a ScrollProvider
 *
 * @example
 * ```tsx
 * function ScrollIndicator() {
 *   const { scrollTop, isAtBottom, maxScroll } = useScrollState();
 *
 *   return (
 *     <Text>
 *       {scrollTop}/{maxScroll} {isAtBottom ? '⬇ Bottom' : ''}
 *     </Text>
 *   );
 * }
 * ```
 */
export function useScrollState(): ScrollState {
  const context = useContext(ScrollStateContext);

  if (context === null) {
    throw new Error("useScrollState must be used within a ScrollProvider");
  }

  return context;
}

/**
 * Hook to access scroll actions (stable).
 * Never causes re-renders since actions are referentially stable.
 *
 * @returns The scroll action functions
 * @throws Error if used outside of a ScrollProvider
 *
 * @example
 * ```tsx
 * function ScrollControls() {
 *   const { scrollBy, scrollToBottom, scrollToTop } = useScrollActions();
 *
 *   // These handlers never change, safe for useEffect deps
 *   useEffect(() => {
 *     const handleKeyDown = (e: KeyboardEvent) => {
 *       if (e.key === 'j') scrollBy(1);
 *       if (e.key === 'k') scrollBy(-1);
 *       if (e.key === 'G') scrollToBottom();
 *       if (e.key === 'g') scrollToTop();
 *     };
 *     window.addEventListener('keydown', handleKeyDown);
 *     return () => window.removeEventListener('keydown', handleKeyDown);
 *   }, [scrollBy, scrollToBottom, scrollToTop]); // Stable deps
 * }
 * ```
 */
export function useScrollActions(): ScrollActions {
  const context = useContext(ScrollActionsContext);

  if (context === null) {
    throw new Error("useScrollActions must be used within a ScrollProvider");
  }

  return context;
}

/**
 * Hook to access the combined scroll context (backward compatibility).
 *
 * @deprecated For better performance, use useScrollState() for state and
 * useScrollActions() for actions separately. This prevents unnecessary
 * re-renders when only actions are needed.
 *
 * @returns The combined scroll context value
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
 * Optional hook for scroll state that returns null instead of throwing.
 *
 * @returns The scroll state or null if not within a provider
 */
export function useScrollStateOptional(): ScrollState | null {
  return useContext(ScrollStateContext);
}

/**
 * Optional hook for scroll actions that returns null instead of throwing.
 *
 * @returns The scroll actions or null if not within a provider
 */
export function useScrollActionsOptional(): ScrollActions | null {
  return useContext(ScrollActionsContext);
}
