/**
 * useStickyBottom Hook
 *
 * Implements a 3-state Follow Mode state machine for intelligent sticky-bottom detection.
 * This approach handles edge cases that a single-condition check cannot:
 *
 * 1. User lightly scrolls up → auto-scroll disables (off)
 * 2. User scrolls back down to bottom → auto-scroll restores (auto)
 * 3. Keyboard navigation (Page Up/Down) → doesn't break sticky
 * 4. User presses End / clicks "scroll to bottom" → locks follow (locked)
 *
 * State Machine:
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                                                              │
 * │    ┌──────┐    wheel-up    ┌─────┐    scroll-to-bottom      │
 * │    │ auto │ ─────────────> │ off │ ───────────────────┐     │
 * │    └──────┘                └─────┘                    │     │
 * │        │                      │                       │     │
 * │        │ new content          │ keyboard (End)        │     │
 * │        │ (auto-scroll)        │                       │     │
 * │        v                      v                       │     │
 * │    ┌──────┐              ┌────────┐                   │     │
 * │    │ auto │ <─────────── │ locked │ <─────────────────┘     │
 * │    └──────┘   content    └────────┘                         │
 * │               stable                                        │
 * │                                                              │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * @module tui/components/common/VirtualizedList/hooks/useStickyBottom
 */

import { useCallback, useEffect, useReducer, useRef } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Follow mode states for sticky-bottom behavior.
 *
 * - `auto`: Default state. Automatically follows new content.
 * - `off`: User scrolled away from bottom (wheel-up). No auto-follow.
 * - `locked`: User explicitly requested bottom (End key / button). Locks follow until content stable.
 */
export type FollowMode = "auto" | "off" | "locked";

/**
 * Scroll event source for distinguishing user intent.
 */
export type ScrollSource = "wheel" | "keyboard" | "programmatic";

/**
 * Internal state for the sticky-bottom reducer.
 */
export interface StickyBottomInternalState {
  /** Current follow mode */
  followMode: FollowMode;
  /** Last scroll direction from user input */
  lastScrollDirection: "up" | "down" | null;
  /** Number of new messages while in 'off' mode */
  newMessageCount: number;
  /** Previous data length for detecting new content */
  prevDataLength: number;
  /** Timestamp when locked mode was entered (for stability detection) */
  lockedAt: number | null;
}

/**
 * Actions for the sticky-bottom reducer.
 */
export type StickyBottomAction =
  | { type: "SCROLL"; delta: number; source: ScrollSource; isAtBottom: boolean }
  | { type: "SCROLL_TO_BOTTOM_AND_LOCK" }
  | { type: "NEW_CONTENT"; dataLength: number; isStreaming: boolean }
  | { type: "CONTENT_STABLE" }
  | { type: "CLEAR_NEW_MESSAGE_COUNT" }
  | { type: "REACHED_BOTTOM" };

// ============================================================================
// Constants
// ============================================================================

/** Time threshold for content stability (ms) - exit locked mode after this */
export const CONTENT_STABLE_THRESHOLD_MS = 500;

// ============================================================================
// Reducer
// ============================================================================

export const initialState: StickyBottomInternalState = {
  followMode: "auto",
  lastScrollDirection: null,
  newMessageCount: 0,
  prevDataLength: 0,
  lockedAt: null,
};

/**
 * Reducer for the sticky-bottom state machine.
 *
 * Transition rules:
 * | Current | Event                    | Next   | Action                          |
 * |---------|--------------------------|--------|----------------------------------|
 * | auto    | wheel-up                 | off    | Record direction                 |
 * | auto    | wheel-down               | auto   | No change (don't break sticky)   |
 * | auto    | keyboard-nav             | auto   | No change (don't break sticky)   |
 * | auto    | new-content              | auto   | Auto-scroll to bottom            |
 * | off     | wheel-down (to bottom)   | auto   | Restore auto-follow              |
 * | off     | keyboard-End / click     | locked | Scroll to bottom, lock follow    |
 * | off     | new-content              | off    | Increment newMessageCount        |
 * | locked  | content-stable           | auto   | Release lock                     |
 * | locked  | wheel-up                 | off    | Break lock                       |
 */
