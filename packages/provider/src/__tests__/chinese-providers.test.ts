/**
 * Unit tests for Chinese LLM providers
 *
 * Tests Zhipu JWT authentication generation and initialization/model listing
 * for Moonshot, Yi, Baichuan, and Mistral providers.
 *
 * @module @vellum/provider/__tests__/chinese-providers
 */
// biome-ignore-all lint/style/noNonNullAssertion: Test file - array access patterns verified by test setup

import { describe, expect, it, vi } from "vitest";
import { BaichuanProvider } from "../baichuan.js";
import { MistralProvider } from "../mistral.js";
import { MoonshotProvider } from "../moonshot.js";
import { YiProvider } from "../yi.js";
import { generateZhipuToken, ZhipuProvider } from "../zhipu.js";

// =============================================================================
// Zhipu JWT Authentication Tests
// =============================================================================

describe("Zhipu JWT Authentication", () => {
  describe("generateZhipuToken", () => {
    it("should generate a valid JWT token with correct structure", async () => {
      const apiKey = "test-id.test-secret";
      const token = await generateZhipuToken(apiKey);

      // JWT has 3 parts separated by dots
      const parts = token.split(".");
      expect(parts).toHaveLength(3);

      // Decode header (first part)
      const header = JSON.parse(Buffer.from(parts[0]!, "base64url").toString());
      expect(header).toEqual({
        alg: "HS256",
        sign_type: "SIGN",
      });

      // Decode payload (second part)
      const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString());
      expect(payload.api_key).toBe("test-id");
      expect(payload.exp).toBeDefined();
      expect(payload.timestamp).toBeDefined();
      expect(typeof payload.exp).toBe("number");
      expect(typeof payload.timestamp).toBe("number");
    });

    it("should set expiration 30 minutes in the future", async () => {
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const apiKey = "test-id.test-secret";
      const token = await generateZhipuToken(apiKey);

      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString());

      // Expiration should be ~30 minutes from now (in milliseconds)
      const expectedExp = now + 30 * 60 * 1000;
      expect(payload.exp).toBe(expectedExp);
      expect(payload.timestamp).toBe(now);

      vi.useRealTimers();
    });

    it("should throw error for invalid API key format (no separator)", async () => {
      const invalidKey = "invalid-key-without-separator";
      await expect(generateZhipuToken(invalidKey)).rejects.toThrow(
        "Invalid Zhipu API key format. Expected format: {id}.{secret}"
      );
    });

    it("should throw error for API key with multiple dots", async () => {
      const invalidKey = "id.secret.extra";
      await expect(generateZhipuToken(invalidKey)).rejects.toThrow("Invalid Zhipu API key format");
    });

    it("should generate URL-safe base64 (no +, /, or = characters)", async () => {
      const apiKey = "test-id.test-secret";
      const token = await generateZhipuToken(apiKey);

      // JWT parts should be URL-safe base64
      expect(token).not.toMatch(/[+/=]/);
    });

    it("should generate different tokens for different API keys", async () => {
      const token1 = await generateZhipuToken("id1.secret1");
      const token2 = await generateZhipuToken("id2.secret2");

      expect(token1).not.toBe(token2);
    });
  });
});

// =============================================================================
// ZhipuProvider Tests
// =============================================================================

describe("ZhipuProvider", () => {
  describe("constructor", () => {
    it("should have correct default base URL", () => {
      const provider = new ZhipuProvider();
      expect(provider.defaultBaseUrl).toBe("https://open.bigmodel.cn/api/paas/v4");
    });

    it("should have correct provider name", () => {
      const provider = new ZhipuProvider();
      expect(provider.providerName).toBe("zhipu");
    });
  });

  describe("listModels", () => {
    it("should return list of GLM models", () => {
      const provider = new ZhipuProvider();
      const models = provider.listModels();

      expect(models).toContain("glm-4");
      expect(models).toContain("glm-4-plus");
      expect(models).toContain("glm-4-flash");
      expect(models).toContain("glm-4v");
      expect(models).toContain("glm-4v-plus");
    });
  });

  describe("listModelsAsync", () => {
    it("should return full model info", async () => {
      const provider = new ZhipuProvider();
      const models = await provider.listModelsAsync();

      const glm4 = models.find((m) => m.id === "glm-4");
      expect(glm4).toBeDefined();
      expect(glm4?.provider).toBe("zhipu");
      expect(glm4?.contextWindow).toBe(128000);
      expect(glm4?.supportsTools).toBe(true);
      expect(glm4?.supportsStreaming).toBe(true);
    });

    it("should have vision model with supportsVision=true", async () => {
      const provider = new ZhipuProvider();
      const models = await provider.listModelsAsync();

      const glm4v = models.find((m) => m.id === "glm-4v");
      expect(glm4v).toBeDefined();
      expect(glm4v?.supportsVision).toBe(true);
    });

    it("should have reasoning model with supportsReasoning=true", async () => {
      const provider = new ZhipuProvider();
      const models = await provider.listModelsAsync();

      const glm4Plus = models.find((m) => m.id === "glm-4-plus");
      expect(glm4Plus).toBeDefined();
      expect(glm4Plus?.supportsReasoning).toBe(true);
    });
  });

  describe("getDefaultModel", () => {
    it("should return glm-4 as default", () => {
      const provider = new ZhipuProvider();
      expect(provider.getDefaultModel()).toBe("glm-4");
    });
  });

  describe("initialize", () => {
    it("should throw error when no API key provided", async () => {
      const provider = new ZhipuProvider();
      await expect(provider.initialize({})).rejects.toThrow("Zhipu API key is required");
    });

    it("should throw error for invalid API key format", async () => {
      const provider = new ZhipuProvider();
      await expect(provider.initialize({ apiKey: "invalid-key-no-dot" })).rejects.toThrow(
        "Invalid Zhipu API key format"
      );
    });

    it("should initialize successfully with valid API key format", async () => {
      const provider = new ZhipuProvider();
      await provider.initialize({ apiKey: "test-id.test-secret" });
      expect(provider.isInitialized()).toBe(true);
      expect(provider.isConfigured()).toBe(true);
    });
  });
});

