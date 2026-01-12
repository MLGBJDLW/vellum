/**
 * Custom command schema definitions.
 * Defines the structure for custom command frontmatter.
 *
 * @module config-parser/schemas/command
 * @see REQ-013
 */

import { z } from "zod";

// ============================================
// Argument Definition Schema
// ============================================

/**
 * Schema for command argument definitions.
 *
 * @example
 * ```yaml
 * arguments:
 *   - name: file
 *     description: File to process
 *     required: true
 *   - name: format
 *     description: Output format
 *     default: "json"
 * ```
 */
export const commandArgumentSchema = z.object({
  /**
   * Argument name.
   */
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/i, "Argument name must be alphanumeric with underscores")
    .describe("Argument name"),

  /**
   * Description of the argument.
   */
  description: z.string().max(500).optional().describe("Description of the argument"),

  /**
   * Whether the argument is required.
   */
  required: z.boolean().default(false).describe("Whether this argument is required"),

  /**
   * Default value if not provided.
   */
  default: z.string().optional().describe("Default value if not provided"),
});

/**
 * Inferred type for command argument.
 */
export type CommandArgument = z.infer<typeof commandArgumentSchema>;

/**
 * Input type for command argument (before defaults applied).
 */
export type CommandArgumentInput = z.input<typeof commandArgumentSchema>;

// ============================================
// Trigger Pattern Schema
// ============================================

/**
 * Schema for command trigger patterns.
 * Triggers allow commands to activate on specific patterns.
 *
 * @example
 * ```yaml
 * triggers:
 *   - pattern: "fix.*bug"
 *     type: regex
 *   - pattern: "debug"
 *     type: keyword
 * ```
 */
export const commandTriggerSchema = z.object({
  /**
   * Pattern to match.
   */
  pattern: z.string().min(1).max(200).describe("Pattern to match for trigger"),

  /**
   * Type of pattern matching.
   */
  type: z
    .enum(["keyword", "regex", "prefix"])
    .default("keyword")
    .describe("Type of pattern matching"),
});

/**
 * Inferred type for command trigger.
 */
export type CommandTrigger = z.infer<typeof commandTriggerSchema>;

/**
 * Input type for command trigger (before defaults applied).
 */
export type CommandTriggerInput = z.input<typeof commandTriggerSchema>;

// ============================================
// Command Frontmatter Schema
// ============================================

/**
 * Schema for custom command frontmatter.
 * Defines metadata and configuration for custom slash commands.
 *
 * @example
 * ```yaml
 * ---
 * name: review
 * description: Perform a code review on the current file
 * badge: "[custom]"
 * triggers:
 *   - pattern: "review"
 *     type: keyword
 * arguments:
 *   - name: depth
 *     description: Review depth level
 *     default: "normal"
 * ---
 * ```
 */
export const commandFrontmatterSchema = z.object({
  /**
   * Command name (without the leading /).
   */
  name: z
    .string()
    .min(1, "Command name is required")
    .max(50)
    .regex(/^[a-z][a-z0-9-]*$/, "Name must be lowercase alphanumeric with hyphens")
    .describe("Command name without leading /"),

  /**
   * Description of what the command does.
   */
  description: z
    .string()
    .min(1, "Description is required")
    .max(500)
    .describe("Description of the command"),

  /**
   * Badge to display in command list (e.g., "[custom]").
   */
  badge: z.string().max(30).optional().describe("Badge to display in command list"),

  /**
   * Trigger patterns for automatic activation.
   */
  triggers: z
    .array(commandTriggerSchema)
    .optional()
    .describe("Trigger patterns for automatic activation"),

  /**
   * Argument definitions for the command.
   */
  arguments: z
    .array(commandArgumentSchema)
    .optional()
    .describe("Argument definitions for the command"),
});

/**
 * Inferred type for command frontmatter.
 */
export type CommandFrontmatter = z.infer<typeof commandFrontmatterSchema>;

/**
 * Input type for command frontmatter (before defaults applied).
 */
export type CommandFrontmatterInput = z.input<typeof commandFrontmatterSchema>;

/**
 * Default values for command frontmatter.
 */
export const DEFAULT_COMMAND_FRONTMATTER: Partial<CommandFrontmatterInput> = {
  triggers: [],
  arguments: [],
};
