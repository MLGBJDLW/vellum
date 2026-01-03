// ============================================
// T046: Credential Adapter Unit Tests
// ============================================

import { describe, expect, it, vi } from "vitest";
import {
  type CoreCredentialManager,
  createOAuthCredentialAdapter,
  isCoreCredentialManager,
} from "../credential-adapter.js";

describe("credential-adapter", () => {
  describe("createOAuthCredentialAdapter", () => {
    /**
     * Create a mock CoreCredentialManager for testing.
     */
    function createMockCoreManager(): CoreCredentialManager & {
      _credentials: Map<string, unknown>;
    } {
      const credentials = new Map<string, unknown>();
      return {
        _credentials: credentials,
        resolve: vi.fn(async (provider: string) => {
          const cred = credentials.get(provider);
          return { ok: true, value: (cred ?? null) as any };
        }),
        store: vi.fn(async (input) => {
          credentials.set(input.provider, input);
          return { ok: true, value: input };
        }),
        delete: vi.fn(async (provider: string) => {
          const existed = credentials.has(provider);
          credentials.delete(provider);
          return { ok: true, value: existed ? 1 : 0 };
        }),
      };
    }

    it("should resolve credential correctly", async () => {
      const coreManager = createMockCoreManager();
      const adapter = createOAuthCredentialAdapter(coreManager);

      // Store a credential via core manager
      coreManager._credentials.set("mcp:test-server", {
        provider: "mcp:test-server",
        type: "oauth_token",
        value: "access-token-123",
        expiresAt: new Date(Date.now() + 3600000),
        metadata: {
          refreshToken: "refresh-token-456",
          scopes: ["read", "write"],
          tokenType: "Bearer",
        },
      });

      // Resolve via adapter
      const result = await adapter.resolve("mcp:test-server");

      expect(result).not.toBeNull();
      expect(result?.provider).toBe("mcp:test-server");
      expect(result?.type).toBe("oauth_token");
      expect(result?.value).toBe("access-token-123");
      expect(result?.metadata?.refreshToken).toBe("refresh-token-456");
      expect(result?.metadata?.scopes).toEqual(["read", "write"]);
    });

    it("should return null for non-existent credential", async () => {
      const coreManager = createMockCoreManager();
      const adapter = createOAuthCredentialAdapter(coreManager);

      const result = await adapter.resolve("mcp:non-existent");

      expect(result).toBeNull();
    });

    it("should return null for non-oauth_token credential", async () => {
      const coreManager = createMockCoreManager();
      const adapter = createOAuthCredentialAdapter(coreManager);

      // Store a non-OAuth credential
      coreManager._credentials.set("mcp:api-key", {
        provider: "mcp:api-key",
        type: "api_key",
        value: "sk-123",
      });

      const result = await adapter.resolve("mcp:api-key");

      expect(result).toBeNull();
    });

    it("should store credential correctly", async () => {
      const coreManager = createMockCoreManager();
      const adapter = createOAuthCredentialAdapter(coreManager);

      await adapter.store({
        provider: "mcp:test-server",
        type: "oauth_token",
        value: "new-access-token",
        expiresAt: new Date(Date.now() + 7200000),
        metadata: {
          refreshToken: "new-refresh-token",
          scopes: ["admin"],
          tokenType: "Bearer",
        },
      });

      expect(coreManager.store).toHaveBeenCalledTimes(1);
      expect(coreManager._credentials.has("mcp:test-server")).toBe(true);
    });

    it("should store with custom key", async () => {
      const coreManager = createMockCoreManager();
      const adapter = createOAuthCredentialAdapter(coreManager);

      await adapter.store(
        {
          provider: "original-key",
          type: "oauth_token",
          value: "token",
        },
        "custom-key"
      );

      // Should store with custom key
      expect(coreManager.store).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "custom-key" })
      );
    });

    it("should delete credential correctly", async () => {
      const coreManager = createMockCoreManager();
      const adapter = createOAuthCredentialAdapter(coreManager);

      // Add a credential first
      coreManager._credentials.set("mcp:to-delete", {
        provider: "mcp:to-delete",
        type: "oauth_token",
        value: "token",
      });

      await adapter.delete("mcp:to-delete");

      expect(coreManager.delete).toHaveBeenCalledWith("mcp:to-delete");
      expect(coreManager._credentials.has("mcp:to-delete")).toBe(false);
    });
  });

  describe("isCoreCredentialManager", () => {
    it("should return true for valid CoreCredentialManager", () => {
      const manager = {
        resolve: vi.fn(),
        store: vi.fn(),
        delete: vi.fn(),
      };

      expect(isCoreCredentialManager(manager)).toBe(true);
    });

    it("should return false for null", () => {
      expect(isCoreCredentialManager(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isCoreCredentialManager(undefined)).toBe(false);
    });

    it("should return false for non-object", () => {
      expect(isCoreCredentialManager("string")).toBe(false);
      expect(isCoreCredentialManager(123)).toBe(false);
    });

    it("should return false for object with missing methods", () => {
      expect(isCoreCredentialManager({ resolve: vi.fn() })).toBe(false);
      expect(isCoreCredentialManager({ resolve: vi.fn(), store: vi.fn() })).toBe(false);
    });
  });
});
