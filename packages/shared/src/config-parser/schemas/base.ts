/**
 * Base schema definitions for configuration files.
 * All config schemas (AGENTS.md, Mode Rules, Skills) extend from these bases.
 *
 * @module config-parser/schemas/base
 * @see REQ-031
 */

import { z } from "zod";

/**
 * Semantic version pattern (e.g., "1.0.0", "2.1", "1.0.0-beta.1")
 */
export const semverPattern = /^\d+\.\d+(\.\d+)?(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;

/**
 * Base metadata schema that all configuration types extend.
 * Provides common fields for versioning, identification, and priority.
 *
 * @example
 * ```yaml
 * ---
 * version: "1.0.0"
 * name: my-project-rules
 * description: Project-specific coding rules
 * priority: 100
 * ---
 * ```
 */
export const baseMetadataSchema = z.object({
  /**
   * Schema version for evolution support.
   * Follows semantic versioning (major.minor.patch).
   */
  version: z
    .string()
    .regex(semverPattern, 'Must be a valid semantic version (e.g., "1.0.0")')
    .describe("Schema version for evolution support (semver format)"),

  /**
   * Human-readable name identifier.
   * Used for display and reference purposes.
   */
  name: z.string().min(1).max(100).optional().describe("Human-readable name for the configuration"),

  /**
   * Detailed description of the configuration purpose.
   * Supports markdown formatting.
   */
  description: z
    .string()
    .max(2048)
    .optional()
    .describe("Description of the configuration (max 2048 chars)"),

  /**
   * Priority for merge ordering.
   * Higher values take precedence. Default is 0.
   * Range: -1000 to 1000
   */
  priority: z
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .default(0)
    .describe("Merge priority (-1000 to 1000, higher wins)"),
});

/**
 * Inferred TypeScript type from baseMetadataSchema
 */
export type BaseMetadata = z.infer<typeof baseMetadataSchema>;

/**
 * Input type for baseMetadataSchema (before defaults applied)
 */
export type BaseMetadataInput = z.input<typeof baseMetadataSchema>;

/**
 * Schema for author information
 */
export const authorSchema = z.string().max(100).optional().describe("Author of the configuration");

/**
 * Schema for last updated timestamp
 */
export const updatedSchema = z
  .string()
  .refine(
    (val) => {
      if (!val) return true;
      const date = new Date(val);
      return !Number.isNaN(date.getTime());
    },
    { message: "Must be a valid ISO date string" }
  )
  .optional()
  .describe("Last updated timestamp (ISO format)");

/**
 * Extended metadata schema with optional author and updated fields
 */
export const extendedMetadataSchema = baseMetadataSchema.extend({
  author: authorSchema,
  updated: updatedSchema,
});

/**
 * Inferred TypeScript type from extendedMetadataSchema
 */
export type ExtendedMetadata = z.infer<typeof extendedMetadataSchema>;

/**
 * Input type for extendedMetadataSchema (before defaults applied)
 */
export type ExtendedMetadataInput = z.input<typeof extendedMetadataSchema>;

/**
 * Default values for base metadata
 */
export const DEFAULT_BASE_METADATA: Partial<BaseMetadata> = {
  priority: 0,
};
