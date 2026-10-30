import { type CommandResult, error } from "./types.js";

const LIVE_COMMANDS = new Set([
  "think",
  "thinking",
  "help",
  "h",
  "?",
  "mouse",
  "status",
  "usage",
  "cost",
  "copy",
]);

/** Running work keeps ownership of its session; only explicit live controls may execute. */
export async function executeTaskCommand(
  text: string,
  taskActive: boolean,
  execute: () => Promise<CommandResult>
): Promise<CommandResult> {
  const command = text.trim().slice(1).split(/\s+/u)[0]?.toLowerCase() ?? "";
  if (taskActive && !LIVE_COMMANDS.has(command)) {
    return error(
      "INVALID_ARGUMENT",
      "Finish or stop the current task before running this command. Send a normal message to steer, use /think for reasoning controls, or press Esc to stop."
    );
  }
  return execute();
}
