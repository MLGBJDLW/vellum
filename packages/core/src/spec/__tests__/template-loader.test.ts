// ============================================
// Template Loader Tests
// ============================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PHASE_TEMPLATES, TEMPLATE_SEARCH_PATHS, TemplateLoader } from "../template-loader.js";
import type { SpecPhase } from "../types.js";

// =============================================================================
// Mocks
// =============================================================================

const accessMock = vi.fn();
const readFileMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  access: (...args: unknown[]) => accessMock(...args),
  readFile: (...args: unknown[]) => readFileMock(...args),
}));

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Normalize path for cross-platform comparison.
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Setup filesystem mock for a single template file.
 */
function setupTemplateMock(path: string, content: string): void {
  accessMock.mockImplementation((p: string) => {
    if (normalizePath(p) === normalizePath(path)) return Promise.resolve();
    return Promise.reject(new Error("ENOENT"));
  });
  readFileMock.mockResolvedValue(content);
}

/**
 * Setup filesystem mock with multiple template files.
 */
function setupMultipleTemplates(files: Record<string, string>): void {
  const normalizedFiles: Record<string, string> = {};
  for (const [key, value] of Object.entries(files)) {
    normalizedFiles[normalizePath(key)] = value;
  }

  accessMock.mockImplementation((p: string) => {
    const normalized = normalizePath(p);
    if (normalized in normalizedFiles) return Promise.resolve();
    return Promise.reject(new Error("ENOENT"));
  });
  readFileMock.mockImplementation((p: string) => {
    const normalized = normalizePath(p);
    if (normalized in normalizedFiles) return Promise.resolve(normalizedFiles[normalized]);
    return Promise.reject(new Error("ENOENT"));
  });
}

/**
 * Setup mock for no files found.
 */
function setupNoTemplates(): void {
  accessMock.mockRejectedValue(new Error("ENOENT"));
}

