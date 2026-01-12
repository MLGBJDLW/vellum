/**
 * Help Command
 *
 * Displays help information for commands and categories.
 *
 * @module cli/commands/core/help
 */

import type { CommandRegistry } from "../registry.js";
import type { CommandCategory, CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, success } from "../types.js";

// =============================================================================
// Category Display Names
// =============================================================================

/**
 * Human-readable names for command categories
 */
const CATEGORY_NAMES: Record<CommandCategory, string> = {
  system: "System",
  workflow: "Workflow",
  auth: "Authentication",
  session: "Session",
  navigation: "Navigation",
  tools: "Tools",
  config: "Configuration",
  debug: "Debug",
};

/**
 * Category display order
 */
const CATEGORY_ORDER: CommandCategory[] = [
  "system",
  "workflow",
  "session",
  "config",
  "auth",
  "tools",
  "debug",
];

// =============================================================================
// Help Formatter
// =============================================================================

/**
 * Format command list grouped by category
 */
function formatCommandList(registry: CommandRegistry): string {
  const lines: string[] = [];
  lines.push("📚 Available Commands\n");

  for (const category of CATEGORY_ORDER) {
    const commands = registry.getByCategory(category);
    if (commands.size === 0) continue;

    lines.push(`\n${CATEGORY_NAMES[category]}:`);

    // Sort commands alphabetically
    const sortedCmds = Array.from(commands).sort((a, b) => a.name.localeCompare(b.name));

    for (const cmd of sortedCmds) {
      const aliases = cmd.aliases?.length ? ` (${cmd.aliases.join(", ")})` : "";
      lines.push(`  /${cmd.name}${aliases} - ${cmd.description}`);
    }
  }

  lines.push("\n\nUse /help <command> for detailed help on a specific command.");
  return lines.join("\n");
}

/**
 * Format positional arguments section
 */
function formatPositionalArgs(args: readonly import("../types.js").PositionalArg[]): string[] {
  const lines: string[] = ["Arguments:"];
  for (const arg of args) {
    const required = arg.required ? "(required)" : "(optional)";
    const defaultVal = arg.default !== undefined ? ` [default: ${arg.default}]` : "";
    lines.push(`  <${arg.name}> ${required}${defaultVal}`);
    lines.push(`    ${arg.description}`);
  }
  lines.push("");
  return lines;
}

/**
 * Format named arguments (flags) section
 */
function formatNamedArgs(args: readonly import("../types.js").NamedArg[]): string[] {
  const lines: string[] = ["Options:"];
  for (const arg of args) {
    const short = arg.shorthand ? `-${arg.shorthand}, ` : "    ";
    const required = arg.required ? "(required)" : "";
    const defaultVal = arg.default !== undefined ? ` [default: ${arg.default}]` : "";
    lines.push(`  ${short}--${arg.name} ${required}${defaultVal}`);
    lines.push(`    ${arg.description}`);
  }
  lines.push("");
  return lines;
}

/**
 * Format detailed help for a single command
 */
