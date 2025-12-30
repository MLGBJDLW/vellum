/**
 * ThinkingModeIndicator Component (T038)
 *
 * Displays the thinking mode status with optional budget tracking.
 * Shows whether extended thinking is active and usage if budget is set.
 *
 * @module tui/components/StatusBar/ThinkingModeIndicator
 */

import { Box, Text } from "ink";
import { useMemo } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ThinkingModeIndicator component.
 */
export interface ThinkingModeIndicatorProps {
  /** Whether thinking mode is active */
  readonly active: boolean;
  /** Optional thinking budget (max tokens for thinking) */
  readonly budget?: number;
  /** Optional tokens used for thinking */
  readonly used?: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Icon for active thinking mode */
const THINKING_ACTIVE_ICON = "◆";

/** Icon for inactive thinking mode */
const THINKING_INACTIVE_ICON = "◇";

/** Warning threshold for thinking budget (80%) */
const BUDGET_WARNING_THRESHOLD = 80;

/** Error threshold for thinking budget (95%) */
const BUDGET_ERROR_THRESHOLD = 95;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Formats token count for compact display.
 */
function formatTokens(count: number): string {
  if (count < 1000) {
    return count.toString();
  }
  if (count < 1000000) {
    const k = count / 1000;
    return k >= 10 ? `${Math.round(k)}K` : `${k.toFixed(1)}K`;
  }
  const m = count / 1000000;
  return m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1)}M`;
}

/**
 * Calculates percentage of budget used.
 */
function calculateUsagePercentage(used: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.min(Math.round((used / budget) * 100), 100);
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * ThinkingModeIndicator displays thinking mode status and budget usage.
 *
 * Features:
 * - Active/inactive state with icon
 * - Optional budget display
 * - Usage tracking with color-coded warnings
 * - Compact format for status bar
 *
 * @example
 * ```tsx
 * // Active without budget
 * <ThinkingModeIndicator active={true} />
 *
 * // Active with budget tracking
 * <ThinkingModeIndicator
 *   active={true}
 *   budget={10000}
 *   used={5000}
 * />
 *
 * // Inactive
 * <ThinkingModeIndicator active={false} />
 * ```
 */
export function ThinkingModeIndicator({
  active,
  budget,
  used,
}: ThinkingModeIndicatorProps): React.JSX.Element {
  const { theme } = useTheme();

  const icon = active ? THINKING_ACTIVE_ICON : THINKING_INACTIVE_ICON;

  // Determine icon color
  const iconColor = useMemo(() => {
    if (!active) {
      return theme.semantic.text.muted;
    }
    return theme.colors.primary;
  }, [active, theme.colors.primary, theme.semantic.text.muted]);

  // Calculate usage if budget is provided
  const usageInfo = useMemo(() => {
    if (budget === undefined || !active) {
      return null;
    }

    const currentUsed = used ?? 0;
    const percentage = calculateUsagePercentage(currentUsed, budget);

    // Determine color based on usage
    let color: string;
    if (percentage >= BUDGET_ERROR_THRESHOLD) {
      color = theme.colors.error;
    } else if (percentage >= BUDGET_WARNING_THRESHOLD) {
      color = theme.colors.warning;
    } else {
      color = theme.semantic.text.secondary;
    }

    return {
      used: formatTokens(currentUsed),
      budget: formatTokens(budget),
      percentage,
      color,
    };
  }, [
    budget,
    used,
    active,
    theme.colors.error,
    theme.colors.warning,
    theme.semantic.text.secondary,
  ]);

  const label = active ? "Think" : "Think";

  return (
    <Box>
      <Text color={iconColor}>{icon}</Text>
      <Text color={theme.semantic.text.muted}> </Text>
      <Text color={active ? theme.semantic.text.primary : theme.semantic.text.muted}>{label}</Text>
      {usageInfo && (
        <>
          <Text color={theme.semantic.text.muted}> </Text>
          <Text color={usageInfo.color}>{usageInfo.used}</Text>
          <Text color={theme.semantic.text.muted}>/</Text>
          <Text color={theme.semantic.text.secondary}>{usageInfo.budget}</Text>
        </>
      )}
    </Box>
  );
}
