// ============================================
// Custom Agent Loader (T009)
// ============================================
// Loads and parses custom agent definitions from YAML and Markdown files.
// @see REQ-005

import * as fs from "node:fs/promises";
import * as path from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";
import type { ZodError } from "zod";
import { Err, Ok, type Result } from "../../types/result.js";
import type { ValidationIssue } from "./errors.js";
import { CustomAgentDefinitionSchema } from "./schema.js";
import type { CustomAgentDefinition } from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Error details for loader operations.
 */
export interface AgentLoadError {
  /** Error code for categorization */
  code: "FILE_NOT_FOUND" | "PARSE_ERROR" | "VALIDATION_ERROR" | "IO_ERROR";
  /** Human-readable error message */
  message: string;
  /** File path that caused the error */
  filePath: string;
  /** Underlying cause (if available) */
  cause?: Error;
  /** Validation issues (for VALIDATION_ERROR) */
  validationIssues?: ValidationIssue[];
}

/**
 * Result of loading an agent definition file.
 */
export type LoadResult = Result<CustomAgentDefinition, AgentLoadError>;

/**
 * Supported file extensions for agent definitions.
 */
export const SUPPORTED_EXTENSIONS = [".yaml", ".yml", ".md"] as const;

/**
 * Type for supported file extensions.
 */
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

// ============================================
// AgentLoader Class
// ============================================

/**
 * Loads custom agent definitions from YAML and Markdown files.
 *
 * Supports two file formats:
 * - YAML files (.yaml, .yml): Direct YAML configuration
 * - Markdown files (.md): YAML frontmatter with body as roleDefinition
 *
 * All loaded definitions are validated against CustomAgentDefinitionSchema.
 *
 * @example
 * ```typescript
 * const loader = new AgentLoader();
 *
 * // Load from YAML
 * const yamlResult = await loader.loadFile('/path/to/agent.yaml');
 *
 * // Load from Markdown
 * const mdResult = await loader.loadFile('/path/to/agent.md');
 *
 * if (yamlResult.ok) {
 *   console.log(yamlResult.value.slug); // Agent slug
 * } else {
 *   console.error(yamlResult.error.message);
 * }
 * ```
 */
