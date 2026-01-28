/**
 * usePauseShortcut Hook
 *
 * React hook for handling pause/resume keyboard shortcut.
 * Uses Space key to toggle pause when agent is running.
 *
 * @module tui/hooks/usePauseShortcut
 */

import { useInput } from "ink";
import { useCallback } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the usePauseShortcut hook.
 */
export interface UsePauseShortcutOptions {
  /** Whether the agent is currently running (shortcut only active when running) */
  readonly isRunning: boolean;
  /** Whether the agent is currently paused */
  readonly isPaused: boolean;
  /** Callback to toggle pause state */
  readonly onTogglePause: () => void;
  /** Whether the shortcut is enabled (default: true) */
  readonly enabled?: boolean;
}

/**
 * Return value of usePauseShortcut hook.
 */
export interface UsePauseShortcutReturn {
  /** The shortcut key combination */
  readonly shortcut: string;
  /** Whether the shortcut is currently active */
  readonly isActive: boolean;
  /** Current pause state (mirrors input for convenience) */
  readonly isPaused: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** The shortcut key for pause/resume */
export const PAUSE_SHORTCUT_KEY = "Space";

/** Display text for the shortcut */
export const PAUSE_SHORTCUT_DISPLAY = "Space";

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * usePauseShortcut - Hook for handling pause/resume keyboard shortcut.
 *
 * Provides Space key shortcut to toggle pause when agent is running.
 * The shortcut is only active when:
 * - enabled is true (default)
 * - isRunning is true (agent is processing)
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isLoading, isPaused, togglePause } = useAgentLoop(loop);
 *
 *   const { shortcut, isActive } = usePauseShortcut({
 *     isRunning: isLoading,
 *     isPaused,
 *     onTogglePause: togglePause,
 *   });
 *
 *   return (
 *     <Box>
 *       {isActive && (
 *         <Text>Press {shortcut} to {isPaused ? 'resume' : 'pause'}</Text>
 *       )}
 *     </Box>
 *   );
 * }
 * ```
 */
export function usePauseShortcut({
  isRunning,
  isPaused,
  onTogglePause,
  enabled = true,
}: UsePauseShortcutOptions): UsePauseShortcutReturn {
  // Shortcut is active when enabled and running
  const isActive = enabled && isRunning;

  // Handle Space key input
  useInput(
    useCallback(
      (input: string, key) => {
        // Space key is detected as a space character " "
        if (input === " " && !key.ctrl && !key.meta && !key.shift) {
          onTogglePause();
        }
      },
      [onTogglePause]
    ),
    { isActive }
  );

  return {
    shortcut: PAUSE_SHORTCUT_DISPLAY,
    isActive,
    isPaused,
  };
}

export default usePauseShortcut;
