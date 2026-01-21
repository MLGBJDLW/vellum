/**
 * usePlaceholderRotation Hook
 *
 * Rotates through example placeholder texts to help users discover capabilities.
 * Inspired by OpenCode's prompt-input pattern.
 *
 * @module tui/hooks/usePlaceholderRotation
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the usePlaceholderRotation hook.
 */
export interface UsePlaceholderRotationOptions {
  /** Rotation interval in milliseconds (default: 5000) */
  readonly interval?: number;
  /** Whether rotation is enabled (default: true) */
  readonly enabled?: boolean;
  /** Custom placeholder examples (uses defaults if not provided) */
  readonly examples?: readonly string[];
  /** Static placeholder to use when input has content */
  readonly staticPlaceholder?: string;
}

/**
 * Return value of usePlaceholderRotation hook.
 */
export interface UsePlaceholderRotationReturn {
  /** Current placeholder text to display */
  readonly placeholder: string;
  /** Index of current placeholder in examples array */
  readonly currentIndex: number;
  /** Manually advance to next placeholder */
  readonly next: () => void;
  /** Reset to first placeholder */
  readonly reset: () => void;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default placeholder examples showcasing Vellum capabilities.
 * Each demonstrates a different type of task users can request.
 */
export const DEFAULT_PLACEHOLDER_EXAMPLES: readonly string[] = [
  "Implement a user authentication feature...",
  "Fix the bug in the payment service...",
  "Refactor this function to be more readable...",
  "Add unit tests for the API endpoints...",
  "Explain how this code works...",
  "Create a React component for...",
  "Optimize this database query...",
  "Review this code for security issues...",
  "Generate TypeScript types for this API...",
  "Help me debug this error...",
] as const;

/** Default rotation interval: 5 seconds */
const DEFAULT_INTERVAL_MS = 5000;

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook that rotates through placeholder examples.
 *
 * @example
 * ```tsx
 * const { placeholder } = usePlaceholderRotation({
 *   interval: 5000,
 *   enabled: inputValue.length === 0,
 * });
 *
 * return <TextInput placeholder={placeholder} />;
 * ```
 */
export function usePlaceholderRotation({
  interval = DEFAULT_INTERVAL_MS,
  enabled = true,
  examples = DEFAULT_PLACEHOLDER_EXAMPLES,
  staticPlaceholder = "Type a message, /command, or @mention...",
}: UsePlaceholderRotationOptions = {}): UsePlaceholderRotationReturn {
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Memoize examples array to prevent unnecessary effect triggers
  const memoizedExamples = useMemo(() => examples, [examples]);

  // Cleanup interval on unmount or when dependencies change
  const clearRotationInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Advance to next placeholder
  const next = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % memoizedExamples.length);
  }, [memoizedExamples.length]);

  // Reset to first placeholder
  const reset = useCallback(() => {
    setCurrentIndex(0);
  }, []);

  // Set up rotation interval
  useEffect(() => {
    if (!enabled || memoizedExamples.length <= 1) {
      clearRotationInterval();
      return;
    }

    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % memoizedExamples.length);
    }, interval);

    return clearRotationInterval;
  }, [enabled, interval, memoizedExamples.length, clearRotationInterval]);

  // Get current placeholder
  const placeholder = useMemo(() => {
    if (!enabled || memoizedExamples.length === 0) {
      return staticPlaceholder;
    }
    return memoizedExamples[currentIndex] ?? staticPlaceholder;
  }, [enabled, memoizedExamples, currentIndex, staticPlaceholder]);

  return {
    placeholder,
    currentIndex,
    next,
    reset,
  };
}
