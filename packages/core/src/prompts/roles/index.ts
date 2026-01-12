// ============================================
// Role Prompts Index
// ============================================

/**
 * Barrel exports and role prompt loader for the agent prompt system.
 *
 * Provides individual role prompt exports and a unified loader function
 * for retrieving prompts by role name. Supports loading from markdown files
 * via PromptLoader with TypeScript fallback for backward compatibility.
 *
 * @module @vellum/core/prompts/roles
 * @see REQ-001, REQ-019
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
// Role Prompt Mapping (TypeScript Fallback)
// =============================================================================

/**
 * Mapping of agent roles to their corresponding prompt strings.
 *
 * This is used as a fallback when markdown prompt files are not found
 * or fail to load. Provides backward compatibility with the original
 * hardcoded prompt system.
 *
 * @deprecated Direct access is deprecated. Use loadRolePrompt() or
 * loadRolePromptAsync() instead. Will be removed in a future version.
 */
const ROLE_PROMPTS: Record<AgentRole, string> = {
  orchestrator: ORCHESTRATOR_PROMPT,
  coder: CODER_PROMPT,
  qa: QA_PROMPT,
  writer: WRITER_PROMPT,
  analyst: ANALYST_PROMPT,
  architect: ARCHITECT_PROMPT,
};

// =============================================================================
// Synchronous Role Prompt Loader (Fallback Only)
// =============================================================================

/**
 * Load a role prompt by role name (synchronous, TypeScript only).
 *
 * Retrieves the system prompt for a specific agent role from the hardcoded
 * TypeScript definitions. Returns an empty string if the role is not found.
 *
 * **Note:** This function only returns TypeScript fallback prompts.
 * For markdown file support with caching, use `loadRolePromptAsync()`.
 *
 * @param role - The agent role to load
 * @returns The role prompt string, or empty string if not found
 *
 * @example
 * ```typescript
 * import { loadRolePrompt } from '@vellum/core/prompts/roles';
 *
 * // Load the coder role prompt (TypeScript fallback)
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
