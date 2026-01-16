/**
 * Mode-Based Tool Filtering
 *
 * Provides tool filtering based on coding modes.
 * Each mode has a specific set of allowed tool groups,
 * with optional restrictions like file patterns for edit tools.
 *
 * @module tool/mode-filter
 */

import type { CodingMode } from "../agent/coding-modes.js";
import {
  ALWAYS_AVAILABLE_TOOLS,
  getToolsFromGroups,
  isAlwaysAvailable,
  isToolInGroup,
  type ToolGroup,
} from "./groups.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for tool group restrictions.
 */
export interface ToolGroupOptions {
  /** Regex pattern to restrict which files can be edited (for edit group) */
  readonly fileRegex?: string;
  /** Human-readable description of the restriction */
  readonly description?: string;
}

/**
 * Entry in the mode tool groups configuration.
 * Can be a simple group name or a tuple with options.
 */
export type ToolGroupEntry = ToolGroup | readonly [ToolGroup, ToolGroupOptions];

/**
 * Result of checking if a tool is allowed for a mode.
 */
export interface ToolAllowedResult {
  /** Whether the tool is allowed */
  readonly allowed: boolean;
  /** Reason for denial if not allowed */
  readonly reason?: string;
}

/**
 * Options for getting tools for a mode.
 */
export interface GetToolsForModeOptions {
  /** Additional custom tool names to include */
  readonly customTools?: readonly string[];
  /** Whether to include interactive-only tools (e.g., ask_followup_question) */
  readonly interactive?: boolean;
}

/**
 * Parameters for tool validation (used for file path checks).
 */
export interface ToolValidationParams {
  /** File path being accessed (for edit tools) */
  readonly path?: string;
}

// =============================================================================
// Mode Tool Groups Configuration
// =============================================================================

/**
 * Mapping of coding modes to their allowed tool groups.
 *
 * - vibe: Full access to all tool groups for autonomous coding
 * - plan: Balanced access with planning focus
 * - spec: Restricted editing until implementation phase
 */
export const MODE_TOOL_GROUPS: Record<CodingMode, readonly ToolGroupEntry[]> = {
  vibe: ["read", "edit", "execute", "browser", "mcp", "modes", "agent", "git"],
  plan: ["read", "edit", "execute", "modes", "agent", "git"],
  spec: [
    "read",
    [
      "edit",
      {
        fileRegex: "\\.ouroboros/.*",
        description: "Spec files only until implementation",
      },
    ],
    "modes",
    "agent",
  ],
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract the group name from a ToolGroupEntry.
 */
function getGroupName(entry: ToolGroupEntry): ToolGroup {
  if (Array.isArray(entry)) {
    return entry[0];
  }
  // Entry is a simple ToolGroup string
  return entry as ToolGroup;
}

/**
 * Extract options from a ToolGroupEntry if present.
 */
function getGroupOptions(entry: ToolGroupEntry): ToolGroupOptions | undefined {
  return Array.isArray(entry) ? entry[1] : undefined;
}

/**
 * Find the entry for a specific group in a mode's configuration.
 */
function findGroupEntry(mode: CodingMode, group: ToolGroup): ToolGroupEntry | undefined {
  const entries = MODE_TOOL_GROUPS[mode];
  return entries.find((entry) => getGroupName(entry) === group);
}

/**
 * Get all group names allowed for a mode.
 */
function getAllowedGroups(mode: CodingMode): ToolGroup[] {
  return MODE_TOOL_GROUPS[mode].map(getGroupName);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get all tools available for a given coding mode.
 *
 * Returns tools from all allowed groups for the mode,
 * plus always-available tools. Custom tools can be added via options.
 *
 * @param mode - The coding mode
 * @param options - Optional configuration
 * @returns Array of tool names available for the mode
 *
 * @example
 * ```typescript
 * const vibeTools = getToolsForMode('vibe');
 * // Returns all tools from: read, edit, execute, browser, mcp, modes, agent, git
 *
 * const planTools = getToolsForMode('plan', { customTools: ['my_custom_tool'] });
 * // Returns plan mode tools plus the custom tool
 * ```
 */
export function getToolsForMode(mode: CodingMode, options?: GetToolsForModeOptions): string[] {
  const allowedGroups = getAllowedGroups(mode);
  const groupTools = getToolsFromGroups(allowedGroups);
  const interactive = options?.interactive ?? false;

  // Create a set for deduplication
  const tools = new Set<string>(groupTools);

  // Add always-available tools
  for (const tool of ALWAYS_AVAILABLE_TOOLS) {
    tools.add(tool);
  }

  if (!interactive) {
    tools.delete("ask_followup_question");
  }

  // Add custom tools if provided
  if (options?.customTools) {
    for (const tool of options.customTools) {
      tools.add(tool);
    }
  }

  return Array.from(tools);
}

/**
 * Check if a tool is allowed for a given mode.
 *
 * Validates the tool against mode restrictions, including:
 * - Whether the tool's group is allowed for the mode
 * - File path restrictions for edit tools (via fileRegex)
 * - Always-available tools bypass mode restrictions
 *
 * @param toolName - The tool name to check
 * @param mode - The coding mode
 * @param params - Optional parameters for validation (e.g., file path)
 * @returns Object with `allowed` boolean and optional `reason`
 *
 * @example
 * ```typescript
 * // Check if bash is allowed in spec mode
 * const result = isToolAllowedForMode('bash', 'spec');
 * // { allowed: false, reason: 'Tool "bash" is not available in spec mode' }
 *
 * // Check if write_file can edit a spec file
 * const result = isToolAllowedForMode('write_file', 'spec', { path: '.ouroboros/specs/feature.md' });
 * // { allowed: true }
 *
 * // Check if write_file can edit source code in spec mode
 * const result = isToolAllowedForMode('write_file', 'spec', { path: 'src/index.ts' });
 * // { allowed: false, reason: 'File "src/index.ts" is not allowed in spec mode. Spec files only until implementation' }
 * ```
 */
export function isToolAllowedForMode(
  toolName: string,
  mode: CodingMode,
  params?: ToolValidationParams
): ToolAllowedResult {
  // Always-available tools are always allowed
  if (isAlwaysAvailable(toolName)) {
    return { allowed: true };
  }

  // Get allowed groups for this mode
  const allowedGroups = getAllowedGroups(mode);

  // Find which group the tool belongs to
  let toolGroup: ToolGroup | undefined;
  for (const group of allowedGroups) {
    if (isToolInGroup(toolName, group)) {
      toolGroup = group;
      break;
    }
  }

  // Tool not in any allowed group
  if (!toolGroup) {
    return {
      allowed: false,
      reason: `Tool "${toolName}" is not available in ${mode} mode`,
    };
  }

  // Check for group-specific restrictions (like fileRegex for edit group)
  const groupEntry = findGroupEntry(mode, toolGroup);
  const options = groupEntry ? getGroupOptions(groupEntry) : undefined;

  if (options?.fileRegex && params?.path) {
    const regex = new RegExp(options.fileRegex);
    if (!regex.test(params.path)) {
      const description = options.description ? `. ${options.description}` : "";
      return {
        allowed: false,
        reason: `File "${params.path}" is not allowed in ${mode} mode${description}`,
      };
    }
  }

  return { allowed: true };
}
