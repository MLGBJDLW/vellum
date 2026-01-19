/**
 * Keyboard Scroll Hook
 *
 * Handles keyboard events for scrolling in the TUI.
 * Integrates with useScrollController to provide intuitive keyboard navigation.
 *
 * Supported keys:
 * - PageUp / Ctrl+U: Scroll up half viewport
 * - PageDown / Ctrl+D: Scroll down half viewport
 * - Home / Ctrl+Home: Jump to top
 * - End / Ctrl+End: Jump to bottom (follow mode)
 * - ↑ / k: Scroll up one line
 * - ↓ / j: Scroll down one line
 *
 * @module tui/hooks/useKeyboardScroll
 */

import type { Key } from "ink";
import { useInput } from "ink";
import { useMemo } from "react";
import { isEndKey, isHomeKey } from "../types/ink-extended.js";
import type { ViewportScrollActions, ViewportScrollState } from "./useScrollController.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for useKeyboardScroll hook
 */
export interface UseKeyboardScrollOptions {
  /** Current scroll state from useScrollController */
  readonly state: ViewportScrollState;
  /** Scroll actions from useScrollController */
  readonly actions: ViewportScrollActions;
  /** Whether keyboard handling is enabled (default: true) */
  readonly enabled?: boolean;
  /** Enable vim-style keys (j/k for up/down) (default: true) */
  readonly vimKeys?: boolean;
  /** Custom lines per single step (default: 1) */
  readonly stepLines?: number;
  /** Custom lines per half-page (default: viewportHeight / 2) */
  readonly halfPageLines?: number;
}

/**
 * Return value of useKeyboardScroll hook
 */
export interface UseKeyboardScrollReturn {
  /** Manual key handler for custom input handling */
  readonly handleKey: (input: string, key: Key) => boolean;
  /** Shortcut definitions for help display */
  readonly shortcuts: ReadonlyArray<KeyboardScrollShortcut>;
}

/**
 * Shortcut definition for display
 */
export interface KeyboardScrollShortcut {
  /** Key combination (e.g., "PageUp", "Ctrl+U") */
  readonly key: string;
  /** Description of the action */
  readonly description: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Standard shortcuts for help display
 */
const SCROLL_SHORTCUTS: ReadonlyArray<KeyboardScrollShortcut> = [
  { key: "↑/k", description: "Scroll up one line" },
  { key: "↓/j", description: "Scroll down one line" },
  { key: "PageUp/Ctrl+U", description: "Scroll up half page" },
  { key: "PageDown/Ctrl+D", description: "Scroll down half page" },
  { key: "Home", description: "Jump to top" },
  { key: "End", description: "Jump to bottom (follow mode)" },
];

// =============================================================================
// Hook
// =============================================================================

/**
 * useKeyboardScroll - Handles keyboard events for scrolling
 *
 * Automatically registers keyboard handlers with useInput when enabled.
 * Also provides a manual handleKey function for custom input handling.
 *
 * @example
 * ```tsx
 * const [scrollState, scrollActions] = useScrollController({ viewportHeight: 20 });
 *
 * // Automatic keyboard handling
 * useKeyboardScroll({
 *   state: scrollState,
 *   actions: scrollActions,
 *   enabled: isFocused,
 * });
 *
 * // Or manual handling in existing useInput
 * const { handleKey } = useKeyboardScroll({
 *   state: scrollState,
 *   actions: scrollActions,
 *   enabled: false, // Don't auto-register
 * });
 *
 * useInput((input, key) => {
 *   if (handleKey(input, key)) return; // Handled by scroll
 *   // ... other handlers
 * });
 * ```
 *
 * @param options - Configuration options
 * @returns Scroll handling utilities
 */
export function useKeyboardScroll(options: UseKeyboardScrollOptions): UseKeyboardScrollReturn {
  const { state, actions, enabled = true, vimKeys = true, stepLines = 1, halfPageLines } = options;

  // Calculate half-page lines (default to half viewport)
  const computedHalfPage = halfPageLines ?? Math.max(1, Math.floor(state.viewportHeight / 2));

  // Maximum offset for jump to top
  const maxOffset = Math.max(0, state.totalHeight - state.viewportHeight);

  /**
   * Handle a keyboard input, returning true if handled
   */
  const handleKey = useMemo(() => {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keyboard handler needs many key combinations
    return (input: string, key: Key): boolean => {
      // Arrow up or vim 'k'
      if (key.upArrow || (vimKeys && input === "k")) {
        actions.scrollUp(stepLines);
        return true;
      }

      // Arrow down or vim 'j'
      if (key.downArrow || (vimKeys && input === "j")) {
        actions.scrollDown(stepLines);
        return true;
      }

      // PageUp (Ink provides this as key.pageUp in some versions)
      // Also handle Ctrl+U
      if (key.pageUp || (key.ctrl && input === "u")) {
        actions.scrollUp(computedHalfPage);
        return true;
      }

      // PageDown
      // Also handle Ctrl+D
      if (key.pageDown || (key.ctrl && input === "d")) {
        actions.scrollDown(computedHalfPage);
        return true;
      }

      // Home - jump to top
      if (isHomeKey(input)) {
        actions.jumpTo(maxOffset);
        return true;
      }

      // End - jump to bottom (follow mode)
      if (isEndKey(input)) {
        actions.scrollToBottom();
        return true;
      }

      return false;
    };
  }, [actions, vimKeys, stepLines, computedHalfPage, maxOffset]);

  // Auto-register with useInput when enabled
  useInput(
    (input, key) => {
      handleKey(input, key);
    },
    { isActive: enabled }
  );

  return {
    handleKey,
    shortcuts: SCROLL_SHORTCUTS,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format shortcuts for display in help
 */
export function formatScrollShortcuts(): string {
  return SCROLL_SHORTCUTS.map((s) => `${s.key}: ${s.description}`).join("\n");
}

/**
 * Get shortcuts without vim keys
 */
export function getScrollShortcutsNoVim(): ReadonlyArray<KeyboardScrollShortcut> {
  return SCROLL_SHORTCUTS.map((shortcut) => ({
    ...shortcut,
    key: shortcut.key.replace("/k", "").replace("/j", ""),
  }));
}