function formatCommandHelp(cmd: SlashCommand): string {
  const lines: string[] = [];

  // Header
  lines.push(`📖 /${cmd.name}`);
  lines.push(`   ${cmd.description}\n`);

  // Aliases
  if (cmd.aliases?.length) {
    lines.push(`Aliases: ${cmd.aliases.map((a) => `/${a}`).join(", ")}`);
  }

  // Category and Kind
  lines.push(`Category: ${CATEGORY_NAMES[cmd.category]}`);
  lines.push(`Kind: ${cmd.kind}\n`);

  // Usage
  const usage = buildUsage(cmd);
  lines.push(`Usage: ${usage}\n`);

  // Positional arguments
  if (cmd.positionalArgs?.length) {
    lines.push(...formatPositionalArgs(cmd.positionalArgs));
  }

  // Named arguments (flags)
  if (cmd.namedArgs?.length) {
    lines.push(...formatNamedArgs(cmd.namedArgs));
  }

  // Examples
  if (cmd.examples?.length) {
    lines.push("Examples:");
    for (const example of cmd.examples) {
      lines.push(`  ${example}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format help for a category
 */
function formatCategoryHelp(category: CommandCategory, registry: CommandRegistry): string {
  const commands = registry.getByCategory(category);
  const lines: string[] = [];

  lines.push(`📂 ${CATEGORY_NAMES[category]} Commands\n`);

  if (commands.size === 0) {
    lines.push("  No commands in this category.");
    return lines.join("\n");
  }

  const sortedCmds = Array.from(commands).sort((a, b) => a.name.localeCompare(b.name));

  for (const cmd of sortedCmds) {
    const aliases = cmd.aliases?.length ? ` (${cmd.aliases.join(", ")})` : "";
    lines.push(`  /${cmd.name}${aliases}`);
    lines.push(`    ${cmd.description}`);
  }

  lines.push("\n\nUse /help <command> for detailed help on a specific command.");
  return lines.join("\n");
}

/**
 * Build usage string for a command
 */
function buildUsage(cmd: SlashCommand): string {
  const parts: string[] = [`/${cmd.name}`];

  // Add positional args
  if (cmd.positionalArgs) {
    for (const arg of cmd.positionalArgs) {
      if (arg.required) {
        parts.push(`<${arg.name}>`);
      } else {
        parts.push(`[${arg.name}]`);
      }
    }
  }

  // Add named args hint
  if (cmd.namedArgs?.length) {
    parts.push("[options]");
  }

  return parts.join(" ");
}

/**
 * Check if a string is a valid category
 */
function isCategory(topic: string): topic is CommandCategory {
  return CATEGORY_ORDER.includes(topic as CommandCategory);
}

// =============================================================================
// T027: Help Command Definition
// =============================================================================

/**
 * Provides access to command registry for help command
 *
 * This must be set before using the help command.
 * Typically set during application initialization.
 */
let registryRef: CommandRegistry | null = null;

/**
 * Set the command registry reference for help command
 */
export function setHelpRegistry(registry: CommandRegistry): void {
  registryRef = registry;
}

/**
 * Get the command registry reference
 */
export function getHelpRegistry(): CommandRegistry | null {
  return registryRef;
}

/**
 * Get dynamic subcommands for help based on registered commands.
 * Returns subcommands for all registered commands plus category names.
 */
export function getHelpSubcommands(): import("../types.js").SubcommandDef[] {
  const subcommands: import("../types.js").SubcommandDef[] = [];

  // Add category names as subcommands
  for (const category of CATEGORY_ORDER) {
    subcommands.push({
      name: category,
      description: `Show ${CATEGORY_NAMES[category]} commands`,
    });
  }

  // Add registered commands as subcommands (if registry is available)
  if (registryRef) {
    const allCommands = registryRef.list();
    for (const cmd of allCommands) {
      // Skip if already added (category name conflict)
      if (!subcommands.some((s) => s.name === cmd.name)) {
        subcommands.push({
          name: cmd.name,
          description: cmd.description,
          aliases: cmd.aliases ? [...cmd.aliases] : undefined,
        });
      }
    }
  }

  return subcommands;
}

/**
 * Help command - displays help information
 *
 * Usage:
 * - /help - Display all commands grouped by category
 * - /help <command> - Display detailed help for a command
 * - /help <category> - Display commands in a category
 */
export const helpCommand: SlashCommand = {
  name: "help",
  description: "Display help information for commands and categories",
  kind: "builtin",
  category: "system",
  aliases: ["h", "?"],
  positionalArgs: [
    {
      name: "topic",
      type: "string",
      description: "Command name or category to get help for",
      required: false,
    },
  ],
  examples: [
    "/help              - Show all commands",
    "/help login        - Help for login command",
    "/help auth         - Show auth category commands",
  ],
  // Subcommands are generated dynamically via getHelpSubcommands()
  // The autocomplete system should call getHelpSubcommands() for fresh data
  subcommands: CATEGORY_ORDER.map((category) => ({
    name: category,
    description: `Show ${CATEGORY_NAMES[category]} commands`,
  })),

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const topic = ctx.parsedArgs.positional[0] as string | undefined;

    // Get registry from the reference
    const registry = registryRef;
    if (!registry) {
      return error(
        "INTERNAL_ERROR",
        "Command registry not initialized. This is a configuration error."
      );
    }

    // No topic: show all commands
    if (!topic) {
      const message = formatCommandList(registry);
      return success(message, { type: "help-list", categories: CATEGORY_ORDER });
    }

    // Check if topic is a category
    if (isCategory(topic)) {
      const message = formatCategoryHelp(topic, registry);
      return success(message, { type: "help-category", category: topic });
    }

    // Try to find command by name or alias
    const cmd = registry.get(topic);
    if (cmd) {
      const message = formatCommandHelp(cmd);
      return success(message, { type: "help-command", command: cmd.name });
    }

    // Command not found - try fuzzy search for suggestions
    const allCommands = registry.list();
    const suggestions = allCommands
      .filter(
        (c) =>
          c.name.toLowerCase().includes(topic.toLowerCase()) ||
          c.aliases?.some((a) => a.toLowerCase().includes(topic.toLowerCase()))
      )
      .map((c) => `/${c.name}`)
      .slice(0, 3);

    return error(
      "COMMAND_NOT_FOUND",
      `Unknown command or category: "${topic}"`,
      suggestions.length > 0 ? suggestions : undefined
    );
  },
};
