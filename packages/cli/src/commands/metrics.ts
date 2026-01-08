/**
 * Metrics Command
 *
 * Display application metrics and statistics.
 *
 * @module cli/commands/metrics
 */

import { getMetricsManager } from "../tui/metrics-integration.js";
import type { CommandContext, CommandResult, SlashCommand as SlashCommandDef } from "./types.js";
import { success } from "./types.js";

/**
 * /metrics command - Display current metrics
 */
export const metricsCommand: SlashCommandDef = {
  name: "metrics",
  description: "Display application metrics and statistics",
  kind: "builtin",
  category: "debug",
  positionalArgs: [],
  namedArgs: [
    {
      name: "format",
      type: "string",
      description: "Output format (text, json)",
      required: false,
      default: "text",
    },
  ],
  aliases: ["stats"],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const manager = getMetricsManager();
    const snapshot = manager.getSnapshot();
    const format = (ctx.parsedArgs?.named?.format as string) ?? "text";

    if (format === "json") {
      return success(JSON.stringify(snapshot, null, 2));
    }

    // Format as text
    const output = manager.formatSnapshot(snapshot);
    return success(output);
  },
};

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
