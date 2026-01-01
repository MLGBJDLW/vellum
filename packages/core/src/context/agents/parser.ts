// ============================================
// Agents Parser
// ============================================
// Implements parsing for AGENTS.md files with frontmatter,
// markdown sections, and import directive resolution.
// Covers REQ-004, REQ-005, REQ-007.

import { type AgentsFrontmatter, agentsFrontmatterSchema, FrontmatterParser } from "@vellum/shared";
import {
  type ImportParseResult,
  ImportParser,
  type ImportParserOptions,
} from "./imports/parser.js";
import type { AgentsWarning, ToolPermission } from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Represents a parsed markdown section with hierarchical structure.
 */
export interface MarkdownSection {
  /** Heading level (1-6) */
  level: number;
  /** Section header text (without # prefix) */
  title: string;
  /** Section body content (text after header, before next section) */
  content: string;
  /** Nested subsections */
  children: MarkdownSection[];
}

/**
 * Result from section parsing.
 */
export interface SectionParseResult {
  /** Parsed sections tree */
  sections: MarkdownSection[];
  /** Raw content for fallback */
  raw: string;
}

/**
 * Complete parse result for an AGENTS.md file.
 */
export interface AgentsParseResult {
  /** Parsed and validated frontmatter (null if missing or invalid) */
  frontmatter: AgentsFrontmatter | null;
  /** Extracted instructions content */
  instructions: string;
  /** Parsed tool permissions from allowed-tools */
  allowedTools: ToolPermission[];
  /** Hierarchical section structure */
  sections: MarkdownSection[];
  /** Non-fatal warnings from parsing */
  warnings: AgentsWarning[];
  /** Fatal errors during parsing */
  errors: Error[];
  /** Source file path */
  filePath: string;
}

// ============================================
// Section Parsing (T022)
// ============================================

/**
 * Regex to match markdown headers (h1-h6).
 * Captures:
 * - Group 1: # symbols (level indicator)
 * - Group 2: Header text
 */
