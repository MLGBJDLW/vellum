/**
 * Plugin Settings Schema Definitions
 *
 * Zod schemas for validating plugin settings configuration.
 * Defines the structure for user-configurable plugin settings,
 * environment variable mappings, and default values.
 *
 * @module plugin/settings/types
 */

import { z } from "zod";

// =============================================================================
// SettingsValue - Primitive value types for settings
// =============================================================================

/**
 * Schema for individual setting values.
 *
 * Supports primitive types commonly used in configuration:
 * - string: Text values, paths, API keys
 * - number: Numeric values, ports, limits
 * - boolean: Feature flags, toggles
 * - string[]: Lists of values, tags
 * - Record<string, unknown>: Complex nested objects
 *
 * @example
 * ```typescript
 * const apiKey: SettingsValue = "sk-abc123";
 * const port: SettingsValue = 3000;
 * const enabled: SettingsValue = true;
 * const tags: SettingsValue = ["production", "v2"];
 * const config: SettingsValue = { nested: { value: 1 } };
 * ```
 */
export const SettingsValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.record(z.string(), z.unknown()),
]);

/**
 * Type representing valid setting values.
 *
 * Union of primitive types supported for plugin configuration:
 * - `string` - Text values
 * - `number` - Numeric values
 * - `boolean` - Boolean flags
 * - `string[]` - Array of strings
 * - `Record<string, unknown>` - Object/nested config
 */
export type SettingsValue = z.infer<typeof SettingsValueSchema>;

// =============================================================================
// JSON Schema - Standard JSON Schema representation
// =============================================================================

/**
 * Schema for JSON Schema type field.
 * Supports standard JSON Schema primitive types.
 */
export const JsonSchemaTypeSchema = z.enum([
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object",
  "null",
]);

/** Inferred type for JSON Schema types */
export type JsonSchemaType = z.infer<typeof JsonSchemaTypeSchema>;

/**
 * Schema for JSON Schema property definition.
 *
 * Represents a single property in a JSON Schema object.
 * Supports common JSON Schema keywords for validation.
 */
export const JsonSchemaPropertySchema: z.ZodType<JsonSchemaProperty> = z.lazy(() =>
  z.object({
    /** Property data type */
    type: z.union([JsonSchemaTypeSchema, z.array(JsonSchemaTypeSchema)]).optional(),

    /** Human-readable description */
    description: z.string().optional(),

    /** Default value for the property */
    default: z.unknown().optional(),

    /** Allowed enum values */
    enum: z.array(z.unknown()).optional(),

    /** Constant value */
    const: z.unknown().optional(),

    // String constraints
    /** Minimum string length */
    minLength: z.number().int().nonnegative().optional(),
    /** Maximum string length */
    maxLength: z.number().int().nonnegative().optional(),
    /** Regex pattern for string validation */
    pattern: z.string().optional(),
    /** Format hint (e.g., "email", "uri", "date-time") */
    format: z.string().optional(),

    // Number constraints
    /** Minimum value (inclusive) */
    minimum: z.number().optional(),
    /** Maximum value (inclusive) */
    maximum: z.number().optional(),
    /** Minimum value (exclusive) */
    exclusiveMinimum: z.number().optional(),
    /** Maximum value (exclusive) */
    exclusiveMaximum: z.number().optional(),
    /** Value must be multiple of this number */
    multipleOf: z.number().positive().optional(),

    // Array constraints
    /** Schema for array items */
    items: z.lazy(() => JsonSchemaPropertySchema).optional(),
    /** Minimum array length */
    minItems: z.number().int().nonnegative().optional(),
    /** Maximum array length */
    maxItems: z.number().int().nonnegative().optional(),
    /** Whether array items must be unique */
    uniqueItems: z.boolean().optional(),

    // Object constraints
    /** Nested property definitions */
    properties: z
      .record(
        z.string(),
        z.lazy(() => JsonSchemaPropertySchema)
      )
      .optional(),
    /** List of required property names */
    required: z.array(z.string()).optional(),
    /** Whether additional properties are allowed */
    additionalProperties: z.union([z.boolean(), z.lazy(() => JsonSchemaPropertySchema)]).optional(),
  })
);

/**
 * Type representing a JSON Schema property definition.
 *
 * Supports common JSON Schema draft-07 keywords for:
 * - Type validation
 * - String constraints (length, pattern, format)
 * - Number constraints (min, max, multipleOf)
 * - Array constraints (items, length, uniqueness)
 * - Object constraints (properties, required)
 */
