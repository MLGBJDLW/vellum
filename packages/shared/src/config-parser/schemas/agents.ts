/**
 * Schema definitions for AGENTS.md frontmatter.
 * Validates configuration metadata for AI agent instructions.
 *
 * @module config-parser/schemas/agents
 * @see REQ-004
 */

import { z } from "zod";
import { authorSchema, baseMetadataSchema, semverPattern, updatedSchema } from "./base.js";

/**
 * Merge strategy options for combining configurations
 */
export const mergeStrategySchema = z
  .enum(["extend", "replace", "strict"])
  .default("extend")
  .describe("How to merge with parent configurations");

/**
 * Array merge behavior options
 */
export const arrayMergeSchema = z
  .enum(["append", "prepend", "replace", "unique"])
  .default("append")
  .describe("How to merge array values");

/**
 * Merge settings schema for configuration inheritance
 */
export const mergeSettingsSchema = z
  .object({
    /**
     * Strategy for merging configurations:
     * - extend: Merge with parent, child values override
     * - replace: Completely replace parent config
     * - strict: Require explicit parent reference
     */
    strategy: mergeStrategySchema,

    /**
     * How to handle array merging:
     * - append: Add child items after parent items
     * - prepend: Add child items before parent items
     * - replace: Replace parent array entirely
     * - unique: Merge and deduplicate
     */
    arrays: arrayMergeSchema,
  })
  .optional()
  .describe("Configuration merge behavior");

/**
 * Inferred type for merge settings
 */
export type MergeSettings = z.infer<typeof mergeSettingsSchema>;

/**
 * Scope settings schema for file pattern matching
 */
export const scopeSettingsSchema = z
  .object({
    /**
     * Glob patterns for files this config applies to.
     * Empty array means all files.
     */
    include: z.array(z.string()).optional().describe("Glob patterns for files to include"),

    /**
     * Glob patterns for files to exclude from this config.
     * Exclusions take precedence over inclusions.
     */
    exclude: z.array(z.string()).optional().describe("Glob patterns for files to exclude"),
  })
  .optional()
  .describe("File scope settings");

/**
 * Inferred type for scope settings
 */
export type ScopeSettings = z.infer<typeof scopeSettingsSchema>;

/**
 * Pattern for allowed-tools entries.
 * Supports:
 * - Simple tool names: "Read", "Write"
 * - Glob patterns: "Bash*", "*Edit"
 * - Group references: "@readonly", "@safe"
 * - Negations: "!Bash", "!@edit"
 * - Args restrictions: "Bash(npm run *)", "Edit(*.md)"
 */
export const allowedToolPattern = /^!?[@\w*?[\]]+(\(.+\))?$/;

/**
 * Schema for allowed-tools array entries
 */
export const allowedToolSchema = z
  .string()
  .regex(allowedToolPattern, "Invalid tool pattern. Use tool names, globs, @groups, or !negations")
  .describe("Tool permission pattern");

/**
 * Model preferences schema
 */
export const modelSettingsSchema = z
  .object({
    /**
     * Preferred model identifiers in priority order
     */
    preferred: z.array(z.string()).optional().describe("Preferred model IDs in priority order"),

    /**
     * Temperature setting for model responses (0-2)
     */
    temperature: z.number().min(0).max(2).optional().describe("Model temperature (0-2)"),

    /**
     * Maximum tokens for model responses
     */
    maxTokens: z.number().int().positive().optional().describe("Maximum response tokens"),
  })
  .optional()
  .describe("Model configuration preferences");

/**
 * Inferred type for model settings
 */
export type ModelSettings = z.infer<typeof modelSettingsSchema>;

/**
 * Complete AGENTS.md frontmatter schema.
 * Extends base metadata with agents-specific fields.
 *
 * Supports fields: version, name, description, priority, allowed-tools,
 * merge settings, scope patterns, features, and model preferences.
 *
 * See design.md for full YAML frontmatter examples.
 */
export const agentsFrontmatterSchema = baseMetadataSchema.extend({
  // Override version to be optional with default
  version: z
    .string()
    .regex(semverPattern, 'Must be a valid semantic version (e.g., "1.0.0")')
    .default("1.0.0")
    .describe("Schema version for evolution support"),

  // Additional metadata
  author: authorSchema,
  updated: updatedSchema,

  /**
   * Parent configuration to extend from.
   * Can be a file path or array of paths.
   */
  extends: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Parent configuration(s) to extend"),

  /**
   * Merge behavior settings
   */
  merge: mergeSettingsSchema,

  /**
   * File scope settings
   */
  scope: scopeSettingsSchema,

  /**
   * Tool permission patterns.
   * Defines which tools the AI can use in this context.
   */
  "allowed-tools": z
    .array(allowedToolSchema)
    .optional()
    .describe("Tool permission patterns (deny by default)"),

  /**
   * Feature flags for enabling/disabling capabilities
   */
  features: z.record(z.string(), z.boolean()).optional().describe("Feature flags (name: enabled)"),

  /**
   * Model configuration preferences
   */
  model: modelSettingsSchema,
});

/**
 * Inferred TypeScript type for AGENTS.md frontmatter
 */
export type AgentsFrontmatter = z.infer<typeof agentsFrontmatterSchema>;

/**
 * Input type for AgentsFrontmatter (before defaults applied)
 */
export type AgentsFrontmatterInput = z.input<typeof agentsFrontmatterSchema>;

/**
 * Default values for agents frontmatter
 */
export const DEFAULT_AGENTS_FRONTMATTER: Partial<AgentsFrontmatter> = {
  version: "1.0.0",
  priority: 0,
};
