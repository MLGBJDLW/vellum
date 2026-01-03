// ============================================
// PromptBuilder Unit Tests
// ============================================

/**
 * Unit tests for the PromptBuilder fluent API.
 *
 * Tests cover:
 * - Method chaining (fluent interface)
 * - Empty build behavior
 * - Layer ordering by priority
 * - Variable injection and substitution
 * - Size validation and PromptSizeError
 * - getLayers() readonly copy behavior
 *
 * @module @vellum/core/prompts/__tests__/prompt-builder
 */

import { describe, expect, it } from "vitest";
import { PromptBuilder } from "../prompt-builder.js";
import { MAX_PROMPT_SIZE, PromptSizeError } from "../types.js";

// =============================================================================
// Method Chaining Tests
// =============================================================================

describe("PromptBuilder - Method Chaining", () => {
  it("withBase returns this for chaining", () => {
    const builder = new PromptBuilder();
    const result = builder.withBase("base content");
    expect(result).toBe(builder);
  });

  it("withRole returns this for chaining", () => {
    const builder = new PromptBuilder();
    const result = builder.withRole("coder", "role content");
    expect(result).toBe(builder);
  });

  it("withModeOverrides returns this for chaining", () => {
    const builder = new PromptBuilder();
    const result = builder.withModeOverrides("mode content");
    expect(result).toBe(builder);
  });

  it("withSessionContext returns this for chaining", () => {
    const builder = new PromptBuilder();
    const result = builder.withSessionContext({
      activeFile: { path: "test.ts", language: "typescript" },
    });
    expect(result).toBe(builder);
  });

  it("setVariable returns this for chaining", () => {
    const builder = new PromptBuilder();
    const result = builder.setVariable("KEY", "value");
    expect(result).toBe(builder);
  });

  it("can chain multiple methods fluently", () => {
    const prompt = new PromptBuilder()
      .withBase("base")
      .withRole("coder", "role")
      .withModeOverrides("mode")
      .setVariable("VAR", "value")
      .build();

    expect(prompt).toContain("base");
    expect(prompt).toContain("role");
    expect(prompt).toContain("mode");
  });
});

// =============================================================================
// Empty Build Tests
// =============================================================================

describe("PromptBuilder - Empty Build", () => {
  it("returns empty string when no layers are added", () => {
    const builder = new PromptBuilder();
    const result = builder.build();
    expect(result).toBe("");
  });

  it("returns empty string when only whitespace content is added", () => {
    const builder = new PromptBuilder();
    builder.withBase("   ");
    builder.withRole("coder", "  \n  ");
    const result = builder.build();
    expect(result).toBe("");
  });

  it("getSize returns 0 for empty builder", () => {
    const builder = new PromptBuilder();
    expect(builder.getSize()).toBe(0);
  });

  it("getLayers returns empty array for new builder", () => {
    const builder = new PromptBuilder();
    const layers = builder.getLayers();
    expect(layers).toEqual([]);
    expect(layers.length).toBe(0);
  });
});

// =============================================================================
// Layer Ordering Tests
// =============================================================================

describe("PromptBuilder - Layer Ordering", () => {
  it("sorts layers by priority (1→2→3→4)", () => {
    // Add layers in reverse priority order
    const prompt = new PromptBuilder()
      .withSessionContext({ currentTask: { id: "T1", description: "Test", status: "pending" } })
      .withModeOverrides("MODE_CONTENT")
      .withRole("coder", "ROLE_CONTENT")
      .withBase("BASE_CONTENT")
      .build();

    // Base (1) should come before Role (2) before Mode (3) before Context (4)
    const baseIndex = prompt.indexOf("BASE_CONTENT");
    const roleIndex = prompt.indexOf("ROLE_CONTENT");
    const modeIndex = prompt.indexOf("MODE_CONTENT");
    const contextIndex = prompt.indexOf("### Current Task");

    expect(baseIndex).toBeLessThan(roleIndex);
    expect(roleIndex).toBeLessThan(modeIndex);
    expect(modeIndex).toBeLessThan(contextIndex);
  });

  it("base content comes first (priority 1)", () => {
    const prompt = new PromptBuilder().withRole("coder", "ROLE").withBase("BASE").build();

    expect(prompt.startsWith("BASE")).toBe(true);
  });

  it("role content comes after base (priority 2)", () => {
    const prompt = new PromptBuilder().withBase("BASE").withRole("qa", "ROLE").build();

    const baseIndex = prompt.indexOf("BASE");
    const roleIndex = prompt.indexOf("ROLE");
    expect(baseIndex).toBeLessThan(roleIndex);
  });

  it("mode content comes after role (priority 3)", () => {
    const prompt = new PromptBuilder().withModeOverrides("MODE").withRole("writer", "ROLE").build();

    const roleIndex = prompt.indexOf("ROLE");
    const modeIndex = prompt.indexOf("MODE");
    expect(roleIndex).toBeLessThan(modeIndex);
  });

  it("context content comes last (priority 4)", () => {
    const prompt = new PromptBuilder()
      .withSessionContext({ activeFile: { path: "test.ts", language: "typescript" } })
      .withModeOverrides("MODE")
      .build();

    const modeIndex = prompt.indexOf("MODE");
    const contextIndex = prompt.indexOf("### Active File");
    expect(modeIndex).toBeLessThan(contextIndex);
  });

  it("multiple layers of same priority preserve insertion order", () => {
    const builder = new PromptBuilder();
    builder.withBase("FIRST_BASE");
    builder.withBase("SECOND_BASE");

    const prompt = builder.build();
    const firstIndex = prompt.indexOf("FIRST_BASE");
    const secondIndex = prompt.indexOf("SECOND_BASE");

    expect(firstIndex).toBeLessThan(secondIndex);
  });

  it("layers are joined with double newlines", () => {
    const prompt = new PromptBuilder().withBase("BASE").withRole("coder", "ROLE").build();

    expect(prompt).toBe("BASE\n\nROLE");
  });
});

