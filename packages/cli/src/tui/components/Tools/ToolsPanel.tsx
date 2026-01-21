/**
 * ToolsPanel Component
 *
 * Minimal sidebar panel that renders recent tool executions.
 * Designed for narrow widths (20-40 cols) inside Layout sidebar.
 */

import { Box, Text } from "ink";
import type React from "react";
import { useMemo } from "react";
import { useTools } from "../../context/ToolsContext.js";
import { useTheme } from "../../theme/index.js";
import { HotkeyHints } from "../common/HotkeyHints.js";
import { ToolParams } from "./ToolParams.js";

/** Shell tool names that support streaming output */
const SHELL_TOOLS = new Set(["shell", "bash"]);

export interface ToolsPanelProps {
  /** Whether this panel is currently focused (reserved for future key handling). */
  readonly isFocused?: boolean;
  /** Max number of executions to show (default: 10). */
  readonly maxItems?: number;
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "pending";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "running":
      return "running";
    case "complete":
      return "done";
    case "error":
      return "error";
    default:
      return status;
  }
}

function statusGlyph(status: string): string {
  switch (status) {
    case "pending":
      return "?";
    case "approved":
      return "✓";
    case "running":
      return "…";
    case "complete":
      return "✓";
    case "rejected":
      return "✗";
    case "error":
      return "!";
    default:
      return "·";
  }
}

export function ToolsPanel({ maxItems = 10 }: ToolsPanelProps): React.JSX.Element {
  const { theme } = useTheme();
  const { executions, pendingApproval } = useTools();

  const hints = useMemo(
    () => [
      { keys: "Alt+K", label: "Sidebar" },
      { keys: "Alt+G", label: "Tools" },
      { keys: "Alt+O", label: "MCP" },
      { keys: "Alt+P", label: "Memory" },
      { keys: "Alt+T", label: "Todo" },
      { keys: "Ctrl+S", label: "Sessions" },
      { keys: "Ctrl+Z", label: "Undo" },
      { keys: "Ctrl+Y", label: "Redo" },
    ],
    []
  );

  const recent = useMemo(() => {
    if (executions.length <= maxItems) {
      return executions;
    }
    return executions.slice(executions.length - maxItems);
  }, [executions, maxItems]);

  const latest = recent.length > 0 ? recent[recent.length - 1] : undefined;

  return (
    <Box flexDirection="column">
      <Text color={theme.colors.primary} bold>
        Tools
      </Text>

      <Text dimColor>
        Pending: {pendingApproval.length} Total: {executions.length}
      </Text>

      {recent.length === 0 ? (
        <Text dimColor>No tool activity yet</Text>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {recent.map((execution) => (
            <Text key={execution.id}>
              {statusGlyph(execution.status)} {execution.toolName} ({statusLabel(execution.status)})
            </Text>
          ))}
        </Box>
      )}

      {/* Minimal details view (most recent execution) */}
      {latest && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.colors.primary} bold>
            Details
          </Text>
          <Text dimColor>
            {latest.toolName} ({statusLabel(latest.status)})
          </Text>

          {Object.keys(latest.params).length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>Params:</Text>
              <ToolParams params={latest.params} collapsed highlightPaths highlightCommands />
            </Box>
          )}

          {/* Shell output streaming preview */}
          {SHELL_TOOLS.has(latest.toolName) &&
            latest.status === "running" &&
            latest.shellOutput &&
            latest.shellOutput.length > 0 && (
              <Box marginTop={1} flexDirection="column">
                <Text color={theme.colors.primary} dimColor>
                  Output:
                </Text>
                <Box
                  flexDirection="column"
                  borderStyle="single"
                  borderColor={theme.colors.secondary}
                  paddingX={1}
                >
                  {latest.shellOutput.slice(-5).map((line, idx) => (
                    <Text key={`shell-output-${idx}-${line.slice(0, 20)}`} wrap="truncate">
                      {line}
                    </Text>
                  ))}
                </Box>
              </Box>
            )}

          {latest.status === "error" && latest.error && (
            <Box marginTop={1}>
              <Text color={theme.colors.error}>Error: {latest.error.message}</Text>
            </Box>
          )}

          {latest.status === "complete" && latest.result !== undefined && (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>Result:</Text>
              <Text>
                {typeof latest.result === "string"
                  ? latest.result
                  : JSON.stringify(latest.result, null, 2)}
              </Text>
            </Box>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <HotkeyHints hints={hints} />
      </Box>
    </Box>
  );
}
