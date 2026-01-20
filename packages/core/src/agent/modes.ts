// ============================================
// Agent Modes Configuration
// ============================================

import { z } from "zod";
import { type ToolGroupEntry, ToolGroupEntrySchema } from "./restrictions.js";

/**
 * Available agent modes.
 *
 * Each mode configures the agent for a specific workflow:
 * - plan: Analyze requirements, generate implementation plans
 * - code: Autonomous code writing and modification
 * - draft: Quick prototyping, explore solutions
 * - debug: Error analysis and bug fixing
 * - ask: Interactive Q&A and knowledge queries
 */
export const AgentModeSchema = z.enum(["plan", "code", "draft", "debug", "ask"]);
export type AgentMode = z.infer<typeof AgentModeSchema>;

/**
 * All available modes as a readonly array.
 */
export const AGENT_MODES = AgentModeSchema.options;

/**
 * Tool permission settings for a mode.
 */
export interface ToolPermissions {
  /** Whether file editing is allowed */
  edit: boolean;
  /** Bash command execution: true = full, "readonly" = read-only commands, false = disabled */
  bash: boolean | "readonly";
  /** Whether web browsing is allowed */
  web?: boolean;
  /** Whether MCP tools are allowed */
  mcp?: boolean;
}

/**
 * Configuration for an agent mode.
 */
export interface ModeConfig {
  /** Mode identifier */
  name: AgentMode;
  /** Human-readable description */
  description: string;
  /** Tool permission configuration */
  tools: ToolPermissions;
  /** LLM temperature (0.0 - 1.0) */
  temperature?: number;
  /** System prompt specific to this mode */
  prompt: string;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Whether to enable extended thinking */
  extendedThinking?: boolean;
}

/**
 * Zod schema for ToolPermissions.
 */
export const ToolPermissionsSchema = z.object({
  /** Whether file editing is allowed */
  edit: z.boolean(),
  /** Bash command execution: true = full, "readonly" = read-only commands, false = disabled */
  bash: z.union([z.boolean(), z.literal("readonly")]),
  /** Whether web browsing is allowed */
  web: z.boolean().optional(),
  /** Whether MCP tools are allowed */
  mcp: z.boolean().optional(),
});

/**
 * Zod schema for ModeConfig validation.
 *
 * Provides runtime validation for mode configurations.
 */
export const ModeConfigSchema = z.object({
  /** Mode identifier */
  name: AgentModeSchema,
  /** Human-readable description */
  description: z.string(),
  /** Tool permission configuration */
  tools: ToolPermissionsSchema,
  /** LLM temperature (0.0 - 1.0) */
  temperature: z.number().min(0).max(1).optional(),
  /** System prompt specific to this mode */
  prompt: z.string(),
  /** Maximum tokens for response */
  maxTokens: z.number().positive().optional(),
  /** Whether to enable extended thinking */
  extendedThinking: z.boolean().optional(),
});

// ============================================
// Extended Mode Configuration (Multi-Agent)
// ============================================

/**
 * Default maximum concurrent subagents.
 */
export const DEFAULT_MAX_CONCURRENT_SUBAGENTS = 3;

/**
 * Extended mode configuration for additional mode settings.
 *
 * Extends the base ModeConfig with tool group and inheritance fields.
 *
 * @deprecated Agent hierarchy fields (level, canSpawnAgents, fileRestrictions, maxConcurrentSubagents)
 * have been moved to AgentConfig. Use mode.agentName with AgentRegistry.get() instead.
 *
 * @example
 * ```typescript
 * // Old way (deprecated):
 * const level = mode.level;
 *
 * // New way:
 * import { AgentRegistry } from './agent-registry.js';
 * const agent = AgentRegistry.getInstance().get(mode.agentName);
 * const level = agent?.level;
 * ```
 *
 * @example
 * ```typescript
 * const extendedMode: ExtendedModeConfig = {
 *   name: "code",
 *   description: "Custom mode",
 *   tools: { edit: true, bash: true },
 *   prompt: "You are a coding assistant...",
 *   toolGroups: [{ group: "web", access: "read" }],
 *   parentMode: "base-mode",
 * };
 * ```
 */
export interface ExtendedModeConfig extends ModeConfig {
  /** Tool group access rules for this mode */
  toolGroups?: ToolGroupEntry[];
  /** Parent mode slug for configuration inheritance */
  parentMode?: string;
}

/**
 * Zod schema for ExtendedModeConfig validation.
 *
 * Extends ModeConfigSchema with additional mode settings:
 * - toolGroups: Tool group access control
 * - parentMode: For configuration inheritance
 *
 * Note: Agent hierarchy fields (level, canSpawnAgents, fileRestrictions,
 * maxConcurrentSubagents) are now in AgentConfigSchema.
 *
 * @example
 * ```typescript
 * const result = ExtendedModeConfigSchema.safeParse({
 *   name: "code",
 *   description: "Custom mode",
 *   tools: { edit: true, bash: true },
 *   prompt: "System prompt...",
 *   toolGroups: [{ group: "web", access: "read" }],
 * });
 *
 * if (result.success) {
 *   console.log(result.data.toolGroups);
 * }
 * ```
 */
