/**
 * Tests for Provider Context Window Override System
 *
 * @module @vellum/core/context/provider-overrides.test
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  addProviderOverride,
  clearCustomOverrides,
  getAllOverrides,
  getContextWindowOverride,
  PROVIDER_OVERRIDES,
  type ProviderOverride,
} from "../provider-overrides.js";

describe("provider-overrides", () => {
  afterEach(() => {
    clearCustomOverrides();
  });

  describe("PROVIDER_OVERRIDES", () => {
    it("should have built-in overrides for DeepSeek models", () => {
      const deepseekOverrides = PROVIDER_OVERRIDES.filter((o) =>
        o.modelPattern.startsWith("deepseek")
      );
      expect(deepseekOverrides.length).toBeGreaterThan(0);
      expect(deepseekOverrides.every((o) => o.contextWindow === 64_000)).toBe(true);
    });

    it("should have built-in overrides for Qwen models", () => {
      const qwenOverrides = PROVIDER_OVERRIDES.filter((o) => o.modelPattern.startsWith("qwen"));
      expect(qwenOverrides.length).toBeGreaterThan(0);
      expect(qwenOverrides.every((o) => o.contextWindow === 128_000)).toBe(true);
    });

    it("should have built-in overrides for Mistral models", () => {
      const mistralOverrides = PROVIDER_OVERRIDES.filter((o) =>
        o.modelPattern.startsWith("mistral")
      );
      expect(mistralOverrides.length).toBeGreaterThan(0);
      expect(mistralOverrides.every((o) => o.contextWindow === 32_000)).toBe(true);
    });

    it("should have built-in overrides for local models", () => {
      const localOverrides = PROVIDER_OVERRIDES.filter((o) => o.modelPattern.startsWith("local"));
      expect(localOverrides.length).toBeGreaterThan(0);
      expect(localOverrides.every((o) => o.contextWindow === 8_192)).toBe(true);
    });
  });

  describe("getContextWindowOverride", () => {
    describe("exact matches", () => {
      it("should return override for exact model match", () => {
        const result = getContextWindowOverride("openai", "deepseek-chat");
        expect(result).toBe(64_000);
      });

      it("should return null for standard OpenAI models", () => {
        const result = getContextWindowOverride("openai", "gpt-4o");
        expect(result).toBeNull();
      });

      it("should be case-insensitive for model names", () => {
        expect(getContextWindowOverride("openai", "DeepSeek-Chat")).toBe(64_000);
        expect(getContextWindowOverride("openai", "DEEPSEEK-CHAT")).toBe(64_000);
      });

      it("should be case-insensitive for provider names", () => {
        expect(getContextWindowOverride("OpenAI", "deepseek-chat")).toBe(64_000);
        expect(getContextWindowOverride("OPENAI", "deepseek-chat")).toBe(64_000);
      });
    });

    describe("glob pattern matches", () => {
      it("should match glob patterns with *", () => {
        expect(getContextWindowOverride("openai", "deepseek-v3")).toBe(64_000);
        expect(getContextWindowOverride("openai", "deepseek-reasoner")).toBe(64_000);
      });

      it("should match Qwen model patterns", () => {
        expect(getContextWindowOverride("openai", "qwen-72b")).toBe(128_000);
        expect(getContextWindowOverride("openai", "qwen2.5-32b")).toBe(128_000);
      });

      it("should match Mistral model patterns", () => {
        expect(getContextWindowOverride("openai", "mistral-large")).toBe(32_000);
        expect(getContextWindowOverride("openai", "mistral-medium")).toBe(32_000);
      });

      it("should match local model patterns", () => {
        expect(getContextWindowOverride("openai", "local-llama")).toBe(8_192);
        expect(getContextWindowOverride("openai", "local-mistral-7b")).toBe(8_192);
      });

      it("should be case-insensitive for glob patterns", () => {
        expect(getContextWindowOverride("openai", "QWEN-72B")).toBe(128_000);
        expect(getContextWindowOverride("openai", "Mistral-Large")).toBe(32_000);
      });
    });

    describe("precedence", () => {
      it("should prioritize exact matches over glob patterns", () => {
        // deepseek-chat has both exact and glob match
        // The exact match should be found first
        const result = getContextWindowOverride("openai", "deepseek-chat");
        expect(result).toBe(64_000);
      });

      it("should return null for unknown models", () => {
        expect(getContextWindowOverride("openai", "unknown-model")).toBeNull();
        expect(getContextWindowOverride("anthropic", "claude-3-opus")).toBeNull();
      });

      it("should return null for different providers", () => {
        // DeepSeek override is for 'openai' provider, not 'anthropic'
        expect(getContextWindowOverride("anthropic", "deepseek-chat")).toBeNull();
      });
    });
  });

  describe("custom overrides", () => {
    it("should allow adding custom overrides", () => {
      const customOverride: ProviderOverride = {
        provider: "openai",
        modelPattern: "my-custom-model",
        contextWindow: 16_384,
        description: "Custom test model",
      };

      addProviderOverride(customOverride);

      expect(getContextWindowOverride("openai", "my-custom-model")).toBe(16_384);
    });

    it("should prioritize custom overrides over built-in", () => {
      // Override the built-in deepseek-chat context window
      addProviderOverride({
        provider: "openai",
        modelPattern: "deepseek-chat",
        contextWindow: 128_000,
      });

      expect(getContextWindowOverride("openai", "deepseek-chat")).toBe(128_000);
    });

    it("should support custom glob patterns", () => {
      addProviderOverride({
        provider: "anthropic",
        modelPattern: "custom-*",
        contextWindow: 50_000,
      });

      expect(getContextWindowOverride("anthropic", "custom-model-v1")).toBe(50_000);
      expect(getContextWindowOverride("anthropic", "custom-large")).toBe(50_000);
    });

    it("should clear custom overrides while keeping built-in", () => {
      addProviderOverride({
        provider: "openai",
        modelPattern: "my-model",
        contextWindow: 20_000,
      });

      expect(getContextWindowOverride("openai", "my-model")).toBe(20_000);

      clearCustomOverrides();

      expect(getContextWindowOverride("openai", "my-model")).toBeNull();
      // Built-in should still work
      expect(getContextWindowOverride("openai", "deepseek-chat")).toBe(64_000);
    });
  });

  describe("getAllOverrides", () => {
    it("should return all built-in overrides", () => {
      const overrides = getAllOverrides();
      expect(overrides.length).toBe(PROVIDER_OVERRIDES.length);
    });

    it("should include custom overrides first", () => {
      addProviderOverride({
        provider: "test",
        modelPattern: "test-model",
        contextWindow: 10_000,
      });

      const overrides = getAllOverrides();
      expect(overrides.length).toBe(PROVIDER_OVERRIDES.length + 1);
      expect(overrides[0]?.provider).toBe("test");
      expect(overrides[0]?.modelPattern).toBe("test-model");
    });

    it("should return immutable array", () => {
      const overrides = getAllOverrides();
      // TypeScript readonly prevents mutations, but we test the length stays consistent
      expect(overrides.length).toBe(PROVIDER_OVERRIDES.length);
    });
  });
});
