// ============================================
// Role Prompts Index
// ============================================

/**
 * Barrel exports and role prompt loader for the agent prompt system.
 *
 * Provides individual role prompt exports and a unified loader function
 * for retrieving prompts by role name.
 *
 * @module @vellum/core/prompts/roles
 */

import type { AgentRole } from "../types.js";

// =============================================================================
// Individual Role Exports
// =============================================================================

export { ANALYST_PROMPT } from "./analyst.js";
export { ARCHITECT_PROMPT } from "./architect.js";
export { BASE_PROMPT } from "./base.js";
export { CODER_PROMPT } from "./coder.js";
export { ORCHESTRATOR_PROMPT } from "./orchestrator.js";
export { QA_PROMPT } from "./qa.js";
export { WRITER_PROMPT } from "./writer.js";

// =============================================================================
// Role Prompt Imports (for loader)
// =============================================================================

import { ANALYST_PROMPT } from "./analyst.js";
import { ARCHITECT_PROMPT } from "./architect.js";
import { CODER_PROMPT } from "./coder.js";
import { ORCHESTRATOR_PROMPT } from "./orchestrator.js";
import { QA_PROMPT } from "./qa.js";
import { WRITER_PROMPT } from "./writer.js";

// =============================================================================
// Role Prompt Loader
// =============================================================================

/**
 * Mapping of agent roles to their corresponding prompt strings.
 * Used internally by loadRolePrompt for efficient lookup.
 */
const ROLE_PROMPTS: Record<AgentRole, string> = {
  orchestrator: ORCHESTRATOR_PROMPT,
  coder: CODER_PROMPT,
  qa: QA_PROMPT,
  writer: WRITER_PROMPT,
  analyst: ANALYST_PROMPT,
  architect: ARCHITECT_PROMPT,
};

/**
 * Load a role prompt by role name.
 *
 * Retrieves the system prompt for a specific agent role. Returns an empty
 * string if the role is not found, providing defensive behavior for
 * runtime safety.
 *
 * @param role - The agent role to load
 * @returns The role prompt string, or empty string if not found
 *
 * @example
 * ```typescript
 * import { loadRolePrompt } from '@vellum/core/prompts/roles';
 *
 * // Load the coder role prompt
 * const coderPrompt = loadRolePrompt('coder');
 *
 * // Safe handling of unknown roles
 * const unknownPrompt = loadRolePrompt('unknown' as AgentRole);
 * // Returns ''
 * ```
 */
export function loadRolePrompt(role: AgentRole): string {
  return ROLE_PROMPTS[role] ?? "";
}
