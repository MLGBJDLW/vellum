/**
 * Plugin Agent Type Definitions
 *
 * Extends the core CustomAgentDefinition with plugin-specific fields.
 * Plugin agents have a fixed scope and cannot coordinate with other agents.
 *
 * @module plugin/agents/types
 */

import {
  AgentHooksSchema,
  AgentSettingsSchema,
  CustomAgentRestrictionsSchema,
  FileRestrictionSchema,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SLUG_LENGTH,
  SLUG_PATTERN,
  ToolGroupEntrySchema,
  WhenToUseSchema,
} from "@vellum/core";
import { z } from "zod";

// =============================================================================
// Constants
// =============================================================================

/**
 * Plugin agent scope literal type.
 * Plugin agents always have scope 'plugin' and cannot be changed.
 */
export const PLUGIN_AGENT_SCOPE = "plugin" as const;

/**
 * Maximum length for plugin name field.
 */
export const MAX_PLUGIN_NAME_LENGTH = 100;

/**
 * Maximum length for file path field.
 */
export const MAX_FILE_PATH_LENGTH = 500;

// =============================================================================
// Plugin Agent Definition Schema (T002)
// =============================================================================

/**
 * Zod schema for plugin agent definitions.
 *
 * Extends the core CustomAgentDefinition structure with plugin-specific fields:
 * - `pluginName`: The name of the plugin that owns this agent
 * - `filePath`: Path to the agent's .md definition file
 * - `scope`: Fixed as 'plugin' (plugins cannot coordinate)
 *
 * Omits the `coordination` field since plugin agents cannot:
 * - Spawn other agents
 * - Have parent modes
 * - Participate in multi-agent workflows
 *
 * @example
 * ```typescript
 * const result = PluginAgentDefinitionSchema.safeParse({
 *   slug: "my-helper",
 *   name: "My Helper Agent",
 *   pluginName: "my-awesome-plugin",
 *   filePath: "./agents/helper.md",
 *   mode: "code",
 *   toolGroups: [
 *     { group: "filesystem", enabled: true },
 *   ],
 * });
 *
 * if (result.success) {
 *   console.log(result.data.scope); // "plugin"
 * }
 * ```
 */
export const PluginAgentDefinitionSchema = z.object({
  // ==========================================================================
  // Identity (Required)
  // ==========================================================================

  /**
   * Unique identifier for the agent within the plugin.
   * Must be lowercase alphanumeric with hyphens.
   */
  slug: z
    .string()
    .min(1, "Slug cannot be empty")
    .max(MAX_SLUG_LENGTH, `Slug must be at most ${MAX_SLUG_LENGTH} characters`)
    .regex(
      SLUG_PATTERN,
      "Slug must be lowercase alphanumeric with hyphens, cannot start or end with hyphen"
    ),

  /**
   * Human-readable display name for the agent.
   */
  name: z
    .string()
    .min(1, "Name cannot be empty")
    .max(MAX_NAME_LENGTH, `Name must be at most ${MAX_NAME_LENGTH} characters`),

  // ==========================================================================
  // Plugin-Specific Fields (Required)
  // ==========================================================================

  /**
   * Name of the plugin that owns this agent.
   * Used for namespacing and identification.
   */
  pluginName: z
    .string()
    .min(1, "Plugin name cannot be empty")
    .max(
      MAX_PLUGIN_NAME_LENGTH,
      `Plugin name must be at most ${MAX_PLUGIN_NAME_LENGTH} characters`
    ),

  /**
   * Path to the agent's definition file (.md).
   * Relative to the plugin root directory.
   */
  filePath: z
    .string()
    .min(1, "File path cannot be empty")
    .max(MAX_FILE_PATH_LENGTH, `File path must be at most ${MAX_FILE_PATH_LENGTH} characters`),

  /**
   * Agent scope - always 'plugin' for plugin agents.
   * This is fixed and cannot be changed.
   */
  scope: z.literal(PLUGIN_AGENT_SCOPE).default(PLUGIN_AGENT_SCOPE),

  // ==========================================================================
  // Inheritance & Base Configuration
  // ==========================================================================

  /** Base agent slug to inherit from */
  extends: z.string().optional(),

  /** Base mode (plan, code, draft, debug, ask) */
  mode: z.string().optional(),

  // ==========================================================================
  // UI Configuration
  // ==========================================================================

  /** Icon for UI display (emoji or icon identifier) */
  icon: z.string().optional(),

  /** Color for UI display (hex code) */
  color: z.string().optional(),

  /** Whether to hide from agent listings */
  hidden: z.boolean().optional(),

  // ==========================================================================
  // LLM Configuration
  // ==========================================================================

  /** Specific LLM model to use */
  model: z.string().optional(),

  /** Custom system prompt */
  systemPrompt: z.string().optional(),

  // ==========================================================================
  // Access & Restrictions (Phase 19 Format)
  // ==========================================================================

  /**
   * Tool group access configuration.
   * Uses Phase 19 ToolGroupEntry format.
   *
   * @example
   * ```typescript
   * toolGroups: [
   *   { group: "filesystem", enabled: true },
   *   { group: "network", enabled: true, tools: ["fetch"] },
   *   { group: "shell", enabled: false },
   * ]
   * ```
   */
  toolGroups: z.array(ToolGroupEntrySchema).optional(),

  /** File access restrictions */
  fileRestrictions: z.array(FileRestrictionSchema).optional(),

  /** Access restrictions (combined object) */
  restrictions: CustomAgentRestrictionsSchema.optional(),

  // ==========================================================================
  // Runtime Behavior
  // ==========================================================================

  /** Runtime settings */
  settings: AgentSettingsSchema.optional(),

  /** Activation configuration */
  whenToUse: WhenToUseSchema.optional(),

  /** Lifecycle hooks */
  hooks: AgentHooksSchema.optional(),

  // ==========================================================================
  // Tool Permissions (ExtendedModeConfig compatibility)
  // ==========================================================================

  /** Tool permissions configuration */
  tools: z
    .object({
      edit: z.boolean(),
      bash: z.union([z.boolean(), z.literal("readonly")]),
      web: z.boolean().optional(),
      mcp: z.boolean().optional(),
    })
    .optional(),

  /** System prompt specific to this mode */
  prompt: z.string().optional(),

  /** LLM temperature (0.0 - 1.0) */
  temperature: z.number().min(0).max(1).optional(),

  /** Maximum tokens for response */
  maxTokens: z.number().positive().optional(),

  /** Enable extended thinking */
  extendedThinking: z.boolean().optional(),

  // ==========================================================================
  // Metadata
  // ==========================================================================

  /** Agent definition version (semver) */
  version: z.string().optional(),

  /** Agent creator identifier */
  author: z.string().optional(),

  /** Categorization tags */
  tags: z.array(z.string()).optional(),

  /** Documentation URL */
  docs: z.string().url().optional(),

  /** Extended description */
  description: z
    .string()
    .max(MAX_DESCRIPTION_LENGTH, `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`)
    .optional(),
});