export interface JsonSchemaProperty {
  type?: JsonSchemaType | JsonSchemaType[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  // String
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  // Number
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  // Array
  items?: JsonSchemaProperty;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  // Object
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaProperty;
}

/**
 * Schema for a complete JSON Schema object.
 *
 * Represents a root-level JSON Schema definition with
 * $schema version, title, and property definitions.
 */
export const JsonSchemaObjectSchema = z.object({
  /** JSON Schema version identifier */
  $schema: z.string().optional(),

  /** Schema title/name */
  title: z.string().optional(),

  /** Schema description */
  description: z.string().optional(),

  /** Root type (typically "object" for settings) */
  type: JsonSchemaTypeSchema.optional(),

  /** Property definitions */
  properties: z.record(z.string(), JsonSchemaPropertySchema).optional(),

  /** List of required properties */
  required: z.array(z.string()).optional(),

  /** Whether additional properties are allowed */
  additionalProperties: z.union([z.boolean(), JsonSchemaPropertySchema]).optional(),
});

/**
 * Type representing a complete JSON Schema object.
 */
export type JsonSchemaObject = z.infer<typeof JsonSchemaObjectSchema>;

// =============================================================================
// PluginSettingsSchema - Main settings configuration
// =============================================================================

/**
 * Schema for environment variable mapping.
 *
 * Maps setting keys to environment variable names.
 * Allows plugins to read configuration from environment.
 *
 * @example
 * ```typescript
 * const envMapping: EnvMapping = {
 *   apiKey: "MY_PLUGIN_API_KEY",
 *   debugMode: "MY_PLUGIN_DEBUG",
 * };
 * ```
 */
export const EnvMappingSchema = z.record(z.string(), z.string());

/**
 * Type representing environment variable mappings.
 * Maps setting keys to environment variable names.
 */
export type EnvMapping = z.infer<typeof EnvMappingSchema>;

/**
 * Schema for setting default values.
 *
 * Maps setting keys to their default values.
 * Used when no user configuration or environment variable is provided.
 *
 * @example
 * ```typescript
 * const defaults: SettingsDefaults = {
 *   timeout: 30000,
 *   retries: 3,
 *   verbose: false,
 * };
 * ```
 */
export const SettingsDefaultsSchema = z.record(z.string(), SettingsValueSchema);

/**
 * Type representing default values for settings.
 * Maps setting keys to their default values.
 */
export type SettingsDefaults = z.infer<typeof SettingsDefaultsSchema>;

/**
 * Schema for plugin settings configuration.
 *
 * Defines the complete settings structure for a plugin:
 * - `schema`: JSON Schema for validating user-provided settings
 * - `envMapping`: Maps setting keys to environment variable names
 * - `defaults`: Default values for settings
 *
 * Settings resolution order:
 * 1. User-provided configuration (highest priority)
 * 2. Environment variables (via envMapping)
 * 3. Default values (lowest priority)
 *
 * @example
 * ```typescript
 * const settings: PluginSettingsSchema = {
 *   schema: {
 *     type: "object",
 *     properties: {
 *       apiKey: { type: "string", description: "API key" },
 *       timeout: { type: "number", minimum: 0, maximum: 60000 },
 *       verbose: { type: "boolean" },
 *     },
 *     required: ["apiKey"],
 *   },
 *   envMapping: {
 *     apiKey: "MY_PLUGIN_API_KEY",
 *     timeout: "MY_PLUGIN_TIMEOUT",
 *   },
 *   defaults: {
 *     timeout: 5000,
 *     verbose: false,
 *   },
 * };
 * ```
 */
export const PluginSettingsSchemaSchema = z.object({
  /**
   * JSON Schema object for validating user settings.
   * Defines the structure and constraints for plugin configuration.
   */
  schema: JsonSchemaObjectSchema,

  /**
   * Mapping of setting keys to environment variable names.
   * Enables configuration via environment variables.
   */
  envMapping: EnvMappingSchema.optional().default({}),

  /**
   * Default values for settings.
   * Applied when no user value or environment variable is provided.
   */
  defaults: SettingsDefaultsSchema.optional().default({}),
});

/**
 * Type representing the complete plugin settings configuration.
 *
 * Contains three components:
 * - `schema`: JSON Schema for validation
 * - `envMapping`: Environment variable mappings
 * - `defaults`: Default setting values
 */
export type PluginSettingsSchema = z.infer<typeof PluginSettingsSchemaSchema>;
