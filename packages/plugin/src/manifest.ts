/**
 * Plugin manifest schema definitions
 *
 * Defines the Zod schema for validating plugin.json manifest files.
 * Plugin manifests describe plugin metadata, entry points, and capabilities.
 *
 * @module plugin/manifest
 */

import { z } from "zod";

// =============================================================================
// Patterns - Validation patterns for manifest fields
// =============================================================================

/**
 * Kebab-case pattern for plugin names
 * Allows lowercase letters, numbers, and hyphens.
 * Must start with a letter, cannot end with hyphen.
 *
 * @example "my-plugin", "vellum-tools", "ai-assistant-v2"
 */
const kebabCasePattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Semantic version pattern
 * Follows semver spec: MAJOR.MINOR.PATCH with optional prerelease and build metadata.
 *
 * @example "1.0.0", "2.1.0-beta.1", "1.0.0+build.123"
 */
const semverPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;

/**
 * Relative path pattern
 * Allows paths starting with ./ or without prefix, using forward slashes.
 *
 * @example "./src/index.ts", "lib/main.js", "./hooks.json"
 */
const relativePathPattern = /^(\.\/)?[\w./-]+$/;

// =============================================================================
// PluginSettingSchema - Individual setting definition
// =============================================================================

/**
 * Schema for setting types supported by plugins
 */
export const PluginSettingTypeSchema = z.enum(["string", "number", "boolean", "array", "object"]);

/** Inferred type for plugin setting types */
export type PluginSettingType = z.infer<typeof PluginSettingTypeSchema>;

/**
 * Schema for a single plugin setting definition
 *
 * Describes configuration options that users can customize.
 */
export const PluginSettingSchema = z.object({
  /** Setting data type */
  type: PluginSettingTypeSchema,

  /** Human-readable description of the setting */
  description: z.string().min(1).max(500).optional(),

  /** Default value for the setting */
  default: z.unknown().optional(),

  /** Whether the setting is required */
  required: z.boolean().default(false),

  /** Allowed values for enum-style settings */
  enum: z.array(z.unknown()).optional(),
});

/** Inferred type for plugin setting */
export type PluginSetting = z.infer<typeof PluginSettingSchema>;

// =============================================================================
// PluginSettingsConfigSchema - Settings configuration object
// =============================================================================

/**
 * Schema for plugin settings configuration
 *
 * A record of setting keys to their definitions.
 */
export const PluginSettingsConfigSchema = z.record(z.string(), PluginSettingSchema);

/** Inferred type for plugin settings config */
export type PluginSettingsConfig = z.infer<typeof PluginSettingsConfigSchema>;

// =============================================================================
// PluginManifestSchema - Main manifest schema
// =============================================================================

/**
 * Schema for plugin manifest (plugin.json)
 *
 * Validates the structure of plugin manifests that describe
 * plugin metadata, capabilities, and entry points.
 *
 * @example
 * ```json
 * {
 *   "name": "my-awesome-plugin",
 *   "version": "1.0.0",
 *   "displayName": "My Awesome Plugin",
 *   "description": "A plugin that does awesome things",
 *   "entrypoint": "./dist/index.js",
 *   "commands": ["./commands/greet.js"],
 *   "agents": ["./agents/helper.md"],
 *   "skills": ["./skills/coding.md"],
 *   "hooks": "./hooks.json",
 *   "mcp": "./.mcp.json",
 *   "settings": {
 *     "apiKey": {
 *       "type": "string",
 *       "description": "API key for external service",
 *       "required": true
 *     }
 *   }
 * }
 * ```
 */
export const PluginManifestSchema = z.object({
  /**
   * Unique plugin identifier in kebab-case format.
   * Used for namespacing and identification.
   *
   * @example "my-plugin", "vellum-git-tools"
   */
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(
      kebabCasePattern,
      'Plugin name must be kebab-case (lowercase letters, numbers, hyphens). Example: "my-plugin"'
    )
    .describe("Unique plugin identifier in kebab-case format"),

  /**
   * Plugin version following semantic versioning.
   *
   * @example "1.0.0", "2.1.0-beta.1"
   */
  version: z
    .string()
    .regex(semverPattern, 'Version must follow semver format. Example: "1.0.0" or "2.0.0-beta.1"')
    .describe("Plugin version in semver format"),

  /**
   * Human-readable display name for the plugin.
   * Shown in UI and logs.
   *
   * @example "My Awesome Plugin"
   */
  displayName: z.string().min(1).max(100).describe("Human-readable display name for the plugin"),

  /**
   * Description of what the plugin does.
   * Supports plain text or markdown.
   */
  description: z.string().min(1).max(2048).describe("Description of the plugin's functionality"),

  /**
   * Path to the main entry point file.
   * Relative to the plugin root directory.
   *
   * @example "./dist/index.js", "lib/main.ts"
   */
  entrypoint: z
    .string()
    .regex(
      relativePathPattern,
      'Entrypoint must be a valid relative path. Example: "./dist/index.js"'
    )
    .describe("Path to the main plugin entry point file"),

  /**
   * Array of paths to command definition files.
   * Commands extend the CLI/agent capabilities.
   */
  commands: z
    .array(z.string().regex(relativePathPattern, "Command path must be a valid relative path"))
    .optional()
    .describe("Array of paths to command definition files"),

  /**
   * Array of paths to agent definition files.
   * Agents are AI personas with specific behaviors.
   */
  agents: z
    .array(z.string().regex(relativePathPattern, "Agent path must be a valid relative path"))
    .optional()
    .describe("Array of paths to agent definition files"),

  /**
   * Array of paths to skill definition files.
   * Skills provide specialized capabilities to agents.
   */
  skills: z
    .array(z.string().regex(relativePathPattern, "Skill path must be a valid relative path"))
    .optional()
    .describe("Array of paths to skill definition files"),

  /**
   * Path to hooks configuration file.
   * Hooks enable lifecycle event handling.
   */
  hooks: z
    .string()
    .regex(relativePathPattern, "Hooks path must be a valid relative path")
    .optional()
    .describe("Path to hooks.json configuration file"),

  /**
   * Path to MCP (Model Context Protocol) configuration file.
   * Enables MCP server integration.
   */
  mcp: z
    .string()
    .regex(relativePathPattern, "MCP path must be a valid relative path")
    .optional()
    .describe("Path to .mcp.json configuration file"),

  /**
   * Settings configuration for user-customizable options.
   * Defines the schema for plugin settings.
   */
  settings: PluginSettingsConfigSchema.optional().describe(
    "Plugin settings schema for user configuration"
  ),
});

/** Inferred type for plugin manifest */
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validates a plugin manifest object
 *
 * @param data - The manifest data to validate
 * @returns The validated manifest or throws ZodError
 *
 * @example
 * ```typescript
 * const manifest = parsePluginManifest({
 *   name: "my-plugin",
 *   version: "1.0.0",
 *   displayName: "My Plugin",
 *   description: "A sample plugin",
 *   entrypoint: "./dist/index.js"
 * });
 * ```
 */
export const parsePluginManifest = (data: unknown): PluginManifest => {
  return PluginManifestSchema.parse(data);
};

/**
 * Safely validates a plugin manifest object
 *
 * @param data - The manifest data to validate
 * @returns SafeParseResult with success status and data or error
 *
 * @example
 * ```typescript
 * const result = safeParsePluginManifest(data);
 * if (result.success) {
 *   console.log(result.data.name);
 * } else {
 *   console.error(result.error.issues);
 * }
 * ```
 */
export const safeParsePluginManifest = (data: unknown) => {
  return PluginManifestSchema.safeParse(data);
};
