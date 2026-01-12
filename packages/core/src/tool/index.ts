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
// Tool Groups System (T030)
// =============================================================================

export * from "./groups.js";
export * from "./mode-filter.js";

// =============================================================================
// Git Tools (T022)
// =============================================================================

export * from "./git/index.js";
