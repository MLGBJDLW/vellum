/**
 * Metrics Command
 *
 * Display application metrics and statistics.
 *
 * @module cli/commands/metrics
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getMetricsManager } from "../tui/metrics-integration.js";
import type { CommandContext, CommandResult, SlashCommand as SlashCommandDef } from "./types.js";
import { error, success } from "./types.js";

/**
 * /metrics command - Display current metrics
 */
export const metricsCommand: SlashCommandDef = {
  name: "metrics",
  description: "Display application metrics and statistics",
  kind: "builtin",
  category: "debug",
  positionalArgs: [
    {
      name: "subcommand",
      type: "string",
      description: "Subcommand: show, reset, export",
      required: false,
    },
  ],
  namedArgs: [
    {
      name: "format",
      type: "string",
      description: "Output format (text, json)",
      required: false,
      default: "text",
    },
    {
      name: "output",
      shorthand: "o",
      type: "path",
      description: "Output file path for export",
      required: false,
    },
  ],
  subcommands: [
    { name: "show", description: "Display current metrics" },
    { name: "reset", description: "Reset all metrics counters" },
    { name: "export", description: "Export metrics to file" },
  ],
  aliases: ["stats"],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const subcommand = (ctx.parsedArgs.positional[0] as string)?.toLowerCase() ?? "show";
    const format = (ctx.parsedArgs.named?.format as string) ?? "text";
    const outputPath = ctx.parsedArgs.named?.output as string | undefined;

    const manager = getMetricsManager();
    const snapshot = manager.getSnapshot();

    switch (subcommand) {
      case "show":
        if (format === "json") {
          return success(JSON.stringify(snapshot, null, 2));
        }
        return success(manager.formatSnapshot(snapshot));

      case "reset":
        manager.reset();
        return success("✅ Metrics reset successfully");

      case "export":
        return handleExport(snapshot, outputPath);

      default:
        return error("INVALID_ARGUMENT", `Unknown subcommand: ${subcommand}`, [
          "/metrics show",
          "/metrics reset",
          "/metrics export --output=./metrics.json",
        ]);
    }
  },
};

/**
 * Handle metrics export to file
 */
async function handleExport(
  snapshot: ReturnType<ReturnType<typeof getMetricsManager>["getSnapshot"]>,
  outputPath?: string
): Promise<CommandResult> {
  // Default output path
  const filePath = outputPath ?? `metrics-${Date.now()}.json`;
  const resolvedPath = path.resolve(filePath);

  try {
    // Format with timestamp
    const exportData = {
      exportedAt: new Date().toISOString(),
      metrics: snapshot,
    };

    await fs.writeFile(resolvedPath, JSON.stringify(exportData, null, 2), "utf-8");

    return success(
      `📊 Metrics exported successfully\n\n` +
        `  File: ${resolvedPath}\n` +
        `  Size: ${JSON.stringify(exportData).length} bytes\n\n` +
        "Use /metrics show to view current metrics."
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to export metrics: ${message}`, [
      "Check file permissions",
      "Try a different output path",
    ]);
  }
}

/**
 * /metrics reset command - Reset all metrics
 */
export const metricsResetCommand: SlashCommandDef = {
  name: "metrics:reset",
  description: "Reset all metrics counters",
  kind: "builtin",
  category: "debug",
  positionalArgs: [],
  namedArgs: [],
  aliases: [],

  execute: async (_ctx: CommandContext): Promise<CommandResult> => {
    const manager = getMetricsManager();
    manager.reset();
    return success("✅ Metrics reset successfully");
  },
};

/**
 * All metrics commands
 */
export const metricsCommands: SlashCommandDef[] = [metricsCommand, metricsResetCommand];
