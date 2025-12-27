// =============================================================================
// Legacy Type Compatibility
// =============================================================================

/**
 * Deprecated: LanguageModel type for backward compatibility.
 * This was previously imported from Vercel AI SDK.
 * The createModel() method is deprecated and will throw an error.
 * @deprecated Use native provider methods instead.
 */
export type LanguageModel = never;

// =============================================================================
// Provider Types
// =============================================================================

/**
 * Supported LLM provider types
 */
export type ProviderType =
  | "anthropic"
  | "openai"
  | "google"
  | "deepseek"
  | "qwen"
  | "groq"
  | "xai"
  | "openrouter"
  | "ollama"
  | "lmstudio"
  | "zhipu"
  | "moonshot"
  | "mistral"
  | "yi"
  | "baichuan";

// =============================================================================
// T002: Provider Options and Completion Parameters
// =============================================================================

/**
 * Configuration options for initializing an LLM provider
 *
 * @example
 * ```typescript
 * const options: ProviderOptions = {
 *   apiKey: 'sk-...',
 *   baseUrl: 'https://api.anthropic.com',
 *   timeout: 30000,
 * };
 * ```
 */
export interface ProviderOptions {
  /** API key for authentication */
  apiKey?: string;
  /** Base URL for the API endpoint (overrides default) */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Additional headers to include in requests */
  headers?: Record<string, string>;
}

/**
 * Message role in a conversation
 */
export type MessageRole = "system" | "user" | "assistant";

/**
 * Message content part - text content
 */
export interface TextContentPart {
  /** Discriminator for text content */
  type: "text";
  /** The text content */
  text: string;
}

/**
 * Message content part - image content
 */
export interface ImageContentPart {
  /** Discriminator for image content */
  type: "image";
  /** Base64-encoded image data or URL */
  source: string;
  /** MIME type of the image */
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
}

/**
 * Message content part - tool use request
 */
export interface ToolUseContentPart {
  /** Discriminator for tool use */
  type: "tool_use";
  /** Unique identifier for the tool call */
  id: string;
  /** Name of the tool to invoke */
  name: string;
  /** Input parameters for the tool */
  input: Record<string, unknown>;
}

/**
 * Message content part - tool result
 */
export interface ToolResultContentPart {
  /** Discriminator for tool result */
  type: "tool_result";
  /** ID of the tool call this result corresponds to */
  toolUseId: string;
  /** Result content (can be string or structured) */
  content: string | unknown;
  /** Whether the tool execution resulted in an error */
  isError?: boolean;
}

/**
 * Union of all content part types
 */
export type ContentPart =
  | TextContentPart
  | ImageContentPart
  | ToolUseContentPart
  | ToolResultContentPart;

/**
 * Message in a conversation
 */
export interface CompletionMessage {
  /** Role of the message sender */
  role: MessageRole;
  /** Content of the message (string for simple text, array for multi-part) */
  content: string | ContentPart[];
}

/**
 * Tool definition for function calling
 */
export interface ToolDefinition {
  /** Unique name of the tool */
  name: string;
  /** Description of what the tool does (for LLM context) */
  description: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema: Record<string, unknown>;
}

/**
 * Thinking/reasoning configuration for extended thinking models
 */
export interface ThinkingConfig {
  /** Enable extended thinking mode */
  enabled: boolean;
  /** Maximum tokens for the thinking process */
  budgetTokens?: number;
}

/**
 * Parameters for a completion request
 *
 * @example
 * ```typescript
 * const params: CompletionParams = {
 *   model: 'claude-sonnet-4-20250514',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   temperature: 0.7,
 *   maxTokens: 1024,
 * };
 * ```
 */
export interface CompletionParams {
  /** Model identifier to use for completion */
  model: string;
  /** Conversation messages */
  messages: CompletionMessage[];
  /** Sampling temperature (0-2, higher = more creative) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Tools available for the model to use */
  tools?: ToolDefinition[];
  /** Extended thinking configuration */
  thinking?: ThinkingConfig;
  /** Stop sequences that halt generation */
  stopSequences?: string[];
  /** Top-p sampling (nucleus sampling) */
  topP?: number;
  /** Presence penalty for token repetition */
  presencePenalty?: number;
  /** Frequency penalty for token repetition */
  frequencyPenalty?: number;
}

// =============================================================================
// T004: Token Usage and Completion Result
// =============================================================================

/**
 * Token usage statistics from a completion
 *
 * @example
 * ```typescript
 * const usage: TokenUsage = {
 *   inputTokens: 150,
 *   outputTokens: 250,
 *   thinkingTokens: 500,
 * };
 * console.log(`Total: ${usage.inputTokens + usage.outputTokens} tokens`);
 * ```
 */
export interface TokenUsage {
  /** Number of tokens in the input/prompt */
  inputTokens: number;
  /** Number of tokens in the output/completion */
  outputTokens: number;
  /** Number of tokens used for thinking/reasoning (if applicable) */
  thinkingTokens?: number;
  /** Number of tokens in cached input (if applicable) */
  cacheReadTokens?: number;
  /** Number of tokens written to cache (if applicable) */
  cacheWriteTokens?: number;
}

