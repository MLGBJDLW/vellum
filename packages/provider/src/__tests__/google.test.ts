import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleProvider } from "../google.js";
import type { ProviderCredential } from "../types.js";

describe("GoogleProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("constructor", () => {
    it("should create provider without options", () => {
      const provider = new GoogleProvider();
      expect(provider.name).toBe("google");
    });

    it("should create provider with apiKey option", () => {
      const provider = new GoogleProvider({ apiKey: "AIzaTest123" });
      expect(provider.name).toBe("google");
      expect(provider.isConfigured()).toBe(true);
    });

    it("should be configured if GOOGLE_GENERATIVE_AI_API_KEY env var is set", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "AIzaTest123";
      const provider = new GoogleProvider();
      expect(provider.isConfigured()).toBe(true);
    });

    it("should not be configured if no apiKey and no env var", () => {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      const provider = new GoogleProvider();
      expect(provider.isConfigured()).toBe(false);
    });
  });

  describe("listModels", () => {
    it("should return list of supported models", () => {
      const provider = new GoogleProvider();
      const models = provider.listModels();
      expect(models).toContain("gemini-2.5-pro");
      expect(models).toContain("gemini-2.5-flash");
      expect(models).toContain("gemini-1.5-pro");
      expect(models).toContain("gemini-1.5-flash");
    });
  });

  describe("getDefaultModel", () => {
    it("should return default model", () => {
      const provider = new GoogleProvider();
      expect(provider.getDefaultModel()).toBe("gemini-2.5-flash");
    });
  });

  describe("validateCredential", () => {
    it("should validate correct API key format (AIza*)", async () => {
      const provider = new GoogleProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        value: "AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ12345678",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject invalid API key format", async () => {
      const provider = new GoogleProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        value: "invalid-key",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid Google AI API key format");
    });

    it("should reject non-api_key credential types", async () => {
      const provider = new GoogleProvider();
      const credential: ProviderCredential = {
        type: "oauth_token",
        value: "some-token",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("only supports api_key credentials");
    });

    it("should resolve value from env var", async () => {
      process.env.TEST_GOOGLE_KEY = "AIzaSyTestEnvKey12345678901234567890";
      const provider = new GoogleProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        envVar: "TEST_GOOGLE_KEY",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(true);
    });

    it("should fail when env var is not set", async () => {
      delete process.env.MISSING_KEY;
      const provider = new GoogleProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        envVar: "MISSING_KEY",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("environment variable not set");
    });

    it("should prefer value over envVar when both provided", async () => {
      process.env.TEST_KEY = "AIzaSyFromEnvVar";
      const provider = new GoogleProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        value: "invalid-key", // Direct value takes precedence
        envVar: "TEST_KEY",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(false); // Invalid because "invalid-key" is used
    });
  });

  describe("configure", () => {
    it("should configure provider with valid credential", async () => {
      const provider = new GoogleProvider();
      expect(provider.isConfigured()).toBe(false);

      const credential: ProviderCredential = {
        type: "api_key",
        value: "AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ12345678",
      };

      await provider.configure(credential);
      expect(provider.isConfigured()).toBe(true);
    });

    it("should throw on invalid credential", async () => {
      const provider = new GoogleProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        value: "invalid-key",
      };

      await expect(provider.configure(credential)).rejects.toThrow(
        "Invalid Google AI API key format"
      );
    });

    it("should throw on wrong credential type", async () => {
      const provider = new GoogleProvider();
      const credential: ProviderCredential = {
        type: "oauth_token",
        value: "token",
      };

      await expect(provider.configure(credential)).rejects.toThrow(
        "only supports api_key credentials"
      );
    });
  });

  describe("initialize", () => {
    it("should initialize with apiKey option", async () => {
      const provider = new GoogleProvider();
      await provider.initialize({ apiKey: "AIzaSyTestKey123" });
      expect(provider.isInitialized()).toBe(true);
    });

    it("should initialize with env var", async () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "AIzaSyTestEnvKey";
      const provider = new GoogleProvider();
      await provider.initialize({});
      expect(provider.isInitialized()).toBe(true);
    });

    it("should throw when no apiKey and no env var", async () => {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      const provider = new GoogleProvider();
      await expect(provider.initialize({})).rejects.toThrow("No API key provided for Google AI");
    });
  });

  describe("complete (mocked)", () => {
    let provider: GoogleProvider;

    beforeEach(async () => {
      provider = new GoogleProvider();
      await provider.initialize({ apiKey: "AIzaSyTestKey123" });
    });

    it("should throw if not initialized", async () => {
      const uninitProvider = new GoogleProvider();
      await expect(
        uninitProvider.complete({
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow("Provider not initialized");
    });
  });

  describe("stream (mocked)", () => {
    let provider: GoogleProvider;

    beforeEach(async () => {
      provider = new GoogleProvider();
      await provider.initialize({ apiKey: "AIzaSyTestKey123" });
    });

    it("should throw if not initialized", async () => {
      const uninitProvider = new GoogleProvider();
      const generator = uninitProvider.stream({
        model: "gemini-2.5-flash",
        messages: [{ role: "user", content: "Hello" }],
      });
      // AsyncIterable needs to be iterated to trigger the error
      await expect(async () => {
        for await (const _ of generator) {
          // consume
        }
      }).rejects.toThrow("Provider not initialized");
    });
  });

  describe("getModelInfo", () => {
    it("should return model info for known models", async () => {
      const provider = new GoogleProvider();
      const models = await provider.listModelsAsync();
      const flash = models.find((m) => m.id === "gemini-2.5-flash");
      expect(flash).toBeDefined();
      expect(flash?.supportsTools).toBe(true);
      expect(flash?.supportsVision).toBe(true);
      expect(flash?.supportsStreaming).toBe(true);
    });

    it("should return model info with large context windows", async () => {
      const provider = new GoogleProvider();
      const models = await provider.listModelsAsync();
      const pro = models.find((m) => m.id === "gemini-2.5-pro");
      expect(pro).toBeDefined();
      expect(pro?.contextWindow).toBe(1048576); // 1M tokens
    });
  });

  describe("countTokens", () => {
    it("should estimate tokens when not initialized (fallback)", async () => {
      const provider = new GoogleProvider();
      await provider.initialize({ apiKey: "AIzaSyTestKey123" });
      // With real API, this would make an actual call
      // For tests without mocking, it falls back to estimation
      const count = await provider.countTokens("Hello, world!");
      expect(count).toBeGreaterThan(0);
    });
  });
});
