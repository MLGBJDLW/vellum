/**
 * useModeController Hook (T003)
 *
 * Manages render mode decisions for adaptive message list rendering.
 * Dynamically switches between Static, Windowed, and Virtualized modes
 * based on content height vs available viewport.
 *
 * @module tui/hooks/useModeController
 */

import { useMemo } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Available rendering modes for message list.
 */
export type RenderMode = "static" | "windowed" | "virtualized";

/**
 * Reason for the current mode selection.
 */
export type ModeReason =
  | "content-fits" // Content fits in viewport
  | "content-exceeds-viewport" // Content exceeds viewport but not virtual threshold
  | "content-very-large" // Content exceeds virtual threshold
  | "forced"; // Mode was forced via config

/**
 * Configuration for mode controller.
 */
export interface ModeControllerConfig {
  /** Multiplier for static threshold (default: 1.2 = 120% of viewport) */
  readonly staticMultiplier?: number;
  /** Multiplier for virtual threshold (default: 5.0 = 500% of viewport) */
  readonly virtualMultiplier?: number;
  /** Force a specific mode, bypassing auto-detection */
  readonly forceMode?: RenderMode;
  /** Minimum window size in lines (default: 10) */
  readonly minWindowSize?: number;
  /** Maximum window size as ratio of available height (default: 0.8) */
  readonly maxWindowSizeRatio?: number;
}

/**
 * Input for useModeController hook.
 */
export interface UseModeControllerInput {
  /** Available height in lines for content */
  readonly availableHeight: number;
  /** Total estimated height of all content in lines */
  readonly totalContentHeight: number;
  /** Configuration options */
  readonly config?: ModeControllerConfig;
}

/**
 * State returned by useModeController.
 */
export interface ModeControllerState {
  /** Current render mode */
  readonly mode: RenderMode;
  /** Recommended window size for windowed mode */
  readonly windowSize: number;
  /** Reason for the current mode selection */
  readonly modeReason: ModeReason;
  /** Computed static threshold (content height below this = static mode) */
  readonly staticThreshold: number;
  /** Computed virtual threshold (content height above this = virtualized mode) */
  readonly virtualThreshold: number;
  /** Whether mode is auto-detected (true) or forced (false) */
  readonly isAutoMode: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_STATIC_MULTIPLIER = 1.2;
const DEFAULT_VIRTUAL_MULTIPLIER = 5.0;
const DEFAULT_MIN_WINDOW_SIZE = 10;
const DEFAULT_MAX_WINDOW_SIZE_RATIO = 0.8;

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for managing render mode decisions based on content vs viewport.
 *
 * Mode selection logic:
 * - Static: totalContentHeight ≤ availableHeight × staticMultiplier
 * - Windowed: staticThreshold < totalContentHeight ≤ virtualThreshold
 * - Virtualized: totalContentHeight > virtualThreshold
 *
 * @param input - Input parameters including viewport and content heights
 * @returns Mode controller state with recommended settings
 */
export function useModeController(input: UseModeControllerInput): ModeControllerState {
  const { availableHeight, totalContentHeight, config = {} } = input;

  const {
    staticMultiplier = DEFAULT_STATIC_MULTIPLIER,
    virtualMultiplier = DEFAULT_VIRTUAL_MULTIPLIER,
    forceMode,
    minWindowSize = DEFAULT_MIN_WINDOW_SIZE,
    maxWindowSizeRatio = DEFAULT_MAX_WINDOW_SIZE_RATIO,
  } = config;

  return useMemo(() => {
    // Compute thresholds from available height
    const staticThreshold = Math.max(1, availableHeight * staticMultiplier);
    const virtualThreshold = Math.max(1, availableHeight * virtualMultiplier);

    // Calculate window size with min constraint and max ratio
    const windowSize = Math.max(minWindowSize, Math.floor(availableHeight * maxWindowSizeRatio));

    // Determine if auto mode (not forced)
    const isAutoMode = !forceMode;

    // Handle forced mode
    if (forceMode) {
      return {
        mode: forceMode,
        windowSize,
        modeReason: "forced" as const,
        staticThreshold,
        virtualThreshold,
        isAutoMode,
      };
    }

    // Auto-detect mode based on content height vs thresholds
    let mode: RenderMode;
    let modeReason: ModeReason;

    if (totalContentHeight <= staticThreshold) {
      mode = "static";
      modeReason = "content-fits";
    } else if (totalContentHeight <= virtualThreshold) {
      mode = "windowed";
      modeReason = "content-exceeds-viewport";
    } else {
      mode = "virtualized";
      modeReason = "content-very-large";
    }

    return {
      mode,
      windowSize,
      modeReason,
      staticThreshold,
      virtualThreshold,
      isAutoMode,
    };
  }, [
    availableHeight,
    totalContentHeight,
    staticMultiplier,
    virtualMultiplier,
    forceMode,
    minWindowSize,
    maxWindowSizeRatio,
  ]);
}
