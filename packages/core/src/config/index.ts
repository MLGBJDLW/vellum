// ============================================
// T027, T043 - Config Module Barrel Export
// ============================================

// T034-T038 - Config loader utilities
export {
  type ConfigError,
  type ConfigErrorCode,
  deepMerge,
  findProjectConfig,
  type LoadConfigOptions,
  loadConfig,
  parseEnvConfig,
} from "./loader.js";
// T040-T042 - ConfigManager
export {
  ConfigManager,
  type ConfigManagerEmitter,
  type ConfigManagerEvents,
} from "./manager.js";
export {
  // T031 - Agent config schema
  AgentConfigSchema,
  type AgentConfigSettings,
  type Config,
  ConfigSchema,
  type LLMProvider,
  // T029 - LLM provider schema
  LLMProviderSchema,
  type LogLevel,
  // T032 - Complete config schema
  LogLevelSchema,
  type PartialConfig,
  type Permission,
  type PermissionMode,
  // T030 - Permission schemas
  PermissionModeSchema,
  PermissionSchema,
  type ProviderName,
  // T028 - Provider name enum
  ProviderNameSchema,
} from "./schema.js";