// =============================================================================
// Variable Injection Tests
// =============================================================================

describe("PromptBuilder - Variable Injection", () => {
  it("replaces {{KEY}} with setVariable value", () => {
    const prompt = new PromptBuilder()
      .withBase("Write code in {{LANGUAGE}}.")
      .setVariable("LANGUAGE", "TypeScript")
      .build();

    expect(prompt).toBe("Write code in TypeScript.");
  });

  it("replaces multiple variables", () => {
    const prompt = new PromptBuilder()
      .withBase("Use {{FRAMEWORK}} with {{LANGUAGE}}.")
      .setVariable("FRAMEWORK", "React")
      .setVariable("LANGUAGE", "TypeScript")
      .build();

    expect(prompt).toBe("Use React with TypeScript.");
  });

  it("replaces same variable multiple times", () => {
    const prompt = new PromptBuilder()
      .withBase("{{NAME}} is great. I love {{NAME}}.")
      .setVariable("NAME", "Vellum")
      .build();

    expect(prompt).toBe("Vellum is great. I love Vellum.");
  });

  it("unreplaced variables remain as-is", () => {
    const prompt = new PromptBuilder()
      .withBase("Hello {{NAME}}, welcome to {{PLACE}}.")
      .setVariable("NAME", "User")
      .build();

    expect(prompt).toBe("Hello User, welcome to {{PLACE}}.");
  });

  it("variables work across multiple layers", () => {
    const prompt = new PromptBuilder()
      .withBase("Base: {{VAR}}")
      .withRole("coder", "Role: {{VAR}}")
      .setVariable("VAR", "test")
      .build();

    expect(prompt).toContain("Base: test");
    expect(prompt).toContain("Role: test");
  });

  it("variable values are sanitized", () => {
    const prompt = new PromptBuilder()
      .withBase("Value: {{KEY}}")
      .setVariable("KEY", "  clean value  ")
      .build();

    // Should be trimmed
    expect(prompt).toBe("Value: clean value");
  });

  it("variable names are case-sensitive", () => {
    const prompt = new PromptBuilder()
      .withBase("{{name}} vs {{NAME}}")
      .setVariable("name", "lower")
      .setVariable("NAME", "UPPER")
      .build();

    expect(prompt).toBe("lower vs UPPER");
  });

  it("getSize accounts for variable substitutions", () => {
    const builder = new PromptBuilder().withBase("Hello {{NAME}}").setVariable("NAME", "World");

    // "Hello World" = 11 chars
    expect(builder.getSize()).toBe(11);
  });
});

// =============================================================================
// Size Validation Tests
// =============================================================================

