// ============================================
// Spec Agents - Barrel Export
// ============================================
// T023: Barrel exports for spec workflow agents
// T025: PromptLoader integration for markdown prompt support
// @see REQ-001, REQ-019

import { PromptLoader } from "../../prompts/prompt-loader.js";
import type { CustomAgentRegistry } from "../custom/registry.js";
import type { CustomAgentDefinition } from "../custom/types.js";
import { specArchitectAgent } from "./architect.js";
import { specRequirementsAgent } from "./requirements.js";
import { specResearcherAgent } from "./researcher.js";
import { specTasksAgent } from "./tasks.js";
import { specValidatorAgent } from "./validator.js";

// ============================================
// Prompt Loader Instance
// ============================================

/**
 * Shared PromptLoader instance for spec agent prompts.
 * Uses LRU caching to avoid repeated file reads.
 */
const specPromptLoader = new PromptLoader({
  maxCacheSize: 10,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
});

// ============================================
// Fallback Prompt Map
// ============================================

/**
 * Mapping of spec agent slugs to their fallback prompts.
 * Used when markdown prompts are not found.
 */
const SPEC_AGENT_FALLBACK_PROMPTS: Record<string, () => string> = {
  "spec-researcher": () => specResearcherAgent.systemPrompt ?? "",
  "spec-requirements": () => specRequirementsAgent.systemPrompt ?? "",
  "spec-architect": () => specArchitectAgent.systemPrompt ?? "",
  "spec-tasks": () => specTasksAgent.systemPrompt ?? "",
  "spec-validator": () => specValidatorAgent.systemPrompt ?? "",
};

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

// ============================================
// Async Prompt Loading (T025)
// ============================================

/**
 * Get the system prompt for a spec agent type (async, with markdown support).
 *
 * Attempts to load the prompt from markdown files via PromptLoader.
 * Falls back to TypeScript definitions if markdown file is not found.
 *
 * @param slug - The spec agent slug (e.g., 'spec-researcher', 'spec-validator')
 * @returns Promise resolving to the system prompt string
 *
 * @example
 * ```typescript
 * // Load spec agent prompt with markdown support
 * const prompt = await getSpecAgentPromptAsync('spec-researcher');
 * ```
 */
export async function getSpecAgentPromptAsync(slug: string): Promise<string> {
  // Extract the prompt name from slug (e.g., 'spec-researcher' -> 'researcher')
  const promptName = slug.replace(/^spec-/, "");

  try {
    const loaded = await specPromptLoader.load(promptName, "spec");
    return loaded.content;
  } catch {
    // TypeScript fallback - return hardcoded constant
    const fallback = SPEC_AGENT_FALLBACK_PROMPTS[slug];
    return fallback ? fallback() : "";
  }
}

/**
 * Get a spec agent definition with async-loaded prompt.
 *
 * Returns a copy of the agent definition with the systemPrompt
 * loaded from markdown files (with TypeScript fallback).
 *
 * @param slug - The spec agent slug
 * @returns Promise resolving to CustomAgentDefinition with loaded prompt
 *
 * @example
 * ```typescript
 * const researcher = await getSpecAgentWithPromptAsync('spec-researcher');
 * console.log(researcher.systemPrompt); // Loaded from markdown
 * ```
 */
export async function getSpecAgentWithPromptAsync(
  slug: string
): Promise<CustomAgentDefinition | null> {
  const agent = SPEC_SPAWNABLE_AGENTS.find((a) => a.slug === slug);
  if (!agent) {
    return null;
  }

  const prompt = await getSpecAgentPromptAsync(slug);

  return {
    ...agent,
    systemPrompt: prompt,
  };
}

/**
 * Set the workspace path for spec agent prompt discovery.
 *
 * Configures the PromptLoader to look for prompts in the specified workspace.
 *
 * @param path - Absolute path to the workspace root
 */
export function setSpecPromptWorkspace(path: string): void {
  specPromptLoader.setWorkspacePath(path);
}

/**
 * Invalidate cached spec agent prompts.
 *
 * Forces the next `getSpecAgentPromptAsync()` call to reload from disk.
 *
 * @param slug - Optional agent slug to invalidate. If omitted, invalidates all.
 */
export function invalidateSpecPromptCache(slug?: string): void {
  if (slug) {
    const promptName = slug.replace(/^spec-/, "");
    specPromptLoader.invalidate(promptName);
  } else {
    specPromptLoader.invalidateAll();
  }
}
