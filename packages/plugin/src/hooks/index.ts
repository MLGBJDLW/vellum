/**
 * Hook System Exports
 *
 * Re-exports all hook system types, schemas, and utilities.
 *
 * @module plugin/hooks
 */

// =============================================================================
// Types and Schemas
// =============================================================================

export {
  // Constants
  DEFAULT_HOOK_TIMEOUT,
  type HookAction,
  HookActionSchema,
  type HookCommandAction,
  // Action Types
  HookCommandActionSchema,
  type HookEvent,
  // Event Types
  HookEventSchema,
  type HookFailBehavior,
  // Fail Behavior
  HookFailBehaviorSchema,
  type HookPromptAction,
  HookPromptActionSchema,
  type HookRule,
  // Rule Types
  HookRuleSchema,
  type HookScriptAction,
  HookScriptActionSchema,
  type HooksConfig,
  // Config Types
  HooksConfigSchema,
  MAX_HOOK_TIMEOUT,
  MIN_HOOK_TIMEOUT,
} from "./types.js";

// =============================================================================
// Parser
// =============================================================================

export {
  type HookRuleValidationResult,
  HooksParseError,
  parseHooksConfig,
  parseHooksConfigRaw,
  validateHookRule,
} from "./parser.js";

// =============================================================================
// Executor
// =============================================================================

export {
  // Executor Functions
  executeHooks,
  executeSingleHook,
  // Context and Result Types
  type HookContext,
  // Error Codes
  HookErrorCode,
  // Error Classes
  type HookErrorOptions,
  HookExecutionError,
  HookPermissionError,
  type HookResult,
  type HooksExecutionResult,
  HookTimeoutError,
  // Permission Bridge
  type PermissionBridge,
} from "./executor.js";
