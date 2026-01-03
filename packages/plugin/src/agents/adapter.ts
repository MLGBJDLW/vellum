/**
 * Agent Adapter for Plugin System
 *
 * Converts parsed agent definitions from markdown files to PluginAgentDefinition format.
 * Handles legacy tool[] format conversion to toolGroups[] format.
 *
 * @module plugin/agents/adapter
 */

import type { ParsedAgent } from "./parser.js";
import type { PluginAgentDefinition } from "./types.js";
import { PLUGIN_AGENT_SCOPE } from "./types.js";

// =============================================================================
// Tool Group Mappings
// =============================================================================

/**
 * Mapping from individual tool names to their corresponding tool groups.
 *
 * Used to convert legacy tools[] array to the Phase 19 toolGroups[] format.
 */
export const TOOL_TO_GROUP: Record<string, string> = {
  read_file: "read",
  list_dir: "read",
  grep_search: "read",
  write_file: "edit",
  apply_diff: "edit",
  run_terminal: "execute",
  browser: "browser",
  fetch: "browser",
};

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Converts an array of individual tool names to tool groups.
 *
 * Maps known tool names to their corresponding groups and collects
 * unknown tools into a custom array for manual handling.
 *
 * @param tools - Array of individual tool names (legacy format)
 * @returns Object containing unique tool groups and any unknown custom tools
 *
 * @example
 * ```typescript
 * const result = convertToolsToToolGroups(["read_file", "write_file", "my_custom_tool"]);
 * // result = {
 * //   groups: ["read", "edit"],
 * //   custom: ["my_custom_tool"]
 * // }
 * ```
 */
export function convertToolsToToolGroups(tools: string[]): {
  groups: string[];
  custom: string[];
} {
  const groups = new Set<string>();
  const custom: string[] = [];

  for (const tool of tools) {
    const group = TOOL_TO_GROUP[tool];
    if (group) {
      groups.add(group);
    } else {
      custom.push(tool);
    }
  }

  return {
    groups: Array.from(groups),
    custom,
  };
}

/**
 * Converts a ParsedAgent to a PluginAgentDefinition.
 *
 * Performs the following transformations:
 * - Sets scope to 'plugin' (fixed for all plugin agents)
 * - Sets the pluginName from the provided parameter
 * - Generates a slug from the agent name (lowercase, hyphenated)
 * - Converts legacy tools[] to toolGroups[] if present
 * - Preserves existing toolGroups[] if already in Phase 19 format
 *
 * @param parsed - The parsed agent definition from markdown
 * @param pluginName - The name of the plugin that owns this agent
 * @returns A fully formed PluginAgentDefinition
 *
 * @example
 * ```typescript
 * const parsed: ParsedAgent = {
 *   name: "Code Reviewer",
 *   description: "Reviews code for issues",
 *   systemPrompt: "You are a code reviewer...",
 *   filePath: "./agents/reviewer.md",
 *   tools: ["read_file", "grep_search"],
 * };
 *
 * const definition = adaptToPluginAgent(parsed, "my-plugin");
 * // definition = {
 * //   slug: "code-reviewer",
 * //   name: "Code Reviewer",
 * //   scope: "plugin",
 * //   pluginName: "my-plugin",
 * //   filePath: "./agents/reviewer.md",
 * //   description: "Reviews code for issues",
 * //   systemPrompt: "You are a code reviewer...",
 * //   toolGroups: [{ group: "read", enabled: true }],
 * // }
 * ```
 */
export function adaptToPluginAgent(parsed: ParsedAgent, pluginName: string): PluginAgentDefinition {
  // Generate slug from name: lowercase, replace spaces/special chars with hyphens
  const slug = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Build the base definition
  const definition: PluginAgentDefinition = {
    slug,
    name: parsed.name,
    pluginName,
    filePath: parsed.filePath,
    scope: PLUGIN_AGENT_SCOPE,
    description: parsed.description,
    systemPrompt: parsed.systemPrompt,
  };

  // Add model if specified
  if (parsed.model) {
    definition.model = parsed.model;
  }

  // Handle tool configuration: prefer toolGroups[], convert tools[] if needed
  if (parsed.toolGroups && parsed.toolGroups.length > 0) {
    // Already in Phase 19 format - convert string groups to ToolGroupEntry format
    definition.toolGroups = parsed.toolGroups.map((group) => ({
      group,
      enabled: true,
    }));
  } else if (parsed.tools && parsed.tools.length > 0) {
    // Legacy format - convert to toolGroups
    const { groups, custom } = convertToolsToToolGroups(parsed.tools);

    // Create tool group entries for known groups
    const toolGroupEntries: Array<{ group: string; enabled: boolean; tools?: string[] }> =
      groups.map((group) => ({
        group,
        enabled: true,
      }));

    // If there are custom tools, add them to a "custom" group
    if (custom.length > 0) {
      toolGroupEntries.push({
        group: "custom",
        enabled: true,
        tools: custom,
      });
    }

    if (toolGroupEntries.length > 0) {
      definition.toolGroups = toolGroupEntries;
    }
  }

  return definition;
}
