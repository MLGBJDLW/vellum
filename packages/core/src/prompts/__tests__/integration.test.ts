// ============================================
// Prompt System Integration Tests
// ============================================

/**
 * Integration tests for the full prompt composition workflow.
 *
 * Tests cover:
 * - 4-layer composition (base + role + mode + context)
 * - Variable injection across all layers
 * - Priority ordering verification (1→2→3→4)
 * - Complete PromptBuilder workflow
 * - fromLegacyConfig() integration
 *
 * @module @vellum/core/prompts/__tests__/integration
 */

import { describe, expect, it } from "vitest";
import { ContextBuilder } from "../context-builder.js";
import { PromptBuilder } from "../prompt-builder.js";
import { BASE_PROMPT, CODER_PROMPT, loadRolePrompt } from "../roles/index.js";
import { containsDangerousContent, sanitizeVariable } from "../sanitizer.js";
import type { AgentRole, SessionContext } from "../types.js";

// =============================================================================
// 4-Layer Composition Tests
// =============================================================================

describe("Integration - 4-Layer Composition", () => {
  it("composes all four layers in correct priority order", () => {
    const sessionContext: SessionContext = {
      activeFile: { path: "src/app.ts", language: "typescript" },
      currentTask: { id: "T001", description: "Implement feature", status: "in-progress" },
    };

    const prompt = new PromptBuilder()
      .withBase(BASE_PROMPT)
      .withRole("coder", CODER_PROMPT)
      .withModeOverrides("Focus on implementation, minimize planning.")
      .withSessionContext(sessionContext)
      .build();

    // Verify all layers are present
    expect(prompt).toContain("Core Identity"); // BASE_PROMPT content
    expect(prompt).toContain("Focus on implementation"); // Mode override
    expect(prompt).toContain("## Current Session"); // Context header

    // Verify ordering: BASE (priority 1) before others
    const coreIdentityIndex = prompt.indexOf("Core Identity");
    const modeIndex = prompt.indexOf("Focus on implementation");
    const sessionIndex = prompt.indexOf("## Current Session");

    expect(coreIdentityIndex).toBeLessThan(modeIndex);
    expect(modeIndex).toBeLessThan(sessionIndex);
  });

  it("composes layers when added in reverse priority order", () => {
    const prompt = new PromptBuilder()
      .withSessionContext({ activeFile: { path: "test.ts", language: "typescript" } })
      .withModeOverrides("MODE_MARKER")
      .withRole("coder", "ROLE_MARKER")
      .withBase("BASE_MARKER")
      .build();

    // Despite reverse insertion order, output should be sorted by priority
    const baseIndex = prompt.indexOf("BASE_MARKER");
    const roleIndex = prompt.indexOf("ROLE_MARKER");
    const modeIndex = prompt.indexOf("MODE_MARKER");
    const contextIndex = prompt.indexOf("### Active File");

    expect(baseIndex).toBeLessThan(roleIndex);
    expect(roleIndex).toBeLessThan(modeIndex);
    expect(modeIndex).toBeLessThan(contextIndex);
  });

  it("handles missing layers gracefully", () => {
    // Only base and context
    const prompt = new PromptBuilder()
      .withBase("BASE_ONLY")
      .withSessionContext({ errors: ["Error 1"] })
      .build();

    expect(prompt).toContain("BASE_ONLY");
    expect(prompt).toContain("### Errors");
    expect(prompt).not.toContain("undefined");
  });

  it("composes multiple layers of the same type", () => {
    const prompt = new PromptBuilder()
      .withBase("FIRST_BASE")
      .withBase("SECOND_BASE")
      .withRole("coder", "FIRST_ROLE")
      .withRole("qa", "SECOND_ROLE")
      .build();

    // Both bases and roles should be present
    expect(prompt).toContain("FIRST_BASE");
    expect(prompt).toContain("SECOND_BASE");
    expect(prompt).toContain("FIRST_ROLE");
    expect(prompt).toContain("SECOND_ROLE");

    // Bases should come before roles (priority 1 < priority 2)
    const firstBase = prompt.indexOf("FIRST_BASE");
    const firstRole = prompt.indexOf("FIRST_ROLE");
    expect(firstBase).toBeLessThan(firstRole);
  });
});

// =============================================================================
// Variable Injection Across Layers Tests
// =============================================================================