/**
 * Stop reasons for completion termination
 */
export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "tool_use"
  | "content_filter"
  | "error";

/**
 * Tool call in a completion result
 */
export interface ToolCall {
  /** Unique identifier for the tool call */
  id: string;
  /** Name of the tool being called */
  name: string;
  /** Input parameters for the tool */
  input: Record<string, unknown>;
}

/**
 * Result of a non-streaming completion request
 *
 * @example
 * ```typescript
 * const result: CompletionResult = {
 *   content: 'Hello! How can I help you today?',
 *   usage: { inputTokens: 10, outputTokens: 8 },
 *   stopReason: 'end_turn',
 * };
 * ```
 */
export interface CompletionResult {
  /** Generated text content */
  content: string;
  /** Token usage statistics */
  usage: TokenUsage;
  /** Reason why generation stopped */
  stopReason: StopReason;
  /** Thinking/reasoning content (if thinking was enabled) */
  thinking?: string;
  /** Tool calls requested by the model */
  toolCalls?: ToolCall[];
}

// =============================================================================
// T003: Stream Event Types (Discriminated Union)
// =============================================================================

/**
 * Text delta event in a stream
 */
export interface StreamTextEvent {
  /** Discriminator for text events */
  type: "text";
  /** Incremental text content */
  text: string;
}

/**
 * Reasoning/thinking delta event in a stream
 */
export interface StreamReasoningEvent {
  /** Discriminator for reasoning events */
  type: "reasoning";
  /** Incremental reasoning content */
  text: string;
}

/**
 * Complete tool call event (after full parameters are received)
 */
export interface StreamToolCallEvent {
  /** Discriminator for tool call events */
  type: "toolCall";
  /** Unique identifier for the tool call */
  id: string;
  /** Name of the tool being called */
  name: string;
  /** Complete input parameters for the tool */
  input: Record<string, unknown>;
}

/**
 * Incremental tool call event (partial parameters)
 */
export interface StreamToolCallDeltaEvent {
  /** Discriminator for tool call delta events */
  type: "toolCallDelta";
  /** Unique identifier for the tool call */
  id: string;
  /** Name of the tool (may be partial on first delta) */
  name?: string;
  /** Partial JSON string of input parameters */
  inputDelta: string;
}

/**
 * Token usage event (typically at end of stream)
 */
export interface StreamUsageEvent {
  /** Discriminator for usage events */
  type: "usage";
  /** Token usage statistics */
  usage: TokenUsage;
}

/**
 * Error event in a stream
 */
export interface StreamErrorEvent {
  /** Discriminator for error events */
  type: "error";
  /** Error code (e.g., 'rate_limit', 'context_length') */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Whether the error is retryable */
  retryable: boolean;
}

/**
 * Stream completion event
 */
export interface StreamDoneEvent {
  /** Discriminator for done events */
  type: "done";
  /** Final stop reason */
  stopReason: StopReason;
}

/**
 * Discriminated union of all stream event types
 *
 * @example
 * ```typescript
 * for await (const event of provider.stream(params)) {
 *   switch (event.type) {
 *     case 'text':
 *       process.stdout.write(event.text);
 *       break;
 *     case 'reasoning':
 *       console.log('Thinking:', event.text);
 *       break;
 *     case 'toolCall':
 *       await executeTool(event.name, event.input);
 *       break;
 *     case 'usage':
 *       console.log('Tokens used:', event.usage);
 *       break;
 *     case 'done':
 *       console.log('Completed:', event.stopReason);
 *       break;
 *   }
 * }
 * ```
 */
export type StreamEvent =
  | StreamTextEvent
  | StreamReasoningEvent
  | StreamToolCallEvent
  | StreamToolCallDeltaEvent
  | StreamUsageEvent
  | StreamErrorEvent
  | StreamDoneEvent;

// =============================================================================
// T005: Model Information
// =============================================================================

/**
 * Detailed information about an LLM model and its capabilities
 *
 * @example
 * ```typescript
 * const model: ModelInfo = {
 *   id: 'claude-sonnet-4-20250514',
 *   name: 'Claude Sonnet 4',
 *   provider: 'anthropic',
 *   contextWindow: 200000,
 *   supportsTools: true,
 *   supportsVision: true,
 *   supportsReasoning: true,
 *   inputPrice: 3.0,
 *   outputPrice: 15.0,
 * };
 * ```
 */
export interface ModelInfo {
  /** Unique model identifier used in API calls */
  id: string;
  /** Human-readable model name */
  name: string;
  /** Provider that offers this model */
  provider: ProviderType;
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Maximum output tokens (if different from context) */
  maxOutputTokens?: number;
  /** Whether the model supports function/tool calling */
  supportsTools: boolean;
  /** Whether the model supports image inputs */
  supportsVision: boolean;
  /** Whether the model supports extended thinking/reasoning */
  supportsReasoning: boolean;
  /** Whether the model supports streaming responses */
  supportsStreaming?: boolean;
  /** Price per million input tokens (USD) */
  inputPrice?: number;
  /** Price per million output tokens (USD) */
  outputPrice?: number;
}