describe("PromptBuilder - Size Validation", () => {
  it("getSize returns correct character count", () => {
    const content = "Hello World";
    const builder = new PromptBuilder().withBase(content);
    expect(builder.getSize()).toBe(content.length);
  });

  it("getSize includes all layers and separators", () => {
    const builder = new PromptBuilder()
      .withBase("BASE") // 4 chars
      .withRole("coder", "ROLE"); // 4 chars + 2 newlines

    // "BASE\n\nROLE" = 10 chars
    expect(builder.getSize()).toBe(10);
  });

  it("build throws PromptSizeError when exceeding MAX_PROMPT_SIZE", () => {
    // Create content that exceeds the limit
    const oversizedContent = "x".repeat(MAX_PROMPT_SIZE + 1);
    const builder = new PromptBuilder().withBase(oversizedContent);

    expect(() => builder.build()).toThrow(PromptSizeError);
  });

  it("PromptSizeError contains actual and max size", () => {
    const oversizedContent = "x".repeat(MAX_PROMPT_SIZE + 100);
    const builder = new PromptBuilder().withBase(oversizedContent);

    try {
      builder.build();
      expect.fail("Should have thrown PromptSizeError");
    } catch (error) {
      expect(error).toBeInstanceOf(PromptSizeError);
      const sizeError = error as PromptSizeError;
      expect(sizeError.actualSize).toBe(MAX_PROMPT_SIZE + 100);
      expect(sizeError.maxSize).toBe(MAX_PROMPT_SIZE);
    }
  });

  it("build succeeds at exactly MAX_PROMPT_SIZE", () => {
    const exactContent = "x".repeat(MAX_PROMPT_SIZE);
    const builder = new PromptBuilder().withBase(exactContent);

    expect(() => builder.build()).not.toThrow();
    expect(builder.getSize()).toBe(MAX_PROMPT_SIZE);
  });

  it("getSize does not throw for oversized content", () => {
    const oversizedContent = "x".repeat(MAX_PROMPT_SIZE + 1000);
    const builder = new PromptBuilder().withBase(oversizedContent);

    // getSize should return the size without throwing
    expect(builder.getSize()).toBe(MAX_PROMPT_SIZE + 1000);
  });

  it("PromptSizeError has correct error name", () => {
    const oversizedContent = "x".repeat(MAX_PROMPT_SIZE + 1);
    const builder = new PromptBuilder().withBase(oversizedContent);

    try {
      builder.build();
      expect.fail("Should have thrown PromptSizeError");
    } catch (error) {
      expect(error).toBeInstanceOf(PromptSizeError);
      const sizeError = error as PromptSizeError;
      expect(sizeError.name).toBe("PromptSizeError");
    }
  });

  it("PromptSizeError message includes actual and max size", () => {
    const oversizedContent = "x".repeat(MAX_PROMPT_SIZE + 50);
    const builder = new PromptBuilder().withBase(oversizedContent);

    try {
      builder.build();
      expect.fail("Should have thrown PromptSizeError");
    } catch (error) {
      const sizeError = error as PromptSizeError;
      expect(sizeError.message).toContain(`${MAX_PROMPT_SIZE + 50}`);
      expect(sizeError.message).toContain(`${MAX_PROMPT_SIZE}`);
    }
  });

  it("getSize returns exact character count for empty content", () => {
    const builder = new PromptBuilder();
    expect(builder.getSize()).toBe(0);
  });

  it("getSize accounts for multi-layer separators correctly", () => {
    // 3 layers: "A\n\nB\n\nC" = 1 + 2 + 1 + 2 + 1 = 7
    const builder = new PromptBuilder().withBase("A").withRole("coder", "B").withModeOverrides("C");

    expect(builder.getSize()).toBe(7);
  });

  it("oversized prompt with variables still throws", () => {
    // Use variable that makes it oversized
    const baseContent = "x".repeat(MAX_PROMPT_SIZE - 5);
    const builder = new PromptBuilder()
      .withBase(baseContent + "{{VAR}}")
      .setVariable("VAR", "toolong"); // 7 chars, exceeds limit

    expect(() => builder.build()).toThrow(PromptSizeError);
  });
});

// =============================================================================
// getLayers() Tests
// =============================================================================

describe("PromptBuilder - getLayers()", () => {
  it("returns a copy of internal layers", () => {
    const builder = new PromptBuilder().withBase("base content").withRole("coder", "role content");

    const layers = builder.getLayers();
    expect(layers.length).toBe(2);
  });

  it("returned layers have correct structure", () => {
    const builder = new PromptBuilder().withBase("test content");

    const layers = builder.getLayers();
    expect(layers[0]).toEqual({
      content: "test content",
      priority: 1,
      source: "base",
    });
  });

  it("returned array is frozen (readonly)", () => {
    const builder = new PromptBuilder().withBase("content");
    const layers = builder.getLayers();

    // Object.isFrozen should return true
    expect(Object.isFrozen(layers)).toBe(true);
  });

  it("modifying returned array does not affect builder", () => {
    const builder = new PromptBuilder().withBase("original");

    const layers = builder.getLayers();
    // Attempt to modify (this should throw in strict mode or be ignored)
    expect(() => {
      (layers as unknown[]).push({ content: "hacked", priority: 1, source: "base" });
    }).toThrow();

    // Builder should still have only 1 layer
    expect(builder.getLayers().length).toBe(1);
  });

  it("each call returns a new array instance", () => {
    const builder = new PromptBuilder().withBase("content");

    const layers1 = builder.getLayers();
    const layers2 = builder.getLayers();

    expect(layers1).not.toBe(layers2);
    expect(layers1).toEqual(layers2);
  });

  it("layers reflect the correct source type", () => {
    const builder = new PromptBuilder()
      .withBase("base")
      .withRole("analyst", "role")
      .withModeOverrides("mode")
      .withSessionContext({ activeFile: { path: "x.ts", language: "typescript" } });

    const layers = builder.getLayers();
    const sources = layers.map((l) => l.source);

    expect(sources).toContain("base");
    expect(sources).toContain("role");
    expect(sources).toContain("mode");
    expect(sources).toContain("context");
  });

  it("layers reflect the correct priorities", () => {
    const builder = new PromptBuilder()
      .withBase("base")
      .withRole("coder", "role")
      .withModeOverrides("mode")
      .withSessionContext({ currentTask: { id: "T1", description: "Test", status: "complete" } });

    const layers = builder.getLayers();
    const priorities = layers.map((l) => l.priority);

    expect(priorities).toContain(1); // base
    expect(priorities).toContain(2); // role
    expect(priorities).toContain(3); // mode
    expect(priorities).toContain(4); // context
  });
});

