/**
 * Scroll Controller Hook
 *
 * Manages scroll state for message viewport with follow/manual modes.
 * Provides a state machine for automatic scrolling (follow) vs manual
 * navigation, with smooth transitions between modes.
 *
 * State Machine:
 * ```
 * follow ──[scrollUp/PageUp/MouseWheel]──> manual
 * manual ──[scrollToBottom/End/reach-bottom]──> follow
 * manual ──[newMessage]──> stay manual, increment newMessageCount
 * follow ──[newMessage]──> stay follow, auto-scroll
 * ```
 *
 * @module tui/hooks/useScrollController
 */

import { useCallback, useMemo, useReducer } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Scroll mode determines auto-scroll behavior.
 * - follow: Automatically scroll to bottom on new content
 * - manual: User is manually scrolling, don't auto-scroll
 */
export type ScrollMode = "follow" | "manual";

/**
 * Immutable scroll state for viewport scroll controller.
 * Named ViewportScrollState to avoid conflicts with ScrollContext.ScrollState.
 */
export interface ViewportScrollState {
  /** Current scroll mode */
  readonly mode: ScrollMode;
  /** Offset from bottom in lines (0 = at bottom) */
  readonly offsetFromBottom: number;
  /** Number of new messages since entering manual mode */
  readonly newMessageCount: number;
  /** Total scrollable height in lines */
  readonly totalHeight: number;
  /** Visible viewport height in lines */
  readonly viewportHeight: number;
}

/**
 * Actions for controlling viewport scroll behavior.
 */
export interface ViewportScrollActions {
  /** Scroll up by N lines (default: scrollStep from options) */
  scrollUp(lines?: number): void;
  /** Scroll down by N lines (default: scrollStep from options) */
  scrollDown(lines?: number): void;
  /** Jump to specific offset from bottom */
  jumpTo(offset: number): void;
  /** Return to follow mode (scroll to bottom) */
  scrollToBottom(): void;
  /** Update total height (called when messages change) */
  setTotalHeight(height: number): void;
  /** Update viewport height (called when terminal resizes) */
  setViewportHeight(height: number): void;
  /** Notify new message arrived */
  notifyNewMessage(): void;
}

/**
 * Options for useScrollController hook.
 */
export interface UseScrollControllerOptions {
  /** Viewport height in lines */
  readonly viewportHeight: number;
  /** Initial total height */
  readonly initialTotalHeight?: number;
  /** Lines to scroll per action (default: 3) */
  readonly scrollStep?: number;
  /** Auto-switch to follow when reaching bottom (default: true) */
  readonly autoFollowOnBottom?: boolean;
}

// =============================================================================
// Reducer
// =============================================================================

/**
 * Internal state shape (same as ScrollState but mutable for reducer)
 */
interface InternalState {
  mode: ScrollMode;
  offsetFromBottom: number;
  newMessageCount: number;
  totalHeight: number;
  viewportHeight: number;
}

/**
 * Action types for the scroll reducer
 */
type ScrollAction =
  | { type: "SCROLL_UP"; lines: number; autoFollowOnBottom: boolean }
  | { type: "SCROLL_DOWN"; lines: number; autoFollowOnBottom: boolean }
  | { type: "JUMP_TO"; offset: number; autoFollowOnBottom: boolean }
  | { type: "SCROLL_TO_BOTTOM" }
  | { type: "SET_TOTAL_HEIGHT"; height: number }
  | { type: "SET_VIEWPORT_HEIGHT"; height: number }
  | { type: "NEW_MESSAGE" };

/**
 * Computes the maximum scrollable offset (how far up we can scroll)
 */
function getMaxOffset(totalHeight: number, viewportHeight: number): number {
  return Math.max(0, totalHeight - viewportHeight);
}

/**
 * Clamps offset to valid range [0, maxOffset]
 */
function clampOffset(offset: number, totalHeight: number, viewportHeight: number): number {
  const maxOffset = getMaxOffset(totalHeight, viewportHeight);
  return Math.max(0, Math.min(offset, maxOffset));
}

/**
 * Reducer for scroll state management
 */