const HEADER_REGEX = /^(#{1,6})\s+(.+)$/;

/**
 * Standard section names used in AGENTS.md files.
 */
export const STANDARD_SECTION_NAMES = [
  "Instructions",
  "Context",
  "Allowed Tools",
  "Permissions",
  "Rules",
  "Examples",
  "Guidelines",
  "Constraints",
  "Notes",
] as const;

/**
 * Parses markdown content into a hierarchical section structure.
 *
 * @param content - Markdown body content (without frontmatter)
 * @returns Parsed sections tree and raw content
 *
 * @example
 * ```typescript
 * const result = parseSections(`
 * # Instructions
 * Follow coding standards.
 *
 * ## Sub-section
 * More details here.
 * `);
 *
 * // result.sections[0].title === 'Instructions'
 * // result.sections[0].children[0].title === 'Sub-section'
 * ```
 */
export function parseSections(content: string): SectionParseResult {
  const lines = content.split("\n");
  const rootSections: MarkdownSection[] = [];

  // Stack to track current parent at each level
  // Index 0 is root, index 1-6 are h1-h6 levels
  const stack: Array<MarkdownSection | null> = [null, null, null, null, null, null, null];

  let currentContent: string[] = [];
  let currentSection: MarkdownSection | null = null;

  const flushContent = () => {
    if (currentSection && currentContent.length > 0) {
      currentSection.content = currentContent.join("\n").trim();
      currentContent = [];
    }
  };

  for (const line of lines) {
    const headerMatch = line.match(HEADER_REGEX);

    if (headerMatch?.[1] && headerMatch[2]) {
      // Flush content to previous section
      flushContent();

      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();

      const newSection: MarkdownSection = {
        level,
        title,
        content: "",
        children: [],
      };

      // Find parent section (nearest section with lower level)
      let parentLevel = level - 1;
      while (parentLevel > 0 && !stack[parentLevel]) {
        parentLevel--;
      }

      if (parentLevel === 0 || !stack[parentLevel]) {
        // Top-level section
        rootSections.push(newSection);
      } else {
        // Nested section - add to parent's children
        const parent = stack[parentLevel];
        if (parent) {
          parent.children.push(newSection);
        }
      }

      // Update stack: clear all deeper levels, set current level
      for (let i = level + 1; i <= 6; i++) {
        stack[i] = null;
      }
      stack[level] = newSection;
      currentSection = newSection;
    } else {
      // Non-header line - add to current content
      currentContent.push(line);
    }
  }

  // Flush remaining content
  flushContent();

  return {
    sections: rootSections,
    raw: content,
  };
}

/**
 * Finds a section by title (case-insensitive).
 *
 * @param sections - Section tree to search
 * @param title - Section title to find
 * @returns Found section or null
 */
export function findSection(sections: MarkdownSection[], title: string): MarkdownSection | null {
  const normalizedTitle = title.toLowerCase().trim();

  for (const section of sections) {
    if (section.title.toLowerCase().trim() === normalizedTitle) {
      return section;
    }

    // Search children recursively
    const found = findSection(section.children, title);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * Extracts the full content of a section including subsections.
 *
 * @param section - Section to extract content from
 * @returns Full section content as string
 */
export function getSectionContent(section: MarkdownSection): string {
  const parts: string[] = [];

  // Add section's own content
  if (section.content) {
    parts.push(section.content);
  }

  // Recursively add children content with headers
  for (const child of section.children) {
    const headerPrefix = "#".repeat(child.level);
    parts.push(`${headerPrefix} ${child.title}`);
    parts.push(getSectionContent(child));
  }

  return parts.join("\n\n").trim();
}

// ============================================
// Permissions Parsing (T023)
// ============================================

/**
 * Regex to match tool permission list items.
 * Matches: - toolname, - !toolname, - @group, - tool(args)
 */
const TOOL_ITEM_REGEX = /^[\s]*[-*]\s+(.+)$/;

/**
 * Regex to parse a single tool permission entry.
 * Captures:
 * - Group 1: Negation (! or empty)
 * - Group 2: Tool name/pattern (including @group)
 * - Group 3: Arguments in parentheses (optional)
 */
const TOOL_PATTERN_REGEX = /^(!)?(@?[\w*?[\]]+)(?:\((.+)\))?$/;

/**
 * Parses tool permissions from an "Allowed Tools" section.
 *
 * @param section - Content of the Allowed Tools section
 * @returns Array of parsed tool permissions
 *
 * @example
 * ```typescript
 * const permissions = parsePermissions(`
 * - read_file
 * - !edit_file
 * - @readonly
 * - bash(--safe, --no-sudo)
 * - *_file
 * `);
 *
 * // permissions[0] = { pattern: 'read_file', negated: false }
 * // permissions[1] = { pattern: 'edit_file', negated: true }
 * // permissions[2] = { pattern: '@readonly', negated: false }
 * // permissions[3] = { pattern: 'bash', negated: false, args: ['--safe', '--no-sudo'] }
 * // permissions[4] = { pattern: '*_file', negated: false }
 * ```
 */
export function parsePermissions(section: string): ToolPermission[] {
  const permissions: ToolPermission[] = [];
  const lines = section.split("\n");

  for (const line of lines) {
    const itemMatch = line.match(TOOL_ITEM_REGEX);
    if (!itemMatch || !itemMatch[1]) {
      continue;
    }

    const toolEntry = itemMatch[1].trim();
    const parsed = parseToolEntry(toolEntry);

    if (parsed) {
      permissions.push(parsed);
    }
  }

  return permissions;
}

/**
 * Parses a single tool entry string.
 *
 * @param entry - Tool entry (e.g., "!bash(--safe)")
 * @returns Parsed ToolPermission or null if invalid
 */
export function parseToolEntry(entry: string): ToolPermission | null {
  const match = entry.match(TOOL_PATTERN_REGEX);
  if (!match || !match[2]) {
    return null;
  }

  const negated = match[1] === "!";
  const pattern = match[2];
  const argsStr = match[3];

  const permission: ToolPermission = {
    pattern,
    negated,
  };

  if (argsStr) {
    // Parse comma-separated args, trimming whitespace
    permission.args = argsStr.split(",").map((arg) => arg.trim());
  }

  return permission;
}

/**
 * Parses allowed-tools from frontmatter array format.
 *
 * @param tools - Array of tool strings from frontmatter
 * @returns Array of parsed tool permissions
 */
export function parseAllowedToolsFromFrontmatter(tools: string[] | undefined): ToolPermission[] {
  if (!tools || tools.length === 0) {
    return [];
  }

  const permissions: ToolPermission[] = [];

  for (const tool of tools) {
    const parsed = parseToolEntry(tool.trim());
    if (parsed) {
      permissions.push(parsed);
    }
  }

  return permissions;
}

// ============================================
// AgentsParser Class (T024)
// ============================================

/**
 * Options for the AgentsParser.
 */
export interface AgentsParserOptions {
  /** Whether to resolve import directives. Default: true */
  resolveImports?: boolean;
  /** Options for the import parser */
  importParserOptions?: ImportParserOptions;
}

/**
 * Parser for AGENTS.md files.
 *
 * Combines:
 * - FrontmatterParser for YAML metadata
 * - Section parsing for markdown structure
 * - ImportParser for @file:, @dir:, @url: directives
 *
 * @example
 * ```typescript
 * const parser = new AgentsParser();
 * const result = await parser.parse('/project/AGENTS.md');
 *
 * if (result.frontmatter) {
 *   console.log('Version:', result.frontmatter.version);
 * }
 * console.log('Instructions:', result.instructions);
 * console.log('Allowed tools:', result.allowedTools);
 * ```
 */
export class AgentsParser {
  private readonly frontmatterParser: FrontmatterParser<typeof agentsFrontmatterSchema>;
  private readonly importParser: ImportParser;
  private readonly resolveImports: boolean;

  constructor(options: AgentsParserOptions = {}) {
    this.frontmatterParser = new FrontmatterParser(agentsFrontmatterSchema);
    this.importParser = new ImportParser(options.importParserOptions);
    this.resolveImports = options.resolveImports ?? true;
  }

  /**
   * Parses an AGENTS.md file from a file path.
   *
   * @param filePath - Absolute path to the AGENTS.md file
   * @param fileSystem - Optional file system interface for reading
   * @returns Complete parse result
   */
  async parse(
    filePath: string,
    fileSystem?: { readFile: (path: string, encoding: BufferEncoding) => Promise<string> }
  ): Promise<AgentsParseResult> {
    const fs = fileSystem ?? (await import("node:fs/promises"));
    const path = await import("node:path");

    // Read file content
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch (error) {
      return {
        frontmatter: null,
        instructions: "",
        allowedTools: [],
        sections: [],
        warnings: [],
        errors: [error instanceof Error ? error : new Error(String(error))],
        filePath,
      };
    }

    return this.parseContent(content, filePath, path.dirname(filePath));
  }

  /**
   * Parses AGENTS.md content directly.
   *
   * @param content - Raw file content
   * @param filePath - Path for error reporting
   * @param basePath - Base directory for import resolution
   * @returns Complete parse result
   */
  async parseContent(
    content: string,
    filePath: string,
    basePath: string
  ): Promise<AgentsParseResult> {
    const warnings: AgentsWarning[] = [];
    const errors: Error[] = [];

    // Parse frontmatter
    const frontmatterResult = this.frontmatterParser.parse(content);
    let frontmatter: AgentsFrontmatter | null = null;
    let body = frontmatterResult.body;

    if (frontmatterResult.success) {
      frontmatter = frontmatterResult.data;
    } else {
      // Add frontmatter warnings
      for (const warning of frontmatterResult.warnings) {
        warnings.push({
          file: filePath,
          message: warning,
          severity: "warn",
        });
      }
      // Add frontmatter errors as warnings (graceful degradation)
      for (const error of frontmatterResult.errors) {
        if (error instanceof Error) {
          warnings.push({
            file: filePath,
            message: `Frontmatter validation: ${error.message}`,
            severity: "warn",
          });
        }
      }
    }

    // Resolve imports if enabled
    let importResult: ImportParseResult | null = null;
    if (this.resolveImports) {
      try {
        importResult = await this.importParser.parseImports(body, basePath);
        body = importResult.processedContent;
        warnings.push(...importResult.warnings);
      } catch (error) {
        warnings.push({
          file: filePath,
          message: `Import resolution failed: ${error instanceof Error ? error.message : String(error)}`,
          severity: "warn",
        });
      }
    }

    // Parse sections
    const sectionResult = parseSections(body);

    // Extract instructions from # Instructions section or full body
    let instructions = "";
    const instructionsSection = findSection(sectionResult.sections, "Instructions");
    if (instructionsSection) {
      instructions = getSectionContent(instructionsSection);
    } else {
      // Fall back to full body as instructions
      instructions = body.trim();
    }

    // Parse allowed tools from frontmatter and/or section
    let allowedTools: ToolPermission[] = [];

    // First, check frontmatter
    if (frontmatter?.["allowed-tools"]) {
      allowedTools = parseAllowedToolsFromFrontmatter(frontmatter["allowed-tools"]);
    }

    // Then, check for Allowed Tools section (supplements frontmatter)
    const toolsSection = findSection(sectionResult.sections, "Allowed Tools");
    if (toolsSection) {
      const sectionTools = parsePermissions(toolsSection.content);
      allowedTools.push(...sectionTools);
    }

    return {
      frontmatter,
      instructions,
      allowedTools,
      sections: sectionResult.sections,
      warnings,
      errors,
      filePath,
    };
  }

  /**
   * Synchronous parse for content without import resolution.
   *
   * @param content - Raw file content
   * @param filePath - Path for error reporting
   * @returns Complete parse result (without import resolution)
   */
  parseSync(content: string, filePath: string): AgentsParseResult {
    const warnings: AgentsWarning[] = [];
    const errors: Error[] = [];

    // Parse frontmatter
    const frontmatterResult = this.frontmatterParser.parse(content);
    let frontmatter: AgentsFrontmatter | null = null;
    const body = frontmatterResult.body;

    if (frontmatterResult.success) {
      frontmatter = frontmatterResult.data;
    } else {
      for (const warning of frontmatterResult.warnings) {
        warnings.push({
          file: filePath,
          message: warning,
          severity: "warn",
        });
      }
      for (const error of frontmatterResult.errors) {
        if (error instanceof Error) {
          warnings.push({
            file: filePath,
            message: `Frontmatter validation: ${error.message}`,
            severity: "warn",
          });
        }
      }
    }

    // Parse sections
    const sectionResult = parseSections(body);

    // Extract instructions
    let instructions = "";
    const instructionsSection = findSection(sectionResult.sections, "Instructions");
    if (instructionsSection) {
      instructions = getSectionContent(instructionsSection);
    } else {
      instructions = body.trim();
    }

    // Parse allowed tools
    let allowedTools: ToolPermission[] = [];

    if (frontmatter?.["allowed-tools"]) {
      allowedTools = parseAllowedToolsFromFrontmatter(frontmatter["allowed-tools"]);
    }

    const toolsSection = findSection(sectionResult.sections, "Allowed Tools");
    if (toolsSection) {
      const sectionTools = parsePermissions(toolsSection.content);
      allowedTools.push(...sectionTools);
    }

    return {
      frontmatter,
      instructions,
      allowedTools,
      sections: sectionResult.sections,
      warnings,
      errors,
      filePath,
    };
  }
}
