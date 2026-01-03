// ============================================
// T033: OAuth Unit Tests
// ============================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthCallbackServer } from "../cli/OAuthCallbackServer.js";
import { DEFAULT_OAUTH_PORT, OAUTH_TIMEOUT_MS } from "../constants.js";
import { OAuthTimeoutError } from "../errors.js";
import {
  McpOAuthManager,
  type OAuthCredentialManager,
  type OAuthRefreshTimer,
  type OAuthStoredCredential,
  VellumOAuthClientProvider,
} from "../McpOAuthManager.js";
import {
  type AuthorizationServerMetadata,
  DynamicClientRegistration,
} from "../oauth/DynamicClientRegistration.js";

// ============================================
// Mock Helpers
// ============================================

/**
 * Create a mock credential manager.
 */
function createMockCredentialManager(): OAuthCredentialManager & {
  credentials: Map<string, OAuthStoredCredential>;
} {
  const credentials = new Map<string, OAuthStoredCredential>();
  return {
    credentials,
    resolve: vi.fn(async (key: string) => credentials.get(key) ?? null),
    store: vi.fn(async (input) => {
      credentials.set(input.provider, input as OAuthStoredCredential);
    }),
    delete: vi.fn(async (key: string) => {
      credentials.delete(key);
    }),
  };
}

/**
 * Create a mock refresh timer.
 */
function createMockRefreshTimer(): OAuthRefreshTimer & {
  _started: boolean;
  _expiresAt: Date | null;
} {
  return {
    _started: false,
    _expiresAt: null,
    start: vi.fn(function (this: { _started: boolean; _expiresAt: Date | null }, expiresAt: Date) {
      this._started = true;
      this._expiresAt = expiresAt;
    }),
    stop: vi.fn(function (this: { _started: boolean }) {
      this._started = false;
    }),
    isRunning: vi.fn(function (this: { _started: boolean }) {
      return this._started;
    }),
  };
}

// ============================================
// VellumOAuthClientProvider Tests
// ============================================

