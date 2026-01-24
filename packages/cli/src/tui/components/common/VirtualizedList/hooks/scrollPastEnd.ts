/**
 * Scroll Past End Buffer
 *
 * Allows scrolling past the bottom of the list by a configurable distance,
 * providing a better UX with smooth bounce-back animation.
 *
 * Features:
 * - Configurable overscroll distance (0-10 lines)
 * - Smooth bounce-back animation with easing
 * - Integration with sticky-bottom behavior
 * - Rubberband effect when exceeding max overscroll
 *
 * @module tui/components/common/VirtualizedList/hooks/scrollPastEnd
 */

import { useCallback, useEffect, useReducer, useRef } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for scroll past end behavior.
 */
export interface ScrollPastEndConfig {
  /** Maximum overscroll distance in lines (0-10). Default: 3 */
  readonly maxLines: number;
  /** Estimated height per line in pixels. Default: 20 */
  readonly estimatedLineHeight: number;
  /** Duration of bounce-back animation in ms. Default: 150 */
  readonly bounceMs: number;
  /** Easing function for bounce animation. Default: easeOutCubic */
  readonly easing: (t: number) => number;
  /** Rubberband factor when exceeding max (0-1). Default: 0.3 */
  readonly rubberbandFactor: number;
}

/**
 * State for scroll past end behavior.
 */
export interface ScrollPastEndState {
  /** Current overscroll distance in pixels (0 = at bottom, >0 = past bottom) */
  readonly overscrollAmount: number;
  /** Whether bounce-back animation is in progress */
  readonly isBouncing: boolean;
  /** Timestamp when bounce started (null if not bouncing) */
  readonly bounceStartTime: number | null;
  /** Overscroll amount when bounce started */
  readonly bounceStartAmount: number;
}

/**
 * Actions for the scroll past end reducer.
 */
export type ScrollPastEndAction =
  | { type: "OVERSCROLL"; amount: number }
  | { type: "START_BOUNCE" }
  | { type: "BOUNCE_TICK"; currentTime: number }
  | { type: "BOUNCE_COMPLETE" }
  | { type: "RESET" };

// ============================================================================
// Constants
// ============================================================================

/**
 * EaseOutCubic easing function.
 * Provides a smooth deceleration at the end of the animation.
 *
 * @param t - Progress value from 0 to 1
 * @returns Eased progress value
 */
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/**
 * Default configuration for scroll past end.
 */
export const DEFAULT_SCROLL_PAST_END_CONFIG: ScrollPastEndConfig = {
  maxLines: 3,
  estimatedLineHeight: 20,
  bounceMs: 150,
  easing: easeOutCubic,
  rubberbandFactor: 0.3,
};

/**
 * Interval for bounce animation ticks (ms).
 * Using 16ms for ~60fps equivalent timing.
 */
const BOUNCE_TICK_INTERVAL_MS = 16;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate the maximum allowed overscroll distance in pixels.
 *
 * @param config - Scroll past end configuration
 * @returns Maximum overscroll in pixels
 */
export function calculateMaxOverscroll(config: ScrollPastEndConfig): number {
  return config.maxLines * config.estimatedLineHeight;
}

/**
 * Clamp overscroll amount within valid bounds, applying rubberband effect.
 *
 * When overscroll exceeds the max, the rubberband factor reduces additional
 * scrolling to give a "pulling against resistance" feel.
 *
 * @param amount - Raw overscroll amount in pixels
 * @param config - Scroll past end configuration
 * @returns Clamped overscroll amount with rubberband applied
 */
