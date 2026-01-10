/**
 * ShimmerContext - Shared shimmer state provider
 *
 * Provides a single shared shimmer timer for all consumers,
 * eliminating multiple independent timers that can cause animation flickering.
 *
 * @module tui/components/Banner/ShimmerContext
 */

import { createContext, type ReactNode, useContext } from "react";
import { type ShimmerState, useShimmer } from "./useShimmer.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Context value extends ShimmerState for shared shimmer state
 */
type ShimmerContextValue = ShimmerState;

// =============================================================================
// Context
// =============================================================================

/**
 * Default shimmer context value (inactive state)
 */
const defaultShimmerValue: ShimmerContextValue = {
  position: 0,
  intensity: 0,
  cycleCount: 0,
  isComplete: false,
  isActive: false,
  pause: () => {},
  resume: () => {},
};

const ShimmerContext = createContext<ShimmerContextValue>(defaultShimmerValue);

// =============================================================================
// Provider
// =============================================================================

/**
 * Props for the ShimmerProvider component.
 */
export interface ShimmerProviderProps {
  /** Child components that will share the shimmer state */
  readonly children: ReactNode;
  /** Whether shimmer animation is enabled (default: true) */
  readonly enabled?: boolean;
  /** Maximum number of cycles before stopping (undefined = infinite) */
  readonly maxCycles?: number;
  /** Duration of one complete shimmer cycle in milliseconds (default: 3000) */
  readonly cycleDuration?: number;
  /** Update interval in milliseconds (default: 100 for smoother motion) */
  readonly updateInterval?: number;
  /** Callback when max cycles completed */
  readonly onComplete?: () => void;
}

/**
 * ShimmerProvider creates a single shared shimmer timer for all child components.
 *
 * Use this to wrap multiple shimmer-consuming components to ensure they all
 * animate in sync and share a single timer instead of each running their own.
 *
 * @example
 * ```tsx
 * <ShimmerProvider enabled maxCycles={3} cycleDuration={3000}>
 *   <Banner />
 *   <HeaderBanner />
 *   <Header />
 * </ShimmerProvider>
 * ```
 */
export function ShimmerProvider({
  children,
  enabled = true,
  maxCycles,
  cycleDuration = 3000,
  updateInterval = 100,
  onComplete,
}: ShimmerProviderProps): React.JSX.Element {
  const shimmer = useShimmer({
    enabled,
    maxCycles,
    cycleDuration,
    updateInterval,
    onComplete,
  });

  return <ShimmerContext.Provider value={shimmer}>{children}</ShimmerContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access shared shimmer state from ShimmerProvider.
 *
 * If used outside a ShimmerProvider, returns default inactive state.
 * For standalone shimmer (not sharing timer), use useShimmer() directly instead.
 *
 * @example
 * ```tsx
 * function AnimatedComponent() {
 *   const { position, intensity, isComplete } = useSharedShimmer();
 *   // Use position (0-1) and intensity (0-1) for animation
 * }
 * ```
 */
export function useSharedShimmer(): ShimmerContextValue {
  return useContext(ShimmerContext);
}

/**
 * Hook to check if component is inside a ShimmerProvider.
 * Useful for components that want to optionally use shared state.
 */
export function useIsInShimmerProvider(): boolean {
  const context = useContext(ShimmerContext);
  // Check if we have the actual shimmer functions (not default no-ops)
  return (
    context.isActive !== defaultShimmerValue.isActive ||
    context.position !== defaultShimmerValue.position ||
    context.cycleCount !== defaultShimmerValue.cycleCount
  );
}