export function stickyBottomReducer(
  state: StickyBottomInternalState,
  action: StickyBottomAction
): StickyBottomInternalState {
  switch (action.type) {
    case "SCROLL": {
      const { delta, source, isAtBottom } = action;
      const direction = delta < 0 ? "up" : delta > 0 ? "down" : null;

      switch (state.followMode) {
        case "auto":
          // Only wheel-up breaks auto mode
          if (source === "wheel" && direction === "up") {
            return {
              ...state,
              followMode: "off",
              lastScrollDirection: "up",
              newMessageCount: 0,
            };
          }
          // Keyboard nav and wheel-down don't break auto
          return {
            ...state,
            lastScrollDirection: direction,
          };

        case "off":
          // Wheel-down reaching bottom restores auto
          if (source === "wheel" && direction === "down" && isAtBottom) {
            return {
              ...state,
              followMode: "auto",
              lastScrollDirection: "down",
              newMessageCount: 0,
            };
          }
          return {
            ...state,
            lastScrollDirection: direction,
          };

        case "locked":
          // Wheel-up breaks locked mode
          if (source === "wheel" && direction === "up") {
            return {
              ...state,
              followMode: "off",
              lastScrollDirection: "up",
              lockedAt: null,
            };
          }
          return {
            ...state,
            lastScrollDirection: direction,
          };
      }
      return state;
    }

    case "SCROLL_TO_BOTTOM_AND_LOCK":
      // User explicitly requested bottom (End key or button click)
      return {
        ...state,
        followMode: "locked",
        lastScrollDirection: null,
        newMessageCount: 0,
        lockedAt: Date.now(),
      };

    case "NEW_CONTENT": {
      const { dataLength, isStreaming } = action;

      switch (state.followMode) {
        case "auto":
          // In auto mode, just update data length tracking
          return {
            ...state,
            prevDataLength: dataLength,
          };

        case "off": {
          // In off mode, accumulate new message count
          const newMessages = dataLength - state.prevDataLength;
          return {
            ...state,
            newMessageCount: state.newMessageCount + Math.max(0, newMessages),
            prevDataLength: dataLength,
          };
        }

        case "locked":
          // In locked mode during streaming, stay locked
          // Update data length but don't accumulate count
          return {
            ...state,
            prevDataLength: dataLength,
            // Refresh lock timestamp during streaming to prevent premature unlock
            lockedAt: isStreaming ? Date.now() : state.lockedAt,
          };
      }
      return state;
    }

    case "CONTENT_STABLE":
      // Content has stabilized, release lock to auto
      if (state.followMode === "locked") {
        return {
          ...state,
          followMode: "auto",
          lockedAt: null,
        };
      }
      return state;

    case "REACHED_BOTTOM":
      // User scrolled to bottom by any means (useful for off mode)
      if (state.followMode === "off") {
        return {
          ...state,
          followMode: "auto",
          newMessageCount: 0,
        };
      }
      return state;

    case "CLEAR_NEW_MESSAGE_COUNT":
      return {
        ...state,
        newMessageCount: 0,
      };

    default:
      return state;
  }
}

// ============================================================================
// Hook Interface
// ============================================================================

/**
 * Options for the useStickyBottom hook.
 */
export interface UseStickyBottomOptions {
  /** Current scroll position in pixels */
  scrollTop: number;
  /** Maximum scrollable distance (totalHeight - containerHeight) */
  maxScroll: number;
  /** Height of the visible container in pixels */
  containerHeight: number;
  /** Total height of all content in pixels */
  totalContentHeight: number;
  /** Number of data items in the list */
  dataLength: number;
  /** Whether content is currently streaming */
  isStreaming?: boolean;
  /** Threshold in pixels to consider "at bottom" (default: 5) */
  bottomThreshold?: number;
}

/**
 * Return type for the useStickyBottom hook.
 */
