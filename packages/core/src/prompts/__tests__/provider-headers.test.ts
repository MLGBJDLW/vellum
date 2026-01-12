// ============================================
// Provider Headers Integration Tests
// ============================================

/**
 * Integration tests for provider header loading and prompt integration.
 *
 * Tests cover:
 * - Loading all 4 provider headers (anthropic, openai, gemini, openrouter)
 * - Handling missing provider headers gracefully (return null)
 * - Provider header prepended to system prompt correctly
 *
 * @module @vellum/core/prompts/__tests__/provider-headers
 * @see T030
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PromptBuilder } from "../prompt-builder.js";
import { PromptLoader } from "../prompt-loader.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a temporary test directory.
 */
function createTempDir(prefix: string): string {
  const dir = join(
    tmpdir(),
    `vellum-provider-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Create a provider header file in the test directory.
 */
function createProviderFile(dir: string, provider: string, content: string): string {
  const providersDir = join(dir, "prompts", "markdown", "providers");
  mkdirSync(providersDir, { recursive: true });

  const filePath = join(providersDir, `${provider}.md`);
  writeFileSync(
    filePath,
    `---
id: provider-${provider}
name: ${provider.charAt(0).toUpperCase() + provider.slice(1)} Provider Header
category: provider
description: ${provider} specific instructions
version: "1.0"
---

${content}`
  );
  return filePath;
}

// =============================================================================
// Provider Headers Tests
// =============================================================================

describe("Provider Headers Integration", () => {
  let tempWorkspace: string;
  let loader: PromptLoader;

  beforeEach(() => {
    tempWorkspace = createTempDir("provider-headers");
    loader = new PromptLoader({
      discovery: { workspacePath: tempWorkspace },
      enableFallback: false,
    });
  });

  afterEach(() => {
    try {
      rmSync(tempWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("loadProviderHeader", () => {
    it("should load anthropic provider header", async () => {
      // Arrange
      createProviderFile(
        tempWorkspace,
        "anthropic",
        "You are running on Claude by Anthropic.\n\n## XML Tag Formatting\n\nUse XML tags for structured output."
      );

      // Act
      const header = await loader.loadProviderHeader("anthropic");

      // Assert
      expect(header).not.toBeNull();
      expect(header).toContain("Claude by Anthropic");
      expect(header).toContain("XML Tag Formatting");
    });

    it("should load openai provider header", async () => {
      // Arrange
      createProviderFile(
        tempWorkspace,
        "openai",
        "You are running on GPT by OpenAI.\n\n## Function Calling\n\nUse structured function calling format."
      );

      // Act
      const header = await loader.loadProviderHeader("openai");

      // Assert
      expect(header).not.toBeNull();
      expect(header).toContain("GPT by OpenAI");
      expect(header).toContain("Function Calling");
    });

    it("should load gemini provider header", async () => {
      // Arrange
      createProviderFile(
        tempWorkspace,
        "gemini",
        "You are running on Gemini by Google.\n\n## Multi-modal Awareness\n\nGemini supports multi-modal input."
      );

      // Act
      const header = await loader.loadProviderHeader("gemini");

      // Assert
      expect(header).not.toBeNull();
      expect(header).toContain("Gemini by Google");
      expect(header).toContain("Multi-modal Awareness");
    });

    it("should load openrouter provider header", async () => {
      // Arrange
      createProviderFile(
        tempWorkspace,
        "openrouter",
        "You are running through OpenRouter.\n\n## Model-Agnostic Guidelines\n\nUse standard markdown formatting."
      );

      // Act
      const header = await loader.loadProviderHeader("openrouter");

      // Assert
      expect(header).not.toBeNull();
      expect(header).toContain("OpenRouter");
      expect(header).toContain("Model-Agnostic Guidelines");
    });

    it("should return null for missing provider header", async () => {
      // Act - no file created
      const header = await loader.loadProviderHeader("nonexistent-provider");

      // Assert
      expect(header).toBeNull();
    });

    it("should return null for unknown provider without throwing", async () => {
      // Act
      const header = await loader.loadProviderHeader("unknown");

      // Assert - should gracefully return null, not throw
      expect(header).toBeNull();
    });
  });

  describe("PromptBuilder with provider header", () => {
    it("should prepend provider header to system prompt correctly", async () => {
      // Arrange
      createProviderFile(
        tempWorkspace,
        "anthropic",
        "You are running on Claude by Anthropic.\n\nUse XML tags for structured output."
      );

      const header = await loader.loadProviderHeader("anthropic");

      // Act
      const builder = new PromptBuilder();
      if (header) {
        builder.withProviderHeader(header);
      }
      builder.withBase("You are a helpful assistant.");
      const prompt = builder.build();

      // Assert - provider header should be in the prompt (since both are priority 1/base)
      expect(prompt).toContain("Claude by Anthropic");
      expect(prompt).toContain("helpful assistant");
      // Both sections should be present
      expect(prompt).toContain("Use XML tags");
    });

    it("should work without provider header", () => {
      // Act - no provider header added
      const builder = new PromptBuilder();
      builder.withBase("You are a helpful assistant.");
      const prompt = builder.build();

      // Assert
      expect(prompt).toBe("You are a helpful assistant.");
    });

    it("should handle empty provider header gracefully", () => {
      // Act
      const builder = new PromptBuilder();
      builder.withProviderHeader(""); // Empty string
      builder.withBase("Base content.");
      const prompt = builder.build();

      // Assert - should only have base content
      expect(prompt).toBe("Base content.");
    });

    it("should handle whitespace-only provider header gracefully", () => {
      // Act
      const builder = new PromptBuilder();
      builder.withProviderHeader("   \n\t  "); // Whitespace only
      builder.withBase("Base content.");
      const prompt = builder.build();

      // Assert - should only have base content
      expect(prompt).toBe("Base content.");
    });
  });
});
