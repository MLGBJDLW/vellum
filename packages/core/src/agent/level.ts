// ============================================
// Agent Level Hierarchy
// ============================================

import { z } from "zod";

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
