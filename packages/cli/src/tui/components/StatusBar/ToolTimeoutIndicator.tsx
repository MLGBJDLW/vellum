/**
 * Tool Timeout Warning Indicator Component
 *
 * Displays tool timeout warnings in the TUI status bar.
 *
 * @module tui/components/StatusBar/ToolTimeoutIndicator
 */

import { Box, Text } from "ink";
import type React from "react";

import {
  type ToolTimeoutWarningStatus,
  useToolTimeoutOptional,
} from "../../context/ToolTimeoutContext.js";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for ToolTimeoutIndicator
 */
export interface ToolTimeoutIndicatorProps {
  /** Override status (for testing/storybook) */
  readonly status?: ToolTimeoutWarningStatus;
  /** Show compact version */
  readonly compact?: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Tool timeout indicator showing warning when tools approach timeout.
 *
 * @example
 * ```tsx
 * // In StatusBar
 * <ToolTimeoutIndicator />
 *
 * // Compact version
 * <ToolTimeoutIndicator compact />
 * ```
 */
export function ToolTimeoutIndicator({
  status: overrideStatus,
  compact = false,
}: ToolTimeoutIndicatorProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const context = useToolTimeoutOptional();

  // Use override status or context status
  const status = overrideStatus ?? context?.status;

  // Don't render if no status or not active
  if (!status || !status.active) {
    return null;
  }

  // Warning icon and color
  const icon = "⚠️";
  const color = theme.colors.warning;

  if (compact) {
    // Compact: just icon and remaining time
    const timeText = status.remainingSeconds ? `${status.remainingSeconds}s` : "";
    return (
      <Box>
        <Text color={color}>
          {icon} {timeText}
        </Text>
      </Box>
    );
  }

  // Full: icon, tool name, and remaining time
  const toolName = status.toolName ?? "工具";
  const remainingSeconds = status.remainingSeconds ?? 0;
  const message = `工具 [${toolName}] 即将超时 (剩余 ${remainingSeconds}s)`;

  return (
    <Box>
      <Text color={color}>
        {icon} {message}
      </Text>
    </Box>
  );
}

/**
 * Tool timeout status bar segment for integration into StatusBar.
 *
 * Returns null if no active timeout warning, making it safe to
 * include in layouts unconditionally.
 */
export function ToolTimeoutStatusSegment(): React.JSX.Element | null {
  const context = useToolTimeoutOptional();

  // Don't render anything if context not available or feedback disabled
  if (!context || !context.feedbackEnabled) {
    return null;
  }

  // Don't render if no active warning
  if (!context.status.active) {
    return null;
  }

  return <ToolTimeoutIndicator />;
}