// =============================================================================
// Session Context Formatting Tests
// =============================================================================

describe("PromptBuilder - Session Context", () => {
  it("formats active file context", () => {
    const prompt = new PromptBuilder()
      .withSessionContext({
        activeFile: { path: "src/index.ts", language: "typescript" },
      })
      .build();

    expect(prompt).toContain("## Current Session");
    expect(prompt).toContain("### Active File");
    expect(prompt).toContain("- Path: src/index.ts");
    expect(prompt).toContain("- Language: typescript");
  });

  it("formats active file with selection", () => {
    const prompt = new PromptBuilder()
      .withSessionContext({
        activeFile: {
          path: "test.ts",
          language: "typescript",
          selection: "const x = 1;",
        },
      })
      .build();

    expect(prompt).toContain("- Selection: const x = 1;");
  });

  it("formats git status context", () => {
    const prompt = new PromptBuilder()
      .withSessionContext({
        gitStatus: {
          branch: "main",
          modified: ["file1.ts", "file2.ts"],
          staged: ["file3.ts"],
        },
      })
      .build();

    expect(prompt).toContain("### Git Status");
    expect(prompt).toContain("- Branch: main");
    expect(prompt).toContain("- Modified: 2 files");
    expect(prompt).toContain("- Staged: 1 files");
  });

  it("formats current task context", () => {
    const prompt = new PromptBuilder()
      .withSessionContext({
        currentTask: {
          id: "T001",
          description: "Fix the bug",
          status: "in-progress",
        },
      })
      .build();

    expect(prompt).toContain("### Current Task");
    expect(prompt).toContain("- ID: T001");
    expect(prompt).toContain("- Description: Fix the bug");
    expect(prompt).toContain("- Status: in-progress");
  });

  it("formats errors context", () => {
    const prompt = new PromptBuilder()
      .withSessionContext({
        errors: ["Error 1", "Error 2"],
      })
      .build();

    expect(prompt).toContain("### Errors");
    expect(prompt).toContain("- Error 1");
    expect(prompt).toContain("- Error 2");
  });

  it("handles empty session context", () => {
    const builder = new PromptBuilder().withSessionContext({});

    // Should not add any layer
    expect(builder.getLayers().length).toBe(0);
    expect(builder.build()).toBe("");
  });
});

// =============================================================================
// Static Factory Methods Tests
// =============================================================================

describe("PromptBuilder - Static Factory Methods", () => {
  it("fromLegacyConfig creates builder from systemPrompt", () => {
    const builder = PromptBuilder.fromLegacyConfig({
      systemPrompt: "You are an AI assistant.",
    });

    const prompt = builder.build();
    expect(prompt).toBe("You are an AI assistant.");
  });

  it("fromLegacyConfig creates builder from rolePrompt", () => {
    const builder = PromptBuilder.fromLegacyConfig({
      rolePrompt: "You write code.",
    });

    const prompt = builder.build();
    expect(prompt).toBe("You write code.");
  });

  it("fromLegacyConfig handles both prompts", () => {
    const builder = PromptBuilder.fromLegacyConfig({
      systemPrompt: "System",
      rolePrompt: "Role",
    });

    const prompt = builder.build();
    expect(prompt).toContain("System");
    expect(prompt).toContain("Role");
  });

  it("fromLegacyConfig returns empty builder for null config", () => {
    const builder = PromptBuilder.fromLegacyConfig(null);
    expect(builder.build()).toBe("");
  });

  it("fromLegacyConfig returns empty builder for undefined config", () => {
    const builder = PromptBuilder.fromLegacyConfig(undefined);
    expect(builder.build()).toBe("");
  });

  it("fromLegacyConfig ignores non-string prompts", () => {
    const builder = PromptBuilder.fromLegacyConfig({
      systemPrompt: 123,
      rolePrompt: { nested: "object" },
    });

    expect(builder.build()).toBe("");
  });
});
