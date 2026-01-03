// ============================================
// T031: Dynamic Client Registration (RFC 7591)
// ============================================

/**
 * OAuth 2.0 Dynamic Client Registration implementation.
 * Implements RFC 8414 (OAuth Authorization Server Metadata)
 * and RFC 7591 (Dynamic Client Registration).
 *
 * @module mcp/oauth/DynamicClientRegistration
 */

import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";

// ============================================
// Types
// ============================================

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 */
export interface AuthorizationServerMetadata {
  /** URL of the authorization endpoint */
  authorization_endpoint: string;
  /** URL of the token endpoint */
  token_endpoint: string;
  /** URL of the registration endpoint (RFC 7591) */
  registration_endpoint?: string;
  /** URL of the revocation endpoint */
  revocation_endpoint?: string;
  /** URL of the introspection endpoint */
  introspection_endpoint?: string;
  /** URL of the JWKS endpoint */
  jwks_uri?: string;
  /** Issuer identifier */
  issuer: string;
  /** Supported response types */
  response_types_supported?: string[];
  /** Supported grant types */
  grant_types_supported?: string[];
  /** Supported scopes */
  scopes_supported?: string[];
  /** Supported token endpoint auth methods */
  token_endpoint_auth_methods_supported?: string[];
  /** Supported code challenge methods (PKCE) */
  code_challenge_methods_supported?: string[];
  /** Whether PKCE is required */
  require_pkce?: boolean;
}

/**
 * Dynamic Client Registration request (RFC 7591).
 */
export interface ClientRegistrationRequest extends OAuthClientMetadata {
  /** Initial access token (if required by server) */
  initial_access_token?: string;
}

/**
 * Dynamic Client Registration response (RFC 7591).
 */
export interface ClientRegistrationResponse extends OAuthClientInformationFull {
  /** Registration access token for management */
  registration_access_token?: string;
  /** Client configuration endpoint */
  registration_client_uri?: string;
}

/**
 * Configuration for DynamicClientRegistration.
 */
export interface DynamicClientRegistrationConfig {
  /** Custom fetch implementation (for testing) */
  fetch?: typeof globalThis.fetch;
  /** Timeout for HTTP requests in milliseconds */
  timeout?: number;
  /** Whether to cache metadata */
  cacheMetadata?: boolean;
}

/**
 * Cached client information.
 */
export interface CachedClientInfo {
  /** Client information */
  clientInfo: OAuthClientInformationFull;
  /** Server URL this client was registered with */
  serverUrl: string;
  /** When the cache was created */
  cachedAt: number;
  /** When the client secret expires (if applicable) */
  clientSecretExpiresAt?: number;
}

// ============================================
// DynamicClientRegistration
// ============================================

/**
 * Dynamic Client Registration handler.
 *
 * Implements OAuth 2.0 Dynamic Client Registration Protocol (RFC 7591)
 * with Authorization Server Metadata discovery (RFC 8414).
 *
 * Features:
 * - Automatic metadata discovery from `.well-known/oauth-authorization-server`
 * - RFC 7591 compliant client registration
 * - Client ID caching to avoid repeated registrations
 * - Automatic cache invalidation on client secret expiry
 *
 * @example
 * ```typescript
 * const dcr = new DynamicClientRegistration();
 *
 * // Discover server metadata
 * const metadata = await dcr.discoverMetadata('https://mcp.example.com');
 *
 * // Register a new client
 * const clientInfo = await dcr.registerClient('https://mcp.example.com', {
 *   redirect_uris: ['http://127.0.0.1:3333/oauth/callback'],
 *   client_name: 'Vellum',
 *   grant_types: ['authorization_code', 'refresh_token'],
 * });
 * ```
 */
export class DynamicClientRegistration {
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeout: number;
  private readonly cacheMetadata: boolean;
  private readonly metadataCache: Map<string, AuthorizationServerMetadata> = new Map();
  private readonly clientCache: Map<string, CachedClientInfo> = new Map();

  /**
   * Create a new DynamicClientRegistration handler.
   *
   * @param config - Configuration options
   */
  constructor(config: DynamicClientRegistrationConfig = {}) {
    this.fetch = config.fetch ?? globalThis.fetch;
    this.timeout = config.timeout ?? 30000;
    this.cacheMetadata = config.cacheMetadata ?? true;
  }

  /**
   * Discover OAuth Authorization Server Metadata (RFC 8414).
   *
   * Looks for metadata at `.well-known/oauth-authorization-server` path.
   *
   * @param serverUrl - Base URL of the OAuth server
   * @returns Authorization server metadata
   * @throws Error if metadata cannot be fetched or is invalid
   */
  async discoverMetadata(serverUrl: string): Promise<AuthorizationServerMetadata> {
    const normalizedUrl = this.normalizeUrl(serverUrl);

    // Check cache first
    if (this.cacheMetadata) {
      const cached = this.metadataCache.get(normalizedUrl);
      if (cached) {
        return cached;
      }
    }

    // Build well-known URL
    const url = new URL(normalizedUrl);
    url.pathname = "/.well-known/oauth-authorization-server";

    try {
      const response = await this.fetchWithTimeout(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
      }

      const metadata = (await response.json()) as AuthorizationServerMetadata;

      // Validate required fields
      this.validateMetadata(metadata);

      // Cache metadata
      if (this.cacheMetadata) {
        this.metadataCache.set(normalizedUrl, metadata);
      }

      return metadata;
    } catch (error) {
      // Try alternative path (.well-known/openid-configuration)
      return this.tryAlternativeDiscovery(normalizedUrl);
    }
  }