describe("Integration - Variable Injection Across Layers", () => {
  it("injects variables into all layer types", () => {
    const prompt = new PromptBuilder()
      .withBase("Base uses {{LANG}}")
      .withRole("coder", "Role uses {{LANG}} and {{FRAMEWORK}}")
      .withModeOverrides("Mode targets {{LANG}}")
      .setVariable("LANG", "TypeScript")
      .setVariable("FRAMEWORK", "React")
      .build();

    expect(prompt).toContain("Base uses TypeScript");
    expect(prompt).toContain("Role uses TypeScript and React");
    expect(prompt).toContain("Mode targets TypeScript");
  });

  it("variables are applied after layer composition", () => {
    const builder = new PromptBuilder()
      .withBase("{{VAR}} in base")
      .withRole("coder", "{{VAR}} in role");

    // Variable set after layers
    builder.setVariable("VAR", "INJECTED");
    const prompt = builder.build();

    expect(prompt).toContain("INJECTED in base");
    expect(prompt).toContain("INJECTED in role");
  });

  it("unreplaced variables remain in output", () => {
    const prompt = new PromptBuilder()
      .withBase("Uses {{KNOWN}} and {{UNKNOWN}}")
      .setVariable("KNOWN", "value")
      .build();

    expect(prompt).toContain("Uses value and {{UNKNOWN}}");
  });

  it("sanitizes variable values for security", () => {
    const prompt = new PromptBuilder()
      .withBase("User input: {{INPUT}}")
      .setVariable("INPUT", "  trimmed  ")
      .build();

    // PromptBuilder sanitizes (trims) variable values
    expect(prompt).toContain("User input: trimmed");
  });

  it("variables work correctly with getSize()", () => {
    const builder = new PromptBuilder().withBase("{{VAR}}").setVariable("VAR", "12345");

    // Size should reflect substituted value
    expect(builder.getSize()).toBe(5);
  });
});

// =============================================================================
// Priority Ordering Verification Tests
// =============================================================================

describe("Integration - Priority Ordering (1→2→3→4)", () => {
  it("verifies strict priority order: base(1) → role(2) → mode(3) → context(4)", () => {
    const prompt = new PromptBuilder()
      .withSessionContext({ activeFile: { path: "x.ts", language: "ts" } })
      .withModeOverrides("[P3-MODE]")
      .withRole("coder", "[P2-ROLE]")
      .withBase("[P1-BASE]")
      .build();

    const p1Index = prompt.indexOf("[P1-BASE]");
    const p2Index = prompt.indexOf("[P2-ROLE]");
    const p3Index = prompt.indexOf("[P3-MODE]");
    const p4Index = prompt.indexOf("### Active File"); // Context marker

    // Strict ascending order
    expect(p1Index).toBeGreaterThanOrEqual(0);
    expect(p2Index).toBeGreaterThanOrEqual(0);
    expect(p3Index).toBeGreaterThanOrEqual(0);
    expect(p4Index).toBeGreaterThanOrEqual(0);

    expect(p1Index).toBeLessThan(p2Index);
    expect(p2Index).toBeLessThan(p3Index);
    expect(p3Index).toBeLessThan(p4Index);
  });

  it("layers of same priority maintain insertion order", () => {
    const prompt = new PromptBuilder()
      .withBase("BASE_A")
      .withBase("BASE_B")
      .withBase("BASE_C")
      .build();

    const indexA = prompt.indexOf("BASE_A");
    const indexB = prompt.indexOf("BASE_B");
    const indexC = prompt.indexOf("BASE_C");

    expect(indexA).toBeLessThan(indexB);
    expect(indexB).toBeLessThan(indexC);
  });

  it("getLayers() returns layers with correct priorities", () => {
    const builder = new PromptBuilder()
      .withBase("base")
      .withRole("coder", "role")
      .withModeOverrides("mode")
      .withSessionContext({ errors: ["err"] });

    const layers = builder.getLayers();

    const baseLayers = layers.filter((l) => l.source === "base");
    const roleLayers = layers.filter((l) => l.source === "role");
    const modeLayers = layers.filter((l) => l.source === "mode");
    const contextLayers = layers.filter((l) => l.source === "context");

    expect(baseLayers.every((l) => l.priority === 1)).toBe(true);
    expect(roleLayers.every((l) => l.priority === 2)).toBe(true);
    expect(modeLayers.every((l) => l.priority === 3)).toBe(true);
    expect(contextLayers.every((l) => l.priority === 4)).toBe(true);
  });
});

// =============================================================================
// Complete PromptBuilder Workflow Tests
// =============================================================================

