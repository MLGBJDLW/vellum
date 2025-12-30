/**
 * useHotkeys Hook (T042)
 *
 * React hook for managing keyboard shortcuts in the TUI.
 * Provides a unified system for hotkey registration with support for
 * modifier keys (Ctrl, Shift, Alt) and scoped handlers.
 *
 * @module @vellum/cli
 */

import type { Key } from "ink";
import { useInput } from "ink";
import { useCallback, useMemo } from "react";
import { useApp } from "../context/AppContext.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Scope for hotkey activation.
 * - global: Active regardless of focused area
 * - input: Active only when input area is focused
 * - messages: Active only when message area is focused
 */
export type HotkeyScope = "global" | "input" | "messages" | "tools";

/**
 * Definition for a single hotkey binding.
 */
export interface HotkeyDefinition {
  /** The key to match (e.g., 'c', 'l', 'v', 'f1') */
  readonly key: string;
  /** Whether Ctrl modifier is required */
  readonly ctrl?: boolean;
  /** Whether Shift modifier is required */
  readonly shift?: boolean;
  /** Whether Alt/Option modifier is required */
  readonly alt?: boolean;
  /** Handler function to execute when hotkey is triggered */
  readonly handler: () => void;
  /** Human-readable description for help display */
  readonly description?: string;
  /** Scope where the hotkey is active (default: 'global') */
  readonly scope?: HotkeyScope;
}

/**
 * Options for the useHotkeys hook.
 */
export interface UseHotkeysOptions {
  /** Whether hotkey handling is enabled (default: true) */
  readonly enabled?: boolean;
  /** Override scope for all hotkeys in this hook */
  readonly scope?: HotkeyScope;
}

/**
 * Return value of useHotkeys hook.
 */
export interface UseHotkeysReturn {
  /** Get all registered hotkey definitions */
  readonly hotkeys: ReadonlyArray<HotkeyDefinition>;
  /** Check if a key combination matches any hotkey */
  readonly matchHotkey: (
    key: string,
    modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean }
  ) => HotkeyDefinition | null;
}

// =============================================================================
// Key Normalization
// =============================================================================

/**
 * Normalize a key string to a consistent format.
 * Handles special keys and case normalization.
 */
function normalizeKey(key: string): string {
  // Handle special keys
  const specialKeys: Record<string, string> = {
    escape: "escape",
    esc: "escape",
    return: "return",
    enter: "return",
    tab: "tab",
    backspace: "backspace",
    delete: "delete",
    up: "up",
    down: "down",
    left: "left",
    right: "right",
    pageup: "pageup",
    pagedown: "pagedown",
    home: "home",
    end: "end",
    f1: "f1",
    f2: "f2",
    f3: "f3",
    f4: "f4",
    f5: "f5",
    f6: "f6",
    f7: "f7",
    f8: "f8",
    f9: "f9",
    f10: "f10",
    f11: "f11",
    f12: "f12",
  };

  const normalized = key.toLowerCase();
  return specialKeys[normalized] ?? normalized;
}

/**
 * Get the ink key flag for a special key.
 */
function getInkKeyFlag(inkKey: Key, normalizedHotkey: string): boolean | undefined {
  const inkKeyMap: Record<string, boolean | undefined> = {
    return: inkKey.return,
    escape: inkKey.escape,
    tab: inkKey.tab,
    backspace: inkKey.backspace,
    delete: inkKey.delete,
    up: inkKey.upArrow,
    down: inkKey.downArrow,
    left: inkKey.leftArrow,
    right: inkKey.rightArrow,
    pageup: inkKey.pageUp,
    pagedown: inkKey.pageDown,
  };
  return inkKeyMap[normalizedHotkey];
}

/**
 * Check if the key component matches (ignoring modifiers).
 */
function keyMatches(normalizedInput: string, normalizedHotkey: string, inkKey: Key): boolean {
  // Direct string match
  if (normalizedInput === normalizedHotkey) {
    return true;
  }

  // Check for special key flags from Ink
  const inkFlag = getInkKeyFlag(inkKey, normalizedHotkey);
  return inkFlag === true;
}

