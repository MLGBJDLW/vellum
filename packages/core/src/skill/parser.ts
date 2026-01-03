// ============================================
// Skill Parser
// ============================================
// Parses SKILL.md files with YAML frontmatter and markdown sections.
// Implements progressive loading (L1 metadata → L2 full content).
// @see REQ-001, REQ-016

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { FrontmatterParser, skillFrontmatterCompatSchema } from "@vellum/shared";
import { findSection, type MarkdownSection, parseSections } from "../context/agents/parser.js";
import { ErrorCode, VellumError } from "../errors/index.js";
import type { SkillLoaded, SkillParseResult, SkillScan, SkillSource } from "./types.js";

// ============================================
// Constants
// ============================================

/**
 * Standard section names in SKILL.md files.
 */
export const SKILL_SECTION_NAMES = [
  "Rules",
  "Patterns",
  "Anti-Patterns",
  "Examples",
  "References",
] as const;

/**
 * Expected SKILL.md filename.
 */
export const SKILL_MANIFEST_FILENAME = "SKILL.md";

// ============================================
// SkillParser Class
// ============================================

/**
 * Parser for SKILL.md files with YAML frontmatter.
 * Reuses MarkdownSection and FrontmatterParser from agents module.
 *
 * Provides two parsing modes:
 * - parseMetadata: L1 scan (~50-100 tokens) - frontmatter only
 * - parseFull: L2 load (~500-2000 tokens) - full content with sections
 *
 * @example
 * ```typescript
 * const parser = new SkillParser();
 *
 * // L1: Quick metadata scan
 * const scan = await parser.parseMetadata('/path/to/SKILL.md', 'workspace');
 *
 * // L2: Full content load
 * const loaded = await parser.parseFull('/path/to/SKILL.md', 'workspace');
 * ```
 */
export class SkillParser {
  private frontmatterParser = new FrontmatterParser(skillFrontmatterCompatSchema);

  /**
   * Parse only metadata for L1 scan (~50-100 tokens).
   * Reads the file and extracts frontmatter without parsing body sections.
   *
   * @param filePath - Absolute path to SKILL.md file
   * @param source - Source category (workspace, user, global, builtin)
   * @returns SkillScan metadata or null if parsing fails
   * @throws VellumError if file cannot be read
   */
  async parseMetadata(filePath: string, source: SkillSource): Promise<SkillScan | null> {
    const content = await this.readFile(filePath);
    return this.parseMetadataFromContent(content, filePath, source);
  }

  /**
   * Parse full SKILL.md for L2 load (~500-2000 tokens).
   * Reads the file and extracts both frontmatter and body sections.
   *
   * @param filePath - Absolute path to SKILL.md file
   * @param source - Source category (workspace, user, global, builtin)
   * @returns SkillLoaded with full content or null if parsing fails
   * @throws VellumError if file cannot be read
   */
  async parseFull(filePath: string, source: SkillSource): Promise<SkillLoaded | null> {
    const content = await this.readFile(filePath);
    return this.parseFullFromContent(content, filePath, source);
  }

  /**
   * Parse metadata from content string (L1 scan).
   * Useful when content is already loaded.
   *
   * @param content - Raw SKILL.md content
   * @param filePath - Path for error reporting and directory resolution
   * @param source - Source category
   * @returns SkillScan metadata or null if parsing fails
   */
  parseMetadataFromContent(
    content: string,
    filePath: string,
    source: SkillSource
  ): SkillScan | null {
    const parseResult = this.frontmatterParser.parse(content);

    if (!parseResult.success) {
      // Log warnings but don't throw - graceful degradation
      return null;
    }

    const fm = parseResult.data;
    const skillPath = path.dirname(filePath);

    return {
      name: fm.name,
      description: fm.description,
      triggers: fm.triggers,
      dependencies: fm.dependencies,
      source,
      path: skillPath,
      version: fm.version,
      priority: fm.priority,
      tags: fm.tags,
    };
  }

  /**
   * Parse full content from string (L2 load).
   * Useful when content is already loaded.
   *
   * @param content - Raw SKILL.md content
   * @param filePath - Path for error reporting and directory resolution
   * @param source - Source category
   * @returns SkillLoaded with full content or null if parsing fails
   */
  parseFullFromContent(content: string, filePath: string, source: SkillSource): SkillLoaded | null {
    const scan = this.parseMetadataFromContent(content, filePath, source);
    if (!scan) {
      return null;
    }

    const parseResult = this.frontmatterParser.parse(content);
    if (!parseResult.success) {
      return null;
    }

    // Parse body sections
    const { sections } = parseSections(parseResult.body);
    const sectionMap = this.buildSectionMap(sections);

    return {
      ...scan,
      frontmatter: parseResult.data,
      rules: sectionMap.get("Rules") ?? "",
      patterns: sectionMap.get("Patterns") ?? "",
      antiPatterns: sectionMap.get("Anti-Patterns") ?? "",
      examples: sectionMap.get("Examples") ?? "",
      referencesSection: sectionMap.get("References") ?? "",
      raw: content,
      loadedAt: new Date(),
    };
  }

