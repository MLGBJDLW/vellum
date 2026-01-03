/**
 * Command Parser for Markdown Plugin Commands
 *
 * Parses YAML frontmatter from markdown files to extract command definitions.
 * Uses gray-matter for frontmatter parsing with fallback handling.
 *
 * @module plugin/commands/parser
 */

import * as path from "node:path";

import { FrontmatterParser } from "@vellum/shared";
import { z } from "zod";

/**
 * Parsed command definition from a markdown file.
 *
 * Contains the command metadata extracted from frontmatter
 * and the markdown body as the command content (prompt template).
 */
export interface ParsedCommand {
  /** Command name (from frontmatter or derived from filename) */
  name: string;

  /** Human-readable description of the command */
  description: string;

  /** Optional hint for expected arguments (e.g., "<branch-name>") */
  argumentHint?: string;

  /** Optional list of tool names this command is allowed to use */
  allowedTools?: string[];

  /** The markdown body content (prompt template) */
  content: string;

  /** Path to the source markdown file */
  filePath: string;

  /** True if the content contains $ARGUMENTS variable for substitution */
  hasArgumentsVariable: boolean;
}

/**
 * Schema for command frontmatter validation.
 *
 * All fields are optional since we provide fallbacks:
 * - name: Falls back to filename without .md extension
 * - description: Falls back to first paragraph of body
 */
const CommandFrontmatterSchema = z.object({
  /** Command name (optional - falls back to filename) */
  name: z.string().min(1).optional(),

  /** Command description (optional - falls back to first paragraph) */
  description: z.string().min(1).optional(),

  /** Argument hint displayed in help text */
  "argument-hint": z.string().optional(),

  /** List of allowed tools for this command */
  "allowed-tools": z.array(z.string()).optional(),
});

type CommandFrontmatter = z.infer<typeof CommandFrontmatterSchema>;

const frontmatterParser = new FrontmatterParser(CommandFrontmatterSchema, {
  allowEmptyFrontmatter: true,
});

/**
 * Extracts the command name from a file path.
 *
 * Removes the .md extension and returns the base filename.
 *
 * @param filePath - Path to the markdown file
 * @returns The filename without extension
 *
 * @example
 * ```typescript
 * extractNameFromPath("/commands/review.md"); // "review"
 * extractNameFromPath("fix-bugs.md"); // "fix-bugs"
 * ```
 */
export function extractNameFromPath(filePath: string): string {
  const basename = path.basename(filePath);
  return basename.replace(/\.md$/i, "");
}

/**
 * Extracts the first paragraph from markdown content.
 *
 * Used as a fallback for command description when not specified in frontmatter.
 * Skips leading headings and returns the first non-empty text paragraph.
 *
 * @param content - Markdown content to extract from
 * @returns First paragraph text or empty string if none found
 *
 * @example
 * ```typescript
 * extractFirstParagraph("# Title\n\nThis is the first paragraph.\n\nMore text.");
 * // Returns: "This is the first paragraph."
 * ```
 */
export function extractFirstParagraph(content: string): string {
  const lines = content.split("\n");
  const paragraphLines: string[] = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines before finding content
    if (!inParagraph && trimmed === "") {
      continue;
    }

    // Skip headings
    if (trimmed.startsWith("#")) {
      if (inParagraph) {
        // Heading ends the paragraph
        break;
      }
      continue;
    }

    // Skip horizontal rules
    if (/^[-*_]{3,}$/.test(trimmed)) {
      if (inParagraph) {
        break;
      }
      continue;
    }

    // Found content
    if (trimmed !== "") {
      inParagraph = true;
      paragraphLines.push(trimmed);
    } else if (inParagraph) {
      // Empty line ends the paragraph
      break;
    }
  }

  return paragraphLines.join(" ");
}

/**
 * Checks if content contains the $ARGUMENTS variable.
 *
 * The $ARGUMENTS variable is used for substituting user-provided
 * arguments into the command template.
 *
 * @param content - Content to check
 * @returns True if $ARGUMENTS is present
 */
export function hasArgumentsVariable(content: string): boolean {
  return content.includes("$ARGUMENTS");
}

/**
 * Parses a markdown file to extract command definition.
 *
 * Extracts YAML frontmatter fields:
 * - name: Command name (falls back to filename without .md)
 * - description: Command description (falls back to first paragraph)
 * - argument-hint: Hint for expected arguments
 * - allowed-tools: List of tools the command can use
 *
 * The markdown body becomes the command content (prompt template).
 *
 * @param filePath - Path to the markdown command file
 * @param content - Raw content of the markdown file
 * @returns Parsed command definition
 *
 * @example
 * ```typescript
 * const content = `---
 * name: review
 * description: Review code changes
 * argument-hint: <branch-name>
 * allowed-tools:
 *   - git
 *   - read_file
 * ---
 * Review the changes on branch $ARGUMENTS and provide feedback.
 * `;
 *
 * const command = parseCommand("/commands/review.md", content);
 * // Returns:
 * // {
 * //   name: "review",
 * //   description: "Review code changes",
 * //   argumentHint: "<branch-name>",
 * //   allowedTools: ["git", "read_file"],
 * //   content: "Review the changes on branch $ARGUMENTS and provide feedback.\n",
 * //   filePath: "/commands/review.md",
 * //   hasArgumentsVariable: true
 * // }
 * ```
 */
export function parseCommand(filePath: string, content: string): ParsedCommand {
  const result = frontmatterParser.parse(content);

  let frontmatter: CommandFrontmatter | null = null;
  let body = content;

  if (result.success) {
    frontmatter = result.data;
    body = result.body;
  } else {
    // Even on parse failure, we can still use the body
    body = result.body || content;
  }

  // Extract name with fallback to filename
  const name = frontmatter?.name ?? extractNameFromPath(filePath);

  // Extract description with fallback to first paragraph
  const description = frontmatter?.description ?? (extractFirstParagraph(body) || name);

  // Build the parsed command
  const parsed: ParsedCommand = {
    name,
    description,
    content: body,
    filePath,
    hasArgumentsVariable: hasArgumentsVariable(body),
  };

  // Add optional fields if present
  if (frontmatter?.["argument-hint"]) {
    parsed.argumentHint = frontmatter["argument-hint"];
  }

  if (frontmatter?.["allowed-tools"]?.length) {
    parsed.allowedTools = frontmatter["allowed-tools"];
  }

  return parsed;
}