// =============================================================================
// MoonshotProvider Tests
// =============================================================================

describe("MoonshotProvider", () => {
  describe("constructor", () => {
    it("should have correct default base URL", () => {
      const provider = new MoonshotProvider();
      expect(provider.defaultBaseUrl).toBe("https://api.moonshot.cn/v1");
    });

    it("should have correct provider name", () => {
      const provider = new MoonshotProvider();
      expect(provider.providerName).toBe("moonshot");
    });
  });

  describe("listModels", () => {
    it("should return list of Moonshot models with different context windows", () => {
      const provider = new MoonshotProvider();
      const models = provider.listModels();

      expect(models).toContain("moonshot-v1-8k");
      expect(models).toContain("moonshot-v1-32k");
      expect(models).toContain("moonshot-v1-128k");
    });
  });

  describe("listModelsAsync", () => {
    it("should return full model info with correct context windows", async () => {
      const provider = new MoonshotProvider();
      const models = await provider.listModelsAsync();

      const model8k = models.find((m) => m.id === "moonshot-v1-8k");
      expect(model8k?.contextWindow).toBe(8000);

      const model32k = models.find((m) => m.id === "moonshot-v1-32k");
      expect(model32k?.contextWindow).toBe(32000);

      const model128k = models.find((m) => m.id === "moonshot-v1-128k");
      expect(model128k?.contextWindow).toBe(128000);
    });

    it("should have all models with tools support but no vision", async () => {
      const provider = new MoonshotProvider();
      const models = await provider.listModelsAsync();

      for (const model of models) {
        expect(model.supportsTools).toBe(true);
        expect(model.supportsVision).toBe(false);
        expect(model.provider).toBe("moonshot");
      }
    });
  });

  describe("getDefaultModel", () => {
    it("should return moonshot-v1-32k as default", () => {
      const provider = new MoonshotProvider();
      expect(provider.getDefaultModel()).toBe("moonshot-v1-32k");
    });
  });

  describe("initialize", () => {
    it("should initialize successfully with API key", async () => {
      const provider = new MoonshotProvider();
      await provider.initialize({ apiKey: "sk-test123" });
      expect(provider.isInitialized()).toBe(true);
    });
  });
});

// =============================================================================
// YiProvider Tests
// =============================================================================

describe("YiProvider", () => {
  describe("constructor", () => {
    it("should have correct default base URL", () => {
      const provider = new YiProvider();
      expect(provider.defaultBaseUrl).toBe("https://api.lingyiwanwu.com/v1");
    });

    it("should have correct provider name", () => {
      const provider = new YiProvider();
      expect(provider.providerName).toBe("yi");
    });
  });

  describe("listModels", () => {
    it("should return list of Yi models", () => {
      const provider = new YiProvider();
      const models = provider.listModels();

      expect(models).toContain("yi-large");
      expect(models).toContain("yi-large-turbo");
      expect(models).toContain("yi-medium");
    });
  });

  describe("listModelsAsync", () => {
    it("should return full model info", async () => {
      const provider = new YiProvider();
      const models = await provider.listModelsAsync();

      const yiLarge = models.find((m) => m.id === "yi-large");
      expect(yiLarge).toBeDefined();
      expect(yiLarge?.provider).toBe("yi");
      expect(yiLarge?.contextWindow).toBe(32000);
      expect(yiLarge?.supportsTools).toBe(true);
    });

    it("should include pricing info", async () => {
      const provider = new YiProvider();
      const models = await provider.listModelsAsync();

      const yiMedium = models.find((m) => m.id === "yi-medium");
      expect(yiMedium?.inputPrice).toBeDefined();
      expect(yiMedium?.outputPrice).toBeDefined();
    });
  });

  describe("getDefaultModel", () => {
    it("should return yi-large as default", () => {
      const provider = new YiProvider();
      expect(provider.getDefaultModel()).toBe("yi-large");
    });
  });

  describe("initialize", () => {
    it("should initialize successfully with API key", async () => {
      const provider = new YiProvider();
      await provider.initialize({ apiKey: "test-api-key" });
      expect(provider.isInitialized()).toBe(true);
    });
  });
});

