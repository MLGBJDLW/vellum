/**
 * useSmoothScroll Hook
 *
 * Provides smooth eased scrolling animation using setInterval for Node.js environments.
 * Uses exponential ease-out for natural deceleration as the scroll approaches its target.
 *
 * Based on Gemini CLI's eased scrolling pattern (Section 2.1.4 of virtual-scroll-optimization.md).
 *
 * @module tui/components/common/VirtualizedList/hooks/useSmoothScroll
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Configuration for smooth scroll animation behavior.
 */
export interface SmoothScrollConfig {
  /** Easing coefficient (0-1). Higher values = faster approach to target. Default: 0.3 */
  readonly easing: number;
  /** Distance threshold in pixels to stop animation. Default: 0.5 */
  readonly threshold: number;
  /** Animation frame interval in milliseconds. Default: 16 (~60fps) */
  readonly frameInterval: number;
}

/**
 * Default smooth scroll configuration.
 * Tuned for responsive yet smooth scrolling at ~60fps.
 */
export const DEFAULT_CONFIG: SmoothScrollConfig = {
  easing: 0.3, // 30% approach to target per frame
  threshold: 0.5, // Stop when within 0.5px
  frameInterval: 16, // ~60fps (1000ms / 60 ≈ 16.67ms)
} as const;

/**
 * Options for the useSmoothScroll hook.
 */
export interface UseSmoothScrollOptions {
  /** Target scroll position to animate towards */
  readonly targetScrollTop: number;
  /** Maximum allowed scroll value (for clamping) */
  readonly maxScroll: number;
  /** Whether smooth scrolling is enabled. When false, jumps instantly. Default: true */
  readonly enabled?: boolean;
  /** Custom configuration to override defaults */
  readonly config?: Partial<SmoothScrollConfig>;
  /** Callback invoked when scroll position updates */
  readonly onScrollUpdate: (scrollTop: number) => void;
}

/**
 * Return value from the useSmoothScroll hook.
 */
export interface UseSmoothScrollResult {
  /** Current animated scroll position */
  readonly currentScrollTop: number;
  /** Whether an animation is currently in progress */
  readonly isAnimating: boolean;
  /** Immediately jump to a position, skipping animation */
  readonly jumpTo: (position: number) => void;
  /** Stop the current animation at its current position */
  readonly stop: () => void;
}

/**
 * Clamps a scroll position between 0 and maxScroll.
 * @param scrollTop - The scroll position to clamp
 * @param maxScroll - Maximum allowed scroll value
 * @returns Clamped scroll position
 */
export function clampScrollTop(scrollTop: number, maxScroll: number): number {
  return Math.max(0, Math.min(scrollTop, maxScroll));
}

/**
 * Calculates the eased step for smooth scroll animation.
 * Uses exponential ease-out: moves a percentage of remaining distance.
 *
 * @param current - Current scroll position
 * @param target - Target scroll position
 * @param easing - Easing coefficient (0-1). Higher = faster approach
 * @returns The step to add to current position
 */
export function calculateEasedStep(current: number, target: number, easing: number): number {
  const diff = target - current;
  return diff * easing;
}

/**
 * Checks if animation should be considered complete.
 *
 * @param current - Current scroll position
 * @param target - Target scroll position
 * @param threshold - Distance threshold to consider "arrived"
 * @returns True if animation is complete
 */
export function isAnimationComplete(current: number, target: number, threshold: number): boolean {
  return Math.abs(target - current) <= threshold;
}

/**
 * Hook for smooth scroll animation in terminal UIs.
 *
 * Uses setInterval-based animation (no requestAnimationFrame in Node.js)
 * with exponential ease-out for natural deceleration.
 *
 * @param options - Configuration options for smooth scrolling
 * @returns Current scroll state and control functions
 *
 * @example
 * ```tsx
 * const { currentScrollTop, isAnimating, jumpTo, stop } = useSmoothScroll({
 *   targetScrollTop: 1000,
 *   maxScroll: 5000,
 *   enabled: true,
 *   onScrollUpdate: (scrollTop) => setScrollTop(scrollTop),
 * });
 *
 * // Jump to top instantly
 * jumpTo(0);
 *
 * // Stop mid-animation
 * stop();
 * ```
 */
