/**
 * CLI Commands Index
 *
 * Re-exports all CLI commands for easy importing.
 *
 * @module cli/commands
 */

// =============================================================================
// Credential Management (T022)
// =============================================================================

export {
  AddCredential,
  // Components
  CredentialsApp,
  // Utilities
  createCredentialManager,
  ListCredentials,
  PROVIDER_ENV_VARS,
  RemoveCredential,
  renderCredentialsAdd,
  // Render functions
  renderCredentialsList,
  renderCredentialsRemove,
  SUPPORTED_PROVIDERS,
} from "./credentials.js";

// =============================================================================
// Slash Commands (T022B)
// =============================================================================

export {
  // Command registry
  authSlashCommands,
  executeSlashCommand,
  findSlashCommand,
  getSlashCommandHelp,
  handleCredentials,
  // Handlers
  handleLogin,
  handleLogout,
  // Dispatcher
  isSlashCommand,
  parseSlashCommand,
  type SlashCommand,
  type SlashCommandContext,
  type SlashCommandHandler,
  // Types
  type SlashCommandResult,
} from "./auth.js";
