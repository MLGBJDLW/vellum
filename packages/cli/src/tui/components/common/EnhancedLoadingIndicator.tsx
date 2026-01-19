/**
 * Enhanced Loading Indicator Component
 *
 * Advanced loading indicator with elapsed time, cancel hints,
 * and configurable show/hide delays. Inspired by Gemini CLI.
 *
 * @module tui/components/common/EnhancedLoadingIndicator
 */

import { Box, Text } from "ink";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "../../theme/index.js";
import { Spinner } from "./Spinner.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the EnhancedLoadingIndicator component.
 */
export interface EnhancedLoadingIndicatorProps {
  /** Whether the loading indicator is active */
  readonly isLoading: boolean;
  /** Label to display alongside the spinner */
  readonly label?: string;
  /** Whether to show elapsed time (default: true) */
  readonly showElapsedTime?: boolean;
  /** Whether to show cancel hint (default: true) */
  readonly showCancelHint?: boolean;
  /** Custom cancel hint text */
  readonly cancelHint?: string;
  /** Delay before showing the indicator in ms (default: 0) */
  readonly showDelay?: number;
  /** Delay before hiding the indicator in ms (default: 0) */
  readonly hideDelay?: number;
  /** Spinner animation frames */
  readonly spinnerFrames?: readonly string[];
  /** Spinner color */
  readonly spinnerColor?: string;
  /** Content to display on the right side */
  readonly rightContent?: React.ReactNode;
  /** Whether the indicator is in a narrow layout */
  readonly narrow?: boolean;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to manage elapsed time with proper reset behavior.
 *
 * @param isActive - Whether the timer should be running
 * @param resetKey - Key that triggers timer reset when changed
 * @returns Elapsed time in seconds
 */
export function useElapsedTime(isActive: boolean, resetKey?: unknown): number {
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevResetKeyRef = useRef(resetKey);
  const prevIsActiveRef = useRef(isActive);

  useEffect(() => {
    let shouldResetTime = false;

    // Reset on key change
    if (prevResetKeyRef.current !== resetKey) {
      shouldResetTime = true;
      prevResetKeyRef.current = resetKey;
    }

    // Reset on transition from inactive to active
    if (!prevIsActiveRef.current && isActive) {
      shouldResetTime = true;
    }

    if (shouldResetTime) {
      setElapsedTime(0);
    }
    prevIsActiveRef.current = isActive;

    // Manage interval
    if (isActive) {
      // Clear previous interval
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive, resetKey]);

  return elapsedTime;
}

/**
 * Hook to manage show/hide delays for smooth transitions.
 *
 * @param isActive - Whether the element should be shown
 * @param showDelay - Delay before showing in ms
 * @param hideDelay - Delay before hiding in ms
 * @returns Whether the element should be visible
 */
export function useDelayedVisibility(isActive: boolean, showDelay = 0, hideDelay = 0): boolean {
  const [isVisible, setIsVisible] = useState(isActive && showDelay === 0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (isActive) {
      if (showDelay > 0) {
        timeoutRef.current = setTimeout(() => {
          setIsVisible(true);
        }, showDelay);
      } else {
        setIsVisible(true);
      }
    } else {
      if (hideDelay > 0) {
        timeoutRef.current = setTimeout(() => {
          setIsVisible(false);
        }, hideDelay);
      } else {
        setIsVisible(false);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isActive, showDelay, hideDelay]);

  return isVisible;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format duration in a human-readable way.
 *
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

// =============================================================================
// Component
// =============================================================================

/**
 * EnhancedLoadingIndicator - Feature-rich loading indicator.
 *
 * Features:
 * - Customizable spinner with label
 * - Elapsed time display (auto-formatted)
 * - Cancel hint with configurable text
 * - Show/hide delays for smooth transitions
 * - Responsive narrow layout support
 *
 * @example
 * ```tsx
 * // Basic usage
 * <EnhancedLoadingIndicator isLoading={true} label="Processing..." />
 *
 * // With all features
 * <EnhancedLoadingIndicator
 *   isLoading={isProcessing}
 *   label="Generating response..."
 *   showElapsedTime
 *   showCancelHint
 *   cancelHint="Press Esc to cancel"
 *   showDelay={200}
 * />
 *
 * // Narrow layout
 * <EnhancedLoadingIndicator
 *   isLoading={true}
 *   label="Working..."
 *   narrow
 * />
 * ```
 */
export function EnhancedLoadingIndicator({
  isLoading,
  label = "Loading...",
  showElapsedTime = true,
  showCancelHint = true,
  cancelHint = "Esc to cancel",
  showDelay = 0,
  hideDelay = 0,
  spinnerFrames,
  spinnerColor,
  rightContent,
  narrow = false,
}: EnhancedLoadingIndicatorProps): React.JSX.Element | null {
  const { theme } = useTheme();

  // Manage visibility with delays
  const isVisible = useDelayedVisibility(isLoading, showDelay, hideDelay);

  // Track elapsed time
  const elapsedTime = useElapsedTime(isLoading);

  // Build the time and cancel hint text
  const metaContent = useCallback(() => {
    const parts: string[] = [];

    if (showCancelHint && cancelHint) {
      parts.push(cancelHint);
    }

    if (showElapsedTime) {
      parts.push(`⏱ ${formatDuration(elapsedTime)}`);
    }

    return parts.length > 0 ? `(${parts.join(", ")})` : null;
  }, [showCancelHint, cancelHint, showElapsedTime, elapsedTime]);

  if (!isVisible) {
    return null;
  }

  const meta = metaContent();

  if (narrow) {
    // Narrow layout: stack vertically
    return (
      <Box flexDirection="column">
        <Box>
          <Spinner color={spinnerColor ?? theme.colors.info} frames={spinnerFrames} />
          <Text color={theme.colors.info}> {label}</Text>
        </Box>
        {meta && (
          <Box>
            <Text dimColor>{meta}</Text>
          </Box>
        )}
        {rightContent && <Box>{rightContent}</Box>}
      </Box>
    );
  }

  // Normal layout: horizontal
  return (
    <Box flexDirection="row" alignItems="center">
      <Spinner color={spinnerColor ?? theme.colors.info} frames={spinnerFrames} />
      <Text color={theme.colors.info}> {label}</Text>
      {meta && (
        <>
          <Text> </Text>
          <Text dimColor>{meta}</Text>
        </>
      )}
      {rightContent && (
        <>
          <Box flexGrow={1} />
          {rightContent}
        </>
      )}
    </Box>
  );
}

export default EnhancedLoadingIndicator;
