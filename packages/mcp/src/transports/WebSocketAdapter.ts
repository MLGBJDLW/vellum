// ============================================
// T021: WebSocket Transport Adapter
// ============================================

import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { McpTransportError } from "../errors.js";
import type { McpWebSocketConfig } from "../types.js";

/**
 * Options for WebSocket transport creation.
 */
export interface WebSocketTransportOptions {
  /** Server name for error context */
  serverName: string;
  /** Logger for status messages */
  logger?: {
    debug?: (message: string) => void;
  };
}

/**
 * Result from creating a WebSocket transport.
 */
export interface WebSocketTransportResult {
  /** The transport instance */
  transport: Transport;
  /** Close handler to clean up resources */
  close: () => Promise<void>;
}

/**
 * Creates an MCP transport for WebSocket-based servers.
 *
 * WebSocket transport provides full-duplex communication, making it suitable
 * for real-time, bidirectional MCP interactions. This is useful for servers
 * that require low-latency, persistent connections.
 *
 * @param config - WebSocket server configuration
 * @param options - Transport options
 * @returns Transport instance ready for MCP client connection
 *
 * @example
 * ```typescript
 * const { transport } = await createWebSocketTransport(
 *   { type: "websocket", url: "wss://mcp.example.com/ws" },
 *   { serverName: "realtime-server" }
 * );
 * ```
 */
export async function createWebSocketTransport(
  config: McpWebSocketConfig,
  options: WebSocketTransportOptions
): Promise<WebSocketTransportResult> {
  const { serverName, logger } = options;

  try {
    // Parse and validate the URL
    const url = new URL(config.url);

    // Validate protocol
    if (!["ws:", "wss:"].includes(url.protocol)) {
      throw new Error(`WebSocket URL must use ws:// or wss:// protocol, got: ${url.protocol}`);
    }

    logger?.debug?.(`[${serverName}] Creating WebSocket transport to ${url.href}`);

    // Create the WebSocket transport
    const transport = new WebSocketClientTransport(url);

    const close = async () => {
      try {
        await transport.close();
      } catch {
        // Ignore close errors
      }
    };

    return { transport, close };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error creating WebSocket transport";
    throw new McpTransportError(message, serverName, "websocket", {
      cause: error instanceof Error ? error : undefined,
      context: {
        url: config.url,
      },
    });
  }
}

/**
 * Validates WebSocket configuration before transport creation.
 *
 * @param config - Configuration to validate
 * @returns Array of validation error messages, empty if valid
 */
export function validateWebSocketConfig(config: McpWebSocketConfig): string[] {
  const errors: string[] = [];

  if (!config.url || typeof config.url !== "string") {
    errors.push("URL is required and must be a string");
  } else {
    try {
      const url = new URL(config.url);
      if (!["ws:", "wss:"].includes(url.protocol)) {
        errors.push("URL must use ws or wss protocol");
      }
    } catch {
      errors.push("URL is not a valid URL");
    }
  }

  return errors;
}
