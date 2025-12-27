// ============================================
// Vellum LLM Providers
// ============================================

// =============================================================================
// Provider Implementations
// =============================================================================

export type { AnthropicProviderOptions } from "./anthropic.js";
export { AnthropicProvider } from "./anthropic.js";
export { BaichuanProvider } from "./baichuan.js";
// T053: GitHub Copilot Provider
export type { CopilotProviderOptions, DeviceAuthCallback } from "./copilot.js";
export { CopilotProvider } from "./copilot.js";
export { DeepSeekProvider } from "./deepseek.js";
export type { GoogleProviderOptions } from "./google.js";
export { GoogleProvider } from "./google.js";
export { GroqProvider } from "./groq.js";
export { LMStudioProvider, LocalProvider, OllamaProvider } from "./local.js";
export { MistralProvider } from "./mistral.js";
export { MoonshotProvider } from "./moonshot.js";
export type { OpenAIProviderOptions } from "./openai.js";
export { OpenAIProvider } from "./openai.js";
export { OpenAICompatibleProvider } from "./openai-compat.js";
export type { OpenRouterProviderOptions } from "./openrouter.js";
export { OpenRouterProvider } from "./openrouter.js";
export { QwenProvider } from "./qwen.js";
export { XAIProvider } from "./xai.js";
export { YiProvider } from "./yi.js";
// Chinese Providers (T048-T052)
export { generateZhipuToken, ZhipuProvider } from "./zhipu.js";

// =============================================================================
// T036-T037: Provider Registry (Recommended API)
// =============================================================================

export {
  type CredentialManagerLike,
  clearDefaultRegistry,
  configureDefaultRegistry,
  getDefaultRegistry,
  ProviderRegistry,
  type ProviderRegistryConfig,
  type ProviderRegistryOptions,
} from "./registry.js";

// =============================================================================
// Legacy Factory (Deprecated - Use ProviderRegistry instead)
// =============================================================================

export {
  type CreateProviderOptions,
  /** @deprecated Use ProviderRegistry.clear() instead */
  clearProviderCache,
  /** @deprecated Use ProviderRegistry.get() instead */
  createProvider,
  /** @deprecated Use ProviderRegistry.getSync() instead */
  createProviderSync,
  /** @deprecated Use ProviderRegistry instead */
  getProvider,
  type ProviderConfig,
} from "./factory.js";

// =============================================================================
// Core Types (T001-T005)
// =============================================================================

export type {
  CompletionMessage,
  CompletionParams,
  // T004: Completion result and token usage
  CompletionResult,
  ContentPart,
  // Legacy types
  CredentialValidationResult,
  ImageContentPart,
  // T001: LLMProvider interface
  LLMProvider,
  MessageRole,
  // T005: Model info
  ModelInfo,
  Provider,
  ProviderCredential,
  // T002: Provider options and completion params
  ProviderOptions,
  ProviderType,
  StopReason,
  StreamDoneEvent,
  StreamErrorEvent,
  // T003: Stream events
  StreamEvent,
  StreamReasoningEvent,
  StreamTextEvent,
  StreamToolCallDeltaEvent,
  StreamToolCallEvent,
  StreamUsageEvent,
  TextContentPart,
  ThinkingConfig,
  TokenUsage,
  ToolCall,
  ToolDefinition,
  ToolResultContentPart,
  ToolUseContentPart,
} from "./types.js";

// =============================================================================
// T006: Error Classification Utilities
// =============================================================================

export type { ErrorClassification, ProviderErrorCategory, ProviderErrorContext } from "./errors.js";
export {
  classifyHttpStatus,
  classifyProviderError,
  createProviderError,
  getRetryDelay,
  isRetryable,
  ProviderError,
} from "./errors.js";

// =============================================================================
// T028-T030: Streaming Utilities
// =============================================================================

export type {
  ProviderReasoningDelta,
  ProviderTextDelta,
  ProviderToolCallDelta,
  ProviderUsage,
} from "./stream.js";
export {
  collectStream,
  consumeStream,
  createDoneEvent,
  normalizeReasoningDelta,
  normalizeTextDelta,
  normalizeToolCall,
  normalizeUsage,
  streamWithAbort,
  streamWithOptions,
  streamWithTimeout,
  TextAccumulator,
} from "./stream.js";

// =============================================================================
// T031: Retry Utilities
// =============================================================================

export type { RetryOptions, RetryResult } from "./retry.js";
export {
  createRetryable,
  withProviderRetry,
  withProviderRetryResult,
  withResumableRetry,
} from "./retry.js";

// =============================================================================
// T035: Token Counting Utilities
// =============================================================================

export type { TokenCountOptions, TokenCountResult, Tokenizer } from "./tokenizer.js";
export {
  createAnthropicTokenizer,
  createFallbackTokenizer,
  createGoogleTokenizer,
  createOpenAITokenizer,
  createTokenizer,
  estimateTokenCount,
} from "./tokenizer.js";

// =============================================================================
// T054: Telemetry / Instrumented Provider
// =============================================================================

export type {
  InstrumentedProviderOptions,
  TelemetryEvent,
  TelemetryEventEmitter,
  TelemetryMetrics,
} from "./telemetry.js";
export { InstrumentedProvider, instrumentProvider } from "./telemetry.js";
