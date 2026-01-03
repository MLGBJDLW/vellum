/**
 * Custom Agents Info Command (T023)
 *
 * Shows full agent details including resolved configuration.
 *
 * @module cli/commands/custom-agents/info
 * @see REQ-021
 */

import { AgentDiscovery, type DiscoveredAgent, DiscoverySource } from "@vellum/core";
import chalk from "chalk";

import type { CommandResult } from "../types.js";
import { error, success } from "../types.js";
import type { InfoOptions } from "./index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * JSON output format for info command
 */
export interface InfoJsonOutput {
  success: boolean;
  agent: {
    slug: string;
    name: string;
    description?: string;
    mode?: string;
    extends?: string;
    icon?: string;
    color?: string;
    hidden?: boolean;
    model?: string;
    systemPrompt?: string;
    version?: string;
    author?: string;
    tags?: string[];
    docs?: string;
    level?: string;
    toolGroups?: unknown[];
    restrictions?: unknown;
    settings?: unknown;
    whenToUse?: unknown;
    hooks?: unknown;
    coordination?: unknown;
  };
  source: {
    path: string;
    scope: string;
    priority: number;
    modifiedAt: string;
  };
  resolved?: {
    inheritanceChain: string[];
    effectiveConfig: Record<string, unknown>;
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get scope name from discovery source
 */
function getSourceName(source: DiscoverySource): string {
  switch (source) {
    case DiscoverySource.PROJECT:
      return "project";
    case DiscoverySource.USER:
      return "user";
    case DiscoverySource.SYSTEM:
      return "system";
    case DiscoverySource.ENV:
      return "environment";
    case DiscoverySource.CLI:
      return "cli";
    default:
      return "unknown";
  }
}

/**
 * Format value for display
 */
function formatValue(value: unknown, indent = 0): string {
  const prefix = "  ".repeat(indent);

  if (value === undefined || value === null) {
    return chalk.gray("(not set)");
  }

  if (typeof value === "boolean") {
    return value ? chalk.green("true") : chalk.red("false");
  }

  if (typeof value === "number") {
    return chalk.yellow(String(value));
  }

  if (typeof value === "string") {
    // Truncate long strings
    if (value.length > 80) {
      return chalk.white(`"${value.substring(0, 77)}..."`);
    }
    return chalk.white(`"${value}"`);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return chalk.gray("[]");
    }
    const items = value.map((v) => `${prefix}  - ${formatValue(v, 0)}`).join("\n");
    return `\n${items}`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return chalk.gray("{}");
    }
    const items = entries
      .map(([k, v]) => `${prefix}  ${chalk.cyan(k)}: ${formatValue(v, indent + 1)}`)
      .join("\n");
    return `\n${items}`;
  }

  return String(value);
}

/**
 * Format section header
 */
function formatSection(title: string): string {
  return chalk.bold.blue(`\n── ${title} ──`);
}

/**
 * Format agent for display
 */
