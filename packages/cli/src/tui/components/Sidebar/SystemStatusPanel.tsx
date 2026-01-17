/**
 * System Status Panel Component
 *
 * Displays system status information at the bottom of the sidebar:
 * - MCP server connection status
 * - Rate limit status (if available)
 * - Update availability (if available)
 * - Git snapshot count (if available)
 *
 * @module tui/components/Sidebar/SystemStatusPanel
 */

import { Box, Text } from "ink";
import type React from "react";
import { useApp } from "../../context/AppContext.js";
import { useMcp } from "../../context/McpContext.js";
import { useTheme } from "../../theme/index.js";
import {
  PersistenceStatusIndicator,
  type PersistenceStatusIndicatorProps,
} from "../StatusBar/PersistenceStatusIndicator.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the SystemStatusPanel component
 */
export interface SystemStatusPanelProps {
  /** Compact mode for narrow sidebars */
  readonly compact?: boolean;
  /** Optional snapshot count from session */
  readonly snapshotCount?: number;
  /** Optional update version available */
  readonly updateVersion?: string;
  /** Optional rate limit percentage (0-100) */
  readonly rateLimitPercent?: number;
  /** Optional persistence status for memory indicator */
  readonly persistence?: Pick<
    PersistenceStatusIndicatorProps,
    "status" | "unsavedCount" | "lastSavedAt"
  >;
}

/** Status display tuple: [text, color] */
type StatusDisplay = readonly [string, string];

// =============================================================================
// Status Item Component
// =============================================================================

interface StatusItemProps {
  readonly label: string;
  readonly value: string;
  readonly color: string;
  readonly labelColor: string;
  readonly compact?: boolean;
}

function StatusItem({
  label,
  value,
  color,
  labelColor,
  compact,
}: StatusItemProps): React.JSX.Element {
  if (compact) {
    return (
      <Text>
        <Text color={labelColor}>{label.charAt(0)}</Text>
        <Text color={color}>{value}</Text>
      </Text>
    );
  }

  return (
    <Box>
      <Text color={labelColor}>{label}: </Text>
      <Text color={color}>{value}</Text>
    </Box>
  );
}

// =============================================================================
// Status Computation Helpers
// =============================================================================

interface ThemeColors {
  success: string;
  warning: string;
  error: string;
  info: string;
  primary: string;
  accent: string;
  muted: string;
}

/**
 * Compute MCP connection status display
 */
function getMcpStatus(
  mcpError: Error | null,
  isInitializing: boolean,
  isInitialized: boolean,
  connectedCount: number,
  totalCount: number,
  colors: ThemeColors
): StatusDisplay {
  if (mcpError) return ["err", colors.error];
  if (isInitializing) return ["...", colors.warning];
  if (!isInitialized) return ["off", colors.muted];
  if (connectedCount === 0 && totalCount === 0) return ["–", colors.muted];
  if (connectedCount === totalCount) return [`${connectedCount} ✓`, colors.success];
  return [`${connectedCount}/${totalCount}`, colors.warning];
}

/**
 * Compute rate limit status display
 */
function getRateStatus(rateLimitPercent: number | undefined, colors: ThemeColors): StatusDisplay {
  if (rateLimitPercent === undefined) return ["–", colors.muted];
  if (rateLimitPercent >= 90) return [`${rateLimitPercent}%`, colors.error];
  if (rateLimitPercent >= 70) return [`${rateLimitPercent}%`, colors.warning];
  return ["OK", colors.success];
}

/**
 * Compute update status display
 */
function getUpdateStatus(
  updateVersion: string | undefined,
  compact: boolean,
  colors: ThemeColors
): StatusDisplay {
  if (updateVersion) return [compact ? "!" : updateVersion, colors.info];
  return ["✓", colors.success];
}

/**
 * Compute snapshot status display
 */
function getSnapStatus(snapshotCount: number | undefined, colors: ThemeColors): StatusDisplay {
  if (snapshotCount !== undefined) return [String(snapshotCount), colors.primary];
  return ["–", colors.muted];
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * SystemStatusPanel displays system status in a compact panel.
 *
 * @example
 * ```tsx
 * <SystemStatusPanel compact={sidebarWidth < 24} />
 * ```
 */
export function SystemStatusPanel({
  compact = false,
  snapshotCount,
  updateVersion,
  rateLimitPercent,
  persistence,
}: SystemStatusPanelProps): React.JSX.Element {
  const { theme } = useTheme();
  const { hub, isInitialized, isInitializing, error: mcpError } = useMcp();
  const { state } = useApp();

  // Build colors object for status helpers
  const colors: ThemeColors = {
    success: theme.colors.success,
    warning: theme.colors.warning,
    error: theme.colors.error,
    info: theme.colors.info,
    primary: theme.colors.primary,
    accent: theme.colors.accent,
    muted: theme.semantic.text.muted,
  };

  // Get MCP server counts
  const mcpServers = hub?.getServers() ?? [];
  const connectedCount = mcpServers.filter((s) => s.statusInfo.status === "connected").length;
  const totalCount = mcpServers.length;

  // Compute all status displays
  const [mcpStatus, mcpColor] = getMcpStatus(
    mcpError,
    isInitializing,
    isInitialized,
    connectedCount,
    totalCount,
    colors
  );
  const [rateStatus, rateColor] = getRateStatus(rateLimitPercent, colors);
  const [updateStatus, updateColor] = getUpdateStatus(updateVersion, compact, colors);
  const [snapStatus, snapColor] = getSnapStatus(snapshotCount, colors);

  const labelColor = theme.semantic.text.secondary;
  const borderColor = theme.semantic.border.default;

  if (compact) {
    return (
      <Box flexDirection="row" borderStyle="single" borderColor={borderColor} paddingX={0} gap={1}>
        <StatusItem label="M" value={mcpStatus} color={mcpColor} labelColor={labelColor} compact />
        <StatusItem
          label="R"
          value={rateStatus}
          color={rateColor}
          labelColor={labelColor}
          compact
        />
        <StatusItem
          label="S"
          value={snapStatus}
          color={snapColor}
          labelColor={labelColor}
          compact
        />
        {persistence && (
          <PersistenceStatusIndicator
            status={persistence.status}
            unsavedCount={persistence.unsavedCount}
            lastSavedAt={persistence.lastSavedAt}
            compact
          />
        )}
        {state.vimMode && <Text color={colors.accent}>VIM</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1}>
      <Text color={theme.semantic.text.secondary} bold>
        Status
      </Text>
      <StatusItem label="MCP" value={mcpStatus} color={mcpColor} labelColor={labelColor} />
      <StatusItem label="Rate" value={rateStatus} color={rateColor} labelColor={labelColor} />
      <Box flexDirection="row" gap={1}>
        <StatusItem label="Snap" value={snapStatus} color={snapColor} labelColor={labelColor} />
        <StatusItem label="Upd" value={updateStatus} color={updateColor} labelColor={labelColor} />
      </Box>
      {/* Memory/Persistence status indicator (moved from footer) */}
      {persistence && (
        <PersistenceStatusIndicator
          status={persistence.status}
          unsavedCount={persistence.unsavedCount}
          lastSavedAt={persistence.lastSavedAt}
        />
      )}
      {state.vimMode && <Text color={colors.accent}>[VIM]</Text>}
    </Box>
  );
}
