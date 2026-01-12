/**
 * Tool Groups System
 *
 * Defines tool group configurations for organizing tools by functionality.
 * Tool groups control which tools are available in different coding modes
 * and enable permission-based tool access.
 *
 * @module tool/groups
 */

// =============================================================================
// Tool Group Names
// =============================================================================

/**
 * All available tool group names.
 * Groups categorize tools by their primary functionality.
 */
export const TOOL_GROUP_NAMES = [
  "read",
  "edit",
  "execute",
  "browser",
  "mcp",
  "modes",
  "agent",
  "git",
] as const;

/**
 * Type representing a valid tool group name.
 */
export type ToolGroup = (typeof TOOL_GROUP_NAMES)[number];

// =============================================================================
// Tool Group Configuration
// =============================================================================

/**
 * Configuration for a tool group.
 */
export interface ToolGroupConfig {
  /** List of builtin tool names in this group */
  readonly tools: readonly string[];
  /** Whether this group's tools are always available regardless of mode */
  readonly alwaysAvailable?: boolean;
  /** Custom tools that can be added to this group */
  readonly customTools?: readonly string[];
  /** Human-readable description of the group's purpose */
  readonly description?: string;
}

// =============================================================================
// Tool Groups Definition
// =============================================================================

/**
 * Tool groups configuration mapping group names to their tool lists.
 *
 * Groups:
 * - read: File reading, search, and information retrieval
 * - edit: File writing and modification
 * - execute: Shell and command execution
 * - browser: Web browsing and fetching
 * - mcp: Model Context Protocol tools (dynamically loaded)
 * - modes: Mode switching (always available)
 * - agent: Agent control and delegation
 * - git: Version control operations
 */
export const BUILTIN_TOOL_GROUPS: Record<ToolGroup, ToolGroupConfig> = {
  read: {
    tools: [
      "read_file",
      "list_dir",
      "search_files",
      "codebase_search",
      "doc_lookup",
      "recall_memory",
      "skill",
      "lsp",
    ],
    description: "File reading, search, and information retrieval tools",
  },

  edit: {
    tools: [
      "write_file",
      "apply_diff",
      "apply_patch",
      "search_and_replace",
      "smart_edit",
      "save_memory",
    ],
    description: "File writing and modification tools",
  },

  execute: {
    tools: ["bash", "shell"],
    description: "Shell and command execution tools",
  },

  browser: {
    tools: ["browser", "web_fetch", "web_search"],
    description: "Web browsing, fetching, and search tools",
  },

  mcp: {
    tools: [],
    customTools: [],
    description: "Model Context Protocol tools (dynamically loaded at runtime)",
  },

  modes: {
    tools: ["switch_mode"],
    alwaysAvailable: true,
    description: "Mode switching tools (always available)",
  },

  agent: {
    tools: ["delegate_agent", "ask_followup_question", "attempt_completion", "todo_manage"],
    description: "Agent control, delegation, and task management tools",
  },

  git: {
    tools: [
      "git_status",
      "git_diff",
      "git_log",
      "git_commit",
      "git_stash",
      "git_fetch",
      "git_pull",
      "git_push",
      "git_remote",
      "git_generate_pr",
      "git_conflict_info",
    ],
    description: "Version control and Git operations",
  },
} as const;

// =============================================================================
// Always Available Tools
// =============================================================================

/**
 * Tools that are always available regardless of mode or permissions.
 * These are essential for agent operation and user interaction.
 */
export const ALWAYS_AVAILABLE_TOOLS = [
  "ask_followup_question",
  "attempt_completion",
  "switch_mode",
] as const;

/**
 * Type representing an always-available tool name.
 */
export type AlwaysAvailableTool = (typeof ALWAYS_AVAILABLE_TOOLS)[number];

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get all tool names from a specific group.
 *
 * @param group - The tool group name
 * @returns Array of tool names in the group
 */
export function getToolsInGroup(group: ToolGroup): readonly string[] {
  return BUILTIN_TOOL_GROUPS[group].tools;
}

/**
 * Check if a tool belongs to a specific group.
 *
 * @param toolName - The tool name to check
 * @param group - The group to check against
 * @returns True if the tool is in the group
 */
export function isToolInGroup(toolName: string, group: ToolGroup): boolean {
  return BUILTIN_TOOL_GROUPS[group].tools.includes(toolName);
}

/**
 * Find which group a tool belongs to.
 *
 * @param toolName - The tool name to find
 * @returns The group name, or undefined if not found
 */
export function findToolGroup(toolName: string): ToolGroup | undefined {
  for (const [group, config] of Object.entries(BUILTIN_TOOL_GROUPS)) {
    if (config.tools.includes(toolName)) {
      return group as ToolGroup;
    }
  }
  return undefined;
}

/**
 * Check if a tool is always available.
 *
 * @param toolName - The tool name to check
 * @returns True if the tool is always available
 */
export function isAlwaysAvailable(toolName: string): boolean {
  return (ALWAYS_AVAILABLE_TOOLS as readonly string[]).includes(toolName);
}

/**
 * Get all tools from multiple groups.
 *
 * @param groups - Array of group names
 * @returns Array of unique tool names from all specified groups
 */
export function getToolsFromGroups(groups: readonly ToolGroup[]): string[] {
  const tools = new Set<string>();
  for (const group of groups) {
    for (const tool of BUILTIN_TOOL_GROUPS[group].tools) {
      tools.add(tool);
    }
  }
  return Array.from(tools);
}

/**
 * Get all builtin tool names across all groups.
 *
 * @returns Array of all tool names
 */
export function getAllToolNames(): string[] {
  return getToolsFromGroups(TOOL_GROUP_NAMES as unknown as ToolGroup[]);
}
