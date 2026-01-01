// ============================================
// Prompt Builder Tests
// ============================================

import { describe, expect, it } from "vitest";
import { AgentsPromptBuilder, createPromptBuilder, type PromptSection } from "../prompt-builder.js";
import type { AgentsConfig } from "../types.js";

// ============================================
// Test Fixtures
// ============================================

function createMinimalConfig(overrides: Partial<AgentsConfig> = {}): AgentsConfig {
  return {
    priority: 100,
    allowedTools: [],
    instructions: "",
    merge: { strategy: "extend", arrays: "append" },
    scope: { include: [], exclude: [] },
    sources: [],
    ...overrides,
  };
}

// ============================================
// Test Suites
// ============================================

describe("AgentsPromptBuilder", () => {
  describe("constructor", () => {
    it("should create instance with default options", () => {
      const builder = new AgentsPromptBuilder();
      expect(builder).toBeDefined();
    });

    it("should create instance with custom options", () => {
      const builder = new AgentsPromptBuilder({
        includeSourceAttribution: false,
        includeMetadataHeader: false,
        maxSectionLength: 1000,
      });
      expect(builder).toBeDefined();
    });
  });

  describe("buildSystemPromptSections", () => {
    it("should return empty sections for null config", () => {
      const builder = new AgentsPromptBuilder();
      const result = builder.buildSystemPromptSections(null);

      expect(result.sections).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it("should return empty sections for config with no instructions", () => {
      const builder = new AgentsPromptBuilder();
      const config = createMinimalConfig({ instructions: "" });
      const result = builder.buildSystemPromptSections(config);

      expect(result.sections).toEqual([]);
    });

    it("should build instructions section from config", () => {
      const builder = new AgentsPromptBuilder();
      const config = createMinimalConfig({
        instructions: "Follow these rules.",
        sources: ["AGENTS.md"],
      });
      const result = builder.buildSystemPromptSections(config);

      expect(result.sections.length).toBeGreaterThanOrEqual(1);
      const instructionsSection = result.sections.find((s) =>
        s.content.includes("Follow these rules")
      );
      expect(instructionsSection).toBeDefined();
    });

    it("should include metadata header when config has name", () => {
      const builder = new AgentsPromptBuilder({ includeMetadataHeader: true });
      const config = createMinimalConfig({
        name: "My Project",
        instructions: "Some rules",
        sources: ["AGENTS.md"],
      });
      const result = builder.buildSystemPromptSections(config);

      const metadataSection = result.sections.find((s) => s.content.includes("My Project"));
      expect(metadataSection).toBeDefined();
    });

    it("should include description in metadata header", () => {
      const builder = new AgentsPromptBuilder({ includeMetadataHeader: true });
      const config = createMinimalConfig({
        name: "My Project",
        description: "A great project",
        instructions: "Some rules",
        sources: ["AGENTS.md"],
      });
      const result = builder.buildSystemPromptSections(config);

      const metadataSection = result.sections.find((s) => s.content.includes("A great project"));
      expect(metadataSection).toBeDefined();
    });

    it("should include version in metadata header", () => {
      const builder = new AgentsPromptBuilder({ includeMetadataHeader: true });
      const config = createMinimalConfig({
        version: "1.0.0",
        instructions: "Some rules",
        sources: ["AGENTS.md"],
      });
      const result = builder.buildSystemPromptSections(config);

      const metadataSection = result.sections.find((s) => s.content.includes("1.0.0"));
      expect(metadataSection).toBeDefined();
    });

    it("should include source attribution when enabled", () => {
      const builder = new AgentsPromptBuilder({
        includeSourceAttribution: true,
        includeMetadataHeader: true,
      });
      const config = createMinimalConfig({
        name: "Test",
        instructions: "Rules here",
        sources: ["AGENTS.md", "child/AGENTS.md"],
      });
      const result = builder.buildSystemPromptSections(config);

      const hasSourceAttribution = result.sections.some(
        (s) => s.content.includes("AGENTS.md") && s.content.includes("child/AGENTS.md")
      );
      expect(hasSourceAttribution).toBe(true);
    });

    it("should exclude source attribution when disabled", () => {
      const builder = new AgentsPromptBuilder({
        includeSourceAttribution: false,
        includeMetadataHeader: false,
      });
      const config = createMinimalConfig({
        instructions: "Rules here",
        sources: ["AGENTS.md"],
      });
      const result = builder.buildSystemPromptSections(config);

      const hasSourceAttribution = result.sections.some((s) => s.content.includes("Source:"));
      expect(hasSourceAttribution).toBe(false);
    });

    it("should exclude metadata header when disabled", () => {
      const builder = new AgentsPromptBuilder({
        includeMetadataHeader: false,
      });
      const config = createMinimalConfig({
        name: "My Project",
        instructions: "Some rules",
        sources: ["AGENTS.md"],
      });
      const result = builder.buildSystemPromptSections(config);

      const hasMetadataHeader = result.sections.some((s) =>
        s.content.includes("AGENTS.md Configuration")
      );
      expect(hasMetadataHeader).toBe(false);
    });

    it("should sort sections by priority (highest first)", () => {
      const builder = new AgentsPromptBuilder({
        includeMetadataHeader: true,
      });
      const config = createMinimalConfig({
        name: "Test",
        instructions: "Instructions content",
        sources: ["AGENTS.md"],
      });
      const result = builder.buildSystemPromptSections(config);

      // Metadata has higher priority than instructions
      if (result.sections.length >= 2) {
        expect(result.sections[0]?.priority).toBeGreaterThanOrEqual(result.sections[1]?.priority);
      }
    });

    it("should truncate content when maxSectionLength is set", () => {
      const builder = new AgentsPromptBuilder({
        maxSectionLength: 200,
        includeMetadataHeader: false,
        includeSourceAttribution: false,
      });
      const config = createMinimalConfig({
        instructions: "A".repeat(500), // 500 character string
        sources: ["AGENTS.md"],
      });
      const result = builder.buildSystemPromptSections(config);

      const instructionsSection = result.sections.find((s) => s.content.includes("A"));
      expect(instructionsSection).toBeDefined();
      expect(instructionsSection?.content.length).toBeLessThan(500); // Content was truncated
      expect(instructionsSection?.content).toContain("truncated");
    });

    it("should not truncate when content is under limit", () => {
      const builder = new AgentsPromptBuilder({
        maxSectionLength: 1000,
      });
      const config = createMinimalConfig({
        instructions: "Short content",
        sources: ["AGENTS.md"],
      });
      const result = builder.buildSystemPromptSections(config);

      const instructionsSection = result.sections.find((s) => s.content.includes("Short content"));
      expect(instructionsSection).toBeDefined();
      expect(instructionsSection?.content).not.toContain("truncated");
    });

    it("should handle whitespace-only instructions", () => {
      const builder = new AgentsPromptBuilder();
      const config = createMinimalConfig({
        instructions: "   \n\t  ",
        sources: ["AGENTS.md"],
      });
      const result = builder.buildSystemPromptSections(config);

      // Should not include whitespace-only instructions
      expect(result.sections.length).toBe(0);
    });
  });

  describe("formatAsSystemPrompt", () => {
    it("should return empty string for empty sections", () => {
      const builder = new AgentsPromptBuilder();
      const result = builder.formatAsSystemPrompt([]);

      expect(result).toBe("");
    });

    it("should join sections with double newlines", () => {
      const builder = new AgentsPromptBuilder();
      const sections: PromptSection[] = [
        { content: "Section 1", priority: 100, source: "a.md" },
        { content: "Section 2", priority: 50, source: "b.md" },
      ];
      const result = builder.formatAsSystemPrompt(sections);

      expect(result).toBe("Section 1\n\nSection 2");
    });

    it("should handle single section", () => {
      const builder = new AgentsPromptBuilder();
      const sections: PromptSection[] = [
        { content: "Only section", priority: 100, source: "a.md" },
      ];
      const result = builder.formatAsSystemPrompt(sections);

      expect(result).toBe("Only section");
    });
  });

  describe("build", () => {
    it("should build and format in one call", () => {
      const builder = new AgentsPromptBuilder();
      const config = createMinimalConfig({
        instructions: "Complete instructions",
        sources: ["AGENTS.md"],
      });
      const result = builder.build(config);

      expect(result).toContain("Complete instructions");
    });

    it("should return empty string for null config", () => {
      const builder = new AgentsPromptBuilder();
      const result = builder.build(null);

      expect(result).toBe("");
    });
  });

  describe("getSectionContents", () => {
    it("should return array of content strings", () => {
      const builder = new AgentsPromptBuilder();
      const config = createMinimalConfig({
        instructions: "Some content",
        sources: ["AGENTS.md"],
      });
      const contents = builder.getSectionContents(config);

      expect(Array.isArray(contents)).toBe(true);
      expect(contents.some((c) => c.includes("Some content"))).toBe(true);
    });

    it("should return empty array for null config", () => {
      const builder = new AgentsPromptBuilder();
      const contents = builder.getSectionContents(null);

      expect(contents).toEqual([]);
    });
  });
});

describe("createPromptBuilder", () => {
  it("should create builder with default options", () => {
    const builder = createPromptBuilder();
    expect(builder).toBeInstanceOf(AgentsPromptBuilder);
  });

  it("should create builder with custom options", () => {
    const builder = createPromptBuilder({
      includeSourceAttribution: false,
    });
    expect(builder).toBeInstanceOf(AgentsPromptBuilder);
  });
});
