/**
 * WorkspaceIndicator Component
 *
 * Displays the current workspace directory name with a folder icon.
 * Uses gradient styling for visual emphasis while maintaining readability.
 *
 * @module tui/components/StatusBar/WorkspaceIndicator
 */

import { getIcons } from "@vellum/shared";
import { Text } from "ink";
import type React from "react";
import { useMemo } from "react";
import { useWorkspace } from "../../hooks/useWorkspace.js";
import { useTheme } from "../../theme/index.js";
import { truncateToDisplayWidth } from "../../utils/index.js";
import { GradientText } from "../common/GradientText.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the WorkspaceIndicator component.
 */
export interface WorkspaceIndicatorProps {
  /** Maximum width for the workspace name (truncates if exceeded) */
  readonly maxWidth?: number;
  /** Whether to use gradient styling (default: true) */
  readonly useGradient?: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * WorkspaceIndicator displays the current workspace directory.
 *
 * Uses Nerd Font  icon or Unicode/ASCII fallback.
 * Applies gradient styling for visual emphasis (configurable).
 * Truncates long names with ellipsis if maxWidth is specified.
 *
 * @example
 * ```tsx
 * <WorkspaceIndicator maxWidth={20} />
 * // Output:  vellum (with gradient)
 *
 * <WorkspaceIndicator useGradient={false} />
 * // Output:  vellum (muted)
 * ```
 */
export function WorkspaceIndicator({
  maxWidth = 20,
  useGradient = true,
}: WorkspaceIndicatorProps): React.JSX.Element {
  const { theme } = useTheme();
  const { name } = useWorkspace();
  const icons = getIcons();

  const displayName = useMemo(() => {
    // Truncate with ellipsis using string-width for CJK/Emoji handling
    return truncateToDisplayWidth(name, maxWidth);
  }, [name, maxWidth]);

  // Workspace gradient: subtle gold tones
  const workspaceGradient = useMemo(
    () => [theme.brand.primary, theme.brand.secondary, theme.brand.mid] as const,
    [theme.brand]
  );

  if (useGradient) {
    return (
      <Text>
        <Text color={theme.brand.primary}>{icons.folder} </Text>
        <GradientText text={displayName} colors={workspaceGradient} bold />
      </Text>
    );
  }

  return (
    <Text color={theme.semantic.text.muted}>
      {icons.folder} {displayName}
    </Text>
  );
}
