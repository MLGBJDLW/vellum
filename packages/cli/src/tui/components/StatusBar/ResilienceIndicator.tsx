/**
 * Resilience Indicator Component
 *
 * Displays rate limiting and retry status in the TUI.
 *
 * @module tui/components/StatusBar/ResilienceIndicator
 */

import { Box, Text } from "ink";
import type React from "react";

import { type ResilienceStatus, useResilienceOptional } from "../../context/ResilienceContext.js";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for ResilienceIndicator
 */
export interface ResilienceIndicatorProps {
  /** Override status (for testing/storybook) */
  readonly status?: ResilienceStatus;
  /** Show compact version */
  readonly compact?: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Resilience indicator showing rate limit and retry status.
 *
 * @example
 * ```tsx
 * // In StatusBar
 * <ResilienceIndicator />
 *
 * // Compact version
 * <ResilienceIndicator compact />
 * ```
 */
export function ResilienceIndicator({
  status: overrideStatus,
  compact = false,
}: ResilienceIndicatorProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const context = useResilienceOptional();

  // Use override status or context status
  const status = overrideStatus ?? context?.status;

  // Don't render if no status or idle
  if (!status || status.type === "idle") {
    return null;
  }

  // Select icon and color based on status type
  const icon = status.type === "rate-limit" ? "⏳" : "🔄";
  const color = status.type === "rate-limit" ? theme.colors.warning : theme.colors.info;

  if (compact) {
    // Compact: just icon and wait time
    const waitText = status.waitSeconds ? `${status.waitSeconds}s` : "";
    return (
      <Box>
        <Text color={color}>
          {icon} {waitText}
        </Text>
      </Box>
    );
  }

  // Full: icon and message
  return (
    <Box>
      <Text color={color}>
        {icon} {status.message}
      </Text>
    </Box>
  );
}

/**
 * Resilience status bar segment for integration into StatusBar.
 *
 * Returns null if no active resilience event, making it safe to
 * include in layouts unconditionally.
 */
export function ResilienceStatusSegment(): React.JSX.Element | null {
  const context = useResilienceOptional();

  // Don't render anything if context not available or feedback disabled
  if (!context || !context.feedbackEnabled) {
    return null;
  }

  // Don't render if idle
  if (context.status.type === "idle") {
    return null;
  }

  return <ResilienceIndicator />;
}
