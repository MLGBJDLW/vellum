/**
 * OpenAI Provider Implementation
 *
 * Native implementation using openai SDK.
 * Supports:
 * - Non-streaming and streaming completions
 * - Tool/function calling
 * - Token counting (estimation)
 * - O-series reasoning models (o1, o3) with special handling
 *
 * @module @vellum/provider/openai
 */

import { ErrorCode } from "@vellum/shared";
import type { APIError } from "openai";
import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { createProviderError, ProviderError } from "./errors.js";
import { OPENAI_MODELS } from "./models/providers/openai.js";
import { openaiTransform } from "./transforms/openai.js";
import type { TransformConfig } from "./transforms/types.js";
import type {
  CompletionMessage,
  CompletionParams,
  CompletionResult,
  CredentialValidationResult,
  LanguageModel,
  LegacyStreamToolCallDeltaEvent,
  ModelInfo,
  ProviderCredential,
  ProviderOptions,
  StopReason,
  StreamDoneEvent,
  StreamEndEvent,
  StreamEvent,
  StreamReasoningEvent,
  StreamTextEvent,
  StreamToolCallDeltaEvent,
  StreamToolCallEndEvent,
  StreamToolCallEvent,
  StreamToolCallStartEvent,
  StreamUsageEvent,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * OpenAI API key format patterns
 * Format: sk-* (legacy) or sk-proj-* (project keys)
 */
const OPENAI_KEY_PATTERN = /^sk-/;
const OPENAI_PROJECT_KEY_PATTERN = /^sk-proj-/;

/**
 * O-series reasoning model pattern
 * Matches: o1, o1-mini, o1-preview, o1-pro, o3, o3-mini
 */
const O_SERIES_MODEL_PATTERN = /^o[13](-|$)/;

/**
 * Default maximum tokens for completions
 */
const DEFAULT_MAX_TOKENS = 4096;

// =============================================================================
// Provider Options
// =============================================================================

/**
 * Options for OpenAIProvider constructor
 */
export interface OpenAIProviderOptions {
  /** API key for OpenAI. If not provided, uses OPENAI_API_KEY env var */
  apiKey?: string;
  /** Base URL override for API endpoint */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Organization ID for API requests */
  organization?: string;
}

// =============================================================================
// OpenAIProvider Implementation
// =============================================================================

/**
 * LLM Provider implementation for OpenAI models
 *
 * Implements both the new LLMProvider interface and the legacy Provider interface
 * for backward compatibility.
 *
 * @example
 * ```typescript
 * // New interface (LLMProvider)
 * const provider = new OpenAIProvider();
 * await provider.initialize({ apiKey: 'sk-...' });
 * const result = await provider.complete({
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 *
 * // Legacy interface (Provider)
 * const provider = new OpenAIProvider({ apiKey: 'sk-...' });
 * const model = provider.createModel('gpt-4o');
 * ```
 */
export class OpenAIProvider {
  // Legacy Provider interface properties (for backward compatibility)
  readonly name = "openai" as const;

  // LLMProvider interface properties
  private client: OpenAI | null = null;
  private initialized = false;
  private apiKey: string | undefined;
  private configured = false;

  /**
   * Create a new OpenAIProvider
   *
   * @param options - Optional configuration (for legacy Provider interface)
   */
  constructor(options?: OpenAIProviderOptions) {
    this.apiKey = options?.apiKey;
    // If apiKey is provided, mark as configured
    // If not provided, SDK will use OPENAI_API_KEY env var
    this.configured = !!this.apiKey || !!process.env.OPENAI_API_KEY;
  }

  // ===========================================================================
  // Legacy Provider Interface Methods
  // ===========================================================================

  /**
   * Create a Vercel AI SDK compatible language model (Legacy)
   *
   * @param modelId - Model ID to create
   * @returns LanguageModel instance
   * @deprecated Vercel AI SDK integration has been removed. Use native provider methods instead.
   * @throws Error always - this method is no longer supported
   */
  createModel(_modelId: string): LanguageModel {
    throw new Error(
      "createModel() is deprecated. Vercel AI SDK integration has been removed. " +
        "Use native provider methods like complete() and stream() instead."
    );
  }

  /**
   * Get the default model ID (Legacy)
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return "gpt-4o";
  }

  /**
   * Check if the provider is configured (Legacy)
   *
   * @returns true if configured with credentials
   */
  isConfigured(): boolean {
    return this.configured;
  }

  /**
   * Configure the provider with credentials (Legacy)
   *
   * @param credential - The credential to configure with
   * @throws Error if credential is invalid
   */
  async configure(credential: ProviderCredential): Promise<void> {
    const validation = await this.validateCredential(credential);
    if (!validation.valid) {
      throw new Error(validation.error || "Invalid credential");
    }

    const apiKey = this.resolveCredentialValue(credential);
    if (!apiKey) {
      throw new Error("Could not resolve API key from credential");
    }

    this.apiKey = apiKey;
    this.configured = true;
  }

  // ===========================================================================
  // LLMProvider Interface Methods
  // ===========================================================================

  /**
   * Initialize the provider with configuration options
   *
   * @param options - Provider configuration including API key
   * @throws ProviderError if initialization fails
   */
  async initialize(options: ProviderOptions): Promise<void> {
    try {
      const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

      if (!apiKey) {
        throw new ProviderError("No API key provided for OpenAI", {
          code: ErrorCode.CREDENTIAL_NOT_FOUND,
          category: "credential_invalid",
          retryable: false,
        });
      }

      this.client = new OpenAI({
        apiKey,
        baseURL: options.baseUrl,
        timeout: options.timeout ?? 60000,
        defaultHeaders: options.headers,
      });

      this.apiKey = apiKey;
      this.initialized = true;
      this.configured = true;
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw createProviderError(error, "Failed to initialize OpenAI provider");
    }
  }

  /**
   * Check if the provider has been initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.client !== null;
  }

  /**
   * Generate a non-streaming completion
   *
   * @param params - Completion parameters
   * @returns Promise resolving to completion result
   * @throws ProviderError if not initialized or request fails
   */
  async complete(params: CompletionParams): Promise<CompletionResult> {
    this.ensureInitialized();

    try {
      const isOSeries = this.isOSeriesModel(params.model);
      const request = this.buildRequest(params, isOSeries);
      const response = await this.client?.chat.completions.create(request);

      return this.normalizeResponse(response as ChatCompletion, isOSeries);
    } catch (error) {
      throw this.handleError(error, "Completion request failed");
    }
  }

  /**
   * Generate a streaming completion
   *
   * For O-series models (o1, o3), this falls back to non-streaming
   * and yields the result as a single response.
   *
   * @param params - Completion parameters
   * @returns AsyncIterable of stream events
   * @throws ProviderError if not initialized or streaming fails
   */
  async *stream(params: CompletionParams): AsyncIterable<StreamEvent> {
    this.ensureInitialized();

    const isOSeries = this.isOSeriesModel(params.model);

    // O-series models don't support streaming - fall back to non-streaming
    if (isOSeries) {
      yield* this.streamOSeriesFallback(params);
      return;
    }

    try {
      const request = this.buildStreamingRequest(params);
      const stream = await this.client?.chat.completions.create(request);

      yield* this.processStream(stream as AsyncIterable<ChatCompletionChunk>);
    } catch (error) {
      throw this.handleError(error, "Streaming request failed");
    }
  }

  /**
   * Count tokens in the given input
   *
   * Uses estimation (length/4) as a fallback since tiktoken
   * requires additional dependencies.
   *
   * @param input - Text or messages to count
   * @param _model - Model ID (unused, for interface compatibility)
   * @returns Promise resolving to token count
   */
  async countTokens(input: string | CompletionMessage[], _model?: string): Promise<number> {
    // Convert input to text
    const text =
      typeof input === "string"
        ? input
        : input
            .map((m) => {
              if (typeof m.content === "string") {
                return m.content;
              }
              return m.content
                .map((part) => {
                  if (part.type === "text") {
                    return part.text;
                  }
                  return "";
                })
                .join(" ");
            })
            .join(" ");

    // Rough estimation: ~4 characters per token for English
    // This is a conservative estimate; actual tokenization varies by model
    return Math.ceil(text.length / 4);
  }

  /**
   * List available OpenAI models (synchronous, for legacy Provider interface)
   *
   * @returns Array of model IDs
   */
  listModels(): string[] {
    return OPENAI_MODELS.map((m) => m.id);
  }

  /**
   * List available OpenAI models with full details
   *
   * @returns Promise resolving to array of ModelInfo
   */
  async listModelsAsync(): Promise<ModelInfo[]> {
    return OPENAI_MODELS;
  }

  /**
   * Validate a credential without configuring the provider
   *
   * @param credential - The credential to validate
   * @returns Validation result
   */
  async validateCredential(credential: ProviderCredential): Promise<CredentialValidationResult> {
    // Check credential type
    if (credential.type !== "api_key") {
      return {
        valid: false,
        error: `OpenAI only supports api_key credentials, got: ${credential.type}`,
      };
    }

    const apiKey = this.resolveCredentialValue(credential);
    if (!apiKey) {
      return {
        valid: false,
        error: "No API key value provided and environment variable not set",
      };
    }

    // Format validation
    if (!OPENAI_KEY_PATTERN.test(apiKey)) {
      return {
        valid: false,
        error: "Invalid OpenAI API key format. Expected format: sk-* or sk-proj-*",
      };
    }

    const warnings: string[] = [];
    // Warn about legacy keys (non-project keys)
    if (!OPENAI_PROJECT_KEY_PATTERN.test(apiKey)) {
      warnings.push(
        "Using legacy API key format. Consider using project keys (sk-proj-*) for better security."
      );
    }

    return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
  }

  /**
   * Validate a credential by making an actual API call
   *
   * @param credential - The credential to validate
   * @returns Validation result
   */
  async validateCredentialWithApiCall(
    credential: ProviderCredential
  ): Promise<CredentialValidationResult> {
    // First do format validation
    const formatResult = await this.validateCredential(credential);
    if (!formatResult.valid) {
      return formatResult;
    }

    const apiKey = this.resolveCredentialValue(credential);
    if (!apiKey) {
      return { valid: false, error: "Could not resolve API key" };
    }

    // Make a test API call to verify the key works
    try {
      const testClient = new OpenAI({ apiKey });
      await testClient.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1,
        messages: [{ role: "user", content: "test" }],
      });
      return { valid: true };
    } catch (error) {
      // Check if it's an auth error
      if (error instanceof OpenAI.AuthenticationError) {
        return {
          valid: false,
          error: "API key authentication failed",
        };
      }
      // Other errors might not indicate invalid credentials
      return {
        valid: true,
        warnings: ["Could not verify API key with test request"],
      };
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Ensure the provider is initialized before making requests
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new ProviderError("Provider not initialized. Call initialize() first.", {
        code: ErrorCode.PROVIDER_INITIALIZATION_FAILED,
        category: "api_error",
        retryable: false,
      });
    }
  }

  /**
   * Check if a model is an O-series reasoning model
   */
  private isOSeriesModel(model: string): boolean {
    return O_SERIES_MODEL_PATTERN.test(model);
  }

  /**
   * Create transform config for OpenAI API calls.
   * @param model - Optional model ID for model-specific features
   */
  protected createTransformConfig(model?: string): TransformConfig {
    return {
      provider: "openai",
      modelId: model,
    };
  }

  /**
   * Build the OpenAI API request from completion params
   */
  private buildRequest(
    params: CompletionParams,
    isOSeries: boolean
  ): ChatCompletionCreateParamsNonStreaming {
    const config = this.createTransformConfig(params.model);
    const { data: transformedMessages } = openaiTransform.transformMessages(
      params.messages,
      config
    );
    // Cast to SDK type and handle O-series system message conversion
    const messages = (
      isOSeries
        ? transformedMessages.map((m) => {
            if (m.role === "system") {
              return {
                role: "user" as const,
                content: `[System Instructions]\n${m.content}`,
              };
            }
            return m;
          })
        : transformedMessages
    ) as ChatCompletionMessageParam[];

    // Build base request
    const request: ChatCompletionCreateParamsNonStreaming = {
      model: params.model,
      messages,
      stream: false,
    };

    // O-series models have restrictions
    if (!isOSeries) {
      // Standard models support all parameters
      if (params.maxTokens !== undefined) {
        request.max_tokens = params.maxTokens;
      } else {
        request.max_tokens = DEFAULT_MAX_TOKENS;
      }
      if (params.temperature !== undefined) {
        request.temperature = params.temperature;
      }
      if (params.topP !== undefined) {
        request.top_p = params.topP;
      }
      if (params.presencePenalty !== undefined) {
        request.presence_penalty = params.presencePenalty;
      }
      if (params.frequencyPenalty !== undefined) {
        request.frequency_penalty = params.frequencyPenalty;
      }
      if (params.stopSequences && params.stopSequences.length > 0) {
        request.stop = params.stopSequences;
      }
    } else {
      // O-series: use max_completion_tokens instead of max_tokens
      if (params.maxTokens !== undefined) {
        (
          request as ChatCompletionCreateParamsNonStreaming & { max_completion_tokens?: number }
        ).max_completion_tokens = params.maxTokens;
      }
      // O-series: temperature, top_p, penalties are not supported
      // They are ignored silently
    }

    // Add tools if present (supported by both standard and O-series)
    if (params.tools && params.tools.length > 0) {
      request.tools = this.convertTools(params.tools);
    }

    return request;
  }

  /**
   * Build streaming request
   */
  private buildStreamingRequest(params: CompletionParams): ChatCompletionCreateParamsStreaming {
    const config = this.createTransformConfig(params.model);
    const { data: transformedMessages } = openaiTransform.transformMessages(
      params.messages,
      config
    );
    // Cast to SDK type
    const messages = transformedMessages as ChatCompletionMessageParam[];

    const request: ChatCompletionCreateParamsStreaming = {
      model: params.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (params.maxTokens !== undefined) {
      request.max_tokens = params.maxTokens;
    } else {
      request.max_tokens = DEFAULT_MAX_TOKENS;
    }
    if (params.temperature !== undefined) {
      request.temperature = params.temperature;
    }
    if (params.topP !== undefined) {
      request.top_p = params.topP;
    }
    if (params.presencePenalty !== undefined) {
      request.presence_penalty = params.presencePenalty;
    }
    if (params.frequencyPenalty !== undefined) {
      request.frequency_penalty = params.frequencyPenalty;
    }
    if (params.stopSequences && params.stopSequences.length > 0) {
      request.stop = params.stopSequences;
    }
    if (params.tools && params.tools.length > 0) {
      request.tools = this.convertTools(params.tools);
    }

    return request;
  }

  /**
   * Convert tool definitions to OpenAI format
   */
  private convertTools(tools: ToolDefinition[]): ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * Normalize OpenAI response to our CompletionResult format
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Response normalization requires handling O-series reasoning and tool calls
  private normalizeResponse(response: ChatCompletion, isOSeries: boolean): CompletionResult {
    const choice = response.choices[0];
    if (!choice) {
      throw new ProviderError("No completion choice returned", {
        code: ErrorCode.API_ERROR,
        category: "api_error",
        retryable: false,
      });
    }

    const message = choice.message;
    const content = message.content ?? "";
    let thinking: string | undefined;
    const toolCalls: ToolCall[] = [];

    // Extract reasoning content for O-series models
    if (isOSeries) {
      // O-series models may return reasoning in a separate field
      const messageWithReasoning = message as typeof message & {
        reasoning_content?: string;
      };
      if (messageWithReasoning.reasoning_content) {
        thinking = messageWithReasoning.reasoning_content;
      }
    }

    // Extract tool calls
    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === "function") {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(toolCall.function.arguments);
          } catch {
            // Invalid JSON, use empty object
          }
          toolCalls.push({
            id: toolCall.id,
            name: toolCall.function.name,
            input,
          });
        }
      }
    }

    // Map stop reason
    const stopReason = this.mapStopReason(choice.finish_reason);

    // Build token usage
    const usage: TokenUsage = {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };

    // Add reasoning tokens for O-series if available
    if (isOSeries && response.usage) {
      const usageWithReasoning = response.usage as typeof response.usage & {
        completion_tokens_details?: { reasoning_tokens?: number };
      };
      if (usageWithReasoning.completion_tokens_details?.reasoning_tokens) {
        usage.thinkingTokens = usageWithReasoning.completion_tokens_details.reasoning_tokens;
      }
    }

    return {
      content,
      usage,
      stopReason,
      ...(thinking && { thinking }),
      ...(toolCalls.length > 0 && { toolCalls }),
    };
  }

  /**
   * Process streaming response and yield normalized events
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Stream processing requires handling multiple delta types and tool call accumulation
  private async *processStream(
    stream: AsyncIterable<ChatCompletionChunk>
  ): AsyncIterable<StreamEvent> {
    // Track state for tool calls
    const toolCallState: Map<
      number,
      { id: string; name: string; argumentsJson: string; started: boolean }
    > = new Map();

    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: StopReason = "end_turn";

    for await (const chunk of stream) {
      const choice = chunk.choices[0];

      if (choice) {
        const delta = choice.delta;

        // Handle text content
        if (delta.content) {
          const textEvent: StreamTextEvent = {
            type: "text",
            content: delta.content,
          };
          yield textEvent;
        }

        // Handle tool calls
        if (delta.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;

            // Initialize or get existing state
            let state = toolCallState.get(index);
            const isNewToolCall = !state;

            if (!state) {
              state = {
                id: toolCallDelta.id ?? "",
                name: toolCallDelta.function?.name ?? "",
                argumentsJson: "",
                started: false,
              };
              toolCallState.set(index, state);
            }

            // Update state with deltas
            if (toolCallDelta.id) {
              state.id = toolCallDelta.id;
            }
            if (toolCallDelta.function?.name) {
              state.name = toolCallDelta.function.name;
            }

            // Emit start event on first encounter
            if (isNewToolCall && !state.started) {
              state.started = true;
              const startEvent: StreamToolCallStartEvent = {
                type: "tool_call_start",
                id: state.id,
                name: state.name,
                index,
              };
              yield startEvent;
            }

            if (toolCallDelta.function?.arguments) {
              state.argumentsJson += toolCallDelta.function.arguments;

              // Emit new tool_call_delta event
              const deltaEvent: StreamToolCallDeltaEvent = {
                type: "tool_call_delta",
                id: state.id,
                arguments: toolCallDelta.function.arguments,
                index,
              };
              yield deltaEvent;

              // Also emit legacy toolCallDelta for backward compatibility
              const legacyDeltaEvent: LegacyStreamToolCallDeltaEvent = {
                type: "toolCallDelta",
                id: state.id,
                name: state.name || undefined,
                inputDelta: toolCallDelta.function.arguments,
              };
              yield legacyDeltaEvent;
            }
          }
        }

        // Track finish reason
        if (choice.finish_reason) {
          stopReason = this.mapStopReason(choice.finish_reason);

          // Emit complete tool calls when finished
          for (const [index, state] of toolCallState) {
            // Emit tool_call_end event
            const endEvent: StreamToolCallEndEvent = {
              type: "tool_call_end",
              id: state.id,
              index,
            };
            yield endEvent;

            // Also emit legacy toolCall for backward compatibility
            try {
              const input = state.argumentsJson ? JSON.parse(state.argumentsJson) : {};
              const toolCallEvent: StreamToolCallEvent = {
                type: "toolCall",
                id: state.id,
                name: state.name,
                input,
              };
              yield toolCallEvent;
            } catch {
              // Invalid JSON - emit with empty input
              const toolCallEvent: StreamToolCallEvent = {
                type: "toolCall",
                id: state.id,
                name: state.name,
                input: {},
              };
              yield toolCallEvent;
            }
          }
          toolCallState.clear();
        }
      }

      // Track usage from final chunk
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }
    }

    // Emit usage event with new flat structure
    const usageEvent: StreamUsageEvent = {
      type: "usage",
      inputTokens,
      outputTokens,
    };
    yield usageEvent;

    // Emit new end event
    const endEvent: StreamEndEvent = { type: "end", stopReason };
    yield endEvent;

    // Also emit legacy done event for backward compatibility
    const doneEvent: StreamDoneEvent = { type: "done", stopReason };
    yield doneEvent;
  }

  /**
   * Stream fallback for O-series models (which don't support streaming)
   *
   * Makes a non-streaming request and yields the result as events
   */
  private async *streamOSeriesFallback(params: CompletionParams): AsyncIterable<StreamEvent> {
    try {
      const result = await this.complete(params);

      // Yield text content
      if (result.content) {
        const textEvent: StreamTextEvent = {
          type: "text",
          content: result.content,
        };
        yield textEvent;
      }

      // Yield reasoning content if present
      if (result.thinking) {
        const reasoningEvent: StreamReasoningEvent = {
          type: "reasoning",
          content: result.thinking,
        };
        yield reasoningEvent;
      }

      // Yield tool calls if present
      if (result.toolCalls) {
        for (let index = 0; index < result.toolCalls.length; index++) {
          const toolCall = result.toolCalls[index];
          if (!toolCall) continue;

          // Emit new format events
          const startEvent: StreamToolCallStartEvent = {
            type: "tool_call_start",
            id: toolCall.id,
            name: toolCall.name,
            index,
          };
          yield startEvent;

          const endEvent: StreamToolCallEndEvent = {
            type: "tool_call_end",
            id: toolCall.id,
            index,
          };
          yield endEvent;

          // Also emit legacy toolCall for backward compatibility
          const toolCallEvent: StreamToolCallEvent = {
            type: "toolCall",
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.input,
          };
          yield toolCallEvent;
        }
      }

      // Yield usage with new flat structure
      const usageEvent: StreamUsageEvent = {
        type: "usage",
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        ...(result.usage.cacheReadTokens !== undefined && {
          cacheReadTokens: result.usage.cacheReadTokens,
        }),
        ...(result.usage.cacheWriteTokens !== undefined && {
          cacheWriteTokens: result.usage.cacheWriteTokens,
        }),
      };
      yield usageEvent;

      // Emit new end event
      const streamEndEvent: StreamEndEvent = {
        type: "end",
        stopReason: result.stopReason,
      };
      yield streamEndEvent;

      // Also emit legacy done event for backward compatibility
      const doneEvent: StreamDoneEvent = {
        type: "done",
        stopReason: result.stopReason,
      };
      yield doneEvent;
    } catch (error) {
      throw this.handleError(error, "Streaming request failed (O-series fallback)");
    }
  }

  /**
   * Map OpenAI finish reason to our StopReason type
   */
  private mapStopReason(reason: string | null | undefined): StopReason {
    switch (reason) {
      case "stop":
        return "end_turn";
      case "length":
        return "max_tokens";
      case "tool_calls":
        return "tool_use";
      case "content_filter":
        return "content_filter";
      default:
        return "end_turn";
    }
  }

  /**
   * Handle and wrap errors appropriately
   */
  private handleError(error: unknown, context: string): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }

    // Handle OpenAI SDK errors
    if (error instanceof OpenAI.APIError) {
      return new ProviderError(`${context}: ${error.message}`, {
        code: this.mapApiErrorCode(error),
        category: this.mapApiErrorCategory(error),
        retryable: this.isApiErrorRetryable(error),
        statusCode: error.status,
        cause: error,
        retryDelayMs: this.getApiErrorRetryDelay(error),
      });
    }

    return createProviderError(error, context);
  }

  /**
   * Map OpenAI API error to our error code
   */
  private mapApiErrorCode(error: APIError): ErrorCode {
    if (error instanceof OpenAI.AuthenticationError) {
      return ErrorCode.CREDENTIAL_VALIDATION_FAILED;
    }
    if (error instanceof OpenAI.RateLimitError) {
      return ErrorCode.RATE_LIMITED;
    }
    if (error instanceof OpenAI.BadRequestError) {
      return ErrorCode.INVALID_ARGUMENT;
    }
    if (error instanceof OpenAI.NotFoundError) {
      return ErrorCode.PROVIDER_NOT_FOUND;
    }
    if (error.status !== undefined && error.status >= 500) {
      return ErrorCode.SERVICE_UNAVAILABLE;
    }
    return ErrorCode.API_ERROR;
  }

  /**
   * Map OpenAI API error to our error category
   */
  private mapApiErrorCategory(error: APIError): ProviderError["category"] {
    if (error instanceof OpenAI.AuthenticationError) {
      return "credential_invalid";
    }
    if (error instanceof OpenAI.RateLimitError) {
      return "rate_limited";
    }
    return "api_error";
  }

  /**
   * Check if an OpenAI API error is retryable
   */
  private isApiErrorRetryable(error: APIError): boolean {
    if (error instanceof OpenAI.RateLimitError) {
      return true;
    }
    if (error.status !== undefined && error.status >= 500) {
      return true;
    }
    return false;
  }

  /**
   * Get retry delay for OpenAI API error
   */
  private getApiErrorRetryDelay(error: APIError): number | undefined {
    if (error instanceof OpenAI.RateLimitError) {
      // Check for Retry-After header using the get method
      const retryAfter = error.headers?.get?.("retry-after");
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!Number.isNaN(seconds)) {
          return seconds * 1000;
        }
      }
      return 1000; // Default 1 second for rate limits
    }
    if (error.status !== undefined && error.status >= 500) {
      return 2000; // 2 seconds for server errors
    }
    return undefined;
  }

  /**
   * Resolve credential value from credential object
   */
  private resolveCredentialValue(credential: ProviderCredential): string | undefined {
    if (credential.value) {
      return credential.value;
    }
    if (credential.envVar) {
      return process.env[credential.envVar];
    }
    return undefined;
  }
}
