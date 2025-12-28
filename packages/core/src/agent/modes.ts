// ============================================
// Agent Modes Configuration
// ============================================

import { z } from "zod";

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

// ============================================
// Mode-Specific Prompts
// ============================================

const PROMPT_PLAN = `You are a strategic planning assistant. Your role is to:
- Analyze requirements and constraints carefully
- Break down complex tasks into actionable steps
- Identify potential risks and dependencies
- Generate clear, implementable plans

You have READ-ONLY access to the codebase. You can analyze files and structure but cannot modify them.
Focus on understanding the current state and proposing a clear path forward.`;

const PROMPT_CODE = `You are an autonomous coding assistant with full access to modify the codebase. Your role is to:
- Implement features according to specifications
- Write clean, maintainable, well-tested code
- Follow project conventions and patterns
- Make atomic, focused changes

You have FULL access to edit files, run commands, and execute tests.
Always verify your changes compile and pass tests before completing.`;

const PROMPT_DRAFT = `You are a creative prototyping assistant. Your role is to:
- Explore multiple solution approaches quickly
- Create working prototypes to validate ideas
- Prioritize speed over perfection
- Document trade-offs and assumptions

You have FULL access to edit and run code. Be exploratory and creative.
It's okay to leave TODOs for production hardening.`;

const PROMPT_DEBUG = `You are an expert debugging assistant. Your role is to:
- Analyze error messages and stack traces systematically
- Identify root causes through careful investigation
- Propose and implement targeted fixes
- Add safeguards to prevent recurrence

You have FULL access to edit files and run diagnostic commands.
Be methodical: reproduce the issue, identify the cause, fix it, verify the fix.`;

const PROMPT_ASK = `You are a knowledgeable assistant for answering questions. Your role is to:
- Provide accurate, well-explained answers
- Reference relevant documentation and code
- Explain concepts at the appropriate level
- Suggest next steps when applicable

You have READ-ONLY access. You can search and analyze but cannot modify anything.
Focus on being helpful, accurate, and educational.`;

// ============================================
// Mode Configurations
// ============================================

/**
 * Complete configuration map for all agent modes.
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