// =============================================================================
// BaichuanProvider Tests
// =============================================================================

describe("BaichuanProvider", () => {
  describe("constructor", () => {
    it("should have correct default base URL", () => {
      const provider = new BaichuanProvider();
      expect(provider.defaultBaseUrl).toBe("https://api.baichuan-ai.com/v1");
    });

    it("should have correct provider name", () => {
      const provider = new BaichuanProvider();
      expect(provider.providerName).toBe("baichuan");
    });
  });

  describe("listModels", () => {
    it("should return list of Baichuan models", () => {
      const provider = new BaichuanProvider();
      const models = provider.listModels();

      expect(models).toContain("Baichuan4");
      expect(models).toContain("Baichuan3-Turbo");
      expect(models).toContain("Baichuan3-Turbo-128k");
      expect(models).toContain("Baichuan2-Turbo");
    });
  });

  describe("listModelsAsync", () => {
    it("should return full model info", async () => {
      const provider = new BaichuanProvider();
      const models = await provider.listModelsAsync();

      const baichuan4 = models.find((m) => m.id === "Baichuan4");
      expect(baichuan4).toBeDefined();
      expect(baichuan4?.provider).toBe("baichuan");
      expect(baichuan4?.contextWindow).toBe(32000);
      expect(baichuan4?.supportsReasoning).toBe(true);
    });

    it("should have extended context model", async () => {
      const provider = new BaichuanProvider();
      const models = await provider.listModelsAsync();

      const turbo128k = models.find((m) => m.id === "Baichuan3-Turbo-128k");
      expect(turbo128k?.contextWindow).toBe(128000);
    });
  });

  describe("getDefaultModel", () => {
    it("should return Baichuan4 as default", () => {
      const provider = new BaichuanProvider();
      expect(provider.getDefaultModel()).toBe("Baichuan4");
    });
  });

  describe("initialize", () => {
    it("should initialize successfully with API key", async () => {
      const provider = new BaichuanProvider();
      await provider.initialize({ apiKey: "test-api-key" });
      expect(provider.isInitialized()).toBe(true);
    });
  });
});

// =============================================================================
// MistralProvider Tests
// =============================================================================

describe("MistralProvider", () => {
  describe("constructor", () => {
    it("should have correct default base URL", () => {
      const provider = new MistralProvider();
      expect(provider.defaultBaseUrl).toBe("https://api.mistral.ai/v1");
    });

    it("should have correct provider name", () => {
      const provider = new MistralProvider();
      expect(provider.providerName).toBe("mistral");
    });
  });

  describe("listModels", () => {
    it("should return list of Mistral models", () => {
      const provider = new MistralProvider();
      const models = provider.listModels();

      expect(models).toContain("mistral-large-latest");
      expect(models).toContain("mistral-small-latest");
      expect(models).toContain("codestral-latest");
    });
  });

  describe("listModelsAsync", () => {
    it("should return full model info", async () => {
      const provider = new MistralProvider();
      const models = await provider.listModelsAsync();

      const mistralLarge = models.find((m) => m.id === "mistral-large-latest");
      expect(mistralLarge).toBeDefined();
      expect(mistralLarge?.provider).toBe("mistral");
      expect(mistralLarge?.contextWindow).toBe(128000);
      expect(mistralLarge?.supportsReasoning).toBe(true);
    });

    it("should include code-specialized model", async () => {
      const provider = new MistralProvider();
      const models = await provider.listModelsAsync();

      const codestral = models.find((m) => m.id === "codestral-latest");
      expect(codestral).toBeDefined();
      expect(codestral?.supportsTools).toBe(true);
    });

    it("should include pricing info", async () => {
      const provider = new MistralProvider();
      const models = await provider.listModelsAsync();

      const mistralSmall = models.find((m) => m.id === "mistral-small-latest");
      expect(mistralSmall?.inputPrice).toBe(0.1);
      expect(mistralSmall?.outputPrice).toBe(0.3);
    });
  });

  describe("getDefaultModel", () => {
    it("should return mistral-large-latest as default", () => {
      const provider = new MistralProvider();
      expect(provider.getDefaultModel()).toBe("mistral-large-latest");
    });
  });

  describe("initialize", () => {
    it("should initialize successfully with API key", async () => {
      const provider = new MistralProvider();
      await provider.initialize({ apiKey: "test-api-key" });
      expect(provider.isInitialized()).toBe(true);
    });
  });
});
