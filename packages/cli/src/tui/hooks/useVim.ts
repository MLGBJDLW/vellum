/**
 * useVim Hook (T041)
 *
 * React hook for Vim editing mode in the TUI.
 * Provides modal editing with NORMAL, INSERT, VISUAL, and COMMAND modes.
 *
 * @module @vellum/cli
 */

import { useCallback, useState } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Vim editing modes.
 */
export type VimMode = "NORMAL" | "INSERT" | "VISUAL" | "COMMAND";

/**
 * Motion actions for cursor movement.
 */
export interface VimMotionAction {
  type: "motion";
  direction: "h" | "j" | "k" | "l" | "w" | "b" | "e" | "0" | "$";
}

/**
 * Mode change actions.
 */
export interface VimModeAction {
  type: "mode";
  target: VimMode;
}

/**
 * Edit actions (delete, yank, paste).
 */
export interface VimEditAction {
  type: "delete" | "yank" | "paste";
}

/**
 * Union of all Vim actions.
 */
export type VimAction = VimMotionAction | VimModeAction | VimEditAction;

/**
 * Key modifiers for Vim key handling.
 */
export interface KeyModifiers {
  ctrl?: boolean;
  shift?: boolean;
}

/**
 * Return value of useVim hook.
 */
export interface UseVimReturn {
  /** Whether Vim mode is enabled */
  enabled: boolean;
  /** Current Vim mode */
  mode: VimMode;
  /** Toggle Vim mode on/off */
  toggle: () => void;
  /** Set the current Vim mode */
  setMode: (mode: VimMode) => void;
  /** Handle a key press and return the resulting action */
  handleKey: (key: string, modifiers?: KeyModifiers) => VimAction | null;
}

// =============================================================================
// Key Mappings
// =============================================================================

/**
 * Motion keys in NORMAL and VISUAL modes.
 */
const MOTION_KEYS: Record<string, VimMotionAction["direction"]> = {
  h: "h", // left
  j: "j", // down
  k: "k", // up
  l: "l", // right
  w: "w", // word forward
  b: "b", // word backward
  e: "e", // word end
  "0": "0", // line start
  $: "$", // line end
};

/**
 * Keys that trigger mode transitions from NORMAL mode.
 */
const MODE_TRANSITION_KEYS: Record<string, VimMode> = {
  i: "INSERT", // insert before cursor
  a: "INSERT", // insert after cursor (append)
  I: "INSERT", // insert at line start
  A: "INSERT", // insert at line end
  o: "INSERT", // open line below
  O: "INSERT", // open line above
  v: "VISUAL", // visual mode
  V: "VISUAL", // visual line mode
  ":": "COMMAND", // command mode
};

/**
 * Edit action keys in NORMAL mode.
 */
const EDIT_KEYS: Record<string, VimEditAction["type"]> = {
  x: "delete", // delete character
  d: "delete", // delete (with motion)
  y: "yank", // yank (copy)
  p: "paste", // paste after
  P: "paste", // paste before
};

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * React hook for Vim editing mode.
 *
 * Provides modal editing with NORMAL, INSERT, VISUAL, and COMMAND modes.
 * Handles key presses and returns appropriate actions for the calling component
 * to execute.
 *
 * @returns UseVimReturn object with Vim state and control functions
 *
 * @example
 * ```tsx
 * function Editor() {
 *   const vim = useVim();
 *
 *   const handleKeyPress = (key: string) => {
 *     const action = vim.handleKey(key);
 *     if (action?.type === 'motion') {
 *       moveCursor(action.direction);
 *     }
 *   };
 *
 *   return (
 *     <Box>
 *       <Text>Mode: {vim.mode}</Text>
 *       <TextInput onKeyPress={handleKeyPress} />
 *     </Box>
 *   );
 * }
 * ```
 */
