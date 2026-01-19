/**
 * useAlternateBuffer Hook (T043)
 *
 * React hook for terminal alternate screen buffer management.
 * Provides functionality similar to how vim and other full-screen terminal
 * applications switch between the main and alternate screen buffers.
 *
 * The alternate screen buffer allows the TUI to render without affecting
 * the user's existing terminal scrollback history, and cleanly restores
 * the original buffer when the application exits.
 *
 * @module @vellum/cli
 */

import { useCallback, useEffect, useRef, useState } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the useAlternateBuffer hook.
 */
export interface UseAlternateBufferOptions {
  /** Whether alternate buffer mode is enabled (default: true) */
  readonly enabled?: boolean;
  /** Whether to constrain the render height (default: false) */
  readonly constrainHeight?: boolean;
  /** Maximum height when constrainHeight is true (default: terminal rows) */
  readonly maxHeight?: number;
  /** Enable viewport calculation for availableHeight (default: false) */
  readonly withViewport?: boolean;
  /** Lines reserved for input area (default: 3) */
  readonly inputReserve?: number;
  /** Lines reserved for status bar (default: 1) */
  readonly statusReserve?: number;
  /** Debounce delay for resize events in ms (default: 100) */
  readonly resizeDebounce?: number;
}

/**
 * Return value of useAlternateBuffer hook.
 */
export interface UseAlternateBufferReturn {
  /** Whether currently in alternate buffer mode */
  readonly isAlternate: boolean;
  /** Enable alternate buffer mode */
  readonly enable: () => void;
  /** Disable alternate buffer mode and restore original buffer */
  readonly disable: () => void;
  /** Toggle between main and alternate buffer */
  readonly toggle: () => void;
  /** Current effective height (constrained or terminal height) */
  readonly height: number;
  /** Current terminal width */
  readonly width: number;
  /** Available height for content (height - inputReserve - statusReserve) */
  readonly availableHeight: number;
  /** Whether resize is currently being debounced */
  readonly isResizing: boolean;
}

// =============================================================================
// ANSI Escape Sequences
// =============================================================================

/**
 * ANSI escape sequence to switch to alternate screen buffer.
 * This is the standard DEC private mode 1049.
 */
const ENTER_ALTERNATE_BUFFER = "\x1b[?1049h";

/**
 * ANSI escape sequence to switch back to main screen buffer.
 * This restores the cursor position and screen contents.
 */
const EXIT_ALTERNATE_BUFFER = "\x1b[?1049l";

/**
 * ANSI escape sequence to clear the screen.
 */
const CLEAR_SCREEN = "\x1b[2J";

/**
 * ANSI escape sequence to move cursor to home position (top-left).
 */
const CURSOR_HOME = "\x1b[H";

/**
 * ANSI escape sequence to disable line wrapping.
 * Prevents cursor flickering in VS Code terminal.
 */
const DISABLE_LINE_WRAPPING = "\x1b[?7l";

/**
 * ANSI escape sequence to enable line wrapping.
 * Restores normal terminal behavior on exit.
 */
const ENABLE_LINE_WRAPPING = "\x1b[?7h";

// =============================================================================
// Input Reserve Calculation
// =============================================================================

/**
 * Calculate the lines to reserve for input area based on mode.
 * Use this to get correct inputReserve value for useAlternateBuffer.
 *
 * @param multiline - Whether the input is multiline
 * @param minHeight - Minimum height for multiline input (default: 5)
 * @returns Number of lines to reserve for input
 */
