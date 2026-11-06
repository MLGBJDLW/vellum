/**
 * ContextProgress Component
 *
 * Visual context window usage indicator with progress bar.
 * Shows token usage with color-coded thresholds:
 * - Green (0-50%): Plenty of context
 * - Yellow (50-80%): Moderate usage
 * - Red (80%+): Critical usage
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
  readonly current?: number;
  /** Maximum token limit */
  readonly max?: number;
  /** Whether to show the label "Context:" (default: true) */
  readonly showLabel?: boolean;
  /** Width of progress bar in characters (default: 10) */
  readonly barWidth?: number;
  /** Place counts on a second line for narrow sidebars. */
  readonly stacked?: boolean;
  /** Mark values estimated after compaction. */
  readonly estimated?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Progress bar characters - using half-filled block for visual progress */
const BAR_FILLED = "▓";
const BAR_EMPTY = "░";

/** Color thresholds for context usage warning */
const THRESHOLDS = {
  LOW: 50, // 0-50%: green (plenty of context)
  MEDIUM: 80, // 50-80%: yellow (moderate usage)
  // 80%+: red (critical usage)
} as const;

/** Default bar width - compact for status bar usage */
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
function calculatePercentage(
  current: number | undefined,
  max: number | undefined
): number | undefined {
  if (
    current === undefined ||
    !Number.isFinite(current) ||
    current < 0 ||
    max === undefined ||
    !Number.isFinite(max) ||
    max <= 0
  )
    return undefined;
  return Math.round((current / max) * 100);
}

/**
 * Get the color based on usage percentage.
 * Uses semantic status colors:
 * - 0-50%: success (green) - plenty of context
 * - 50-80%: warning (yellow) - moderate usage
 * - 80-100%: error (red) - critical usage
 */
function getProgressColor(percentage: number, theme: ReturnType<typeof useTheme>["theme"]): string {
  if (percentage >= THRESHOLDS.MEDIUM) {
    return theme.colors.error; // Red for 80%+
  }
  if (percentage >= THRESHOLDS.LOW) {
    return theme.colors.warning; // Yellow for 50-80%
  }
  return theme.colors.success; // Green for 0-50%
}

/**
 * Generates the progress bar string.
 */
function generateProgressBar(percentage: number, width: number): { filled: string; empty: string } {
  const safeWidth = Number.isFinite(width)
    ? Math.max(1, Math.min(80, Math.floor(width)))
    : DEFAULT_BAR_WIDTH;
  const filledCount = Math.round((Math.max(0, Math.min(percentage, 100)) / 100) * safeWidth);
  const emptyCount = safeWidth - filledCount;
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
  stacked = false,
  estimated = false,
}: ContextProgressProps): React.JSX.Element {
  const { theme } = useTheme();

  const percentage = useMemo(() => calculatePercentage(current, max), [current, max]);

  const progressBar = useMemo(
    () => generateProgressBar(percentage ?? 0, barWidth),
    [percentage, barWidth]
  );
  const progressColor =
    percentage === undefined ? theme.semantic.text.muted : getProgressColor(percentage, theme);
  const formattedCurrent =
    current !== undefined && Number.isFinite(current) && current >= 0
      ? formatTokenCount(current)
      : "?";
  const formattedMax =
    max !== undefined && Number.isFinite(max) && max > 0 ? formatTokenCount(max) : "?";

  return (
    <Box flexDirection={stacked ? "column" : "row"}>
      {showLabel && <Text color={theme.semantic.text.muted}>Context{stacked ? "" : ": "}</Text>}
      <Box flexDirection="row">
        <Text color={progressColor}>{progressBar.filled}</Text>
        <Text color={theme.semantic.text.muted}>{progressBar.empty} </Text>
        <Text color={progressColor}>
          {estimated ? "~" : ""}
          {percentage === undefined ? "?" : `${percentage}%`}
        </Text>
      </Box>
      <Text color={theme.semantic.text.secondary} wrap="truncate-end">
        {stacked ? "" : " ("}
        {formattedCurrent}/{formattedMax}
        {stacked ? " tokens" : ")"}
      </Text>
    </Box>
  );
}
