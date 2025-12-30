/**
 * Clear Command
 *
 * Clears the terminal screen.
 *
 * @module cli/commands/core/clear
 */

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";

// =============================================================================
// T028: Clear Command Definition
// =============================================================================

/**
 * Clear command - clears the terminal screen
 *
 * Usage: /clear
 *
 * Returns a success result with `clearScreen: true` flag,
 * which instructs the TUI to clear the display.
 */
export const clearCommand: SlashCommand = {
  name: "clear",
  description: "Clear the terminal screen",
  kind: "builtin",
  category: "system",
  aliases: ["cls"],
  examples: ["/clear - Clear the screen"],

  execute: async (_ctx: CommandContext): Promise<CommandResult> => {
    return {
      kind: "success",
      message: "Screen cleared",
      clearScreen: true,
    };
  },
};