export function calculateInputReserve(multiline: boolean, minHeight = 5): number {
  const border = 2; // Top and bottom border
  if (multiline) {
    return minHeight + border; // 5 + 2 = 7 for default multiline
  }
  return 3; // Single line with border
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the current terminal height.
 * Falls back to a reasonable default if unavailable.
 */
function getTerminalHeight(): number {
  return process.stdout.rows || 24;
}

/**
 * Get the current terminal width.
 * Falls back to a reasonable default if unavailable.
 */
function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

/**
 * Write raw data to stdout.
 * Handles potential write errors gracefully.
 */
function writeToStdout(data: string): void {
  try {
    process.stdout.write(data);
  } catch {
    // Silently ignore write errors (e.g., if stdout is closed)
  }
}

/**
 * Enter the alternate screen buffer.
 */
function enterAlternateBuffer(): void {
  // No-op: Ink manages alternate buffer switching at render entry.
  // Keeping this hook side-effect free avoids double buffer switching/clearing.
  void ENTER_ALTERNATE_BUFFER;
  void DISABLE_LINE_WRAPPING;
  void CLEAR_SCREEN;
  void CURSOR_HOME;
}

/**
 * Exit the alternate screen buffer.
 */
function exitAlternateBuffer(): void {
  // No-op: Ink manages alternate buffer switching at render entry.
  void ENABLE_LINE_WRAPPING;
  void EXIT_ALTERNATE_BUFFER;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for managing terminal alternate screen buffer.
 *
 * The alternate screen buffer is a separate buffer that full-screen terminal
 * applications (like vim, less, htop) use to render their UI without affecting
 * the user's existing terminal scrollback history.
 *
 * When enabled, this hook:
 * 1. Switches to the alternate screen buffer
 * 2. Clears the screen and positions the cursor at the top
 * 3. Provides height constraints for TUI rendering
 * 4. Automatically restores the original buffer on unmount
 *
 * @param options - Configuration options
 * @returns Object containing buffer state and control functions
 *
 * @example
 * ```tsx
 * function App() {
 *   const { isAlternate, height, enable, disable } = useAlternateBuffer({
 *     enabled: true,
 *     constrainHeight: true,
 *     maxHeight: 40
 *   });
 *
 *   return (
 *     <Box height={height}>
 *       <Text>TUI Content (height: {height})</Text>
 *     </Box>
 *   );
 * }
 * ```
 */
export function useAlternateBuffer(
  options: UseAlternateBufferOptions = {}
): UseAlternateBufferReturn {
  const {
    enabled = true,
    constrainHeight = false,
    maxHeight,
    withViewport = false,
    inputReserve = 7, // Default for multiline (minHeight 5 + border 2)
    statusReserve = 1,
    resizeDebounce = 100,
  } = options;

  // Track whether we're currently in alternate buffer mode
  const [isAlternate, setIsAlternate] = useState(false);

  // Track terminal dimensions
  const [terminalHeight, setTerminalHeight] = useState(getTerminalHeight);
  const [terminalWidth, setTerminalWidth] = useState(getTerminalWidth);

  // Track resize debounce state
  const [isResizing, setIsResizing] = useState(false);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref to track if we've already cleaned up (prevent double cleanup)
  const cleanedUpRef = useRef(false);

  // Ref to track current alternate state (for cleanup)
  const isAlternateRef = useRef(false);

  /**
   * Enable alternate buffer mode.
   */
  const enable = useCallback(() => {
    if (!isAlternateRef.current) {
      enterAlternateBuffer();
      isAlternateRef.current = true;
      setIsAlternate(true);
    }
  }, []);

  /**
   * Disable alternate buffer mode and restore original buffer.
   */
  const disable = useCallback(() => {
    if (isAlternateRef.current) {
      exitAlternateBuffer();
      isAlternateRef.current = false;
      setIsAlternate(false);
    }
  }, []);

  /**
   * Toggle between main and alternate buffer.
   */
  const toggle = useCallback(() => {
    if (isAlternateRef.current) {
      disable();
    } else {
      enable();
    }
  }, [enable, disable]);

  /**
   * Calculate the effective height based on constraints.
   */
  const height = constrainHeight
    ? Math.min(terminalHeight, maxHeight ?? terminalHeight)
    : terminalHeight;

  /**
   * Calculate available height for content (when withViewport is enabled).
   * Ensure minimum of 8 lines to prevent degenerate rendering cases.
   */
  const MIN_AVAILABLE_HEIGHT = 8;
  const availableHeight = withViewport
    ? Math.max(MIN_AVAILABLE_HEIGHT, height - inputReserve - statusReserve)
    : height;

  // Handle terminal resize events with debounce
  useEffect(() => {
    const handleResize = (): void => {
      if (resizeDebounce > 0) {
        setIsResizing(true);
        if (resizeTimerRef.current) {
          clearTimeout(resizeTimerRef.current);
        }
        resizeTimerRef.current = setTimeout(() => {
          setTerminalHeight(getTerminalHeight());
          setTerminalWidth(getTerminalWidth());
          setIsResizing(false);
        }, resizeDebounce);
      } else {
        setTerminalHeight(getTerminalHeight());
        setTerminalWidth(getTerminalWidth());
      }
    };

    process.stdout.on("resize", handleResize);

    return () => {
      process.stdout.off("resize", handleResize);
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
    };
  }, [resizeDebounce]);

  // Auto-enable alternate buffer when hook mounts (if enabled option is true)
  useEffect(() => {
    if (enabled && !cleanedUpRef.current) {
      enable();
    }

    // Cleanup on unmount
    return () => {
      if (!cleanedUpRef.current) {
        cleanedUpRef.current = true;
        if (isAlternateRef.current) {
          exitAlternateBuffer();
          isAlternateRef.current = false;
        }
      }
    };
  }, [enabled, enable]);

  // Handle process exit signals to ensure buffer is restored
  useEffect(() => {
    const handleExit = (): void => {
      if (!cleanedUpRef.current && isAlternateRef.current) {
        cleanedUpRef.current = true;
        exitAlternateBuffer();
      }
    };

    // Handle various exit signals
    process.on("exit", handleExit);
    process.on("SIGINT", handleExit);
    process.on("SIGTERM", handleExit);
    process.on("SIGHUP", handleExit);

    return () => {
      process.off("exit", handleExit);
      process.off("SIGINT", handleExit);
      process.off("SIGTERM", handleExit);
      process.off("SIGHUP", handleExit);
    };
  }, []);

  return {
    isAlternate,
    enable,
    disable,
    toggle,
    height,
    width: terminalWidth,
    availableHeight,
    isResizing,
  };
}

// =============================================================================
// Utility Exports
// =============================================================================

/**
 * Raw ANSI sequences for direct use if needed.
 */
export const ANSI = {
  ENTER_ALTERNATE_BUFFER,
  EXIT_ALTERNATE_BUFFER,
  CLEAR_SCREEN,
  CURSOR_HOME,
} as const;

/**
 * Utility functions for manual buffer management.
 */
export const bufferUtils = {
  getTerminalHeight,
  getTerminalWidth,
  enterAlternateBuffer,
  exitAlternateBuffer,
  writeToStdout,
} as const;
