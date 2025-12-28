// ============================================
// Session Module Exports
// ============================================

/**
 * @module @vellum/core/session
 *
 * Session management for the agent loop.
 * Provides LLM streaming, message handling, and thinking support.
 */

// LLM Streaming
export {
  LLM,
  MAX_OUTPUT_TOKENS,
  DEFAULT_STREAM_TIMEOUT_MS,
  StreamConfigSchema,
  type StreamConfig,
  type ToolCallRepairResult,
  type LLMStreamEvent,
  repairToolCall,
  buildToolLookup,
} from "./llm.js";

// Session Message Types and Converters
export {
  // Schemas
  SessionTextPartSchema,
  SessionToolPartSchema,
  SessionToolResultPartSchema,
  SessionReasoningPartSchema,
  SessionFilePartSchema,
  SessionImagePartSchema,
  SessionMessagePartSchema,
  SessionRoleSchema,
  SessionMessageMetadataSchema,
  SessionMessageSchema,
  // Types
  type SessionTextPart,
  type SessionToolPart,
  type SessionToolResultPart,
  type SessionReasoningPart,
  type SessionFilePart,
  type SessionImagePart,
  type SessionMessagePart,
  type SessionRole,
  type SessionMessageMetadata,
  type SessionMessage,
  // Constructors
  SessionParts,
  createUserMessage,
  createAssistantMessage,
  createSystemMessage,
  createToolResultMessage,
  // Converters
  toModelMessages,
  // Utilities
  getTextContent,
  getToolCalls,
  getReasoningContent,
  hasToolCalls,
  hasToolResults,
} from "./message.js";

// Thinking Handler
export {
  // Types
  type ReasoningStartEvent,
  type ReasoningDeltaEvent,
  type ReasoningEndEvent,
  type ThinkingEvent,
  type ThinkingState,
  // Functions
  createThinkingState,
  handleThinkingDelta,
  finalizeThinking,
  handleThinking,
  // Class
  ThinkingHandler,
} from "./thinking.js";

// Error Classification (T039)
export {
  classifyError,
  isRetryable,
  isFatal,
  isTransient,
  getRetryDelay,
  getSuggestedErrorAction,
  type ErrorInfo,
  type ErrorClassSeverity,
  type SuggestedAction,
} from "./errors.js";

// Session Retry (T022)
export {
  withSessionRetry,
  abortableSleep,
  calculateRetryDelay,
  createSessionRetry,
  isAbortError,
  RetryAbortedError,
  type SessionRetryOptions,
} from "./retry.js";
