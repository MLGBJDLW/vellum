/**
 * Local Provider Integration Tests
 *
 * These tests require a local LLM server to be running.
 * Tests skip gracefully if the server is not available.
 *
 * To run with Ollama:
 *   1. Install Ollama: https://ollama.ai
 *   2. Start server: ollama serve
 *   3. Pull a model: ollama pull llama3.2
 *   4. Run tests: pnpm test --run
 *
 * To run with LM Studio:
 *   1. Install LM Studio: https://lmstudio.ai
 *   2. Start local server on port 1234
 *   3. Load a model
 *   4. Run tests: pnpm test --run
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LMStudioProvider, OllamaProvider } from "../local.js";
import type { ProviderCredential } from "../types.js";

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Check if a URL is reachable
 */
async function isServerReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if Ollama is running
 */
async function isOllamaRunning(): Promise<boolean> {
  return isServerReachable("http://localhost:11434/api/tags");
}

/**
 * Check if LM Studio is running
 */
async function isLMStudioRunning(): Promise<boolean> {
  return isServerReachable("http://localhost:1234/v1/models");
}

// =============================================================================
// OllamaProvider Tests
// =============================================================================

describe("OllamaProvider", () => {
  let ollamaAvailable = false;

  beforeAll(async () => {
    ollamaAvailable = await isOllamaRunning();
    if (!ollamaAvailable) {
      console.log("⚠️  Ollama not running - skipping Ollama integration tests");
    }
  });

  describe("constructor", () => {
    it("should create provider with correct defaults", () => {
      const provider = new OllamaProvider();
      expect(provider.providerName).toBe("ollama");
      expect(provider.defaultBaseUrl).toBe("http://localhost:11434/v1");
    });
  });

  describe("getDefaultModel", () => {
    it("should return llama3.2 as default", () => {
      const provider = new OllamaProvider();
      expect(provider.getDefaultModel()).toBe("llama3.2");
    });
  });

  describe("listModels", () => {
    it("should return empty array synchronously", () => {
      const provider = new OllamaProvider();
      const models = provider.listModels();
      expect(models).toEqual([]);
    });
  });

  describe("validateCredential (offline)", () => {
    it("should return connection error when Ollama not running", async () => {
      // Skip if Ollama is actually running
      if (ollamaAvailable) {
        return;
      }

      const provider = new OllamaProvider();
      const credential: ProviderCredential = { type: "api_key", value: "" };
      const result = await provider.validateCredential(credential);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot connect to ollama");
    });
  });

  describe("isServerRunning (offline)", () => {
    it("should return false when Ollama not running", async () => {
      if (ollamaAvailable) {
        return;
      }

      const provider = new OllamaProvider();
      const running = await provider.isServerRunning();
      expect(running).toBe(false);
    });
  });

  describe.skipIf(!ollamaAvailable)("integration (requires Ollama)", () => {
    let provider: OllamaProvider;

    beforeEach(() => {
      provider = new OllamaProvider();
    });

    it("should validate credential when server is running", async () => {
      const credential: ProviderCredential = { type: "api_key", value: "" };
      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(true);
    });

    it("should report server as running", async () => {
      const running = await provider.isServerRunning();
      expect(running).toBe(true);
    });

    it("should initialize without API key", async () => {
      await expect(provider.initialize({})).resolves.not.toThrow();
    });

    it("should list available models", async () => {
      const models = await provider.listModelsAsync();
      expect(Array.isArray(models)).toBe(true);
      // If Ollama is running, there should be at least one model
      // (user may have pulled models)
      if (models.length > 0) {
        expect(models[0]).toHaveProperty("id");
        expect(models[0]).toHaveProperty("name");
        expect(models[0]).toHaveProperty("provider", "ollama");
        expect(models[0]).toHaveProperty("inputPrice", 0);
        expect(models[0]).toHaveProperty("outputPrice", 0);
      }
    });

    it("should complete a simple prompt if model available", async () => {
      // Initialize provider
      await provider.initialize({});

      // Get available models
      const models = await provider.listModelsAsync();
      if (models.length === 0) {
        console.log("⚠️  No Ollama models installed - skipping completion test");
        return;
      }

      // Use first available model
      const model = models[0];
      if (!model) {
        return;
      }

      // Simple completion test
      const result = await provider.complete({
        model: model.id,
        messages: [{ role: "user", content: "Say hello in one word." }],
        maxTokens: 10,
      });

      expect(result).toHaveProperty("content");
      expect(result).toHaveProperty("usage");
      expect(typeof result.content).toBe("string");
      expect(result.content.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// LMStudioProvider Tests
// =============================================================================

describe("LMStudioProvider", () => {
  let lmStudioAvailable = false;

  beforeAll(async () => {
    lmStudioAvailable = await isLMStudioRunning();
    if (!lmStudioAvailable) {
      console.log("⚠️  LM Studio not running - skipping LM Studio integration tests");
    }
  });

  describe("constructor", () => {
    it("should create provider with correct defaults", () => {
      const provider = new LMStudioProvider();
      expect(provider.providerName).toBe("lmstudio");
      expect(provider.defaultBaseUrl).toBe("http://localhost:1234/v1");
    });
  });

  describe("getDefaultModel", () => {
    it("should return local-model as default", () => {
      const provider = new LMStudioProvider();
      expect(provider.getDefaultModel()).toBe("local-model");
    });
  });

  describe("listModels", () => {
    it("should return empty array synchronously", () => {
      const provider = new LMStudioProvider();
      const models = provider.listModels();
      expect(models).toEqual([]);
    });
  });

  describe("validateCredential (offline)", () => {
    it("should return connection error when LM Studio not running", async () => {
      if (lmStudioAvailable) {
        return;
      }

      const provider = new LMStudioProvider();
      const credential: ProviderCredential = { type: "api_key", value: "" };
      const result = await provider.validateCredential(credential);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot connect to lmstudio");
    });
  });

  describe("isServerRunning (offline)", () => {
    it("should return false when LM Studio not running", async () => {
      if (lmStudioAvailable) {
        return;
      }

      const provider = new LMStudioProvider();
      const running = await provider.isServerRunning();
      expect(running).toBe(false);
    });
  });

  describe.skipIf(!lmStudioAvailable)("integration (requires LM Studio)", () => {
    let provider: LMStudioProvider;

    beforeEach(() => {
      provider = new LMStudioProvider();
    });

    it("should validate credential when server is running", async () => {
      const credential: ProviderCredential = { type: "api_key", value: "" };
      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(true);
    });

    it("should report server as running", async () => {
      const running = await provider.isServerRunning();
      expect(running).toBe(true);
    });

    it("should initialize without API key", async () => {
      await expect(provider.initialize({})).resolves.not.toThrow();
    });

    it("should list available models", async () => {
      const models = await provider.listModelsAsync();
      expect(Array.isArray(models)).toBe(true);
      if (models.length > 0) {
        expect(models[0]).toHaveProperty("id");
        expect(models[0]).toHaveProperty("name");
        expect(models[0]).toHaveProperty("provider", "lmstudio");
      }
    });

    it("should complete a simple prompt if model available", async () => {
      await provider.initialize({});

      const models = await provider.listModelsAsync();
      if (models.length === 0) {
        console.log("⚠️  No LM Studio models loaded - skipping completion test");
        return;
      }

      const model = models[0];
      if (!model) {
        return;
      }

      const result = await provider.complete({
        model: model.id,
        messages: [{ role: "user", content: "Say hello in one word." }],
        maxTokens: 10,
      });

      expect(result).toHaveProperty("content");
      expect(typeof result.content).toBe("string");
    });
  });
});

// =============================================================================
// LocalProvider Base Class Tests
// =============================================================================

describe("LocalProvider (base class)", () => {
  // Test the abstract class through concrete implementations
  describe("handleConnectionError", () => {
    it("should handle ECONNREFUSED errors", async () => {
      const provider = new OllamaProvider();
      const credential: ProviderCredential = { type: "api_key", value: "" };

      // This test relies on Ollama not being available
      const ollamaRunning = await isOllamaRunning();
      if (ollamaRunning) {
        return; // Skip - can't test offline behavior when server is up
      }

      const result = await provider.validateCredential(credential);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot connect");
      expect(result.error).toContain("ollama");
    });
  });
});
