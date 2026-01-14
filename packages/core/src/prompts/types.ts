// ============================================
// Prompt System Types and Schemas
// ============================================

/**
 * Type definitions and Zod schemas for the agent prompt system.
 *
 * Provides comprehensive types for agent roles, prompt layers,
 * session context, and related configuration.
 *
 * @module @vellum/core/prompts/types
 */

import { z } from "zod";

// =============================================================================
// Constants
// =============================================================================

/**
 * Maximum allowed prompt size in characters.
 * Prompts exceeding this limit will throw PromptSizeError.
 */
export const MAX_PROMPT_SIZE = 200000;

// =============================================================================
// Agent Roles
// =============================================================================

/**
 * Available agent roles in the system.
 *
 * - `orchestrator`: Master coordinator that delegates tasks to other agents
 * - `coder`: Implementation specialist for writing and modifying code
 * - `qa`: Quality assurance for testing and debugging
 * - `writer`: Documentation and content creation specialist
 * - `analyst`: Code analysis and read-only investigation
 * - `architect`: System design and architecture decisions
 */
export const AGENT_ROLES = [
  "orchestrator",
  "coder",
  "qa",
  "writer",
  "analyst",
  "architect",
] as const;

/**
 * Zod schema for agent role validation.
 */
export const AgentRoleSchema = z.enum(AGENT_ROLES);

/**
 * Type representing valid agent roles.
 */
export type AgentRole = z.infer<typeof AgentRoleSchema>;

// =============================================================================
// Prompt Layer Types
// =============================================================================

/**
 * Sources of prompt content, determining where the content originates.
 *
 * - `base`: Core system instructions (highest priority)
 * - `role`: Role-specific instructions
 * - `mode`: Mode-specific modifications (e.g., plan, code, debug)
 * - `context`: Dynamic runtime context (lowest priority)
 */
export const PROMPT_LAYER_SOURCES = ["base", "role", "mode", "context"] as const;

/**
 * Zod schema for prompt layer source validation.
 */
export const PromptLayerSourceSchema = z.enum(PROMPT_LAYER_SOURCES);

/**
 * Type representing valid prompt layer sources.
 */
export type PromptLayerSource = z.infer<typeof PromptLayerSourceSchema>;

/**
 * Priority levels for prompt layers.
 *
 * - 1: Highest priority (base system instructions)
 * - 2: High priority (role-specific)
 * - 3: Medium priority (mode-specific)
 * - 4: Lowest priority (dynamic context)
 */
export const PromptPrioritySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

/**
 * Type representing prompt priority levels (1-4).
 */
export type PromptPriority = z.infer<typeof PromptPrioritySchema>;

/**
 * A single layer of prompt content with priority and source metadata.
 *
 * Prompt layers are combined in priority order to form the final prompt,
 * with lower priority numbers taking precedence.
 */
export const PromptLayerSchema = z.object({
  /** The actual prompt content */
  content: z.string(),
  /** Priority level (1=highest, 4=lowest) */
  priority: PromptPrioritySchema,
  /** Origin of this layer */
  source: PromptLayerSourceSchema,
});

/**
 * Type representing a prompt layer.
 */
export type PromptLayer = z.infer<typeof PromptLayerSchema>;

// =============================================================================
// Session Context Types
// =============================================================================

/**
 * Information about the currently active file in the editor.
 */
export const ActiveFileSchema = z.object({
  /** Absolute or relative path to the file */
  path: z.string(),
  /** Programming language or file type */
  language: z.string(),
  /** Selected text content, if any */
  selection: z.string().optional(),
});

/**
 * Type representing active file information.
 */
export type ActiveFile = z.infer<typeof ActiveFileSchema>;

/**
 * Current git repository status.
 */
export const GitStatusSchema = z.object({
  /** Current branch name */
  branch: z.string(),
  /** List of modified but unstaged file paths */
  modified: z.array(z.string()),
  /** List of staged file paths */
  staged: z.array(z.string()),
});

/**
 * Type representing git status.
 */
export type GitStatus = z.infer<typeof GitStatusSchema>;

/**
 * Task status values.
 *
 * - `pending`: Task has not been started
 * - `in-progress`: Task is currently being worked on
 * - `complete`: Task has been finished
 */
export const TaskStatusSchema = z.enum(["pending", "in-progress", "complete"]);

