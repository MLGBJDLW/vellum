// ============================================
// Prompt Parser
// ============================================

/**
 * Parser for markdown files with YAML frontmatter.
 *
 * Extracts and validates frontmatter using Zod schemas, then provides
 * variable interpolation for the markdown body content.
 *
 * @module @vellum/core/prompts/prompt-parser
 * @see REQ-001, REQ-008
 */

import { readFile } from "node:fs/promises";
import { platform } from "node:os";
import { basename } from "node:path";
import { FrontmatterParser, promptFrontmatterSchema } from "@vellum/shared";
import { detectShell } from "../shell/index.js";
import { promptParseError, promptYamlError } from "./errors.js";
import type { PromptCategory, PromptLoaded, PromptLocation, PromptVariables } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Pattern for matching variable placeholders in prompts.
 * Variables use the format `{{variable}}` or `{{VARIABLE}}`.
 */
const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Built-in variable names that are automatically available.
 */
const BUILTIN_VARIABLES = ["os", "shell", "cwd", "date", "mode", "provider", "model"] as const;

// =============================================================================
// Types
// =============================================================================

/**
 * Result of parsing a prompt file.
 */
export interface PromptParseResult {
  /**
   * Parsed and validated frontmatter data.
   */
  frontmatter: Record<string, unknown>;

  /**
   * The markdown body content (after frontmatter).
   */
  body: string;

  /**
   * List of variables found in the body.
   */
  variables: string[];
}

/**
 * Options for the PromptParser.
 */
export interface PromptParserOptions {
  /**
   * Whether to validate frontmatter against the schema.
   * @default true
   */
  validateSchema?: boolean;

  /**
   * Whether to throw errors or return null on parse failures.
   * @default false
   */
  throwOnError?: boolean;
}

// =============================================================================
// PromptParser Class
// =============================================================================

/**
 * Parses markdown files with YAML frontmatter.
 *
 * Features:
 * - YAML frontmatter extraction and validation
 * - Zod schema validation for frontmatter
 * - Variable interpolation with built-in variables
 * - Support for custom variables
 *
 * @example
 * ```typescript
 * const parser = new PromptParser();
 *
 * // Parse from file content
 * const content = `---
 * id: coder-role
 * name: Coder
 * category: role
 * ---
 * You are a {{mode}} mode coder on {{os}}.
 * `;
 *
 * const result = parser.parse(content, location);
 *
 * // Interpolate variables
 * const final = parser.interpolate(result.body, {
 *   os: 'darwin',
 *   mode: 'vibe',
 *   shell: 'zsh',
 *   cwd: '/project',
 *   date: '2026-01-10',
 *   provider: 'anthropic',
 *   model: 'claude-3-opus',
 * });
 * ```
 */
export class PromptParser {
  private readonly frontmatterParser: FrontmatterParser<typeof promptFrontmatterSchema>;
  private readonly throwOnError: boolean;

