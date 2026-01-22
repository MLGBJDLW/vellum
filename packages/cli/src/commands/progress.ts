/**
 * Progress Command (REQ-022)
 * @module cli/commands/progress
 */

import type { CommandResult, SlashCommand } from "./types.js";
import { success } from "./types.js";

/**
 * Progress command
 */
export const progressCommand: SlashCommand = {
  name: "progress",
  description: "Show task progress",
  kind: "builtin",
  category: "system",
  execute: async (): Promise<CommandResult> => success("Progress command not yet implemented"),
};