/**
 * Type representing task status.
 */
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * A task being tracked in the session.
 */
export const TaskSchema = z.object({
  /** Unique task identifier */
  id: z.string(),
  /** Human-readable task description */
  description: z.string(),
  /** Current task status */
  status: TaskStatusSchema,
});

/**
 * Type representing a task.
 */
export type Task = z.infer<typeof TaskSchema>;

/**
 * Dynamic context information for the current session.
 *
 * Contains runtime state that influences prompt generation,
 * such as the active file, git status, and current task.
 */
export const SessionContextSchema = z.object({
  /** Currently active file in the editor */
  activeFile: ActiveFileSchema.optional(),
  /** Current git repository status */
  gitStatus: GitStatusSchema.optional(),
  /** Current task being worked on */
  currentTask: TaskSchema.optional(),
  /** List of current errors or issues */
  errors: z.array(z.string()).optional(),
});

/**
 * Type representing session context.
 */
export type SessionContext = z.infer<typeof SessionContextSchema>;

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when a prompt exceeds the maximum allowed size.
 *
 * @example
 * ```typescript
 * if (prompt.length > MAX_PROMPT_SIZE) {
 *   throw new PromptSizeError(prompt.length, MAX_PROMPT_SIZE);
 * }
 * ```
 */
export class PromptSizeError extends Error {
  /** The actual size of the prompt that exceeded the limit */
  public readonly actualSize: number;
  /** The maximum allowed size */
  public readonly maxSize: number;

  constructor(actualSize: number, maxSize: number = MAX_PROMPT_SIZE) {
    super(`Prompt size (${actualSize} chars) exceeds maximum allowed size (${maxSize} chars)`);
    this.name = "PromptSizeError";
    this.actualSize = actualSize;
    this.maxSize = maxSize;

    // Maintain proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PromptSizeError);
    }
  }
}

// =============================================================================
// Externalized Prompt System Types (REQ-001)
// =============================================================================

/**
 * Source locations where prompts can be discovered.
 *
 * - `builtin`: Shipped with Vellum core
 * - `project`: Found in project's .vellum/prompts/ directory
 * - `user`: Found in user's ~/.vellum/prompts/ directory
 * - `legacy`: Hardcoded prompts being migrated
 */
export type PromptSource = "builtin" | "project" | "user" | "legacy";

/**
 * Category of prompt content.
 *
 * - `role`: Agent role definitions (orchestrator, coder, qa, etc.)
 * - `mode`: Coding mode prompts (vibe, plan, spec)
 * - `worker`: Worker-specific prompt modifications
 * - `spec`: Specification workflow prompts
 * - `provider`: Provider-specific prompt adjustments
 * - `custom`: User-defined custom prompts
 */
export type PromptCategory = "role" | "mode" | "worker" | "spec" | "provider" | "custom";

/**
 * Location information for a discovered prompt.
 * Used by the prompt discovery system to track where prompts came from.
 */
export interface PromptLocation {
  /** Source type where the prompt was found */
  source: PromptSource;
  /** Absolute path to the prompt file */
  path: string;
  /** Priority for conflict resolution (lower number = higher priority) */
  priority: number;
}

/**
 * A loaded and parsed prompt with all metadata.
 * Represents a fully resolved prompt ready for use.
 */
export interface PromptLoaded {
  /** Unique identifier for the prompt */
  id: string;
  /** Human-readable name */
  name: string;
  /** Category of the prompt */
  category: PromptCategory;
  /** The actual prompt content (markdown body) */
  content: string;
  /** Location metadata */
  location: PromptLocation;
  /** Parsed frontmatter as key-value pairs */
  frontmatter: Record<string, unknown>;
  /** Optional version string */
  version?: string;
}

/**
 * Variable interpolation context for prompt rendering.
 * These variables are available for {{variable}} substitution in prompts.
 */
export interface PromptVariables {
  /** Operating system name (e.g., 'darwin', 'win32', 'linux') */
  os: string;
  /** Current shell (e.g., 'bash', 'zsh', 'powershell') */
  shell: string;
  /** Current working directory */
  cwd: string;
  /** Current date in ISO format */
  date: string;
  /** Current coding mode (e.g., 'vibe', 'plan', 'spec') */
  mode: string;
  /** Current LLM provider name */
  provider: string;
  /** Current model identifier */
  model: string;
  /** Allow additional string properties */
  [key: string]: string;
}
