// ============================================
// Agent Level Hierarchy
// ============================================

import { z } from "zod";
import type { AgentConfig } from "./agent-config.js";

/**
 * Agent hierarchy levels for multi-agent orchestration.
 *
 * The hierarchy follows a strict spawn pattern:
 * - orchestrator (0): Top-level coordinator, spawns workflow agents
 * - workflow (1): Mid-level manager, spawns worker agents
 * - worker (2): Leaf-level executor, cannot spawn other agents
 *
 * @example
 * ```typescript
 * const level = AgentLevel.orchestrator;
 * if (canSpawn(level, AgentLevel.workflow)) {
 *   // Spawn workflow agent
 * }
 * ```
 */
export enum AgentLevel {
  /** Top-level orchestrator - coordinates workflows */
  orchestrator = 0,
  /** Mid-level workflow manager - coordinates workers */
  workflow = 1,
  /** Leaf-level worker - executes tasks */
  worker = 2,
}

/**
 * Zod schema for validating AgentLevel values.
 *
 * @example
 * ```typescript
 * const result = AgentLevelSchema.safeParse(0);
 * if (result.success) {
 *   console.log(result.data); // AgentLevel.orchestrator
 * }
 * ```
 */
export const AgentLevelSchema = z.nativeEnum(AgentLevel);

/**
 * Determines if an agent at a given level can spawn another agent at a target level.
 *
 * Spawn rules:
 * - orchestrator (0) can spawn workflow (1) only
 * - workflow (1) can spawn worker (2) only
 * - worker (2) cannot spawn any agent
 * - No agent can spawn an agent at the same level
 * - No agent can spawn an agent at a higher level (lower number)
 *
 * @param fromLevel - The level of the spawning agent
 * @param toLevel - The level of the agent to be spawned
 * @returns `true` if spawning is allowed, `false` otherwise
 *
 * @example
 * ```typescript
 * canSpawn(AgentLevel.orchestrator, AgentLevel.workflow); // true
 * canSpawn(AgentLevel.workflow, AgentLevel.worker);       // true
 * canSpawn(AgentLevel.worker, AgentLevel.worker);         // false
 * canSpawn(AgentLevel.orchestrator, AgentLevel.worker);   // false (skip level)
 * ```
 */
export function canSpawn(fromLevel: AgentLevel, toLevel: AgentLevel): boolean {
  // Workers cannot spawn any agent
  if (fromLevel === AgentLevel.worker) {
    return false;
  }

  // Can only spawn exactly one level below
  // orchestrator (0) -> workflow (1)
  // workflow (1) -> worker (2)
  return toLevel === fromLevel + 1;
}

/**
 * Determines if an agent can spawn another agent using AgentConfig.
 *
 * This function checks spawn permissions based on AgentConfig properties:
 * 1. The current agent must have `canSpawnAgents === true`
 * 2. The current agent's level must be lower (numerically) than the target's level
 *
 * Unlike `canSpawn` which only checks level hierarchy, this function also
 * respects the `canSpawnAgents` permission flag in AgentConfig.
 *
 * @param currentAgent - The AgentConfig of the agent attempting to spawn
 * @param targetAgent - The AgentConfig of the agent to be spawned
 * @returns `true` if spawning is allowed, `false` otherwise
 *
 * @example
 * ```typescript
 * import { canAgentSpawn } from './level.js';
 * import { PLAN_AGENT, VIBE_AGENT, SPEC_ORCHESTRATOR } from './agent-config.js';
 *
 * // Plan agent (level 1, canSpawnAgents: true) can spawn vibe agent (level 2)
 * canAgentSpawn(PLAN_AGENT, VIBE_AGENT); // true
 *
 * // Vibe agent (level 2, canSpawnAgents: false) cannot spawn any agent
 * canAgentSpawn(VIBE_AGENT, VIBE_AGENT); // false
 *
 * // Spec orchestrator (level 0) can spawn plan agent (level 1)
 * canAgentSpawn(SPEC_ORCHESTRATOR, PLAN_AGENT); // true
 * ```
 */
export function canAgentSpawn(currentAgent: AgentConfig, targetAgent: AgentConfig): boolean {
  // Agent must have spawn permission enabled
  if (!currentAgent.canSpawnAgents) {
    return false;
  }

  // Current agent's level must be lower (numerically) than target's level
  // orchestrator (0) can spawn workflow (1) or worker (2)
  // workflow (1) can spawn worker (2)
  // worker (2) cannot spawn anything (already blocked by canSpawnAgents check)
  return currentAgent.level < targetAgent.level;
}
