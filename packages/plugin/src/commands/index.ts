/**
 * Plugin Commands Module
 *
 * Provides parsing and management of plugin commands defined in markdown files.
 *
 * @module plugin/commands
 */

export {
  adaptCommands,
  adaptToSlashCommand,
  type CommandCategory,
  type CommandContext,
  type CommandKind,
  type CommandResult,
  createCommandExecutor,
  resolveCommandName,
  type SlashCommand,
  substituteArguments,
} from "./adapter.js";
export {
  type ExecutionContext,
  type ExecutionResult,
  executeCommand,
} from "./executor.js";
export {
  extractFirstParagraph,
  extractNameFromPath,
  hasArgumentsVariable,
  type ParsedCommand,
  parseCommand,
} from "./parser.js";
