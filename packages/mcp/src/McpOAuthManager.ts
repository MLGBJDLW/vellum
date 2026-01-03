// ============================================
// T027, T029, T030: MCP OAuth Manager
// ============================================

/**
 * OAuth manager for MCP server authentication.
 * Integrates with CredentialManager for secure token storage
 * and RefreshTimer for automatic token refresh.
 *
 * @module mcp/McpOAuthManager
 */

import crypto from "node:crypto";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { DEFAULT_OAUTH_PORT, OAUTH_TIMEOUT_MS } from "./constants.js";

// ============================================
// Types
// ============================================

/**
 * Interface for credential manager integration.
 * Matches the subset of CredentialManager API needed for OAuth.
 */
export interface OAuthCredentialManager {
  /**
   * Resolve a credential by key.
   * @param key - Credential key in format `mcp:<serverId>`
   * @returns Credential object or null if not found
   */
  resolve(key: string): Promise<OAuthStoredCredential | null>;

  /**
   * Store a credential.
   * @param input - Credential input data
   * @param key - Optional storage key
   * @returns Result with stored credential
   */
  store(input: OAuthCredentialInput, key?: string): Promise<void>;

  /**
   * Delete a credential.
   * @param key - Credential key to delete
   */
  delete(key: string): Promise<void>;
}

/**
 * Stored OAuth credential structure.
 */
export interface OAuthStoredCredential {
  /** Provider identifier */
  provider: string;
  /** Credential type */
  type: "oauth_token";
  /** Access token */
  value: string;
  /** Token expiration time */
  expiresAt?: Date;
  /** Credential metadata */
  metadata?: {
    /** Refresh token for token renewal */
    refreshToken?: string;
    /** OAuth scopes */
    scopes?: string[];
    /** Token type (usually 'Bearer') */
    tokenType?: string;
  };
}

/**
 * Input for storing OAuth credentials.
 */
export interface OAuthCredentialInput {
  /** Provider identifier */
  provider: string;
  /** Credential type */
  type: "oauth_token";
  /** Access token value */
  value: string;
  /** Token expiration time */
  expiresAt?: Date;
  /** Additional metadata */
  metadata?: {
    refreshToken?: string;
    scopes?: string[];
    tokenType?: string;
  };
}

/**
 * OAuth result from authorization flow.
 */
export interface OAuthResult {
  /** Access token */
  access_token: string;
  /** Token type (usually 'Bearer') */
  token_type: string;
  /** Token expiration in seconds */
  expires_in?: number;
  /** Refresh token for renewal */
  refresh_token?: string;
  /** Granted scopes (space-separated) */
  scope?: string;
}

/**
 * Configuration for McpOAuthManager.
 */
export interface McpOAuthManagerConfig {
  /** OAuth callback port (default: 3333) */
  oauthCallbackPort?: number;
  /** Whether to auto-open browser for OAuth */
  autoOpenBrowser?: boolean;
  /** Whether running in non-interactive mode */
  nonInteractive?: boolean;
  /** Client name for OAuth metadata */
  clientName?: string;
  /** Client URI for OAuth metadata */
  clientUri?: string;
}

/**
 * OAuth provider internal data stored per server.
 */
interface ProviderData {
  /** Server name */
  serverName: string;
  /** Server URL */
  serverUrl: string;
  /** Client information (from dynamic registration) */
  clientInfo?: OAuthClientInformationFull;
  /** PKCE code verifier */
  codeVerifier?: string;
  /** OAuth state parameter */
  oauthState?: string;
  /** When state was generated */
  oauthStateTimestamp?: number;
  /** Pending authorization URL */
  pendingAuthUrl?: string;
}

/**
 * Refresh timer interface (minimal API needed).
 */
export interface OAuthRefreshTimer {
  /**
   * Start the refresh timer for a token.
   * @param expiresAt - Token expiration time
   * @param refreshCallback - Callback to perform token refresh
   */
  start(expiresAt: Date, refreshCallback: () => Promise<Date | null>): void;

  /**
   * Stop the refresh timer.
   */
  stop(): void;

  /**
   * Check if timer is running.
   */
  isRunning(): boolean;
}

// ============================================
// VellumOAuthClientProvider
// ============================================

/**
 * Implementation of OAuthClientProvider for Vellum.
 * Manages OAuth state and token storage for a single MCP server.
 */