  /**
   * Try alternative metadata discovery path (OpenID Connect).
   */
  private async tryAlternativeDiscovery(serverUrl: string): Promise<AuthorizationServerMetadata> {
    const url = new URL(serverUrl);
    url.pathname = "/.well-known/openid-configuration";

    const response = await this.fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to discover authorization server metadata for ${serverUrl}. ` +
          `Neither .well-known/oauth-authorization-server nor .well-known/openid-configuration found.`
      );
    }

    const metadata = (await response.json()) as AuthorizationServerMetadata;
    this.validateMetadata(metadata);

    if (this.cacheMetadata) {
      this.metadataCache.set(serverUrl, metadata);
    }

    return metadata;
  }

  /**
   * Validate authorization server metadata.
   */
  private validateMetadata(metadata: AuthorizationServerMetadata): void {
    if (!metadata.authorization_endpoint) {
      throw new Error("Invalid metadata: missing authorization_endpoint");
    }
    if (!metadata.token_endpoint) {
      throw new Error("Invalid metadata: missing token_endpoint");
    }
    if (!metadata.issuer) {
      throw new Error("Invalid metadata: missing issuer");
    }
  }

  /**
   * Register a new OAuth client (RFC 7591).
   *
   * @param serverUrl - Base URL of the OAuth server
   * @param clientMetadata - Client metadata for registration
   * @param initialAccessToken - Optional initial access token
   * @returns Registered client information
   * @throws Error if registration fails
   */
  async registerClient(
    serverUrl: string,
    clientMetadata: OAuthClientMetadata,
    initialAccessToken?: string
  ): Promise<OAuthClientInformationFull> {
    const normalizedUrl = this.normalizeUrl(serverUrl);
    const cacheKey = this.getClientCacheKey(normalizedUrl, clientMetadata);

    // Check cache for existing client
    const cached = this.getClientFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Discover metadata to find registration endpoint
    const metadata = await this.discoverMetadata(serverUrl);

    if (!metadata.registration_endpoint) {
      throw new Error(
        `Authorization server at ${serverUrl} does not support dynamic client registration ` +
          "(no registration_endpoint in metadata)"
      );
    }

    // Build registration request
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (initialAccessToken) {
      headers["Authorization"] = `Bearer ${initialAccessToken}`;
    }

    const response = await this.fetchWithTimeout(metadata.registration_endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(clientMetadata),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Client registration failed: ${response.status} ${response.statusText}. ` +
          `Response: ${errorBody}`
      );
    }

    const registrationResponse = (await response.json()) as ClientRegistrationResponse;

    // Validate response
    if (!registrationResponse.client_id) {
      throw new Error("Invalid registration response: missing client_id");
    }

    // Cache the client info
    this.cacheClientInfo(cacheKey, normalizedUrl, registrationResponse);

    return registrationResponse;
  }

  /**
   * Get cached client information, if valid.
   *
   * @param serverUrl - Server URL
   * @param clientMetadata - Client metadata (for cache key)
   * @returns Cached client info or undefined
   */
  getCachedClient(
    serverUrl: string,
    clientMetadata: OAuthClientMetadata
  ): OAuthClientInformationFull | undefined {
    const normalizedUrl = this.normalizeUrl(serverUrl);
    const cacheKey = this.getClientCacheKey(normalizedUrl, clientMetadata);
    return this.getClientFromCache(cacheKey);
  }

  /**
   * Clear cached client information.
   *
   * @param serverUrl - Server URL
   * @param clientMetadata - Client metadata (for cache key)
   */
  clearCachedClient(serverUrl: string, clientMetadata: OAuthClientMetadata): void {
    const normalizedUrl = this.normalizeUrl(serverUrl);
    const cacheKey = this.getClientCacheKey(normalizedUrl, clientMetadata);
    this.clientCache.delete(cacheKey);
  }

  /**
   * Clear all caches.
   */
  clearAllCaches(): void {
    this.metadataCache.clear();
    this.clientCache.clear();
  }

  /**
   * Normalize a URL for caching.
   */
  private normalizeUrl(url: string): string {
    const parsed = new URL(url);
    // Remove trailing slash
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, "")}`;
  }

  /**
   * Generate a cache key for client info.
   */
  private getClientCacheKey(serverUrl: string, metadata: OAuthClientMetadata): string {
    // Use server URL + redirect URIs + client name as cache key
    const redirects = metadata.redirect_uris?.sort().join(",") ?? "";
    const name = metadata.client_name ?? "";
    return `${serverUrl}:${redirects}:${name}`;
  }

  /**
   * Get client from cache if still valid.
   */
  private getClientFromCache(cacheKey: string): OAuthClientInformationFull | undefined {
    const cached = this.clientCache.get(cacheKey);
    if (!cached) {
      return undefined;
    }

    // Check if client secret has expired
    if (cached.clientSecretExpiresAt && cached.clientSecretExpiresAt < Date.now() / 1000) {
      this.clientCache.delete(cacheKey);
      return undefined;
    }

    return cached.clientInfo;
  }

  /**
   * Cache client information.
   */
  private cacheClientInfo(
    cacheKey: string,
    serverUrl: string,
    clientInfo: OAuthClientInformationFull
  ): void {
    this.clientCache.set(cacheKey, {
      clientInfo,
      serverUrl,
      cachedAt: Date.now(),
      clientSecretExpiresAt: clientInfo.client_secret_expires_at,
    });
  }

  /**
   * Fetch with timeout support.
   */
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create a DynamicClientRegistration instance with default configuration.
 */
export function createDynamicClientRegistration(
  config?: DynamicClientRegistrationConfig
): DynamicClientRegistration {
  return new DynamicClientRegistration(config);
}
