// ============================================
// Vellum Core Engine
// ============================================

/**
 * @module @vellum/core
 *
 * The core engine for the Vellum AI agent framework.
 * Provides typed message handling, tool execution, error handling,
 * configuration management, event-driven architecture, logging,
 * and dependency injection.
 */

// ============================================
// Legacy Exports (Agent/Loop)
// ============================================
export { Agent } from "./agent.js";
// ============================================
// Builtin Tools (T117)
// ============================================
export * from "./builtin/index.js";
// ============================================
// Config (T027-T043)
// ============================================
export {
  // Schemas
  AgentConfigSchema,
  type AgentConfigSettings,
  type Config,
  // Config loader utilities
  type ConfigError,
  type ConfigErrorCode,
  // ConfigManager
  ConfigManager,
  type ConfigManagerEmitter,
  type ConfigManagerEvents,
  ConfigSchema,
  deepMerge,
  findProjectConfig,
  type LLMProvider,
  LLMProviderSchema,
  type LoadConfigOptions,
  // Re-export LogLevel from config as ConfigLogLevel to avoid conflict
  type LogLevel as ConfigLogLevel,
  LogLevelSchema,
  loadConfig,
  type PartialConfig,
  type Permission,
  type PermissionMode,
  PermissionModeSchema,
  PermissionSchema,
  type ProviderName,
  ProviderNameSchema,
  parseEnvConfig,
} from "./config/index.js";
export { ContextManager } from "./context.js";
// ============================================
// DI (T084-T108)
// ============================================
export * from "./di/index.js";
// ============================================
// Errors (T077-T083)
// ============================================
export * from "./errors/index.js";

// ============================================
// Events (T045-T050)
// ============================================
export * from "./events/index.js";

// ============================================
// Logger (T052-T076)
// ============================================
export {
  ConsoleTransport,
  type ConsoleTransportOptions,
  FileTransport,
  type FileTransportOptions,
  JsonTransport,
  type JsonTransportOptions,
  LOG_LEVEL_PRIORITY,
  type LogEntry,
  Logger,
  type LoggerOptions,
  type LogLevel,
  type LogTransport,
} from "./logger/index.js";
export { AgentLoop } from "./loop.js";
// ============================================
// Migration (T115-T120)
// ============================================
export * from "./migration/index.js";
// ============================================
// Types (T001-T024)
// ============================================
export * from "./types/index.js";
export type {
  AgentOptions,
  CompleteEvent,
  ErrorEvent,
  LoopEvent,
  MessageEvent,
  ToolCallEvent,
  ToolResultEvent,
} from "./types.js";