function scrollReducer(state: InternalState, action: ScrollAction): InternalState {
  switch (action.type) {
    case "SCROLL_UP": {
      // Scrolling up switches to manual mode
      const newOffset = clampOffset(
        state.offsetFromBottom + action.lines,
        state.totalHeight,
        state.viewportHeight
      );

      // Only switch to manual if we actually moved
      if (newOffset === state.offsetFromBottom) {
        return state;
      }

      return {
        ...state,
        mode: "manual",
        offsetFromBottom: newOffset,
      };
    }

    case "SCROLL_DOWN": {
      const newOffset = clampOffset(
        state.offsetFromBottom - action.lines,
        state.totalHeight,
        state.viewportHeight
      );

      // If we've reached the bottom and autoFollow is enabled, switch to follow mode
      if (newOffset === 0 && action.autoFollowOnBottom) {
        return {
          ...state,
          mode: "follow",
          offsetFromBottom: 0,
          newMessageCount: 0,
        };
      }

      // Only update if offset changed
      if (newOffset === state.offsetFromBottom) {
        return state;
      }

      return {
        ...state,
        offsetFromBottom: newOffset,
      };
    }

    case "JUMP_TO": {
      const newOffset = clampOffset(action.offset, state.totalHeight, state.viewportHeight);

      // If jumping to bottom with autoFollow, switch to follow mode
      if (newOffset === 0 && action.autoFollowOnBottom) {
        if (
          state.mode === "follow" &&
          state.offsetFromBottom === 0 &&
          state.newMessageCount === 0
        ) {
          return state;
        }
        return {
          ...state,
          mode: "follow",
          offsetFromBottom: 0,
          newMessageCount: 0,
        };
      }

      // If jumping away from bottom, switch to manual
      const newMode = newOffset > 0 ? "manual" : state.mode;

      if (newOffset === state.offsetFromBottom && newMode === state.mode) {
        return state;
      }

      return {
        ...state,
        mode: newMode,
        offsetFromBottom: newOffset,
        // Reset new message count only if returning to follow
        newMessageCount: newMode === "follow" ? 0 : state.newMessageCount,
      };
    }

    case "SCROLL_TO_BOTTOM": {
      return {
        ...state,
        mode: "follow",
        offsetFromBottom: 0,
        newMessageCount: 0,
      };
    }

    case "SET_TOTAL_HEIGHT": {
      const newTotalHeight = Math.max(0, action.height);

      // In follow mode, keep offset at 0
      if (state.mode === "follow") {
        if (newTotalHeight === state.totalHeight && state.offsetFromBottom === 0) {
          return state;
        }
        return {
          ...state,
          totalHeight: newTotalHeight,
          offsetFromBottom: 0,
        };
      }

      // In manual mode, maintain the offset but clamp to valid range
      const clampedOffset = clampOffset(
        state.offsetFromBottom,
        newTotalHeight,
        state.viewportHeight
      );

      if (newTotalHeight === state.totalHeight && clampedOffset === state.offsetFromBottom) {
        return state;
      }

      return {
        ...state,
        totalHeight: newTotalHeight,
        offsetFromBottom: clampedOffset,
      };
    }

    case "SET_VIEWPORT_HEIGHT": {
      const newViewportHeight = Math.max(1, action.height);

      // Clamp offset to valid range with new viewport
      const clampedOffset = clampOffset(
        state.offsetFromBottom,
        state.totalHeight,
        newViewportHeight
      );

      if (newViewportHeight === state.viewportHeight && clampedOffset === state.offsetFromBottom) {
        return state;
      }

      return {
        ...state,
        viewportHeight: newViewportHeight,
        offsetFromBottom: clampedOffset,
      };
    }

    case "NEW_MESSAGE": {
      if (state.mode === "follow") {
        // In follow mode, stay at bottom (no state change needed)
        return state;
      }

      // In manual mode, increment counter
      return {
        ...state,
        newMessageCount: state.newMessageCount + 1,
      };
    }

    default:
      return state;
  }
}

// =============================================================================
// Hook
// =============================================================================

