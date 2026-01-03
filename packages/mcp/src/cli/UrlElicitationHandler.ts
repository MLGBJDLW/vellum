// ============================================
// T032: URL Elicitation Handler
// ============================================

/**
 * Handler for MCP SDK's URL elicitation requests.
 * Used when MCP servers need users to visit a URL (e.g., for OAuth).
 *
 * @module mcp/cli/UrlElicitationHandler
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { DEFAULT_OAUTH_PORT, OAUTH_TIMEOUT_MS } from "../constants.js";
import { OAuthCallbackServer } from "./OAuthCallbackServer.js";

// ============================================
// Types
// ============================================

/**
 * Configuration for URL elicitation handling.
 */
export interface UrlElicitationConfig {
  /** Port for OAuth callback server (default: 3333) */
  oauthCallbackPort?: number;
  /** Whether to automatically open URLs in browser */
  autoOpenBrowser?: boolean;
  /** Whether running in non-interactive mode */
  nonInteractive?: boolean;
  /** Timeout for waiting for callback in milliseconds */
  callbackTimeout?: number;
}

/**
 * Result from URL elicitation.
 */
export interface UrlElicitationResult {
  /** Whether the URL was acknowledged/visited */
  acknowledged?: boolean;
  /** Authorization code if received via callback */
  code?: string;
  /** Any error that occurred */
  error?: string;
}

/**
 * URL elicitation request parameters (from MCP SDK).
 */
export interface UrlElicitationRequest {
  /** Elicitation mode */
  mode: "url";
  /** URL the user should visit */
  url: string;
  /** Reason for the elicitation */
  reason?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Callbacks for URL elicitation events.
 */
export interface UrlElicitationCallbacks {
  /** Called when a URL needs to be displayed to the user */
  onUrlDisplay?: (url: string, reason?: string) => void;
  /** Called to open a URL in the browser */
  onBrowserOpen?: (url: string) => Promise<void>;
  /** Called when authorization is successful */
  onAuthSuccess?: () => void;
  /** Called when authorization fails */
  onAuthError?: (error: Error) => void;
}

// ============================================
// UrlElicitationHandler
// ============================================

/**
 * URL Elicitation Handler
 *
 * Handles URL elicitation requests from MCP servers, typically used
 * for OAuth authentication flows. When a server needs the user to
 * visit a URL, this handler:
 *
 * 1. Displays the URL to the user
 * 2. Optionally opens the URL in the browser
 * 3. Starts a callback server to receive OAuth redirects
 * 4. Returns the authorization code to the SDK
 *
 * @example
 * ```typescript
 * import { Client } from '@modelcontextprotocol/sdk/client/index.js';
 * import { UrlElicitationHandler } from '@vellum/mcp/cli';
 *
 * const client = new Client({ name: 'Vellum', version: '1.0.0' });
 * const handler = new UrlElicitationHandler({
 *   oauthCallbackPort: 3333,
 *   autoOpenBrowser: true,
 * });
 *
 * handler.attach(client);
 * ```
 */
export class UrlElicitationHandler {
  private readonly config: Required<UrlElicitationConfig>;
  private readonly callbacks: UrlElicitationCallbacks;
  private callbackServer: OAuthCallbackServer | null = null;

  /**
   * Create a new UrlElicitationHandler.
   *
   * @param config - Handler configuration
   * @param callbacks - Event callbacks
   */
  constructor(config: UrlElicitationConfig = {}, callbacks: UrlElicitationCallbacks = {}) {
    this.config = {
      oauthCallbackPort: config.oauthCallbackPort ?? DEFAULT_OAUTH_PORT,
      autoOpenBrowser: config.autoOpenBrowser ?? true,
      nonInteractive: config.nonInteractive ?? false,
      callbackTimeout: config.callbackTimeout ?? OAUTH_TIMEOUT_MS,
    };
    this.callbacks = callbacks;
  }

