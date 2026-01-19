/**
 * AutoApprovalStatus Component (Phase 35+)
 *
 * Displays auto-approval status and limits in the TUI.
 * Shows consecutive requests/cost for automatic tool approvals.
 * Uses ASCII symbols instead of emoji for terminal compatibility.
 *
 * @module tui/components/common/AutoApprovalStatus
 */

import { Box, Text } from "ink";
import type React from "react";
import { memo } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Status severity level.
 */
export type AutoApprovalSeverity = "info" | "warning" | "error";

/**
 * Props for the AutoApprovalStatus component.
 */
export interface AutoApprovalStatusProps {
  /** Number of consecutive auto-approved requests */
  readonly consecutiveRequests: number;
  /** Request limit for auto-approvals */
  readonly requestLimit: number;
  /** Cumulative cost of consecutive auto-approved operations in USD */
  readonly consecutiveCost: number;
  /** Cost limit for auto-approvals in USD */
  readonly costLimit: number;
  /** Percentage of request limit used (0-100) */
  readonly requestPercentUsed: number;
  /** Percentage of cost limit used (0-100) */
  readonly costPercentUsed: number;
  /** Whether any limit has been reached */
  readonly limitReached?: boolean;
  /** Which limit type was reached */
  readonly limitType?: "requests" | "cost";
  /** Whether to show in compact mode */
  readonly compact?: boolean;
  /** Override severity level */
  readonly severity?: AutoApprovalSeverity;
}

// =============================================================================
// Constants - ASCII Symbols (NO EMOJI)
// =============================================================================

/**
 * ASCII symbols for different severity levels.
 */
const SEVERITY_SYMBOLS: Record<AutoApprovalSeverity, string> = {
  info: "[i]",
  warning: "[!]",
  error: "[X]",
} as const;

/**
 * ASCII symbol for auto-approval indicator.
 */
const AUTO_SYMBOL = "[>]";

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
 * Determine severity based on usage percentage.
 */
function getSeverityFromPercent(
  requestPercent: number,
  costPercent: number,
  limitReached: boolean
): AutoApprovalSeverity {
  if (limitReached) return "error";
  const maxPercent = Math.max(requestPercent, costPercent);
  if (maxPercent >= 80) return "warning";
  return "info";
}

// =============================================================================
// Component
// =============================================================================

/**
 * AutoApprovalStatus - Displays auto-approval limits and status.
 *
 * Features:
 * - Shows consecutive requests vs limit
 * - Shows consecutive cost vs limit
 * - Different severity levels (info, warning, error)
 * - Compact and full display modes
 * - ASCII-only symbols for terminal compatibility
 *
 * @example
 * ```tsx
 * // Normal status
 * <AutoApprovalStatus
 *   consecutiveRequests={45}
 *   requestLimit={50}
 *   consecutiveCost={3.50}
 *   costLimit={5.00}
 *   requestPercentUsed={90}
 *   costPercentUsed={70}
 * />
 *
 * // Limit reached
 * <AutoApprovalStatus
 *   consecutiveRequests={50}
 *   requestLimit={50}
 *   consecutiveCost={4.00}
 *   costLimit={5.00}
 *   requestPercentUsed={100}
 *   costPercentUsed={80}
 *   limitReached
 *   limitType="requests"
 * />
 * ```
 */
export const AutoApprovalStatus: React.FC<AutoApprovalStatusProps> = memo(
  function AutoApprovalStatus({
    consecutiveRequests,
    requestLimit,
    consecutiveCost,
    costLimit,
    requestPercentUsed,
    costPercentUsed,
    limitReached = false,
    limitType,
    compact = false,
    severity: severityProp,
  }) {
    const { theme } = useTheme();

    // Determine severity from props or calculate from percentage
    const severity =
      severityProp ?? getSeverityFromPercent(requestPercentUsed, costPercentUsed, limitReached);

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
    // [i] Auto-approved: 45/50 requests ($3.50/$5.00)
    if (compact) {
      return (
        <Box>
          <Text color={color}>
            {AUTO_SYMBOL} Auto-approved: {consecutiveRequests}/{requestLimit} requests (
            {formatCostUSD(consecutiveCost)}/{formatCostUSD(costLimit)})
          </Text>
        </Box>
      );
    }

    // Full display with limit reached message
    if (limitReached) {
      const limitMessage =
        limitType === "requests"
          ? `Request limit reached (${consecutiveRequests}/${requestLimit})`
          : `Cost limit reached (${formatCostUSD(consecutiveCost)}/${formatCostUSD(costLimit)})`;

      return (
        <Box flexDirection="column" marginY={1}>
          {/* Header line */}
          <Box>
            <Text color={color} bold>
              {symbol} AUTO-APPROVAL LIMIT: {limitMessage}
            </Text>
          </Box>

          {/* Instructions */}
          <Box marginLeft={4}>
            <Text dimColor>Waiting for user confirmation to continue...</Text>
          </Box>

          {/* Details */}
          <Box marginLeft={4} marginTop={1}>
            <Text>
              {AUTO_SYMBOL} Requests: {consecutiveRequests}/{requestLimit} | Cost:{" "}
              {formatCostUSD(consecutiveCost)}/{formatCostUSD(costLimit)}
            </Text>
          </Box>
        </Box>
      );
    }

    // Full display for warning state
    return (
      <Box flexDirection="column" marginY={1}>
        {/* Header line */}
        <Box>
          <Text color={color} bold>
            {symbol} Auto-Approval Status
          </Text>
        </Box>

        {/* Request details */}
        <Box marginLeft={4}>
          <Text>
            Requests:{" "}
            <Text color={requestPercentUsed >= 80 ? theme.colors.warning : undefined}>
              {consecutiveRequests}/{requestLimit}
            </Text>{" "}
            ({requestPercentUsed.toFixed(0)}%)
          </Text>
        </Box>

        {/* Cost details */}
        <Box marginLeft={4}>
          <Text>
            Cost:{" "}
            <Text color={costPercentUsed >= 80 ? theme.colors.warning : undefined}>
              {formatCostUSD(consecutiveCost)}/{formatCostUSD(costLimit)}
            </Text>{" "}
            ({costPercentUsed.toFixed(0)}%)
          </Text>
        </Box>
      </Box>
    );
  }
);

/**
 * Default export for convenience.
 */
export default AutoApprovalStatus;