/**
 * useScrollController - Manages scroll state for message viewport
 *
 * Provides a state machine for follow/manual scroll modes with
 * automatic mode transitions based on user actions.
 *
 * @example
 * ```tsx
 * const [scrollState, scrollActions] = useScrollController({
 *   viewportHeight: terminalHeight - headerHeight,
 *   initialTotalHeight: messages.length * avgLineHeight,
 * });
 *
 * // In your scroll handler
 * useInput((input, key) => {
 *   if (key.pageUp) scrollActions.scrollUp(scrollState.viewportHeight / 2);
 *   if (key.pageDown) scrollActions.scrollDown(scrollState.viewportHeight / 2);
 *   if (key.end) scrollActions.scrollToBottom();
 * });
 *
 * // When messages change
 * useEffect(() => {
 *   scrollActions.setTotalHeight(newHeight);
 *   scrollActions.notifyNewMessage();
 * }, [messages]);
 *
 * // Show "X new messages" badge when in manual mode
 * if (scrollState.mode === 'manual' && scrollState.newMessageCount > 0) {
 *   showNewMessagesBadge(scrollState.newMessageCount);
 * }
 * ```
 *
 * @param options - Configuration options
 * @returns Tuple of [state, actions]
 */
export function useScrollController(
  options: UseScrollControllerOptions
): [ViewportScrollState, ViewportScrollActions] {
  const {
    viewportHeight,
    initialTotalHeight = 0,
    scrollStep = 3,
    autoFollowOnBottom = true,
  } = options;

  // Initialize reducer state
  const [state, dispatch] = useReducer(scrollReducer, {
    mode: "follow",
    offsetFromBottom: 0,
    newMessageCount: 0,
    totalHeight: Math.max(0, initialTotalHeight),
    viewportHeight: Math.max(1, viewportHeight),
  });

  // Create memoized actions
  const scrollUp = useCallback(
    (lines: number = scrollStep) => {
      dispatch({ type: "SCROLL_UP", lines, autoFollowOnBottom });
    },
    [scrollStep, autoFollowOnBottom]
  );

  const scrollDown = useCallback(
    (lines: number = scrollStep) => {
      dispatch({ type: "SCROLL_DOWN", lines, autoFollowOnBottom });
    },
    [scrollStep, autoFollowOnBottom]
  );

  const jumpTo = useCallback(
    (offset: number) => {
      dispatch({ type: "JUMP_TO", offset, autoFollowOnBottom });
    },
    [autoFollowOnBottom]
  );

  const scrollToBottom = useCallback(() => {
    dispatch({ type: "SCROLL_TO_BOTTOM" });
  }, []);

  const setTotalHeight = useCallback((height: number) => {
    dispatch({ type: "SET_TOTAL_HEIGHT", height });
  }, []);

  const setViewportHeight = useCallback((height: number) => {
    dispatch({ type: "SET_VIEWPORT_HEIGHT", height });
  }, []);

  const notifyNewMessage = useCallback(() => {
    dispatch({ type: "NEW_MESSAGE" });
  }, []);

  // Bundle actions
  const actions: ViewportScrollActions = useMemo(
    () => ({
      scrollUp,
      scrollDown,
      jumpTo,
      scrollToBottom,
      setTotalHeight,
      setViewportHeight,
      notifyNewMessage,
    }),
    [
      scrollUp,
      scrollDown,
      jumpTo,
      scrollToBottom,
      setTotalHeight,
      setViewportHeight,
      notifyNewMessage,
    ]
  );

  return [state, actions];
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate visible scroll position as a percentage (0-100)
 */
export function getScrollPercentage(state: ViewportScrollState): number {
  const maxOffset = getMaxOffset(state.totalHeight, state.viewportHeight);
  if (maxOffset === 0) return 100;
  return Math.round(((maxOffset - state.offsetFromBottom) / maxOffset) * 100);
}

/**
 * Check if content is scrollable (exceeds viewport)
 */
export function isScrollable(state: ViewportScrollState): boolean {
  return state.totalHeight > state.viewportHeight;
}

/**
 * Check if currently at the top
 */
export function isAtTop(state: ViewportScrollState): boolean {
  const maxOffset = getMaxOffset(state.totalHeight, state.viewportHeight);
  return state.offsetFromBottom >= maxOffset;
}

/**
 * Check if currently at the bottom
 */
export function isAtBottom(state: ViewportScrollState): boolean {
  return state.offsetFromBottom === 0;
}
