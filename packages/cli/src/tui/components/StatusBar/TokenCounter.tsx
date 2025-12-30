/**
 * TokenCounter Component (T036)
 *
 * Displays token usage as a percentage with color-coded warnings.
 * Changes color based on usage thresholds: warning at 80%, error at 95%.
 *
 * @module tui/components/StatusBar/TokenCounter
 */

import { Box, Text } from "ink";
import { useMemo } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the TokenCounter component.
 */
export interface TokenCounterProps {
  /** Current token count */
  readonly current: number;
  /** Maximum token limit */
  readonly max: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Warning threshold percentage (80%) */
const WARNING_THRESHOLD = 80;

/** Error threshold percentage (95%) */
const ERROR_THRESHOLD = 95;

/** Token counter icon */
const TOKEN_ICON = "◊";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Formats a number with K/M suffix for compact display.
 */
function formatTokenCount(count: number): string {
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
 * Calculates the percentage of tokens used.
 */
function calculatePercentage(current: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(Math.round((current / max) * 100), 100);
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * TokenCounter displays token usage with color-coded warnings.
 *
 * Features:
 * - Current/max token display
 * - Percentage indicator
 * - Color-coded thresholds:
 *   - Normal (< 80%): secondary text color
 *   - Warning (80-95%): warning color
 *   - Error (> 95%): error color
 *
 * @example
 * ```tsx
 * // Normal usage
 * <TokenCounter current={5000} max={100000} />
 *
 * // Warning state
 * <TokenCounter current={85000} max={100000} />
 *
 * // Error state
 * <TokenCounter current={98000} max={100000} />
 * ```
 */
export function TokenCounter({ current, max }: TokenCounterProps): React.JSX.Element {
  const { theme } = useTheme();

  const percentage = useMemo(() => calculatePercentage(current, max), [current, max]);

  const formattedCurrent = useMemo(() => formatTokenCount(current), [current]);
  const formattedMax = useMemo(() => formatTokenCount(max), [max]);

  // Determine color based on percentage thresholds
  const color = useMemo(() => {
    if (percentage >= ERROR_THRESHOLD) {
      return theme.colors.error;
    }
    if (percentage >= WARNING_THRESHOLD) {
      return theme.colors.warning;
    }
    return theme.semantic.text.secondary;
  }, [percentage, theme.colors.error, theme.colors.warning, theme.semantic.text.secondary]);

  const percentageColor = useMemo(() => {
    if (percentage >= ERROR_THRESHOLD) {
      return theme.colors.error;
    }
    if (percentage >= WARNING_THRESHOLD) {
      return theme.colors.warning;
    }
    return theme.semantic.text.muted;
  }, [percentage, theme.colors.error, theme.colors.warning, theme.semantic.text.muted]);

  return (
    <Box>
      <Text color={theme.semantic.text.muted}>{TOKEN_ICON} </Text>
      <Text color={color}>{formattedCurrent}</Text>
      <Text color={theme.semantic.text.muted}>/</Text>
      <Text color={theme.semantic.text.secondary}>{formattedMax}</Text>
      <Text color={theme.semantic.text.muted}> (</Text>
      <Text color={percentageColor}>{percentage}%</Text>
      <Text color={theme.semantic.text.muted}>)</Text>
    </Box>
  );
}