describe("VellumOAuthClientProvider", () => {
  const serverName = "test-server";
  const serverUrl = "https://mcp.example.com";

  describe("constructor", () => {
    it("should create provider with correct properties", () => {
      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {});

      expect(provider.redirectUrl).toContain(`http://127.0.0.1:${DEFAULT_OAUTH_PORT}`);
      expect(provider.clientMetadata.client_name).toBe("Vellum");
      expect(provider.clientMetadata.grant_types).toContain("authorization_code");
    });

    it("should use custom callback port", () => {
      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {
        oauthCallbackPort: 4444,
      });

      expect(provider.redirectUrl).toBe("http://127.0.0.1:4444/oauth/callback");
    });

    it("should use custom client name", () => {
      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {
        clientName: "CustomApp",
        clientUri: "https://custom.app",
      });

      expect(provider.clientMetadata.client_name).toBe("CustomApp");
      expect(provider.clientMetadata.client_uri).toBe("https://custom.app");
    });
  });

  describe("getCredentialKey", () => {
    it("should generate stable credential key", () => {
      const provider1 = new VellumOAuthClientProvider(serverName, serverUrl, {});
      const provider2 = new VellumOAuthClientProvider(serverName, serverUrl, {});

      expect(provider1.getCredentialKey()).toBe(provider2.getCredentialKey());
      expect(provider1.getCredentialKey()).toMatch(/^mcp:test-server-[a-f0-9]+$/);
    });

    it("should generate different keys for different servers", () => {
      const provider1 = new VellumOAuthClientProvider("server-1", serverUrl, {});
      const provider2 = new VellumOAuthClientProvider("server-2", serverUrl, {});

      expect(provider1.getCredentialKey()).not.toBe(provider2.getCredentialKey());
    });
  });

  describe("tokens", () => {
    it("should return undefined when no credential manager", async () => {
      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {});

      const tokens = await provider.tokens();

      expect(tokens).toBeUndefined();
    });

    it("should return tokens from credential manager", async () => {
      const credManager = createMockCredentialManager();
      const key = new VellumOAuthClientProvider(serverName, serverUrl, {}).getCredentialKey();

      credManager.credentials.set(key, {
        provider: key,
        type: "oauth_token",
        value: "access-token-123",
        expiresAt: new Date(Date.now() + 3600000),
        metadata: {
          refreshToken: "refresh-token-123",
          scopes: ["read", "write"],
          tokenType: "Bearer",
        },
      });

      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {}, credManager);

      const tokens = await provider.tokens();

      expect(tokens).toBeDefined();
      expect(tokens!.access_token).toBe("access-token-123");
      expect(tokens!.refresh_token).toBe("refresh-token-123");
      expect(tokens!.token_type).toBe("Bearer");
      expect(tokens!.scope).toBe("read write");
    });

    it("should return expired tokens if refresh token exists", async () => {
      const credManager = createMockCredentialManager();
      const key = new VellumOAuthClientProvider(serverName, serverUrl, {}).getCredentialKey();

      credManager.credentials.set(key, {
        provider: key,
        type: "oauth_token",
        value: "expired-token",
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        metadata: {
          refreshToken: "refresh-token",
        },
      });

      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {}, credManager);

      const tokens = await provider.tokens();

      expect(tokens).toBeDefined();
      expect(tokens!.access_token).toBe("expired-token");
      expect(tokens!.refresh_token).toBe("refresh-token");
    });

    it("should return undefined for expired tokens without refresh token", async () => {
      const credManager = createMockCredentialManager();
      const key = new VellumOAuthClientProvider(serverName, serverUrl, {}).getCredentialKey();

      credManager.credentials.set(key, {
        provider: key,
        type: "oauth_token",
        value: "expired-token",
        expiresAt: new Date(Date.now() - 3600000), // Expired
        metadata: {},
      });

      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {}, credManager);

      const tokens = await provider.tokens();

      expect(tokens).toBeUndefined();
    });
  });

  describe("saveTokens", () => {
    it("should store tokens via credential manager", async () => {
      const credManager = createMockCredentialManager();
      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {}, credManager);

      await provider.saveTokens({
        access_token: "new-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "new-refresh-token",
        scope: "read write",
      });

      expect(credManager.store).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "oauth_token",
          value: "new-access-token",
          metadata: expect.objectContaining({
            refreshToken: "new-refresh-token",
            scopes: ["read", "write"],
          }),
        }),
        expect.any(String)
      );
    });
  });

  describe("OAuth state management", () => {
    it("should store authorization URL and state", async () => {
      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {});

      const authUrl = new URL("https://auth.example.com/authorize");
      authUrl.searchParams.set("client_id", "test-client");

      await provider.redirectToAuthorization(authUrl);

      const pendingUrl = provider.getPendingAuthUrl();
      expect(pendingUrl).toBeDefined();
      expect(pendingUrl).toContain("state=");
      expect(provider.getOAuthState()).toBeDefined();
    });

    it("should validate correct state", async () => {
      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {});

      const authUrl = new URL("https://auth.example.com/authorize");
      await provider.redirectToAuthorization(authUrl);

      const state = provider.getOAuthState()!;
      const isValid = provider.validateAndClearState(state);

      expect(isValid).toBe(true);
      expect(provider.getOAuthState()).toBeUndefined();
    });

    it("should reject invalid state", () => {
      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {});

      // Set up state directly for testing
      (provider as unknown as { providerData: { oauthState: string } }).providerData.oauthState =
        "valid-state";

      const isValid = provider.validateAndClearState("invalid-state");

      expect(isValid).toBe(false);
    });

    it("should reject expired state", async () => {
      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {});

      const authUrl = new URL("https://auth.example.com/authorize");
      await provider.redirectToAuthorization(authUrl);

      // Make state expired
      const state = provider.getOAuthState()!;
      (
        provider as unknown as { providerData: { oauthStateTimestamp: number } }
      ).providerData.oauthStateTimestamp = Date.now() - OAUTH_TIMEOUT_MS - 1000;

      const isValid = provider.validateAndClearState(state);

      expect(isValid).toBe(false);
    });
  });

  describe("PKCE code verifier", () => {
    it("should save and retrieve code verifier", async () => {
      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {});

      await provider.saveCodeVerifier("test-verifier-123");
      const verifier = await provider.codeVerifier();

      expect(verifier).toBe("test-verifier-123");
    });

    it("should throw when no code verifier", async () => {
      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {});

      await expect(provider.codeVerifier()).rejects.toThrow("No code verifier found");
    });
  });

  describe("client information", () => {
    it("should return undefined initially", async () => {
      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {});

      const clientInfo = await provider.clientInformation();

      expect(clientInfo).toBeUndefined();
    });

    it("should save and retrieve client information", async () => {
      const provider = new VellumOAuthClientProvider(serverName, serverUrl, {});

      await provider.saveClientInformation({
        client_id: "client-123",
        client_secret: "secret-456",
        client_id_issued_at: 1234567890,
        redirect_uris: ["http://localhost:3333/callback"],
      });

      const clientInfo = await provider.clientInformation();

      expect(clientInfo).toEqual({
        client_id: "client-123",
        client_secret: "secret-456",
      });
    });
  });
});

