// ============================================
// T017: Streamable HTTP Transport Adapter
// ============================================

import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { McpTransportError } from "../errors.js";
import type { McpStreamableHttpConfig } from "../types.js";

/**
 * Options for Streamable HTTP transport creation.
 */
export interface StreamableHttpTransportOptions {
  /** Server name for error context */
  serverName: string;
  /** OAuth provider for authenticated connections */
  authProvider?: OAuthClientProvider;
  /** Custom fetch implementation (for testing) */
  fetch?: typeof globalThis.fetch;
}

/**
 * Result from creating a Streamable HTTP transport.
 */
export interface StreamableHttpTransportResult {
  /** The transport instance */
  transport: Transport;
  /** Close handler to clean up resources */
  close: () => Promise<void>;
}

/**
 * Creates an MCP transport for Streamable HTTP-based remote servers.
 *
 * This is the preferred transport for remote MCP servers as it supports
 * bidirectional streaming and is more efficient than SSE.
 *
 * @param config - Streamable HTTP server configuration
 * @param options - Transport options including auth provider
 * @returns Transport instance ready for MCP client connection
 *
 * @example
 * ```typescript
 * const { transport } = await createStreamableHttpTransport(
 *   { type: "streamableHttp", url: "https://mcp.example.com/api" },
 *   { serverName: "remote-server", authProvider: oauthProvider }
 * );
 * ```
 */
export async function createStreamableHttpTransport(
  config: McpStreamableHttpConfig,
  options: StreamableHttpTransportOptions
): Promise<StreamableHttpTransportResult> {
  const { serverName, authProvider, fetch: customFetch } = options;

  try {
    // Parse and validate the URL
    const url = new URL(config.url);

    // Build transport options
    const transportOptions: StreamableHTTPClientTransportOptions = {
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

    // Create the Streamable HTTP transport
    const transport = new StreamableHTTPClientTransport(url, transportOptions);

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
      error instanceof Error ? error.message : "Unknown error creating Streamable HTTP transport";
    throw new McpTransportError(message, serverName, "streamableHttp", {
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
 * Validates Streamable HTTP configuration before transport creation.
 *
 * @param config - Configuration to validate
 * @returns Array of validation error messages, empty if valid
 */
export function validateStreamableHttpConfig(config: McpStreamableHttpConfig): string[] {
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