export class VellumOAuthClientProvider implements OAuthClientProvider {
  private readonly serverName: string;
  private readonly serverId: string;
  private readonly config: McpOAuthManagerConfig;
  private readonly credentialManager?: OAuthCredentialManager;
  private readonly providerData: ProviderData;

  constructor(
    serverName: string,
    serverUrl: string,
    config: McpOAuthManagerConfig,
    credentialManager?: OAuthCredentialManager
  ) {
    this.serverName = serverName;
    this.serverUrl = serverUrl;
    this.serverId = this.generateServerId(serverName, serverUrl);
    this.config = config;
    this.credentialManager = credentialManager;
    this.providerData = {
      serverName,
      serverUrl,
    };
  }

  /**
   * Generate a stable server ID from name and URL.
   */
  private generateServerId(name: string, url: string): string {
    const hash = crypto.createHash("sha256").update(`${name}:${url}`).digest("hex").slice(0, 16);
    return `${name}-${hash}`;
  }

  /**
   * Get the credential key for this server.
   */
  getCredentialKey(): string {
    return `mcp:${this.serverId}`;
  }

  /**
   * Redirect URL for OAuth callback.
   */
  get redirectUrl(): string {
    const port = this.config.oauthCallbackPort ?? DEFAULT_OAUTH_PORT;
    return `http://127.0.0.1:${port}/oauth/callback`;
  }

  /**
   * OAuth client metadata for dynamic registration.
   */
  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: this.config.clientName ?? "Vellum",
      client_uri: this.config.clientUri ?? "https://vellum.dev",
      software_id: "vellum-cli",
    };
  }

  /**
   * Get stored client information (from dynamic registration).
   */
  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    return this.providerData.clientInfo
      ? {
          client_id: this.providerData.clientInfo.client_id,
          client_secret: this.providerData.clientInfo.client_secret,
        }
      : undefined;
  }

  /**
   * Save client information from dynamic registration.
   */
  async saveClientInformation(clientInfo: OAuthClientInformationFull): Promise<void> {
    this.providerData.clientInfo = clientInfo;
  }

  /**
   * Get stored OAuth tokens.
   */
  async tokens(): Promise<OAuthTokens | undefined> {
    if (!this.credentialManager) {
      return undefined;
    }

    const key = this.getCredentialKey();
    const credential = await this.credentialManager.resolve(key);

    if (!credential || credential.type !== "oauth_token") {
      return undefined;
    }

    // Check if token is expired but has refresh token
    if (credential.expiresAt) {
      const isExpired = credential.expiresAt.getTime() < Date.now();
      if (isExpired && !credential.metadata?.refreshToken) {
        return undefined;
      }
    }

    // Calculate expires_in from expiresAt
    const expiresIn = credential.expiresAt
      ? Math.max(0, Math.floor((credential.expiresAt.getTime() - Date.now()) / 1000))
      : undefined;

    return {
      access_token: credential.value,
      token_type: credential.metadata?.tokenType ?? "Bearer",
      refresh_token: credential.metadata?.refreshToken,
      expires_in: expiresIn,
      scope: credential.metadata?.scopes?.join(" "),
    };
  }

  /**
   * Save OAuth tokens to credential manager.
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    if (!this.credentialManager) {
      return;
    }

    const key = this.getCredentialKey();
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : undefined;

    await this.credentialManager.store(
      {
        provider: key,
        type: "oauth_token",
        value: tokens.access_token,
        expiresAt,
        metadata: {
          refreshToken: tokens.refresh_token,
          scopes: tokens.scope?.split(" ").filter(Boolean),
          tokenType: tokens.token_type,
        },
      },
      key
    );
  }

  /**
   * Handle redirect to authorization URL.
   * Stores the URL for later use instead of immediately opening browser.
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    // Generate and add state parameter for CSRF protection
    const state = crypto.randomBytes(32).toString("hex");
    authorizationUrl.searchParams.set("state", state);

    // Store state and URL for later use
    this.providerData.oauthState = state;
    this.providerData.oauthStateTimestamp = Date.now();
    this.providerData.pendingAuthUrl = authorizationUrl.toString();
  }

  /**
   * Save PKCE code verifier.
   */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this.providerData.codeVerifier = codeVerifier;
  }

  /**
   * Get stored PKCE code verifier.
   */
  async codeVerifier(): Promise<string> {
    if (!this.providerData.codeVerifier) {
      throw new Error(`No code verifier found for ${this.serverName}`);
    }
    return this.providerData.codeVerifier;
  }

  /**
   * Get pending authorization URL.
   */
  getPendingAuthUrl(): string | undefined {
    return this.providerData.pendingAuthUrl;
  }

  /**
   * Get stored OAuth state.
   */
  getOAuthState(): string | undefined {
    return this.providerData.oauthState;
  }

  /**
   * Validate and clear OAuth state.
   * @returns true if state matches, false otherwise
   */
  validateAndClearState(state: string, maxAgeMs: number = OAUTH_TIMEOUT_MS): boolean {
    if (!this.providerData.oauthState) {
      return false;
    }

    // Check state expiration
    if (this.providerData.oauthStateTimestamp) {
      if (Date.now() - this.providerData.oauthStateTimestamp > maxAgeMs) {
        this.clearOAuthState();
        return false;
      }
    }

    // Validate state matches
    const isValid = this.providerData.oauthState === state;

    // Clear state after validation
    this.clearOAuthState();

    return isValid;
  }

  /**
   * Clear OAuth state and pending URL.
   */
  clearOAuthState(): void {
    this.providerData.oauthState = undefined;
    this.providerData.oauthStateTimestamp = undefined;
    this.providerData.pendingAuthUrl = undefined;
  }

  /**
   * Check if provider has valid tokens.
   */
  async isAuthenticated(): Promise<boolean> {
    const tokenData = await this.tokens();
    return Boolean(tokenData?.access_token);
  }
}

