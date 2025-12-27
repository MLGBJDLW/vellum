import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearProviderCache, createProvider, createProviderSync, getProvider } from "../factory.js";

// Mock CredentialManager
const mockResolve = vi.fn();
const mockCredentialManager = {
  resolve: mockResolve,
};

describe("factory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProviderCache();
  });

  describe("createProvider (async)", () => {
    it("should create provider with string type", async () => {
      const provider = await createProvider("anthropic");
      expect(provider.name).toBe("anthropic");
    });

    it("should create provider with config object", async () => {
      const provider = await createProvider({ type: "openai" });
      expect(provider.name).toBe("openai");
    });

    it("should create google provider", async () => {
      const provider = await createProvider({ type: "google" });
      expect(provider.name).toBe("google");
    });

    it("should throw for unknown provider type", async () => {
      await expect(createProvider("unknown" as any)).rejects.toThrow("Unknown provider: unknown");
    });

    it("should configure provider with direct credential", async () => {
      const provider = await createProvider({
        type: "anthropic",
        credential: { type: "api_key", value: "sk-ant-api03-test" },
      });
      expect(provider.name).toBe("anthropic");
      expect(provider.isConfigured?.()).toBe(true);
    });

    it("should configure provider with credentialManager", async () => {
      mockResolve.mockResolvedValue({
        ok: true,
        value: {
          id: "test-id",
          provider: "openai",
          type: "api_key",
          value: "sk-test-key",
          source: "env",
          createdAt: new Date(),
        },
      });

      const provider = await createProvider(
        { type: "openai" },
        { credentialManager: mockCredentialManager as any }
      );

      expect(mockResolve).toHaveBeenCalledWith("openai");
      expect(provider.name).toBe("openai");
    });

    it("should prefer direct credential over credentialManager", async () => {
      mockResolve.mockResolvedValue({
        ok: true,
        value: {
          id: "test-id",
          provider: "anthropic",
          type: "api_key",
          value: "sk-ant-api03-from-manager",
          source: "env",
          createdAt: new Date(),
        },
      });

      const provider = await createProvider(
        {
          type: "anthropic",
          credential: { type: "api_key", value: "sk-ant-api03-direct" },
        },
        { credentialManager: mockCredentialManager as any }
      );

      // Direct credential used, manager not called
      expect(mockResolve).not.toHaveBeenCalled();
      expect(provider.isConfigured?.()).toBe(true);
    });

    it("should handle credential not found from manager", async () => {
      mockResolve.mockResolvedValue({
        ok: true,
        value: null,
      });

      const provider = await createProvider(
        { type: "anthropic" },
        { credentialManager: mockCredentialManager as any }
      );

      expect(mockResolve).toHaveBeenCalledWith("anthropic");
      expect(provider.name).toBe("anthropic");
      // Provider created but may not be configured (depends on env vars)
    });

    it("should handle credential manager error gracefully", async () => {
      mockResolve.mockResolvedValue({
        ok: false,
        error: { code: "STORE_UNAVAILABLE", message: "Store not available" },
      });

      const provider = await createProvider(
        { type: "google" },
        { credentialManager: mockCredentialManager as any }
      );

      // Provider still created despite error
      expect(provider.name).toBe("google");
    });

    it("should skip credential configuration when autoConfigureCredential is false", async () => {
      mockResolve.mockResolvedValue({
        ok: true,
        value: {
          id: "test-id",
          provider: "anthropic",
          type: "api_key",
          value: "sk-ant-api03-test",
          source: "env",
          createdAt: new Date(),
        },
      });

      const provider = await createProvider(
        { type: "anthropic" },
        {
          credentialManager: mockCredentialManager as any,
          autoConfigureCredential: false,
        }
      );

      expect(mockResolve).not.toHaveBeenCalled();
      expect(provider.name).toBe("anthropic");
    });
  });

  describe("createProviderSync", () => {
    it("should create anthropic provider", () => {
      const provider = createProviderSync("anthropic");
      expect(provider.name).toBe("anthropic");
    });

    it("should create openai provider", () => {
      const provider = createProviderSync("openai");
      expect(provider.name).toBe("openai");
    });

    it("should create google provider", () => {
      const provider = createProviderSync("google");
      expect(provider.name).toBe("google");
    });

    it("should throw for unknown provider", () => {
      expect(() => createProviderSync("unknown" as any)).toThrow("Unknown provider: unknown");
    });
  });

  describe("getProvider", () => {
    it("should return cached provider on second call", () => {
      const provider1 = getProvider("anthropic");
      const provider2 = getProvider("anthropic");
      expect(provider1).toBe(provider2);
    });

    it("should return different instances for different types", () => {
      const anthropic = getProvider("anthropic");
      const openai = getProvider("openai");
      expect(anthropic).not.toBe(openai);
      expect(anthropic.name).toBe("anthropic");
      expect(openai.name).toBe("openai");
    });
  });

  describe("clearProviderCache", () => {
    it("should clear cached providers", () => {
      const provider1 = getProvider("anthropic");
      clearProviderCache();
      const provider2 = getProvider("anthropic");
      expect(provider1).not.toBe(provider2);
    });
  });

  describe("integration: credential validation through factory", () => {
    it("should validate and configure anthropic with credential manager", async () => {
      mockResolve.mockResolvedValue({
        ok: true,
        value: {
          type: "api_key",
          value: "sk-ant-api03-valid-key",
        },
      });

      const provider = await createProvider(
        { type: "anthropic" },
        { credentialManager: mockCredentialManager as any }
      );

      expect(provider.isConfigured?.()).toBe(true);
    });

    it("should validate and configure openai with credential manager", async () => {
      mockResolve.mockResolvedValue({
        ok: true,
        value: {
          type: "api_key",
          value: "sk-proj-valid-openai-key",
        },
      });

      const provider = await createProvider(
        { type: "openai" },
        { credentialManager: mockCredentialManager as any }
      );

      expect(provider.isConfigured?.()).toBe(true);
    });

    it("should validate and configure google with credential manager", async () => {
      mockResolve.mockResolvedValue({
        ok: true,
        value: {
          type: "api_key",
          value: "AIzaSyValidGoogleKey12345678901234567",
        },
      });

      const provider = await createProvider(
        { type: "google" },
        { credentialManager: mockCredentialManager as any }
      );

      expect(provider.isConfigured?.()).toBe(true);
    });

    it("should work without credential manager (backward compatibility)", async () => {
      // Provider should be created even without credential manager
      const provider = await createProvider("anthropic");
      expect(provider.name).toBe("anthropic");
      // May or may not be configured depending on env vars
      expect(typeof provider.isConfigured?.()).toBe("boolean");
    });

    it("should handle rejected promise from credential manager", async () => {
      mockResolve.mockRejectedValue(new Error("Network error"));

      // Should not throw, provider should still be created
      await expect(
        createProvider({ type: "openai" }, { credentialManager: mockCredentialManager as any })
      ).rejects.toThrow("Network error");
    });
  });
});
