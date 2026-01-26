/**
 * GitIndicator Component
 *
 * Displays the current git branch and dirty status.
 * Uses dim styling to avoid competing with main content.
 *
 * @module tui/components/StatusBar/GitIndicator
 */

import { getIcons } from "@vellum/shared";
import { Text } from "ink";
import type React from "react";
import { useMemo } from "react";
import { useGitStatus } from "../../hooks/useGitStatus.js";
import { useTheme } from "../../theme/index.js";
import { truncateToDisplayWidth } from "../../utils/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the GitIndicator component.
 */
export interface GitIndicatorProps {
  /** Maximum width for the branch name (truncates if exceeded) */
  readonly maxWidth?: number;
  /** Whether to show the dirty indicator (default: true) */
  readonly showDirty?: boolean;
  /** Whether to show the changed files count (default: false) */
  readonly showChangedCount?: boolean;
  /** Whether to show line statistics (+additions -deletions) (default: false) */
  readonly showLineStats?: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * GitIndicator displays the current git branch and status.
 *
 * Uses Nerd Font  icon or Unicode/ASCII fallback.
 * Shows dirty indicator when there are uncommitted changes.
 *
 * Returns null if not in a git repository.
 *
 * @example
 * ```tsx
 * <GitIndicator maxWidth={15} />
 * // Output:  main (clean)
 * // Output:  main * (dirty)
 * // Output:  feature/long… * (truncated + dirty)
 * // Output:  main * +10 -5 (with line stats)
 * ```
 */
export function GitIndicator({
  maxWidth = 15,
  showDirty = true,
  showChangedCount = false,
  showLineStats = false,
}: GitIndicatorProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const { branch, isDirty, changedFiles, additions, deletions, isLoading, isGitRepo } =
    useGitStatus();
  const icons = getIcons();

  const displayBranch = useMemo(() => {
    if (!branch) return null;
    // Truncate with ellipsis using string-width for CJK/Emoji handling
    return truncateToDisplayWidth(branch, maxWidth);
  }, [branch, maxWidth]);

  // Don't render if not in a git repo or still loading
  if (!isGitRepo || isLoading || !displayBranch) {
    return null;
  }

  // Build the dirty suffix
  const dirtySuffix = showDirty && isDirty ? ` ${icons.dirty}` : "";
  const countSuffix = showChangedCount && changedFiles > 0 ? ` (${changedFiles})` : "";

  // Show line stats if enabled and there are changes
  const hasLineStats = showLineStats && (additions > 0 || deletions > 0);

  return (
    <Text color={theme.semantic.text.muted}>
      {icons.branch} {displayBranch}
      {isDirty && (
        <Text color={theme.colors.warning}>
          {dirtySuffix}
          {countSuffix}
        </Text>
      )}
      {hasLineStats && (
        <>
          <Text> </Text>
          <Text color={theme.colors.success}>+{additions}</Text>
          <Text> </Text>
          <Text color={theme.colors.error}>-{deletions}</Text>
        </>
      )}
    </Text>
  );
}