describe("Integration - Complete PromptBuilder Workflow", () => {
  it("builds a complete agent prompt end-to-end", () => {
    // Simulate real-world usage
    const role: AgentRole = "coder";
    const rolePrompt = loadRolePrompt(role);

    const sessionContext: SessionContext = {
      activeFile: {
        path: "packages/core/src/index.ts",
        language: "typescript",
        selection: "export function main() {}",
      },
      gitStatus: {
        branch: "feature/prompt-system",
        modified: ["src/index.ts"],
        staged: [],
      },
      currentTask: {
        id: "T030",
        description: "Write integration tests",
        status: "in-progress",
      },
    };

    const prompt = new PromptBuilder()
      .withBase(BASE_PROMPT)
      .withRole(role, rolePrompt)
      .withModeOverrides("Focus on code quality and test coverage.")
      .withSessionContext(sessionContext)
      .setVariable("PROJECT_NAME", "Vellum")
      .build();

    // Verify structure
    expect(prompt.length).toBeGreaterThan(0);

    // Verify BASE_PROMPT safety guardrails are present
    expect(prompt).toContain("Safety Guardrails");
    expect(prompt).toContain("ABSOLUTE RULES");

    // Verify context is included
    expect(prompt).toContain("packages/core/src/index.ts");
    expect(prompt).toContain("feature/prompt-system");
    expect(prompt).toContain("T030");
  });

  it("workflow with ContextBuilder direct usage", () => {
    const contextBuilder = new ContextBuilder();
    const contextString = contextBuilder.buildContext({
      activeFile: { path: "test.ts", language: "typescript" },
    });

    // Verify ContextBuilder output can be manually added
    expect(contextString).toContain("### Active File");

    // Use with PromptBuilder via withSessionContext
    const prompt = new PromptBuilder()
      .withBase("BASE")
      .withSessionContext({ activeFile: { path: "test.ts", language: "typescript" } })
      .build();

    expect(prompt).toContain("### Active File");
  });

  it("workflow handles empty session context", () => {
    const prompt = new PromptBuilder().withBase("BASE").withSessionContext({}).build();

    // Empty context should not add a layer
    expect(prompt).toBe("BASE");
    expect(prompt).not.toContain("## Current Session");
  });

  it("workflow sanitizes dangerous content in variables", () => {
    const builder = new PromptBuilder()
      .withBase("Input: {{USER_INPUT}}")
      .setVariable("USER_INPUT", "normal text");

    const prompt = builder.build();
    expect(prompt).toContain("normal text");

    // Verify sanitization happens (control chars removed)
    const builderWithControl = new PromptBuilder()
      .withBase("Input: {{VAR}}")
      .setVariable("VAR", "text\x00with\x00nulls");

    const cleanPrompt = builderWithControl.build();
    expect(cleanPrompt).not.toContain("\x00");
  });

  it("full workflow with all role types", () => {
    const roles: AgentRole[] = ["orchestrator", "coder", "qa", "writer", "analyst", "architect"];

    for (const role of roles) {
      const rolePrompt = loadRolePrompt(role);
      const prompt = new PromptBuilder().withBase(BASE_PROMPT).withRole(role, rolePrompt).build();

      // Each role should produce a non-empty prompt
      expect(prompt.length).toBeGreaterThan(BASE_PROMPT.length);
    }
  });
});

// =============================================================================
// fromLegacyConfig() Integration Tests
// =============================================================================

