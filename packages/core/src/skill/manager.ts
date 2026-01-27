// ============================================
// Skill Manager
// ============================================
// Orchestrates skill loading, matching, and prompt integration.
// Central coordinator for the Skills System.
// @see REQ-005, REQ-006, REQ-007, REQ-009

import picomatch from "picomatch";

import type { Logger } from "../logger/logger.js";
import { SkillLoader, type SkillLoaderOptions } from "./loader.js";
import { type MatchContext, SkillMatcher } from "./matcher.js";
import { checkSkillPermission } from "./permission.js";
import type { SkillConfig, SkillLoaded, SkillPermission, SkillScan } from "./types.js";

// ============================================
// Prompt Section Types
// ============================================

/**
 * Section priorities for prompt building.
 * Higher priority sections appear first.
 */
const SECTION_PRIORITIES = {
  rules: 100,
  antiPatterns: 90,
  patterns: 50,
  examples: 30,
  references: 10,
} as const;

/**
 * Maximum character length for a single skill section content.
 * Prevents any single skill from consuming excessive context window space.
 * Content exceeding this limit will be truncated with a marker.
 */
const MAX_SKILL_SECTION_LENGTH = 8000;

/**
 * A prompt section from a skill.
 */
export interface SkillPromptSection {
  /** Section name (rules, patterns, etc.) */
  name: string;
  /** Content of the section */
  content: string;
  /** Source skill name */
  skillName: string;
  /** Priority for ordering */
  priority: number;
}

/**
 * Options for SkillManager.
 */
export interface SkillManagerOptions {
  /** Loader options */
  loader?: SkillLoaderOptions;
  /** Optional logger for debugging */
  logger?: Logger;
  /** Custom loader instance */
  loaderInstance?: SkillLoader;
  /** Custom matcher instance */
  matcherInstance?: SkillMatcher;
  /** Skill configuration for permissions and limits */
  config?: SkillConfig;
}

// ============================================
// Skill Manager Class (T023, T024)
// ============================================

/**
 * Central coordinator for skill loading, matching, and prompt integration.
 *
 * Responsibilities:
 * - Initialize and manage skill loader
 * - Match skills against context
 * - Load L2 content for matched skills
 * - Build prompt sections from loaded skills
 * - Generate mandatory skill check blocks
 *
 * @example
 * ```typescript
 * const manager = new SkillManager({
 *   loader: { discovery: { workspacePath: '/path/to/project' } },
 *   logger: logger
 * });
 *
 * await manager.initialize();
 *
 * const context: MatchContext = {
 *   request: "write tests for auth",
 *   files: ["src/auth.ts"],
 *   projectContext: { framework: "react" }
 * };
 *
 * const skills = await manager.getActiveSkills(context);
 * const sections = manager.buildPromptSections(skills);
 * ```
 */
export class SkillManager {
  private loader: SkillLoader;
  private matcher: SkillMatcher;
  private logger?: Logger;
  private config: SkillConfig;
  private initialized = false;

  constructor(options: SkillManagerOptions = {}) {
    this.loader = options.loaderInstance ?? new SkillLoader(options.loader);
    this.matcher = options.matcherInstance ?? new SkillMatcher();
    this.logger = options.logger;
    this.config = options.config ?? {};
  }

  /**
   * Initialize the skill manager.
   * Must be called before using other methods.
   *
   * @returns Number of skills discovered
   */
  async initialize(): Promise<number> {
    this.logger?.debug("Initializing skill manager");

    const count = await this.loader.initialize();
    this.initialized = true;

    this.logger?.info("Skill manager initialized", { skillCount: count });
    return count;
  }

  /**
   * Check if manager is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get all skills that match the given context.
   * Returns skills with L2 content loaded, sorted by match score.
   *
   * @param context - Match context with request, files, command, projectContext
   * @returns Array of loaded skills (L2) sorted by match score
   */
  async getActiveSkills(context: MatchContext): Promise<SkillLoaded[]> {
    this.ensureInitialized();

    // Get all L1 scans
    const scans = this.loader.getAllScans();

    // Match against context (already sorted by score descending)
    const matches = this.matcher.matchAll(scans, context);

    // Apply maxActiveSkills limit (default: 10)
    const maxActive = this.config.maxActiveSkills ?? 10;
    const limitedMatches = matches.slice(0, maxActive);

    this.logger?.debug("Skill matching results", {
      totalSkills: scans.length,
      matchedSkills: matches.length,
      limitedTo: limitedMatches.length,
      maxActiveSkills: maxActive,
    });

    // Load L2 content for matched skills (respecting limit)
    const loadedSkills: SkillLoaded[] = [];

    for (const match of limitedMatches) {
      const result = await this.loader.loadL2(match.skill.scan.name);
      if (result.status === "success") {
        loadedSkills.push(result.skill);
      } else if (result.status === "error") {
        this.logger?.warn(`Failed to load skill: ${result.skillId}`, { error: result.error });
      }
      // 'not-found' is debug-level since skill was in cache during scan
    }

    return loadedSkills;
  }

