/**
 * Animated Scrollbar Hook
 *
 * Provides animated scrollbar visibility with fade in/out effects based on
 * scroll activity. Inspired by Gemini CLI's useAnimatedScrollbar.
 *
 * Features:
 * - Scrollbar color fades in/out based on activity
 * - Color interpolation (bright → dim over time)
 * - Flash callback for focus events
 * - Activity tracking (scrolling triggers visibility)
 *
 * @module tui/hooks/useAnimatedScrollbar
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { interpolateColor } from "../components/Banner/ShimmerText.js";
import { useTheme } from "../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Animation phase for the scrollbar fade effect
 */
type AnimationPhase = "idle" | "fade-in" | "visible" | "fade-out";

/**
 * Configuration for animated scrollbar behavior
 */
export interface AnimatedScrollbarConfig {
  /** Duration of fade-in animation in ms (default: 200) */
  readonly fadeInDuration?: number;
  /** Duration scrollbar stays fully visible in ms (default: 1000) */
  readonly visibleDuration?: number;
  /** Duration of fade-out animation in ms (default: 300) */
  readonly fadeOutDuration?: number;
  /** Frame rate for animation updates in ms (default: 33 ~= 30fps) */
  readonly frameInterval?: number;
}

/**
 * Return type for useAnimatedScrollbar hook
 */
export interface UseAnimatedScrollbarReturn {
  /** Current scrollbar color (interpolated based on animation state) */
  readonly scrollbarColor: string;
  /** Track color (dimmed version) */
  readonly trackColor: string;
  /** Manually trigger a flash animation */
  readonly flashScrollbar: () => void;
  /** Wrapper that calls scrollBy and triggers animation */
  readonly scrollByWithAnimation: (delta: number) => void;
  /** Current animation phase for debugging */
  readonly phase: AnimationPhase;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: Required<AnimatedScrollbarConfig> = {
  fadeInDuration: 200,
  visibleDuration: 1000,
  fadeOutDuration: 300,
  frameInterval: 33, // ~30fps
};

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for animated scrollbar visibility effects
 *
 * @param isFocused - Whether the scrollable area is focused
 * @param scrollBy - Function to scroll by a delta amount
 * @param config - Optional animation configuration
 * @returns Animated scrollbar state and controls
 *
 * @example
 * ```tsx
 * const { scrollbarColor, scrollByWithAnimation } = useAnimatedScrollbar(
 *   isFocused,
 *   (delta) => scrollController.scrollBy(delta)
 * );
 *
 * // In ScrollIndicator
 * <Text color={scrollbarColor}>█</Text>
 * ```
 */
export function useAnimatedScrollbar(
  isFocused: boolean,
  scrollBy: (delta: number) => void,
  config: AnimatedScrollbarConfig = {}
): UseAnimatedScrollbarReturn {
  const { theme } = useTheme();

  // Merge config with defaults
  const { fadeInDuration, visibleDuration, fadeOutDuration, frameInterval } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Colors from theme
  const activeColor = theme.semantic.text.muted;
  const dimColor = theme.semantic.border.muted;
  const trackColorTheme = theme.semantic.border.default;

  // State
  const [scrollbarColor, setScrollbarColor] = useState(dimColor);
  const [phase, setPhase] = useState<AnimationPhase>("idle");

  // Refs for animation state
  const colorRef = useRef(scrollbarColor);
  const animationFrame = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAnimatingRef = useRef(false);
  const wasFocusedRef = useRef(isFocused);

  // Keep colorRef in sync
  colorRef.current = scrollbarColor;

  /**
   * Cleanup all timers and animation state
   */
  const cleanup = useCallback(() => {
    if (animationFrame.current) {
      clearInterval(animationFrame.current);
      animationFrame.current = null;
    }
    if (timeout.current) {
      clearTimeout(timeout.current);
      timeout.current = null;
    }
    isAnimatingRef.current = false;
  }, []);

  /**
   * Flash the scrollbar (fade in → visible → fade out)
   */
  const flashScrollbar = useCallback(() => {
    cleanup();
    isAnimatingRef.current = true;

    const startColor = colorRef.current;

    // Validate colors exist
    if (!activeColor || !dimColor) {
      return;
    }

    // Phase 1: Fade In
    setPhase("fade-in");
    let startTime = Date.now();

    const animateFadeIn = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / fadeInDuration, 1);

      setScrollbarColor(interpolateColor(startColor, activeColor, progress));

      if (progress >= 1) {
        if (animationFrame.current) {
          clearInterval(animationFrame.current);
          animationFrame.current = null;
        }

        // Phase 2: Stay visible
        setPhase("visible");
        timeout.current = setTimeout(() => {
          // Phase 3: Fade Out
          setPhase("fade-out");
          startTime = Date.now();

          const animateFadeOut = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / fadeOutDuration, 1);

            setScrollbarColor(interpolateColor(activeColor, dimColor, progress));

            if (progress >= 1) {
              cleanup();
              setPhase("idle");
            }
          };

          animationFrame.current = setInterval(animateFadeOut, frameInterval);
        }, visibleDuration);
      }
    };

    animationFrame.current = setInterval(animateFadeIn, frameInterval);
  }, [
    cleanup,
    activeColor,
    dimColor,
    fadeInDuration,
    visibleDuration,
    fadeOutDuration,
    frameInterval,
  ]);

  /**
   * Handle focus changes - flash on focus gain
   */
  useEffect(() => {
    if (isFocused && !wasFocusedRef.current) {
      // Gained focus - flash scrollbar
      flashScrollbar();
    } else if (!isFocused && wasFocusedRef.current) {
      // Lost focus - immediately dim
      cleanup();
      setScrollbarColor(dimColor);
      setPhase("idle");
    }
    wasFocusedRef.current = isFocused;

    return cleanup;
  }, [isFocused, flashScrollbar, cleanup, dimColor]);

  /**
   * Scroll with animation - wraps scrollBy and triggers flash
   */
  const scrollByWithAnimation = useCallback(
    (delta: number) => {
      scrollBy(delta);
      flashScrollbar();
    },
    [scrollBy, flashScrollbar]
  );

  return {
    scrollbarColor,
    trackColor: trackColorTheme,
    flashScrollbar,
    scrollByWithAnimation,
    phase,
  };
}