describe("TemplateLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Template Loading
  // ==========================================================================

  describe("loadForPhase", () => {
    it("loads template from first search path", async () => {
      const templateContent = `---
template_version: "1.0"
required_fields:
  - summary
  - analysis
---
# Research Template
Content here.`;

      setupTemplateMock(".vellum/specs/templates/research.md", templateContent);

      const loader = new TemplateLoader();
      const template = await loader.loadForPhase("research");

      expect(template.content).toBe("# Research Template\nContent here.");
      expect(template.frontmatter.template_version).toBe("1.0");
      expect(template.frontmatter.required_fields).toEqual(["summary", "analysis"]);
    });

    it("falls back to second search path when first not found", async () => {
      const templateContent = `---
template_version: "2.0"
required_fields:
  - overview
---
# Fallback Template`;

      setupMultipleTemplates({
        "packages/core/templates/spec/research.md": templateContent,
      });

      const loader = new TemplateLoader();
      const template = await loader.loadForPhase("research");

      expect(template.frontmatter.template_version).toBe("2.0");
    });

    it("throws error when template not found in any path", async () => {
      setupNoTemplates();
      const loader = new TemplateLoader();

      await expect(loader.loadForPhase("research")).rejects.toThrow(
        /Template not found for phase "research"/
      );
    });

    it("uses custom search paths when provided", async () => {
      setupTemplateMock(
        "custom/templates/research.md",
        `---
template_version: "1.0"
required_fields: []
---
Custom template`
      );

      const loader = new TemplateLoader(["custom/templates"]);
      const template = await loader.loadForPhase("research");

      expect(template.content).toBe("Custom template");
    });
  });

  // ==========================================================================
  // YAML Frontmatter Parsing
  // ==========================================================================

  describe("YAML frontmatter parsing", () => {
    it("parses required_fields array from frontmatter", async () => {
      setupTemplateMock(
        ".vellum/specs/templates/research.md",
        `---
template_version: "1.0"
required_fields:
  - field_one
  - field_two
  - field_three
---
Content`
      );

      const loader = new TemplateLoader();
      const template = await loader.loadForPhase("research");

      expect(template.frontmatter.required_fields).toEqual([
        "field_one",
        "field_two",
        "field_three",
      ]);
    });

    it("uses default version when template_version missing", async () => {
      setupTemplateMock(
        ".vellum/specs/templates/research.md",
        `---
required_fields: []
---
Content`
      );

      const loader = new TemplateLoader();
      const template = await loader.loadForPhase("research");

      expect(template.frontmatter.template_version).toBe("1.0.0");
    });

    it("uses empty array when required_fields missing", async () => {
      setupTemplateMock(
        ".vellum/specs/templates/research.md",
        `---
template_version: "1.0"
---
Content`
      );

      const loader = new TemplateLoader();
      const template = await loader.loadForPhase("research");

      expect(template.frontmatter.required_fields).toEqual([]);
    });

    it("strips frontmatter from content", async () => {
      setupTemplateMock(
        ".vellum/specs/templates/research.md",
        `---
template_version: "1.0"
required_fields: []
extra_field: "ignored"
---
# Heading

Body content here.`
      );

      const loader = new TemplateLoader();
      const template = await loader.loadForPhase("research");

      expect(template.content).toBe("# Heading\n\nBody content here.");
      expect(template.content).not.toContain("---");
      expect(template.content).not.toContain("template_version");
    });
  });

  // ==========================================================================
  // Required Field Extraction
  // ==========================================================================

  describe("getRequiredFields", () => {
    it("returns required fields for a phase", async () => {
      setupTemplateMock(
        ".vellum/specs/templates/design.md",
        `---
template_version: "1.0"
required_fields:
  - architecture
  - components
  - interfaces
---
Design template`
      );

      const loader = new TemplateLoader();
      const fields = await loader.getRequiredFields("design");

      expect(fields).toEqual(["architecture", "components", "interfaces"]);
    });
  });

  // ==========================================================================
  // Output Validation (Soft Validation)
  // ==========================================================================

  describe("validateOutput", () => {
    it("returns valid when all required fields present as headers", () => {
      const loader = new TemplateLoader();
      const output = `
# Introduction

Some intro text.

## Summary

Summary content.

## Analysis

Analysis content.
`;
      const result = loader.validateOutput(output, ["Summary", "Analysis"]);

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("returns invalid with missing fields listed", () => {
      const loader = new TemplateLoader();
      const output = `
## Summary

Content here.
`;
      const result = loader.validateOutput(output, ["Summary", "Analysis", "Conclusion"]);

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(["Analysis", "Conclusion"]);
    });

    it("matches headers with different heading levels", () => {
      const loader = new TemplateLoader();
      const output = `
# Top Level
## Second Level
### Third Level
`;
      const result = loader.validateOutput(output, ["Top Level", "Second Level", "Third Level"]);

      expect(result.valid).toBe(true);
    });

    it("handles empty required fields array", () => {
      const loader = new TemplateLoader();
      const result = loader.validateOutput("Any content", []);

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("handles special regex characters in field names", () => {
      const loader = new TemplateLoader();
      const output = "## Q&A Section\n\nContent.";

      const result = loader.validateOutput(output, ["Q&A Section"]);

      expect(result.valid).toBe(true);
    });
  });

  // ==========================================================================
  // All Phase Templates
  // ==========================================================================

  describe("phase templates mapping", () => {
    const phases: SpecPhase[] = [
      "research",
      "requirements",
      "design",
      "tasks",
      "implementation",
      "validation",
    ];

    it("has template filename for all 6 phases", () => {
      for (const phase of phases) {
        expect(PHASE_TEMPLATES[phase]).toBeDefined();
        expect(PHASE_TEMPLATES[phase]).toMatch(/\.md$/);
      }
    });

    it("loads all phase templates when they exist", async () => {
      // Create mock for all phase templates
      const files: Record<string, string> = {};
      for (const phase of phases) {
        const path = `.vellum/specs/templates/${phase}.md`;
        files[path] = `---
template_version: "1.0"
required_fields:
  - ${phase}_field
---
# ${phase} template`;
      }
      setupMultipleTemplates(files);

      const loader = new TemplateLoader();

      for (const phase of phases) {
        const template = await loader.loadForPhase(phase);
        expect(template.content).toContain(`# ${phase} template`);
        expect(template.frontmatter.required_fields).toContain(`${phase}_field`);
      }
    });
  });

  describe("constants", () => {
    it("TEMPLATE_SEARCH_PATHS includes expected paths", () => {
      expect(TEMPLATE_SEARCH_PATHS).toContain(".vellum/specs/templates");
      expect(TEMPLATE_SEARCH_PATHS.length).toBeGreaterThanOrEqual(1);
    });

    it("PHASE_TEMPLATES maps all phases to .md files", () => {
      const phases = Object.keys(PHASE_TEMPLATES);
      expect(phases).toHaveLength(6);

      for (const filename of Object.values(PHASE_TEMPLATES)) {
        expect(filename).toMatch(/^[a-z]+\.md$/);
      }
    });
  });
});