export const ExtendedModeConfigSchema = ModeConfigSchema.extend({
  /** Tool group access rules */
  toolGroups: z.array(ToolGroupEntrySchema).optional(),
  /** Parent mode slug for inheritance */
  parentMode: z.string().optional(),
});

// ============================================
// Mode-Specific Prompts (Legacy TypeScript Fallback)
// ============================================
// These prompts are deprecated. Use markdown files instead:
// - plan: packages/core/src/prompts/markdown/modes/plan.md
// - code: packages/core/src/prompts/markdown/modes/vibe.md (via vibe mode)
// - draft/debug/ask: mapped to plan or vibe mode (see legacy-modes.ts)
//
// These constants exist only as TypeScript fallback for resilience.
// The PromptLoader loads markdown files as the primary source.
// ============================================

/**
 * System prompt for plan mode.
 *
 * @deprecated Use markdown file instead: `packages/core/src/prompts/markdown/modes/plan.md`
 * This constant is kept as TypeScript fallback for resilience when MD files are unavailable.
 *
 * @see {@link ../prompts/markdown/modes/plan.md} for the primary prompt source
 */
const PROMPT_PLAN = `You are a strategic planning assistant. Your role is to:
- Analyze requirements and constraints carefully
- Break down complex tasks into actionable steps
- Identify potential risks and dependencies
- Generate clear, implementable plans

You have READ-ONLY access to the codebase. You can analyze files and structure but cannot modify them.
Focus on understanding the current state and proposing a clear path forward.`;

/**
 * System prompt for code mode.
 *
 * @deprecated Use markdown file instead: `packages/core/src/prompts/markdown/modes/vibe.md`
 * This constant is kept as TypeScript fallback for resilience when MD files are unavailable.
 *
 * @see {@link ../prompts/markdown/modes/vibe.md} for the primary prompt source
 */
const PROMPT_CODE = `You are an autonomous coding assistant with full access to modify the codebase. Your role is to:
- Implement features according to specifications
- Write clean, maintainable, well-tested code
- Follow project conventions and patterns
- Make atomic, focused changes

You have FULL access to edit files, run commands, and execute tests.
Always verify your changes compile and pass tests before completing.`;

/**
 * System prompt for draft mode.
 *
 * @deprecated Draft mode is deprecated and maps to vibe mode with temperature 0.8.
 * Use markdown file: `packages/core/src/prompts/markdown/modes/vibe.md`
 * This constant is kept as TypeScript fallback for resilience when MD files are unavailable.
 *
 * @see {@link ./legacy-modes.ts} for the legacy → new mode mapping
 */
const PROMPT_DRAFT = `You are a creative prototyping assistant. Your role is to:
- Explore multiple solution approaches quickly
- Create working prototypes to validate ideas
- Prioritize speed over perfection
- Document trade-offs and assumptions

You have FULL access to edit and run code. Be exploratory and creative.
It's okay to leave TODOs for production hardening.`;

/**
 * System prompt for debug mode.
 *
 * @deprecated Debug mode is deprecated and maps to vibe mode with temperature 0.1.
 * Use markdown file: `packages/core/src/prompts/markdown/modes/vibe.md`
 * This constant is kept as TypeScript fallback for resilience when MD files are unavailable.
 *
 * @see {@link ./legacy-modes.ts} for the legacy → new mode mapping
 */
const PROMPT_DEBUG = `You are an expert debugging assistant. Your role is to:
- Analyze error messages and stack traces systematically
- Identify root causes through careful investigation
- Propose and implement targeted fixes
- Add safeguards to prevent recurrence

You have FULL access to edit files and run diagnostic commands.
Be methodical: reproduce the issue, identify the cause, fix it, verify the fix.`;

/**
 * System prompt for ask mode.
 *
 * @deprecated Ask mode is deprecated and maps to plan mode.
 * Use markdown file: `packages/core/src/prompts/markdown/modes/plan.md`
 * This constant is kept as TypeScript fallback for resilience when MD files are unavailable.
 *
 * @see {@link ./legacy-modes.ts} for the legacy → new mode mapping
 */
const PROMPT_ASK = `You are a knowledgeable assistant for answering questions. Your role is to:
- Provide accurate, well-explained answers
- Reference relevant documentation and code
- Explain concepts at the appropriate level
- Suggest next steps when applicable

You have READ-ONLY access. You can search and analyze but cannot modify anything.
Focus on being helpful, accurate, and educational.`;

// ============================================
// Mode Configurations (Legacy 5-Mode System)
// ============================================
// This 5-mode system (plan, code, draft, debug, ask) is being replaced
// by the 3-mode system (vibe, plan, spec) in coding-modes.ts.
// See legacy-modes.ts for the mapping between old and new modes.
// ============================================

