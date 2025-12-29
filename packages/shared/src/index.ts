// ============================================
// Vellum Shared Types
// ============================================

// Error codes
export { ErrorCode } from "./errors/index.js";
export type { AgentConfig, AgentState } from "./types/agent.js";
export type { Message, MessageRole } from "./types/message.js";
export type { ModelInfo, ProviderConfig } from "./types/provider.js";
export type { Result } from "./types/result.js";
// Result type (shared to avoid circular deps between core and provider)
export {
  all,
  Err,
  flatMap,
  isErr,
  isOk,
  map,
  mapErr,
  match,
  Ok,
  tryCatch,
  tryCatchAsync,
  unwrap,
  unwrapOr,
} from "./types/result.js";
export type { Tool, ToolResult } from "./types/tool.js";
// Re-export common utilities
export { createId } from "./utils/id.js";
