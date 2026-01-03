/**
 * Custom Agents Export Command (T020a)
 *
 * Exports agent definition to a file.
 *
 * @module cli/commands/custom-agents/export
 * @see REQ-022
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { AgentDiscovery, type CustomAgentDefinition } from "@vellum/core";
import chalk from "chalk";
import matter from "gray-matter";

import type { CommandResult } from "../types.js";
import { error, success } from "../types.js";
import type { ExportOptions } from "./index.js";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert agent definition to YAML string using gray-matter stringify
 */
function toYaml(agent: CustomAgentDefinition): string {
  // Create a clean object for export (remove undefined values)
  const clean = JSON.parse(JSON.stringify(agent));
  // Use gray-matter to stringify as YAML
  return matter.stringify("", clean).trim();
}

/**
 * Convert agent definition to JSON string
 */
function toJson(agent: CustomAgentDefinition): string {
  return JSON.stringify(agent, null, 2);
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

// =============================================================================
// Command Handler
// =============================================================================

/**
 * Handle export subcommand
 *
 * Exports an agent definition to a file.
 *
 * @param slug - Agent slug to export
 * @param options - Export options
 * @returns Command result
 */
export async function handleExport(
  slug: string | undefined,
  options: ExportOptions = {}
): Promise<CommandResult> {
  // Require slug
  if (!slug) {
    return error("MISSING_ARGUMENT", "Agent slug is required", [
      "Usage: /custom-agents export <slug>",
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

    // Determine format
    const format = options.format ?? "yaml";
    if (format !== "yaml" && format !== "json") {
      return error("INVALID_ARGUMENT", `Invalid format: ${format}`, [
        "Supported formats: yaml, json",
      ]);
    }

    // Convert to string
    const content = format === "json" ? toJson(agent.definition) : toYaml(agent.definition);

    // If no output specified, print to stdout
    if (!options.output) {
      const lines = [
        chalk.green(`📤 Exporting agent: ${slug}`),
        chalk.gray(`Format: ${format}`),
        chalk.gray(`Source: ${agent.sourcePath}`),
        "",
        chalk.gray("─".repeat(60)),
        content,
        chalk.gray("─".repeat(60)),
        "",
        chalk.cyan("Tip: Use --output to save to a file"),
      ];
      return success(lines.join("\n"));
    }

    // Write to file
    const outputPath = path.resolve(options.output);
    const dirPath = path.dirname(outputPath);

    await ensureDir(dirPath);
    await fs.writeFile(outputPath, content, "utf-8");

    const lines = [
      chalk.green(`✅ Exported agent "${slug}"`),
      "",
      chalk.gray(`Format: ${format}`),
      chalk.gray(`Output: ${outputPath}`),
      chalk.gray(`Source: ${agent.sourcePath}`),
    ];

    return success(lines.join("\n"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to export agent: ${message}`);
  }
}
