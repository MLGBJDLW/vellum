/**
 * DynamicShortcutHints Component
 *
 * Displays context-aware keyboard shortcuts based on current UI state.
 * Shows different hints for:
 * - Input mode (typing)
 * - Agent running (processing)
 * - Idle state
 * - Autocomplete active
 *
 * @module tui/components/common/DynamicShortcutHints
 */

import { Box, Text } from "ink";
import type React from "react";
import { memo, useMemo } from "react";
import { useTheme } from "../../theme/index.js";
import { type HotkeyHint, HotkeyHints } from "./HotkeyHints.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Current UI state for determining which shortcuts to show.
 */
export type UIState =
  | "idle" // Waiting for input
  | "input" // User is typing
  | "running" // Agent is processing
  | "autocomplete" // Autocomplete menu is open
  | "confirmation" // Waiting for user confirmation
  | "multiline"; // Multiline input mode

/**
 * Props for DynamicShortcutHints component.
 */
export interface DynamicShortcutHintsProps {
  /** Current UI state */
  readonly state: UIState;
  /** Whether sidebar is visible */
  readonly sidebarVisible?: boolean;
  /** Whether vim mode is active */
  readonly vimMode?: boolean;
  /** Additional custom hints to append */
  readonly customHints?: readonly HotkeyHint[];
  /** Whether to show compact version (fewer hints) */
  readonly compact?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Shortcut hints for different UI states.
 */
const STATE_HINTS: Record<UIState, readonly HotkeyHint[]> = {
  idle: [
    { keys: "Enter", label: "Send" },
    { keys: "↑/↓", label: "History" },
    { keys: "/", label: "Commands" },
    { keys: "@", label: "Mention" },
    { keys: "!", label: "Shell" },
  ],
  input: [
    { keys: "Enter", label: "Send" },
    { keys: "Ctrl+C", label: "Clear" },
    { keys: "Tab", label: "Complete" },
    { keys: "↑/↓", label: "History" },
  ],
  running: [
    { keys: "Esc", label: "Stop" },
    { keys: "PgUp/Dn", label: "Scroll" },
    { keys: "Ctrl+C", label: "Cancel" },
  ],
  autocomplete: [
    { keys: "↑/↓", label: "Navigate" },
    { keys: "Tab/Enter", label: "Select" },
    { keys: "Esc", label: "Close" },
  ],
  confirmation: [
    { keys: "y/Enter", label: "Confirm" },
    { keys: "n/Esc", label: "Cancel" },
    { keys: "a", label: "Always" },
  ],
  multiline: [
    { keys: "Ctrl+Enter", label: "Send" },
    { keys: "Enter", label: "Newline" },
    { keys: "Esc", label: "Exit" },
  ],
};

/**
 * Compact hints (fewer items for narrow terminals).
 */
const COMPACT_HINTS: Record<UIState, readonly HotkeyHint[]> = {
  idle: [
    { keys: "Enter", label: "Send" },
    { keys: "/", label: "Cmds" },
    { keys: "!", label: "Shell" },
  ],
  input: [
    { keys: "Enter", label: "Send" },
    { keys: "Tab", label: "Complete" },
  ],
  running: [
    { keys: "Esc", label: "Stop" },
    { keys: "Ctrl+C", label: "Cancel" },
  ],
  autocomplete: [
    { keys: "↑/↓", label: "Nav" },
    { keys: "Enter", label: "Select" },
  ],
  confirmation: [
    { keys: "y", label: "Yes" },
    { keys: "n", label: "No" },
  ],
  multiline: [
    { keys: "Ctrl+Enter", label: "Send" },
    { keys: "Esc", label: "Exit" },
  ],
};

// =============================================================================
// Component
// =============================================================================

/**
 * Get hints for the current state.
 */
function getHintsForState(
  state: UIState,
  compact: boolean,
  sidebarVisible: boolean,
  vimMode: boolean,
  customHints?: readonly HotkeyHint[]
): HotkeyHint[] {
  const baseHints = compact ? COMPACT_HINTS[state] : STATE_HINTS[state];
  const hints: HotkeyHint[] = [...baseHints];

  // Add sidebar toggle hint if not in compact mode
  if (!compact && state !== "running" && state !== "autocomplete") {
    hints.push({ keys: "Alt+K", label: sidebarVisible ? "Hide sidebar" : "Show sidebar" });
  }

  // Add vim mode indicator if active
  if (vimMode && !compact) {
    hints.push({ keys: "Esc", label: "Vim normal" });
  }

  // Append custom hints
  if (customHints) {
    hints.push(...customHints);
  }

  return hints;
}

/**
 * DynamicShortcutHints displays context-aware keyboard shortcuts.
 *
 * @example
 * ```tsx
 * <DynamicShortcutHints
 *   state={isRunning ? "running" : hasInput ? "input" : "idle"}
 *   sidebarVisible={showSidebar}
 * />
 * ```
 */
function DynamicShortcutHintsImpl({
  state,
  sidebarVisible = false,
  vimMode = false,
  customHints,
  compact = false,
}: DynamicShortcutHintsProps): React.JSX.Element {
  const { theme } = useTheme();

  const hints = useMemo(
    () => getHintsForState(state, compact, sidebarVisible, vimMode, customHints),
    [state, compact, sidebarVisible, vimMode, customHints]
  );

  return (
    <Box flexDirection="row" alignItems="center">
      <Text color={theme.semantic.text.muted} dimColor>
        <HotkeyHints hints={hints} />
      </Text>
    </Box>
  );
}

/**
 * Compare props for memo optimization.
 */
function arePropsEqual(prev: DynamicShortcutHintsProps, next: DynamicShortcutHintsProps): boolean {
  return (
    prev.state === next.state &&
    prev.sidebarVisible === next.sidebarVisible &&
    prev.vimMode === next.vimMode &&
    prev.compact === next.compact &&
    prev.customHints === next.customHints
  );
}

export const DynamicShortcutHints = memo(DynamicShortcutHintsImpl, arePropsEqual);

export default DynamicShortcutHints;