  /**
   * Parse a SKILL.md file and return detailed result with warnings/errors.
   * Useful for validation and debugging.
   *
   * @param filePath - Absolute path to SKILL.md file
   * @param source - Source category
   * @returns Detailed parse result with scan, loaded, warnings, and errors
   */
  async parseWithDiagnostics(filePath: string, source: SkillSource): Promise<SkillParseResult> {
    const result: SkillParseResult = {
      scan: null,
      loaded: null,
      warnings: [],
      errors: [],
    };

    let content: string;
    try {
      content = await this.readFile(filePath);
    } catch (error) {
      result.errors.push(error instanceof Error ? error : new Error(String(error)));
      return result;
    }

    const parseResult = this.frontmatterParser.parse(content);

    if (!parseResult.success) {
      for (const error of parseResult.errors) {
        result.errors.push(error);
      }
      result.warnings.push(...parseResult.warnings);
      return result;
    }

    result.warnings.push(...parseResult.warnings);

    // Build L1 scan
    const fm = parseResult.data;
    const skillPath = path.dirname(filePath);

    result.scan = {
      name: fm.name,
      description: fm.description,
      triggers: fm.triggers,
      dependencies: fm.dependencies,
      source,
      path: skillPath,
      version: fm.version,
      priority: fm.priority,
      tags: fm.tags,
    };

    // Build L2 loaded
    const { sections } = parseSections(parseResult.body);
    const sectionMap = this.buildSectionMap(sections);

    // Check for missing standard sections (warnings, not errors)
    for (const sectionName of SKILL_SECTION_NAMES) {
      if (!sectionMap.has(sectionName)) {
        result.warnings.push(`Missing section: ## ${sectionName}`);
      }
    }

    result.loaded = {
      ...result.scan,
      frontmatter: fm,
      rules: sectionMap.get("Rules") ?? "",
      patterns: sectionMap.get("Patterns") ?? "",
      antiPatterns: sectionMap.get("Anti-Patterns") ?? "",
      examples: sectionMap.get("Examples") ?? "",
      referencesSection: sectionMap.get("References") ?? "",
      raw: content,
      loadedAt: new Date(),
    };

    return result;
  }

  /**
   * Validate a SKILL.md file without fully loading it.
   * Returns true if the file has valid frontmatter.
   *
   * @param filePath - Absolute path to SKILL.md file
   * @returns true if valid, false otherwise
   */
  async validate(filePath: string): Promise<boolean> {
    try {
      const content = await this.readFile(filePath);
      const parseResult = this.frontmatterParser.parse(content);
      return parseResult.success;
    } catch {
      return false;
    }
  }

  /**
   * Find a specific section by name in parsed content.
   *
   * @param sections - Parsed section tree
   * @param name - Section name to find (case-insensitive)
   * @returns Section content or null if not found
   */
  findSection(sections: MarkdownSection[], name: string): string | null {
    const section = findSection(sections, name);
    return section?.content ?? null;
  }

  /**
   * Read file content with proper error handling.
   *
   * @param filePath - Absolute path to file
   * @returns File content as string
   * @throws VellumError if file cannot be read
   */
  private async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (error) {
      throw new VellumError(`Failed to read skill file: ${filePath}`, ErrorCode.SYSTEM_IO_ERROR, {
        cause: error instanceof Error ? error : undefined,
        context: { filePath },
      });
    }
  }

  /**
   * Build a map of section names to content for O(1) lookup.
   *
   * @param sections - Parsed section tree
   * @returns Map of section title to content
   */
  private buildSectionMap(sections: MarkdownSection[]): Map<string, string> {
    const map = new Map<string, string>();

    const addSection = (section: MarkdownSection, prefix = "") => {
      const key = prefix ? `${prefix}/${section.title}` : section.title;
      map.set(section.title, section.content);

      // Also add with prefix for nested access
      if (prefix) {
        map.set(key, section.content);
      }

      // Recursively add children
      for (const child of section.children) {
        addSection(child, section.title);
        // Also add children at top level for easy access
        map.set(child.title, child.content);
      }
    };

    for (const section of sections) {
      addSection(section);
    }

    return map;
  }
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Default SkillParser instance for convenience.
 */
export const skillParser = new SkillParser();
