/**
 * Terminal Size Hook
 *
 * React hook for subscribing to terminal resize events.
 * Provides reactive terminal dimensions with debouncing.
 *
 * @module tui/hooks/useTerminalSize
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isNarrowWidth } from "../utils/isNarrowWidth.js";
import { getMaxContentWidth, getTerminalHeight, getTerminalWidth } from "../utils/ui-sizing.js";

/**
 * Terminal size state returned by useTerminalSize hook.
 */
export interface TerminalSize {
  /** Terminal width in columns */
  width: number;
  /** Terminal height in rows */
  height: number;
  /** Whether terminal is narrow (<= 80 columns) */
  isNarrow: boolean;
  /** Maximum content width for responsive layouts */
  maxContentWidth: number;
}

/**
 * Options for useTerminalSize hook.
 */
export interface UseTerminalSizeOptions {
  /**
   * Debounce delay in milliseconds for resize events.
   * Set to 0 to disable debouncing.
   * @default 100
   */
  debounceMs?: number;

  /**
   * Initial width to use before first measurement.
   * @default 80
   */
  initialWidth?: number;

  /**
   * Initial height to use before first measurement.
   * @default 24
   */
  initialHeight?: number;
}

/**
 * Hook for subscribing to terminal resize events.
 *
 * Provides reactive terminal dimensions that update when the
 * terminal is resized. Includes computed values for narrow
 * width detection and responsive content width.
 *
 * @param options - Configuration options
 * @returns Terminal size state
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { width, height, isNarrow, maxContentWidth } = useTerminalDimensions();
 *
 *   return (
 *     <Box width={maxContentWidth}>
 *       {isNarrow ? <CompactView /> : <FullView />}
 *       <Text>Terminal: {width}x{height}</Text>
 *     </Box>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With custom debounce
 * const size = useTerminalDimensions({ debounceMs: 200 });
 * ```
 */
export function useTerminalDimensions(options: UseTerminalSizeOptions = {}): TerminalSize {
  const { debounceMs = 100, initialWidth = 80, initialHeight = 24 } = options;

  // Get initial dimensions
  const [dimensions, setDimensions] = useState(() => ({
    width: getTerminalWidth(initialWidth),
    height: getTerminalHeight(initialHeight),
  }));

  // Debounce timer ref
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handler for resize events
  const handleResize = useCallback(() => {
    const newWidth = getTerminalWidth(initialWidth);
    const newHeight = getTerminalHeight(initialHeight);

    setDimensions((prev) => {
      // Only update if dimensions actually changed
      if (prev.width === newWidth && prev.height === newHeight) {
        return prev;
      }
      return { width: newWidth, height: newHeight };
    });
  }, [initialWidth, initialHeight]);

  // Debounced resize handler
  const debouncedHandleResize = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (debounceMs === 0) {
      handleResize();
    } else {
      timerRef.current = setTimeout(handleResize, debounceMs);
    }
  }, [handleResize, debounceMs]);

  // Subscribe to resize events
  useEffect(() => {
    // Initial measurement
    handleResize();

    // Subscribe to SIGWINCH (terminal resize signal)
    process.stdout.on("resize", debouncedHandleResize);

    return () => {
      // Cleanup
      process.stdout.off("resize", debouncedHandleResize);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [handleResize, debouncedHandleResize]);

  // Compute derived values
  const result = useMemo<TerminalSize>(
    () => ({
      width: dimensions.width,
      height: dimensions.height,
      isNarrow: isNarrowWidth(dimensions.width),
      maxContentWidth: getMaxContentWidth(dimensions.width),
    }),
    [dimensions.width, dimensions.height]
  );

  return result;
}

/**
 * Lightweight hook that only tracks narrow width state.
 *
 * Use this when you only need to know if the terminal is narrow,
 * without the overhead of tracking full dimensions.
 *
 * @param debounceMs - Debounce delay for resize events
 * @returns Whether terminal is narrow
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const isNarrow = useIsNarrowWidth();
 *   return isNarrow ? <CompactView /> : <FullView />;
 * }
 * ```
 */
export function useIsNarrowWidth(debounceMs = 100): boolean {
  const [narrow, setNarrow] = useState(() => isNarrowWidth(getTerminalWidth(80)));

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleResize = () => {
      const newNarrow = isNarrowWidth(getTerminalWidth(80));
      setNarrow((prev) => (prev === newNarrow ? prev : newNarrow));
    };

    const debouncedHandleResize = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      if (debounceMs === 0) {
        handleResize();
      } else {
        timerRef.current = setTimeout(handleResize, debounceMs);
      }
    };

    // Initial check
    handleResize();

    process.stdout.on("resize", debouncedHandleResize);

    return () => {
      process.stdout.off("resize", debouncedHandleResize);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [debounceMs]);

  return narrow;
}
