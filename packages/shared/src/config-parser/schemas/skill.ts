/**
 * Skill schema definitions for configuration files.
 * Defines the structure for skill frontmatter in SKILL.md files.
 *
 * @module config-parser/schemas/skill
 * @see REQ-001, REQ-016
 */

import { z } from "zod";

// ============================================
// T006: Skill Trigger Schema
// ============================================

/**
 * Array of skill trigger type values for runtime access.
 */
export const skillTriggerTypes = [
  "keyword",
  "file_pattern",
  "command",
  "context",
  "always",
] as const;

/**
 * Skill trigger types.
 * Each type has different matching semantics:
 * - keyword: Regex pattern match on request text (multiplier: 10)
 * - file_pattern: Glob match on context files (multiplier: 5)
 * - command: Exact slash command match (multiplier: 100)
 * - context: Key:value match on project context (multiplier: 3)
 * - always: Always active, lowest priority (multiplier: 1)
 */
export const skillTriggerTypeSchema = z.enum(skillTriggerTypes);

/**
 * Inferred type for skill trigger type.
 */
export type SkillTriggerType = (typeof skillTriggerTypes)[number];

/**
 * Schema for skill trigger patterns.
 * Defines when a skill should be activated based on context.
 *
 * @example
 * ```yaml
 * triggers:
 *   - type: keyword
 *     pattern: "test|pytest|jest"
 *   - type: file_pattern
 *     pattern: "**\/*.test.ts"
 *   - type: always
 * ```
 */
export const skillTriggerSchema = z
  .object({
    /**
     * Type of trigger matching.
     */
    type: skillTriggerTypeSchema.describe("Type of trigger matching to use"),

    /**
     * The pattern to match for triggering the skill.
     * Required for all types except 'always'.
     */
    pattern: z.string().min(1).optional().describe("Pattern to match for skill activation"),
  })
  .refine(
    (data) => data.type === "always" || (data.pattern !== undefined && data.pattern.length > 0),
    {
      message: "Pattern is required for all trigger types except 'always'",
      path: ["pattern"],
    }
  );

/**
 * Inferred type for skill trigger.
 */
export type SkillTrigger = z.infer<typeof skillTriggerSchema>;

/**
 * Input type for skill trigger (before defaults applied).
 */
export type SkillTriggerInput = z.input<typeof skillTriggerSchema>;

// ============================================
// T007: Skill Compatibility Schema
// ============================================

/**
 * Schema for skill compatibility constraints.
 * Defines version and tool requirements for the skill.
 *
 * @example
 * ```yaml
 * compatibility:
 *   vellum: ">=1.0.0"
 *   tools:
 *     - read_file
 *     - write_file
 *   denyTools:
 *     - execute_command
 * ```
 */
export const skillCompatibilitySchema = z.object({
  /**
   * Minimum Vellum version required (semver range).
   */
  vellum: z.string().optional().describe("Minimum Vellum version required (semver range)"),

  /**
   * Allowlist of tools this skill requires/uses.
   */
  tools: z.array(z.string()).optional().describe("Allowlist of tools the skill uses"),

  /**
   * Denylist of tools that should not be used with this skill.
   */
  denyTools: z.array(z.string()).optional().describe("Denylist of tools to avoid"),
});

/**
 * Inferred type for skill compatibility.
 */
export type SkillCompatibility = z.infer<typeof skillCompatibilitySchema>;

/**
 * Input type for skill compatibility (before defaults applied).
 */
export type SkillCompatibilityInput = z.input<typeof skillCompatibilitySchema>;

// ============================================
// T008: Skill Frontmatter Schema
// ============================================

/**
 * Schema for skill frontmatter in SKILL.md files.
 * Extends base metadata with skill-specific fields.
 *
 * Required fields: name, description, triggers
 * Optional fields: version, author, priority, dependencies, compatibility, tags
 *
 * @example
 * ```yaml
 * ---
 * name: python-testing
 * description: Python testing best practices with pytest
 * version: "1.0.0"
 * author: "Vellum Team"
 * priority: 50
 * triggers:
 *   - type: keyword
 *     pattern: "pytest|test"
 *   - type: file_pattern
 *     pattern: "**\/*_test.py"
 * dependencies:
 *   - python-core
 * compatibility:
 *   vellum: ">=1.0.0"
 *   tools:
 *     - read_file
 * tags:
 *   - testing
 *   - python
 * ---
 * ```
 */