// ============================================
// McpOAuthManager Tests
// ============================================

describe("McpOAuthManager", () => {
  const serverName = "test-server";
  const serverUrl = "https://mcp.example.com";

  describe("getOrCreateProvider", () => {
    it("should create new provider", async () => {
      const manager = new McpOAuthManager();

      const provider = await manager.getOrCreateProvider(serverName, serverUrl);

      expect(provider).toBeDefined();
      expect(provider.clientMetadata.client_name).toBe("Vellum");
    });

    it("should return same provider for same server", async () => {
      const manager = new McpOAuthManager();

      const provider1 = await manager.getOrCreateProvider(serverName, serverUrl);
      const provider2 = await manager.getOrCreateProvider(serverName, serverUrl);

      expect(provider1).toBe(provider2);
    });

    it("should create different providers for different servers", async () => {
      const manager = new McpOAuthManager();

      const provider1 = await manager.getOrCreateProvider("server-1", serverUrl);
      const provider2 = await manager.getOrCreateProvider("server-2", serverUrl);

      expect(provider1).not.toBe(provider2);
    });
  });

  describe("initiateOAuth", () => {
    it("should return pending auth URL", async () => {
      const manager = new McpOAuthManager();

      // Create provider and simulate SDK setting up auth URL
      const provider = (await manager.getOrCreateProvider(
        serverName,
        serverUrl
      )) as VellumOAuthClientProvider;
      await provider.redirectToAuthorization(new URL("https://auth.example.com/authorize"));

      const authUrl = await manager.initiateOAuth(serverName, serverUrl);

      expect(authUrl).toContain("https://auth.example.com/authorize");
      expect(authUrl).toContain("state=");
    });

    it("should throw when no pending auth URL", async () => {
      const manager = new McpOAuthManager();

      await manager.getOrCreateProvider(serverName, serverUrl);

      await expect(manager.initiateOAuth(serverName, serverUrl)).rejects.toThrow(
        "No pending authorization URL"
      );
    });
  });

  describe("storeOAuthResult", () => {
    it("should store tokens via credential manager", async () => {
      const credManager = createMockCredentialManager();
      const manager = new McpOAuthManager(credManager);

      await manager.storeOAuthResult(serverName, serverUrl, {
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "test-refresh-token",
        scope: "read write",
      });

      expect(credManager.store).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "oauth_token",
          value: "test-access-token",
        }),
        expect.any(String)
      );
    });

    it("should start refresh timer when refresh token present", async () => {
      const mockTimer = createMockRefreshTimer();
      const manager = new McpOAuthManager(undefined, {}, () => mockTimer);

      await manager.storeOAuthResult(serverName, serverUrl, {
        access_token: "test-token",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "refresh-token",
      });

      expect(mockTimer.start).toHaveBeenCalled();
      expect(mockTimer._started).toBe(true);
    });

    it("should not start timer without refresh token", async () => {
      const mockTimer = createMockRefreshTimer();
      const manager = new McpOAuthManager(undefined, {}, () => mockTimer);

      await manager.storeOAuthResult(serverName, serverUrl, {
        access_token: "test-token",
        token_type: "Bearer",
      });

      expect(mockTimer.start).not.toHaveBeenCalled();
    });
  });

  describe("getAccessToken", () => {
    it("should return access token when authenticated", async () => {
      const credManager = createMockCredentialManager();
      const manager = new McpOAuthManager(credManager);

      // Store credentials
      await manager.storeOAuthResult(serverName, serverUrl, {
        access_token: "my-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      });

      const token = await manager.getAccessToken(serverName, serverUrl);

      expect(token).toBe("my-access-token");
    });

    it("should return undefined when not authenticated", async () => {
      const manager = new McpOAuthManager();

      const token = await manager.getAccessToken(serverName, serverUrl);

      expect(token).toBeUndefined();
    });
  });

  describe("clearServerAuth", () => {
    it("should clear provider and credentials", async () => {
      const credManager = createMockCredentialManager();
      const manager = new McpOAuthManager(credManager);

      // Set up provider
      await manager.storeOAuthResult(serverName, serverUrl, {
        access_token: "test-token",
        token_type: "Bearer",
      });

      await manager.clearServerAuth(serverName, serverUrl);

      expect(credManager.delete).toHaveBeenCalled();
      expect(manager.getProvider(serverName, serverUrl)).toBeUndefined();
    });

    it("should stop refresh timer", async () => {
      const mockTimer = createMockRefreshTimer();
      const manager = new McpOAuthManager(undefined, {}, () => mockTimer);

      await manager.storeOAuthResult(serverName, serverUrl, {
        access_token: "test-token",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "refresh-token",
      });

      await manager.clearServerAuth(serverName, serverUrl);

      expect(mockTimer.stop).toHaveBeenCalled();
    });
  });

  describe("validateOAuthState", () => {
    it("should validate correct state", async () => {
      const manager = new McpOAuthManager();

      const provider = (await manager.getOrCreateProvider(
        serverName,
        serverUrl
      )) as VellumOAuthClientProvider;
      await provider.redirectToAuthorization(new URL("https://auth.example.com"));

      const state = provider.getOAuthState()!;
      const isValid = manager.validateOAuthState(serverName, serverUrl, state);

      expect(isValid).toBe(true);
    });

    it("should return false for non-existent provider", () => {
      const manager = new McpOAuthManager();

      const isValid = manager.validateOAuthState("unknown", serverUrl, "state");

      expect(isValid).toBe(false);
    });
  });

  describe("dispose", () => {
    it("should stop all timers and clear providers", async () => {
      const mockTimer = createMockRefreshTimer();
      const manager = new McpOAuthManager(undefined, {}, () => mockTimer);

      await manager.storeOAuthResult(serverName, serverUrl, {
        access_token: "test-token",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "refresh",
      });

      manager.dispose();

      expect(mockTimer.stop).toHaveBeenCalled();
      expect(manager.getProvider(serverName, serverUrl)).toBeUndefined();
    });
  });
});

