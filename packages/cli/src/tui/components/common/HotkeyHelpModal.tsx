/**
 * HotkeyHelpModal Component (Chain 24)
 *
 * Modal overlay displaying available keyboard shortcuts.
 * Helps users discover and learn hotkey bindings.
 *
 * @module tui/components/common/HotkeyHelpModal
 */

import { Box, Text, useInput } from "ink";
import type React from "react";
import { useMemo } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * A single hotkey binding definition.
 */
export interface HotkeyBinding {
  /** Key combination (e.g., "Ctrl+C", "?", "Esc") */
  readonly key: string;
  /** Description of what the hotkey does */
  readonly description: string;
  /** Optional scope/category (e.g., "Global", "Editor", "Navigation") */
  readonly scope?: string;
}

/**
 * Props for the HotkeyHelpModal component.
 */
export interface HotkeyHelpModalProps {
  /** Whether the modal is visible */
  readonly isVisible: boolean;
  /** Callback when the modal should close */
  readonly onClose: () => void;
  /** List of hotkey bindings to display */
  readonly hotkeys: readonly HotkeyBinding[];
  /** Title for the modal (default: "Keyboard Shortcuts") */
  readonly title?: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Default hotkeys commonly available in the TUI */
export const DEFAULT_HOTKEYS: HotkeyBinding[] = [
  { key: "?", description: "Show this help", scope: "Global" },
  { key: "Ctrl+C", description: "Exit application", scope: "Global" },
  { key: "Ctrl+L", description: "Clear screen", scope: "Global" },
  { key: "Esc", description: "Cancel / Close modal", scope: "Global" },
  { key: "↑/↓", description: "Navigate history / options", scope: "Navigation" },
  { key: "Tab", description: "Autocomplete / Next field", scope: "Input" },
  { key: "Enter", description: "Submit / Confirm", scope: "Input" },
  { key: "Ctrl+U", description: "Clear input line", scope: "Input" },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Group hotkeys by their scope.
 */
function groupHotkeysByScope(hotkeys: readonly HotkeyBinding[]): Map<string, HotkeyBinding[]> {
  const grouped = new Map<string, HotkeyBinding[]>();

  for (const hotkey of hotkeys) {
    const scope = hotkey.scope ?? "General";
    const existing = grouped.get(scope) ?? [];
    grouped.set(scope, [...existing, hotkey]);
  }

  return grouped;
}

/**
 * Calculate the maximum key width for alignment.
 */
function getMaxKeyWidth(hotkeys: readonly HotkeyBinding[]): number {
  return Math.max(...hotkeys.map((h) => h.key.length), 8);
}

// =============================================================================
// HotkeyHelpModal Component
// =============================================================================

/**
 * HotkeyHelpModal - Modal overlay for keyboard shortcut help.
 *
 * Features:
 * - Groups hotkeys by scope/category
 * - Aligned key-description columns
 * - Dismissible with Esc or ?
 * - Themeable styling
 *
 * @example
 * ```tsx
 * const [showHelp, setShowHelp] = useState(false);
 *
 * <HotkeyHelpModal
 *   isVisible={showHelp}
 *   onClose={() => setShowHelp(false)}
 *   hotkeys={[
 *     { key: "Ctrl+S", description: "Save file", scope: "Editor" },
 *     { key: "Ctrl+Z", description: "Undo", scope: "Editor" },
 *   ]}
 * />
 * ```
 */
export function HotkeyHelpModal({
  isVisible,
  onClose,
  hotkeys,
  title = "Keyboard Shortcuts",
}: HotkeyHelpModalProps): React.JSX.Element | null {
  const { theme } = useTheme();

  // Handle keyboard input for closing
  useInput(
    (input, key) => {
      if (key.escape || input === "?" || input === "q") {
        onClose();
      }
    },
    { isActive: isVisible }
  );

  // Group hotkeys by scope
  const groupedHotkeys = useMemo(() => groupHotkeysByScope(hotkeys), [hotkeys]);
  const maxKeyWidth = useMemo(() => getMaxKeyWidth(hotkeys), [hotkeys]);

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.colors.primary}
      paddingX={2}
      paddingY={1}
    >
      {/* Title */}
      <Box marginBottom={1}>
        <Text color={theme.colors.primary} bold>
          ⌨️ {title}
        </Text>
      </Box>

      {/* Hotkey groups */}
      {Array.from(groupedHotkeys.entries()).map(([scope, scopeHotkeys]) => (
        <Box key={scope} flexDirection="column" marginBottom={1}>
          {/* Scope header */}
          <Box marginBottom={0}>
            <Text color={theme.semantic.text.muted} underline>
              {scope}
            </Text>
          </Box>

          {/* Hotkeys in this scope */}
          {scopeHotkeys.map((hotkey) => (
            <Box key={hotkey.key}>
              <Box width={maxKeyWidth + 2}>
                <Text color={theme.colors.info} bold>
                  {hotkey.key.padEnd(maxKeyWidth)}
                </Text>
              </Box>
              <Text color={theme.semantic.text.secondary}>{hotkey.description}</Text>
            </Box>
          ))}
        </Box>
      ))}

      {/* Close hint */}
      <Box marginTop={1}>
        <Text dimColor>Press Esc, ? or q to close</Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Exports
// =============================================================================

export default HotkeyHelpModal;
