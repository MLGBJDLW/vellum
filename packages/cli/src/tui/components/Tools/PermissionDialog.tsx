/**
 * PermissionDialog Component (T029)
 *
 * A dialog component for requesting user approval of tool executions.
 * Displays tool information, risk assessment, and keybinding hints.
 * Supports focus trapping and keyboard navigation.
 *
 * @module tui/components/Tools/PermissionDialog
 */

import { Box, Text, useInput } from "ink";
import type React from "react";
import { useId, useRef } from "react";
import { useMouseContextOptional } from "../../context/MouseContext.js";
import type { ToolExecution } from "../../context/ToolsContext.js";
import { useTUITranslation } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";
import { BannerShimmerText } from "../Banner/ShimmerText.js";
import { Clickable } from "../common/Clickable.js";
import { ToolParams } from "./ToolParams.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Risk level for tool execution approval.
 */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/**
 * Props for the PermissionDialog component.
 */
export interface PermissionDialogProps {
  /** The tool execution requesting approval */
  readonly execution: ToolExecution;
  /** Risk level assessment for the tool operation */
  readonly riskLevel: RiskLevel;
  /** Callback when user approves the execution */
  readonly onApprove: () => void;
  /** Callback when user rejects the execution */
  readonly onReject: () => void;
  /** Optional callback for "always allow" this tool (default: undefined) */
  readonly onApproveAlways?: () => void;
  /** Whether dialog is currently focused (default: true) */
  readonly isFocused?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Color mapping for risk levels.
 * - low: green - safe operations
 * - medium: yellow - potentially impactful
 * - high: #FFA500 (orange) - significant impact
 * - critical: red - dangerous operations
 */
const RISK_COLORS: Record<RiskLevel, string> = {
  low: "green",
  medium: "yellow",
  high: "#FFA500", // orange
  critical: "red",
};

/**
 * Icons for risk levels.
 */
const RISK_ICONS: Record<RiskLevel, string> = {
  low: "●",
  medium: "▲",
  high: "◆",
  critical: "⬢",
};

/**
 * Labels for risk levels.
 */
const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
  critical: "Critical Risk",
};

// =============================================================================
// Helper Components
// =============================================================================

/**
 * Renders a colored risk badge.
 */
function RiskBadge({ level }: { readonly level: RiskLevel }): React.JSX.Element {
  const color = RISK_COLORS[level];
  const icon = RISK_ICONS[level];
  const label = RISK_LABELS[level];

  return (
    <Box>
      <Text color={color} bold>
        {icon} {label}
      </Text>
    </Box>
  );
}

/**
 * Renders keybinding hints.
 */
function KeybindingHints({
  showAlwaysAllow,
  isMouseActive,
  onApprove,
  onReject,
  onApproveAlways,
  t,
}: {
  readonly showAlwaysAllow: boolean;
  readonly isMouseActive: boolean;
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onApproveAlways?: () => void;
  readonly t: (key: string) => string;
}): React.JSX.Element {
  const hintId = useId();
  return (
    <Box flexDirection="row" gap={2}>
      <Clickable id={`perm-approve-${hintId}`} onClick={onApprove} height={1}>
        <Text>
          <Text color="green" bold underline={isMouseActive}>
            [y/Enter]
          </Text>{" "}
          <Text dimColor>{t("permission.approve")}</Text>
        </Text>
      </Clickable>
      <Clickable id={`perm-reject-${hintId}`} onClick={onReject} height={1}>
        <Text>
          <Text color="red" bold underline={isMouseActive}>
            [n/Esc]
          </Text>{" "}
          <Text dimColor>{t("permission.reject")}</Text>
        </Text>
      </Clickable>
      {showAlwaysAllow && onApproveAlways && (
        <Clickable id={`perm-always-${hintId}`} onClick={onApproveAlways} height={1}>
          <Text>
            <Text color="cyan" bold underline={isMouseActive}>
              [a]
            </Text>{" "}
            <Text dimColor>{t("permission.alwaysAllow")}</Text>
          </Text>
        </Clickable>
      )}
    </Box>
  );
}

/**
 * Renders a horizontal separator line.
 */
