import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../anthropic.js";
import type { ProviderCredential } from "../types.js";

describe("AnthropicProvider", () => {
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
      const provider = new AnthropicProvider();
      expect(provider.name).toBe("anthropic");
    });

    it("should create provider with apiKey option", () => {
      const provider = new AnthropicProvider({ apiKey: "sk-ant-api03-test" });
      expect(provider.name).toBe("anthropic");
      expect(provider.isConfigured()).toBe(true);
    });

    it("should be configured if ANTHROPIC_API_KEY env var is set", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
      const provider = new AnthropicProvider();
      expect(provider.isConfigured()).toBe(true);
    });

    it("should not be configured if no apiKey and no env var", () => {
      delete process.env.ANTHROPIC_API_KEY;
      const provider = new AnthropicProvider();
      expect(provider.isConfigured()).toBe(false);
    });
  });

  describe("listModels", () => {
    it("should return list of supported models", () => {
      const provider = new AnthropicProvider();
      const models = provider.listModels();
      expect(models).toContain("claude-sonnet-4-20250514");
      expect(models).toContain("claude-3-5-sonnet-20241022");
      expect(models).toContain("claude-3-5-haiku-20241022");
      expect(models).toContain("claude-3-opus-20240229");
    });
  });

  describe("getDefaultModel", () => {
    it("should return default model", () => {
      const provider = new AnthropicProvider();
      expect(provider.getDefaultModel()).toBe("claude-sonnet-4-20250514");
    });
  });

  describe("validateCredential", () => {
    it("should validate correct API key format", async () => {
      const provider = new AnthropicProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        value: "sk-ant-api03-abcd1234",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject invalid API key format", async () => {
      const provider = new AnthropicProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        value: "invalid-key",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid Anthropic API key format");
    });

    it("should reject non-api_key credential types", async () => {
      const provider = new AnthropicProvider();
      const credential: ProviderCredential = {
        type: "oauth_token",
        value: "some-token",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("only supports api_key credentials");
    });

    it("should resolve value from env var", async () => {
      process.env.TEST_ANTHROPIC_KEY = "sk-ant-api03-from-env";
      const provider = new AnthropicProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        envVar: "TEST_ANTHROPIC_KEY",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(true);
    });

    it("should fail when env var is not set", async () => {
      delete process.env.MISSING_KEY;
      const provider = new AnthropicProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        envVar: "MISSING_KEY",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("environment variable not set");
    });

    it("should prefer value over envVar when both provided", async () => {
      process.env.TEST_KEY = "sk-ant-api03-from-env";
      const provider = new AnthropicProvider();
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
      const provider = new AnthropicProvider();
      expect(provider.isConfigured()).toBe(false);

      const credential: ProviderCredential = {
        type: "api_key",
        value: "sk-ant-api03-abcd1234",
      };

      await provider.configure(credential);
      expect(provider.isConfigured()).toBe(true);
    });

    it("should throw on invalid credential", async () => {
      const provider = new AnthropicProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        value: "invalid-key",
      };

      await expect(provider.configure(credential)).rejects.toThrow(
        "Invalid Anthropic API key format"
      );
    });

    it("should throw on wrong credential type", async () => {
      const provider = new AnthropicProvider();
      const credential: ProviderCredential = {
        type: "oauth_token",
        value: "token",
      };

      await expect(provider.configure(credential)).rejects.toThrow(
        "only supports api_key credentials"
      );
    });
  });

  describe("validateCredential edge cases", () => {
    it("should accept valid API key formats", async () => {
      const provider = new AnthropicProvider();
      const validKeys = [
        "sk-ant-api03-abc123",
        "sk-ant-api03-longer-key-with-many-chars",
        "sk-ant-api03-a",
      ];

      for (const key of validKeys) {
        const result = await provider.validateCredential({
          type: "api_key",
          value: key,
        });
        expect(result.valid).toBe(true);
      }
    });

    it("should reject various malformed API keys", async () => {
      const provider = new AnthropicProvider();
      const invalidKeys = [
        "", // empty
        "sk-", // too short
        "sk-ant-", // incomplete prefix
        "sk-ant-api02-test", // wrong version
        "anthropic-key", // wrong format
        "sk-openai-key", // wrong provider format
        "   sk-ant-api03-test   ", // whitespace (depends on impl)
      ];

      for (const key of invalidKeys) {
        const result = await provider.validateCredential({
          type: "api_key",
          value: key,
        });
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it("should reject empty string value", async () => {
      const provider = new AnthropicProvider();
      const result = await provider.validateCredential({
        type: "api_key",
        value: "",
      });
      expect(result.valid).toBe(false);
    });

    it("should reject certificate credential type", async () => {
      const provider = new AnthropicProvider();
      const result = await provider.validateCredential({
        type: "certificate",
        value: "cert-data",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("only supports api_key");
    });

    it("should reject bearer_token credential type", async () => {
      const provider = new AnthropicProvider();
      const result = await provider.validateCredential({
        type: "bearer_token",
        value: "token",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("only supports api_key");
    });

    it("should reject service_account credential type", async () => {
      const provider = new AnthropicProvider();
      const result = await provider.validateCredential({
        type: "service_account",
        value: "{}",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("only supports api_key");
    });
  });

  describe("initialize", () => {
    it("should initialize with apiKey option", async () => {
      const provider = new AnthropicProvider();
      await provider.initialize({ apiKey: "sk-ant-api03-test" });
      expect(provider.isInitialized()).toBe(true);
    });

    it("should initialize with env var", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
      const provider = new AnthropicProvider();
      await provider.initialize({});
      expect(provider.isInitialized()).toBe(true);
    });

    it("should throw when no apiKey and no env var", async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const provider = new AnthropicProvider();
      await expect(provider.initialize({})).rejects.toThrow("No API key provided for Anthropic");
    });
  });

  describe("complete (mocked)", () => {
    let provider: AnthropicProvider;

    beforeEach(async () => {
      provider = new AnthropicProvider();
      await provider.initialize({ apiKey: "sk-ant-api03-test" });
    });

    it("should throw if not initialized", async () => {
      const uninitProvider = new AnthropicProvider();
      await expect(
        uninitProvider.complete({
          model: "claude-sonnet-4-20250514",
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow("Provider not initialized");
    });
  });

  describe("stream (mocked)", () => {
    let provider: AnthropicProvider;

    beforeEach(async () => {
      provider = new AnthropicProvider();
      await provider.initialize({ apiKey: "sk-ant-api03-test" });
    });

    it("should throw if not initialized", async () => {
      const uninitProvider = new AnthropicProvider();
      const generator = uninitProvider.stream({
        model: "claude-sonnet-4-20250514",
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
      const provider = new AnthropicProvider();
      const models = await provider.listModelsAsync();
      const sonnet = models.find((m) => m.id === "claude-sonnet-4-20250514");
      expect(sonnet).toBeDefined();
      expect(sonnet?.supportsReasoning).toBe(true);
      expect(sonnet?.supportsTools).toBe(true);
    });
  });

  describe("countTokens", () => {
    it("should estimate tokens when not initialized (fallback)", async () => {
      const provider = new AnthropicProvider();
      await provider.initialize({ apiKey: "sk-ant-api03-test" });
      // With real API, this would make an actual call
      // For tests without mocking, it falls back to estimation
      const count = await provider.countTokens("Hello, world!");
      expect(count).toBeGreaterThan(0);
    });
  });
});
