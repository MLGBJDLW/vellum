/**
 * Prompt frontmatter schema definitions.
 * Defines the structure for prompt frontmatter in markdown files.
 *
 * @module config-parser/schemas/prompt
 * @see REQ-001
 */

import { z } from "zod";

// ============================================
// Prompt Category
// ============================================

/**
 * Array of prompt category values for runtime access.
 */
export const promptCategories = ["role", "worker", "spec", "provider", "custom"] as const;

/**
 * Prompt category types.
 * - role: Agent role definitions (orchestrator, coder, etc.)
 * - worker: Worker-specific prompt modifications
 * - spec: Specification workflow prompts
 * - provider: Provider-specific prompt adjustments
 * - custom: User-defined custom prompts
 */
export const promptCategorySchema = z.enum(promptCategories);

/**
 * Inferred type for prompt category.
 */
export type PromptCategory = (typeof promptCategories)[number];

// ============================================
// Variable Definition Schema
// ============================================

/**
 * Schema for variable definitions in prompts.
 * Variables can be interpolated at runtime.
 *
 * @example
 * ```yaml
 * variables:
 *   - name: project_name
 *     description: Name of the current project
 *     default: "unknown"
 *   - name: max_tokens
 *     description: Maximum tokens to generate
 *     required: true
 * ```
 */
export const promptVariableSchema = z.object({
  /**
   * Variable name (used in {{variable}} syntax).
   */
  name: z
    .string()
    .min(1)
    .regex(/^[a-z_][a-z0-9_]*$/i, "Variable name must be alphanumeric with underscores")
    .describe("Variable name for interpolation"),

  /**
   * Description of the variable purpose.
   */
  description: z.string().optional().describe("Description of the variable"),

  /**
   * Default value if not provided.
   */
  default: z.string().optional().describe("Default value if not provided at runtime"),

  /**
   * Whether the variable is required.
   */
  required: z.boolean().default(false).describe("Whether this variable must be provided"),
});

/**
 * Inferred type for prompt variable.
 */
export type PromptVariable = z.infer<typeof promptVariableSchema>;

/**
 * Input type for prompt variable (before defaults applied).
 */
export type PromptVariableInput = z.input<typeof promptVariableSchema>;

// ============================================
// Prompt Frontmatter Schema
// ============================================

/**
 * Schema for prompt frontmatter in markdown files.
 * Defines metadata and configuration for prompts.
 *
 * @example
 * ```yaml
 * ---
 * id: orchestrator-role
 * name: Orchestrator Role
 * category: role
 * description: Master coordinator that delegates tasks
 * version: "1.0"
 * tags:
 *   - core
 *   - agent
 * variables:
 *   - name: mode
 *     default: "plan"
 * ---
 * ```
 */
export const promptFrontmatterSchema = z.object({
  /**
   * Unique identifier for the prompt.
   */
  id: z
    .string()
    .min(1, "Prompt id is required")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens")
    .describe("Unique prompt identifier"),

  /**
   * Human-readable name for the prompt.
   */
  name: z
    .string()
    .min(1, "Prompt name is required")
    .max(200)
    .describe("Human-readable prompt name"),

  /**
   * Category of the prompt.
   */
  category: promptCategorySchema.describe("Category of the prompt"),

  /**
   * Description of the prompt purpose and behavior.
   */
  description: z.string().max(2048).optional().describe("Description of the prompt"),

  /**
   * Version string for the prompt (default: "1.0").
   */
  version: z.string().default("1.0").describe("Version of the prompt"),

  /**
   * ID of a prompt this one extends (for inheritance).
   */
  extends: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Extends must reference a valid prompt ID")
    .optional()
    .describe("ID of parent prompt for inheritance"),

  /**
   * Tags for categorization and filtering.
   */
  tags: z.array(z.string().min(1).max(50)).optional().describe("Tags for categorization"),

  /**
   * Variable definitions for interpolation.
   */
  variables: z
    .array(promptVariableSchema)
    .optional()
    .describe("Variable definitions for runtime interpolation"),
});

/**
 * Inferred type for prompt frontmatter.
 */
export type PromptFrontmatter = z.infer<typeof promptFrontmatterSchema>;

/**
 * Input type for prompt frontmatter (before defaults applied).
 */
export type PromptFrontmatterInput = z.input<typeof promptFrontmatterSchema>;

/**
 * Default values for prompt frontmatter.
 */
export const DEFAULT_PROMPT_FRONTMATTER: Partial<PromptFrontmatterInput> = {
  version: "1.0",
  tags: [],
  variables: [],
};