  /**
   * Creates a new PromptParser instance.
   *
   * @param options - Parser configuration options
   */
  constructor(options: PromptParserOptions = {}) {
    this.frontmatterParser = new FrontmatterParser(promptFrontmatterSchema);
    this.throwOnError = options.throwOnError ?? false;
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Parses prompt content and returns a PromptLoaded object.
   *
   * @param content - Raw markdown content with frontmatter
   * @param location - Location metadata for the prompt
   * @returns Parsed prompt data
   * @throws PromptError if parsing fails and throwOnError is true
   */
  parse(content: string, location: PromptLocation): PromptLoaded {
    const parseResult = this.parseRaw(content);

    if (!parseResult) {
      if (this.throwOnError) {
        throw promptParseError(location.path, "Failed to parse prompt content");
      }
      // Return a minimal prompt with the raw content
      return this.createMinimalPrompt(content, location);
    }

    const frontmatter = parseResult.frontmatter;
    const id = (frontmatter.id as string) || this.extractIdFromPath(location.path);
    const name = (frontmatter.name as string) || id;
    const category = (frontmatter.category as PromptCategory) || this.inferCategory(location.path);

    return {
      id,
      name,
      category,
      content: parseResult.body,
      location,
      frontmatter,
      version: frontmatter.version as string | undefined,
    };
  }

  /**
   * Parses raw content without location metadata.
   *
   * @param content - Raw markdown content with frontmatter
   * @returns Parse result or null on failure
   */
  parseRaw(content: string): PromptParseResult | null {
    const result = this.frontmatterParser.parse(content);

    if (!result.success) {
      // Check if there are actual errors vs just no frontmatter
      if (result.errors && result.errors.length > 0) {
        if (this.throwOnError) {
          const errorMessages = result.errors.map((e) => e.message).join("; ");
          throw promptYamlError("unknown", errorMessages);
        }
        return null;
      }
      // No frontmatter is okay - return with empty frontmatter
      return {
        frontmatter: {},
        body: result.body || content,
        variables: this.extractVariables(result.body || content),
      };
    }

    return {
      frontmatter: result.data as Record<string, unknown>,
      body: result.body,
      variables: this.extractVariables(result.body),
    };
  }

  /**
   * Parses a prompt file from disk.
   *
   * @param filePath - Path to the prompt file
   * @param location - Location metadata for the prompt
   * @returns Parsed prompt data
   */
  async parseFile(filePath: string, location: PromptLocation): Promise<PromptLoaded> {
    try {
      const content = await readFile(filePath, "utf-8");
      return this.parse(content, location);
    } catch (error) {
      if (this.throwOnError) {
        throw promptParseError(filePath, error instanceof Error ? error.message : String(error));
      }
      return this.createMinimalPrompt("", location);
    }
  }

  /**
   * Interpolates variables in content.
   *
   * Replaces `{{variable}}` placeholders with values from the provided
   * variables object. Built-in variables are automatically populated
   * if not provided.
   *
   * @param content - Content with variable placeholders
   * @param variables - Variable values to interpolate
   * @returns Content with variables replaced
   *
   * @example
   * ```typescript
   * const content = 'Running on {{os}} with {{shell}}';
   * const result = parser.interpolate(content, {
   *   os: 'darwin',
   *   shell: 'zsh',
   *   cwd: '/home/user',
   *   date: '2026-01-10',
   *   mode: 'vibe',
   *   provider: 'anthropic',
   *   model: 'claude-3-opus',
   * });
   * // result: 'Running on darwin with zsh'
   * ```
   */
  interpolate(content: string, variables: PromptVariables): string {
    return content.replace(VARIABLE_PATTERN, (match, varName) => {
      const lowerName = varName.toLowerCase();

      // Check if it's a built-in variable
      if (this.isBuiltinVariable(lowerName)) {
        const value = this.resolveBuiltinVariable(lowerName, variables);
        if (value !== undefined) {
          return value;
        }
      }

      // Check custom variables (case-insensitive lookup)
      const value = this.findVariable(variables, varName);
      if (value !== undefined) {
        return value;
      }

      // Keep original placeholder if not found
      return match;
    });
  }

  /**
   * Creates default runtime variables.
   *
   * @param overrides - Values to override defaults
   * @returns Complete PromptVariables object with defaults
   */
  createDefaultVariables(overrides: Partial<PromptVariables> = {}): PromptVariables {
    const os = platform();
    return {
      os,
      shell: detectShell().shell,
      cwd: process.cwd(),
      date: new Date().toISOString().split("T")[0] ?? "",
      mode: "vibe",
      provider: "unknown",
      model: "unknown",
      ...overrides,
    };
  }

  /**
   * Validates prompt content against the schema.
   *
   * @param content - Raw markdown content with frontmatter
   * @returns Validation result with success status and errors
   */
  validate(content: string): { valid: boolean; errors: string[] } {
    const result = this.frontmatterParser.parse(content);

    if (!result.success && result.errors && result.errors.length > 0) {
      return {
        valid: false,
        errors: result.errors.map((e) => e.message),
      };
    }

    return { valid: true, errors: [] };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Extracts variable names from content.
   */
  private extractVariables(content: string): string[] {
    const variables: string[] = [];

    // Reset regex state
    VARIABLE_PATTERN.lastIndex = 0;

    // Use matchAll for cleaner iteration without assignment in expression
    for (const match of content.matchAll(VARIABLE_PATTERN)) {
      const varName = match[1];
      if (varName && !variables.includes(varName)) {
        variables.push(varName);
      }
    }

    return variables;
  }

  /**
   * Checks if a variable name is a built-in variable.
   */
  private isBuiltinVariable(name: string): boolean {
    return (BUILTIN_VARIABLES as readonly string[]).includes(name.toLowerCase());
  }

  /**
   * Resolves a built-in variable value.
   */
  private resolveBuiltinVariable(name: string, variables: PromptVariables): string | undefined {
    const lowerName = name.toLowerCase();
    switch (lowerName) {
      case "os":
        return variables.os;
      case "shell":
        return variables.shell;
      case "cwd":
        return variables.cwd;
      case "date":
        return variables.date;
      case "mode":
        return variables.mode;
      case "provider":
        return variables.provider;
      case "model":
        return variables.model;
      default:
        return undefined;
    }
  }

  /**
   * Finds a variable value with case-insensitive lookup.
   */
  private findVariable(variables: PromptVariables, name: string): string | undefined {
    // Direct lookup first
    if (name in variables) {
      return variables[name];
    }

    // Case-insensitive lookup
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(variables)) {
      if (key.toLowerCase() === lowerName) {
        return value;
      }
    }

    return undefined;
  }

  /**
   * Extracts an ID from a file path.
   */
  private extractIdFromPath(filePath: string): string {
    const filename = basename(filePath);
    return filename.replace(/\.md$/, "").toLowerCase().replace(/\s+/g, "-");
  }

  /**
   * Infers the category from a file path.
   */
  private inferCategory(filePath: string): PromptCategory {
    const normalized = filePath.toLowerCase();

    if (normalized.includes("/roles/") || normalized.includes("\\roles\\")) {
      return "role";
    }
    if (normalized.includes("/workers/") || normalized.includes("\\workers\\")) {
      return "worker";
    }
    if (normalized.includes("/spec/") || normalized.includes("\\spec\\")) {
      return "spec";
    }
    if (normalized.includes("/providers/") || normalized.includes("\\providers\\")) {
      return "provider";
    }

    return "custom";
  }

  /**
   * Creates a minimal prompt when parsing fails.
   */
  private createMinimalPrompt(content: string, location: PromptLocation): PromptLoaded {
    const id = this.extractIdFromPath(location.path);
    return {
      id,
      name: id,
      category: this.inferCategory(location.path),
      content,
      location,
      frontmatter: {},
    };
  }
}