// =============================================================================
// Credential Types (Existing)
// =============================================================================

/**
 * Validation result for credential validation
 */
export interface CredentialValidationResult {
  /** Whether the credential is valid */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Warning messages for non-critical issues */
  warnings?: string[];
}

/**
 * Credential type for provider configuration
 * Re-exported from @vellum/core for convenience
 */
export interface ProviderCredential {
  /** Credential type discriminator */
  type: "api_key" | "oauth_token" | "bearer_token" | "service_account" | "certificate";
  /** Credential value (API key, token, etc.) */
  value?: string;
  /** Environment variable name to read from */
  envVar?: string;
  /** Additional type-specific fields */
  [key: string]: unknown;
}

// =============================================================================
// T001: LLM Provider Interface
// =============================================================================

/**
 * Core interface that all LLM providers must implement
 *
 * Provides a unified API for interacting with different LLM services.
 * Implementations handle provider-specific SDK integration, authentication,
 * and response normalization.
 *
 * @example
 * ```typescript
 * class AnthropicProvider implements LLMProvider {
 *   async initialize(options: ProviderOptions): Promise<void> {
 *     this.client = new Anthropic({ apiKey: options.apiKey });
 *   }
 *
 *   async complete(params: CompletionParams): Promise<CompletionResult> {
 *     const response = await this.client.messages.create({ ... });
 *     return normalizeResponse(response);
 *   }
 *
 *   // ... other methods
 * }
 * ```
 */
export interface LLMProvider {
  /**
   * Initialize the provider with configuration options
   *
   * Must be called before using other methods. Sets up the underlying
   * SDK client with authentication and configuration.
   *
   * @param options - Provider configuration including API key and settings
   * @throws Error if initialization fails (invalid credentials, network error)
   */
  initialize(options: ProviderOptions): Promise<void>;

  /**
   * Generate a non-streaming completion
   *
   * @param params - Completion parameters including model, messages, and options
   * @returns Promise resolving to the completion result
   * @throws Error if the provider is not initialized or the request fails
   */
  complete(params: CompletionParams): Promise<CompletionResult>;

  /**
   * Generate a streaming completion
   *
   * Returns an async iterator that yields stream events as they arrive.
   * Supports real-time text display, tool calls, and progress tracking.
   *
   * @param params - Completion parameters including model, messages, and options
   * @returns AsyncIterable of stream events
   * @throws Error if the provider is not initialized or streaming setup fails
   */
  stream(params: CompletionParams): AsyncIterable<StreamEvent>;

  /**
   * Count tokens in the given text or messages
   *
   * Uses the provider's tokenizer to accurately count tokens.
   * Useful for context window management and cost estimation.
   *
   * @param input - Text string or array of messages to count
   * @param model - Optional model ID (some providers have model-specific tokenizers)
   * @returns Promise resolving to the token count
   */
  countTokens(input: string | CompletionMessage[], model?: string): Promise<number>;

  /**
   * List available models for this provider
   *
   * Returns detailed information about each model including capabilities
   * and pricing. Can be used for model selection UI or validation.
   *
   * @returns Promise resolving to array of model information
   */
  listModels(): Promise<ModelInfo[]>;

  /**
   * Validate a credential without configuring the provider
   *
   * Performs format validation and optionally makes a lightweight API
   * call to verify the credential works. Does not store the credential.
   *
   * @param credential - The credential to validate
   * @returns Validation result with success/failure and any errors/warnings
   */
  validateCredential(credential: ProviderCredential): Promise<CredentialValidationResult>;

  /**
   * Check if the provider has been successfully initialized
   *
   * @returns true if initialize() has been called successfully
   */
  isInitialized(): boolean;
}

// =============================================================================
// Legacy Provider Interface (Backward Compatibility)
// =============================================================================

/**
 * Legacy provider interface for backward compatibility with Vercel AI SDK integration
 *
 * @deprecated Use LLMProvider interface for new implementations.
 * This interface is maintained for existing code that uses the Vercel AI SDK pattern.
 */
export interface Provider {
  name: ProviderType;
  createModel(modelId: string): LanguageModel;
  listModels(): string[];
  getDefaultModel(): string;

  /**
   * Configure the provider with credentials
   *
   * @param credential - The credential to configure the provider with
   * @throws Error if credential is invalid or configuration fails
   */
  configure?(credential: ProviderCredential): Promise<void>;

  /**
   * Check if the provider is configured with valid credentials
   *
   * @returns true if the provider has valid credentials configured
   */
  isConfigured?(): boolean;

  /**
   * Validate a credential without configuring the provider
   *
   * @param credential - The credential to validate
   * @returns Validation result with success/failure and any errors
   */
  validateCredential?(credential: ProviderCredential): Promise<CredentialValidationResult>;
}