export function useVim(): UseVimReturn {
  const [enabled, setEnabled] = useState(false);
  const [mode, setModeState] = useState<VimMode>("NORMAL");

  /**
   * Toggle Vim mode on/off.
   * When disabled, switches to INSERT mode.
   * When enabled, switches to NORMAL mode.
   */
  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      // When enabling, start in NORMAL mode
      // When disabling, mode doesn't matter but reset to NORMAL
      setModeState("NORMAL");
      return next;
    });
  }, []);

  /**
   * Set the current Vim mode.
   */
  const setMode = useCallback((newMode: VimMode) => {
    setModeState(newMode);
  }, []);

  /**
   * Handle a key press in NORMAL mode.
   */
  const handleNormalKey = useCallback((key: string, modifiers?: KeyModifiers): VimAction | null => {
    // Check for Ctrl+c to exit to NORMAL (redundant but explicit)
    if (modifiers?.ctrl && key === "c") {
      return { type: "mode", target: "NORMAL" };
    }

    // In Vim mode we generally ignore Ctrl+<key> combos so global hotkeys can run.
    // (Explicit Ctrl combos like Ctrl+C / Ctrl+[ are handled above or in other modes.)
    if (modifiers?.ctrl) {
      return null;
    }

    // Motion keys
    if (key in MOTION_KEYS) {
      const direction = MOTION_KEYS[key] as VimMotionAction["direction"];
      return { type: "motion", direction };
    }

    // Mode transition keys
    if (key in MODE_TRANSITION_KEYS) {
      const target = MODE_TRANSITION_KEYS[key] as VimMode;
      setModeState(target);
      return { type: "mode", target };
    }

    // Edit keys
    if (key in EDIT_KEYS) {
      const editType = EDIT_KEYS[key] as VimEditAction["type"];
      return { type: editType };
    }

    return null;
  }, []);

  /**
   * Handle a key press in INSERT mode.
   */
  const handleInsertKey = useCallback((key: string, modifiers?: KeyModifiers): VimAction | null => {
    // Escape or Ctrl+c returns to NORMAL mode
    if (key === "escape" || (modifiers?.ctrl && key === "c")) {
      setModeState("NORMAL");
      return { type: "mode", target: "NORMAL" };
    }

    // Ctrl+[ is equivalent to Escape
    if (modifiers?.ctrl && key === "[") {
      setModeState("NORMAL");
      return { type: "mode", target: "NORMAL" };
    }

    // All other keys pass through in INSERT mode
    return null;
  }, []);

  /**
   * Handle a key press in VISUAL mode.
   */
  const handleVisualKey = useCallback((key: string, modifiers?: KeyModifiers): VimAction | null => {
    // Escape or Ctrl+c returns to NORMAL mode
    if (key === "escape" || (modifiers?.ctrl && key === "c")) {
      setModeState("NORMAL");
      return { type: "mode", target: "NORMAL" };
    }

    // Ctrl+[ is equivalent to Escape
    if (modifiers?.ctrl && key === "[") {
      setModeState("NORMAL");
      return { type: "mode", target: "NORMAL" };
    }

    // Ignore other Ctrl+<key> combos so global hotkeys can run.
    if (modifiers?.ctrl) {
      return null;
    }

    // Motion keys work in VISUAL mode
    if (key in MOTION_KEYS) {
      const direction = MOTION_KEYS[key] as VimMotionAction["direction"];
      return { type: "motion", direction };
    }

    // v toggles back to NORMAL
    if (key === "v") {
      setModeState("NORMAL");
      return { type: "mode", target: "NORMAL" };
    }

    // y yanks selection and returns to NORMAL
    if (key === "y") {
      setModeState("NORMAL");
      return { type: "yank" };
    }

    // d deletes selection and returns to NORMAL
    if (key === "d" || key === "x") {
      setModeState("NORMAL");
      return { type: "delete" };
    }

    return null;
  }, []);

  /**
   * Handle a key press in COMMAND mode.
   */
  const handleCommandKey = useCallback(
    (key: string, modifiers?: KeyModifiers): VimAction | null => {
      // Escape or Ctrl+c returns to NORMAL mode
      if (key === "escape" || (modifiers?.ctrl && key === "c")) {
        setModeState("NORMAL");
        return { type: "mode", target: "NORMAL" };
      }

      // Command mode passes through keys for command input
      return null;
    },
    []
  );

  /**
   * Handle a key press and return the resulting action.
   * Returns null if the key should be passed through to the input.
   */
  const handleKey = useCallback(
    (key: string, modifiers?: KeyModifiers): VimAction | null => {
      // If Vim mode is disabled, pass through all keys
      if (!enabled) {
        return null;
      }

      switch (mode) {
        case "NORMAL":
          return handleNormalKey(key, modifiers);
        case "INSERT":
          return handleInsertKey(key, modifiers);
        case "VISUAL":
          return handleVisualKey(key, modifiers);
        case "COMMAND":
          return handleCommandKey(key, modifiers);
        default:
          return null;
      }
    },
    [enabled, mode, handleNormalKey, handleInsertKey, handleVisualKey, handleCommandKey]
  );

  return {
    enabled,
    mode,
    toggle,
    setMode,
    handleKey,
  };
}
