// ============================================
// Custom Agent Zod Schemas
// ============================================

import { z } from "zod";
import { AgentLevelSchema } from "../../agent/level.js";
import { FileRestrictionSchema, ToolGroupEntrySchema } from "../../agent/restrictions.js";

// ============================================
// Constants
// ============================================

/**
 * Slug validation pattern.
 * Must be lowercase alphanumeric with hyphens.
 * Cannot start or end with a hyphen.
 * Single character slugs are allowed.
 */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

/**
 * Maximum length for slug field.
 */
export const MAX_SLUG_LENGTH = 50;

/**
 * Maximum length for name field.
 */
export const MAX_NAME_LENGTH = 100;

/**
 * Maximum length for description field.
 */
export const MAX_DESCRIPTION_LENGTH = 500;

// ============================================
// Supporting Schemas (T005)
// ============================================

/**
 * Schema for trigger pattern types.
 */
export const TriggerPatternTypeSchema = z.enum(["file", "keyword", "regex"]);

/**
 * Schema for trigger patterns.
 *
 * @example
 * ```typescript
 * TriggerPatternSchema.parse({
 *   type: "file",
 *   pattern: "**\/*.test.ts",
 * }); // ✅
 *
 * TriggerPatternSchema.parse({
 *   type: "invalid",
 *   pattern: "test",
 * }); // ❌ Throws ZodError
 * ```
 */
export const TriggerPatternSchema = z.object({
  /** Pattern type: file glob, keyword match, or regex */
  type: TriggerPatternTypeSchema,
  /** The pattern to match against */
  pattern: z.string().min(1, "Pattern cannot be empty"),
});

/**
 * Schema for when-to-use configuration.
 */
export const WhenToUseSchema = z.object({
  /** Human-readable description */
  description: z.string().min(1, "Description cannot be empty"),
  /** Automatic trigger patterns */
  triggers: z.array(TriggerPatternSchema).optional(),
  /** Priority when multiple agents match */
  priority: z.number().int().optional(),
});

/**
 * Schema for agent restrictions.
 */
export const AgentRestrictionsSchema = z.object({
  /** File access restrictions */
  fileRestrictions: z.array(FileRestrictionSchema).optional(),
  /** Tool group access rules */
  toolGroups: z.array(ToolGroupEntrySchema).optional(),
  /** Maximum tokens for agent responses */
  maxTokens: z.number().int().positive().optional(),
  /** Execution timeout in milliseconds */
  timeout: z.number().int().positive().optional(),
});

/**
 * Schema for agent lifecycle hooks.
 */
export const AgentHooksSchema = z.object({
  /** Command to run when agent starts */
  onStart: z.string().optional(),
  /** Command to run when agent completes successfully */
  onComplete: z.string().optional(),
  /** Command to run when agent encounters an error */
  onError: z.string().optional(),
  /** Command to run before each tool execution */
  beforeTool: z.string().optional(),
  /** Command to run after each tool execution */
  afterTool: z.string().optional(),
});

/**
 * Schema for multi-agent coordination.
 */
export const AgentCoordinationSchema = z.object({
  /** List of agent slugs this agent can spawn */
  canSpawnAgents: z.array(z.string()).optional(),
  /** Parent agent slug for inheritance */
  parentMode: z.string().optional(),
  /** Maximum concurrent subagents */
  maxConcurrentSubagents: z.number().int().positive().default(3),
});

/**
 * Schema for agent runtime settings.
 */
export const AgentSettingsSchema = z.object({
  /** LLM temperature (0.0 - 1.0) */
  temperature: z.number().min(0).max(1).optional(),
  /** Enable extended thinking mode */
  extendedThinking: z.boolean().optional(),
  /** Stream output in real-time */
  streamOutput: z.boolean().optional(),
  /** Auto-confirm tool executions */
  autoConfirm: z.boolean().optional(),
});

// ============================================
// CustomAgentDefinitionSchema (T006)
// ============================================

