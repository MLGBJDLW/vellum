/**
 * Shell Commands Index
 *
 * Re-exports all shell-related CLI commands.
 *
 * @module cli/commands/shell
 */

// Shell Setup Command
export {
  createShellSetupCommand,
  displayShellsStatus,
  runShellSetup,
  type SetupCommandResult,
  type ShellSetupOptions,
} from "./setup.js";
