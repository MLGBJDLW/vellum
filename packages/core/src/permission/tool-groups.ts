/**
 * Tool Group Permissions for Vellum
 *
 * Provides tool group configuration with fileRegex filtering support.
 * Tool groups categorize tools by functionality (filesystem, git, shell, etc.)
 * and allow per-group permission settings including file pattern restrictions.
 *
 * Reference: Inspired by Roo Code's tool group system with fileRegex filtering.
 *
 * @module @vellum/core/permission/tool-groups
 */

import { z } from "zod";

// ============================================
// Tool Group Names
// ============================================

/**
 * Available tool group names for permission-based filtering.
 *
 * Groups categorize tools by their primary functionality:
 * - filesystem: File read/write operations
 * - git: Version control operations
 * - shell: Command execution
 * - web: Web browsing and fetching
 * - mcp: Model Context Protocol tools
 * - memory: Memory/knowledge persistence
 */
export const PERMISSION_TOOL_GROUP_NAMES = [
  "filesystem",
  "git",
  "shell",
  "web",
  "mcp",
  "memory",
] as const;

/**
 * Schema for permission tool group names.
 */
export const PermissionToolGroupNameSchema = z.enum(PERMISSION_TOOL_GROUP_NAMES);

/**
 * Type representing a valid permission tool group name.
 */
export type PermissionToolGroupName = z.infer<typeof PermissionToolGroupNameSchema>;

// ============================================
// Tool Group Config
// ============================================

/**
 * Configuration for a tool group permission.
 *
 * Allows enabling/disabling groups and applying restrictions like:
 * - autoApprove: Skip permission prompts for this group
 * - fileRegex: Restrict file operations to matching paths
 * - alwaysAllowReadOnly: Allow read operations even when group is disabled
 */
export const PermissionToolGroupConfigSchema = z.object({
  /** Which tool group this config applies to */
  group: PermissionToolGroupNameSchema,
  /** Whether this group is enabled */
  enabled: z.boolean(),
  /** Auto-approve actions without prompting */
  autoApprove: z.boolean().optional(),
  /** Restrict file operations to paths matching this regex */
  fileRegex: z.string().optional(),
  /** Allow read-only operations even when group is disabled */
  alwaysAllowReadOnly: z.boolean().optional(),
});

export type PermissionToolGroupConfig = z.infer<typeof PermissionToolGroupConfigSchema>;

// ============================================
// Tool Group Definition
// ============================================

/**
 * Definition of a tool group including its member tools.
 */
export interface ToolGroupDefinition {
  /** Unique name of the tool group */
  name: PermissionToolGroupName;
  /** Tool names belonging to this group */
  tools: readonly string[];
  /** Human-readable description */
  description: string;
}

// ============================================
// Default Tool Groups
// ============================================

/**
 * Default tool group definitions for permission-based filtering.
 *
 * Maps each group to its member tools. Tool names should match
 * the tool names used in the tool registry.
 */
export const PERMISSION_TOOL_GROUPS: Record<PermissionToolGroupName, ToolGroupDefinition> = {
  filesystem: {
    name: "filesystem",
    tools: [
      "read_file",
      "write_file",
      "list_dir",
      "search_files",
      "codebase_search",
      "apply_diff",
      "apply_patch",
      "search_and_replace",
      "smart_edit",
    ],
    description: "File system read/write operations",
  },

  git: {
    name: "git",
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
    description: "Git version control operations",
  },

  shell: {
    name: "shell",
    tools: ["bash", "shell"],
    description: "Shell command execution",
  },

  web: {
    name: "web",
    tools: ["browser", "web_fetch", "web_search"],
    description: "Web browsing and HTTP operations",
  },

  mcp: {
    name: "mcp",
    tools: [],
    description: "Model Context Protocol tools (dynamically loaded)",
  },

  memory: {
    name: "memory",
    tools: ["save_memory", "recall_memory", "doc_lookup", "skill"],
    description: "Memory and knowledge persistence",
  },
} as const;

// ============================================
// Read-Only Tool Detection
// ============================================

/**
 * Tools that are considered read-only within the filesystem group.
 * Used for alwaysAllowReadOnly checks.
 */
export const READ_ONLY_FILESYSTEM_TOOLS = [
  "read_file",
  "list_dir",
  "search_files",
  "codebase_search",
] as const;

/**
 * Check if a tool is a read-only filesystem operation.
 */
export function isReadOnlyFilesystemTool(toolName: string): boolean {
  return (READ_ONLY_FILESYSTEM_TOOLS as readonly string[]).includes(toolName);
}

// ============================================
// Group Lookup Functions
// ============================================

/**
 * Find which tool group a tool belongs to.
 *
 * @param toolName - The tool name to find
 * @returns The group name, or undefined if not found in any group
 *
 * @example
 * ```typescript
 * findToolGroupForTool('read_file');  // 'filesystem'
 * findToolGroupForTool('bash');       // 'shell'
 * findToolGroupForTool('unknown');    // undefined
 * ```
 */
export function findToolGroupForTool(toolName: string): PermissionToolGroupName | undefined {
  for (const [groupName, definition] of Object.entries(PERMISSION_TOOL_GROUPS)) {
    if (definition.tools.includes(toolName)) {
      return groupName as PermissionToolGroupName;
    }
  }
  return undefined;
}

/**
 * Get all tools in a specific permission group.
 *
 * @param groupName - The group to get tools for
 * @returns Array of tool names in the group
 */
export function getToolsInPermissionGroup(groupName: PermissionToolGroupName): readonly string[] {
  return PERMISSION_TOOL_GROUPS[groupName].tools;
}

// ============================================
// Permission Check Result
// ============================================

/**
 * Result of checking if a tool is allowed by group configuration.
 */
