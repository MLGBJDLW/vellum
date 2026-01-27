/**
 * useShimmer Hook
 *
 * Provides smooth shimmer/glow animation effect with customizable parameters.
 * Uses cosine function for smooth transitions.
 *
 * @module tui/components/Banner/useShimmer
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAnimation } from "../../context/AnimationContext.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration options for the shimmer animation.
 */
export interface ShimmerConfig {
  /** Duration of one complete shimmer cycle in milliseconds (default: 3000) */
  readonly cycleDuration?: number;
  /** Update interval in milliseconds (default: 100) */
  readonly updateInterval?: number;
  /** Whether animation is enabled (default: true) */
  readonly enabled?: boolean;
  /** Maximum number of cycles before stopping (undefined = infinite) */
  readonly maxCycles?: number;
  /** Callback when max cycles reached */
  readonly onComplete?: () => void;
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
  /** Current cycle count (0-based) */
  readonly cycleCount: number;
  /** Whether max cycles completed */
  readonly isComplete: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Default shimmer cycle duration (3 seconds - slower for smoother effect) */
const DEFAULT_CYCLE_DURATION = 3000;

/** Default update interval (100ms = 10fps for smoother motion without aggressive redraws) */
const DEFAULT_UPDATE_INTERVAL = resolveDefaultUpdateInterval();

const SHIMMER_DEBUG_ENABLED =
  process.env.VELLUM_TUI_SHIMMER_DEBUG === "1" || process.env.VELLUM_TUI_SHIMMER_DEBUG === "true";

function resolveDefaultUpdateInterval(): number {
  const intervalOverride = Number(process.env.VELLUM_TUI_SHIMMER_INTERVAL_MS);
  if (Number.isFinite(intervalOverride) && intervalOverride > 0) {
    return Math.round(intervalOverride);
  }

  const fpsOverride = Number(process.env.VELLUM_TUI_SHIMMER_FPS);
  if (Number.isFinite(fpsOverride) && fpsOverride > 0) {
    return Math.max(16, Math.round(1000 / fpsOverride));
  }

  return 100;
}

function debugShimmer(message: string): void {
  if (!SHIMMER_DEBUG_ENABLED) return;
  process.stderr.write(`[shimmer] ${message}\n`);
}

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
    maxCycles,
    onComplete,
  } = config;

  const [position, setPosition] = useState(0);
  const [isActive, setIsActive] = useState(enabled);
  const [cycleCount, setCycleCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const positionRef = useRef(0);
  const cycleCountRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const lastDebugRef = useRef<number>(0);
  const hasAnimationTickRef = useRef(false);

  const { timestamp, isPaused } = useAnimation();

  // Track onComplete callback in ref to avoid effect re-runs
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const advancePosition = useCallback(
    (deltaMs: number, nowMs: number) => {
      if (deltaMs <= 0) return;
      const step = deltaMs / cycleDuration;
      let nextPosition = positionRef.current + step;

      if (nextPosition >= 1) {
        const cyclesCompleted = Math.floor(nextPosition);
        const updatedCycleCount = cycleCountRef.current + cyclesCompleted;
        cycleCountRef.current = updatedCycleCount;
        setCycleCount(updatedCycleCount);

        if (maxCycles !== undefined && updatedCycleCount >= maxCycles) {
          setIsActive(false);
          setIsComplete(true);
          // Set final position to a nice resting state (golden ratio position)
          positionRef.current = 0.618;
          setPosition(0.618);
          onCompleteRef.current?.();
          return;
        }

        nextPosition = nextPosition % 1;
      }

      positionRef.current = nextPosition;
      setPosition(nextPosition);

      if (SHIMMER_DEBUG_ENABLED) {
        const lastDebug = lastDebugRef.current;
        if (nowMs - lastDebug >= 1000) {
          lastDebugRef.current = nowMs;
          debugShimmer(
            `deltaMs=${deltaMs.toFixed(1)} position=${nextPosition.toFixed(3)} cycle=${cycleCountRef.current}`
          );
        }
      }
    },
    [cycleDuration, maxCycles]
  );

  useEffect(() => {
    if (timestamp !== 0) {
      hasAnimationTickRef.current = true;
    }
  }, [timestamp]);

  const useGlobalClock = hasAnimationTickRef.current && !isPaused;

  useEffect(() => {
    lastTickRef.current = null;
  }, []);

  useEffect(() => {
    if (!useGlobalClock || !isActive || isComplete) return;

    const lastTick = lastTickRef.current ?? timestamp;
    lastTickRef.current = timestamp;
    const deltaMs = timestamp - lastTick;
    advancePosition(deltaMs, timestamp);
  }, [useGlobalClock, isActive, isComplete, timestamp, advancePosition]);

  useEffect(() => {
    if (useGlobalClock || !isActive || isComplete) return;

    lastTickRef.current = Date.now();

    const timer = setInterval(() => {
      const now = Date.now();
      const lastTick = lastTickRef.current ?? now;
      lastTickRef.current = now;
      const deltaMs = now - lastTick;
      advancePosition(deltaMs, now);
    }, updateInterval);

    return () => clearInterval(timer);
  }, [useGlobalClock, isActive, isComplete, updateInterval, advancePosition]);

  useEffect(() => {
    if (enabled && !isComplete) {
      setIsActive(true);
      return;
    }

    if (!enabled) {
      setIsActive(false);
    }
  }, [enabled, isComplete]);

  // Calculate intensity using cosine for smooth falloff
  // Peak intensity at current position, smoothly fading around it
  const intensity = Math.cos(position * Math.PI * 2 - Math.PI) * 0.5 + 0.5;

  const pause = () => setIsActive(false);
  const resume = () => {
    if (!isComplete) setIsActive(true);
  };

  return {
    position,
    intensity,
    isActive,
    pause,
    resume,
    cycleCount,
    isComplete,
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
