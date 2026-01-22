/**
 * Setup Command (REQ-022)
 * @module cli/commands/setup
 */

import type { CommandResult, SlashCommand } from "./types.js";
import { success } from "./types.js";

/**
 * Setup command
 */
export const setupCommand: SlashCommand = {
  name: "setup",
  description: "Run setup wizard",
  kind: "builtin",
  category: "system",
  execute: async (): Promise<CommandResult> => success("Setup command not yet implemented"),
};

/**
 * Setup slash commands
 */
export const setupSlashCommands: SlashCommand[] = [setupCommand];
