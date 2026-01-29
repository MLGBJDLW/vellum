/**
 * Animation Context
 *
 * Global animation context that provides:
 * 1. A centralized animation frame counter
 * 2. FPS limiting to prevent excessive re-renders (60 FPS max)
 * 3. VS Code terminal detection for adaptive timing
 *
 * All animated components should subscribe to this instead of individual timers
 * to reduce flickering and improve performance.
 *
 * @module tui/context/AnimationContext
 */

import type React from "react";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// =============================================================================
// Constants
// =============================================================================

/** Minimum frame interval (~60 FPS) to prevent excessive re-renders */
const MIN_FRAME_INTERVAL_MS = 16;

/** Base animation tick interval */
const BASE_ANIMATION_TICK_MS = 120;

/** Extended animation tick for VS Code terminal (more conservative) */
const VSCODE_ANIMATION_TICK_MS = 200;

// =============================================================================
// Environment Detection
// =============================================================================

/**
 * Detects if running inside VS Code integrated terminal.
 * VS Code terminals benefit from slightly longer intervals to reduce flickering.
 */
function isVSCodeTerminal(): boolean {
  return (
    process.env.TERM_PROGRAM === "vscode" ||
    process.env.VSCODE_INJECTION === "1" ||
    !!process.env.VSCODE_GIT_IPC_HANDLE
  );
}

/**
 * Gets the optimal animation tick interval based on terminal environment.
 * VS Code terminals use a longer interval to reduce flickering.
 */
function getAnimationTick(): number {
  // Allow environment override for debugging
  const envTick = Number(process.env.VELLUM_ANIMATION_TICK);
  if (Number.isFinite(envTick) && envTick > 0) {
    return envTick;
  }

  return isVSCodeTerminal() ? VSCODE_ANIMATION_TICK_MS : BASE_ANIMATION_TICK_MS;
}

// =============================================================================
// Types
// =============================================================================

/**
 * Animation context state
 */
export interface AnimationState {
  /** Current animation frame counter (monotonically increasing) */
  readonly frame: number;
  /** Current timestamp in milliseconds */
  readonly timestamp: number;
}

/**
 * Animation context value
 */
export interface AnimationContextValue extends AnimationState {
  /** Whether running in VS Code terminal */
  readonly isVSCode: boolean;
  /** Current animation tick interval in ms */
  readonly tickInterval: number;
  /** Whether animations are currently paused */
  readonly isPaused: boolean;
  /** Pause all animations (useful during text input to reduce flickering) */
  readonly pauseAnimations: () => void;
  /** Resume animations after pausing */
  readonly resumeAnimations: () => void;
}

/**
 * Props for the AnimationProvider component
 */
export interface AnimationProviderProps {
  /** Children to render */
  readonly children: ReactNode;
  /** Override the animation tick interval (for testing) */
  readonly tickInterval?: number;
}

// =============================================================================
// Context
// =============================================================================

const initialState: AnimationContextValue = {
  frame: 0,
  timestamp: Date.now(),
  isVSCode: isVSCodeTerminal(),
  tickInterval: getAnimationTick(),
  isPaused: false,
  pauseAnimations: () => {},
  resumeAnimations: () => {},
};

/**
 * Animation context - provides global animation frame and timing
 */
export const AnimationContext = createContext<AnimationContextValue>(initialState);

// =============================================================================
// Provider Component
// =============================================================================

/**
 * Animation provider that manages a global animation loop.
 *
 * Features:
 * - Single timer for all animated components
 * - FPS limiting to prevent excessive renders
 * - VS Code terminal detection for adaptive timing
 * - Environment variable override for debugging
 *
 * @example
 * ```tsx
 * // In root provider
 * <AnimationProvider>
 *   <App />
 * </AnimationProvider>
 *
 * // Override tick for testing
 * <AnimationProvider tickInterval={200}>
 *   <SlowAnimatedComponent />
 * </AnimationProvider>
 * ```
 */
export function AnimationProvider({
  children,
  tickInterval: tickOverride,
}: AnimationProviderProps): React.JSX.Element {
  const animationsDisabled = process.env.VELLUM_TEST_DISABLE_ANIMATION === "1";
  const tickInterval = tickOverride ?? getAnimationTick();
  const isVSCode = isVSCodeTerminal();

  const [state, setState] = useState<AnimationState>({
    frame: 0,
    timestamp: Date.now(),
  });

  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const lastRenderRef = useRef(Date.now());

  // Stable pause/resume callbacks
  const pauseAnimations = useCallback(() => {
    isPausedRef.current = true;
    setIsPaused(true);
  }, []);

  const resumeAnimations = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
  }, []);

  useEffect(() => {
    // Don't start timer when paused - completely stops animation overhead
    if (animationsDisabled || isPaused) return;

    let mounted = true;

    const tick = () => {
      if (!mounted) return;

      const now = Date.now();
      const sinceLastRender = now - lastRenderRef.current;

      // FPS limiter: ensure minimum interval since last render
      if (sinceLastRender >= MIN_FRAME_INTERVAL_MS) {
        lastRenderRef.current = now;
        setState((prev) => ({
          frame: prev.frame + 1,
          timestamp: now,
        }));
      }
    };

    // Use setInterval for consistent timing in terminal environments
    // requestAnimationFrame is designed for visual rendering, not terminal output
    const timer = setInterval(tick, tickInterval);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [tickInterval, isPaused, animationsDisabled]);

  const contextValue: AnimationContextValue = {
    ...state,
    isVSCode,
    tickInterval,
    isPaused,
    pauseAnimations,
    resumeAnimations,
  };

  return <AnimationContext.Provider value={contextValue}>{children}</AnimationContext.Provider>;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to access the full animation context.
 *
 * Returns safe defaults if context is not available (e.g., when rendered
 * outside AnimationProvider). This prevents "Rendered more hooks than
 * during the previous render" errors.
 *
 * @returns Animation context value with frame, timestamp, and metadata
 *
 * @example
 * ```tsx
 * function AnimatedComponent() {
 *   const { frame, timestamp, isVSCode } = useAnimation();
 *   // Use frame/timestamp for animations
 * }
 * ```
 */
export function useAnimation(): AnimationContextValue {
  const context = useContext(AnimationContext);
  // Return safe defaults if context is not available
  // This prevents hook count errors when rendered outside AnimationProvider
  if (!context) {
    return initialState;
  }
  return context;
}

/**
 * Hook to get the current animation frame index for a set of frames.
 *
 * This is the recommended way to animate through a sequence of frames
 * (like spinner characters) without managing your own state or timer.
 *
 * @param frames - Array of frames or number of total frames
 * @returns Current frame index (0 to frames.length-1 or 0 to frames-1)
 *
 * @example
 * ```tsx
 * // With array of frames
 * const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
 * function Spinner() {
 *   const frameIndex = useAnimationFrame(SPINNER_FRAMES);
 *   return <Text>{SPINNER_FRAMES[frameIndex]}</Text>;
 * }
 *
 * // With frame count
 * function FourPhaseAnimation() {
 *   const phase = useAnimationFrame(4);
 *   return <Text>Phase {phase + 1}</Text>;
 * }
 * ```
 */
export function useAnimationFrame(frames: readonly unknown[] | number): number {
  const { frame } = useAnimation();
  const frameCount = typeof frames === "number" ? frames : frames.length;
  return frameCount > 0 ? frame % frameCount : 0;
}

// =============================================================================
// Exports
// =============================================================================

export default AnimationProvider;