export interface UseStickyBottomResult {
  /** Current follow mode state */
  followMode: FollowMode;
  /** Whether the scroll position is at the bottom */
  isAtBottom: boolean;
  /** Number of new messages accumulated while in 'off' mode */
  newMessageCount: number;
  /** Distance from bottom in pixels */
  distanceFromBottom: number;
  /**
   * Handle a scroll event with source information.
   * Call this from scroll handlers to update the state machine.
   *
   * @param delta - Scroll delta (negative = up, positive = down)
   * @param source - Source of the scroll event ('wheel' | 'keyboard' | 'programmatic')
   */
  handleScroll: (delta: number, source: ScrollSource) => void;
  /**
   * Scroll to bottom and lock follow mode.
   * Call this when user clicks "scroll to bottom" button or presses End key.
   */
  scrollToBottomAndLock: () => void;
  /**
   * Clear the new message count.
   * Call this when the banner is dismissed or messages are acknowledged.
   */
  clearNewMessageCount: () => void;
  /**
   * Whether auto-scroll should be active.
   * True in 'auto' and 'locked' modes.
   */
  shouldAutoScroll: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing sticky-bottom behavior with a 3-state Follow Mode state machine.
 *
 * @param options - Configuration for sticky-bottom behavior
 * @returns Sticky-bottom state and handlers
 *
 * @example
 * ```tsx
 * const {
 *   followMode,
 *   isAtBottom,
 *   newMessageCount,
 *   handleScroll,
 *   scrollToBottomAndLock,
 *   shouldAutoScroll,
 * } = useStickyBottom({
 *   scrollTop,
 *   maxScroll,
 *   containerHeight,
 *   totalContentHeight,
 *   dataLength: messages.length,
 *   isStreaming,
 * });
 *
 * // In scroll handler
 * const onWheel = (e: WheelEvent) => {
 *   handleScroll(e.deltaY, 'wheel');
 * };
 *
 * // In keyboard handler
 * const onKeyDown = (e: KeyboardEvent) => {
 *   if (e.key === 'End') {
 *     scrollToBottomAndLock();
 *   } else if (e.key === 'PageUp') {
 *     handleScroll(-containerHeight, 'keyboard');
 *   }
 * };
 *
 * // For auto-scroll effect
 * useEffect(() => {
 *   if (shouldAutoScroll && !isAtBottom) {
 *     scrollToBottom();
 *   }
 * }, [shouldAutoScroll, totalContentHeight]);
 * ```
 */
export function useStickyBottom(options: UseStickyBottomOptions): UseStickyBottomResult {
  const {
    scrollTop,
    maxScroll,
    // Reserved for future extensions (near-bottom percentage calculations)
    containerHeight: _containerHeight,
    totalContentHeight: _totalContentHeight,
    dataLength,
    isStreaming = false,
    bottomThreshold = 5,
  } = options;

  const [state, dispatch] = useReducer(stickyBottomReducer, initialState);

  // Calculate derived values
  const distanceFromBottom = Math.max(0, maxScroll - scrollTop);
  const isAtBottom = distanceFromBottom <= bottomThreshold;

  // Track streaming state changes for content stability detection
  const wasStreamingRef = useRef(isStreaming);
  const contentStableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle scroll events
  const handleScroll = useCallback(
    (delta: number, source: ScrollSource) => {
      // Calculate if we'll be at bottom after this scroll
      const newScrollTop = Math.max(0, Math.min(maxScroll, scrollTop + delta));
      const newDistanceFromBottom = maxScroll - newScrollTop;
      const willBeAtBottom = newDistanceFromBottom <= bottomThreshold;

      dispatch({
        type: "SCROLL",
        delta,
        source,
        isAtBottom: willBeAtBottom,
      });
    },
    [scrollTop, maxScroll, bottomThreshold]
  );

  // Handle explicit scroll-to-bottom request
  const scrollToBottomAndLock = useCallback(() => {
    dispatch({ type: "SCROLL_TO_BOTTOM_AND_LOCK" });
  }, []);

  // Clear new message count
  const clearNewMessageCount = useCallback(() => {
    dispatch({ type: "CLEAR_NEW_MESSAGE_COUNT" });
  }, []);

  // Detect new content
  useEffect(() => {
    if (dataLength !== state.prevDataLength) {
      dispatch({
        type: "NEW_CONTENT",
        dataLength,
        isStreaming,
      });
    }
  }, [dataLength, isStreaming, state.prevDataLength]);

  // Detect when user reaches bottom (for off mode recovery)
  useEffect(() => {
    if (isAtBottom && state.followMode === "off") {
      dispatch({ type: "REACHED_BOTTOM" });
    }
  }, [isAtBottom, state.followMode]);

  // Detect content stability for locked mode release
  useEffect(() => {
    // Clear any existing timer
    if (contentStableTimerRef.current) {
      clearTimeout(contentStableTimerRef.current);
      contentStableTimerRef.current = null;
    }

    // Streaming just ended
    if (wasStreamingRef.current && !isStreaming && state.followMode === "locked") {
      // Start stability timer
      contentStableTimerRef.current = setTimeout(() => {
        dispatch({ type: "CONTENT_STABLE" });
        contentStableTimerRef.current = null;
      }, CONTENT_STABLE_THRESHOLD_MS);
    }

    wasStreamingRef.current = isStreaming;

    return () => {
      if (contentStableTimerRef.current) {
        clearTimeout(contentStableTimerRef.current);
      }
    };
  }, [isStreaming, state.followMode]);

  // Also check for content stability by lock age (fallback)
  useEffect(() => {
    if (state.followMode === "locked" && state.lockedAt !== null && !isStreaming) {
      const lockAge = Date.now() - state.lockedAt;
      if (lockAge >= CONTENT_STABLE_THRESHOLD_MS) {
        dispatch({ type: "CONTENT_STABLE" });
      }
    }
  }, [state.followMode, state.lockedAt, isStreaming]);

  // Determine if auto-scroll should be active
  const shouldAutoScroll = state.followMode === "auto" || state.followMode === "locked";

  return {
    followMode: state.followMode,
    isAtBottom,
    newMessageCount: state.newMessageCount,
    distanceFromBottom,
    handleScroll,
    scrollToBottomAndLock,
    clearNewMessageCount,
    shouldAutoScroll,
  };
}
