/**
 * Exit Command
 *
 * Exits the application immediately.
 *
 * @module cli/commands/core/exit
 */

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { success } from "../types.js";

// =============================================================================
// T029: Exit Command Definition
// =============================================================================

/**
 * Exit command - exits the application
 *
 * Usage:
 * - /exit - Exit immediately
 * - /quit - Exit immediately (alias)
 * - /q    - Exit immediately (alias)
 *
 * Emits 'app:exit' event and returns success.
 */
export const exitCommand: SlashCommand = {
  name: "exit(quit)",
  description: "Exit the application",
  kind: "builtin",
  category: "system",
  aliases: ["exit", "quit", "q"],
  examples: [
    "/exit - Exit the application",
    "/quit - Exit the application",
    "/q    - Exit the application",
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    ctx.emit("app:exit", { reason: "user-command" });
    // Message is handled by the app:exit event handler
    return success(undefined, { exit: true });
  },
};