export function clampOverscroll(amount: number, config: ScrollPastEndConfig): number {
  // Don't allow negative overscroll (scrolling up past the content)
  if (amount <= 0) {
    return 0;
  }

  const maxOverscroll = calculateMaxOverscroll(config);

  // Within normal bounds
  if (amount <= maxOverscroll) {
    return amount;
  }

  // Apply rubberband effect for overscroll beyond max
  // The further past max, the more resistance
  const excess = amount - maxOverscroll;
  const rubberbandedExcess = excess * config.rubberbandFactor;

  // Cap at 2x max to prevent extreme overscroll
  const maxWithRubberband = maxOverscroll * (1 + config.rubberbandFactor);
  return Math.min(maxOverscroll + rubberbandedExcess, maxWithRubberband);
}

/**
 * Calculate the current bounce position based on animation progress.
 *
 * @param state - Current scroll past end state
 * @param currentTime - Current timestamp in ms
 * @param config - Scroll past end configuration
 * @returns Current overscroll amount during bounce animation
 */
export function calculateBouncePosition(
  state: ScrollPastEndState,
  currentTime: number,
  config: ScrollPastEndConfig
): number {
  if (!state.isBouncing || state.bounceStartTime === null) {
    return state.overscrollAmount;
  }

  const elapsed = currentTime - state.bounceStartTime;
  const progress = Math.min(1, elapsed / config.bounceMs);
  const easedProgress = config.easing(progress);

  // Animate from bounceStartAmount to 0
  return state.bounceStartAmount * (1 - easedProgress);
}

// ============================================================================
// Initial State
// ============================================================================

/**
 * Create the initial state for scroll past end.
 *
 * @returns Initial scroll past end state
 */
export function createInitialScrollPastEndState(): ScrollPastEndState {
  return {
    overscrollAmount: 0,
    isBouncing: false,
    bounceStartTime: null,
    bounceStartAmount: 0,
  };
}

// ============================================================================
// Reducer
// ============================================================================

/**
 * Reducer for scroll past end state.
 *
 * Handles overscroll amount updates and bounce-back animation state.
 * Pure function with no side effects.
 *
 * @param state - Current state
 * @param action - Action to process
 * @param config - Scroll past end configuration
 * @returns New state
 */
export function scrollPastEndReducer(
  state: ScrollPastEndState,
  action: ScrollPastEndAction,
  config: ScrollPastEndConfig
): ScrollPastEndState {
  switch (action.type) {
    case "OVERSCROLL": {
      // Don't update overscroll during bounce animation
      if (state.isBouncing) {
        return state;
      }

      const clampedAmount = clampOverscroll(action.amount, config);

      // No change
      if (clampedAmount === state.overscrollAmount) {
        return state;
      }

      return {
        ...state,
        overscrollAmount: clampedAmount,
      };
    }

    case "START_BOUNCE": {
      // Nothing to bounce if already at 0
      if (state.overscrollAmount === 0) {
        return state;
      }

      // Already bouncing
      if (state.isBouncing) {
        return state;
      }

      return {
        ...state,
        isBouncing: true,
        bounceStartTime: Date.now(),
        bounceStartAmount: state.overscrollAmount,
      };
    }

    case "BOUNCE_TICK": {
      // Not bouncing
      if (!state.isBouncing) {
        return state;
      }

      const newAmount = calculateBouncePosition(state, action.currentTime, config);

      // Animation complete (or very close)
      if (newAmount < 0.5) {
        return {
          ...state,
          overscrollAmount: 0,
          isBouncing: false,
          bounceStartTime: null,
          bounceStartAmount: 0,
        };
      }

      return {
        ...state,
        overscrollAmount: newAmount,
      };
    }

    case "BOUNCE_COMPLETE": {
      return {
        ...state,
        overscrollAmount: 0,
        isBouncing: false,
        bounceStartTime: null,
        bounceStartAmount: 0,
      };
    }

    case "RESET": {
      return createInitialScrollPastEndState();
    }

    default:
      return state;
  }
}

// ============================================================================
// Hook Return Type
// ============================================================================

/**
 * Return type for the useScrollPastEnd hook.
 */
