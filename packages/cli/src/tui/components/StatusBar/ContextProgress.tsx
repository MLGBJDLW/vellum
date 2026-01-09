/**
 * ContextProgress Component
 *
 * Visual context window usage indicator with progress bar.
 * Shows token usage with color-coded thresholds:
 * - Green (0-50%): Plenty of context
 * - Yellow (50-75%): Moderate usage
 * - Orange (75-90%): High usage
 * - Red (90%+): Critical usage
 *
 * @module tui/components/StatusBar/ContextProgress
 */

import { Box, Text } from "ink";
import { useMemo } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ContextProgress component.
 */
export interface ContextProgressProps {
  /** Current token count */
  readonly current: number;
  /** Maximum token limit */
  readonly max: number;
  /** Whether to show the label "Context:" (default: true) */
  readonly showLabel?: boolean;
  /** Width of progress bar in characters (default: 10) */
  readonly barWidth?: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Progress bar characters */
const BAR_FILLED = "█";
const BAR_EMPTY = "░";

/** Color thresholds */
const THRESHOLDS = {
  LOW: 50, // 0-50%: green
  MEDIUM: 75, // 50-75%: yellow
  HIGH: 90, // 75-90%: orange
  // 90%+: red
} as const;

/** Default bar width */
const DEFAULT_BAR_WIDTH = 10;

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

/**
 * Get the color based on usage percentage.
 */
function getProgressColor(percentage: number, theme: ReturnType<typeof useTheme>["theme"]): string {
  if (percentage >= THRESHOLDS.HIGH) {
    return theme.colors.error; // Red for 90%+
  }
  if (percentage >= THRESHOLDS.MEDIUM) {
    return theme.colors.warning; // Orange/yellow for 75-90%
  }
  if (percentage >= THRESHOLDS.LOW) {
    return "#DAA520"; // Goldenrod for 50-75% (brand color)
  }
  return theme.colors.success; // Green for 0-50%
}

/**
 * Generates the progress bar string.
 */
function generateProgressBar(percentage: number, width: number): { filled: string; empty: string } {
  const filledCount = Math.round((percentage / 100) * width);
  const emptyCount = width - filledCount;
  return {
    filled: BAR_FILLED.repeat(filledCount),
    empty: BAR_EMPTY.repeat(emptyCount),
  };
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * ContextProgress displays context window usage with a visual progress bar.
 *
 * Features:
 * - Visual progress bar using Unicode block characters
 * - Color-coded based on usage thresholds
 * - Compact token count display (K/M suffixes)
 * - Optional label display
 *
 * @example
 * ```tsx
 * // Full display with label
 * <ContextProgress current={32000} max={40000} />
 * // Output: Context: ████████░░ 80% (32K/40K)
 *
 * // Compact without label
 * <ContextProgress current={5000} max={100000} showLabel={false} />
 * // Output: █░░░░░░░░░ 5% (5K/100K)
 * ```
 */
export function ContextProgress({
  current,
  max,
  showLabel = true,
  barWidth = DEFAULT_BAR_WIDTH,
}: ContextProgressProps): React.JSX.Element {
  const { theme } = useTheme();

  const percentage = useMemo(() => calculatePercentage(current, max), [current, max]);

  const progressBar = useMemo(
    () => generateProgressBar(percentage, barWidth),
    [percentage, barWidth]
  );

  const progressColor = useMemo(() => getProgressColor(percentage, theme), [percentage, theme]);

  const formattedCurrent = useMemo(() => formatTokenCount(current), [current]);
  const formattedMax = useMemo(() => formatTokenCount(max), [max]);

  return (
    <Box>
      {showLabel && <Text color={theme.semantic.text.muted}>Context: </Text>}
      <Text color={progressColor}>{progressBar.filled}</Text>
      <Text color={theme.semantic.text.muted}>{progressBar.empty}</Text>
      <Text color={theme.semantic.text.muted}> </Text>
      <Text color={progressColor}>{percentage}%</Text>
      <Text color={theme.semantic.text.muted}> (</Text>
      <Text color={theme.semantic.text.secondary}>{formattedCurrent}</Text>
      <Text color={theme.semantic.text.muted}>/</Text>
      <Text color={theme.semantic.text.secondary}>{formattedMax}</Text>
      <Text color={theme.semantic.text.muted}>)</Text>
    </Box>
  );
}
