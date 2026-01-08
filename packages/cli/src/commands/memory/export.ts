/**
 * Memory Export Command
 *
 * Export project memories to a file in JSON or Markdown format.
 *
 * @module cli/commands/memory/export
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { MemoryEntry, MemoryEntryType } from "@vellum/core";
import chalk from "chalk";

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, success } from "../types.js";
import { withMemoryService } from "./utils.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Export format options.
 */
export type MemoryExportFormat = "json" | "markdown";

/**
 * Options for the memory export command.
 */
export interface MemoryExportOptions {
  /** Output file path */
  output?: string;
  /** Export format */
  format?: MemoryExportFormat;
  /** Filter by type */
  type?: MemoryEntryType;
  /** Include metadata in export */
  includeMetadata?: boolean;
}

/**
 * JSON export structure.
 */
interface MemoryExportJson {
  version: 1;
  exportedAt: string;
  projectPath: string;
  entries: Array<{
    key: string;
    type: MemoryEntryType;
    content: string;
    createdAt: string;
    updatedAt: string;
    metadata?: {
      tags: string[];
      importance: number;
      sessionId?: string;
    };
  }>;
  stats: {
    total: number;
    byType: Record<MemoryEntryType, number>;
  };
}

// =============================================================================
// Export Functions
// =============================================================================

/**
 * Generate default filename based on format.
 */
function getDefaultFilename(format: MemoryExportFormat): string {
  const timestamp = new Date().toISOString().slice(0, 10);
  const ext = format === "json" ? "json" : "md";
  return `vellum-memory-${timestamp}.${ext}`;
}

/**
 * Calculate type statistics.
 */
function calculateStats(entries: MemoryEntry[]): Record<MemoryEntryType, number> {
  const stats: Record<MemoryEntryType, number> = {
    context: 0,
    preference: 0,
    decision: 0,
    summary: 0,
  };

  for (const entry of entries) {
    stats[entry.type] += 1;
  }

  return stats;
}

/**
 * Export entries to JSON format.
 */