// ============================================
// McpOAuthManager
// ============================================

/**
 * McpOAuthManager - Central manager for MCP OAuth authentication.
 *
 * Provides:
 * - OAuth provider creation and management
 * - Token storage via CredentialManager integration
 * - Automatic token refresh via RefreshTimer
 * - OAuth flow initiation and completion
 *
 * @example
 * ```typescript
 * const manager = new McpOAuthManager(credentialManager, refreshTimer, {
 *   oauthCallbackPort: 3333,
 *   autoOpenBrowser: true,
 * });
 *
 * // Get or create provider for a server
 * const provider = await manager.getOrCreateProvider('my-server', 'https://mcp.example.com');
 *
 * // Initiate OAuth flow
 * const authUrl = await manager.initiateOAuth('my-server', 'https://mcp.example.com');
 *
 * // Store OAuth result after callback
 * await manager.storeOAuthResult('my-server', 'https://mcp.example.com', oauthResult);
 * ```
 */
export class McpOAuthManager {
  private readonly providers: Map<string, VellumOAuthClientProvider> = new Map();
  private readonly refreshTimers: Map<string, OAuthRefreshTimer> = new Map();
  private readonly credentialManager?: OAuthCredentialManager;
  private readonly config: McpOAuthManagerConfig;
  private readonly createRefreshTimer?: () => OAuthRefreshTimer;

  /**
   * Create a new McpOAuthManager.
   *
   * @param credentialManager - Credential manager for token storage
   * @param config - OAuth configuration
   * @param createRefreshTimer - Factory for creating refresh timers
   */
  constructor(
    credentialManager?: OAuthCredentialManager,
    config: McpOAuthManagerConfig = {},
    createRefreshTimer?: () => OAuthRefreshTimer
  ) {
    this.credentialManager = credentialManager;
    this.config = config;
    this.createRefreshTimer = createRefreshTimer;
  }

  /**
   * Generate provider key from server name and URL.
   */
  private getProviderKey(serverName: string, serverUrl: string): string {
    return `${serverName}:${serverUrl}`;
  }

  /**
   * Get or create an OAuthClientProvider for a server.
   *
   * @param serverName - Server name
   * @param serverUrl - Server URL
   * @returns OAuth provider instance
   */
  async getOrCreateProvider(serverName: string, serverUrl: string): Promise<OAuthClientProvider> {
    const key = this.getProviderKey(serverName, serverUrl);

    if (this.providers.has(key)) {
      return this.providers.get(key)!;
    }

    const provider = new VellumOAuthClientProvider(
      serverName,
      serverUrl,
      this.config,
      this.credentialManager
    );

    this.providers.set(key, provider);
    return provider;
  }

  /**
   * Get an existing provider.
   *
   * @param serverName - Server name
   * @param serverUrl - Server URL
   * @returns Provider if exists, undefined otherwise
   */
  getProvider(serverName: string, serverUrl: string): VellumOAuthClientProvider | undefined {
    const key = this.getProviderKey(serverName, serverUrl);
    return this.providers.get(key);
  }

