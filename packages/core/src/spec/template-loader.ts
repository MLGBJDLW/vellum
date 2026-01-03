// ============================================
// Spec Workflow Template Loader
// ============================================

/**
 * Template loading and validation for spec workflow phases.
 *
 * Provides functionality to load phase templates with YAML frontmatter
 * and validate phase outputs against required fields.
 *
 * @module @vellum/core/spec/template-loader
 */

import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import type { SpecPhase } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Default search paths for template files.
 *
 * Templates are searched in order:
 * 1. Project-local templates in .vellum/specs/templates/
 * 2. Package templates in packages/core/templates/spec/
 */
export const TEMPLATE_SEARCH_PATHS: readonly string[] = [
  ".vellum/specs/templates",
  "packages/core/templates/spec",
] as const;

/**
 * Template filename for each phase.
 */
export const PHASE_TEMPLATES: Readonly<Record<SpecPhase, string>> = {
  research: "research.md",
  requirements: "requirements.md",
  design: "design.md",
  tasks: "tasks.md",
  implementation: "implementation.md",
  validation: "validation.md",
} as const;

// =============================================================================
// Template Frontmatter Schema
// =============================================================================

/**
 * Schema for template YAML frontmatter.
 */
export const TemplateFrontmatterSchema = z.object({
  /** Template version for compatibility checking */
  template_version: z.string(),
  /** List of required field names in the output */
  required_fields: z.array(z.string()),
});

export type TemplateFrontmatter = z.infer<typeof TemplateFrontmatterSchema>;

/**
 * Loaded template with content and parsed frontmatter.
 */
export interface LoadedTemplate {
  /** Template content (without frontmatter) */
  content: string;
  /** Parsed frontmatter metadata */
  frontmatter: TemplateFrontmatter;
}

/**
 * Validation result for phase output.
 */
export interface ValidationResult {
  /** Whether all required fields are present */
  valid: boolean;
  /** List of missing required fields */
  missing: string[];
}

// =============================================================================
// Template Loader Class
// =============================================================================

/**
 * Loads and validates spec workflow templates.
 *
 * Templates are Markdown files with YAML frontmatter containing
 * metadata about required fields and template version.
 *
 * @example
 * ```typescript
 * const loader = new TemplateLoader();
 *
 * // Load a phase template
 * const template = await loader.loadForPhase("research");
 * console.log(template.frontmatter.required_fields);
 *
 * // Validate phase output
 * const result = loader.validateOutput(output, template.frontmatter.required_fields);
 * if (!result.valid) {
 *   console.log("Missing fields:", result.missing);
 * }
 * ```
 */
export class TemplateLoader {
  private readonly searchPaths: readonly string[];

  /**
   * Creates a new TemplateLoader instance.
   *
   * @param searchPaths - Paths to search for templates (in order)
   */
  constructor(searchPaths: readonly string[] = TEMPLATE_SEARCH_PATHS) {
    this.searchPaths = searchPaths;
  }

  /**
   * Loads the template for a specific phase.
   *
   * Searches through configured paths in order and returns
   * the first matching template found.
   *
   * @param phase - The phase to load template for
   * @returns The loaded template with content and frontmatter
   * @throws Error if no template found for the phase
   */
  async loadForPhase(phase: SpecPhase): Promise<LoadedTemplate> {
    const templateName = PHASE_TEMPLATES[phase];

    for (const basePath of this.searchPaths) {
      const templatePath = join(basePath, templateName);

      if (await this.fileExists(templatePath)) {
        return this.loadTemplate(templatePath);
      }
    }

    throw new Error(
      `Template not found for phase "${phase}". Searched in: ${this.searchPaths.join(", ")}`
    );
  }

  /**
   * Validates that output contains all required fields.
   *
   * Checks for the presence of required section headers in the
   * Markdown output. Headers are expected in the format `## Field Name`
   * or `# Field Name`.
   *
   * @param output - The phase output to validate
   * @param requiredFields - List of required field names
   * @returns Validation result with missing fields
   */
  validateOutput(output: string, requiredFields: string[]): ValidationResult {
    const missing: string[] = [];

    for (const field of requiredFields) {
      // Check for Markdown headers with the field name
      // Supports: ## Field, # Field, ## Field Name, etc.
      const headerPattern = new RegExp(`^#{1,3}\\s+${this.escapeRegex(field)}`, "im");

      if (!headerPattern.test(output)) {
        missing.push(field);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Gets the required fields for a phase.
   *
   * Convenience method that loads the template and returns
   * just the required fields list.
   *
   * @param phase - The phase to get required fields for
   * @returns Array of required field names
   */
  async getRequiredFields(phase: SpecPhase): Promise<string[]> {
    const template = await this.loadForPhase(phase);
    return template.frontmatter.required_fields;
  }

  /**
   * Loads and parses a template file.
   *
   * @param templatePath - Path to the template file
   * @returns Parsed template with content and frontmatter
   */
  private async loadTemplate(templatePath: string): Promise<LoadedTemplate> {
    const rawContent = await readFile(templatePath, "utf-8");
    const { data, content } = matter(rawContent);

    // Validate frontmatter with defaults
    const frontmatter = TemplateFrontmatterSchema.parse({
      template_version: data.template_version ?? "1.0.0",
      required_fields: data.required_fields ?? [],
    });

    return {
      content: content.trim(),
      frontmatter,
    };
  }

  /**
   * Checks if a file exists at the given path.
   *
   * @param filePath - Path to check
   * @returns `true` if file exists and is accessible
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Escapes special regex characters in a string.
   *
   * @param str - String to escape
   * @returns Escaped string safe for regex
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
