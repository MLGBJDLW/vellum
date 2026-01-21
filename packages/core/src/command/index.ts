// ============================================
// Command Module Barrel Export
// ============================================

/**
 * User command loading and management.
 *
 * @module @vellum/core/command
 * @see Phase 16: Slash Command System
 */

export {
  // Types
  type CommandTrustStore,
  // Factory functions
  createUserCommandLoader,
  // Classes
  DefaultCommandTrustStore,
  ensureCommandsDirectory,
  // Template helpers
  getTypeScriptCommandTemplate,
  getYamlCommandTemplate,
  type TypeScriptCommand,
  type UserCommand,
  type UserCommandArgs,
  type UserCommandBase,
  type UserCommandContext,
  type UserCommandDefinition,
  type UserCommandExecuteFn,
  UserCommandLoader,
  type UserCommandLoaderOptions,
  type UserCommandLoadResult,
  type UserCommandResult,
  type UserCommandSource,
  type UserCommandType,
  type UserCommandValidationError,
  type YamlPromptCommand,
  type YamlShellCommand,
  type YamlUserCommand,
  // Schemas
  YamlUserCommandSchema,
} from "./user-command-loader.js";
