/**
 * FileChangesIndicator Component
 *
 * Displays file change statistics (+additions -deletions) in the header bar.
 * Uses success color for additions and error color for deletions.
 *
 * @module tui/components/StatusBar/FileChangesIndicator
 */

import { Box, Text } from "ink";
import type React from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the FileChangesIndicator component.
 */
export interface FileChangesIndicatorProps {
  /** Number of lines added */
  readonly additions: number;
  /** Number of lines deleted */
  readonly deletions: number;
}

// =============================================================================
// Component
// =============================================================================

/**
 * FileChangesIndicator displays cumulative file change statistics.
 *
 * Format: +{additions} -{deletions}
 * Returns null if no changes (additions and deletions both 0).
 *
 * @example
 * ```tsx
 * <FileChangesIndicator additions={42} deletions={15} />
 * // Output: +42 -15
 * ```
 */
export function FileChangesIndicator({
  additions,
  deletions,
}: FileChangesIndicatorProps): React.JSX.Element | null {
  const { theme } = useTheme();

  // Don't show if no changes
  if (additions === 0 && deletions === 0) {
    return null;
  }

  return (
    <Box>
      <Text color={theme.colors.success}>+{additions}</Text>
      <Text> </Text>
      <Text color={theme.colors.error}>-{deletions}</Text>
    </Box>
  );
}
