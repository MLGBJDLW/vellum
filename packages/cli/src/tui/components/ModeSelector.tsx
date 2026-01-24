/**
 * ModeSelector Component (T045)
 *
 * TUI component for selecting coding modes with keyboard navigation.
 * Renders three selectable options (vibe, plan, spec) with visual feedback.
 *
 * @module tui/components/ModeSelector
 */

import type { CodingMode } from "@vellum/core";
import { BUILTIN_CODING_MODES, CODING_MODES } from "@vellum/core";
import { getIcons } from "@vellum/shared";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useCallback, useState } from "react";
import { useTUITranslation } from "../i18n/index.js";
import { useTheme } from "../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ModeSelector component.
 */
export interface ModeSelectorProps {
  /** The currently active mode */
  readonly currentMode: CodingMode;
  /** Callback when a mode is selected */
  readonly onSelect: (mode: CodingMode) => void;
  /** Whether the selector is focused/active */
  readonly isActive?: boolean;
  /** Whether to show mode descriptions */
  readonly showDescriptions?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Get mode icons for visual identification.
 * Uses centralized icon system with auto-detection.
 */
function getModeIcons(): Record<CodingMode, string> {
  const icons = getIcons();
  return {
    vibe: icons.vibe,
    plan: icons.plan,
    spec: icons.spec,
  };
}

/**
 * Keyboard shortcuts for quick mode selection.
 */
const MODE_SHORTCUTS: Record<CodingMode, string> = {
  vibe: "1",
  plan: "2",
  spec: "3",
} as const;

/**
 * Mode colors mapped to theme semantic colors.
 */
const MODE_COLOR_KEYS: Record<CodingMode, "success" | "info" | "primary"> = {
  vibe: "success",
  plan: "info",
  spec: "primary",
} as const;

// =============================================================================
// ModeSelector Component
// =============================================================================

/**
 * ModeSelector - Interactive component for selecting coding modes.
 *
 * Features:
 * - Arrow key navigation (up/down or j/k)
 * - Number shortcuts (1, 2, 3)
 * - Enter to confirm selection
 * - Visual indication of current mode
 * - Highlight of focused option
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const [mode, setMode] = useState<CodingMode>('vibe');
 *
 *   return (
 *     <ModeSelector
 *       currentMode={mode}
 *       onSelect={setMode}
 *       isActive
 *     />
 *   );
 * }
 * ```
 */
export function ModeSelector({
  currentMode,
  onSelect,
  isActive = true,
  showDescriptions = true,
}: ModeSelectorProps): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTUITranslation();
  const modes = CODING_MODES;

  // Track focused index for keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState(() => modes.indexOf(currentMode));

  // Handle keyboard input
  useInput(
    useCallback(
      (input: string, key) => {
        if (!isActive) return;

        // Arrow navigation
        if (key.upArrow || input === "k") {
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : modes.length - 1));
          return;
        }

        if (key.downArrow || input === "j") {
          setFocusedIndex((prev) => (prev < modes.length - 1 ? prev + 1 : 0));
          return;
        }

        // Confirm selection
        if (key.return) {
          const selectedMode = modes[focusedIndex];
          if (selectedMode) {
            onSelect(selectedMode);
          }
          return;
        }

        // Number shortcuts
        const modeIndex = parseInt(input, 10) - 1;
        if (modeIndex >= 0 && modeIndex < modes.length) {
          const selectedMode = modes[modeIndex];
          if (selectedMode) {
            setFocusedIndex(modeIndex);
            onSelect(selectedMode);
          }
        }
      },
      [isActive, focusedIndex, onSelect]
    ),
    { isActive }
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>{t("modeSelector.title")}</Text>
      </Box>

      {modes.map((mode, index) => {
        const isFocused = index === focusedIndex && isActive;
        const isCurrent = mode === currentMode;
        const modeIcons = getModeIcons();
        const icon = modeIcons[mode];
        const shortcut = MODE_SHORTCUTS[mode];
        const colorKey = MODE_COLOR_KEYS[mode];
        const color = theme.colors[colorKey];
        const config = BUILTIN_CODING_MODES[mode];

        return (
          <Box key={mode} flexDirection="column">
            <Box>
              {/* Focus indicator */}
              <Text color={isFocused ? color : undefined}>{isFocused ? "❯ " : "  "}</Text>

              {/* Shortcut key */}
              <Text dimColor>[{shortcut}]</Text>
              <Text> </Text>

              {/* Mode icon and name */}
              <Text color={color} bold={isCurrent}>
                {icon} {mode}
              </Text>

              {/* Current indicator */}
              {isCurrent && (
                <Text color={theme.semantic.text.muted}> {t("modeSelector.current")}</Text>
              )}
            </Box>

            {/* Description (when enabled) */}
            {showDescriptions && (
              <Box marginLeft={6}>
                <Text dimColor wrap="truncate-end">
                  {config.description}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}

      {/* Help text */}
      <Box marginTop={1}>
        <Text dimColor>{t("modeSelector.keybindings")}</Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Exports
// =============================================================================

export type { CodingMode };
