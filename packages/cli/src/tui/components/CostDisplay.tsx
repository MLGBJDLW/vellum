/**
 * CostDisplay Component (Phase 35)
 *
 * React Ink component for displaying current session cost information.
 * Shows token usage and cost in USD.
 *
 * @module tui/components/CostDisplay
 */

import type { CostBreakdown } from "@vellum/core";
import { formatCost, formatTokenCount } from "@vellum/core";
import { getIcons } from "@vellum/shared";
import { Box, Text } from "ink";
import { useTheme } from "../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the CostDisplay component.
 */
export interface CostDisplayProps {
  /** Total input tokens used */
  readonly inputTokens: number;
  /** Total output tokens generated */
  readonly outputTokens: number;
  /** Total cost in USD */
  readonly totalCost: number;
  /** Optional detailed cost breakdown */
  readonly breakdown?: CostBreakdown;
  /** Whether to show compact view (default: false) */
  readonly compact?: boolean;
  /** Whether to show breakdown details (default: false) */
  readonly showBreakdown?: boolean;
}

// =============================================================================
// CostDisplay Component
// =============================================================================

/**
 * CostDisplay - Shows current session cost and token usage.
 *
 * Features:
 * - Compact mode: Single line with total tokens and cost
 * - Full mode: Multi-line with detailed breakdown
 * - Color-coded based on cost magnitude
 *
 * @example
 * ```tsx
 * <CostDisplay
 *   inputTokens={1500}
 *   outputTokens={800}
 *   totalCost={0.0045}
 * />
 * ```
 */
export function CostDisplay({
  inputTokens,
  outputTokens,
  totalCost,
  breakdown,
  compact = false,
  showBreakdown = false,
}: CostDisplayProps): React.JSX.Element {
  const { theme } = useTheme();
  const icons = getIcons();

  // Determine cost color based on magnitude
  const costColor = getCostColor(totalCost, theme);

  // Total tokens
  const totalTokens = inputTokens + outputTokens;

  if (compact) {
    return (
      <Box>
        <Text dimColor>{icons.cost} </Text>
        <Text color={theme.colors.muted}>{formatTokenCount(totalTokens)} tokens</Text>
        <Text dimColor> • </Text>
        <Text color={costColor} bold>
          {formatCost(totalCost)}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color={theme.colors.primary} bold>
          {icons.cost} Session Cost
        </Text>
      </Box>

      {/* Token Summary */}
      <Box flexDirection="column" marginLeft={2}>
        <Box>
          <Text color={theme.colors.muted}>Input: </Text>
          <Text>{formatTokenCount(inputTokens)}</Text>
          <Text color={theme.colors.muted}> tokens</Text>
        </Box>
        <Box>
          <Text color={theme.colors.muted}>Output: </Text>
          <Text>{formatTokenCount(outputTokens)}</Text>
          <Text color={theme.colors.muted}> tokens</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.colors.muted}>Total: </Text>
          <Text bold>{formatTokenCount(totalTokens)}</Text>
          <Text color={theme.colors.muted}> tokens</Text>
        </Box>
      </Box>

      {/* Cost Breakdown */}
      {showBreakdown && breakdown && (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text color={theme.colors.muted} dimColor>
            ─────────────────
          </Text>
          {breakdown.input > 0 && (
            <Box>
              <Text color={theme.colors.muted}>Input: </Text>
              <Text>{formatCost(breakdown.input)}</Text>
            </Box>
          )}
          {breakdown.output > 0 && (
            <Box>
              <Text color={theme.colors.muted}>Output: </Text>
              <Text>{formatCost(breakdown.output)}</Text>
            </Box>
          )}
          {breakdown.cacheRead > 0 && (
            <Box>
              <Text color={theme.colors.muted}>Cache (R): </Text>
              <Text>{formatCost(breakdown.cacheRead)}</Text>
            </Box>
          )}
          {breakdown.cacheWrite > 0 && (
            <Box>
              <Text color={theme.colors.muted}>Cache (W): </Text>
              <Text>{formatCost(breakdown.cacheWrite)}</Text>
            </Box>
          )}
          {breakdown.reasoning > 0 && (
            <Box>
              <Text color={theme.colors.muted}>Reasoning: </Text>
              <Text>{formatCost(breakdown.reasoning)}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Total Cost */}
      <Box marginLeft={2} marginTop={1}>
        <Text color={theme.colors.muted} dimColor>
          ─────────────────
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text color={theme.colors.muted}>Cost: </Text>
        <Text color={costColor} bold>
          {formatCost(totalCost)}
        </Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get appropriate color for cost display based on magnitude.
 */
function getCostColor(cost: number, theme: ReturnType<typeof useTheme>["theme"]): string {
  if (cost === 0) {
    return theme.colors.muted;
  }
  if (cost < 0.01) {
    return theme.colors.success; // Green - very low cost
  }
  if (cost < 0.1) {
    return theme.colors.info; // Blue - moderate cost
  }
  if (cost < 1.0) {
    return theme.colors.warning; // Yellow - getting expensive
  }
  return theme.colors.error; // Red - expensive
}

// =============================================================================
// Compact Cost Badge
// =============================================================================

/**
 * Props for the CostBadge component.
 */
export interface CostBadgeProps {
  /** Total cost in USD */
  readonly cost: number;
}

/**
 * CostBadge - Minimal cost display for status bars.
 *
 * @example
 * ```tsx
 * <CostBadge cost={0.0045} />
 * // Renders: $0.0045
 * ```
 */
export function CostBadge({ cost }: CostBadgeProps): React.JSX.Element {
  const { theme } = useTheme();
  const costColor = getCostColor(cost, theme);

  return <Text color={costColor}>{formatCost(cost)}</Text>;
}

export default CostDisplay;