export interface UseScrollPastEndResult {
  /** Current overscroll amount in pixels */
  readonly overscrollAmount: number;
  /** Whether bounce-back animation is in progress */
  readonly isBouncing: boolean;
  /** Update overscroll amount (e.g., on scroll delta) */
  readonly handleOverscroll: (amount: number) => void;
  /** Start bounce-back animation (e.g., on scroll release) */
  readonly startBounce: () => void;
  /** Reset overscroll state to initial */
  readonly resetOverscroll: () => void;
  /** Maximum overscroll distance in pixels */
  readonly maxOverscroll: number;
  /** Whether currently overscrolled (amount > 0) */
  readonly isOverscrolled: boolean;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing scroll past end behavior.
 *
 * Provides state and handlers for:
 * - Tracking overscroll amount when scrolling past the bottom
 * - Smooth bounce-back animation when releasing
 * - Rubberband effect when exceeding max overscroll
 *
 * @example
 * ```tsx
 * const {
 *   overscrollAmount,
 *   handleOverscroll,
 *   startBounce,
 *   isOverscrolled,
 * } = useScrollPastEnd({ maxLines: 3 });
 *
 * // On scroll event when at bottom:
 * if (isAtBottom && delta > 0) {
 *   handleOverscroll(overscrollAmount + delta);
 * }
 *
 * // On scroll release (e.g., wheel end):
 * if (isOverscrolled) {
 *   startBounce();
 * }
 * ```
 *
 * @param configOverrides - Partial configuration overrides
 * @returns Scroll past end state and handlers
 */
export function useScrollPastEnd(
  configOverrides?: Partial<ScrollPastEndConfig>
): UseScrollPastEndResult {
  // Merge config with defaults
  const config: ScrollPastEndConfig = {
    ...DEFAULT_SCROLL_PAST_END_CONFIG,
    ...configOverrides,
  };

  // State managed via reducer
  const [state, dispatch] = useReducer(
    (s: ScrollPastEndState, a: ScrollPastEndAction) => scrollPastEndReducer(s, a, config),
    undefined,
    createInitialScrollPastEndState
  );

  // Ref for bounce animation interval
  const bounceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (bounceIntervalRef.current !== null) {
        clearInterval(bounceIntervalRef.current);
        bounceIntervalRef.current = null;
      }
    };
  }, []);

  // Handle bounce animation ticks
  useEffect(() => {
    if (state.isBouncing) {
      // Start interval for bounce animation
      bounceIntervalRef.current = setInterval(() => {
        dispatch({ type: "BOUNCE_TICK", currentTime: Date.now() });
      }, BOUNCE_TICK_INTERVAL_MS);

      return () => {
        if (bounceIntervalRef.current !== null) {
          clearInterval(bounceIntervalRef.current);
          bounceIntervalRef.current = null;
        }
      };
    }
  }, [state.isBouncing]);

  /**
   * Update overscroll amount.
   * Call this when the user scrolls past the bottom.
   */
  const handleOverscroll = useCallback((amount: number) => {
    dispatch({ type: "OVERSCROLL", amount });
  }, []);

  /**
   * Start the bounce-back animation.
   * Call this when the user releases the scroll (e.g., wheel end event).
   */
  const startBounce = useCallback(() => {
    dispatch({ type: "START_BOUNCE" });
  }, []);

  /**
   * Reset overscroll state to initial.
   * Call this when content changes or scroll position resets.
   */
  const resetOverscroll = useCallback(() => {
    if (bounceIntervalRef.current !== null) {
      clearInterval(bounceIntervalRef.current);
      bounceIntervalRef.current = null;
    }
    dispatch({ type: "RESET" });
  }, []);

  return {
    overscrollAmount: state.overscrollAmount,
    isBouncing: state.isBouncing,
    handleOverscroll,
    startBounce,
    resetOverscroll,
    maxOverscroll: calculateMaxOverscroll(config),
    isOverscrolled: state.overscrollAmount > 0,
  };
}