  /**
   * Load a specific skill by name.
   * Returns L2 content if found.
   *
   * @param name - Skill name
   * @returns Loaded skill or null if not found
   */
  async loadSkill(name: string): Promise<SkillLoaded | null> {
    this.ensureInitialized();

    this.logger?.debug("Loading skill", { name });
    const result = await this.loader.loadL2(name);
    if (result.status === "success") {
      return result.skill;
    }
    if (result.status === "error") {
      this.logger?.warn(`Failed to load skill: ${result.skillId}`, { error: result.error });
    }
    return null;
  }

  /**
   * Get all available skills (L1 scans).
   *
   * @returns Array of all discovered skills
   */
  getAllSkills(): SkillScan[] {
    this.ensureInitialized();
    return this.loader.getAllScans();
  }

  /**
   * Get a skill by name (L1 scan only).
   *
   * @param name - Skill name
   * @returns Skill scan or undefined
   */
  getSkill(name: string): SkillScan | undefined {
    this.ensureInitialized();
    const scans = this.loader.getAllScans();
    return scans.find((scan) => scan.name === name);
  }

  // ============================================
  // Prompt Integration (T024)
  // ============================================

  /**
   * Truncate skill content if it exceeds the maximum length.
   * @param content - The content to potentially truncate
   * @param skillName - Name of the skill for logging
   * @returns Truncated content with marker if needed
   */
  private truncateSkillContent(content: string, skillName: string): string {
    if (content.length <= MAX_SKILL_SECTION_LENGTH) {
      return content;
    }

    this.logger?.warn("Skill content truncated due to size limit", {
      skillName,
      originalLength: content.length,
      truncatedTo: MAX_SKILL_SECTION_LENGTH,
    });

    // Truncate and add marker
    return `${content.slice(0, MAX_SKILL_SECTION_LENGTH - 20)}\n...[truncated]`;
  }