/**
 * Zod schema for validating CustomAgentDefinition objects.
 *
 * Validates all fields with appropriate constraints:
 * - slug: lowercase alphanumeric with hyphens, max 50 chars
 * - name: max 100 chars
 * - description: max 500 chars
 * - All nested objects validated recursively
 *
 * @example
 * ```typescript
 * const result = CustomAgentDefinitionSchema.safeParse({
 *   slug: "test-writer",
 *   name: "Test Writer",
 *   mode: "code",
 *   description: "Writes tests",
 * });
 *
 * if (result.success) {
 *   console.log(result.data.slug); // "test-writer"
 * } else {
 *   console.log(result.error.issues); // Validation errors
 * }
 * ```
 */
export const CustomAgentDefinitionSchema = z.object({
  // ============================================
  // Identity (Required)
  // ============================================

  /** Unique identifier for the agent */
  slug: z
    .string()
    .min(1, "Slug cannot be empty")
    .max(MAX_SLUG_LENGTH, `Slug must be at most ${MAX_SLUG_LENGTH} characters`)
    .regex(
      SLUG_PATTERN,
      "Slug must be lowercase alphanumeric with hyphens, cannot start or end with hyphen"
    ),

  /** Human-readable display name */
  name: z
    .string()
    .min(1, "Name cannot be empty")
    .max(MAX_NAME_LENGTH, `Name must be at most ${MAX_NAME_LENGTH} characters`),

  // ============================================
  // Inheritance & Base Configuration
  // ============================================

  /** Base agent slug to inherit from */
  extends: z.string().optional(),

  /** Base mode (plan, code, draft, debug, ask) */
  mode: z.string().optional(),

  // ============================================
  // UI Configuration
  // ============================================

  /** Icon for UI display */
  icon: z.string().optional(),

  /** Color for UI display (hex code) */
  color: z.string().optional(),

  /** Whether to hide from listings */
  hidden: z.boolean().optional(),

  // ============================================
  // LLM Configuration
  // ============================================

  /** Specific LLM model to use */
  model: z.string().optional(),

  /** Custom system prompt */
  systemPrompt: z.string().optional(),

  // ============================================
  // Access & Restrictions
  // ============================================

  /** Tool group access configuration */
  toolGroups: z.array(ToolGroupEntrySchema).optional(),

  /** Access restrictions */
  restrictions: AgentRestrictionsSchema.optional(),

  // ============================================
  // Runtime Behavior
  // ============================================

  /** Runtime settings */
  settings: AgentSettingsSchema.optional(),

  /** Activation configuration */
  whenToUse: WhenToUseSchema.optional(),

  /** Lifecycle hooks */
  hooks: AgentHooksSchema.optional(),

  // ============================================
  // Multi-Agent Coordination
  // ============================================

  /** Agent level in hierarchy */
  level: AgentLevelSchema.optional(),

  /** Multi-agent coordination settings */
  coordination: AgentCoordinationSchema.optional(),

  // ============================================
  // Metadata
  // ============================================

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

  // ============================================
  // Extended Mode Config Fields (inherited)
  // ============================================

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

  /** LLM temperature (redundant with settings.temperature, for ExtendedModeConfig compat) */
  temperature: z.number().min(0).max(1).optional(),

  /** Maximum tokens for response */
  maxTokens: z.number().positive().optional(),

  /** Enable extended thinking */
  extendedThinking: z.boolean().optional(),

  /** List of agent slugs this mode can spawn */
  canSpawnAgents: z.array(z.string()).optional(),

  /** File access restrictions */
  fileRestrictions: z.array(FileRestrictionSchema).optional(),

  /** Parent mode slug for inheritance */
  parentMode: z.string().optional(),

  /** Maximum concurrent subagents */
  maxConcurrentSubagents: z.number().int().positive().optional(),
});

/**
 * Type inferred from the schema for runtime use.
 */
export type ValidatedCustomAgentDefinition = z.infer<typeof CustomAgentDefinitionSchema>;

// ============================================
// Helper Validation Functions
// ============================================

/**
 * Validates a slug string against the pattern.
 *
 * @param slug - The slug to validate
 * @returns True if valid, false otherwise
 */
export function isValidSlug(slug: string): boolean {
  if (slug.length === 0 || slug.length > MAX_SLUG_LENGTH) {
    return false;
  }
  return SLUG_PATTERN.test(slug);
}

/**
 * Validates a custom agent definition.
 *
 * @param definition - The definition to validate
 * @returns Validation result with success status and data/error
 */
export function validateAgentDefinition(definition: unknown) {
  return CustomAgentDefinitionSchema.safeParse(definition);
}
