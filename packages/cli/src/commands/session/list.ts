/**
 * Session List Command (T016)
 * @module cli/commands/session/list
 */

import type { CommandResult, SlashCommand } from "../types.js";
import { success } from "../types.js";

/**
 * List command for displaying sessions
 */
export const listCommand: SlashCommand = {
  name: "list",
  aliases: ["ls"],
  description: "List all sessions",
  kind: "builtin",
  category: "session",
  execute: async (): Promise<CommandResult> => success("Session list not yet implemented"),
};

/**
 * Factory function to create list command with context
 */
export function createListCommand(): SlashCommand {
  return listCommand;
}