  /**
   * Get the mandatory skill check block for system prompt.
   * Lists all available skills with their descriptions and triggers.
   *
   * This block should be included in the system prompt so the LLM
   * knows which skills are available for the current context.
   *
   * @returns Markdown block listing all skills
   */
  getMandatorySkillCheck(): string {
    this.ensureInitialized();

    const skills = this.loader.getAllScans();

    if (skills.length === 0) {
      return "<!-- No skills available -->";
    }

    const lines: string[] = [
      "## Available Skills",
      "",
      "The following skills are available for this session:",
      "",
    ];

    for (const skill of skills) {
      lines.push(`### ${skill.name}`);
      lines.push("");
      lines.push(`**Description:** ${skill.description}`);
      lines.push("");

      if (skill.triggers.length > 0) {
        lines.push("**Triggers:**");
        for (const trigger of skill.triggers) {
          if (trigger.type === "always") {
            lines.push(`- Always active`);
          } else {
            lines.push(`- ${trigger.type}: \`${trigger.pattern}\``);
          }
        }
        lines.push("");
      }

      if (skill.tags.length > 0) {
        lines.push(`**Tags:** ${skill.tags.join(", ")}`);
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  /**
   * Build prompt sections from loaded skills.
   * Merges sections from multiple skills, sorted by priority.
   *
   * Section Priorities:
   * - Rules: 100 (highest)
   * - Anti-Patterns: 90
   * - Patterns: 50
   * - Examples: 30
   * - References: 10 (lowest)
   *
   * @param skills - Array of loaded skills
   * @returns Array of prompt sections sorted by priority (descending)
   */
  buildPromptSections(skills: SkillLoaded[]): SkillPromptSection[] {
    const sections: SkillPromptSection[] = [];

    for (const skill of skills) {
      // Extract sections with content (apply truncation to prevent context overflow)
      if (skill.rules?.trim()) {
        sections.push({
          name: "rules",
          content: this.truncateSkillContent(skill.rules, skill.name),
          skillName: skill.name,
          priority: SECTION_PRIORITIES.rules,
        });
      }

      if (skill.antiPatterns?.trim()) {
        sections.push({
          name: "antiPatterns",
          content: this.truncateSkillContent(skill.antiPatterns, skill.name),
          skillName: skill.name,
          priority: SECTION_PRIORITIES.antiPatterns,
        });
      }

      if (skill.patterns?.trim()) {
        sections.push({
          name: "patterns",
          content: this.truncateSkillContent(skill.patterns, skill.name),
          skillName: skill.name,
          priority: SECTION_PRIORITIES.patterns,
        });
      }

      if (skill.examples?.trim()) {
        sections.push({
          name: "examples",
          content: this.truncateSkillContent(skill.examples, skill.name),
          skillName: skill.name,
          priority: SECTION_PRIORITIES.examples,
        });
      }

      if (skill.referencesSection?.trim()) {
        sections.push({
          name: "references",
          content: this.truncateSkillContent(skill.referencesSection, skill.name),
          skillName: skill.name,
          priority: SECTION_PRIORITIES.references,
        });
      }
    }

    // Sort by priority descending
    return sections.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Build a combined prompt from skills.
   * Convenience method that formats sections into a single string.
   *
   * @param skills - Array of loaded skills
   * @returns Formatted prompt string
   */
  buildCombinedPrompt(skills: SkillLoaded[]): string {
    const sections = this.buildPromptSections(skills);

    if (sections.length === 0) {
      return "";
    }

    const lines: string[] = [];

    // Group sections by type
    const grouped = new Map<string, SkillPromptSection[]>();
    for (const section of sections) {
      const existing = grouped.get(section.name) || [];
      existing.push(section);
      grouped.set(section.name, existing);
    }

    // Format each section type
    const sectionNames = ["rules", "antiPatterns", "patterns", "examples", "references"];

    for (const name of sectionNames) {
      const sectionGroup = grouped.get(name);
      if (!sectionGroup || sectionGroup.length === 0) {
        continue;
      }

      const displayName = this.formatSectionName(name);
      lines.push(`## ${displayName}`);
      lines.push("");

      for (const section of sectionGroup) {
        if (sectionGroup.length > 1) {
          lines.push(`### From: ${section.skillName}`);
          lines.push("");
        }
        lines.push(section.content);
        lines.push("");
      }
    }

    return lines.join("\n").trim();
  }

  // ============================================
  // Permission & Tool Restrictions (T027, T028)
  // ============================================

  /**
   * Check permission for loading a skill.
   * Uses picomatch for glob pattern matching against rules.
   *
   * @param skillName - Name of the skill to check
   * @returns Permission level for the skill
   */
  checkPermission(skillName: string): SkillPermission {
    const permissions = this.config.permissions;

    if (!permissions) {
      return "allow"; // Default to allow if no config
    }

    const { rules = [], default: defaultPermission = "allow" } = permissions;
    const result = checkSkillPermission(skillName, rules, defaultPermission);

    // Log if a rule matched (not the default)
    if (result !== defaultPermission) {
      const matchedRule = rules.find((rule) => {
        const isMatch = picomatch(rule.pattern, { nocase: true, bash: true });
        return isMatch(skillName);
      });
      if (matchedRule) {
        this.logger?.debug("Permission rule matched", {
          skillName,
          pattern: matchedRule.pattern,
          permission: matchedRule.permission,
        });
      }
    }

    return result;
  }

  /**
   * Update skill configuration.
   *
   * @param config - New skill configuration
   */
  setConfig(config: SkillConfig): void {
    this.config = config;
  }

  /**
   * Get current skill configuration.
   *
   * @returns Current skill configuration
   */
  getConfig(): SkillConfig {
    return this.config;
  }

  /**
   * Get merged tool restrictions from multiple skills.
   *
   * For multiple skills:
   * - allowed: intersection (tool must be allowed by ALL skills)
   * - denied: union (tool denied by ANY skill is denied)
   *
   * @param skills - Array of loaded skills
   * @returns Merged tool restrictions
   */
  getToolRestrictions(skills: SkillLoaded[]): { allowed: string[]; denied: string[] } {
    if (skills.length === 0) {
      return { allowed: [], denied: [] };
    }

    // Collect all tool restrictions from skills
    const allowedSets: Set<string>[] = [];
    const deniedSet = new Set<string>();

    for (const skill of skills) {
      const compatibility = skill.frontmatter.compatibility;

      if (compatibility?.tools && compatibility.tools.length > 0) {
        allowedSets.push(new Set(compatibility.tools));
      }

      if (compatibility?.denyTools) {
        for (const tool of compatibility.denyTools) {
          deniedSet.add(tool);
        }
      }
    }

    // Compute allowed intersection
    let allowed: string[] = [];

    if (allowedSets.length > 0) {
      // Start with first set and intersect with others
      const intersection = new Set(allowedSets[0]);

      for (let i = 1; i < allowedSets.length; i++) {
        const currentSet = allowedSets[i];
        for (const tool of intersection) {
          if (!currentSet?.has(tool)) {
            intersection.delete(tool);
          }
        }
      }

      allowed = Array.from(intersection);
    }

    // Denied is union of all denied tools
    const denied = Array.from(deniedSet);

    this.logger?.debug("Tool restrictions computed", {
      skillCount: skills.length,
      allowedCount: allowed.length,
      deniedCount: denied.length,
    });

    return { allowed, denied };
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Ensure the manager is initialized.
   * Throws if not initialized.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("SkillManager not initialized. Call initialize() first.");
    }
  }

  /**
   * Format section name for display.
   */
  private formatSectionName(name: string): string {
    const displayNames: Record<string, string> = {
      rules: "Rules",
      antiPatterns: "Anti-Patterns",
      patterns: "Patterns",
      examples: "Examples",
      references: "References",
    };

    return displayNames[name] || name;
  }
}

// ============================================
// Singleton Export
// ============================================

/**
 * Create a new skill manager instance.
 * Use this for custom configurations.
 *
 * @param options - Manager options
 * @returns New SkillManager instance
 */
export function createSkillManager(options?: SkillManagerOptions): SkillManager {
  return new SkillManager(options);
}
