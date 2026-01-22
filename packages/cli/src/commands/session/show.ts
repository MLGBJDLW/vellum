/**
 * Session Show Command (T032)
 * @module cli/commands/session/show
 */

import type { CommandResult, SlashCommand } from "../types.js";
import { success } from "../types.js";

/**
 * Show command for displaying session details
 */
export const showCommand: SlashCommand = {
  name: "show",
  aliases: ["view"],
  description: "Show session details",
  kind: "builtin",
  category: "session",
  execute: async (): Promise<CommandResult> => success("Session show not yet implemented"),
};

/**
 * Factory function to create show command with context
 */
export function createShowCommand(): SlashCommand {
  return showCommand;
}