/**
 * Check if modifiers match exactly.
 */
function modifiersMatch(inkKey: Key, hotkey: HotkeyDefinition): boolean {
  const ctrlRequired = hotkey.ctrl ?? false;
  const shiftRequired = hotkey.shift ?? false;
  const altRequired = hotkey.alt ?? false;

  const ctrlPressed = inkKey.ctrl ?? false;
  const shiftPressed = inkKey.shift ?? false;
  const altPressed = inkKey.meta ?? false; // Ink uses 'meta' for Alt

  return (
    ctrlRequired === ctrlPressed && shiftRequired === shiftPressed && altRequired === altPressed
  );
}

/**
 * Check if a key event matches a hotkey definition.
 */
function matchesHotkey(inputKey: string, inkKey: Key, hotkey: HotkeyDefinition): boolean {
  const normalizedInput = normalizeKey(inputKey);
  const normalizedHotkey = normalizeKey(hotkey.key);

  // Check key matches first
  if (!keyMatches(normalizedInput, normalizedHotkey, inkKey)) {
    return false;
  }

  // Then check modifiers
  return modifiersMatch(inkKey, hotkey);
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * useHotkeys hook for managing keyboard shortcuts.
 *
 * Provides a declarative way to register hotkeys with support for:
 * - Modifier keys (Ctrl, Shift, Alt)
 * - Scoped handlers (global, input, messages)
 * - Help text generation
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { dispatch } = useApp();
 *
 *   useHotkeys([
 *     {
 *       key: 'c',
 *       ctrl: true,
 *       handler: () => process.exit(0),
 *       description: 'Exit application',
 *       scope: 'global',
 *     },
 *     {
 *       key: 'v',
 *       ctrl: true,
 *       handler: () => dispatch({ type: 'TOGGLE_VIM_MODE' }),
 *       description: 'Toggle Vim mode',
 *       scope: 'input',
 *     },
 *   ]);
 *
 *   return <Box>...</Box>;
 * }
 * ```
 *
 * @param hotkeys - Array of hotkey definitions to register
 * @param options - Configuration options
 * @returns Object with hotkey utilities
 */
export function useHotkeys(
  hotkeys: ReadonlyArray<HotkeyDefinition>,
  options: UseHotkeysOptions = {}
): UseHotkeysReturn {
  const { enabled = true, scope: optionsScope } = options;
  const { state } = useApp();

  // Memoize the hotkey list with scope overrides applied
  const resolvedHotkeys = useMemo(
    () =>
      hotkeys.map((hotkey) => ({
        ...hotkey,
        scope: optionsScope ?? hotkey.scope ?? "global",
      })),
    [hotkeys, optionsScope]
  );

  // Match a key combination against registered hotkeys
  const matchHotkey = useCallback(
    (
      key: string,
      modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean }
    ): HotkeyDefinition | null => {
      const inkKey: Key = {
        ctrl: modifiers.ctrl ?? false,
        shift: modifiers.shift ?? false,
        meta: modifiers.alt ?? false,
        escape: key.toLowerCase() === "escape",
        return: key === "\r" || key.toLowerCase() === "return",
        tab: key === "\t" || key.toLowerCase() === "tab",
        backspace: key === "\x7f" || key.toLowerCase() === "backspace",
        delete: key.toLowerCase() === "delete",
        upArrow: key.toLowerCase() === "up",
        downArrow: key.toLowerCase() === "down",
        leftArrow: key.toLowerCase() === "left",
        rightArrow: key.toLowerCase() === "right",
        pageUp: key.toLowerCase() === "pageup",
        pageDown: key.toLowerCase() === "pagedown",
      };

      for (const hotkey of resolvedHotkeys) {
        if (matchesHotkey(key, inkKey, hotkey)) {
          return hotkey;
        }
      }

      return null;
    },
    [resolvedHotkeys]
  );

  // Check if a hotkey should be active based on current scope
  const isScopeActive = useCallback(
    (hotkeyScope: HotkeyScope): boolean => {
      if (hotkeyScope === "global") {
        return true;
      }
      // Map focusedArea to hotkey scope
      const focusedArea = state.focusedArea;
      if (hotkeyScope === "input" && focusedArea === "input") {
        return true;
      }
      if (hotkeyScope === "messages" && focusedArea === "messages") {
        return true;
      }
      if (hotkeyScope === "tools" && focusedArea === "tools") {
        return true;
      }
      return false;
    },
    [state.focusedArea]
  );

  // Handle keyboard input via Ink's useInput
  useInput(
    (input, key) => {
      if (!enabled) return;

      // Find matching hotkey
      for (const hotkey of resolvedHotkeys) {
        if (matchesHotkey(input, key, hotkey)) {
          // Check scope
          if (isScopeActive(hotkey.scope as HotkeyScope)) {
            hotkey.handler();
            return;
          }
        }
      }
    },
    { isActive: enabled }
  );

  return {
    hotkeys: resolvedHotkeys,
    matchHotkey,
  };
}

// =============================================================================
// Standard Hotkey Presets
// =============================================================================

/**
 * Standard hotkey definitions for common TUI operations.
 * Use these as a starting point and customize as needed.
 *
 * @example
 * ```tsx
 * import { useHotkeys, createStandardHotkeys } from './useHotkeys.js';
 *
 * function App() {
 *   const { dispatch } = useApp();
 *
 *   useHotkeys(createStandardHotkeys({
 *     onInterrupt: () => process.exit(0),
 *     onClearScreen: () => console.clear(),
 *     onToggleVim: () => dispatch({ type: 'TOGGLE_VIM_MODE' }),
 *     onShowHelp: () => setShowHelp(true),
 *   }));
 *
 *   return <Box>...</Box>;
 * }
 * ```
 */
export interface StandardHotkeyHandlers {
  /** Ctrl+C: Interrupt/cancel current operation */
  readonly onInterrupt?: () => void;
  /** Ctrl+L: Clear the screen */
  readonly onClearScreen?: () => void;
  /** Ctrl+V: Toggle Vim editing mode */
  readonly onToggleVim?: () => void;
  /** Ctrl+Y: Accept suggestion */
  readonly onAcceptSuggestion?: () => void;
  /** Ctrl+T: Toggle thinking display */
  readonly onToggleThinking?: () => void;
  /** F1: Show help */
  readonly onShowHelp?: () => void;
  /** Ctrl+Shift+1: Switch to trust mode 1 (paranoid) */
  readonly onTrustMode1?: () => void;
  /** Ctrl+Shift+2: Switch to trust mode 2 (cautious) */
  readonly onTrustMode2?: () => void;
  /** Ctrl+Shift+3: Switch to trust mode 3 (balanced) */
  readonly onTrustMode3?: () => void;
  /** Ctrl+Shift+4: Switch to trust mode 4 (trusting) */
  readonly onTrustMode4?: () => void;
  /** Ctrl+Shift+5: Switch to trust mode 5 (yolo) */
  readonly onTrustMode5?: () => void;
}

/**
 * Create standard hotkey definitions with provided handlers.
 *
 * @param handlers - Object with handler functions for standard hotkeys
 * @returns Array of hotkey definitions
 */
export function createStandardHotkeys(
  handlers: StandardHotkeyHandlers
): ReadonlyArray<HotkeyDefinition> {
  const hotkeys: HotkeyDefinition[] = [];

  if (handlers.onInterrupt) {
    hotkeys.push({
      key: "c",
      ctrl: true,
      handler: handlers.onInterrupt,
      description: "Interrupt/cancel",
      scope: "global",
    });
  }

  if (handlers.onClearScreen) {
    hotkeys.push({
      key: "l",
      ctrl: true,
      handler: handlers.onClearScreen,
      description: "Clear screen",
      scope: "global",
    });
  }

  if (handlers.onToggleVim) {
    hotkeys.push({
      key: "v",
      ctrl: true,
      handler: handlers.onToggleVim,
      description: "Toggle Vim mode",
      scope: "input",
    });
  }

  if (handlers.onAcceptSuggestion) {
    hotkeys.push({
      key: "y",
      ctrl: true,
      handler: handlers.onAcceptSuggestion,
      description: "Accept suggestion",
      scope: "input",
    });
  }

  if (handlers.onToggleThinking) {
    hotkeys.push({
      key: "t",
      ctrl: true,
      handler: handlers.onToggleThinking,
      description: "Toggle thinking display",
      scope: "global",
    });
  }

  if (handlers.onShowHelp) {
    hotkeys.push({
      key: "f1",
      handler: handlers.onShowHelp,
      description: "Show help",
      scope: "global",
    });
  }

  // Trust mode hotkeys (Ctrl+Shift+1-5)
  if (handlers.onTrustMode1) {
    hotkeys.push({
      key: "!",
      ctrl: true,
      shift: true,
      handler: handlers.onTrustMode1,
      description: "Paranoid mode",
      scope: "global",
    });
  }

  if (handlers.onTrustMode2) {
    hotkeys.push({
      key: "@",
      ctrl: true,
      shift: true,
      handler: handlers.onTrustMode2,
      description: "Cautious mode",
      scope: "global",
    });
  }

  if (handlers.onTrustMode3) {
    hotkeys.push({
      key: "#",
      ctrl: true,
      shift: true,
      handler: handlers.onTrustMode3,
      description: "Balanced mode",
      scope: "global",
    });
  }

  if (handlers.onTrustMode4) {
    hotkeys.push({
      key: "$",
      ctrl: true,
      shift: true,
      handler: handlers.onTrustMode4,
      description: "Trusting mode",
      scope: "global",
    });
  }

  if (handlers.onTrustMode5) {
    hotkeys.push({
      key: "%",
      ctrl: true,
      shift: true,
      handler: handlers.onTrustMode5,
      description: "YOLO mode",
      scope: "global",
    });
  }

  return hotkeys;
}

/**
 * Format hotkey for display in help text.
 *
 * @param hotkey - Hotkey definition to format
 * @returns Formatted string like "Ctrl+Shift+V"
 */
export function formatHotkey(hotkey: HotkeyDefinition): string {
  const parts: string[] = [];

  if (hotkey.ctrl) parts.push("Ctrl");
  if (hotkey.shift) parts.push("Shift");
  if (hotkey.alt) parts.push("Alt");

  // Format the key
  const key = hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key;
  parts.push(key);

  return parts.join("+");
}

/**
 * Generate help text from hotkey definitions.
 *
 * @param hotkeys - Array of hotkey definitions
 * @returns Formatted help text string
 */
export function generateHotkeyHelp(hotkeys: ReadonlyArray<HotkeyDefinition>): string {
  const lines: string[] = ["Keyboard Shortcuts:", ""];

  // Group by scope
  const byScope = new Map<HotkeyScope, HotkeyDefinition[]>();

  for (const hotkey of hotkeys) {
    const scope = (hotkey.scope ?? "global") as HotkeyScope;
    if (!byScope.has(scope)) {
      byScope.set(scope, []);
    }
    const scopeArray = byScope.get(scope);
    if (scopeArray) {
      scopeArray.push(hotkey);
    }
  }

  // Format each scope
  const scopeLabels: Record<HotkeyScope, string> = {
    global: "Global",
    input: "Input Area",
    messages: "Messages Area",
    tools: "Tools Area",
  };

  for (const [scope, scopeHotkeys] of byScope) {
    lines.push(`  ${scopeLabels[scope]}:`);

    for (const hotkey of scopeHotkeys) {
      const formatted = formatHotkey(hotkey);
      const description = hotkey.description ?? "No description";
      lines.push(`    ${formatted.padEnd(20)} ${description}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}
