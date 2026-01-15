/**
 * HeaderBar Component
 *
 * Embedded header bar showing workspace and git status indicators.
 * Designed to be placed at the top of the AppHeader without adding extra lines.
 *
 * Features:
 * - Workspace directory name with folder icon
 * - Git branch with dirty indicator
 * - Responsive: adapts to terminal width
 * - Dim styling to not compete with main content
 *
 * @module tui/components/StatusBar/HeaderBar
 */

import { Box, Text } from "ink";
import type React from "react";
import { useTheme } from "../../theme/index.js";
import { useTerminalSize } from "../Layout.js";
import { GitIndicator } from "./GitIndicator.js";
import { WorkspaceIndicator } from "./WorkspaceIndicator.js";

// =============================================================================
// Constants
// =============================================================================

/** Separator between header bar items */
const SEPARATOR = " │ ";

/** Minimum terminal width to show git indicator */
const MIN_WIDTH_FOR_GIT = 60;

/** Minimum terminal width to show both indicators with full width */
const COMPACT_THRESHOLD = 80;

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the HeaderBar component.
 */
export interface HeaderBarProps {
  /** Optional session snapshot count to display */
  readonly snapshotCount?: number;
  /** Whether sandbox boundaries are active */
  readonly sandboxActive?: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * HeaderBar displays workspace and git status in a compact horizontal bar.
 *
 * Layout:
 * - Wide (≥80 cols):  vellum │  main *
 * - Medium (60-79):   vellum │  main
 * - Narrow (<60):     vellum (no git)
 *
 * Uses dim colors to stay unobtrusive while providing useful context.
 *
 * @example
 * ```tsx
 * <HeaderBar />
 * // Output:  vellum │  main *
 * ```
 */
export function HeaderBar({ snapshotCount, sandboxActive }: HeaderBarProps): React.JSX.Element {
  const { theme } = useTheme();
  const { columns } = useTerminalSize();

  // Responsive width calculations
  const isCompact = columns < COMPACT_THRESHOLD;
  const showGit = columns >= MIN_WIDTH_FOR_GIT;

  // Calculate max widths based on available space
  const workspaceMaxWidth = isCompact ? 15 : 20;
  const gitMaxWidth = isCompact ? 10 : 15;

  return (
    <Box flexDirection="row" justifyContent="flex-start">
      {/* Workspace indicator */}
      <WorkspaceIndicator maxWidth={workspaceMaxWidth} />

      {/* Git indicator (if visible and space allows) */}
      {showGit && (
        <>
          <Text color={theme.semantic.text.muted}>{SEPARATOR}</Text>
          <GitIndicator maxWidth={gitMaxWidth} showDirty showChangedCount={!isCompact} />
        </>
      )}

      {/* Optional snapshot count */}
      {snapshotCount !== undefined && snapshotCount > 0 && (
        <>
          <Text color={theme.semantic.text.muted}>{SEPARATOR}</Text>
          <Text color={theme.semantic.text.muted}>◉ {snapshotCount}</Text>
        </>
      )}

      {/* Optional sandbox indicator */}
      {sandboxActive && (
        <>
          <Text color={theme.semantic.text.muted}>{SEPARATOR}</Text>
          <Text color={theme.colors.warning}>⊘ sandbox</Text>
        </>
      )}
    </Box>
  );
}