/**
 * Complete configuration map for all agent modes.
 *
 * **Note**: This uses the legacy 5-mode system. The new 3-mode system
 * (`vibe`, `plan`, `spec`) is defined in `coding-modes.ts`.
 *
 * - `code` → `vibe` (fast autonomous coding)
 * - `draft` → `vibe` with temperature 0.8
 * - `debug` → `vibe` with temperature 0.1
 * - `ask` → `plan` (conversational)
 * - `plan` → `plan` (unchanged)
 *
 * The prompts in this object use deprecated TypeScript constants.
 * Primary prompt source: `packages/core/src/prompts/markdown/modes/*.md`
 *
 * @see {@link ./coding-modes.ts} for the new 3-mode system
 * @see {@link ./legacy-modes.ts} for the legacy → new mode mapping
 */
export const MODE_CONFIGS: Readonly<Record<AgentMode, ModeConfig>> = {
  plan: {
    name: "plan",
    description: "Analyze requirements, generate implementation plans",
    tools: {
      edit: false,
      bash: "readonly",
      web: true,
      mcp: true,
    },
    temperature: 0.3,
    prompt: PROMPT_PLAN,
    extendedThinking: true,
  },
  code: {
    name: "code",
    description: "Autonomous code writing and modification",
    tools: {
      edit: true,
      bash: true,
      web: true,
      mcp: true,
    },
    temperature: 0.2,
    prompt: PROMPT_CODE,
    extendedThinking: false,
  },
  draft: {
    name: "draft",
    description: "Quick prototyping, explore solutions",
    tools: {
      edit: true,
      bash: true,
      web: true,
      mcp: true,
    },
    temperature: 0.8,
    prompt: PROMPT_DRAFT,
    extendedThinking: false,
  },
  debug: {
    name: "debug",
    description: "Error analysis and bug fixing",
    tools: {
      edit: true,
      bash: true,
      web: true,
      mcp: true,
    },
    temperature: 0.1,
    prompt: PROMPT_DEBUG,
    extendedThinking: true,
  },
  ask: {
    name: "ask",
    description: "Interactive Q&A and knowledge queries",
    tools: {
      edit: false,
      bash: false,
      web: true,
      mcp: false,
    },
    temperature: 0.5,
    prompt: PROMPT_ASK,
    extendedThinking: false,
  },
} as const;

/**
 * Gets the configuration for a specific mode.
 *
 * @param mode - The mode to get configuration for
 * @returns The mode configuration
 */
export function getModeConfig(mode: AgentMode): ModeConfig {
  return MODE_CONFIGS[mode];
}

/**
 * Checks if a mode allows file editing.
 *
 * @param mode - The mode to check
 * @returns true if editing is allowed
 */
export function canEdit(mode: AgentMode): boolean {
  return MODE_CONFIGS[mode].tools.edit;
}

/**
 * Checks if a mode allows bash command execution.
 *
 * @param mode - The mode to check
 * @returns true for full access, "readonly" for read-only, false for disabled
 */
export function getBashPermission(mode: AgentMode): boolean | "readonly" {
  return MODE_CONFIGS[mode].tools.bash;
}

/**
 * Gets the default temperature for a mode.
 *
 * @param mode - The mode to get temperature for
 * @returns The temperature value (defaults to 0.5 if not specified)
 */
export function getTemperature(mode: AgentMode): number {
  return MODE_CONFIGS[mode].temperature ?? 0.5;
}

// ============================================
// Mode Conversion Utilities
// ============================================

/**
 * Converts a base ModeConfig to an ExtendedModeConfig with sensible defaults.
 *
 * This function is used to upgrade Phase 06 mode configurations to the
 * extended format. All original ModeConfig fields are preserved, and
 * ExtendedModeConfig fields are added with safe defaults.
 *
 * Default values:
 * - `toolGroups`: `[]` (all tools enabled)
 * - `parentMode`: `undefined` (no parent)
 *
 * Note: Agent hierarchy fields (level, canSpawnAgents, fileRestrictions,
 * maxConcurrentSubagents) are now in AgentConfig, not ExtendedModeConfig.
 *
 * @param config - The base ModeConfig to convert
 * @returns An ExtendedModeConfig with all original fields plus defaults
 *
 * @example
 * ```typescript
 * const baseConfig: ModeConfig = {
 *   name: "code",
 *   description: "Code mode",
 *   tools: { edit: true, bash: true },
 *   prompt: "You are a coder...",
 * };
 *
 * const extended = toExtendedMode(baseConfig);
 * // extended.toolGroups === []
 * // extended.parentMode === undefined
 * ```
 */
export function toExtendedMode(config: ModeConfig): ExtendedModeConfig {
  return {
    // Preserve all original ModeConfig fields
    ...config,
    // Add ExtendedModeConfig fields with sensible defaults
    toolGroups: [], // All tools enabled by default
    parentMode: undefined, // No parent by default
  };
}
