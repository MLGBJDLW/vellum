/**
 * useModeShortcuts Hook (T046)
 *
 * React hook for handling keyboard shortcuts to switch coding modes.
 * Provides Ctrl+1/2/3 shortcuts for quick mode switching.
 *
 * @module tui/hooks/useModeShortcuts
 */

import type { CodingMode, ModeManager } from "@vellum/core";
import { CODING_MODES } from "@vellum/core";
import { useInput } from "ink";
import { useCallback, useRef } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the useModeShortcuts hook.
 */
export interface UseModeShortcutsOptions {
  /** The ModeManager instance to use for switching */
  readonly modeManager: ModeManager | null;
  /** Whether shortcuts are enabled (default: true) */
  readonly enabled?: boolean;
  /** Callback when a mode switch is attempted */
  readonly onModeSwitch?: (mode: CodingMode, success: boolean) => void;
  /** Callback when a mode switch fails */
  readonly onError?: (mode: CodingMode, error: string) => void;
}

/**
 * Return value of useModeShortcuts hook.
 */
export interface UseModeShortcutsReturn {
  /** Get the shortcut key for a mode */
  readonly getShortcut: (mode: CodingMode) => string;
  /** Manually trigger a mode switch */
  readonly switchMode: (mode: CodingMode) => Promise<boolean>;
  /** Whether shortcuts are currently active */
  readonly isActive: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Keyboard shortcut mapping for modes.
 * Ctrl+1 = vibe, Ctrl+2 = plan, Ctrl+3 = spec
 */
const MODE_SHORTCUTS: Record<string, CodingMode> = {
  "1": "vibe",
  "2": "plan",
  "3": "spec",
} as const;

/**
 * Reverse mapping: mode to shortcut key.
 */
const SHORTCUT_FOR_MODE: Record<CodingMode, string> = {
  vibe: "Ctrl+1",
  plan: "Ctrl+2",
  spec: "Ctrl+3",
} as const;

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * useModeShortcuts - Hook for handling mode switching keyboard shortcuts.
 *
 * Provides Ctrl+1/2/3 shortcuts for quick mode switching:
 * - Ctrl+1: Switch to vibe mode (fast autonomous)
 * - Ctrl+2: Switch to plan mode (plan-then-execute)
 * - Ctrl+3: Switch to spec mode (6-phase workflow)
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { modeManager } = useApp();
 *
 *   const { getShortcut, isActive } = useModeShortcuts({
 *     modeManager,
 *     onModeSwitch: (mode, success) => {
 *       console.log(`Switched to ${mode}: ${success}`);
 *     },
 *   });
 *
 *   return (
 *     <Text>
 *       Press {getShortcut('vibe')} for vibe mode
 *     </Text>
 *   );
 * }
 * ```
 */
export function useModeShortcuts({
  modeManager,
  enabled = true,
  onModeSwitch,
  onError,
}: UseModeShortcutsOptions): UseModeShortcutsReturn {
  // Track whether we're currently processing a switch
  const isSwitchingRef = useRef(false);

  // Check if shortcuts are active
  const isActive = enabled && modeManager !== null;

  /**
   * Attempt to switch to a mode.
   */
  const switchMode = useCallback(
    async (mode: CodingMode): Promise<boolean> => {
      if (!modeManager) {
        onError?.(mode, "Mode manager not initialized");
        return false;
      }

      // Prevent concurrent switches
      if (isSwitchingRef.current) {
        return false;
      }

      // Check if already in target mode
      if (modeManager.getCurrentMode() === mode) {
        return true;
      }

      isSwitchingRef.current = true;

      try {
        const result = await modeManager.switchMode(mode);

        if (result.success) {
          onModeSwitch?.(mode, true);
          return true;
        }

        onError?.(mode, result.reason ?? "Unknown error");
        onModeSwitch?.(mode, false);
        return false;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        onError?.(mode, errorMessage);
        onModeSwitch?.(mode, false);
        return false;
      } finally {
        isSwitchingRef.current = false;
      }
    },
    [modeManager, onModeSwitch, onError]
  );

  /**
   * Handle keyboard input for mode shortcuts.
   */
  useInput(
    useCallback(
      (input: string, key) => {
        // Only handle Ctrl+number combinations
        if (!key.ctrl) return;

        // Check if input matches a mode shortcut
        const targetMode = MODE_SHORTCUTS[input];
        if (targetMode && CODING_MODES.includes(targetMode)) {
          // Fire and forget - don't await in input handler
          void switchMode(targetMode);
        }
      },
      [switchMode]
    ),
    { isActive }
  );

  /**
   * Get the shortcut key combination for a mode.
   */
  const getShortcut = useCallback((mode: CodingMode): string => {
    return SHORTCUT_FOR_MODE[mode];
  }, []);

  return {
    getShortcut,
    switchMode,
    isActive,
  };
}

// =============================================================================
// Exports
// =============================================================================

export type { CodingMode };
