// ============================================
// Custom Agent Type Definitions
// ============================================

import type { AgentLevel } from "../../agent/level.js";
import type { ExtendedModeConfig } from "../../agent/modes.js";
import type { FileRestriction, ToolGroupEntry } from "../../agent/restrictions.js";

// ============================================
// Supporting Types (T005)
// ============================================

/**
 * Trigger pattern for context-aware agent activation.
 *
 * Defines patterns that can automatically suggest or activate an agent
 * based on file types, keywords, or custom conditions.
 *
 * @example
 * ```typescript
 * const triggers: TriggerPattern[] = [
 *   { type: "file", pattern: "**\/*.test.ts" },
 *   { type: "keyword", pattern: "test|spec|describe" },
 *   { type: "regex", pattern: "^(fix|bug|issue):" },
 * ];
 * ```
 */
export interface TriggerPattern {
  /** Pattern type: file glob, keyword match, or regex */
  type: "file" | "keyword" | "regex";
  /** The pattern to match against */
  pattern: string;
}

/**
 * Custom trigger function type for advanced agent activation.
 *
 * Allows programmatic control over when an agent should be activated.
 *
 * @param context - The current context including user input and file state
 * @returns True if the agent should be activated
 */
export type CustomTrigger = (context: {
  userInput: string;
  currentFiles: string[];
  projectType?: string;
}) => boolean;

/**
 * Configuration for when an agent should be suggested or activated.
 *
 * @example
 * ```typescript
 * const whenToUse: WhenToUse = {
 *   description: "Use for testing tasks",
 *   triggers: [
 *     { type: "file", pattern: "**\/*.test.ts" },
 *     { type: "keyword", pattern: "test|coverage" },
 *   ],
 *   priority: 10,
 * };
 * ```
 */
export interface WhenToUse {
  /** Human-readable description of when to use this agent */
  description: string;
  /** Automatic trigger patterns */
  triggers?: TriggerPattern[];
  /** Priority when multiple agents match (higher = more preferred) */
  priority?: number;
}

/**
 * Agent restrictions configuration.
 *
 * Defines what files and tools an agent can access.
 *
 * @example
 * ```typescript
 * const restrictions: AgentRestrictions = {
 *   fileRestrictions: [
 *     { pattern: "src/**", access: "write" },
 *     { pattern: "*.config.*", access: "read" },
 *   ],
 *   toolGroups: [
 *     { group: "filesystem", enabled: true },
 *     { group: "shell", enabled: false },
 *   ],
 *   maxTokens: 4096,
 *   timeout: 300000,
 * };
 * ```
 */
export interface AgentRestrictions {
  /** File access restrictions */
  fileRestrictions?: FileRestriction[];
  /** Tool group access rules */
  toolGroups?: ToolGroupEntry[];
  /** Maximum tokens for agent responses */
  maxTokens?: number;
  /** Execution timeout in milliseconds */
  timeout?: number;
}

/**
 * Lifecycle hooks for agent events.
 *
 * Allows customization of agent behavior at various lifecycle points.
 *
 * @example
 * ```typescript
 * const hooks: AgentHooks = {
 *   onStart: "echo 'Agent started'",
 *   onComplete: "npm run format",
 *   onError: "echo 'Error occurred: {{error}}'",
 * };
 * ```
 */
export interface AgentHooks {
  /** Command or script to run when agent starts */
  onStart?: string;
  /** Command or script to run when agent completes successfully */
  onComplete?: string;
  /** Command or script to run when agent encounters an error */
  onError?: string;
  /** Command or script to run before each tool execution */
  beforeTool?: string;
  /** Command or script to run after each tool execution */
  afterTool?: string;
}

/**
 * Multi-agent coordination configuration.
 *
 * Defines how an agent interacts with other agents in the system.
 *
 * @example
 * ```typescript
 * const coordination: AgentCoordination = {
 *   canSpawnAgents: ["code-reviewer", "test-writer"],
 *   parentMode: "orchestrator",
 *   maxConcurrentSubagents: 3,
 * };
 * ```
 */
export interface AgentCoordination {
  /** List of agent slugs this agent can spawn */
  canSpawnAgents?: string[];
  /** Parent agent slug for inheritance */
  parentMode?: string;
  /** Maximum concurrent subagents (default: 3) */
  maxConcurrentSubagents?: number;
}

/**
 * Runtime settings for agent behavior.
 *
 * @example
 * ```typescript
 * const settings: AgentSettings = {
 *   temperature: 0.7,
 *   extendedThinking: true,
 *   streamOutput: true,
 *   autoConfirm: false,
 * };
 * ```
 */
export interface AgentSettings {
  /** LLM temperature (0.0 - 1.0) */
  temperature?: number;
  /** Enable extended thinking/reasoning mode */
  extendedThinking?: boolean;
  /** Stream output in real-time */
  streamOutput?: boolean;
  /** Auto-confirm tool executions without user approval */
  autoConfirm?: boolean;
}

// ============================================
// CustomAgentDefinition Interface (T004)
// ============================================