// ============================================
// OAuthCallbackServer Tests
// ============================================

describe("OAuthCallbackServer", () => {
  let server: OAuthCallbackServer;

  beforeEach(() => {
    server = new OAuthCallbackServer({ port: 3334 }); // Use different port to avoid conflicts
  });

  afterEach(async () => {
    await server.stop();
  });

  describe("constructor", () => {
    it("should use default port", () => {
      const defaultServer = new OAuthCallbackServer();
      expect(defaultServer.getCallbackUrl()).toBe(
        `http://127.0.0.1:${DEFAULT_OAUTH_PORT}/oauth/callback`
      );
    });

    it("should use custom port", () => {
      expect(server.getCallbackUrl()).toBe("http://127.0.0.1:3334/oauth/callback");
    });

    it("should use custom callback path", () => {
      const customServer = new OAuthCallbackServer({
        port: 3335,
        callbackPath: "/auth/callback",
      });
      expect(customServer.getCallbackUrl()).toBe("http://127.0.0.1:3335/auth/callback");
    });
  });

  describe("isServerRunning", () => {
    it("should return false initially", () => {
      expect(server.isServerRunning()).toBe(false);
    });
  });

  describe("waitForCallback", () => {
    it("should throw when server already running", async () => {
      // Start server
      const promise1 = server.waitForCallback({ timeout: 100 });

      // Give it time to start
      await new Promise((r) => setTimeout(r, 50));

      // Try to start again
      await expect(server.waitForCallback()).rejects.toThrow("Server is already running");

      // Let first promise timeout
      await expect(promise1).rejects.toThrow(OAuthTimeoutError);
    });

    it("should throw OAuthTimeoutError on timeout", async () => {
      await expect(server.waitForCallback({ timeout: 100 })).rejects.toThrow(OAuthTimeoutError);
    });
  });

  describe("stop", () => {
    it("should stop running server", async () => {
      const promise = server.waitForCallback({ timeout: 10000 });

      // Give it time to start
      await new Promise((r) => setTimeout(r, 100));
      expect(server.isServerRunning()).toBe(true);

      await server.stop();
      expect(server.isServerRunning()).toBe(false);

      // The promise should have been rejected due to server close
      await expect(promise).rejects.toThrow();
    }, 15000); // Increase test timeout

    it("should be safe to call multiple times", async () => {
      await server.stop();
      await server.stop();
      // Should not throw
    });
  });
});

