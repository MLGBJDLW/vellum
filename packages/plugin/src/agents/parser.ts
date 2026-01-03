/**
 * Agent Parser for Markdown Plugin Agents
 *
 * Parses YAML frontmatter from markdown files to extract agent definitions.
 * Uses gray-matter for frontmatter parsing with fallback handling.
 *
 * @module plugin/agents/parser
 */

import * as path from "node:path";

import { FrontmatterParser } from "@vellum/shared";
import { z } from "zod";

/**
 * Parsed agent definition from a markdown file.
 *
 * Contains the agent metadata extracted from frontmatter
 * and the markdown body as the system prompt.
 */
export interface ParsedAgent {
  /** Agent name (from frontmatter or derived from filename) */
  name: string;

  /** Human-readable description of the agent */
  description: string;

  /** Optional LLM model to use (e.g., "claude-3-opus") */
  model?: string;

  /** Tool groups to enable (Phase 19 format: "read", "edit", "browser") */
  toolGroups?: string[];

  /** Legacy tool list for backwards compatibility */
  tools?: string[];

  /** The markdown body content as the system prompt */
  systemPrompt: string;

  /** Path to the source markdown file */
  filePath: string;
}

/**
 * Schema for agent frontmatter validation.
 *
 * All fields are optional since we provide fallbacks:
 * - name: Falls back to filename without .md extension
 * - description: Falls back to first paragraph of body
 */
const AgentFrontmatterSchema = z.object({
  /** Agent name (optional - falls back to filename) */
  name: z.string().min(1).optional(),

  /** Agent description (optional - falls back to first paragraph) */
  description: z.string().min(1).optional(),

  /** LLM model identifier */
  model: z.string().min(1).optional(),

  /** Tool groups to enable (Phase 19 format) */
  toolGroups: z.array(z.string()).optional(),

  /** Legacy tool list for backwards compatibility */
  tools: z.array(z.string()).optional(),
});

type AgentFrontmatter = z.infer<typeof AgentFrontmatterSchema>;

const frontmatterParser = new FrontmatterParser(AgentFrontmatterSchema, {
  allowEmptyFrontmatter: true,
});

/**
 * Extracts the agent name from a file path.
 *
 * Removes the .md extension and returns the base filename.
 *
 * @param filePath - Path to the markdown file
 * @returns The filename without extension
 *
 * @example
 * ```typescript
 * extractNameFromPath("/agents/code-reviewer.md"); // "code-reviewer"
 * extractNameFromPath("helper.md"); // "helper"
 * ```
 */
export function extractNameFromPath(filePath: string): string {
  const basename = path.basename(filePath);
  return basename.replace(/\.md$/i, "");
}

/**
 * Extracts the first paragraph from markdown content.
 *
 * Used as a fallback for agent description when not specified in frontmatter.
 * Skips leading headings and returns the first non-empty text paragraph.
 *
 * @param content - Markdown content to extract from
 * @returns First paragraph text or empty string if none found
 *
 * @example
 * ```typescript
 * extractFirstParagraph("# Agent Title\n\nThis is the description.\n\nMore text.");
 * // Returns: "This is the description."
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
 * Parses a markdown file to extract agent definition.
 *
 * Extracts YAML frontmatter fields:
 * - name: Agent name (falls back to filename without .md)
 * - description: Agent description (falls back to first paragraph)
 * - model: LLM model identifier (e.g., "claude-3-opus")
 * - toolGroups: Tool groups to enable (Phase 19 format)
 * - tools: Legacy tool list for backwards compatibility
 *
 * The markdown body becomes the agent's system prompt.
 *
 * @param filePath - Path to the markdown agent file
 * @param content - Raw content of the markdown file
 * @returns Parsed agent definition
 *
 * @example
 * ```typescript
 * const content = `---
 * name: code-reviewer
 * description: Reviews code for quality issues
 * model: claude-3-opus
 * toolGroups:
 *   - read
 *   - edit
 * ---
 * You are a code reviewer. Analyze the provided code and suggest improvements.
 * Focus on:
 * - Code quality
 * - Best practices
 * - Performance
 * `;
 *
 * const agent = parseAgent("/agents/code-reviewer.md", content);
 * // Returns:
 * // {
 * //   name: "code-reviewer",
 * //   description: "Reviews code for quality issues",
 * //   model: "claude-3-opus",
 * //   toolGroups: ["read", "edit"],
 * //   systemPrompt: "You are a code reviewer...",
 * //   filePath: "/agents/code-reviewer.md"
 * // }
 * ```
 */
export function parseAgent(filePath: string, content: string): ParsedAgent {
  const result = frontmatterParser.parse(content);

  let frontmatter: AgentFrontmatter | null = null;
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

  // Build the parsed agent
  const parsed: ParsedAgent = {
    name,
    description,
    systemPrompt: body,
    filePath,
  };

  // Add optional fields if present
  if (frontmatter?.model) {
    parsed.model = frontmatter.model;
  }

  if (frontmatter?.toolGroups?.length) {
    parsed.toolGroups = frontmatter.toolGroups;
  }

  if (frontmatter?.tools?.length) {
    parsed.tools = frontmatter.tools;
  }

  return parsed;
}
