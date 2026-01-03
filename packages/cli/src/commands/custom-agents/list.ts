/**
 * Custom Agents List Command (T020)
 *
 * Lists custom agents grouped by scope (project/user/system).
 *
 * @module cli/commands/custom-agents/list
 * @see REQ-018
 */

import {
  AgentDiscovery,
  type CustomAgentDefinition,
  type DiscoveredAgent,
  DiscoverySource,
} from "@vellum/core";
import chalk from "chalk";

import type { CommandResult } from "../types.js";
import { error, success } from "../types.js";
import type { ListOptions } from "./index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Scope category for agent grouping
 */
type ScopeCategory = "project" | "user" | "system";

/**
 * Agent entry with source info for display
 */
interface AgentEntry {
  agent: CustomAgentDefinition;
  sourcePath: string;
  source: DiscoverySource;
}

/**
 * Grouped agents by scope
 */
interface GroupedAgents {
  project: AgentEntry[];
  user: AgentEntry[];
  system: AgentEntry[];
}

/**
 * JSON output format for list command
 */
export interface ListJsonOutput {
  success: boolean;
  total: number;
  agents: {
    project: AgentSummary[];
    user: AgentSummary[];
    system: AgentSummary[];
  };
}

/**
 * Agent summary for JSON output
 */
interface AgentSummary {
  slug: string;
  name: string;
  description?: string;
  mode?: string;
  icon?: string;
  tags?: string[];
  sourcePath: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Map DiscoverySource to scope category
 */
function sourceToScope(source: DiscoverySource): ScopeCategory {
  switch (source) {
    case DiscoverySource.PROJECT:
      return "project";
    case DiscoverySource.USER:
      return "user";
    default:
      return "system";
  }
}

/**
 * Group agents by scope
 */
function groupAgentsByScope(agents: Map<string, DiscoveredAgent>): GroupedAgents {
  const grouped: GroupedAgents = {
    project: [],
    user: [],
    system: [],
  };

  for (const [, discovered] of agents) {
    const scope = sourceToScope(discovered.source);
    grouped[scope].push({
      agent: discovered.definition,
      sourcePath: discovered.sourcePath,
      source: discovered.source,
    });
  }

  // Sort each group alphabetically by slug
  for (const scope of Object.keys(grouped) as ScopeCategory[]) {
    grouped[scope].sort((a, b) => a.agent.slug.localeCompare(b.agent.slug));
  }

  return grouped;
}

/**
 * Format agent entry for display
 */
function formatAgentEntry(entry: AgentEntry, verbose = false): string {
  const { agent } = entry;
  const icon = agent.icon ?? "📦";
  const name = chalk.cyan(agent.slug);
  const displayName = agent.name !== agent.slug ? chalk.gray(` (${agent.name})`) : "";
  const mode = agent.mode ? chalk.yellow(` [${agent.mode}]`) : "";
  const desc = agent.description ? `\n    ${chalk.gray(agent.description)}` : "";
  const tags = agent.tags?.length
    ? `\n    ${chalk.blue(agent.tags.map((t) => `#${t}`).join(" "))}`
    : "";

  let line = `  ${icon} ${name}${displayName}${mode}`;

  if (verbose) {
    line += desc + tags;
    line += `\n    ${chalk.gray("→")} ${chalk.gray(entry.sourcePath)}`;
  }

  return line;
}

/**
 * Format a scope section for display
 */
function formatScopeSection(
  title: string,
  color: typeof chalk.bold.green,
  entries: AgentEntry[],
  verbose: boolean
): string[] {
  const lines: string[] = [color(title)];
  if (entries.length === 0) {
    lines.push(chalk.gray("  (none)"));
  } else {
    for (const entry of entries) {
      lines.push(formatAgentEntry(entry, verbose));
    }
  }
  lines.push("");
  return lines;
}

/**
 * Format grouped agents for display
 */
function formatGroupedAgents(grouped: GroupedAgents, options: ListOptions): string {
  const lines: string[] = [];
  const verbose = false; // Could add --verbose flag later

  // Project scope
  if (!options.global) {
    lines.push(
      ...formatScopeSection("📁 Project Agents", chalk.bold.green, grouped.project, verbose)
    );
  }

  // User scope
  if (!options.local) {
    lines.push(...formatScopeSection("👤 User Agents", chalk.bold.blue, grouped.user, verbose));
  }

  // System scope (only if neither --global nor --local)
  if (!options.global && !options.local) {
    lines.push(
      ...formatScopeSection("🌐 System Agents", chalk.bold.magenta, grouped.system, verbose)
    );
  }

  const total = grouped.project.length + grouped.user.length + grouped.system.length;
  lines.push(chalk.gray(`Total: ${total} agent(s)`));

  return lines.join("\n");
}

/**
 * Convert grouped agents to JSON output
 */
function toJsonOutput(grouped: GroupedAgents): ListJsonOutput {
  const toSummary = (entry: AgentEntry): AgentSummary => ({
    slug: entry.agent.slug,
    name: entry.agent.name,
    description: entry.agent.description,
    mode: entry.agent.mode,
    icon: entry.agent.icon,
    tags: entry.agent.tags,
    sourcePath: entry.sourcePath,
  });

  return {
    success: true,
    total: grouped.project.length + grouped.user.length + grouped.system.length,
    agents: {
      project: grouped.project.map(toSummary),
      user: grouped.user.map(toSummary),
      system: grouped.system.map(toSummary),
    },
  };
}

// =============================================================================
// Command Handler
// =============================================================================

/**
 * Handle list subcommand
 *
 * Lists all custom agents grouped by scope (project/user/system).
 *
 * @param options - List options
 * @returns Command result
 */
export async function handleList(options: ListOptions = {}): Promise<CommandResult> {
  try {
    // Create discovery instance
    const discovery = new AgentDiscovery({
      watchEnabled: false, // No need to watch for listing
    });

    // Discover all agents
    await discovery.discover();
    const allAgents = discovery.getAll();

    // Group by scope
    const grouped = groupAgentsByScope(allAgents);

    // Filter by scope if requested
    if (options.global) {
      grouped.project = [];
      grouped.system = [];
    } else if (options.local) {
      grouped.user = [];
      grouped.system = [];
    }

    // Output format
    if (options.json) {
      return success(JSON.stringify(toJsonOutput(grouped), null, 2));
    }

    return success(formatGroupedAgents(grouped, options));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to list agents: ${message}`);
  }
}
