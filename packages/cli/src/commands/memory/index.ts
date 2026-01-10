/**
 * Memory Commands Index
 *
 * Re-exports all memory-related CLI commands and provides
 * the main memory command dispatcher.
 *
 * @module cli/commands/memory
 */

import chalk from "chalk";

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, success } from "../types.js";

// =============================================================================
// Command Exports
// =============================================================================

export {
  executeMemoryExport,
  type MemoryExportFormat,
  type MemoryExportOptions,
  memoryExportCommand,
} from "./export.js";

export {
  executeMemoryList,
  type MemoryListOptions,
  memoryListCommand,
} from "./list.js";

export {
  executeMemorySearch,
  type MemorySearchOptions,
  memorySearchCommand,
} from "./search.js";

export { withMemoryService } from "./utils.js";

// =============================================================================
// Subcommands Registry
// =============================================================================

import { memoryExportCommand } from "./export.js";
import { memoryListCommand } from "./list.js";
import { memorySearchCommand } from "./search.js";

/**
 * All memory subcommands.
 */
export const memorySubcommands: SlashCommand[] = [
  memoryListCommand,
  memorySearchCommand,
  memoryExportCommand,
];

// =============================================================================
// Memory Command Dispatcher
// =============================================================================

/**
 * Get help text for memory commands.
 */
function getMemoryHelp(): string {
  const lines: string[] = [
    chalk.bold.blue("📚 Memory Commands"),
    "",
    chalk.dim("Manage project memory - persistent context across sessions."),
    "",
    chalk.bold("Available subcommands:"),
    "",
    `  ${chalk.cyan("/memory list")}     List all saved memories`,
    `  ${chalk.cyan("/memory search")}   Search memories by query`,
    `  ${chalk.cyan("/memory export")}   Export memories to file`,
    "",
    chalk.bold("Examples:"),
    "",
    chalk.dim("  /memory list --limit 10"),
    chalk.dim("  /memory list --type preference --json"),
    chalk.dim("  /memory search authentication"),
    chalk.dim("  /memory export --format markdown"),
    "",
    chalk.dim("Use /memory <subcommand> --help for detailed usage."),
  ];

  return lines.join("\n");
}

/**
 * Memory command dispatcher.
 * Routes to the appropriate subcommand based on the first argument.
 */
async function handleMemory(context: CommandContext): Promise<CommandResult> {
  const args = context.parsedArgs.positional as string[];
  const subcommand = args[0]?.toLowerCase();

  // Show help if no subcommand
  if (!subcommand || subcommand === "help" || subcommand === "--help") {
    return success(getMemoryHelp());
  }

  // Route to subcommand - subcommands are invoked via main command handler
  // Since they use the same context, just call execute directly
  switch (subcommand) {
    case "list":
    case "ls":
      return memoryListCommand.execute(context);

    case "search":
    case "find":
      return memorySearchCommand.execute(context);

    case "export":
      return memoryExportCommand.execute(context);

    default:
      return error(
        "COMMAND_NOT_FOUND",
        `Unknown memory subcommand: ${subcommand}\n\n${getMemoryHelp()}`
      );
  }
}

// =============================================================================
// Main Memory Command Definition
// =============================================================================

/**
 * Main memory slash command.
 */
export const memoryCommand: SlashCommand = {
  name: "memory",
  description: "Manage project memory",
  kind: "builtin",
  category: "session",
  aliases: ["mem"],
  subcommands: [
    { name: "list", description: "List memories", aliases: ["ls"] },
    { name: "search", description: "Search memories" },
    { name: "export", description: "Export memories" },
  ],
  execute: handleMemory,
};

/**
 * All memory commands for registration.
 */
export const memoryCommands: SlashCommand[] = [memoryCommand, ...memorySubcommands];