// ============================================
// DynamicClientRegistration Tests
// ============================================

describe("DynamicClientRegistration", () => {
  const serverUrl = "https://auth.example.com";

  const mockMetadata: AuthorizationServerMetadata = {
    issuer: serverUrl,
    authorization_endpoint: `${serverUrl}/authorize`,
    token_endpoint: `${serverUrl}/token`,
    registration_endpoint: `${serverUrl}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
  };

  describe("discoverMetadata", () => {
    it("should fetch and parse metadata", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockMetadata),
      });

      const dcr = new DynamicClientRegistration({ fetch: mockFetch });
      const metadata = await dcr.discoverMetadata(serverUrl);

      expect(metadata.issuer).toBe(serverUrl);
      expect(metadata.authorization_endpoint).toBe(`${serverUrl}/authorize`);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(".well-known/oauth-authorization-server"),
        expect.any(Object)
      );
    });

    it("should cache metadata", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockMetadata),
      });

      const dcr = new DynamicClientRegistration({ fetch: mockFetch, cacheMetadata: true });

      await dcr.discoverMetadata(serverUrl);
      await dcr.discoverMetadata(serverUrl);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should try OpenID Connect discovery as fallback", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockMetadata),
        });

      const dcr = new DynamicClientRegistration({ fetch: mockFetch });
      const metadata = await dcr.discoverMetadata(serverUrl);

      expect(metadata.issuer).toBe(serverUrl);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining(".well-known/openid-configuration"),
        expect.any(Object)
      );
    });

    it("should throw on invalid metadata", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ issuer: serverUrl }), // Missing required fields
      });

      const dcr = new DynamicClientRegistration({ fetch: mockFetch });

      await expect(dcr.discoverMetadata(serverUrl)).rejects.toThrow(
        "missing authorization_endpoint"
      );
    });
  });

  describe("registerClient", () => {
    it("should register client successfully", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockMetadata),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              client_id: "registered-client-123",
              client_secret: "secret-456",
            }),
        });

      const dcr = new DynamicClientRegistration({ fetch: mockFetch });
      const clientInfo = await dcr.registerClient(serverUrl, {
        redirect_uris: ["http://localhost:3333/callback"],
        client_name: "Test Client",
      });

      expect(clientInfo.client_id).toBe("registered-client-123");
      expect(clientInfo.client_secret).toBe("secret-456");
    });

    it("should cache registered client", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockMetadata),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              client_id: "cached-client",
            }),
        });

      const dcr = new DynamicClientRegistration({ fetch: mockFetch });
      const clientMetadata = {
        redirect_uris: ["http://localhost:3333/callback"],
        client_name: "Test Client",
      };

      await dcr.registerClient(serverUrl, clientMetadata);
      const cachedClient = dcr.getCachedClient(serverUrl, clientMetadata);

      expect(cachedClient?.client_id).toBe("cached-client");
    });

    it("should throw when registration endpoint not available", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ...mockMetadata,
            registration_endpoint: undefined,
          }),
      });

      const dcr = new DynamicClientRegistration({ fetch: mockFetch });

      await expect(dcr.registerClient(serverUrl, { redirect_uris: [] })).rejects.toThrow(
        "does not support dynamic client registration"
      );
    });

    it("should throw on registration failure", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockMetadata),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: "Bad Request",
          text: () => Promise.resolve("Invalid client metadata"),
        });

      const dcr = new DynamicClientRegistration({ fetch: mockFetch });

      await expect(dcr.registerClient(serverUrl, { redirect_uris: [] })).rejects.toThrow(
        "Client registration failed"
      );
    });
  });

  describe("clearAllCaches", () => {
    it("should clear metadata and client caches", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockMetadata),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              client_id: "client-123",
            }),
        });

      const dcr = new DynamicClientRegistration({ fetch: mockFetch });
      const clientMetadata = { redirect_uris: [], client_name: "Test" };

      await dcr.registerClient(serverUrl, clientMetadata);
      expect(dcr.getCachedClient(serverUrl, clientMetadata)).toBeDefined();

      dcr.clearAllCaches();
      expect(dcr.getCachedClient(serverUrl, clientMetadata)).toBeUndefined();
    });
  });
});