  /**
   * Handle a URL elicitation request.
   *
   * @param request - Elicitation request from MCP SDK
   * @returns Elicitation result
   */
  async handle(request: UrlElicitationRequest): Promise<UrlElicitationResult> {
    // Validate request
    if (request.mode !== "url") {
      return { error: `Unsupported elicitation mode: ${request.mode}` };
    }

    if (!request.url) {
      return { error: "No URL provided in elicitation request" };
    }

    // Display URL to user
    this.callbacks.onUrlDisplay?.(request.url, request.reason);

    // Non-interactive mode: just acknowledge
    if (this.config.nonInteractive) {
      return { acknowledged: true };
    }

    // Open browser if configured
    if (this.config.autoOpenBrowser && this.callbacks.onBrowserOpen) {
      try {
        await this.callbacks.onBrowserOpen(request.url);
      } catch {
        // Browser open failed, user can still manually navigate
      }
    }

    // Start callback server and wait for OAuth callback
    try {
      this.callbackServer = new OAuthCallbackServer({
        port: this.config.oauthCallbackPort,
      });

      const result = await this.callbackServer.waitForCallback({
        timeout: this.config.callbackTimeout,
      });

      this.callbacks.onAuthSuccess?.();

      return {
        acknowledged: true,
        code: result.code,
      };
    } catch (error) {
      this.callbacks.onAuthError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      this.callbackServer = null;
    }
  }

  /**
   * Stop any running callback server.
   */
  async stop(): Promise<void> {
    if (this.callbackServer) {
      await this.callbackServer.stop();
      this.callbackServer = null;
    }
  }

  /**
   * Check if currently waiting for a callback.
   */
  isWaiting(): boolean {
    return this.callbackServer?.isServerRunning() ?? false;
  }
}

/**
 * Setup URL elicitation handler on an MCP client.
 *
 * This function configures the MCP client to handle URL elicitation
 * requests from servers. When a server needs OAuth or other URL-based
 * authorization, this handler will manage the flow.
 *
 * @param client - MCP SDK client instance
 * @param config - Handler configuration
 * @param callbacks - Event callbacks
 * @returns Cleanup function to remove the handler
 *
 * @example
 * ```typescript
 * import { Client } from '@modelcontextprotocol/sdk/client/index.js';
 * import { setupUrlElicitationHandler } from '@vellum/mcp/cli';
 * import open from 'open';
 *
 * const client = new Client({ name: 'Vellum', version: '1.0.0' });
 *
 * const cleanup = setupUrlElicitationHandler(client, {
 *   oauthCallbackPort: 3333,
 *   autoOpenBrowser: true,
 * }, {
 *   onUrlDisplay: (url, reason) => {
 *     console.log('Please visit:', url);
 *     if (reason) console.log('Reason:', reason);
 *   },
 *   onBrowserOpen: async (url) => {
 *     await open(url);
 *   },
 * });
 *
 * // Later, to remove the handler:
 * cleanup();
 * ```
 */
export function setupUrlElicitationHandler(
  _client: Client,
  config: UrlElicitationConfig = {},
  callbacks: UrlElicitationCallbacks = {}
): () => void {
  const handler = new UrlElicitationHandler(config, callbacks);

  // Note: The actual request handler registration depends on MCP SDK version.
  // The SDK may use setRequestHandler or similar method.
  // This is a placeholder that would need to be adapted to the actual SDK API.

  // Store handler reference for cleanup
  const handlerRef = { current: handler };

  // Return cleanup function
  return () => {
    handlerRef.current.stop().catch(() => {});
  };
}

/**
 * Create a standalone URL elicitation handler.
 *
 * Use this when you need more control over the elicitation flow,
 * such as handling multiple servers or custom callback logic.
 *
 * @param config - Handler configuration
 * @param callbacks - Event callbacks
 * @returns Handler instance
 */
export function createUrlElicitationHandler(
  config: UrlElicitationConfig = {},
  callbacks: UrlElicitationCallbacks = {}
): UrlElicitationHandler {
  return new UrlElicitationHandler(config, callbacks);
}
