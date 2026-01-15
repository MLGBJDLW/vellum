/**
 * WorkspaceIndicator Component
 *
 * Displays the current workspace directory name with a folder icon.
 * Uses dim styling to avoid competing with main content.
 *
 * @module tui/components/StatusBar/WorkspaceIndicator
 */

import { getIcons } from "@vellum/shared";
import { Text } from "ink";
import type React from "react";
import { useMemo } from "react";
import { useWorkspace } from "../../hooks/useWorkspace.js";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the WorkspaceIndicator component.
 */
export interface WorkspaceIndicatorProps {
  /** Maximum width for the workspace name (truncates if exceeded) */
  readonly maxWidth?: number;
}

// =============================================================================
// Component
// =============================================================================

/**
 * WorkspaceIndicator displays the current workspace directory.
 *
 * Uses Nerd Font  icon or Unicode/ASCII fallback.
 * Truncates long names with ellipsis if maxWidth is specified.
 *
 * @example
 * ```tsx
 * <WorkspaceIndicator maxWidth={20} />
 * // Output:  vellum
 * ```
 */
export function WorkspaceIndicator({ maxWidth = 20 }: WorkspaceIndicatorProps): React.JSX.Element {
  const { theme } = useTheme();
  const { name } = useWorkspace();
  const icons = getIcons();

  const displayName = useMemo(() => {
    if (name.length <= maxWidth) {
      return name;
    }
    // Truncate with ellipsis
    return `${name.slice(0, maxWidth - 1)}…`;
  }, [name, maxWidth]);

  return (
    <Text color={theme.semantic.text.muted}>
      {icons.folder} {displayName}
    </Text>
  );
}
