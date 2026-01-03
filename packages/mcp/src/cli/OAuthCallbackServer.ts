// ============================================
// T028: OAuth Callback Server
// ============================================

/**
 * HTTP server for handling OAuth callback redirects.
 * Listens on a local port and waits for the OAuth provider
 * to redirect back with an authorization code.
 *
 * @module mcp/cli/OAuthCallbackServer
 */

import http from "node:http";
import { URL } from "node:url";
import { DEFAULT_OAUTH_PORT, OAUTH_TIMEOUT_MS } from "../constants.js";
import { OAuthTimeoutError } from "../errors.js";

// ============================================
// Types
// ============================================

/**
 * Result from a successful OAuth callback.
 */
export interface OAuthCallbackResult {
  /** Authorization code from OAuth provider */
  code: string;
  /** State parameter for CSRF validation */
  state?: string;
  /** Any additional query parameters */
  params: Record<string, string>;
}

/**
 * Options for waiting for OAuth callback.
 */
export interface WaitForCallbackOptions {
  /** Timeout in milliseconds (default: 5 minutes) */
  timeout?: number;
  /** Expected state parameter for validation */
  expectedState?: string;
}

/**
 * Configuration for OAuthCallbackServer.
 */
export interface OAuthCallbackServerConfig {
  /** Port to listen on (default: 3333) */
  port?: number;
  /** Host to bind to (default: 127.0.0.1) */
  host?: string;
  /** Path for callback endpoint (default: /oauth/callback) */
  callbackPath?: string;
}

// ============================================
// OAuthCallbackServer
// ============================================

/**
 * OAuth Callback Server
 *
 * HTTP server that listens for OAuth authorization callbacks.
 * When the OAuth provider redirects back to our callback URL,
 * this server captures the authorization code and state parameter.
 *
 * Features:
 * - Single-use server (shuts down after receiving callback)
 * - Configurable timeout with OAuthTimeoutError
 * - State parameter validation for CSRF protection
 * - HTML response pages for user feedback
 *
 * @example
 * ```typescript
 * const server = new OAuthCallbackServer({ port: 3333 });
 *
 * try {
 *   const result = await server.waitForCallback({
 *     timeout: 300000, // 5 minutes
 *     expectedState: 'my-state-param',
 *   });
 *   console.log('Authorization code:', result.code);
 * } catch (error) {
 *   if (error instanceof OAuthTimeoutError) {
 *     console.error('OAuth flow timed out');
 *   }
 * }
 * ```
 */
export class OAuthCallbackServer {
  private readonly port: number;
  private readonly host: string;
  private readonly callbackPath: string;
  private server: http.Server | null = null;
  private isRunning = false;

  /**
   * Create a new OAuthCallbackServer.
   *
   * @param config - Server configuration
   */
  constructor(config: OAuthCallbackServerConfig = {}) {
    this.port = config.port ?? DEFAULT_OAUTH_PORT;
    this.host = config.host ?? "127.0.0.1";
    this.callbackPath = config.callbackPath ?? "/oauth/callback";
  }

  /**
   * Get the full callback URL for this server.
   */
  getCallbackUrl(): string {
    return `http://${this.host}:${this.port}${this.callbackPath}`;
  }