function Separator({ width = 50 }: { readonly width?: number }): React.JSX.Element {
  return <Text dimColor>{"─".repeat(width)}</Text>;
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * PermissionDialog prompts the user to approve or reject a tool execution.
 *
 * Features:
 * - Displays tool name and parameters
 * - Risk level badge with color coding:
 *   - low: green (safe operations)
 *   - medium: yellow (potentially impactful)
 *   - high: orange (significant impact)
 *   - critical: red (dangerous operations)
 * - Keybindings for quick response:
 *   - 'y' or Enter: Approve
 *   - 'n' or Escape: Reject
 *   - 'a': Always allow (if onApproveAlways provided)
 * - Focus trapping when dialog is visible
 *
 * @example
 * ```tsx
 * <PermissionDialog
 *   execution={toolExec}
 *   riskLevel="medium"
 *   onApprove={() => handleApprove(toolExec.id)}
 *   onReject={() => handleReject(toolExec.id)}
 *   onApproveAlways={() => handleAlwaysAllow(toolExec.toolName)}
 * />
 * ```
 */
export function PermissionDialog({
  execution,
  riskLevel,
  onApprove,
  onReject,
  onApproveAlways,
  isFocused = true,
}: PermissionDialogProps): React.JSX.Element {
  const { theme } = useTheme();
  const { t } = useTUITranslation();
  const mouseCtx = useMouseContextOptional();
  const isMouseActive = mouseCtx?.isMouseActive ?? false;

  // Track the current execution ID to detect changes and reset handled state
  const currentExecutionId = useRef(execution.id);

  // Track whether we've handled input to prevent double-actions
  const handledRef = useRef(false);

  // Reset handled flag when execution changes
  if (currentExecutionId.current !== execution.id) {
    currentExecutionId.current = execution.id;
    handledRef.current = false;
  }

  // Handle keyboard input
  useInput(
    (input, key) => {
      // Prevent double-handling
      if (handledRef.current) {
        return;
      }

      // Approve: 'y' or Enter
      if (input.toLowerCase() === "y" || key.return) {
        handledRef.current = true;
        onApprove();
        return;
      }

      // Reject: 'n' or Escape
      if (input.toLowerCase() === "n" || key.escape) {
        handledRef.current = true;
        onReject();
        return;
      }

      // Always allow: 'a' (only if callback provided)
      if (input.toLowerCase() === "a" && onApproveAlways) {
        handledRef.current = true;
        onApproveAlways();
        return;
      }
    },
    { isActive: isFocused }
  );

  const borderColor = RISK_COLORS[riskLevel];
  const textColor = theme.semantic.text.primary;
  const hasParams = Object.keys(execution.params).length > 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      paddingY={0}
    >
      {/* Header with shimmer to draw attention */}
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <BannerShimmerText
          baseColor={textColor}
          highlightColor={borderColor}
          shimmerConfig={{ cycleDuration: 2500 }}
          shimmerWidth={0.25}
          bold
        >
          {`# ${t("permission.requestTitle")}`}
        </BannerShimmerText>
        <RiskBadge level={riskLevel} />
      </Box>

      <Separator />

      {/* Tool Info */}
      <Box flexDirection="column" marginY={1}>
        <Box flexDirection="row" gap={1}>
          <Text dimColor>{t("permission.tool")}</Text>
          <BannerShimmerText
            baseColor={textColor}
            highlightColor="#FFD700"
            shimmerConfig={{ cycleDuration: 3000 }}
            shimmerWidth={0.2}
            bold
          >
            {execution.toolName}
          </BannerShimmerText>
        </Box>

        {/* Parameters */}
        {hasParams && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>{t("permission.parameters")}</Text>
            <Box marginLeft={2}>
              <ToolParams params={execution.params} highlightPaths highlightCommands />
            </Box>
          </Box>
        )}
      </Box>

      <Separator />

      {/* Keybindings */}
      <Box marginTop={1}>
        <KeybindingHints
          showAlwaysAllow={onApproveAlways !== undefined}
          isMouseActive={isMouseActive}
          onApprove={onApprove}
          onReject={onReject}
          onApproveAlways={onApproveAlways}
          t={t}
        />
      </Box>
    </Box>
  );
}

export default PermissionDialog;