export class AgentLoader {
  /**
   * Loads an agent definition from a file.
   *
   * @param filePath - Absolute path to the agent definition file
   * @returns Result containing the parsed definition or error details
   */
  async loadFile(filePath: string): Promise<LoadResult> {
    // Normalize path for cross-platform compatibility
    const normalizedPath = path.normalize(filePath);
    const ext = path.extname(normalizedPath).toLowerCase();

    // Validate file extension
    if (!this.isSupportedExtension(ext)) {
      return Err({
        code: "PARSE_ERROR",
        message: `Unsupported file extension: ${ext}. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`,
        filePath: normalizedPath,
      });
    }

    // Check file exists
    const exists = await this.fileExists(normalizedPath);
    if (!exists) {
      return Err({
        code: "FILE_NOT_FOUND",
        message: `Agent definition file not found: ${normalizedPath}`,
        filePath: normalizedPath,
      });
    }

    // Read file content
    let content: string;
    try {
      content = await fs.readFile(normalizedPath, "utf-8");
    } catch (err) {
      return Err({
        code: "IO_ERROR",
        message: `Failed to read file: ${normalizedPath}`,
        filePath: normalizedPath,
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }

    // Parse based on extension
    if (ext === ".md") {
      return this.parseMarkdown(content, normalizedPath);
    }
    return this.parseYaml(content, normalizedPath);
  }

  /**
   * Loads an agent definition from raw content.
   *
   * @param content - Raw file content
   * @param format - Content format ('yaml' or 'markdown')
   * @param filePath - Optional file path for error context
   * @returns Result containing the parsed definition or error details
   */
  loadFromString(content: string, format: "yaml" | "markdown", filePath = "<string>"): LoadResult {
    if (format === "markdown") {
      return this.parseMarkdown(content, filePath);
    }
    return this.parseYaml(content, filePath);
  }

  /**
   * Checks if a file extension is supported.
   */
  private isSupportedExtension(ext: string): ext is SupportedExtension {
    return SUPPORTED_EXTENSIONS.includes(ext as SupportedExtension);
  }

  /**
   * Checks if a file exists.
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parses YAML content into an agent definition.
   */
  private parseYaml(content: string, filePath: string): LoadResult {
    // Handle empty content
    if (!content.trim()) {
      return Err({
        code: "PARSE_ERROR",
        message: "File is empty",
        filePath,
      });
    }

    // Parse YAML
    let parsed: unknown;
    try {
      parsed = yaml.load(content);
    } catch (err) {
      const yamlError = err as yaml.YAMLException;
      return Err({
        code: "PARSE_ERROR",
        message: `YAML parse error: ${yamlError.message}`,
        filePath,
        cause: yamlError,
      });
    }

    // Validate parsed content is an object
    if (parsed === null || parsed === undefined || typeof parsed !== "object") {
      return Err({
        code: "PARSE_ERROR",
        message: "YAML content must be an object",
        filePath,
      });
    }

    // Validate against schema
    return this.validateDefinition(parsed, filePath);
  }

  /**
   * Parses Markdown content with YAML frontmatter.
   * The body content becomes the roleDefinition/systemPrompt.
   */
  private parseMarkdown(content: string, filePath: string): LoadResult {
    // Handle empty content
    if (!content.trim()) {
      return Err({
        code: "PARSE_ERROR",
        message: "File is empty",
        filePath,
      });
    }

    // Check for frontmatter
    if (!content.trimStart().startsWith("---")) {
      return Err({
        code: "PARSE_ERROR",
        message: "Markdown file must have YAML frontmatter (starting with ---)",
        filePath,
      });
    }

    // Parse with gray-matter
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(content);
    } catch (err) {
      return Err({
        code: "PARSE_ERROR",
        message: `Frontmatter parse error: ${err instanceof Error ? err.message : String(err)}`,
        filePath,
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }

    // Validate frontmatter exists
    if (!parsed.data || Object.keys(parsed.data).length === 0) {
      return Err({
        code: "PARSE_ERROR",
        message: "Markdown file has empty frontmatter",
        filePath,
      });
    }

    // Merge body content as roleDefinition/systemPrompt
    const definition: Record<string, unknown> = { ...parsed.data };

    // Use body as systemPrompt if not already defined
    const bodyContent = parsed.content.trim();
    if (bodyContent && !definition.systemPrompt) {
      definition.systemPrompt = bodyContent;
    }

    // Validate against schema
    return this.validateDefinition(definition, filePath);
  }

  /**
   * Validates a parsed definition against the schema.
   */
  private validateDefinition(data: unknown, filePath: string): LoadResult {
    const result = CustomAgentDefinitionSchema.safeParse(data);

    if (!result.success) {
      const zodError = result.error as ZodError;
      const issues: ValidationIssue[] = zodError.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
        code: issue.code,
      }));

      return Err({
        code: "VALIDATION_ERROR",
        message: `Validation failed: ${issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        filePath,
        validationIssues: issues,
      });
    }

    return Ok(result.data as CustomAgentDefinition);
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates a new AgentLoader instance.
 */
export function createAgentLoader(): AgentLoader {
  return new AgentLoader();
}

// ============================================
// Utility Functions
// ============================================

/**
 * Checks if a file path has a supported extension.
 *
 * @param filePath - File path to check
 * @returns True if the extension is supported
 */
export function isSupportedAgentFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext as SupportedExtension);
}

/**
 * Gets the agent slug from a file path.
 * Uses the file name without extension as the slug.
 *
 * @param filePath - File path
 * @returns Inferred slug from filename
 */
export function getSlugFromFilePath(filePath: string): string {
  // Normalize Windows paths to work cross-platform
  const normalizedPath = filePath.replace(/\\/g, "/");
  const basename = path.basename(normalizedPath);
  const ext = path.extname(basename);
  return basename.slice(0, -ext.length);
}