function formatAgentInfo(discovered: DiscoveredAgent, options: InfoOptions): string {
  const { definition: agent, sourcePath, source, modifiedAt } = discovered;
  const lines: string[] = [];

  // Header
  const icon = agent.icon ?? "📦";
  lines.push("");
  lines.push(chalk.bold(`${icon} ${agent.name}`));
  lines.push(chalk.gray(`Slug: ${agent.slug}`));

  // Basic Info
  lines.push(formatSection("Basic Information"));
  lines.push(`  ${chalk.cyan("Description")}: ${formatValue(agent.description)}`);
  lines.push(`  ${chalk.cyan("Mode")}: ${formatValue(agent.mode)}`);
  lines.push(`  ${chalk.cyan("Extends")}: ${formatValue(agent.extends)}`);
  lines.push(`  ${chalk.cyan("Level")}: ${formatValue(agent.level)}`);
  lines.push(`  ${chalk.cyan("Hidden")}: ${formatValue(agent.hidden)}`);

  // UI Configuration
  lines.push(formatSection("UI Configuration"));
  lines.push(`  ${chalk.cyan("Icon")}: ${formatValue(agent.icon)}`);
  lines.push(`  ${chalk.cyan("Color")}: ${formatValue(agent.color)}`);

  // LLM Configuration
  lines.push(formatSection("LLM Configuration"));
  lines.push(`  ${chalk.cyan("Model")}: ${formatValue(agent.model)}`);

  if (options.showPrompt && agent.systemPrompt) {
    lines.push(`  ${chalk.cyan("System Prompt")}:`);
    lines.push(chalk.gray("  ─".repeat(30)));
    const promptLines = agent.systemPrompt.split("\n");
    for (const line of promptLines) {
      lines.push(chalk.white(`  ${line}`));
    }
    lines.push(chalk.gray("  ─".repeat(30)));
  } else if (agent.systemPrompt) {
    const preview = agent.systemPrompt.substring(0, 60).replace(/\n/g, " ");
    lines.push(`  ${chalk.cyan("System Prompt")}: ${chalk.gray(`"${preview}..."`)}`);
    lines.push(chalk.gray("    (use --show-prompt to see full prompt)"));
  } else {
    lines.push(`  ${chalk.cyan("System Prompt")}: ${chalk.gray("(not set)")}`);
  }

  // Access & Restrictions
  lines.push(formatSection("Access & Restrictions"));
  lines.push(`  ${chalk.cyan("Tool Groups")}: ${formatValue(agent.toolGroups)}`);
  lines.push(`  ${chalk.cyan("Restrictions")}: ${formatValue(agent.restrictions)}`);

  // Runtime Settings
  lines.push(formatSection("Runtime Settings"));
  lines.push(`  ${chalk.cyan("Settings")}: ${formatValue(agent.settings)}`);

  // Activation
  lines.push(formatSection("Activation"));
  lines.push(`  ${chalk.cyan("When to Use")}: ${formatValue(agent.whenToUse)}`);

  // Hooks
  if (agent.hooks) {
    lines.push(formatSection("Lifecycle Hooks"));
    lines.push(`  ${chalk.cyan("Hooks")}: ${formatValue(agent.hooks)}`);
  }

  // Multi-Agent Coordination
  if (agent.coordination) {
    lines.push(formatSection("Multi-Agent Coordination"));
    lines.push(`  ${chalk.cyan("Coordination")}: ${formatValue(agent.coordination)}`);
  }

  // Metadata
  lines.push(formatSection("Metadata"));
  lines.push(`  ${chalk.cyan("Version")}: ${formatValue(agent.version)}`);
  lines.push(`  ${chalk.cyan("Author")}: ${formatValue(agent.author)}`);
  lines.push(`  ${chalk.cyan("Tags")}: ${formatValue(agent.tags)}`);
  lines.push(`  ${chalk.cyan("Docs")}: ${formatValue(agent.docs)}`);

  // Source Information
  lines.push(formatSection("Source"));
  lines.push(`  ${chalk.cyan("Path")}: ${chalk.gray(sourcePath)}`);
  lines.push(`  ${chalk.cyan("Scope")}: ${formatValue(getSourceName(source))}`);
  lines.push(`  ${chalk.cyan("Priority")}: ${formatValue(source)}`);
  lines.push(`  ${chalk.cyan("Modified")}: ${formatValue(modifiedAt.toISOString())}`);

  return lines.join("\n");
}

/**
 * Convert agent to JSON output
 */
function toJsonOutput(discovered: DiscoveredAgent): InfoJsonOutput {
  const { definition: agent, sourcePath, source, modifiedAt } = discovered;

  return {
    success: true,
    agent: {
      slug: agent.slug,
      name: agent.name,
      description: agent.description,
      mode: agent.mode,
      extends: agent.extends,
      icon: agent.icon,
      color: agent.color,
      hidden: agent.hidden,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      version: agent.version,
      author: agent.author,
      tags: agent.tags,
      docs: agent.docs,
      level: agent.level !== undefined ? String(agent.level) : undefined,
      toolGroups: agent.toolGroups,
      restrictions: agent.restrictions,
      settings: agent.settings,
      whenToUse: agent.whenToUse,
      hooks: agent.hooks,
      coordination: agent.coordination,
    },
    source: {
      path: sourcePath,
      scope: getSourceName(source),
      priority: source,
      modifiedAt: modifiedAt.toISOString(),
    },
  };
}

// =============================================================================
// Command Handler
// =============================================================================

/**
 * Handle info subcommand
 *
 * Shows full details for a specific agent, including resolved configuration.
 *
 * @param slug - Agent slug to show info for
 * @param options - Info options
 * @returns Command result
 */
export async function handleInfo(
  slug: string | undefined,
  options: InfoOptions = {}
): Promise<CommandResult> {
  // Require slug
  if (!slug) {
    return error("MISSING_ARGUMENT", "Agent slug is required", [
      "Usage: /custom-agents info <slug>",
      "Use /custom-agents list to see available agents",
    ]);
  }

  try {
    // Discover agents
    const discovery = new AgentDiscovery({ watchEnabled: false });
    await discovery.discover();

    // Find agent
    const agent = discovery.get(slug);

    if (!agent) {
      return error("RESOURCE_NOT_FOUND", `Agent not found: ${slug}`, [
        "Check the slug is correct",
        "Use /custom-agents list to see available agents",
      ]);
    }

    // Output format
    if (options.json) {
      return success(JSON.stringify(toJsonOutput(agent), null, 2));
    }

    return success(formatAgentInfo(agent, options));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to get agent info: ${message}`);
  }
}