export const skillFrontmatterSchema = z.object({
  /**
   * Unique skill identifier (lowercase alphanumeric with hyphens).
   */
  name: z
    .string()
    .min(1, "Skill name is required")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Name must be lowercase alphanumeric with hyphens")
    .describe("Unique skill identifier"),

  /**
   * Detailed description of the skill.
   */
  description: z
    .string()
    .min(1, "Description is required")
    .max(2048)
    .describe("Description of the skill"),

  /**
   * Trigger patterns for skill activation.
   */
  triggers: z
    .array(skillTriggerSchema)
    .min(1, "At least one trigger is required")
    .describe("Patterns that activate this skill"),

  /**
   * Schema version for evolution support (semver format).
   */
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "Version must be in semver format (e.g., 1.0.0)")
    .optional()
    .describe("Schema version (semver format)"),

  /**
   * Author of the skill.
   */
  author: z.string().max(100).optional().describe("Author of the skill"),

  /**
   * Priority for skill activation (1-100, higher = more priority).
   */
  priority: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(50)
    .describe("Priority for skill activation (1-100)"),

  /**
   * Dependencies on other skills (by name).
   */
  dependencies: z.array(z.string()).optional().default([]).describe("Dependencies on other skills"),

  /**
   * Compatibility constraints.
   */
  compatibility: skillCompatibilitySchema.optional().describe("Version and tool requirements"),

  /**
   * Tags for categorization and discovery.
   */
  tags: z.array(z.string()).optional().default([]).describe("Tags for categorization"),
});

/**
 * Inferred type for skill frontmatter.
 */
export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;

/**
 * Input type for skill frontmatter (before defaults applied).
 */
export type SkillFrontmatterInput = z.input<typeof skillFrontmatterSchema>;

// ============================================
// T009: Skill Frontmatter Compat Schema
// ============================================

/**
 * Schema with Claude/GitHub compatibility aliases.
 * Transforms common field name aliases to canonical names:
 * - desc → description
 * - when → triggers
 * - requires → dependencies
 *
 * @see REQ-016
 */
export const skillFrontmatterCompatSchema = z
  .object({
    // Canonical fields
    name: z
      .string()
      .min(1, "Skill name is required")
      .max(100)
      .regex(/^[a-z0-9-]+$/, "Name must be lowercase alphanumeric with hyphens")
      .describe("Unique skill identifier"),

    description: z.string().max(2048).optional().describe("Description of the skill"),

    triggers: z.array(skillTriggerSchema).optional().describe("Patterns that activate this skill"),

    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "Version must be in semver format")
      .optional()
      .describe("Schema version (semver format)"),

    author: z.string().max(100).optional().describe("Author of the skill"),

    priority: z.number().int().min(1).max(100).optional().describe("Priority for skill activation"),

    dependencies: z.array(z.string()).optional().describe("Dependencies on other skills"),

    compatibility: skillCompatibilitySchema.optional().describe("Version and tool requirements"),

    tags: z.array(z.string()).optional().describe("Tags for categorization"),

    // Alias fields (Claude/GitHub compatibility)
    desc: z.string().max(2048).optional().describe("Alias for description"),

    when: z.array(skillTriggerSchema).optional().describe("Alias for triggers"),

    requires: z.array(z.string()).optional().describe("Alias for dependencies"),
  })
  .transform((data) => {
    // Transform aliases to canonical names
    const description = data.description || data.desc;
    const triggers = data.triggers?.length ? data.triggers : data.when;
    const dependencies = data.dependencies?.length ? data.dependencies : data.requires;

    // Validate required fields after transformation
    if (!description) {
      throw new Error("Description is required (use 'description' or 'desc')");
    }
    if (!triggers || triggers.length === 0) {
      throw new Error("At least one trigger is required (use 'triggers' or 'when')");
    }

    return {
      name: data.name,
      description,
      triggers,
      version: data.version,
      author: data.author,
      priority: data.priority ?? 50,
      dependencies: dependencies ?? [],
      compatibility: data.compatibility,
      tags: data.tags ?? [],
    };
  });

/**
 * Inferred type for skill frontmatter compat schema output.
 */
export type SkillFrontmatterCompat = z.infer<typeof skillFrontmatterCompatSchema>;

/**
 * Input type for skill frontmatter compat schema.
 */
export type SkillFrontmatterCompatInput = z.input<typeof skillFrontmatterCompatSchema>;

/**
 * Default skill frontmatter values.
 */
export const DEFAULT_SKILL_FRONTMATTER: Partial<SkillFrontmatter> = {
  version: "1.0.0",
  priority: 50,
  dependencies: [],
  tags: [],
};
