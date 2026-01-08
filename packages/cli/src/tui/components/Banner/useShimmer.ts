/**
 * useShimmer Hook
 *
 * Provides smooth shimmer/glow animation effect with customizable parameters.
 * Uses cosine function for smooth transitions.
 *
 * @module tui/components/Banner/useShimmer
 */

import { useEffect, useState } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration options for the shimmer animation.
 */
export interface ShimmerConfig {
  /** Duration of one complete shimmer cycle in milliseconds (default: 2000) */
  readonly cycleDuration?: number;
  /** Update interval in milliseconds (default: 50) */
  readonly updateInterval?: number;
  /** Whether animation is enabled (default: true) */
  readonly enabled?: boolean;
}

/**
 * Return value from the useShimmer hook.
 */
export interface ShimmerState {
  /** Current position of shimmer (0 to 1) */
  readonly position: number;
  /** Current intensity at shimmer center (0 to 1) */
  readonly intensity: number;
  /** Whether shimmer is currently active */
  readonly isActive: boolean;
  /** Pause the shimmer animation */
  readonly pause: () => void;
  /** Resume the shimmer animation */
  readonly resume: () => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Default shimmer cycle duration (3 seconds - slower for smoother effect) */
const DEFAULT_CYCLE_DURATION = 3000;

/** Default update interval (150ms = ~6.7fps - optimized for performance) */
const DEFAULT_UPDATE_INTERVAL = 150;

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for creating smooth shimmer animations.
 *
 * The shimmer effect sweeps from left to right using a cosine function
 * for smooth acceleration and deceleration at the edges.
 *
 * @example
 * ```tsx
 * const { position, intensity } = useShimmer({ cycleDuration: 2000 });
 *
 * // Use position (0-1) to determine where shimmer highlight is
 * // Use intensity (0-1) to determine brightness at that position
 * ```
 */
export function useShimmer(config: ShimmerConfig = {}): ShimmerState {
  const {
    cycleDuration = DEFAULT_CYCLE_DURATION,
    updateInterval = DEFAULT_UPDATE_INTERVAL,
    enabled = true,
  } = config;

  const [position, setPosition] = useState(0);
  const [isActive, setIsActive] = useState(enabled);

  useEffect(() => {
    if (!isActive) return;

    // Use simpler incremental position update for better performance
    const step = updateInterval / cycleDuration;
    // Start from current position (captured at effect setup time)
    let currentPosition = 0;

    const timer = setInterval(() => {
      currentPosition = (currentPosition + step) % 1;
      setPosition(currentPosition);
    }, updateInterval);

    return () => clearInterval(timer);
  }, [isActive, cycleDuration, updateInterval]);

  // Calculate intensity using cosine for smooth falloff
  // Peak intensity at current position, smoothly fading around it
  const intensity = Math.cos(position * Math.PI * 2 - Math.PI) * 0.5 + 0.5;

  const pause = () => setIsActive(false);
  const resume = () => setIsActive(true);

  return {
    position,
    intensity,
    isActive,
    pause,
    resume,
  };
}

/**
 * Calculate shimmer intensity at a specific character position.
 *
 * @param charIndex - Index of the character (0-based)
 * @param totalChars - Total number of characters
 * @param shimmerPosition - Current shimmer position (0-1)
 * @param shimmerWidth - Width of shimmer effect (0-1, default 0.15)
 * @returns Intensity value from 0 to 1
 */
export function calculateShimmerIntensity(
  charIndex: number,
  totalChars: number,
  shimmerPosition: number,
  shimmerWidth: number = 0.15
): number {
  if (totalChars === 0) return 0;

  // Normalize character position to 0-1 range
  const charPosition = charIndex / totalChars;

  // Calculate distance from shimmer center
  const distance = Math.abs(charPosition - shimmerPosition);

  // Handle wrap-around (shimmer at edge affects chars on opposite side)
  const wrappedDistance = Math.min(distance, 1 - distance);

  // If outside shimmer width, no effect
  if (wrappedDistance > shimmerWidth) return 0;

  // Cosine falloff for smooth intensity gradient
  const normalizedDistance = wrappedDistance / shimmerWidth;
  const intensity = Math.cos(normalizedDistance * Math.PI * 0.5);

  return Math.max(0, intensity);
}
