// ============================================
// T018: SSE Transport Adapter (Deprecated)
// ============================================

import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  SSEClientTransport,
  type SSEClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { McpTransportError } from "../errors.js";
import type { McpSseConfig } from "../types.js";

/**
 * Options for SSE transport creation.
 */
export interface SSETransportOptions {
  /** Server name for error context */
  serverName: string;
  /** OAuth provider for authenticated connections */
  authProvider?: OAuthClientProvider;
  /** Custom fetch implementation (for testing) */
  fetch?: typeof globalThis.fetch;
  /** Logger for deprecation warning */
  logger?: {
    warn: (message: string) => void;
  };
}

/**
 * Result from creating an SSE transport.
 */
export interface SSETransportResult {
  /** The transport instance */
  transport: Transport;
  /** Close handler to clean up resources */
  close: () => Promise<void>;
}

/**
 * Creates an MCP transport for SSE-based remote servers.
 *
 * @deprecated SSE transport is deprecated. Use Streamable HTTP (`createStreamableHttpTransport`)
 * for new remote server connections. SSE is maintained for backward compatibility
 * with older MCP servers that don't support Streamable HTTP.
 *
 * @param config - SSE server configuration
 * @param options - Transport options including auth provider
 * @returns Transport instance ready for MCP client connection
 *
 * @example
 * ```typescript
 * const { transport } = await createSSETransport(
 *   { type: "sse", url: "https://mcp.example.com/sse" },
 *   { serverName: "legacy-server", logger: console }
 * );
 * ```
 */
export async function createSSETransport(
  config: McpSseConfig,
  options: SSETransportOptions
): Promise<SSETransportResult> {
  const { serverName, authProvider, fetch: customFetch, logger } = options;

  // Log deprecation warning
  if (logger) {
    logger.warn(
      `[${serverName}] SSE transport is deprecated. Consider migrating to Streamable HTTP for better performance.`
    );
  }

  try {
    // Parse and validate the URL
    const url = new URL(config.url);

    // Build transport options
    const transportOptions: SSEClientTransportOptions = {
      // Pass auth provider if provided
      ...(authProvider && { authProvider }),
      // Pass custom fetch if provided (for testing)
      ...(customFetch && { fetch: customFetch }),
    };

    // Add custom headers if provided
    if (config.headers && Object.keys(config.headers).length > 0) {
      transportOptions.requestInit = {
        headers: config.headers,
      };
    }

    // Create the SSE transport
    const transport = new SSEClientTransport(url, transportOptions);

    const close = async () => {
      try {
        await transport.close();
      } catch {
        // Ignore close errors
      }
    };

    return { transport, close };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error creating SSE transport";
    throw new McpTransportError(message, serverName, "sse", {
      cause: error instanceof Error ? error : undefined,
      context: {
        url: config.url,
        hasHeaders: Boolean(config.headers),
        hasAuthProvider: Boolean(authProvider),
      },
    });
  }
}

/**
 * Validates SSE configuration before transport creation.
 *
 * @param config - Configuration to validate
 * @returns Array of validation error messages, empty if valid
 */
export function validateSseConfig(config: McpSseConfig): string[] {
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
