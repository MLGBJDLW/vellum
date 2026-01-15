// ============================================
// Tool Module Barrel Export
// ============================================

// Re-export core Tool types from types/tool.js
export type {
  DefineToolConfig,
  Tool,
  ToolContext,
  ToolDefinition,
  ToolKind,
  ToolResult,
} from "../types/tool.js";
export { defineTool, fail, ok, ToolKindSchema } from "../types/tool.js";

export {
  DEFAULT_TIMEOUT_MS,
  defaultExecutionLogger,
  type EnterpriseHooks,
  type EnterpriseToolCallInfo,
  type ExecuteOptions,
  type ExecutionLogger,
  type ExecutionResult,
  type PermissionChecker,
  type PermissionDecision,
  PermissionDeniedError,
  SHELL_TIMEOUT_MS,
  sanitizeParamsForLogging,
  ToolAbortedError,
  ToolExecutionError,
  type ToolExecutionLog,
  ToolExecutor,
  type ToolExecutorConfig,
  ToolNotFoundError,
  ToolTimeoutError,
} from "./executor.js";

export {
  _internal as mcpProxyInternals,
  createMCPProxy,
  type JSONRPCError,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type JSONSchema,
  jsonSchemaToZod,
  MCPConnectionError,
  MCPProtocolError,
  type MCPProxy,
  type MCPProxyConfig,
  MCPTimeoutError,
  type MCPToolDefinition,
  type MCPToolResult,
  type MCPTransport,
} from "./mcp-proxy.js";

export {
  createToolRegistry,
  type GetDefinitionsFilter,
  type LLMToolDefinition,
  type McpToolDefinition,
  type ToolRegistry,
} from "./registry.js";

export {
  _internal as smartEditInternals,
  createSmartEditEngine,
  type SmartEditEngine,
  type SmartEditOptions,
  type SmartEditResult,
  type StrategyName,
} from "./smart-edit.js";

// =============================================================================
// UnifiedToolContainer (T045)
// =============================================================================

export {
  createToolContainer,
  type ToolContainerConfig,
  UnifiedToolContainer,
} from "./container.js";

// =============================================================================
// Dynamic Tool Loader
// =============================================================================

export {
  getToolValidationError,
  isValidTool,
  type LoadToolError,
  type LoadToolsOptions,
  type LoadToolsResult,
  loadCustomTools,
  loadToolFile,
} from "./loader.js";

// =============================================================================
// Tool Groups System (T030)
// =============================================================================

export * from "./groups.js";
export * from "./mode-filter.js";

// =============================================================================
// Batch Execution (T075)
// =============================================================================

export {
  type BatchExecutionContext,
  type BatchExecutionError,
  type BatchExecutionOptions,
  type BatchExecutionResult,
  type BatchToolCall,
  createBatch,
  executeBatch,
  getSuccessfulResults,
  isBatchSuccess,
} from "./batch.js";

// =============================================================================
// Git Tools (T022)
// =============================================================================

export * from "./git/index.js";

// =============================================================================
// Output Truncation (T076)
// =============================================================================

export {
  type ContentType,
  createTruncator,
  DEFAULT_MAX_LENGTH,
  DEFAULT_PRESERVE_HEAD_RATIO,
  DEFAULT_PRESERVE_TAIL,
  detectContentType,
  type TruncationOptions,
  type TruncationResult,
  truncateOutput,
  truncateWithSpill,
  wouldTruncate,
} from "./truncation.js";