  /**
   * Check if the server is currently running.
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Start the server and wait for an OAuth callback.
   *
   * Returns when:
   * - A valid callback is received with an authorization code
   * - The timeout expires (throws OAuthTimeoutError)
   * - An error occurs during callback processing
   *
   * @param options - Wait options including timeout and expected state
   * @returns OAuth callback result with code and state
   * @throws OAuthTimeoutError if timeout expires before callback
   */
  async waitForCallback(options: WaitForCallbackOptions = {}): Promise<OAuthCallbackResult> {
    const timeout = options.timeout ?? OAUTH_TIMEOUT_MS;

    if (this.isRunning) {
      throw new Error("Server is already running");
    }

    return new Promise<OAuthCallbackResult>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let resolved = false;

      // Set up timeout
      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.stop().catch(() => {});
          reject(
            new OAuthTimeoutError(
              `OAuth callback timed out after ${timeout}ms`,
              "oauth-callback-server"
            )
          );
        }
      }, timeout);

      // Create HTTP server
      this.server = http.createServer((req, res) => {
        // Only handle GET requests to callback path
        if (!req.url || req.method !== "GET") {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }

        // Parse URL and extract path
        const url = new URL(req.url, `http://${this.host}:${this.port}`);

        if (url.pathname !== this.callbackPath) {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }

        // Extract query parameters
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        // Handle OAuth error response
        if (error) {
          const errorMessage = errorDescription ? `${error}: ${errorDescription}` : error;

          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(this.generateErrorPage(errorMessage));

          if (!resolved) {
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            this.stop().catch(() => {});
            reject(new Error(`OAuth error: ${errorMessage}`));
          }
          return;
        }

        // Require authorization code
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(this.generateErrorPage("No authorization code received"));

          if (!resolved) {
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            this.stop().catch(() => {});
            reject(new Error("OAuth callback missing authorization code"));
          }
          return;
        }

        // Validate state if expected
        if (options.expectedState && state !== options.expectedState) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(this.generateErrorPage("Invalid state parameter"));

          if (!resolved) {
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            this.stop().catch(() => {});
            reject(new Error("OAuth state mismatch - possible CSRF attack"));
          }
          return;
        }

        // Build params object from all query parameters
        const params: Record<string, string> = {};
        url.searchParams.forEach((value, key) => {
          params[key] = value;
        });

        // Success - send response page
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(this.generateSuccessPage());

        // Resolve with result
        if (!resolved) {
          resolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          this.stop().catch(() => {});
          resolve({
            code,
            state: state ?? undefined,
            params,
          });
        }
      });

      // Handle server errors
      this.server.on("error", (error) => {
        if (!resolved) {
          resolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          reject(error);
        }
      });

      // Start listening
      this.server.listen(this.port, this.host, () => {
        this.isRunning = true;
      });
    });
  }

  /**
   * Stop the server if running.
   */
  async stop(): Promise<void> {
    if (this.server) {
      return new Promise<void>((resolve, reject) => {
        this.server?.close((err) => {
          this.server = null;
          this.isRunning = false;
          if (err) {
            // Ignore "not running" errors
            if ((err as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING") {
              resolve();
            } else {
              reject(err);
            }
          } else {
            resolve();
          }
        });
      });
    }
    this.isRunning = false;
  }

  /**
   * Generate HTML page for successful authorization.
   */
  private generateSuccessPage(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authorization Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      max-width: 400px;
    }
    .icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    h1 {
      color: #10b981;
      margin-bottom: 0.5rem;
    }
    p {
      color: #6b7280;
      margin-bottom: 1.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✅</div>
    <h1>Authorization Successful</h1>
    <p>You have been successfully authenticated.<br>You can close this window and return to Vellum.</p>
  </div>
</body>
</html>`;
  }

  /**
   * Generate HTML page for authorization error.
   */
  private generateErrorPage(error: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authorization Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      max-width: 400px;
    }
    .icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    h1 {
      color: #ef4444;
      margin-bottom: 0.5rem;
    }
    p {
      color: #6b7280;
      margin-bottom: 1rem;
    }
    .error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 6px;
      padding: 1rem;
      color: #991b1b;
      font-family: monospace;
      font-size: 0.875rem;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">❌</div>
    <h1>Authorization Failed</h1>
    <p>An error occurred during authorization.</p>
    <div class="error">${this.escapeHtml(error)}</div>
  </div>
</body>
</html>`;
  }

  /**
   * Escape HTML special characters.
   */
  private escapeHtml(text: string): string {
    const htmlEscapes: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return text.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
  }
}

// Re-export error types for convenience
export { OAuthTimeoutError } from "../errors.js";
