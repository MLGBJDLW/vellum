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
  SubcommandDef,
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
// Language Command (i18n T011-T013)
// =============================================================================

export { languageCommand } from "./language.js";

// =============================================================================
// Session Commands (T032)
// =============================================================================

export {
  createResumeCommand,
  findSessionById,
  getMostRecentSession,
  type ResumeSessionEventData,
  resumeCommand,
  type SessionLookupOptions,
  type SessionLookupResult,
  SHORT_ID_LENGTH,
} from "./session/index.js";

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
// Onboarding (Phase 38)
// =============================================================================

export {
  type OnboardOptions,
  type OnboardResult,
  onboardCommand,
  runOnboardCommand,
} from "./onboard.js";

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
  batchCommand,
  createBatchCommand,
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

// =============================================================================
// Init Command (T039-T041)
// =============================================================================

export {
  executeInit,
  generateAgentsMd,
  generateMinimalAgentsMd,
  type InitOptions,
  type InitResult,
  initSlashCommand,
  type ProjectInfo,
} from "./init.js";

// =============================================================================
// Agents Command Group (T042)
// =============================================================================

export {
  type AgentsGenerateOptions,
  type AgentsShowOptions,
  type AgentsSubcommand,
  type AgentsValidateOptions,
  agentsCommand,
  executeAgents,
  getAgentsHelp,
} from "./agents/index.js";

// =============================================================================
// Custom Agents Command Group (T020-T024, T025)
// =============================================================================

export {
  type CreateOptions as CustomAgentsCreateOptions,
  type CustomAgentsSubcommand,
  customAgentsCommand,
  type ExportOptions as CustomAgentsExportOptions,
  executeCustomAgents,
  getCustomAgentsHelp,
  type ImportOptions as CustomAgentsImportOptions,
  type InfoOptions as CustomAgentsInfoOptions,
  type ListOptions as CustomAgentsListOptions,
  type ValidateOptions as CustomAgentsValidateOptions,
} from "./custom-agents/index.js";

// =============================================================================
// Skill Commands (T033-T037)
// =============================================================================

export {
  executeSkillCreate,
  executeSkillList,
  executeSkillShow,
  executeSkillValidate,
  handleSkillCreate,
  handleSkillList,
  handleSkillShow,
  handleSkillValidate,
  type SkillCreateOptions,
  type SkillListOptions,
  type SkillShowOptions,
  type SkillValidateOptions,
} from "./skill.js";

// =============================================================================
// Mode Commands (T041)
// =============================================================================

export {
  getModeCommandsManager,
  modeCommand,
  modeSlashCommands,
  planCommand,
  setModeCommandsManager,
  specCommand,
  vibeCommand,
} from "./mode.js";

// =============================================================================
// Model Commands (Chain 22)
// =============================================================================

export {
  getModelCommandConfig,
  modelCommand,
  setModelCommandConfig,
} from "./model.js";

// =============================================================================
// Theme Commands (T042)
// =============================================================================

export {
  getThemeContext,
  setThemeContext,
  themeCommand,
  themeSlashCommands,
} from "./theme.js";

// =============================================================================
// Cost Commands (Phase 35)
// =============================================================================

export {
  costCommand,
  costResetCommand,
  getCostCommandsService,
  setCostCommandsService,
} from "./cost.js";

// =============================================================================
// Spec Workflow Commands (T034)
// =============================================================================

export {
  executeSpec,
  type SpecOptions,
  type SpecResult,
  specSlashCommand,
} from "./spec.js";

// =============================================================================
// Status Command (T035)
// =============================================================================

export {
  executeStatus,
  type StatusFormat,
  type SystemStatus,
  statusCommand,
} from "./status.js";

// =============================================================================
// LSP Commands (Phase 30)
// =============================================================================

export { createLspCommand } from "./lsp.js";

// =============================================================================
// Memory Commands (Phase 31)
// =============================================================================

export {
  executeMemoryExport,
  executeMemoryList,
  executeMemorySearch,
  type MemoryExportFormat,
  type MemoryExportOptions,
  type MemoryListOptions,
  type MemorySearchOptions,
  memoryCommand,
  memoryCommands,
  memoryExportCommand,
  memoryListCommand,
  memorySearchCommand,
  memorySubcommands,
  withMemoryService,
} from "./memory/index.js";

// =============================================================================
// User Commands (Phase 16)
// =============================================================================

export {
  ensureCommandsDirectory,
  getCommandTemplate,
  registerUserCommands,
  type UserCommandArgs,
  type UserCommandContext,
  type UserCommandDefinition,
  UserCommandLoader,
  type UserCommandLoadResult,
  type UserCommandResult,
  type UserCommandValidationError,
} from "./user-commands.js";

// =============================================================================
// Metrics Commands (T067)
// =============================================================================

export {
  metricsCommand,
  metricsCommands,
  metricsResetCommand,
} from "./metrics.js";

// =============================================================================
// Workflow Commands (T035)
// =============================================================================

export {
  clearWorkflowLoaderCache,
  workflowCommand,
  workflowCommands,
} from "./workflow.js";

// =============================================================================
// Markdown Commands (T033)
// =============================================================================

export {
  clearMarkdownCommandCache,
  getMarkdownCommandNames,
  isMarkdownCommand,
  loadMarkdownCommands,
  type MarkdownCommandLoaderOptions,
  type MarkdownCommandLoadResult,
  registerMarkdownCommands,
} from "./markdown-commands.js";

// =============================================================================
// Init Prompts Command (T042-T044)
// =============================================================================

export {
  executeInitPrompts,
  type InitPromptsOptions,
  type InitPromptsResult,
  initPromptsCommand,
  runInitPromptsCli,
} from "./init/index.js";

// =============================================================================
// Prompt Validate Command (T045-T046)
// =============================================================================

export {
  executePromptValidate,
  type PromptValidateOptions,
  type PromptValidateResult,
  promptValidateCommand,
  runPromptValidateCli,
  type ValidationIssue,
  type ValidationSeverity,
} from "./prompt/index.js";

// =============================================================================
// Migrate Prompts Command (T047-T048)
// =============================================================================

export {
  executeMigratePrompts,
  type MigratePromptsOptions,
  type MigratePromptsResult,
  type MigrationAction,
  migratePromptsCommand,
  runMigratePromptsCli,
} from "./migrate/index.js";

// =============================================================================
// Tutorial Commands (Phase 38)
// =============================================================================

export {
  getTutorialSystem,
  setTutorialSystem,
  tutorialCommand,
} from "./tutorial.js";
