import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CredentialManagerLike,
  clearDefaultRegistry,
  configureDefaultRegistry,
  getDefaultRegistry,
  ProviderRegistry,
} from "../registry.js";
import type { ProviderCredential } from "../types.js";

describe("ProviderRegistry", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    clearDefaultRegistry();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearDefaultRegistry();
  });

  describe("constructor", () => {
    it("should create registry without options", () => {
      const registry = new ProviderRegistry();
      expect(registry.size).toBe(0);
    });

    it("should create registry with caching enabled by default", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
      const registry = new ProviderRegistry();
      const provider1 = await registry.get({ type: "anthropic" });
      const provider2 = await registry.get({ type: "anthropic" });
      expect(provider1).toBe(provider2);
      expect(registry.size).toBe(1);
    });

    it("should create registry with caching disabled", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
      const registry = new ProviderRegistry({ enableCache: false });
      await registry.get({ type: "anthropic" });
      expect(registry.size).toBe(0); // Not cached
    });
  });

  describe("get", () => {
    it("should create provider for anthropic", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
      const registry = new ProviderRegistry();
      const provider = await registry.get({ type: "anthropic" });
      expect(provider.name).toBe("anthropic");
    });

    it("should create provider for openai", async () => {
      process.env.OPENAI_API_KEY = "sk-test123";
      const registry = new ProviderRegistry();
      const provider = await registry.get({ type: "openai" });
      expect(provider.name).toBe("openai");
    });

    it("should create provider for google", async () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "AIzaTest123";
      const registry = new ProviderRegistry();
      const provider = await registry.get({ type: "google" });
      expect(provider.name).toBe("google");
    });

    it("should throw for unknown provider type", async () => {
      const registry = new ProviderRegistry();
      await expect(registry.get({ type: "unknown" as "anthropic" })).rejects.toThrow(
        "Unknown provider: unknown"
      );
    });

    it("should use direct apiKey when provided", async () => {
      const registry = new ProviderRegistry();
      const provider = await registry.get({
        type: "anthropic",
        apiKey: "sk-ant-api03-direct",
      });
      expect(provider.name).toBe("anthropic");
      expect(provider.isConfigured?.()).toBe(true);
    });

    it("should use direct credential when provided", async () => {
      const registry = new ProviderRegistry();
      const credential: ProviderCredential = {
        type: "api_key",
        value: "sk-ant-api03-credential",
      };
      const provider = await registry.get({
        type: "anthropic",
        credential,
      });
      expect(provider.isConfigured?.()).toBe(true);
    });

    it("should use model as part of cache key", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
      const registry = new ProviderRegistry();
      const provider1 = await registry.get({
        type: "anthropic",
        model: "claude-sonnet-4-20250514",
      });
      const provider2 = await registry.get({
        type: "anthropic",
        model: "claude-3-5-haiku-20241022",
      });
      const provider3 = await registry.get({
        type: "anthropic",
        model: "claude-sonnet-4-20250514",
      });

      expect(provider1).not.toBe(provider2); // Different models = different cache keys
      expect(provider1).toBe(provider3); // Same model = same cached instance
      expect(registry.size).toBe(2);
    });
  });

  describe("get with credentialManager", () => {
    it("should resolve credential from credentialManager", async () => {
      const mockCredentialManager: CredentialManagerLike = {
        resolve: vi.fn().mockResolvedValue({
          ok: true,
          value: { type: "api_key", value: "sk-ant-api03-from-manager" },
        }),
      };

      const registry = new ProviderRegistry({
        credentialManager: mockCredentialManager,
      });

      const provider = await registry.get({ type: "anthropic" });
      expect(provider.isConfigured?.()).toBe(true);
      expect(mockCredentialManager.resolve).toHaveBeenCalledWith("anthropic");
    });

    it("should fall back to env vars when credentialManager returns null", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-from-env";
      const mockCredentialManager: CredentialManagerLike = {
        resolve: vi.fn().mockResolvedValue({
          ok: true,
          value: null,
        }),
      };

      const registry = new ProviderRegistry({
        credentialManager: mockCredentialManager,
      });

      const provider = await registry.get({ type: "anthropic" });
      expect(provider.isConfigured?.()).toBe(true);
    });

    it("should prefer direct apiKey over credentialManager", async () => {
      const mockCredentialManager: CredentialManagerLike = {
        resolve: vi.fn().mockResolvedValue({
          ok: true,
          value: { type: "api_key", value: "sk-ant-api03-from-manager" },
        }),
      };

      const registry = new ProviderRegistry({
        credentialManager: mockCredentialManager,
      });

      const provider = await registry.get({
        type: "anthropic",
        apiKey: "sk-ant-api03-direct",
      });

      expect(provider.isConfigured?.()).toBe(true);
      // credentialManager should NOT be called when apiKey is provided directly
      expect(mockCredentialManager.resolve).not.toHaveBeenCalled();
    });
  });

  describe("validateOnCreate", () => {
    it("should validate credential when validateOnCreate is true", async () => {
      const registry = new ProviderRegistry({ validateOnCreate: true });

      // Invalid credential should throw during pre-validation
      await expect(
        registry.get({
          type: "anthropic",
          apiKey: "invalid-key",
        })
      ).rejects.toThrow();
    });

    it("should not pre-validate when validateOnCreate is false", async () => {
      // When validateOnCreate is false, registry won't call validateCredential
      // But provider.configure() still validates
      // Use env var path to avoid configure() being called
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
      const registry = new ProviderRegistry({ validateOnCreate: false });

      // When no explicit apiKey, registry won't call configure()
      const provider = await registry.get({ type: "anthropic" });
      expect(provider).toBeDefined();
    });
  });

  describe("getSync", () => {
    it("should return unconfigured provider synchronously", () => {
      const registry = new ProviderRegistry();
      const provider = registry.getSync("anthropic");
      expect(provider.name).toBe("anthropic");
      // Provider may or may not be configured depending on env vars
    });

    it("should return cached provider if available", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
      const registry = new ProviderRegistry();
      const asyncProvider = await registry.get({ type: "anthropic" });
      const syncProvider = registry.getSync("anthropic");
      expect(asyncProvider).toBe(syncProvider);
    });
  });

  describe("has", () => {
    it("should return false for uncached provider", () => {
      const registry = new ProviderRegistry();
      expect(registry.has("anthropic")).toBe(false);
    });

    it("should return true for cached provider", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
      const registry = new ProviderRegistry();
      await registry.get({ type: "anthropic" });
      expect(registry.has("anthropic")).toBe(true);
    });

    it("should differentiate by model", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
      const registry = new ProviderRegistry();
      await registry.get({ type: "anthropic", model: "claude-sonnet-4-20250514" });
      expect(registry.has("anthropic", "claude-sonnet-4-20250514")).toBe(true);
      expect(registry.has("anthropic", "claude-3-5-haiku-20241022")).toBe(false);
      expect(registry.has("anthropic")).toBe(false); // Without model
    });
  });

  describe("invalidate", () => {
    it("should remove provider from cache", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
      const registry = new ProviderRegistry();
      await registry.get({ type: "anthropic" });
      expect(registry.size).toBe(1);

      const removed = registry.invalidate("anthropic");
      expect(removed).toBe(true);
      expect(registry.size).toBe(0);
    });

    it("should return false when provider not in cache", () => {
      const registry = new ProviderRegistry();
      const removed = registry.invalidate("anthropic");
      expect(removed).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all cached providers", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
      process.env.OPENAI_API_KEY = "sk-test123";

      const registry = new ProviderRegistry();
      await registry.get({ type: "anthropic" });
      await registry.get({ type: "openai" });
      expect(registry.size).toBe(2);

      registry.clear();
      expect(registry.size).toBe(0);
    });
  });

  describe("getCachedTypes", () => {
    it("should return empty array when no providers cached", () => {
      const registry = new ProviderRegistry();
      expect(registry.getCachedTypes()).toEqual([]);
    });

    it("should return cached provider types", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
      process.env.OPENAI_API_KEY = "sk-test123";

      const registry = new ProviderRegistry();
      await registry.get({ type: "anthropic" });
      await registry.get({ type: "openai" });

      const types = registry.getCachedTypes();
      expect(types).toContain("anthropic");
      expect(types).toContain("openai");
      expect(types.length).toBe(2);
    });

    it("should not duplicate types with different models", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";

      const registry = new ProviderRegistry();
      await registry.get({ type: "anthropic", model: "claude-sonnet-4-20250514" });
      await registry.get({ type: "anthropic", model: "claude-3-5-haiku-20241022" });

      const types = registry.getCachedTypes();
      expect(types).toEqual(["anthropic"]);
    });
  });

  describe("default registry", () => {
    it("should return singleton instance", () => {
      const registry1 = getDefaultRegistry();
      const registry2 = getDefaultRegistry();
      expect(registry1).toBe(registry2);
    });

    it("should allow configuration", () => {
      const registry = configureDefaultRegistry({ enableCache: false });
      expect(registry).toBe(getDefaultRegistry());
    });

    it("should clear singleton on clearDefaultRegistry", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
      const registry1 = getDefaultRegistry();
      await registry1.get({ type: "anthropic" });

      clearDefaultRegistry();

      const registry2 = getDefaultRegistry();
      expect(registry2).not.toBe(registry1);
      expect(registry2.size).toBe(0);
    });
  });

  describe("all supported providers", () => {
    it("should support anthropic", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
      const registry = new ProviderRegistry();
      const provider = await registry.get({ type: "anthropic" });
      expect(provider.name).toBe("anthropic");
    });

    it("should support openai", async () => {
      process.env.OPENAI_API_KEY = "sk-test123";
      const registry = new ProviderRegistry();
      const provider = await registry.get({ type: "openai" });
      expect(provider.name).toBe("openai");
    });

    it("should support google", async () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "AIzaTest123";
      const registry = new ProviderRegistry();
      const provider = await registry.get({ type: "google" });
      expect(provider.name).toBe("google");
    });

    // Note: DeepSeek, Groq, xAI extend OpenAICompatibleProvider which has name="openai"
    // This is intentional as they use OpenAI-compatible APIs
    // These providers need apiKey passed directly since OpenAIProvider.initialize()
    // only checks OPENAI_API_KEY env var as fallback
    it("should support deepseek (openai-compatible)", async () => {
      const registry = new ProviderRegistry();
      const provider = await registry.get({ type: "deepseek", apiKey: "sk-deepseek-test" });
      // DeepSeek extends OpenAICompatibleProvider, inherits name="openai"
      expect(provider.name).toBe("openai");
    });

    it("should support groq (openai-compatible)", async () => {
      const registry = new ProviderRegistry();
      const provider = await registry.get({ type: "groq", apiKey: "gsk_test123" });
      expect(provider.name).toBe("openai");
    });

    it("should support xai (openai-compatible)", async () => {
      const registry = new ProviderRegistry();
      const provider = await registry.get({ type: "xai", apiKey: "xai-test123" });
      expect(provider.name).toBe("openai");
    });

    it("should support ollama (local openai-compatible)", async () => {
      const registry = new ProviderRegistry();
      const provider = await registry.get({ type: "ollama" });
      expect(provider.name).toBe("openai");
    });

    it("should support lmstudio (local openai-compatible)", async () => {
      const registry = new ProviderRegistry();
      const provider = await registry.get({ type: "lmstudio" });
      expect(provider.name).toBe("openai");
    });
  });
});