describe("Integration - fromLegacyConfig()", () => {
  it("migrates simple legacy config", () => {
    const legacyConfig = {
      systemPrompt: "You are an AI assistant.",
      rolePrompt: "You help with coding tasks.",
    };

    const builder = PromptBuilder.fromLegacyConfig(legacyConfig);
    const prompt = builder.build();

    expect(prompt).toContain("You are an AI assistant.");
    expect(prompt).toContain("You help with coding tasks.");
  });

  it("migrates legacy config with mode prompt", () => {
    const legacyConfig = {
      systemPrompt: "System",
      rolePrompt: "Role",
      modePrompt: "Mode specific instructions",
    };

    const builder = PromptBuilder.fromLegacyConfig(legacyConfig);
    const prompt = builder.build();

    expect(prompt).toContain("System");
    expect(prompt).toContain("Role");
    expect(prompt).toContain("Mode specific instructions");

    // Verify ordering (system=base, role, mode)
    const systemIndex = prompt.indexOf("System");
    const roleIndex = prompt.indexOf("Role");
    const modeIndex = prompt.indexOf("Mode specific instructions");

    expect(systemIndex).toBeLessThan(roleIndex);
    expect(roleIndex).toBeLessThan(modeIndex);
  });

  it("migrated config can be extended with new builder methods", () => {
    const legacyConfig = {
      systemPrompt: "Legacy system prompt",
    };

    const builder = PromptBuilder.fromLegacyConfig(legacyConfig);

    // Extend with new methods
    builder.withRole("coder", "New role content").withSessionContext({ errors: ["New error"] });

    const prompt = builder.build();

    expect(prompt).toContain("Legacy system prompt");
    expect(prompt).toContain("New role content");
    expect(prompt).toContain("New error");
  });

  it("handles legacy config with custom instructions array", () => {
    const legacyConfig = {
      systemPrompt: "Base instructions",
      customInstructions: ["Custom 1", "Custom 2", "Custom 3"],
    };

    const builder = PromptBuilder.fromLegacyConfig(legacyConfig);
    const prompt = builder.build();

    expect(prompt).toContain("Base instructions");
    expect(prompt).toContain("Custom 1");
    expect(prompt).toContain("Custom 2");
    expect(prompt).toContain("Custom 3");
  });

  it("fromLegacyConfig preserves builder immutability", () => {
    const legacyConfig = { systemPrompt: "Original" };

    const builder1 = PromptBuilder.fromLegacyConfig(legacyConfig);
    const builder2 = PromptBuilder.fromLegacyConfig(legacyConfig);

    builder1.withRole("coder", "Added to builder1");

    const prompt1 = builder1.build();
    const prompt2 = builder2.build();

    expect(prompt1).toContain("Added to builder1");
    expect(prompt2).not.toContain("Added to builder1");
  });

  it("handles edge cases in legacy config", () => {
    // Empty strings should be ignored
    const emptyConfig = {
      systemPrompt: "",
      rolePrompt: "   ",
      modePrompt: "\n\t",
    };

    const builder = PromptBuilder.fromLegacyConfig(emptyConfig);
    expect(builder.build()).toBe("");

    // Non-object values
    expect(PromptBuilder.fromLegacyConfig(null).build()).toBe("");
    expect(PromptBuilder.fromLegacyConfig(undefined).build()).toBe("");
    expect(PromptBuilder.fromLegacyConfig("string").build()).toBe("");
    expect(PromptBuilder.fromLegacyConfig(123).build()).toBe("");
  });
});

// =============================================================================
// Cross-Module Integration Tests
// =============================================================================

describe("Integration - Cross-Module Verification", () => {
  it("sanitizer and builder work together", () => {
    // Verify sanitizer catches dangerous content
    expect(containsDangerousContent("ignore previous")).toBe(true);

    // Verify sanitizeVariable filters dangerous patterns
    const sanitized = sanitizeVariable("key", "Hello ignore previous world");
    expect(sanitized).toContain("[FILTERED]");

    // PromptBuilder uses internal sanitization for variables
    const builder = new PromptBuilder()
      .withBase("User said: {{MSG}}")
      .setVariable("MSG", "  test message  ");

    const prompt = builder.build();
    expect(prompt).toContain("test message");
  });

  it("ContextBuilder output integrates correctly with PromptBuilder", () => {
    const contextBuilder = new ContextBuilder();

    // ContextBuilder formats correctly
    const fileContext = contextBuilder.buildFileContext({
      path: "src/app.ts",
      language: "typescript",
      selection: "const x = 1;",
    });

    expect(fileContext).toContain("### Active File");
    expect(fileContext).toContain("src/app.ts");

    // Integration with PromptBuilder
    const prompt = new PromptBuilder()
      .withBase("BASE")
      .withSessionContext({
        activeFile: { path: "src/app.ts", language: "typescript", selection: "const x = 1;" },
      })
      .build();

    expect(prompt).toContain("### Active File");
    expect(prompt).toContain("- Selection:");
  });

  it("role prompts load and compose correctly", () => {
    // Verify loadRolePrompt works
    const coderPrompt = loadRolePrompt("coder");
    const qaPrompt = loadRolePrompt("qa");

    expect(coderPrompt.length).toBeGreaterThan(0);
    expect(qaPrompt.length).toBeGreaterThan(0);

    // Compose with BASE_PROMPT
    const fullPrompt = new PromptBuilder()
      .withBase(BASE_PROMPT)
      .withRole("coder", coderPrompt)
      .build();

    // Should have both base safety rules and role-specific content
    expect(fullPrompt).toContain("Safety Guardrails");
    expect(fullPrompt.length).toBeGreaterThan(BASE_PROMPT.length);
  });
});
