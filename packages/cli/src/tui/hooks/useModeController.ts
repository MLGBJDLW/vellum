/**
 * useModeController Hook (T003)
 *
 * Manages render mode decisions for adaptive message list rendering.
 * Dynamically switches between Static, Windowed, and Virtualized modes
 * based on content height vs available viewport AND message count.
 *
 * Key features:
 * - Content height-based thresholds for viewport fitting
 * - Message count-based thresholds for conversation complexity
 * - Hysteresis to prevent rapid mode switching at boundaries
 *
 * @module tui/hooks/useModeController
 */

import { useMemo, useRef } from "react";

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
  /**
   * Message count threshold for virtualized mode (default: 50).
   * When message count exceeds this, prefer virtualized rendering regardless of height.
   */
  readonly messageCountThreshold?: number;
  /**
   * Hysteresis buffer for message count threshold (default: 10).
   * Prevents rapid switching at boundaries:
   * - Switch TO virtualized at: messageCountThreshold
   * - Switch FROM virtualized at: messageCountThreshold - hysteresis
   */
  readonly messageCountHysteresis?: number;
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
  /** Current message count for message-based threshold */
  readonly messageCount?: number;
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
  /** Current message count threshold in use */
  readonly messageCountThreshold: number;
  /** Whether virtualized mode was triggered by message count */
  readonly virtualizedByMessageCount: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_STATIC_MULTIPLIER = 1.2;
const DEFAULT_VIRTUAL_MULTIPLIER = 5.0;
const DEFAULT_MIN_WINDOW_SIZE = 10;
const DEFAULT_MAX_WINDOW_SIZE_RATIO = 0.8;
/** Default message count threshold for virtualized mode */
const DEFAULT_MESSAGE_COUNT_THRESHOLD = 50;
/** Default hysteresis buffer to prevent rapid switching */
const DEFAULT_MESSAGE_COUNT_HYSTERESIS = 10;

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
  const { availableHeight, totalContentHeight, config = {}, messageCount = 0 } = input;

  const {
    staticMultiplier = DEFAULT_STATIC_MULTIPLIER,
    virtualMultiplier = DEFAULT_VIRTUAL_MULTIPLIER,
    forceMode,
    minWindowSize = DEFAULT_MIN_WINDOW_SIZE,
    maxWindowSizeRatio = DEFAULT_MAX_WINDOW_SIZE_RATIO,
    messageCountThreshold = DEFAULT_MESSAGE_COUNT_THRESHOLD,
    messageCountHysteresis = DEFAULT_MESSAGE_COUNT_HYSTERESIS,
  } = config;

  // Track previous virtualized state for hysteresis
  // Hysteresis prevents rapid mode switching at threshold boundaries:
  // - Enter virtualized at: threshold
  // - Exit virtualized at: threshold - hysteresis
  const wasVirtualizedByCountRef = useRef(false);

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
      wasVirtualizedByCountRef.current = false;
      return {
        mode: forceMode,
        windowSize,
        modeReason: "forced" as const,
        staticThreshold,
        virtualThreshold,
        isAutoMode,
        messageCountThreshold,
        virtualizedByMessageCount: false,
      };
    }

    // Check message count threshold with hysteresis
    // Once virtualized by message count, stay virtualized until count drops below (threshold - hysteresis)
    let virtualizedByMessageCount = false;
    const exitThreshold = messageCountThreshold - messageCountHysteresis;

    if (wasVirtualizedByCountRef.current) {
      // Already virtualized by count - only exit if below exit threshold
      virtualizedByMessageCount = messageCount >= exitThreshold;
    } else {
      // Not yet virtualized by count - enter if at or above entry threshold
      virtualizedByMessageCount = messageCount >= messageCountThreshold;
    }

    // Update ref for next render
    wasVirtualizedByCountRef.current = virtualizedByMessageCount;

    // Auto-detect mode based on content height vs thresholds
    // Message count threshold takes precedence for large conversations
    let mode: RenderMode;
    let modeReason: ModeReason;

    if (virtualizedByMessageCount) {
      // Message count triggered virtualized mode
      mode = "virtualized";
      modeReason = "content-very-large";
    } else if (totalContentHeight <= staticThreshold) {
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
      messageCountThreshold,
      virtualizedByMessageCount,
    };
  }, [
    availableHeight,
    totalContentHeight,
    staticMultiplier,
    virtualMultiplier,
    forceMode,
    minWindowSize,
    maxWindowSizeRatio,
    messageCount,
    messageCountThreshold,
    messageCountHysteresis,
  ]);
}
