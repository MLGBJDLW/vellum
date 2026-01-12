import { z } from "zod";
import { AgentLevel, AgentLevelSchema } from "./level.js";

// Re-export for convenience
export { AgentLevel, AgentLevelSchema };

// ============================================================================
// FILE RESTRICTIONS
// ============================================================================

/**
 * File access restrictions for an agent.
 *
 * Defines what files the agent can access and how. Used by the permission
 * system to enforce sandbox boundaries for file operations.
 *
 * ## Fields
 *
 * - `allowedPaths`: Glob patterns for files the agent CAN access.
 *   If specified, ONLY matching files are accessible.
 * - `deniedPaths`: Glob patterns for files the agent CANNOT access.
 *   Takes precedence over allowedPaths.
 * - `readOnly`: If true, agent can read but not write/delete files.
 *
 * @example
 * ```typescript
 * // Allow only src and tests, deny node_modules
 * const restrictions: FileRestrictions = {
 *   allowedPaths: ["src/**", "tests/**"],
 *   deniedPaths: ["node_modules/**", ".env*"],
 *   readOnly: false,
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Read-only access to entire workspace
 * const readOnlyRestrictions: FileRestrictions = {
 *   readOnly: true,
 * };
 * ```
 */
export interface FileRestrictions {
  /** Glob patterns for allowed file paths */
  readonly allowedPaths?: readonly string[];
  /** Glob patterns for denied file paths */
  readonly deniedPaths?: readonly string[];
  /** If true, agent can only read files, not write */
  readonly readOnly?: boolean;
}

/**
 * Zod schema for validating FileRestrictions objects.
 */
export const FileRestrictionsSchema = z.object({
  allowedPaths: z.array(z.string()).optional(),
  deniedPaths: z.array(z.string()).optional(),
  readOnly: z.boolean().optional(),
});

// ============================================================================
// AGENT CONFIG
// ============================================================================

/**
 * Configuration for an agent in the multi-agent hierarchy.
 *
 * Agents are internal implementation details; modes are user-facing.
 * Each agent has a level that determines what it can spawn and access.
 *
 * ## Hierarchy Levels
 *
 * | Level | Name         | Can Spawn      | Purpose                     |
 * |-------|--------------|----------------|-----------------------------|
 * | 0     | orchestrator | workflow (1)   | Top-level coordination      |
 * | 1     | workflow     | worker (2)     | Multi-step task management  |
 * | 2     | worker       | none           | Single task execution       |
 *
 * ## Fields
 *
 * - `name`: Unique identifier (e.g., "vibe-agent", "spec-orchestrator")
 * - `level`: Hierarchy position (0=orchestrator, 1=workflow, 2=worker)
 * - `canSpawnAgents`: Whether this agent can create sub-agents
 * - `fileRestrictions`: Optional sandbox rules for file access
 * - `maxConcurrentSubagents`: Limit on parallel sub-agents
 * - `description`: Human-readable purpose for logging/UI
 *
 * @example
 * ```typescript
 * // Custom worker agent
 * const customAgent: AgentConfig = {
 *   name: "my-custom-agent",
 *   level: 2,
 *   canSpawnAgents: false,
 *   description: "A custom worker agent for specific tasks",
 *   fileRestrictions: {
 *     allowedPaths: ["src/**"],
 *     readOnly: true,
 *   },
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Register and use with AgentRegistry
 * import { AgentRegistry } from './agent-registry.js';
 *
 * const registry = AgentRegistry.getInstance();
 * registry.register(customAgent);
 *
 * const agent = registry.get("my-custom-agent");
 * console.log(agent?.level); // 2
 * ```
 */
export interface AgentConfig {
  /** Unique identifier for this agent */
  readonly name: string;

  /** Hierarchy level: 0=orchestrator, 1=workflow, 2=worker */
  readonly level: AgentLevel;

  /** Whether this agent can spawn sub-agents */
  readonly canSpawnAgents: boolean;

  /** Optional file access restrictions */
  readonly fileRestrictions?: FileRestrictions;

  /** Maximum concurrent sub-agents (undefined = unlimited) */
  readonly maxConcurrentSubagents?: number;

  /** Human-readable description of the agent's purpose */
  readonly description?: string;
}

/**
 * Zod schema for validating AgentConfig objects.
 *
 * @example
 * ```typescript
 * const result = AgentConfigSchema.safeParse(config);
 * if (result.success) {
 *   console.log(result.data.name);
 * }
 * ```
 */
export const AgentConfigSchema = z.object({
  name: z.string().min(1),
  level: AgentLevelSchema,
  canSpawnAgents: z.boolean(),
  fileRestrictions: FileRestrictionsSchema.optional(),
  maxConcurrentSubagents: z.number().int().positive().optional(),
  description: z.string().optional(),
});

// ============================================================================
// BUILT-IN AGENTS
// ============================================================================

/**
 * Vibe agent - Worker level for quick, autonomous tasks.
 *
 * Cannot spawn sub-agents. Full file access.
 */
export const VIBE_AGENT: AgentConfig = {
  name: "vibe-agent",
  level: 2,
  canSpawnAgents: false,
  description: "Fast autonomous coding with full tool access",
} as const;

/**
 * Plan agent - Workflow level for planned tasks with review.
 *
 * Can spawn worker agents. Workspace-scoped file access.
 */
export const PLAN_AGENT: AgentConfig = {
  name: "plan-agent",
  level: 1,
  canSpawnAgents: true,
  maxConcurrentSubagents: 3,
  description: "Plan-then-execute with one checkpoint",
} as const;

/**
 * Spec orchestrator - Top-level orchestrator for spec workflow.
 *
 * Can spawn workflow and worker agents. Read-only until impl phase.
 */
export const SPEC_ORCHESTRATOR: AgentConfig = {
  name: "spec-orchestrator",
  level: 0,
  canSpawnAgents: true,
  maxConcurrentSubagents: 5,
  description: "6-phase structured workflow with checkpoints",
} as const;

/**
 * Record of all built-in agents by name.
 *
 * Contains the three core agents:
 * - `vibe-agent`: Worker (level 2) for fast autonomous coding
 * - `plan-agent`: Workflow (level 1) for planned tasks with review
 * - `spec-orchestrator`: Orchestrator (level 0) for spec workflow
 *
 * These agents are automatically registered in the AgentRegistry on startup.
 *
 * @example
 * ```typescript
 * // Direct access
 * const agent = BUILT_IN_AGENTS["vibe-agent"];
 * console.log(agent.level); // 2
 * console.log(agent.canSpawnAgents); // false
 * ```
 *
 * @example
 * ```typescript
 * // Via AgentRegistry (preferred)
 * import { AgentRegistry } from './agent-registry.js';
 *
 * const registry = AgentRegistry.getInstance();
 * const agent = registry.get("vibe-agent");
 * ```
 *
 * @example
 * ```typescript
 * // Iterate all built-in agents
 * for (const [name, config] of Object.entries(BUILT_IN_AGENTS)) {
 *   console.log(`${name}: level ${config.level}`);
 * }
 * // Output:
 * // vibe-agent: level 2
 * // plan-agent: level 1
 * // spec-orchestrator: level 0
 * ```
 */
export const BUILT_IN_AGENTS = {
  "vibe-agent": VIBE_AGENT,
  "plan-agent": PLAN_AGENT,
  "spec-orchestrator": SPEC_ORCHESTRATOR,
} as const;
