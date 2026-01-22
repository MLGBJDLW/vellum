// ============================================
// T020: Transport Barrel Export
// ============================================

/**
 * Transport adapters for MCP server connections.
 *
 * This module provides factory functions for creating MCP transports
 * based on server configuration type:
 *
 * - **Stdio**: For local process-based servers (command line tools)
 * - **Streamable HTTP**: For remote servers (preferred)
 * - **SSE**: For remote servers (deprecated, fallback only)
 * - **Remote**: Auto-detects between Streamable HTTP and SSE
 *
 * @example
 * ```typescript
 * import {
 *   createStdioTransport,
 *   createStreamableHttpTransport,
 *   createSSETransport,
 *   createRemoteTransport,
 * } from "@vellum/mcp/transports";
 *
 * // Local server via stdio
 * const stdio = await createStdioTransport(
 *   { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"] },
 *   { serverName: "filesystem" }
 * );
 *
 * // Remote server with auto-detection
 * const remote = await createRemoteTransport(
 *   { type: "remote", url: "https://mcp.example.com" },
 *   { serverName: "example" }
 * );
 * ```
 *
 * @module transports
 */

// Remote transport with fallback
export {
  createRemoteTransport,
  type RemoteTransportOptions,
  type RemoteTransportResult,
  validateRemoteConfig,
} from "./FallbackTransport.js";
// SSE transport (deprecated)
export {
  createSSETransport,
  type SSETransportOptions,
  type SSETransportResult,
  validateSseConfig,
} from "./SSEAdapter.js";
// Stdio transport
export {
  createStdioTransport,
  type StdioTransportOptions,
  type StdioTransportResult,
  validateStdioConfig,
} from "./StdioAdapter.js";
// Streamable HTTP transport (preferred for remote)
export {
  createStreamableHttpTransport,
  type StreamableHttpTransportOptions,
  type StreamableHttpTransportResult,
  validateStreamableHttpConfig,
} from "./StreamableHttpAdapter.js";
// WebSocket transport
export {
  createWebSocketTransport,
  validateWebSocketConfig,
  type WebSocketTransportOptions,
  type WebSocketTransportResult,
} from "./WebSocketAdapter.js";
