/**
 * Flicker Detector Hook
 *
 * Detects when content exceeds container bounds, which can cause
 * visual flickering or rendering artifacts in terminal UIs.
 *
 * This hook is essential for preventing TUI rendering issues by
 * detecting overflow conditions before they cause visual problems.
 *
 * Ported from Gemini CLI for Vellum TUI.
 *
 * @module tui/hooks/useFlickerDetector
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the flicker detector hook
 */
export interface UseFlickerDetectorOptions {
  /** Height of the content in rows/lines */
  readonly contentHeight: number;
  /** Height of the container in rows/lines */
  readonly containerHeight: number;
  /**
   * Threshold in rows before considering content as overflowing.
   * A small threshold helps prevent edge-case flickering.
   * @default 0
   */
  readonly threshold?: number;
  /**
   * Enable debouncing to prevent rapid state changes.
   * Useful when content height changes frequently.
   * @default true
   */
  readonly debounce?: boolean;
  /**
   * Debounce delay in milliseconds.
   * @default 50
   */
  readonly debounceDelay?: number;
}

/**
 * Result from the flicker detector hook
 */
export interface FlickerDetectorResult {
  /** Whether the content is overflowing the container */
  readonly isOverflowing: boolean;
  /** Amount of overflow in rows (negative if content fits) */
  readonly overflow: number;
  /** Percentage of container filled (can exceed 100%) */
  readonly fillPercentage: number;
  /** Whether overflow state recently changed (indicates potential flicker) */
  readonly isTransitioning: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Default debounce delay in milliseconds */
const DEFAULT_DEBOUNCE_DELAY = 50;

/** Transition window for detecting rapid state changes (ms) */
const TRANSITION_WINDOW = 100;

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook to detect content overflow that may cause visual flickering.
 *
 * Terminal UIs can flicker when content rapidly alternates between
 * fitting and overflowing the visible area. This hook provides:
 *
 * 1. **Overflow detection**: Know when content exceeds bounds
 * 2. **Transition tracking**: Detect rapid state changes
 * 3. **Debouncing**: Prevent jittery state updates
 *
 * @param options - Configuration for overflow detection
 * @returns Overflow state and metrics
 *
 * @example
 * ```tsx
 * function MessageList({ messages, containerHeight }) {
 *   const contentHeight = messages.length * 3; // Estimate 3 rows per message
 *
 *   const { isOverflowing, overflow, isTransitioning } = useFlickerDetector({
 *     contentHeight,
 *     containerHeight,
 *     threshold: 2, // Allow 2-row buffer
 *   });
 *
 *   if (isOverflowing) {
 *     // Enable virtualization or truncation
 *     return <VirtualizedList data={messages} />;
 *   }
 *
 *   // Render all messages directly
 *   return messages.map(msg => <Message key={msg.id} {...msg} />);
 * }
 * ```
 */
export function useFlickerDetector(options: UseFlickerDetectorOptions): FlickerDetectorResult {
  const {
    contentHeight,
    containerHeight,
    threshold = 0,
    debounce = true,
    debounceDelay = DEFAULT_DEBOUNCE_DELAY,
  } = options;

  // Track the raw overflow state
  const [debouncedOverflow, setDebouncedOverflow] = useState(() => {
    return contentHeight - containerHeight > threshold;
  });

  // Track rapid transitions
  const [isTransitioning, setIsTransitioning] = useState(false);
  const lastChangeTime = useRef<number>(0);
  const transitionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Calculate raw overflow state (not debounced)
   */
  const rawOverflow = useMemo(() => {
    return contentHeight - containerHeight;
  }, [contentHeight, containerHeight]);

  const rawIsOverflowing = rawOverflow > threshold;

  /**
   * Calculate fill percentage
   */
  const fillPercentage = useMemo(() => {
    if (containerHeight <= 0) return 0;
    return (contentHeight / containerHeight) * 100;
  }, [contentHeight, containerHeight]);

  /**
   * Handle state transitions with optional debouncing
   */
  const updateOverflowState = useCallback((newState: boolean) => {
    const now = Date.now();
    const timeSinceLastChange = now - lastChangeTime.current;

    // Detect rapid transitions (potential flicker source)
    if (timeSinceLastChange < TRANSITION_WINDOW) {
      setIsTransitioning(true);

      // Clear existing timeout
      if (transitionTimeout.current) {
        clearTimeout(transitionTimeout.current);
      }

      // Clear transition flag after window
      transitionTimeout.current = setTimeout(() => {
        setIsTransitioning(false);
      }, TRANSITION_WINDOW);
    }

    lastChangeTime.current = now;
    setDebouncedOverflow(newState);
  }, []);

  /**
   * Effect to update overflow state with optional debouncing
   */
  useEffect(() => {
    if (!debounce) {
      // No debouncing - update immediately
      if (rawIsOverflowing !== debouncedOverflow) {
        updateOverflowState(rawIsOverflowing);
      }
      return;
    }

    // Debounced update
    const timeoutId = setTimeout(() => {
      if (rawIsOverflowing !== debouncedOverflow) {
        updateOverflowState(rawIsOverflowing);
      }
    }, debounceDelay);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [rawIsOverflowing, debouncedOverflow, debounce, debounceDelay, updateOverflowState]);

  /**
   * Cleanup transition timeout on unmount
   */
  useEffect(() => {
    return () => {
      if (transitionTimeout.current) {
        clearTimeout(transitionTimeout.current);
      }
    };
  }, []);

  /**
   * Return memoized result
   */
  return useMemo<FlickerDetectorResult>(
    () => ({
      isOverflowing: debounce ? debouncedOverflow : rawIsOverflowing,
      overflow: rawOverflow,
      fillPercentage,
      isTransitioning,
    }),
    [debounce, debouncedOverflow, rawIsOverflowing, rawOverflow, fillPercentage, isTransitioning]
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Simple overflow check without the full hook (for one-off calculations).
 *
 * @param contentHeight - Height of the content
 * @param containerHeight - Height of the container
 * @param threshold - Buffer threshold (default: 0)
 * @returns Whether content is overflowing
 */
export function isContentOverflowing(
  contentHeight: number,
  containerHeight: number,
  threshold = 0
): boolean {
  return contentHeight - containerHeight > threshold;
}

/**
 * Calculate recommended container height to fit content with buffer.
 *
 * @param contentHeight - Height of the content
 * @param bufferRows - Additional buffer rows (default: 2)
 * @returns Recommended container height
 */
export function calculateSafeContainerHeight(contentHeight: number, bufferRows = 2): number {
  return contentHeight + bufferRows;
}
