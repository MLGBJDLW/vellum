/**
 * ProtectedFileLegend Component
 *
 * Legend indicator for protected files in directory listings.
 * Shows [#] = Protected file explanation when protected files are present.
 *
 * @module tui/components/common/ProtectedFileLegend
 */

import { Box, Text } from "ink";
import type React from "react";
import { memo } from "react";

// =============================================================================
// Constants
// =============================================================================

/** Protected file indicator matching core/permission/protected-files.ts */
export const PROTECTED_INDICATOR = "[#]" as const;

// =============================================================================
// Types
// =============================================================================

/**
 * Props for ProtectedFileLegend component.
 */
export interface ProtectedFileLegendProps {
  /** Whether to show the legend (typically when hasProtectedFiles is true) */
  readonly show?: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Legend explaining the protected file indicator.
 *
 * Displays a dim, single-line hint at the bottom of file listings
 * when protected files are present.
 *
 * @example
 * ```tsx
 * <ProtectedFileLegend show={hasProtectedFiles} />
 * // Renders: [#] = Protected file (always requires approval)
 * ```
 */
function ProtectedFileLegendImpl({ show = false }: ProtectedFileLegendProps): React.JSX.Element {
  if (!show) {
    return <Box />;
  }

  return (
    <Box marginTop={1}>
      <Text dimColor>
        <Text bold>{PROTECTED_INDICATOR}</Text>
        <Text> = Protected file (always requires approval)</Text>
      </Text>
    </Box>
  );
}

/**
 * Memoized ProtectedFileLegend component.
 * Only re-renders when show prop changes.
 */
export const ProtectedFileLegend = memo(ProtectedFileLegendImpl);

// =============================================================================
// Formatting Utilities
// =============================================================================

/**
 * Format a file entry name with protection indicator.
 *
 * @param name - File name
 * @param isProtected - Whether the file is protected
 * @returns Formatted name with [#] prefix if protected
 *
 * @example
 * ```typescript
 * formatProtectedFileName('.env', true);   // '[#] .env'
 * formatProtectedFileName('app.ts', false); // 'app.ts'
 * ```
 */
export function formatProtectedFileName(name: string, isProtected?: boolean): string {
  return isProtected ? `${PROTECTED_INDICATOR} ${name}` : name;
}
