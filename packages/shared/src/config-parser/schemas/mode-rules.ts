/**
 * Schema definitions for mode-specific rule files.
 * Validates frontmatter in `.vellum/rules-{mode}/*.md` files.
 *
 * @module config-parser/schemas/mode-rules
 * @see REQ-020
 */

import { z } from "zod";
import { baseMetadataSchema } from "./base.js";

/**
 * Glob pattern schema for file triggers.
 * Patterns determine when the rule should be activated.
 *
 * @example
 * - "*.ts" - All TypeScript files
 * - "src/**\/*.tsx" - React components in src
 * - "!**\/*.test.ts" - Exclude test files
 */
export const triggerPatternSchema = z.string().min(1).describe("Glob pattern for file matching");

/**
 * Mode name schema.
 * Identifies which modes this rule applies to.
 *
 * @example
 * - "coder" - Apply in coder mode
 * - "architect" - Apply in architect mode
 * - "debug" - Apply in debug mode
 */
export const modeNameSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z][a-z0-9-]*$/, "Mode names must be lowercase alphanumeric with hyphens")
  .describe("Mode identifier");

/**
 * Schema for mode rule files in `.vellum/rules-{mode}/`.
 *
 * Mode rules allow context-specific instructions to be loaded
 * based on the current operating mode and active file patterns.
 *
 * @example
 * ```yaml
 * ---
 * version: "1.0.0"
 * name: typescript-best-practices
 * description: TypeScript coding standards
 * priority: 50
 *
 * triggers:
 *   - "*.ts"
 *   - "*.tsx"
 *   - "!*.d.ts"
 *
 * modes:
 *   - coder
 *   - architect
 * ---
 *
 * ## TypeScript Rules
 *
 * - Use strict mode
 * - Prefer interfaces over types
 * ```
 */
export const modeRulesSchema = baseMetadataSchema.extend({
  /**
   * Glob patterns that trigger this rule.
   * When any pattern matches the current file context,
   * the rule content is included in the session.
   *
   * Supports negation patterns starting with "!".
   */
  triggers: z.array(triggerPatternSchema).min(1).describe("Glob patterns that activate this rule"),

  /**
   * Modes where this rule applies.
   * If empty or not specified, applies to all modes.
   */
  modes: z
    .array(modeNameSchema)
    .optional()
    .describe("Modes where this rule is active (empty = all modes)"),

  /**
   * Whether this rule is currently enabled.
   * Allows temporarily disabling rules without deleting them.
   */
  enabled: z.boolean().default(true).describe("Whether this rule is active"),

  /**
   * Additional modes to include content from.
   * Allows rules to pull content from other mode directories.
   */
  additionalModes: z
    .array(modeNameSchema)
    .optional()
    .describe("Additional modes to include content from"),

  /**
   * Tags for categorization and filtering.
   */
  tags: z.array(z.string().max(50)).optional().describe("Tags for categorization"),
});

/**
 * Inferred TypeScript type for mode rules frontmatter
 */
export type ModeRulesFrontmatter = z.infer<typeof modeRulesSchema>;

/**
 * Input type for ModeRulesFrontmatter (before defaults applied)
 */
export type ModeRulesFrontmatterInput = z.input<typeof modeRulesSchema>;

/**
 * Default values for mode rules
 */
export const DEFAULT_MODE_RULES: Partial<ModeRulesFrontmatter> = {
  priority: 0,
  enabled: true,
};

/**
 * Validates a mode rule file frontmatter.
 *
 * @param data - Raw frontmatter data
 * @returns Validated ModeRulesFrontmatter
 * @throws ZodError if validation fails
 */
export function parseModeRules(data: unknown): ModeRulesFrontmatter {
  return modeRulesSchema.parse(data);
}

/**
 * Safely validates mode rule frontmatter without throwing.
 *
 * @param data - Raw frontmatter data
 * @returns Safe parse result with success flag and data/error
 */
export function safeParseModeRules(data: unknown) {
  return modeRulesSchema.safeParse(data);
}