// =============================================================================
// Inferred Types
// =============================================================================

/**
 * Type inferred from PluginAgentDefinitionSchema.
 * Represents a validated plugin agent definition.
 */
export type PluginAgentDefinition = z.infer<typeof PluginAgentDefinitionSchema>;

/**
 * Input type for creating a plugin agent definition.
 * Makes `scope` optional since it defaults to 'plugin'.
 */
export type PluginAgentDefinitionInput = z.input<typeof PluginAgentDefinitionSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Validates a plugin agent definition.
 *
 * @param definition - The definition to validate
 * @returns Validation result with success status and data/error
 *
 * @example
 * ```typescript
 * const result = validatePluginAgentDefinition({
 *   slug: "my-helper",
 *   name: "My Helper",
 *   pluginName: "my-plugin",
 *   filePath: "./agents/helper.md",
 * });
 *
 * if (result.success) {
 *   console.log(result.data.scope); // "plugin"
 * } else {
 *   console.error(result.error.issues);
 * }
 * ```
 */
export function validatePluginAgentDefinition(definition: unknown) {
  return PluginAgentDefinitionSchema.safeParse(definition);
}

/**
 * Creates a fully qualified agent slug for a plugin agent.
 * Format: `plugin:<pluginName>:<agentSlug>`
 *
 * @param pluginName - Name of the plugin
 * @param agentSlug - Agent's local slug
 * @returns Fully qualified agent slug
 *
 * @example
 * ```typescript
 * const fqSlug = getPluginAgentQualifiedSlug("my-plugin", "helper");
 * console.log(fqSlug); // "plugin:my-plugin:helper"
 * ```
 */
export function getPluginAgentQualifiedSlug(pluginName: string, agentSlug: string): string {
  return `plugin:${pluginName}:${agentSlug}`;
}

/**
 * Parses a qualified plugin agent slug.
 *
 * @param qualifiedSlug - Fully qualified slug (e.g., "plugin:my-plugin:helper")
 * @returns Object with pluginName and agentSlug, or null if invalid
 *
 * @example
 * ```typescript
 * const parsed = parsePluginAgentQualifiedSlug("plugin:my-plugin:helper");
 * if (parsed) {
 *   console.log(parsed.pluginName); // "my-plugin"
 *   console.log(parsed.agentSlug);  // "helper"
 * }
 * ```
 */
export function parsePluginAgentQualifiedSlug(
  qualifiedSlug: string
): { pluginName: string; agentSlug: string } | null {
  const match = qualifiedSlug.match(/^plugin:([^:]+):([^:]+)$/);
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  return {
    pluginName: match[1],
    agentSlug: match[2],
  };
}