/**
 * Complete definition for a custom agent.
 *
 * Extends ExtendedModeConfig with all agent-specific configuration fields.
 * This is the primary interface for defining custom agents via YAML frontmatter
 * in Markdown files.
 *
 * Required fields:
 * - slug: Unique identifier (lowercase, alphanumeric with hyphens)
 * - name: Human-readable display name
 *
 * Optional fields:
 * - extends: Base agent to inherit from
 * - mode: Base mode (plan, code, draft, debug, ask)
 * - icon: Emoji or icon identifier
 * - color: Hex color code for UI display
 * - hidden: Whether to hide from agent listings
 * - model: Specific LLM model override
 * - toolGroups: Tool access configuration
 * - systemPrompt: Custom system prompt
 * - restrictions: Access restrictions
 * - settings: Runtime settings
 * - whenToUse: Activation triggers
 * - hooks: Lifecycle hooks
 * - coordination: Multi-agent settings
 * - version: Agent definition version
 * - author: Agent creator identifier
 * - tags: Categorization tags
 * - docs: Documentation URL
 *
 * @example
 * ```typescript
 * const agent: CustomAgentDefinition = {
 *   // Required fields
 *   slug: "test-writer",
 *   name: "Test Writer",
 *
 *   // Base configuration
 *   mode: "code",
 *   extends: "base-coder",
 *
 *   // UI settings
 *   icon: "🧪",
 *   color: "#22c55e",
 *   hidden: false,
 *
 *   // LLM configuration
 *   model: "claude-3-5-sonnet",
 *   systemPrompt: "You are a test writing specialist...",
 *
 *   // Access configuration
 *   toolGroups: [
 *     { group: "filesystem", enabled: true },
 *   ],
 *   restrictions: {
 *     fileRestrictions: [
 *       { pattern: "**\/*.test.ts", access: "write" },
 *     ],
 *   },
 *
 *   // Runtime settings
 *   settings: {
 *     temperature: 0.3,
 *     extendedThinking: false,
 *   },
 *
 *   // Activation
 *   whenToUse: {
 *     description: "Writing and updating tests",
 *     triggers: [
 *       { type: "keyword", pattern: "test|spec" },
 *     ],
 *   },
 *
 *   // Multi-agent
 *   level: AgentLevel.worker,
 *   coordination: {
 *     parentMode: "qa-orchestrator",
 *   },
 *
 *   // Metadata
 *   version: "1.0.0",
 *   author: "team",
 *   tags: ["testing", "qa"],
 *   docs: "https://docs.example.com/agents/test-writer",
 * };
 * ```
 */
export interface CustomAgentDefinition
  extends Omit<Partial<ExtendedModeConfig>, "name" | "description"> {
  // ============================================
  // Identity (Required)
  // ============================================

  /**
   * Unique identifier for the agent.
   *
   * Must be lowercase alphanumeric with hyphens.
   * Pattern: /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/
   * Max length: 50 characters
   */
  slug: string;

  /**
   * Human-readable display name.
   * Max length: 100 characters
   */
  name: string;

  // ============================================
  // Inheritance & Base Configuration
  // ============================================

  /**
   * Base agent slug to inherit configuration from.
   * The custom agent will inherit all settings from the parent
   * and can override specific fields.
   */
  extends?: string;

  /**
   * Base mode to use (plan, code, draft, debug, ask).
   * Determines default tool permissions and behavior.
   */
  mode?: string;

  // ============================================
  // UI Configuration
  // ============================================

  /**
   * Icon for UI display (emoji or icon identifier).
   * Example: "🔧", "wrench", "mdi:wrench"
   */
  icon?: string;

  /**
   * Color for UI display (hex code).
   * Example: "#3b82f6"
   */
  color?: string;

  /**
   * Whether to hide this agent from listings.
   * Hidden agents can still be invoked directly.
   */
  hidden?: boolean;

  // ============================================
  // LLM Configuration
  // ============================================

  /**
   * Specific LLM model to use for this agent.
   * Example: "claude-3-5-sonnet", "gpt-4-turbo"
   */
  model?: string;

  /**
   * Custom system prompt for this agent.
   * Can include variables like {{projectContext}}.
   */
  systemPrompt?: string;

  // ============================================
  // Access & Restrictions
  // ============================================

  /**
   * Tool group access configuration.
   * Inherits from base mode but can override.
   */
  toolGroups?: ToolGroupEntry[];

  /**
   * Access restrictions for files and tools.
   */
  restrictions?: AgentRestrictions;

  // ============================================
  // Runtime Behavior
  // ============================================

  /**
   * Runtime settings for agent behavior.
   */
  settings?: AgentSettings;

  /**
   * When this agent should be suggested or activated.
   */
  whenToUse?: WhenToUse;

  /**
   * Lifecycle hooks for customization.
   */
  hooks?: AgentHooks;

  // ============================================
  // Multi-Agent Coordination
  // ============================================

  /**
   * Agent's level in the hierarchy (orchestrator, workflow, worker).
   */
  level?: AgentLevel;

  /**
   * Multi-agent coordination settings.
   */
  coordination?: AgentCoordination;

  // ============================================
  // Metadata
  // ============================================

  /**
   * Agent definition version (semver).
   * Example: "1.0.0", "2.1.3"
   */
  version?: string;

  /**
   * Agent creator identifier.
   * Example: "team", "user@example.com", "github:username"
   */
  author?: string;

  /**
   * Categorization tags for organization and search.
   * Example: ["testing", "frontend", "react"]
   */
  tags?: string[];

  /**
   * Documentation URL for this agent.
   */
  docs?: string;

  /**
   * Extended description of the agent (max 500 characters).
   * Used in agent listings and help text.
   */
  description?: string;
}

// ============================================
// Export all types
// ============================================

export { AgentLevel } from "../../agent/level.js";
export type {
  FileRestriction,
  ToolGroupEntry,
} from "../../agent/restrictions.js";