function exportToJson(
  entries: MemoryEntry[],
  projectPath: string,
  includeMetadata: boolean
): string {
  const exportData: MemoryExportJson = {
    version: 1,
    exportedAt: new Date().toISOString(),
    projectPath,
    entries: entries.map((e) => ({
      key: e.key,
      type: e.type,
      content: e.content,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      ...(includeMetadata
        ? {
            metadata: {
              tags: e.metadata.tags,
              importance: e.metadata.importance,
              sessionId: e.metadata.sessionId,
            },
          }
        : {}),
    })),
    stats: {
      total: entries.length,
      byType: calculateStats(entries),
    },
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Format date for markdown.
 */
function formatDateLong(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Get emoji for entry type.
 */
function getTypeEmoji(type: MemoryEntryType): string {
  const emojis: Record<MemoryEntryType, string> = {
    context: "📋",
    preference: "⚙️",
    decision: "🎯",
    summary: "📝",
  };
  return emojis[type];
}

/**
 * Export entries to Markdown format.
 */
function exportToMarkdown(
  entries: MemoryEntry[],
  projectPath: string,
  includeMetadata: boolean
): string {
  const lines: string[] = [
    "# Vellum Project Memory Export",
    "",
    `> Exported: ${formatDateLong(new Date())}`,
    `> Project: \`${projectPath}\``,
    `> Total entries: ${entries.length}`,
    "",
  ];

  // Add statistics
  const stats = calculateStats(entries);
  lines.push("## Statistics", "");
  lines.push("| Type | Count |");
  lines.push("|------|-------|");
  for (const [type, count] of Object.entries(stats)) {
    if (count > 0) {
      lines.push(`| ${type} | ${count} |`);
    }
  }
  lines.push("");

  // Group entries by type
  const grouped = new Map<MemoryEntryType, MemoryEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.type) ?? [];
    list.push(entry);
    grouped.set(entry.type, list);
  }

  // Export each type section
  const typeOrder: MemoryEntryType[] = ["context", "preference", "decision", "summary"];
  for (const type of typeOrder) {
    const typeEntries = grouped.get(type);
    if (!typeEntries || typeEntries.length === 0) continue;

    const emoji = getTypeEmoji(type);
    lines.push(`## ${emoji} ${type.charAt(0).toUpperCase() + type.slice(1)}`, "");

    for (const entry of typeEntries) {
      lines.push(`### ${entry.key}`, "");
      lines.push(entry.content, "");

      if (includeMetadata) {
        lines.push("<details>");
        lines.push("<summary>Metadata</summary>", "");
        lines.push(`- **Created**: ${formatDateLong(entry.createdAt)}`);
        lines.push(`- **Updated**: ${formatDateLong(entry.updatedAt)}`);
        lines.push(`- **Importance**: ${entry.metadata.importance}`);
        if (entry.metadata.tags.length > 0) {
          lines.push(`- **Tags**: ${entry.metadata.tags.join(", ")}`);
        }
        if (entry.metadata.sessionId) {
          lines.push(`- **Session**: ${entry.metadata.sessionId}`);
        }
        lines.push("</details>", "");
      }
    }
  }

  lines.push("---", "");
  lines.push("*Exported by Vellum CLI*");

  return lines.join("\n");
}

// =============================================================================
// Command Execution
// =============================================================================

/**
 * Execute the memory export command.
 */
export async function executeMemoryExport(
  projectPath: string,
  options: MemoryExportOptions = {}
): Promise<CommandResult> {
  const format = options.format ?? "json";
  const includeMetadata = options.includeMetadata ?? true;
  const outputPath = options.output
    ? resolve(projectPath, options.output)
    : resolve(projectPath, getDefaultFilename(format));

  try {
    return await withMemoryService(projectPath, async (service) => {
      let entries = await service.listEntries(options.type);

      // Sort by type then by key for consistent output
      entries = entries.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type.localeCompare(b.type);
        }
        return a.key.localeCompare(b.key);
      });

      if (entries.length === 0) {
        return success(chalk.dim("No memories to export."));
      }

      const content =
        format === "json"
          ? exportToJson(entries, projectPath, includeMetadata)
          : exportToMarkdown(entries, projectPath, includeMetadata);

      await writeFile(outputPath, content, "utf-8");

      const lines: string[] = [
        chalk.bold.green("✅ Memory export complete"),
        "",
        chalk.dim(`Format:   ${format}`),
        chalk.dim(`Entries:  ${entries.length}`),
        chalk.dim(`Output:   ${outputPath}`),
      ];

      return success(lines.join("\n"));
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to export memories: ${message}`);
  }
}

// =============================================================================
// Slash Command Definition
// =============================================================================

/**
 * Parse export command arguments.
 */
function parseExportArgs(args: string[]): MemoryExportOptions {
  const options: MemoryExportOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if ((arg === "--output" || arg === "-o") && nextArg) {
      options.output = nextArg;
      i++;
    } else if ((arg === "--format" || arg === "-f") && nextArg) {
      if (nextArg === "json" || nextArg === "markdown" || nextArg === "md") {
        options.format = nextArg === "md" ? "markdown" : nextArg;
      }
      i++;
    } else if (arg === "--type" && nextArg) {
      if (["context", "preference", "decision", "summary"].includes(nextArg)) {
        options.type = nextArg as MemoryEntryType;
      }
      i++;
    } else if (arg === "--no-metadata") {
      options.includeMetadata = false;
    }
  }

  return options;
}

/**
 * Memory export slash command handler.
 */
async function handleMemoryExport(context: CommandContext): Promise<CommandResult> {
  const args = context.parsedArgs.positional as string[];
  const options = parseExportArgs(args);
  const projectPath = context.session.cwd;

  return executeMemoryExport(projectPath, options);
}

/**
 * Memory export slash command definition.
 */
export const memoryExportCommand: SlashCommand = {
  name: "memory export",
  description: "Export project memories to a file",
  kind: "builtin",
  category: "session",
  execute: handleMemoryExport,
};