  /**
   * Initiate OAuth flow for a server.
   * Returns the authorization URL for the user to visit.
   *
   * @param serverName - Server name
   * @param serverUrl - Server URL
   * @returns Authorization URL
   * @throws Error if no pending auth URL is available
   */
  async initiateOAuth(serverName: string, serverUrl: string): Promise<string> {
    const provider = (await this.getOrCreateProvider(
      serverName,
      serverUrl
    )) as VellumOAuthClientProvider;

    const pendingUrl = provider.getPendingAuthUrl();
    if (!pendingUrl) {
      throw new Error(
        `No pending authorization URL for ${serverName}. ` +
          "The server may not require OAuth or connection hasn't been attempted yet."
      );
    }

    return pendingUrl;
  }

  /**
   * Get access token for a server.
   * Returns undefined if no valid token is available.
   *
   * @param serverName - Server name
   * @param serverUrl - Server URL
   * @returns Access token or undefined
   */
  async getAccessToken(serverName: string, serverUrl: string): Promise<string | undefined> {
    const provider = this.getProvider(serverName, serverUrl);
    if (!provider) {
      return undefined;
    }

    const tokens = await provider.tokens();
    return tokens?.access_token;
  }

  /**
   * Store OAuth result after successful authorization.
   * Sets up automatic token refresh if refresh_token is present.
   *
   * @param serverName - Server name
   * @param serverUrl - Server URL
   * @param result - OAuth result from authorization
   */
  async storeOAuthResult(
    serverName: string,
    serverUrl: string,
    result: OAuthResult
  ): Promise<void> {
    const provider = (await this.getOrCreateProvider(
      serverName,
      serverUrl
    )) as VellumOAuthClientProvider;

    // Store tokens via provider (which uses credential manager)
    await provider.saveTokens({
      access_token: result.access_token,
      token_type: result.token_type,
      expires_in: result.expires_in,
      refresh_token: result.refresh_token,
      scope: result.scope,
    });

    // Set up refresh timer if we have a refresh token and expiry
    if (result.refresh_token && result.expires_in && this.createRefreshTimer) {
      const key = this.getProviderKey(serverName, serverUrl);
      const expiresAt = new Date(Date.now() + result.expires_in * 1000);

      // Stop existing timer if any
      const existingTimer = this.refreshTimers.get(key);
      if (existingTimer) {
        existingTimer.stop();
      }

      // Create and start new timer
      const timer = this.createRefreshTimer();
      timer.start(expiresAt, async () => {
        // Refresh callback - would need to implement actual refresh logic
        // This is a placeholder that returns null to indicate refresh not supported
        // In production, this would call the OAuth server's token endpoint
        return null;
      });

      this.refreshTimers.set(key, timer);
    }
  }

  /**
   * Validate OAuth state from callback.
   *
   * @param serverName - Server name
   * @param serverUrl - Server URL
   * @param state - State parameter from callback
   * @returns true if state is valid
   */
  validateOAuthState(serverName: string, serverUrl: string, state: string): boolean {
    const provider = this.getProvider(serverName, serverUrl);
    if (!provider) {
      return false;
    }
    return provider.validateAndClearState(state);
  }

  /**
   * Clear all OAuth data for a server.
   *
   * @param serverName - Server name
   * @param serverUrl - Server URL
   */
  async clearServerAuth(serverName: string, serverUrl: string): Promise<void> {
    const key = this.getProviderKey(serverName, serverUrl);
    const provider = this.providers.get(key);

    if (provider) {
      // Clear from credential manager
      if (this.credentialManager) {
        const credentialKey = provider.getCredentialKey();
        await this.credentialManager.delete(credentialKey);
      }

      // Clear OAuth state
      provider.clearOAuthState();

      // Remove provider
      this.providers.delete(key);
    }

    // Stop and remove refresh timer
    const timer = this.refreshTimers.get(key);
    if (timer) {
      timer.stop();
      this.refreshTimers.delete(key);
    }
  }

  /**
   * Check if a server has valid authentication.
   *
   * @param serverName - Server name
   * @param serverUrl - Server URL
   * @returns true if authenticated
   */
  async isAuthenticated(serverName: string, serverUrl: string): Promise<boolean> {
    const provider = this.getProvider(serverName, serverUrl);
    if (!provider) {
      return false;
    }
    return provider.isAuthenticated();
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    // Stop all refresh timers
    for (const timer of this.refreshTimers.values()) {
      timer.stop();
    }
    this.refreshTimers.clear();
    this.providers.clear();
  }
}
