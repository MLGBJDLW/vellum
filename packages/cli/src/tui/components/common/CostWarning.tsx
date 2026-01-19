/**
 * CostWarning Component (Phase 35+)
 *
 * Displays cost limit warnings and status in the TUI.
 * Uses ASCII symbols instead of emoji for terminal compatibility.
 *
 * @module tui/components/common/CostWarning
 */

import { Box, Text } from "ink";
import type React from "react";
import { memo } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Warning severity level.
 */
export type CostWarningSeverity = "info" | "warning" | "error";

/**
 * Props for the CostWarning component.
 */
export interface CostWarningProps {
  /** Current cost used in USD */
  readonly costUsed: number;
  /** Cost limit in USD (undefined if no limit) */
  readonly costLimit?: number;
  /** Number of requests made */
  readonly requestsUsed: number;
  /** Request limit (undefined if no limit) */
  readonly requestLimit?: number;
  /** Percentage of limit used (0-100) */
  readonly percentUsed: number;
  /** Whether limit has been reached */
  readonly limitReached?: boolean;
  /** Whether awaiting user approval */
  readonly awaitingApproval?: boolean;
  /** Severity level for styling */
  readonly severity?: CostWarningSeverity;
  /** Whether to show in compact mode */
  readonly compact?: boolean;
  /** Callback when user approves continuation */
  readonly onApprove?: () => void;
  /** Callback when user denies continuation */
  readonly onDeny?: () => void;
}

// =============================================================================
// Constants - ASCII Symbols (NO EMOJI)
// =============================================================================

/**
 * ASCII symbols for different severity levels.
 */
const SEVERITY_SYMBOLS: Record<CostWarningSeverity, string> = {
  info: "[i]",
  warning: "[!]",
  error: "[X]",
} as const;

/**
 * ASCII symbol for cost indicator.
 */
const COST_SYMBOL = "[$]";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format cost as USD string.
 */
function formatCostUSD(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/**
 * Determine severity based on percentage used.
 */
function getSeverityFromPercent(percentUsed: number, limitReached: boolean): CostWarningSeverity {
  if (limitReached) return "error";
  if (percentUsed >= 80) return "warning";
  return "info";
}

// =============================================================================
// Component
// =============================================================================

/**
 * CostWarning - Displays cost limit warnings and status.
 *
 * Features:
 * - Shows current cost vs limit
 * - Shows request count vs limit
 * - Displays percentage used with progress indicator
 * - Different severity levels (info, warning, error)
 * - Compact and full display modes
 * - ASCII-only symbols for terminal compatibility
 *
 * @example
 * ```tsx
 * // Warning at 80%
 * <CostWarning
 *   costUsed={4.00}
 *   costLimit={5.00}
 *   requestsUsed={80}
 *   requestLimit={100}
 *   percentUsed={80}
 *   severity="warning"
 * />
 *
 * // Limit reached
 * <CostWarning
 *   costUsed={5.20}
 *   costLimit={5.00}
 *   requestsUsed={100}
 *   percentUsed={100}
 *   limitReached
 *   awaitingApproval
 * />
 * ```
 */
export const CostWarning: React.FC<CostWarningProps> = memo(function CostWarning({
  costUsed,
  costLimit,
  requestsUsed,
  requestLimit,
  percentUsed,
  limitReached = false,
  awaitingApproval = false,
  severity: severityProp,
  compact = false,
}) {
  const { theme } = useTheme();

  // Determine severity from props or calculate from percentage
  const severity = severityProp ?? getSeverityFromPercent(percentUsed, limitReached);

  // Get colors based on severity
  const getColor = () => {
    switch (severity) {
      case "error":
        return theme.colors.error;
      case "warning":
        return theme.colors.warning;
      default:
        return theme.colors.info;
    }
  };

  const symbol = SEVERITY_SYMBOLS[severity];
  const color = getColor();

  // Compact display: single line
  if (compact) {
    const limitDisplay = costLimit
      ? `${formatCostUSD(costUsed)} / ${formatCostUSD(costLimit)}`
      : formatCostUSD(costUsed);

    return (
      <Box>
        <Text color={color}>
          {COST_SYMBOL} {limitDisplay} ({percentUsed.toFixed(0)}%)
        </Text>
      </Box>
    );
  }

  // Full display
  return (
    <Box flexDirection="column" marginY={1}>
      {/* Header line */}
      <Box>
        <Text color={color} bold>
          {symbol}{" "}
          {limitReached
            ? "LIMIT REACHED: Cost limit exceeded"
            : `WARNING: Cost limit ${percentUsed.toFixed(0)}% reached`}
        </Text>
      </Box>

      {/* Cost details */}
      <Box marginLeft={4}>
        <Text>
          {COST_SYMBOL} Cost:{" "}
          <Text color={color}>
            {formatCostUSD(costUsed)}
            {costLimit && ` / ${formatCostUSD(costLimit)}`}
          </Text>
        </Text>
      </Box>

      {/* Request details (if limit set) */}
      {requestLimit && (
        <Box marginLeft={4}>
          <Text>
            [#] Requests:{" "}
            <Text color={color}>
              {requestsUsed} / {requestLimit}
            </Text>
          </Text>
        </Box>
      )}

      {/* Progress bar */}
      <Box marginLeft={4} marginTop={1}>
        <ProgressBar percent={percentUsed} color={color} width={30} />
      </Box>

      {/* Approval prompt */}
      {awaitingApproval && (
        <Box marginTop={1} marginLeft={4}>
          <Text color={theme.colors.warning}>Press [y] to continue or [n] to stop</Text>
        </Box>
      )}
    </Box>
  );
});

// =============================================================================
// Progress Bar Sub-component
// =============================================================================

interface ProgressBarProps {
  readonly percent: number;
  readonly color: string;
  readonly width?: number;
}

/**
 * Simple ASCII progress bar.
 */
const ProgressBar: React.FC<ProgressBarProps> = memo(function ProgressBar({
  percent,
  color,
  width = 20,
}) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  return (
    <Box>
      <Text color={color}>[</Text>
      <Text color={color}>{"=".repeat(Math.max(0, filled))}</Text>
      <Text dimColor>{"-".repeat(Math.max(0, empty))}</Text>
      <Text color={color}>]</Text>
      <Text dimColor> {percent.toFixed(0)}%</Text>
    </Box>
  );
});

// =============================================================================
// Compact Cost Display
// =============================================================================

/**
 * Props for CompactCostDisplay.
 */
export interface CompactCostDisplayProps {
  /** Current cost used in USD */
  readonly cost: number;
  /** Cost limit (optional) */
  readonly limit?: number;
  /** Show warning color if approaching limit */
  readonly showWarning?: boolean;
}

/**
 * Compact single-line cost display for status bar.
 *
 * @example
 * ```tsx
 * <CompactCostDisplay cost={2.50} limit={5.00} />
 * // Output: [$] $2.50 / $5.00
 * ```
 */
export const CompactCostDisplay: React.FC<CompactCostDisplayProps> = memo(
  function CompactCostDisplay({ cost, limit, showWarning = false }) {
    const { theme } = useTheme();
    const color = showWarning ? theme.colors.warning : theme.colors.muted;

    return (
      <Text color={color}>
        {COST_SYMBOL} {formatCostUSD(cost)}
        {limit && ` / ${formatCostUSD(limit)}`}
      </Text>
    );
  }
);
