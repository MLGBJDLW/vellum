/**
 * ToolCall Component (T027)
 *
 * Displays a tool execution with status icon, name, and optional duration.
 * Supports both full and compact display modes for different UI contexts.
 *
 * @module tui/components/Tools/ToolCall
 */

import { getIcons } from "@vellum/shared";
import { Box, Text } from "ink";
import type React from "react";
import { useAnimation } from "../../context/AnimationContext.js";
import type { ToolExecution, ToolExecutionStatus } from "../../context/ToolsContext.js";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ToolCall component.
 */
export interface ToolCallProps {
  /** The tool execution to display */
  readonly execution: ToolExecution;
  /** Whether to use compact mode for inline display (default: false) */
  readonly compact?: boolean;
  /** Whether to show duration for completed executions (default: false) */
  readonly showDuration?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Spinner animation frames for running status */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Get status icons using the icon system for proper Unicode/ASCII support.
 */
function getStatusIcons(): Record<ToolExecutionStatus, string> {
  const icons = getIcons();
  return {
    pending: "~",
    approved: icons.check,
    rejected: icons.cross,
    running: "", // Will use spinner
    complete: icons.check,
    error: icons.cross,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the color for a status.
 *
 * @param status - The tool execution status
 * @returns The color string for the status
 */
function getStatusColor(status: ToolExecutionStatus): string {
  switch (status) {
    case "pending":
      return "yellow";
    case "approved":
      return "green";
    case "rejected":
      return "red";
    case "running":
      return "cyan";
    case "complete":
      return "green";
    case "error":
      return "red";
    default:
      return "white";
  }
}

/**
 * Calculate duration between two dates in milliseconds.
 *
 * @param startedAt - Start timestamp
 * @param completedAt - End timestamp
 * @returns Duration in milliseconds, or undefined if dates are missing
 */
function calculateDuration(startedAt?: Date, completedAt?: Date): number | undefined {
  if (!startedAt || !completedAt) {
    return undefined;
  }
  return completedAt.getTime() - startedAt.getTime();
}

/**
 * Format duration in milliseconds to a human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// =============================================================================
// Spinner Component
// =============================================================================

/**
 * Animated spinner indicator for running status.
 * Uses global AnimationContext to prevent flickering from competing timers.
 */
function Spinner(): React.JSX.Element {
  const { frame, isPaused } = useAnimation();
  // Map global frame to spinner frame (slower than global tick)
  // Divide by 2 to slow down spinner relative to global tick rate
  const frameIndex = isPaused ? 0 : Math.floor(frame / 2) % SPINNER_FRAMES.length;
  return <Text color="cyan">{SPINNER_FRAMES[frameIndex]}</Text>;
}

// =============================================================================
// StatusIcon Component
// =============================================================================

/**
 * Renders the appropriate icon for a tool execution status.
 */
function StatusIcon({ status }: { readonly status: ToolExecutionStatus }): React.JSX.Element {
  const color = getStatusColor(status);

  // Use animated spinner for running status
  if (status === "running") {
    return <Spinner />;
  }

  const statusIcons = getStatusIcons();
  return <Text color={color}>{statusIcons[status]}</Text>;
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * ToolCall displays a single tool execution with status and optional duration.
 *
 * Features:
 * - Status icon with color coding:
 *   - pending: [...] (yellow)
 *   - approved: + (green)
 *   - rejected: x (red)
 *   - running: animated spinner (cyan)
 *   - complete: + (green)
 *   - error: x (red)
 * - Tool name display
 * - Optional duration for completed executions
 * - Compact mode for inline display
 *
 * @example
 * ```tsx
 * // Basic usage
 * <ToolCall execution={toolExec} />
 *
 * // With duration
 * <ToolCall execution={toolExec} showDuration />
 *
 * // Compact mode
 * <ToolCall execution={toolExec} compact />
 * ```
 */
export function ToolCall({
  execution,
  compact = false,
  showDuration = false,
}: ToolCallProps): React.JSX.Element {
  const { theme } = useTheme();

  const textColor = theme.semantic.text.primary;
  const mutedColor = theme.semantic.text.muted;

  // Calculate duration if available and showDuration is enabled
  const duration =
    showDuration && (execution.status === "complete" || execution.status === "error")
      ? calculateDuration(execution.startedAt, execution.completedAt)
      : undefined;

  // Compact mode: single line with minimal info
  if (compact) {
    return (
      <Box>
        <StatusIcon status={execution.status} />
        <Text color={textColor}> {execution.toolName}</Text>
      </Box>
    );
  }

  // Full mode: status icon, name, and optional duration
  return (
    <Box flexDirection="row" gap={1}>
      <StatusIcon status={execution.status} />
      <Text color={textColor}>{execution.toolName}</Text>
      {duration !== undefined && (
        <Text color={mutedColor} dimColor>
          ({formatDuration(duration)})
        </Text>
      )}
      {execution.status === "error" && execution.error && (
        <Text color="red" dimColor>
          - {execution.error.message}
        </Text>
      )}
    </Box>
  );
}

export default ToolCall;