export interface ToolGroupCheckResult {
  /** Whether the tool is allowed */
  allowed: boolean;
  /** Reason for denial if not allowed */
  reason?: string;
  /** Whether auto-approve is enabled for this tool */
  autoApprove?: boolean;
}

// ============================================
// Core Permission Check Function
// ============================================

/**
 * Check if a tool is allowed by the given group configurations.
 *
 * Evaluates the tool against all provided group configs:
 * 1. Find which group the tool belongs to
 * 2. Check if that group is enabled
 * 3. If disabled, check alwaysAllowReadOnly for read-only tools
 * 4. If enabled with fileRegex, validate the file path
 *
 * @param toolName - The tool name to check
 * @param filePath - Optional file path for fileRegex validation
 * @param groups - Array of group configurations
 * @returns Check result with allowed status and reason
 *
 * @example
 * ```typescript
 * const groups: PermissionToolGroupConfig[] = [
 *   { group: 'filesystem', enabled: true, fileRegex: '^src/.*' },
 *   { group: 'shell', enabled: false },
 * ];
 *
 * // Tool in enabled group with matching path
 * isToolAllowedByGroups('write_file', 'src/index.ts', groups);
 * // { allowed: true, autoApprove: false }
 *
 * // Tool in enabled group with non-matching path
 * isToolAllowedByGroups('write_file', 'package.json', groups);
 * // { allowed: false, reason: 'File "package.json" does not match pattern...' }
 *
 * // Tool in disabled group
 * isToolAllowedByGroups('bash', undefined, groups);
 * // { allowed: false, reason: 'Tool group "shell" is disabled' }
 * ```
 */
export function isToolAllowedByGroups(
  toolName: string,
  filePath: string | undefined,
  groups: PermissionToolGroupConfig[]
): ToolGroupCheckResult {
  // If no groups configured, allow all tools
  if (groups.length === 0) {
    return { allowed: true };
  }

  // Find which group this tool belongs to
  const toolGroup = findToolGroupForTool(toolName);

  // Tool not in any known group - allow it (custom/unknown tools pass through)
  if (!toolGroup) {
    return { allowed: true };
  }

  // Find the config for this group
  const groupConfig = groups.find((g) => g.group === toolGroup);

  // No config for this group - allow by default
  if (!groupConfig) {
    return { allowed: true };
  }

  // Check if group is enabled
  if (!groupConfig.enabled) {
    // Check alwaysAllowReadOnly for filesystem read operations
    if (
      toolGroup === "filesystem" &&
      groupConfig.alwaysAllowReadOnly &&
      isReadOnlyFilesystemTool(toolName)
    ) {
      return { allowed: true, autoApprove: groupConfig.autoApprove };
    }

    return {
      allowed: false,
      reason: `Tool group "${toolGroup}" is disabled`,
    };
  }

  // Check fileRegex if present (only applies to filesystem group)
  if (groupConfig.fileRegex && filePath) {
    try {
      const regex = new RegExp(groupConfig.fileRegex);
      if (!regex.test(filePath)) {
        return {
          allowed: false,
          reason: `File "${filePath}" does not match allowed pattern: ${groupConfig.fileRegex}`,
        };
      }
    } catch (e) {
      // Invalid regex - log warning and allow (fail open for invalid config)
      console.warn(`Invalid fileRegex pattern "${groupConfig.fileRegex}": ${e}`);
    }
  }

  return { allowed: true, autoApprove: groupConfig.autoApprove };
}

// ============================================
// Default Group Configurations
// ============================================

/**
 * Default group configuration for vibe mode (full access).
 */
export const VIBE_MODE_GROUPS: PermissionToolGroupConfig[] = [
  { group: "filesystem", enabled: true, autoApprove: true },
  { group: "git", enabled: true, autoApprove: true },
  { group: "shell", enabled: true, autoApprove: true },
  { group: "web", enabled: true, autoApprove: true },
  { group: "mcp", enabled: true, autoApprove: true },
  { group: "memory", enabled: true, autoApprove: true },
];

/**
 * Default group configuration for plan mode (balanced access).
 */
export const PLAN_MODE_GROUPS: PermissionToolGroupConfig[] = [
  { group: "filesystem", enabled: true, autoApprove: true },
  { group: "git", enabled: true, autoApprove: true },
  { group: "shell", enabled: true, autoApprove: false },
  { group: "web", enabled: true, autoApprove: true },
  { group: "mcp", enabled: true, autoApprove: false },
  { group: "memory", enabled: true, autoApprove: true },
];

/**
 * Default group configuration for spec mode (restricted access).
 */
export const SPEC_MODE_GROUPS: PermissionToolGroupConfig[] = [
  {
    group: "filesystem",
    enabled: true,
    autoApprove: false,
    fileRegex: "^\\.ouroboros/.*",
    alwaysAllowReadOnly: true,
  },
  { group: "git", enabled: true, autoApprove: false },
  { group: "shell", enabled: false },
  { group: "web", enabled: true, autoApprove: false },
  { group: "mcp", enabled: false },
  { group: "memory", enabled: true, autoApprove: false },
];

/**
 * Get default group configuration for a coding mode.
 *
 * @param mode - The coding mode ('vibe', 'plan', or 'spec')
 * @returns Array of group configurations for the mode
 */
export function getDefaultGroupsForMode(
  mode: "vibe" | "plan" | "spec"
): PermissionToolGroupConfig[] {
  switch (mode) {
    case "vibe":
      return [...VIBE_MODE_GROUPS];
    case "plan":
      return [...PLAN_MODE_GROUPS];
    case "spec":
      return [...SPEC_MODE_GROUPS];
    default:
      return [...VIBE_MODE_GROUPS];
  }
}
