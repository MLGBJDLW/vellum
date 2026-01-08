/**
 * Memory List Command
 *
 * Lists all saved project memories with filtering options.
 *
 * @module cli/commands/memory/list
 */

import type { MemoryEntry, MemoryEntryType } from "@vellum/core";
import chalk from "chalk";

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, success } from "../types.js";
import { withMemoryService } from "./utils.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the memory list command.
 */
export interface MemoryListOptions {
  /** Filter by tag */
  tag?: string;
  /** Filter by type */
  type?: MemoryEntryType;
  /** Filter entries since this date */
  since?: Date;
  /** Maximum number of entries to return */
  limit?: number;
  /** Output as JSON */
  json?: boolean;
}

/**
 * JSON output for memory list.
 */
interface MemoryListJson {
  success: boolean;
  entries: Array<{
    key: string;
    type: MemoryEntryType;
    content: string;
    createdAt: string;
    updatedAt: string;
    tags: string[];
    importance: number;
  }>;
  total: number;
  filtered: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Filter entries by options.
 */
function filterEntries(entries: MemoryEntry[], options: MemoryListOptions): MemoryEntry[] {
  let filtered = entries;

  // Filter by type
  if (options.type) {
    filtered = filtered.filter((e) => e.type === options.type);
  }

  // Filter by tag
  if (options.tag) {
    const tag = options.tag.toLowerCase();
    filtered = filtered.filter((e) => e.metadata.tags.some((t) => t.toLowerCase().includes(tag)));
  }

  // Filter by date
  if (options.since) {
    filtered = filtered.filter((e) => e.updatedAt >= options.since!);
  }

  // Apply limit
  if (options.limit && options.limit > 0) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

/**
 * Format a date for display.
 */
function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

/**
 * Get type badge color.
 */
function getTypeBadge(type: MemoryEntryType): string {
  const colors: Record<MemoryEntryType, (s: string) => string> = {
    context: chalk.cyan,
    preference: chalk.magenta,
    decision: chalk.yellow,
    summary: chalk.green,
  };
  return colors[type](`[${type}]`);
}

/**
 * Format entries for console output.
 */
function formatEntriesOutput(entries: MemoryEntry[], total: number): string {
  if (entries.length === 0) {
    return chalk.dim("No memories found.");
  }

  const lines: string[] = [
    chalk.bold.blue("📚 Project Memories"),
    chalk.dim(`Showing ${entries.length} of ${total} entries`),
    "",
  ];

  for (const entry of entries) {
    const badge = getTypeBadge(entry.type);
    const date = chalk.dim(formatDate(entry.updatedAt));
    const key = chalk.bold(entry.key);
    const preview = entry.content.slice(0, 60).replace(/\n/g, " ");
    const truncated = entry.content.length > 60 ? "…" : "";

    lines.push(`${badge} ${key} ${date}`);
    lines.push(chalk.dim(`   ${preview}${truncated}`));

    if (entry.metadata.tags.length > 0) {
      const tags = entry.metadata.tags.map((t) => chalk.cyan(`#${t}`)).join(" ");
      lines.push(chalk.dim(`   Tags: ${tags}`));
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format entries as JSON.
 */
function formatEntriesJson(entries: MemoryEntry[], total: number): MemoryListJson {
  return {
    success: true,
    entries: entries.map((e) => ({
      key: e.key,
      type: e.type,
      content: e.content,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      tags: e.metadata.tags,
      importance: e.metadata.importance,
    })),
    total,
    filtered: entries.length,
  };
}

// =============================================================================
// Command Execution
// =============================================================================

/**
 * Execute the memory list command.
 */
export async function executeMemoryList(
  projectPath: string,
  options: MemoryListOptions = {}
): Promise<CommandResult> {
  try {
    return await withMemoryService(projectPath, async (service) => {
      const allEntries = await service.listEntries(options.type);
      const filtered = filterEntries(allEntries, options);

      if (options.json) {
        const json = formatEntriesJson(filtered, allEntries.length);
        return success(JSON.stringify(json, null, 2));
      }

      const output = formatEntriesOutput(filtered, allEntries.length);
      return success(output);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to list memories: ${message}`);
  }
}

// =============================================================================
// Slash Command Definition
// =============================================================================

/**
 * Parse list command arguments.
 */
function parseListArgs(args: string[]): MemoryListOptions {
  const options: MemoryListOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg === "--tag" && nextArg) {
      options.tag = nextArg;
      i++;
    } else if (arg === "--type" && nextArg) {
      if (["context", "preference", "decision", "summary"].includes(nextArg)) {
        options.type = nextArg as MemoryEntryType;
      }
      i++;
    } else if (arg === "--since" && nextArg) {
      const date = new Date(nextArg);
      if (!Number.isNaN(date.getTime())) {
        options.since = date;
      }
      i++;
    } else if (arg === "--limit" && nextArg) {
      const limit = Number.parseInt(nextArg, 10);
      if (!Number.isNaN(limit) && limit > 0) {
        options.limit = limit;
      }
      i++;
    } else if (arg === "--json") {
      options.json = true;
    }
  }

  return options;
}

/**
 * Memory list slash command handler.
 */
async function handleMemoryList(context: CommandContext): Promise<CommandResult> {
  const args = context.parsedArgs.positional as string[];
  const options = parseListArgs(args);
  const projectPath = context.session.cwd;

  return executeMemoryList(projectPath, options);
}

/**
 * Memory list slash command definition.
 */
export const memoryListCommand: SlashCommand = {
  name: "memory list",
  description: "List all saved project memories",
  kind: "builtin",
  category: "session",
  aliases: ["memory ls"],
  execute: handleMemoryList,
};
