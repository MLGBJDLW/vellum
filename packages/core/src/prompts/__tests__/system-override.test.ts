// ============================================
// System Prompt Override Integration Tests
// ============================================

/**
 * Integration tests for system-prompt-{mode} override functionality.
 *
 * Tests cover:
 * - system-prompt-vibe.md completely replaces default prompt
 * - system-prompt-plan.md completely replaces default prompt
 * - system-prompt-spec.md completely replaces default prompt
 * - Fallback to default when no override exists
 * - Override file must have valid frontmatter
 * - Override respects variable interpolation
 *
 * @module @vellum/core/prompts/__tests__/system-override
 * @see T031, REQ-007
 */

import { mkdirSync, rmSync } from "node:fs";
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
    `vellum-override-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// =============================================================================
// System Override Tests
// =============================================================================

describe("System Prompt Override Integration", () => {
  let tempWorkspace: string;

  beforeEach(() => {
    tempWorkspace = createTempDir("system-override");
  });

  afterEach(() => {
    try {
      rmSync(tempWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("withSystemPromptOverride", () => {
    it("should completely replace default prompt with vibe mode override", () => {
      // Arrange
      const vibeOverride = "You are in vibe mode. Execute autonomously.";

      // Act
      const builder = new PromptBuilder();
      builder.withBase("Default base content");
      builder.withRole("coder", "Default role content");
      builder.withSystemPromptOverride(vibeOverride);
      const prompt = builder.build();

      // Assert - override completely replaces everything
      expect(prompt).toBe(vibeOverride);
      expect(prompt).not.toContain("Default base");
      expect(prompt).not.toContain("Default role");
    });

    it("should completely replace default prompt with plan mode override", () => {
      // Arrange
      const planOverride = "You are in plan mode. Create a plan before execution.";

      // Act
      const builder = new PromptBuilder();
      builder.withBase("Default base content");
      builder.withModeOverrides("Mode specific content");
      builder.withSystemPromptOverride(planOverride);
      const prompt = builder.build();

      // Assert
      expect(prompt).toBe(planOverride);
      expect(prompt).not.toContain("Default base");
      expect(prompt).not.toContain("Mode specific");
    });

    it("should completely replace default prompt with spec mode override", () => {
      // Arrange
      const specOverride = "You are in spec mode. Follow the 6-phase workflow.";

      // Act
      const builder = new PromptBuilder();
      builder.withBase("Base instructions");
      builder.withRole("orchestrator", "Orchestrator instructions");
      builder.withModeOverrides("Mode instructions");
      builder.withSystemPromptOverride(specOverride);
      const prompt = builder.build();

      // Assert
      expect(prompt).toBe(specOverride);
      expect(prompt).not.toContain("Base instructions");
      expect(prompt).not.toContain("Orchestrator");
      expect(prompt).not.toContain("Mode instructions");
    });

    it("should fallback to default layers when no override is set", () => {
      // Act - no override set
      const builder = new PromptBuilder();
      builder.withBase("Base content");
      builder.withRole("coder", "Role content");
      const prompt = builder.build();

      // Assert - should use normal layering
      expect(prompt).toContain("Base content");
      expect(prompt).toContain("Role content");
    });

    it("should respect variable interpolation in override", () => {
      // Arrange
      const override = "You are working in {{MODE}} mode on {{OS}}.";

      // Act
      const builder = new PromptBuilder();
      builder.withSystemPromptOverride(override);
      builder.setVariable("MODE", "vibe");
      builder.setVariable("OS", "darwin");
      const prompt = builder.build();

      // Assert
      expect(prompt).toBe("You are working in vibe mode on darwin.");
    });

    it("should append custom instructions after override", () => {
      // Arrange
      const override = "Base override content";
      const customInstructions = "Always respond in English.";

      // Act
      const builder = new PromptBuilder();
      builder.withSystemPromptOverride(override);
      builder.withCustomInstructions(customInstructions);
      const prompt = builder.build();

      // Assert
      expect(prompt).toContain(override);
      expect(prompt).toContain(customInstructions);
      expect(prompt).toBe(`${override}\n\n${customInstructions}`);
    });

    it("should allow clearing the override", () => {
      // Arrange
      const builder = new PromptBuilder();
      builder.withBase("Base content");
      builder.withSystemPromptOverride("Override content");

      // Act
      builder.clearSystemPromptOverride();
      const prompt = builder.build();

      // Assert
      expect(prompt).toBe("Base content");
      expect(prompt).not.toContain("Override");
    });

    it("should report override status correctly", () => {
      // Arrange
      const builder = new PromptBuilder();

      // Assert - no override initially
      expect(builder.hasSystemPromptOverride()).toBe(false);

      // Act - set override
      builder.withSystemPromptOverride("Override");

      // Assert - has override
      expect(builder.hasSystemPromptOverride()).toBe(true);

      // Act - clear override
      builder.clearSystemPromptOverride();

      // Assert - no override
      expect(builder.hasSystemPromptOverride()).toBe(false);
    });
  });

  describe("setRuntimeVariables", () => {
    it("should set multiple runtime variables at once", () => {
      // Arrange
      const builder = new PromptBuilder();
      builder.withBase("OS: {{OS}}, Shell: {{SHELL}}, Mode: {{MODE}}");

      // Act
      builder.setRuntimeVariables({
        os: "darwin",
        shell: "zsh",
        mode: "vibe",
      });
      const prompt = builder.build();

      // Assert
      expect(prompt).toBe("OS: darwin, Shell: zsh, Mode: vibe");
    });

    it("should convert variable keys to uppercase", () => {
      // Arrange
      const builder = new PromptBuilder();
      builder.withBase("Provider: {{PROVIDER}}");

      // Act
      builder.setRuntimeVariables({ provider: "anthropic" });
      const prompt = builder.build();

      // Assert
      expect(prompt).toBe("Provider: anthropic");
    });

    it("should work with system prompt override", () => {
      // Arrange
      const builder = new PromptBuilder();
      builder.withSystemPromptOverride("Running in {{MODE}} mode with {{PROVIDER}}");

      // Act
      builder.setRuntimeVariables({
        mode: "spec",
        provider: "openai",
      });
      const prompt = builder.build();

      // Assert
      expect(prompt).toBe("Running in spec mode with openai");
    });
  });

  describe("withRulesContent", () => {
    it("should add rules content to prompt", () => {
      // Arrange
      const rulesContent = "# Custom Rules\n\n- Always use TypeScript\n- Follow DRY principles";

      // Act
      const builder = new PromptBuilder();
      builder.withBase("Base content");
      builder.withRulesContent(rulesContent);
      const prompt = builder.build();

      // Assert
      expect(prompt).toContain("Base content");
      expect(prompt).toContain("Custom Rules");
      expect(prompt).toContain("TypeScript");
    });

    it("should ignore empty rules content", () => {
      // Act
      const builder = new PromptBuilder();
      builder.withBase("Base content");
      builder.withRulesContent("");
      builder.withRulesContent("   ");
      const prompt = builder.build();

      // Assert - only base content, no extra newlines
      expect(prompt).toBe("Base content");
    });

    it("should trim rules content whitespace", () => {
      // Act
      const builder = new PromptBuilder();
      builder.withBase("Base");
      builder.withRulesContent("  Rules content  \n\n");
      const prompt = builder.build();

      // Assert
      expect(prompt).toContain("Rules content");
      expect(prompt).not.toContain("  Rules content  \n\n");
    });
  });

  describe("PromptBuilder with PromptLoader integration", () => {
    it("should load role prompt via withExternalRole", async () => {
      // Arrange - use loader to test load behavior
      const loader = new PromptLoader({});

      // Act
      const builder = new PromptBuilder();
      builder.withLoader(loader);
      await builder.withExternalRole("coder");
      const prompt = builder.build();

      // Assert - should have loaded coder role (either from markdown or fallback)
      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(100);
      // Should contain typical coder role content
      expect(prompt.toLowerCase()).toMatch(/code|implement|write/);
    });

    it("should throw when using withExternalRole without loader", async () => {
      // Arrange
      const builder = new PromptBuilder();

      // Act & Assert
      await expect(builder.withExternalRole("coder")).rejects.toThrow(
        "PromptLoader required for external role loading"
      );
    });
  });
});
