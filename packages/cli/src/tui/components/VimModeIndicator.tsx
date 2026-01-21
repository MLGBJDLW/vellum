/**
 * VimModeIndicator Component (T041)
 *
 * TUI component for displaying the current Vim editing mode.
 * Shows mode name with visual styling (e.g., "-- NORMAL --").
 *
 * @module tui/components/VimModeIndicator
 */

import { Box, Text } from "ink";
import type React from "react";
import type { VimMode } from "../hooks/useVim.js";
import { useTheme } from "../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the VimModeIndicator component.
 */
export interface VimModeIndicatorProps {
  /** Whether vim mode is enabled */
  readonly enabled: boolean;
  /** Current Vim mode */
  readonly mode: VimMode;
  /** Whether to show in compact mode (mode name only, no dashes) */
  readonly compact?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Mode colors mapped to theme semantic colors.
 * - NORMAL: blue (info) - command mode
 * - INSERT: green (success) - editing
 * - VISUAL: yellow (warning) - selection
 * - COMMAND: purple (primary) - command line
 */
const MODE_COLOR_KEYS: Record<VimMode, "info" | "success" | "warning" | "primary"> = {
  NORMAL: "info",
  INSERT: "success",
  VISUAL: "warning",
  COMMAND: "primary",
} as const;

// =============================================================================
// VimModeIndicator Component
// =============================================================================

/**
 * VimModeIndicator - Displays the current Vim editing mode.
 *
 * Features:
 * - Traditional Vim-style mode display (-- MODE --)
 * - Color-coded by mode type
 * - Compact mode option for space-constrained layouts
 * - Only renders when vim mode is enabled
 *
 * @example
 * ```tsx
 * // Basic usage
 * <VimModeIndicator enabled={true} mode="NORMAL" />
 *
 * // Compact mode
 * <VimModeIndicator enabled={true} mode="INSERT" compact />
 * ```
 */
export function VimModeIndicator({
  enabled,
  mode,
  compact = false,
}: VimModeIndicatorProps): React.ReactElement | null {
  const { theme } = useTheme();

  // Don't render if vim mode is disabled
  if (!enabled) {
    return null;
  }

  // Get color from theme
  const colorKey = MODE_COLOR_KEYS[mode];
  const color = theme.colors[colorKey];

  // Compact mode: mode name only
  if (compact) {
    return (
      <Box>
        <Text color={color} bold>
          {mode}
        </Text>
      </Box>
    );
  }

  // Full mode: traditional Vim-style (-- MODE --)
  return (
    <Box>
      <Text color={color} bold>
        -- {mode} --
      </Text>
    </Box>
  );
}

// =============================================================================
// Exports
// =============================================================================

export type { VimMode };
