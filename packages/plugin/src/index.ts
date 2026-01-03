// ============================================
// Vellum Plugin System
// ============================================

export { definePlugin } from "./define.js";
export type { LoadOptions, PartiallyLoadedPlugin } from "./loader.js";
export {
  isFullyLoaded,
  loadFull,
  loadManifestOnly,
  loadPlugin,
  PluginLoadError,
} from "./loader.js";
export { PluginManager } from "./manager.js";
export type { Plugin, PluginConfig, PluginHooks } from "./types.js";

// ============================================
// Plugin Paths (T007)
// ============================================

export type { SearchPathsOptions } from "./paths.js";

export {
  expandPath,
  getBuiltinPluginsDir,
  getGlobalPluginsDir,
  getPluginRoot,
  getProjectPluginsDir,
  getSearchPaths,
  getUserPluginsDir,
  pathExists,
  resolvePluginPath,
} from "./paths.js";

// ============================================
// Plugin Agents (T002)
// ============================================

export type {
  ParsedAgent,
  PluginAgentDefinition,
  PluginAgentDefinitionInput,
} from "./agents/index.js";

export {
  adaptToPluginAgent,
  convertToolsToToolGroups,
  extractFirstParagraph as extractAgentFirstParagraph,
  extractNameFromPath as extractAgentNameFromPath,
  getPluginAgentQualifiedSlug,
  MAX_FILE_PATH_LENGTH,
  MAX_PLUGIN_NAME_LENGTH,
  PLUGIN_AGENT_SCOPE,
  PluginAgentDefinitionSchema,
  parseAgent,
  parsePluginAgentQualifiedSlug,
  TOOL_TO_GROUP,
  validatePluginAgentDefinition,
} from "./agents/index.js";

// ============================================
// Plugin Settings (T005)
// ============================================

export type {
  EnvMapping,
  JsonSchemaObject,
  JsonSchemaProperty,
  JsonSchemaType,
  PluginSettingsSchema,
  SettingsDefaults,
  SettingsValue,
} from "./settings/index.js";

export {
  EnvMappingSchema,
  JsonSchemaObjectSchema,
  JsonSchemaPropertySchema,
  JsonSchemaTypeSchema,
  PluginSettingsSchemaSchema,
  SettingsDefaultsSchema,
  SettingsValueSchema,
} from "./settings/index.js";

// ============================================
// Plugin Hooks (T024, T025)
// ============================================

export type {
  HookAction,
  HookCommandAction,
  HookContext,
  HookErrorOptions,
  HookEvent,
  HookFailBehavior,
  HookPromptAction,
  HookResult,
  HookRule,
  HookRuleValidationResult,
  HookScriptAction,
  HooksConfig,
  HooksExecutionResult,
  PermissionBridge,
} from "./hooks/index.js";

export {
  // Constants
  DEFAULT_HOOK_TIMEOUT,
  executeHooks,
  executeSingleHook,
  HookActionSchema,
  HookCommandActionSchema,
  // Executor
  HookErrorCode,
  // Schemas
  HookEventSchema,
  HookExecutionError,
  HookFailBehaviorSchema,
  HookPermissionError,
  HookPromptActionSchema,
  HookRuleSchema,
  HookScriptActionSchema,
  HooksConfigSchema,
  // Parser
  HooksParseError,
  HookTimeoutError,
  MAX_HOOK_TIMEOUT,
  MIN_HOOK_TIMEOUT,
  parseHooksConfig,
  parseHooksConfigRaw,
  validateHookRule,
} from "./hooks/index.js";

// ============================================
// Plugin Commands (T014)
// ============================================

export type { ParsedCommand } from "./commands/index.js";
export {
  adaptCommands,
  adaptToSlashCommand,
  parseCommand,
  type SlashCommand,
} from "./commands/index.js";

// ============================================
// Plugin Skills (T036)
// ============================================

export type { PluginSkillRegistry } from "./skills/adapter.js";
export {
  adaptToSkillSource,
  createSkillRegistry,
} from "./skills/adapter.js";
