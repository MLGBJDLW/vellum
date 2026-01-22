/**
 * TUI Slash Commands
 *
 * Provides TUI-specific slash command utilities.
 * Re-exports commonly used command types and utilities.
 *
 * @module tui/slash-commands
 */

// Re-export command types from the commands module
export type { CommandContext, CommandResult, SlashCommand } from "../commands/types.js";
export { error, interactive, pending, success } from "../commands/types.js";
