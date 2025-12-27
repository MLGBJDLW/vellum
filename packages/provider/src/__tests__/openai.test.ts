import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "../openai.js";
import type { ProviderCredential } from "../types.js";

describe("OpenAIProvider", () => {
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
      const provider = new OpenAIProvider();
      expect(provider.name).toBe("openai");
    });

    it("should create provider with apiKey option", () => {
      const provider = new OpenAIProvider({ apiKey: "sk-test123" });
      expect(provider.name).toBe("openai");
      expect(provider.isConfigured()).toBe(true);
    });

    it("should be configured if OPENAI_API_KEY env var is set", () => {
      process.env.OPENAI_API_KEY = "sk-test123";
      const provider = new OpenAIProvider();
      expect(provider.isConfigured()).toBe(true);
    });

    it("should not be configured if no apiKey and no env var", () => {
      delete process.env.OPENAI_API_KEY;
      const provider = new OpenAIProvider();
      expect(provider.isConfigured()).toBe(false);
    });
  });

  describe("listModels", () => {
    it("should return list of supported models", () => {
      const provider = new OpenAIProvider();
      const models = provider.listModels();
      expect(models).toContain("gpt-4o");
      expect(models).toContain("gpt-4o-mini");
      expect(models).toContain("gpt-4-turbo");
      expect(models).toContain("o1");
      expect(models).toContain("o1-mini");
    });
  });

  describe("getDefaultModel", () => {
    it("should return default model", () => {
      const provider = new OpenAIProvider();
      expect(provider.getDefaultModel()).toBe("gpt-4o");
    });
  });

  describe("validateCredential", () => {
    it("should validate correct legacy API key format (sk-*)", async () => {
      const provider = new OpenAIProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        value: "sk-abcd1234efgh5678",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(true);
      // Should warn about legacy key
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toContain(
        "Using legacy API key format. Consider using project keys (sk-proj-*) for better security."
      );
    });

    it("should validate correct project API key format (sk-proj-*)", async () => {
      const provider = new OpenAIProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        value: "sk-proj-abcd1234efgh5678",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(true);
      // No warning for project keys
      expect(result.warnings).toBeUndefined();
    });

    it("should reject invalid API key format", async () => {
      const provider = new OpenAIProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        value: "invalid-key",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid OpenAI API key format");
    });

    it("should reject non-api_key credential types", async () => {
      const provider = new OpenAIProvider();
      const credential: ProviderCredential = {
        type: "oauth_token",
        value: "some-token",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("only supports api_key credentials");
    });

    it("should resolve value from env var", async () => {
      process.env.TEST_OPENAI_KEY = "sk-proj-from-env";
      const provider = new OpenAIProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        envVar: "TEST_OPENAI_KEY",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(true);
    });

    it("should fail when env var is not set", async () => {
      delete process.env.MISSING_KEY;
      const provider = new OpenAIProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        envVar: "MISSING_KEY",
      };

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("environment variable not set");
    });

    it("should prefer value over envVar when both provided", async () => {
      process.env.TEST_KEY = "sk-proj-from-env";
      const provider = new OpenAIProvider();
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
      const provider = new OpenAIProvider();
      expect(provider.isConfigured()).toBe(false);

      const credential: ProviderCredential = {
        type: "api_key",
        value: "sk-proj-abcd1234",
      };

      await provider.configure(credential);
      expect(provider.isConfigured()).toBe(true);
    });

    it("should throw on invalid credential", async () => {
      const provider = new OpenAIProvider();
      const credential: ProviderCredential = {
        type: "api_key",
        value: "invalid-key",
      };

      await expect(provider.configure(credential)).rejects.toThrow("Invalid OpenAI API key format");
    });

    it("should throw on wrong credential type", async () => {
      const provider = new OpenAIProvider();
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
      const provider = new OpenAIProvider();
      await provider.initialize({ apiKey: "sk-proj-test123" });
      expect(provider.isInitialized()).toBe(true);
    });

    it("should initialize with env var", async () => {
      process.env.OPENAI_API_KEY = "sk-test123";
      const provider = new OpenAIProvider();
      await provider.initialize({});
      expect(provider.isInitialized()).toBe(true);
    });

    it("should throw when no apiKey and no env var", async () => {
      delete process.env.OPENAI_API_KEY;
      const provider = new OpenAIProvider();
      await expect(provider.initialize({})).rejects.toThrow("No API key provided for OpenAI");
    });
  });

  describe("complete (mocked)", () => {
    let provider: OpenAIProvider;

    beforeEach(async () => {
      provider = new OpenAIProvider();
      await provider.initialize({ apiKey: "sk-proj-test123" });
    });

    it("should throw if not initialized", async () => {
      const uninitProvider = new OpenAIProvider();
      await expect(
        uninitProvider.complete({
          model: "gpt-4o",
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow("Provider not initialized");
    });
  });

  describe("stream (mocked)", () => {
    let provider: OpenAIProvider;

    beforeEach(async () => {
      provider = new OpenAIProvider();
      await provider.initialize({ apiKey: "sk-proj-test123" });
    });

    it("should throw if not initialized", async () => {
      const uninitProvider = new OpenAIProvider();
      const generator = uninitProvider.stream({
        model: "gpt-4o",
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

  describe("O-series model handling", () => {
    it("should identify O-series models", () => {
      const provider = new OpenAIProvider();
      const models = provider.listModels();
      expect(models).toContain("o1");
      expect(models).toContain("o1-mini");
      expect(models).toContain("o3");
      expect(models).toContain("o3-mini");
    });

    it("should return model info with supportsReasoning for O-series", async () => {
      const provider = new OpenAIProvider();
      const models = await provider.listModelsAsync();
      const o1 = models.find((m) => m.id === "o1");
      expect(o1).toBeDefined();
      expect(o1?.supportsReasoning).toBe(true);
      expect(o1?.supportsStreaming).toBe(false); // O-series doesn't stream
    });

    it("should return model info with supportsStreaming for standard models", async () => {
      const provider = new OpenAIProvider();
      const models = await provider.listModelsAsync();
      const gpt4o = models.find((m) => m.id === "gpt-4o");
      expect(gpt4o).toBeDefined();
      expect(gpt4o?.supportsReasoning).toBe(false);
      expect(gpt4o?.supportsStreaming).toBe(true);
    });
  });

  describe("getModelInfo", () => {
    it("should return model info for known models", async () => {
      const provider = new OpenAIProvider();
      const models = await provider.listModelsAsync();
      const gpt4o = models.find((m) => m.id === "gpt-4o");
      expect(gpt4o).toBeDefined();
      expect(gpt4o?.supportsTools).toBe(true);
      expect(gpt4o?.supportsVision).toBe(true);
    });
  });

  describe("countTokens", () => {
    it("should estimate tokens for string input", async () => {
      const provider = new OpenAIProvider();
      await provider.initialize({ apiKey: "sk-proj-test123" });
      const count = await provider.countTokens("Hello, world!");
      expect(count).toBeGreaterThan(0);
    });

    it("should estimate tokens for message array input", async () => {
      const provider = new OpenAIProvider();
      await provider.initialize({ apiKey: "sk-proj-test123" });
      const count = await provider.countTokens([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ]);
      expect(count).toBeGreaterThan(0);
    });
  });
});
