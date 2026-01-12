/**
 * Migrate Commands Index
 *
 * Barrel exports for migration commands.
 *
 * @module cli/commands/migrate
 */

export {
  executeMigratePrompts,
  type MigratePromptsOptions,
  type MigratePromptsResult,
  type MigrationAction,
  migratePromptsCommand,
  runMigratePromptsCli,
} from "./prompts.js";