export function useSmoothScroll(options: UseSmoothScrollOptions): UseSmoothScrollResult {
  const {
    targetScrollTop,
    maxScroll,
    enabled = true,
    config: customConfig,
    onScrollUpdate,
  } = options;

  // Merge custom config with defaults
  const config = useMemo<SmoothScrollConfig>(
    () => ({
      ...DEFAULT_CONFIG,
      ...customConfig,
    }),
    [customConfig]
  );

  // State
  const [currentScrollTop, setCurrentScrollTop] = useState(targetScrollTop);
  const [isAnimating, setIsAnimating] = useState(false);

  // Refs for animation loop (avoid stale closures)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetRef = useRef(targetScrollTop);
  const currentRef = useRef(currentScrollTop);
  const onScrollUpdateRef = useRef(onScrollUpdate);

  // Keep callback ref fresh
  useEffect(() => {
    onScrollUpdateRef.current = onScrollUpdate;
  }, [onScrollUpdate]);

  // Update clamped target when props change
  useEffect(() => {
    targetRef.current = clampScrollTop(targetScrollTop, maxScroll);
  }, [targetScrollTop, maxScroll]);

  // Clear interval helper
  const clearAnimationInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Animation loop effect
  useEffect(() => {
    // When disabled, jump directly to target
    if (!enabled) {
      const clampedTarget = clampScrollTop(targetScrollTop, maxScroll);
      currentRef.current = clampedTarget;
      setCurrentScrollTop(clampedTarget);
      onScrollUpdateRef.current(clampedTarget);
      setIsAnimating(false);
      clearAnimationInterval();
      return;
    }

    const animate = () => {
      const diff = targetRef.current - currentRef.current;

      // Check if we've reached the target (within threshold)
      if (Math.abs(diff) <= config.threshold) {
        // Snap to exact target
        currentRef.current = targetRef.current;
        setCurrentScrollTop(targetRef.current);
        onScrollUpdateRef.current(targetRef.current);
        setIsAnimating(false);
        clearAnimationInterval();
        return;
      }

      // Exponential ease-out: move a percentage of remaining distance
      const step = diff * config.easing;
      currentRef.current += step;

      setCurrentScrollTop(currentRef.current);
      onScrollUpdateRef.current(currentRef.current);
    };

    // Check if animation is needed
    const diff = Math.abs(targetRef.current - currentRef.current);
    if (diff > config.threshold) {
      // Start animation if not already running
      if (intervalRef.current === null) {
        setIsAnimating(true);
        intervalRef.current = setInterval(animate, config.frameInterval);
      }
    }

    // Cleanup on unmount or when deps change
    return () => {
      clearAnimationInterval();
    };
  }, [
    targetScrollTop,
    maxScroll,
    enabled,
    config.threshold,
    config.easing,
    config.frameInterval,
    clearAnimationInterval,
  ]);

  // Jump to position instantly (skip animation)
  const jumpTo = useCallback(
    (position: number) => {
      const clampedPosition = clampScrollTop(position, maxScroll);

      // Update all refs and state
      targetRef.current = clampedPosition;
      currentRef.current = clampedPosition;
      setCurrentScrollTop(clampedPosition);
      onScrollUpdateRef.current(clampedPosition);
      setIsAnimating(false);
      clearAnimationInterval();
    },
    [maxScroll, clearAnimationInterval]
  );

  // Stop animation at current position
  const stop = useCallback(() => {
    setIsAnimating(false);
    clearAnimationInterval();
  }, [clearAnimationInterval]);

  return {
    currentScrollTop,
    isAnimating,
    jumpTo,
    stop,
  };
}
