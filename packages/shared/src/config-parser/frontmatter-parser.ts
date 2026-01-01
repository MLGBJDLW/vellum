/**
 * Generic Frontmatter Parser using gray-matter and Zod schemas.
 * Provides graceful degradation for malformed or missing frontmatter.
 *
 * @module config-parser/frontmatter-parser
 * @see REQ-004, REQ-029, REQ-031
 */

import matter from "gray-matter";
import type { ZodError, ZodType, z } from "zod";

/**
 * Successful parse result with validated data
 */
export interface ParseResultSuccess<T> {
  /** Indicates successful parsing and validation */
  success: true;
  /** Validated frontmatter data */
  data: T;
  /** Markdown body content after frontmatter */
  body: string;
  /** Non-fatal warnings encountered during parsing */
  warnings: string[];
}

/**
 * Failed parse result with error details
 */
export interface ParseResultFailure {
  /** Indicates parsing or validation failure */
  success: false;
  /** Null when parsing/validation fails */
  data: null;
  /** Markdown body content (extracted even on failure if possible) */
  body: string;
  /** Errors encountered during parsing or validation */
  errors: Array<ZodError | Error>;
  /** Non-fatal warnings encountered during parsing */
  warnings: string[];
}

/**
 * Discriminated union type for parse results.
 * Enables type-safe handling of success and failure cases.
 *
 * @example
 * ```typescript
 * const result = parser.parse(content);
 * if (result.success) {
 *   console.log(result.data); // T
 * } else {
 *   console.log(result.errors); // ZodError[] | Error[]
 * }
 * ```
 */
export type ParseResult<T> = ParseResultSuccess<T> | ParseResultFailure;

/**
 * Options for configuring the FrontmatterParser
 */
export interface FrontmatterParserOptions {
  /**
   * Whether to allow empty frontmatter delimiters with no content.
   * If true, empty frontmatter (---\n---) returns null data with no warnings.
   * If false, empty frontmatter returns null data with a warning.
   * @default true
   */
  allowEmptyFrontmatter?: boolean;

  /**
   * Custom gray-matter options for YAML parsing.
   * See gray-matter documentation for available options.
   */
  matterOptions?: {
    /** Custom parser function */
    parser?: () => void;
    /** Whether to evaluate embedded code (default: false) */
    eval?: boolean;
    /** Extract excerpt from content */
    excerpt?: boolean | ((input: string, options: unknown) => string);
    /** Separator for excerpt extraction */
    excerpt_separator?: string;
    /** Custom language engines */
    engines?: Record<
      string,
      | ((input: string) => object)
      | { parse: (input: string) => object; stringify?: (data: object) => string }
    >;
    /** Language for front-matter (default: 'yaml') */
    language?: string;
    /** Delimiters for front-matter */
    delimiters?: string | [string, string];
  };
}

/**
 * Generic frontmatter parser that extracts and validates YAML frontmatter
 * from Markdown content using gray-matter and Zod schemas.
 *
 * Features:
 * - Type-safe parsing with Zod schema validation
 * - Graceful degradation for malformed YAML
 * - Never throws on parse errors - returns structured result
 * - Preserves body content even on parse failures
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const schema = z.object({
 *   title: z.string(),
 *   version: z.string().optional(),
 * });
 *
 * const parser = new FrontmatterParser(schema);
 *
 * const result = parser.parse(`---
 * title: My Document
 * version: 1.0.0
 * ---
 * # Content here
 * `);
 *
 * if (result.success) {
 *   console.log(result.data.title); // "My Document"
 *   console.log(result.body); // "# Content here\n"
 * }
 * ```
 *
 * @template T - Zod schema type for frontmatter validation
 */
export class FrontmatterParser<T extends ZodType> {
  private readonly schema: T;
  private readonly options: {
    allowEmptyFrontmatter: boolean;
    matterOptions: FrontmatterParserOptions["matterOptions"];
  };

  /**
   * Creates a new FrontmatterParser instance.
   *
   * @param schema - Zod schema for validating frontmatter data
   * @param options - Parser configuration options
   */
  constructor(schema: T, options: FrontmatterParserOptions = {}) {
    this.schema = schema;
    this.options = {
      allowEmptyFrontmatter: options.allowEmptyFrontmatter ?? true,
      matterOptions: options.matterOptions ?? {},
    };
  }

