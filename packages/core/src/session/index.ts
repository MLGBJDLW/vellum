// ============================================
// Session Module Exports
// ============================================

/**
 * @module @vellum/core/session
 *
 * Session management for the agent loop.
 * Provides LLM streaming, message handling, and thinking support.
 */

// Error Classification (T039)
export {
  classifyError,
  type ErrorClassSeverity,
  type ErrorInfo,
  getRetryDelay,
  getSuggestedErrorAction,
  isFatal,
  isRetryable,
  isTransient,
  type SuggestedAction,
} from "./errors.js";
// LLM Streaming
export {
  buildToolLookup,
  DEFAULT_STREAM_TIMEOUT_MS,
  LLM,
  type LLMStreamEvent,
  MAX_OUTPUT_TOKENS,
  repairToolCall,
  type StreamConfig,
  StreamConfigSchema,
  type ToolCallRepairResult,
} from "./llm.js";
// Session Message Types and Converters
export {
  createAssistantMessage,
  createSystemMessage,
  createToolResultMessage,
  createUserMessage,
  getReasoningContent,
  // Utilities
  getTextContent,
  getToolCalls,
  hasToolCalls,
  hasToolResults,
  type SessionFilePart,
  SessionFilePartSchema,
  type SessionImagePart,
  SessionImagePartSchema,
  type SessionMessage,
  type SessionMessageMetadata,
  SessionMessageMetadataSchema,
  type SessionMessagePart,
  SessionMessagePartSchema,
  SessionMessageSchema,
  // Constructors
  SessionParts,
  type SessionReasoningPart,
  SessionReasoningPartSchema,
  type SessionRole,
  SessionRoleSchema,
  // Types
  type SessionTextPart,
  // Schemas
  SessionTextPartSchema,
  type SessionToolPart,
  SessionToolPartSchema,
  type SessionToolResultPart,
  SessionToolResultPartSchema,
  // Converters
  toModelMessages,
} from "./message.js";
// Session Retry (T022)
export {
  abortableSleep,
  calculateRetryDelay,
  createSessionRetry,
  isAbortError,
  RetryAbortedError,
  type SessionRetryOptions,
  withSessionRetry,
} from "./retry.js";
// Thinking Handler
export {
  // Functions
  createThinkingState,
  finalizeThinking,
  handleThinking,
  handleThinkingDelta,
  type ReasoningDeltaEvent,
  type ReasoningEndEvent,
  // Types
  type ReasoningStartEvent,
  type ThinkingEvent,
  // Class
  ThinkingHandler,
  type ThinkingState,
} from "./thinking.js";
