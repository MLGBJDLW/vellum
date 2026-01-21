/**
 * MCP Status Panel
 *
 * Minimal, read-only status view for MCP integration.
 * Shows:
 * - connected server count (+ a short list)
 * - registered MCP tool count
 * - last error (if any)
 */

import type { ToolRegistry } from "@vellum/core";
import { Box, Text } from "ink";
import type React from "react";
import { useMemo } from "react";

import { useMcp } from "../context/McpContext.js";
import { HotkeyHints } from "./common/HotkeyHints.js";

export interface McpPanelProps {
  readonly isFocused: boolean;
  readonly toolRegistry: ToolRegistry;
}

function formatServerStatus(statusInfo: { status: string } | undefined): string {
  if (!statusInfo) {
    return "unknown";
  }

  // McpServerStatus is a discriminated union; keep display compact.
  switch (statusInfo.status) {
    case "connected":
      return "connected";
    case "connecting":
      return "connecting";
    case "disconnected":
      return "disconnected";
    case "disabled":
      return "disabled";
    case "needs_auth":
      return "needs_auth";
    case "needs_client_registration":
      return "needs_client_registration";
    case "failed":
      return "failed";
    default:
      return statusInfo.status;
  }
}

export function McpPanel({
  isFocused: _isFocused,
  toolRegistry,
}: McpPanelProps): React.JSX.Element {
  const { hub, isInitialized, isInitializing, error } = useMcp();

  const connections = hub?.connections ?? [];

  const mcpTools = toolRegistry.listMcpTools();
  const mcpToolCount = mcpTools.length;

  const serverLines = useMemo(() => {
    return connections.slice(0, 8).map((connection) => {
      const name = connection.server.name;
      const status = formatServerStatus(connection.server.statusInfo);

      let suffix = "";
      if (connection.server.statusInfo.status === "failed") {
        suffix = `: ${connection.server.statusInfo.error}`;
      }
      if (connection.server.statusInfo.status === "needs_client_registration") {
        suffix = `: ${connection.server.statusInfo.error}`;
      }

      return `${name} (${status}${suffix})`;
    });
  }, [connections]);

  const lastErrorMessage = useMemo(() => {
    if (error) {
      return error.message;
    }

    for (const c of connections) {
      if (c.server.statusInfo.status === "failed") {
        return c.server.statusInfo.error;
      }
      if (c.server.statusInfo.status === "needs_client_registration") {
        return c.server.statusInfo.error;
      }
    }

    return null;
  }, [connections, error]);

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

  return (
    <Box flexDirection="column">
      <Text bold>MCP</Text>
      <Text>Status: {isInitializing ? "initializing" : isInitialized ? "ready" : "not_ready"}</Text>
      <Text>Servers: {connections.length}</Text>
      <Text>MCP tools registered: {mcpToolCount}</Text>

      {lastErrorMessage ? <Text color="red">Last error: {lastErrorMessage}</Text> : null}

      {connections.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Servers</Text>
          {serverLines.map((line) => (
            <Text key={line}>- {line}</Text>
          ))}
          {connections.length > serverLines.length ? (
            <Text dimColor>…and {connections.length - serverLines.length} more</Text>
          ) : null}
        </Box>
      ) : (
        <Text dimColor>{isInitializing ? "Connecting…" : "No servers connected."}</Text>
      )}

      <Box marginTop={1}>
        <HotkeyHints hints={hints} />
      </Box>
    </Box>
  );
}