  /**
   * Parses content and validates frontmatter against the schema.
   * Never throws - always returns a structured result.
   *
   * @param content - Raw content string potentially containing frontmatter
   * @returns ParseResult with validated data or error details
   */
  public parse(content: string): ParseResult<z.infer<T>> {
    const warnings: string[] = [];

    // Handle non-string inputs gracefully
    if (typeof content !== "string") {
      return {
        success: false,
        data: null,
        body: "",
        errors: [new Error(`Expected string content, got ${typeof content}`)],
        warnings: ["Invalid input type"],
      };
    }

    // Handle empty or whitespace-only content
    if (!content || content.trim() === "") {
      return {
        success: false,
        data: null,
        body: "",
        errors: [],
        warnings: ["Content is empty"],
      };
    }

    // Check if content has frontmatter delimiters
    const hasFrontmatter = this.hasFrontmatterDelimiters(content);

    if (!hasFrontmatter) {
      // No frontmatter - return body only, no error
      return {
        success: false,
        data: null,
        body: content,
        errors: [],
        warnings: [],
      };
    }

    // Try to parse with gray-matter
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(content, this.options.matterOptions);
    } catch (error) {
      // Malformed YAML - graceful degradation
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        data: null,
        body: this.extractBodyFallback(content),
        errors: [error instanceof Error ? error : new Error(errorMessage)],
        warnings: [`Malformed YAML frontmatter: ${errorMessage}`],
      };
    }

    // Check for empty frontmatter
    if (this.isEmptyFrontmatter(parsed.data)) {
      if (!this.options.allowEmptyFrontmatter) {
        warnings.push("Frontmatter is empty");
      }
      return {
        success: false,
        data: null,
        body: parsed.content,
        errors: [],
        warnings,
      };
    }

    // Validate against Zod schema
    const validationResult = this.schema.safeParse(parsed.data);

    if (!validationResult.success) {
      return {
        success: false,
        data: null,
        body: parsed.content,
        errors: [validationResult.error],
        warnings,
      };
    }

    return {
      success: true,
      data: validationResult.data,
      body: parsed.content,
      warnings,
    };
  }

  /**
   * Async version of parse for consistency with async workflows.
   * Internally calls the sync parse method.
   *
   * @param content - Raw content string potentially containing frontmatter
   * @returns Promise resolving to ParseResult
   */
  public async parseAsync(content: string): Promise<ParseResult<z.infer<T>>> {
    return Promise.resolve(this.parse(content));
  }

  /**
   * Checks if content contains frontmatter delimiters.
   *
   * @param content - Raw content string
   * @returns True if frontmatter delimiters are present
   */
  private hasFrontmatterDelimiters(content: string): boolean {
    const trimmed = content.trimStart();
    return trimmed.startsWith("---");
  }

  /**
   * Checks if parsed frontmatter data is empty.
   *
   * @param data - Parsed frontmatter data
   * @returns True if data is empty or null/undefined
   */
  private isEmptyFrontmatter(data: unknown): boolean {
    if (data === null || data === undefined) {
      return true;
    }
    if (typeof data === "object") {
      return Object.keys(data as object).length === 0;
    }
    return false;
  }

  /**
   * Fallback body extraction when gray-matter fails to parse.
   * Attempts to extract content after the closing frontmatter delimiter.
   *
   * @param content - Raw content string
   * @returns Extracted body content or original content
   */
  private extractBodyFallback(content: string): string {
    // Try to find the closing --- and extract body after it
    const lines = content.split("\n");
    let inFrontmatter = false;
    let bodyStartIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      if (currentLine === undefined) continue;
      const line = currentLine.trim();
      if (line === "---") {
        if (!inFrontmatter) {
          inFrontmatter = true;
        } else {
          // Found closing delimiter
          bodyStartIndex = i + 1;
          break;
        }
      }
    }

    if (bodyStartIndex > 0 && bodyStartIndex < lines.length) {
      return lines.slice(bodyStartIndex).join("\n");
    }

    // Couldn't extract body - return empty
    return "";
  }
}
