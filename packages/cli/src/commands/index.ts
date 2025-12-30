/**
 * CLI Commands Index
 *
 * Re-exports all CLI commands for easy importing.
 *
 * @module cli/commands
 */

// =============================================================================
// Command System Types (T004-T007)
// =============================================================================

export type {
  ArgType,
  CommandCategory,
  CommandContext,
  CommandError,
  CommandErrorCode,
  CommandInteractive,
  CommandKind,
  CommandPending,
  CommandResult,
  CommandSuccess,
  InteractivePrompt,
  NamedArg,
  ParsedArgs,
  PositionalArg,
  Session,
  SlashCommand as SlashCommandDef,
} from "./types.js";

export { error, interactive, pending, success } from "./types.js";

// =============================================================================
// Command Registry (T008-T011)
// =============================================================================

export { CommandConflictError, CommandRegistry } from "./registry.js";

// =============================================================================
// Command Parser (T014-T017)
// =============================================================================

export { CommandParser, isParseError, type ParseError, type ParseResult } from "./parser.js";

// =============================================================================
// Command Executor (T018-T021)
// =============================================================================

export { type CommandContextProvider, CommandExecutor } from "./executor.js";

// =============================================================================
// Context Provider (T037)
// =============================================================================

export {
  createContextProvider,
  createTestContextProvider,
  DefaultContextProvider,
  type DefaultContextProviderOptions,
  type EventEmitter,
} from "./context-provider.js";

// =============================================================================
// Core Commands (T028-T030)
// =============================================================================

export {
  clearCommand,
  exitCommand,
  getHelpRegistry,
  helpCommand,
  setHelpRegistry,
} from "./core/index.js";

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
  // Enhanced commands (T034)
  credentialsCommand,
  enhancedAuthCommands,
  executeSlashCommand,
  findSlashCommand,
  getSlashCommandHelp,
  handleCredentials,
  // Handlers
  handleLogin,
  handleLogout,
  // Dispatcher
  isSlashCommand,
  loginCommand,
  logoutCommand,
  parseSlashCommand,
  type SlashCommand,
  type SlashCommandContext,
  type SlashCommandHandler,
  // Types
  type SlashCommandResult,
} from "./auth.js";

// =============================================================================
// Adapters (T032/T033/T034A) - Backward Compatibility
// =============================================================================

export {
  fromSlashCommandResult,
  type LegacyHandler,
  type LegacySlashCommandResult,
  toLegacyContext,
  toSlashCommandResult,
  wrapLegacyHandler,
} from "./adapters.js";

// =============================================================================
// Utilities (T034B)
// =============================================================================

export {
  extractCommandName,
  isSlashCommand as isSlashCommandUtil,
  maskValue,
  parseCommandInput,
} from "./utils.js";

// =============================================================================
// Autocomplete (T022-T025)
// =============================================================================

export {
  type AutocompleteAction,
  type AutocompleteCandidate,
  type AutocompleteState,
  autocompleteReducer,
  computeHighlights,
  type FuzzyScoreResult,
  fuzzyScore,
  getSelectedCandidate,
  initialAutocompleteState,
  shouldShowAutocomplete,
} from "./autocomplete.js";

// =============================================================================
// Security (T050-T052)
// =============================================================================

export {
  type CommandSecurityPolicy,
  createPermissionChecker,
  InputSanitizer,
  PermissionChecker,
  type PermissionResult,
} from "./security/index.js";

// =============================================================================
// Exit Codes (T046)
// =============================================================================

export { EXIT_CODES, type ExitCode, ExitCodeMapper } from "./exit-codes.js";

// =============================================================================
// Shell Completion (T047)
// =============================================================================

export {
  BashCompletionGenerator,
  type CompletionGenerator,
  type CompletionOptions,
  FishCompletionGenerator,
  generateCompletion,
  generateCompletionFromCommands,
  getAvailableShells,
  getGenerator,
  isValidShell,
  PowerShellCompletionGenerator,
  type ShellType,
  ZshCompletionGenerator,
} from "./completion/index.js";

// =============================================================================
// Batch Execution (T048)
// =============================================================================

export {
  type BatchCommandResult,
  type BatchConfig,
  BatchExecutor,
  type BatchResult,
  BatchScriptParser,
  type BatchValidationResult,
  createBatchScript,
} from "./batch/index.js";

// =============================================================================
// Streaming JSON Output (T049)
// =============================================================================

export {
  type CompleteEventData,
  createCollector,
  type ErrorEventData,
  formatResultAsJson,
  type MetadataEventData,
  type OutputEventData,
  type ProgressEventData,
  parseNdjson,
  type ResultEventData,
  type StartEventData,
  type StreamEventType,
  type StreamJsonEvent,
  StreamJsonWriter,
  type StreamJsonWriterOptions,
  type StreamOutput,
} from "./output/stream-json.js";

// =============================================================================
// Command Parser - Chain & Pipe (T053-T054)
// =============================================================================

export {
  type ChainExecutionResult,
  ChainedCommandExecutor,
  type ChainOperator,
  type ChainParseResult,
  ChainParser,
  type ChainSegment,
  type CommandExecutorFn,
} from "./parser/chain-parser.js";

export {
  type FileWriterFn,
  type PipeCommandExecutorFn,
  PipedCommandExecutor,
  type PipeExecutionResult,
  type PipeOperator,
  type PipeParseResult,
  PipeParser,
  type PipeSegment,
  type PipeSegmentType,
} from "./parser/pipe-parser.js";
