/**
 * Smooth Scroll Hook
 *
 * Provides smooth animated scrolling with easing functions.
 * Uses setInterval-based updates (terminal-safe, no requestAnimationFrame).
 *
 * @module tui/hooks/useSmoothScroll
 */

import { useCallback, useRef, useState } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Easing function type: maps progress (0-1) to eased value (0-1)
 */
export type EasingFunction = (t: number) => number;

/**
 * Configuration for smooth scroll behavior
 */
export interface SmoothScrollConfig {
  /** Animation duration in ms (default: 150) */
  readonly duration?: number;
  /** Easing function (default: easeOutCubic) */
  readonly easing?: EasingFunction;
  /** Frame interval in ms (default: 16 ~= 60fps) */
  readonly frameInterval?: number;
}

/**
 * Return type for useSmoothScroll hook
 */
export interface UseSmoothScrollReturn {
  /** Current interpolated scroll position */
  readonly position: number;
  /** Whether currently animating */
  readonly isAnimating: boolean;
  /** Start smooth scroll to target position */
  readonly scrollTo: (target: number) => void;
  /** Immediately jump to position (cancel any animation) */
  readonly jumpTo: (target: number) => void;
  /** Cancel current animation */
  readonly cancel: () => void;
}

// =============================================================================
// Easing Functions
// =============================================================================

/**
 * Standard easing functions for scroll animations
 */
export const easings = {
  /** Linear - no easing */
  linear: (t: number): number => t,

  /** Ease out cubic - fast start, slow end (default) */
  easeOutCubic: (t: number): number => 1 - (1 - t) ** 3,

  /** Ease out quad - gentler ease out */
  easeOutQuad: (t: number): number => 1 - (1 - t) ** 2,

  /** Ease in out quad - smooth both ends */
  easeInOutQuad: (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),

  /** Ease out expo - very fast start */
  easeOutExpo: (t: number): number => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
} as const;

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: Required<SmoothScrollConfig> = {
  duration: 150,
  easing: easings.easeOutCubic,
  frameInterval: 16, // ~60fps
};

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for smooth animated scrolling
 *
 * @param initialPosition - Starting scroll position
 * @param config - Optional animation configuration
 * @returns Smooth scroll state and controls
 *
 * @example
 * ```tsx
 * const { position, scrollTo, isAnimating } = useSmoothScroll(0);
 *
 * // Smooth scroll to line 50
 * scrollTo(50);
 *
 * // Use position for rendering
 * <VirtualizedList offsetFromBottom={position} />
 * ```
 */
export function useSmoothScroll(
  initialPosition: number,
  config: SmoothScrollConfig = {}
): UseSmoothScrollReturn {
  // Merge config with defaults
  const { duration, easing, frameInterval } = { ...DEFAULT_CONFIG, ...config };

  // State
  const [position, setPosition] = useState(initialPosition);
  const [isAnimating, setIsAnimating] = useState(false);

  // Refs for animation state
  const animationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startPositionRef = useRef(initialPosition);
  const targetPositionRef = useRef(initialPosition);
  const startTimeRef = useRef(0);

  /**
   * Cancel any running animation
   */
  const cancel = useCallback(() => {
    if (animationRef.current) {
      clearInterval(animationRef.current);
      animationRef.current = null;
    }
    setIsAnimating(false);
  }, []);

  /**
   * Immediately jump to position (no animation)
   */
  const jumpTo = useCallback(
    (target: number) => {
      cancel();
      setPosition(target);
      startPositionRef.current = target;
      targetPositionRef.current = target;
    },
    [cancel]
  );

  /**
   * Start smooth scroll to target position
   */
  const scrollTo = useCallback(
    (target: number) => {
      // Cancel any existing animation
      cancel();

      // Get current position as start
      const start = position;

      // Skip animation if already at target or very close
      if (Math.abs(target - start) < 0.5) {
        setPosition(target);
        return;
      }

      // Store animation parameters
      startPositionRef.current = start;
      targetPositionRef.current = target;
      startTimeRef.current = Date.now();

      setIsAnimating(true);

      // Animation tick
      const tick = () => {
        const elapsed = Date.now() - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easing(progress);

        const newPosition =
          startPositionRef.current +
          (targetPositionRef.current - startPositionRef.current) * easedProgress;

        setPosition(newPosition);

        if (progress >= 1) {
          // Animation complete - snap to exact target
          setPosition(targetPositionRef.current);
          cancel();
        }
      };

      // Start animation loop
      animationRef.current = setInterval(tick, frameInterval);
    },
    [cancel, position, duration, easing, frameInterval]
  );

  return {
    position,
    isAnimating,
    scrollTo,
    jumpTo,
    cancel,
  };
}
