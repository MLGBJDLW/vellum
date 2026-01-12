/**
 * Workflow schema definitions.
 * Defines the structure for workflow YAML frontmatter.
 *
 * @module config-parser/schemas/workflow
 * @see REQ-011
 */

import { z } from "zod";

// ============================================
// Workflow Variable Schema
// ============================================

/**
 * Schema for workflow variable definitions.
 * Variables can be used across workflow steps.
 *
 * @example
 * ```yaml
 * variables:
 *   - name: target_branch
 *     description: Branch to merge into
 *     default: "main"
 * ```
 */
export const workflowVariableSchema = z.object({
  /**
   * Variable name.
   */
  name: z
    .string()
    .min(1)
    .regex(/^[a-z_][a-z0-9_]*$/i, "Variable name must be alphanumeric with underscores")
    .describe("Variable name"),

  /**
   * Description of the variable purpose.
   */
  description: z.string().optional().describe("Description of the variable"),

  /**
   * Default value if not provided.
   */
  default: z.string().optional().describe("Default value"),

  /**
   * Whether the variable is required.
   */
  required: z.boolean().default(false).describe("Whether this variable must be provided"),
});

/**
 * Inferred type for workflow variable.
 */
export type WorkflowVariable = z.infer<typeof workflowVariableSchema>;

/**
 * Input type for workflow variable (before defaults applied).
 */
export type WorkflowVariableInput = z.input<typeof workflowVariableSchema>;

// ============================================
// Workflow Step Schema
// ============================================

/**
 * Schema for workflow step validation rules.
 * Defines how to validate step completion.
 */
export const stepValidationSchema = z.object({
  /**
   * Type of validation to perform.
   */
  type: z
    .enum(["output_contains", "output_matches", "exit_code", "manual"])
    .describe("Type of validation"),

  /**
   * Pattern or value to match.
   */
  pattern: z.string().optional().describe("Pattern or value to validate against"),

  /**
   * Message to display on validation failure.
   */
  message: z.string().optional().describe("Message on validation failure"),
});

/**
 * Inferred type for step validation.
 */
export type StepValidation = z.infer<typeof stepValidationSchema>;

/**
 * Schema for workflow step definitions.
 * Each step represents a discrete action in the workflow.
 *
 * @example
 * ```yaml
 * steps:
 *   - id: analyze
 *     prompt: "Analyze the codebase structure"
 *     validation:
 *       type: output_contains
 *       pattern: "Analysis complete"
 *   - id: implement
 *     prompt: "Implement the changes based on analysis"
 * ```
 */
export const workflowStepSchema = z.object({
  /**
   * Unique step identifier.
   */
  id: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z][a-z0-9-_]*$/, "Step ID must be lowercase alphanumeric with hyphens/underscores")
    .describe("Unique step identifier"),

  /**
   * Prompt text for this step.
   * Can include variable interpolation with {{variable}}.
   */
  prompt: z.string().min(1).max(10000).describe("Prompt text for the step"),

  /**
   * Optional validation for step completion.
   */
  validation: stepValidationSchema.optional().describe("Validation rules for step completion"),

  /**
   * Whether to continue on error.
   */
  continueOnError: z.boolean().default(false).describe("Continue workflow even if step fails"),

  /**
   * Timeout in seconds for this step.
   */
  timeout: z.number().positive().optional().describe("Timeout in seconds"),
});

/**
 * Inferred type for workflow step.
 */
export type WorkflowStep = z.infer<typeof workflowStepSchema>;

/**
 * Input type for workflow step (before defaults applied).
 */
export type WorkflowStepInput = z.input<typeof workflowStepSchema>;

// ============================================
// Workflow Frontmatter Schema
// ============================================

/**
 * Schema for workflow frontmatter.
 * Defines metadata and step configuration for workflows.
 *
 * @example
 * ```yaml
 * ---
 * id: code-review
 * name: Code Review Workflow
 * description: Automated code review workflow
 * steps:
 *   - id: analyze
 *     prompt: "Analyze code for potential issues"
 *   - id: report
 *     prompt: "Generate review report"
 * variables:
 *   - name: severity
 *     default: "all"
 * ---
 * ```
 */
export const workflowFrontmatterSchema = z.object({
  /**
   * Unique workflow identifier.
   */
  id: z
    .string()
    .min(1, "Workflow id is required")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens")
    .describe("Unique workflow identifier"),

  /**
   * Human-readable name for the workflow.
   */
  name: z
    .string()
    .min(1, "Workflow name is required")
    .max(200)
    .describe("Human-readable workflow name"),

  /**
   * Description of the workflow purpose.
   */
  description: z.string().max(2048).optional().describe("Description of the workflow"),

  /**
   * Ordered list of workflow steps.
   */
  steps: z
    .array(workflowStepSchema)
    .min(1, "At least one step is required")
    .describe("Ordered list of workflow steps"),

  /**
   * Variable definitions for the workflow.
   */
  variables: z
    .array(workflowVariableSchema)
    .optional()
    .describe("Variable definitions for the workflow"),

  /**
   * Version string for the workflow.
   */
  version: z.string().default("1.0").describe("Version of the workflow"),
});

/**
 * Inferred type for workflow frontmatter.
 */
export type WorkflowFrontmatter = z.infer<typeof workflowFrontmatterSchema>;

/**
 * Input type for workflow frontmatter (before defaults applied).
 */
export type WorkflowFrontmatterInput = z.input<typeof workflowFrontmatterSchema>;

/**
 * Default values for workflow frontmatter.
 */
export const DEFAULT_WORKFLOW_FRONTMATTER: Partial<WorkflowFrontmatterInput> = {
  version: "1.0",
  variables: [],
};
