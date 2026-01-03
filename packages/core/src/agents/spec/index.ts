// ============================================
// Spec Agents - Barrel Export
// ============================================
// T023: Barrel exports for spec workflow agents

import type { CustomAgentRegistry } from "../custom/registry.js";
import type { CustomAgentDefinition } from "../custom/types.js";
import { specArchitectAgent } from "./architect.js";
import { specRequirementsAgent } from "./requirements.js";
import { specResearcherAgent } from "./researcher.js";
import { specTasksAgent } from "./tasks.js";
import { specValidatorAgent } from "./validator.js";

// ============================================
// Individual Agent Exports
// ============================================

export { specArchitectAgent } from "./architect.js";
export { specRequirementsAgent } from "./requirements.js";
export { specResearcherAgent } from "./researcher.js";
export { specTasksAgent } from "./tasks.js";
export { specValidatorAgent } from "./validator.js";

// ============================================
// Spawnable Agents Array
// ============================================

/**
 * Array of all spec workflow spawnable agents.
 *
 * These are Level 2 worker agents that can be spawned by
 * the spec workflow orchestrator (Level 1).
 *
 * @example
 * ```typescript
 * import { SPEC_SPAWNABLE_AGENTS } from './spec/index.js';
 *
 * console.log(`${SPEC_SPAWNABLE_AGENTS.length} spec agents available`);
 * for (const agent of SPEC_SPAWNABLE_AGENTS) {
 *   console.log(`- ${agent.name} (${agent.slug})`);
 * }
 * ```
 */
export const SPEC_SPAWNABLE_AGENTS: readonly CustomAgentDefinition[] = [
  specResearcherAgent,
  specRequirementsAgent,
  specArchitectAgent,
  specTasksAgent,
  specValidatorAgent,
] as const;

// ============================================
// Registration Function
// ============================================

/**
 * Register all spec workflow agents with an AgentRegistry.
 *
 * Iterates through SPEC_SPAWNABLE_AGENTS and registers each with
 * the provided registry for O(1) lookup by slug.
 *
 * @param registry - The CustomAgentRegistry to register agents with
 *
 * @example
 * ```typescript
 * import { createAgentRegistry } from '../custom/registry.js';
 * import { registerSpecAgents } from './spec/index.js';
 *
 * const registry = createAgentRegistry();
 * registerSpecAgents(registry);
 *
 * // Now all spec agents are accessible
 * const researcher = registry.get('spec-researcher');
 * const validator = registry.get('spec-validator');
 * ```
 */
export function registerSpecAgents(registry: CustomAgentRegistry): void {
  for (const agent of SPEC_SPAWNABLE_AGENTS) {
    registry.register(agent);
  }
}

/**
 * Get all spec agent slugs.
 *
 * Useful for validation and configuration.
 *
 * @returns Array of spec agent slugs
 *
 * @example
 * ```typescript
 * import { getSpecAgentSlugs } from './spec/index.js';
 *
 * const slugs = getSpecAgentSlugs();
 * // ['spec-researcher', 'spec-requirements', 'spec-architect', 'spec-tasks', 'spec-validator']
 * ```
 */
export function getSpecAgentSlugs(): string[] {
  return SPEC_SPAWNABLE_AGENTS.map((agent) => agent.slug);
}
