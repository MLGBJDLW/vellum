// ============================================
// T019: Fallback Transport for Remote Servers
// ============================================

import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { McpTransportError } from "../errors.js";
import type { McpRemoteConfig } from "../types.js";
import { createSSETransport, type SSETransportResult } from "./SSEAdapter.js";
import {
  createStreamableHttpTransport,
  type StreamableHttpTransportResult,
} from "./StreamableHttpAdapter.js";

/**
 * Options for remote transport creation.
 */
export interface RemoteTransportOptions {
  /** Server name for error context */
  serverName: string;
  /** OAuth provider for authenticated connections */
  authProvider?: OAuthClientProvider;
  /** Custom fetch implementation (for testing) */
  fetch?: typeof globalThis.fetch;
  /** Logger for status messages */
  logger?: {
    debug?: (message: string) => void;
    warn: (message: string) => void;
  };
  /** Skip Streamable HTTP and go directly to SSE (for testing) */
  skipStreamableHttp?: boolean;
}

/**
 * Result from creating a remote transport.
 */
export interface RemoteTransportResult {
  /** The transport instance */
  transport: Transport;
  /** The transport type that was successfully created */
  transportType: "streamableHttp" | "sse";
  /** Close handler to clean up resources */
  close: () => Promise<void>;
}

/**
 * Creates an MCP transport for remote servers with automatic protocol detection.
 *
 * This function implements a fallback strategy:
 * 1. First attempts to connect using Streamable HTTP (preferred)
 * 2. If that fails, falls back to SSE (deprecated but supported)
 *
 * Use this for servers that specify `type: "remote"` to automatically
 * negotiate the best available transport protocol.
 *
 * @param config - Remote server configuration
 * @param options - Transport options including auth provider
 * @returns Transport instance with the protocol type that succeeded
 *
 * @example
 * ```typescript
 * const { transport, transportType } = await createRemoteTransport(
 *   { type: "remote", url: "https://mcp.example.com" },
 *   { serverName: "auto-detect", logger: console }
 * );
 * console.log(`Connected using ${transportType}`);
 * ```
 */
export async function createRemoteTransport(
  config: McpRemoteConfig,
  options: RemoteTransportOptions
): Promise<RemoteTransportResult> {
  const { serverName, authProvider, fetch: customFetch, logger, skipStreamableHttp } = options;

  const errors: Error[] = [];

  // Try Streamable HTTP first (unless skipped)
  if (!skipStreamableHttp) {
    try {
      logger?.debug?.(`[${serverName}] Attempting Streamable HTTP connection...`);

      const result: StreamableHttpTransportResult = await createStreamableHttpTransport(
        {
          type: "streamableHttp",
          url: config.url,
          headers: config.headers,
          autoApprove: config.autoApprove,
          disabled: config.disabled,
          timeout: config.timeout,
        },
        {
          serverName,
          authProvider,
          fetch: customFetch,
        }
      );

      logger?.debug?.(`[${serverName}] Streamable HTTP transport created successfully`);

      return {
        transport: result.transport,
        transportType: "streamableHttp",
        close: result.close,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);
      logger?.debug?.(
        `[${serverName}] Streamable HTTP failed: ${err.message}, trying SSE fallback...`
      );
    }
  }

  // Fall back to SSE
  try {
    logger?.debug?.(`[${serverName}] Attempting SSE connection...`);

    const result: SSETransportResult = await createSSETransport(
      {
        type: "sse",
        url: config.url,
        headers: config.headers,
        autoApprove: config.autoApprove,
        disabled: config.disabled,
        timeout: config.timeout,
      },
      {
        serverName,
        authProvider,
        fetch: customFetch,
        logger,
      }
    );

    logger?.debug?.(`[${serverName}] SSE transport created successfully`);

    // Log warning that we're using fallback
    if (!skipStreamableHttp) {
      logger?.warn(
        `[${serverName}] Connected using SSE fallback. Server may not support Streamable HTTP.`
      );
    }

    return {
      transport: result.transport,
      transportType: "sse",
      close: result.close,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    errors.push(err);
  }

  // Both transports failed
  const errorMessages = errors.map((e) => e.message).join("; ");
  throw new McpTransportError(
    `Failed to connect to remote server: ${errorMessages}`,
    serverName,
    "remote",
    {
      cause: errors[0],
      context: {
        url: config.url,
        attemptedTransports: skipStreamableHttp ? ["sse"] : ["streamableHttp", "sse"],
        errors: errors.map((e) => e.message),
      },
      isRetryable: true,
    }
  );
}

/**
 * Validates remote configuration before transport creation.
 *
 * @param config - Configuration to validate
 * @returns Array of validation error messages, empty if valid
 */
export function validateRemoteConfig(config: McpRemoteConfig): string[] {
  const errors: string[] = [];

  if (!config.url || typeof config.url !== "string") {
    errors.push("URL is required and must be a string");
  } else {
    try {
      const url = new URL(config.url);
      if (!["http:", "https:"].includes(url.protocol)) {
        errors.push("URL must use http or https protocol");
      }
    } catch {
      errors.push("URL is not a valid URL");
    }
  }

  if (
    config.headers !== undefined &&
    (typeof config.headers !== "object" || config.headers === null)
  ) {
    errors.push("Headers must be an object");
  }

  return errors;
}
