/**
 * Exit Command
 *
 * Exits the application with optional confirmation.
 *
 * @module cli/commands/core/exit
 */

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { interactive, success } from "../types.js";

// =============================================================================
// T029: Exit Command Definition
// =============================================================================

/**
 * Exit command - exits the application
 *
 * Usage:
 * - /exit - Prompt for confirmation before exiting
 * - /exit --force - Exit immediately without confirmation
 *
 * When --force is not provided, returns an interactive confirmation prompt.
 * When confirmed or forced, emits 'app:exit' event and returns success.
 */
export const exitCommand: SlashCommand = {
  name: "exit",
  description: "Exit the application",
  kind: "builtin",
  category: "system",
  aliases: ["quit", "q"],
  namedArgs: [
    {
      name: "force",
      shorthand: "f",
      type: "boolean",
      description: "Exit immediately without confirmation",
      required: false,
      default: false,
    },
  ],
  examples: [
    "/exit         - Exit with confirmation",
    "/exit --force - Exit immediately",
    "/exit -f      - Exit immediately (short form)",
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const force = ctx.parsedArgs.named.force as boolean | undefined;

    // Force exit: emit event and return success immediately
    if (force) {
      ctx.emit("app:exit", { reason: "user-command", forced: true });
      return success("Exiting...", { exit: true, forced: true });
    }

    // Interactive confirmation
    return interactive({
      inputType: "confirm",
      message: "Are you sure you want to exit?",
      defaultValue: "n",
      handler: async (value: string): Promise<CommandResult> => {
        const confirmed = value.toLowerCase() === "y" || value.toLowerCase() === "yes";
        if (confirmed) {
          ctx.emit("app:exit", { reason: "user-command", forced: false });
          return success("Exiting...", { exit: true, forced: false });
        }
        return success("Exit cancelled");
      },
      onCancel: () => success("Exit cancelled"),
    });
  },
};
