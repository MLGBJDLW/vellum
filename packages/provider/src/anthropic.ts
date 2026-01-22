/**
 * Anthropic Provider Implementation
 *
 * Native implementation using @anthropic-ai/sdk.
 * Supports:
 * - Non-streaming and streaming completions
 * - Tool/function calling
 * - Extended thinking (reasoning)
 * - Token counting
 *
 * @module @vellum/provider/anthropic
 */

import type { APIError } from "@anthropic-ai/sdk";
import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  Message,
  MessageCreateParams,
  RawMessageStreamEvent,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { ErrorCode } from "@vellum/shared";
import { createProviderError, ProviderError } from "./errors.js";
import type { ReasoningEffort } from "./models/index.js";
import { getModelInfo } from "./models/index.js";
import { ANTHROPIC_MODELS } from "./models/providers/anthropic.js";
import { anthropicTransform } from "./transforms/anthropic.js";
import { stripSchemaMetaFields } from "./transforms/schema-sanitizer.js";
import type { TransformConfig } from "./transforms/types.js";
import type {
  CompletionMessage,
  CompletionParams,
  CompletionResult,
  CredentialValidationResult,
  LanguageModel,
  LegacyStreamToolCallDeltaEvent,
  ModelInfo,
  Provider,
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
  ToolDefinition,
} from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Anthropic API key format pattern
 * Format: sk-ant-api03-*
 */
const ANTHROPIC_KEY_PATTERN = /^sk-ant-api03-/;

/**
 * Default maximum tokens for completions
 */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Default thinking budget when not specified
 */
const DEFAULT_THINKING_BUDGET = 10000;

const THINKING_BUDGET_BY_EFFORT: Partial<Record<ReasoningEffort, number>> = {
  minimal: 2000,
  low: 5000,
  medium: DEFAULT_THINKING_BUDGET,
  high: 20000,
  xhigh: 40000,
  none: 0,
};

// =============================================================================
// Provider Options
// =============================================================================

/**
 * Options for AnthropicProvider constructor
 */
export interface AnthropicProviderOptions {
  /** API key for Anthropic. If not provided, uses ANTHROPIC_API_KEY env var */
  apiKey?: string;
  /** Base URL override for API endpoint */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

// =============================================================================
// AnthropicProvider Implementation
// =============================================================================

/**
 * LLM Provider implementation for Anthropic Claude models
 *
 * Implements both the new LLMProvider interface and the legacy Provider interface
 * for backward compatibility.
 *
 * @example
 * ```typescript
 * // New interface (LLMProvider)
 * const provider = new AnthropicProvider();
 * await provider.initialize({ apiKey: 'sk-ant-api03-...' });
 * const result = await provider.complete({
 *   model: 'claude-sonnet-4-20250514',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 *
 * // Legacy interface (Provider)
 * const provider = new AnthropicProvider({ apiKey: 'sk-ant-api03-...' });
 * const model = provider.createModel('claude-sonnet-4-20250514');
 * ```
 */
export class AnthropicProvider implements Provider {
  // Legacy Provider interface properties
  readonly name = "anthropic" as const;

  // LLMProvider interface properties
  private client: Anthropic | null = null;
  private initialized = false;
  private apiKey: string | undefined;
  private configured = false;

  /**
   * Create a new AnthropicProvider
   *
   * @param options - Optional configuration (for legacy Provider interface)
   */
  constructor(options?: AnthropicProviderOptions) {
    this.apiKey = options?.apiKey;
    // If apiKey is provided, mark as configured
    // If not provided, SDK will use ANTHROPIC_API_KEY env var
    this.configured = !!this.apiKey || !!process.env.ANTHROPIC_API_KEY;
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
    return "claude-sonnet-4-20250514";
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
      const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;

      if (!apiKey) {
        throw new ProviderError("No API key provided for Anthropic", {
          code: ErrorCode.CREDENTIAL_NOT_FOUND,
          category: "credential_invalid",
          retryable: false,
        });
      }

      this.client = new Anthropic({
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
      throw createProviderError(error, "Failed to initialize Anthropic provider");
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
      const request = this.buildRequest(params);
      const response = await this.client?.messages.create(request);

      return this.normalizeResponse(response as Message);
    } catch (error) {
      throw this.handleError(error, "Completion request failed");
    }
  }

  /**
   * Generate a streaming completion
   *
   * @param params - Completion parameters
   * @returns AsyncIterable of stream events
   * @throws ProviderError if not initialized or streaming fails
   */
  async *stream(params: CompletionParams): AsyncIterable<StreamEvent> {
    this.ensureInitialized();

    try {
      const request = this.buildRequest(params);
      const stream = this.client?.messages.stream(request);

      if (stream) {
        yield* this.processStream(stream);
      }
    } catch (error) {
      throw this.handleError(error, "Streaming request failed");
    }
  }

  /**
   * Count tokens in the given input
   *
   * @param input - Text or messages to count
   * @param model - Optional model ID (defaults to claude-sonnet-4)
   * @returns Promise resolving to token count
   */
  async countTokens(input: string | CompletionMessage[], model?: string): Promise<number> {
    this.ensureInitialized();

    try {
      const modelId = model ?? "claude-sonnet-4-20250514";

      // Convert input to messages format
      const messages: CompletionMessage[] =
        typeof input === "string" ? [{ role: "user", content: input }] : input;

      // Transform messages using the transform layer
      const config = this.createTransformConfig(modelId);
      const { data: transformedMessages } = anthropicTransform.transformMessages(messages, config);

      // Use the Anthropic token counting API
      const result = await this.client?.messages.countTokens({
        model: modelId,
        messages: transformedMessages as Anthropic.MessageParam[],
      });

      return result?.input_tokens ?? 0;
    } catch (_error) {
      // Fall back to estimation if token counting fails
      const text =
        typeof input === "string"
          ? input
          : input.map((m) => (typeof m.content === "string" ? m.content : "")).join(" ");

      // Rough estimation: ~4 characters per token for English
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * List available Anthropic models (synchronous, for legacy Provider interface)
   *
   * @returns Array of model IDs
   */
  listModels(): string[] {
    return ANTHROPIC_MODELS.map((m) => m.id);
  }

  /**
   * List available Anthropic models with full details (async, for LLMProvider interface)
   *
   * @returns Promise resolving to array of ModelInfo
   */
  async listModelsAsync(): Promise<ModelInfo[]> {
    return ANTHROPIC_MODELS;
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
        error: `Anthropic only supports api_key credentials, got: ${credential.type}`,
      };
    }

    const apiKey = this.resolveCredentialValue(credential);
    if (!apiKey) {
      return {
        valid: false,
        error: "No API key value provided and environment variable not set",
      };
    }

    // Format validation (synchronous)
    if (!ANTHROPIC_KEY_PATTERN.test(apiKey)) {
      return {
        valid: false,
        error: "Invalid Anthropic API key format. Expected format: sk-ant-api03-*",
      };
    }

    // Basic validation passed
    // Note: Actual API validation would require making an API call
    return { valid: true };
  }

  /**
   * Validate a credential by making an actual API call
   *
   * This is a more thorough validation that verifies the key works,
   * but incurs an API call cost.
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
      const testClient = new Anthropic({ apiKey });
      await testClient.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1,
        messages: [{ role: "user", content: "test" }],
      });
      return { valid: true };
    } catch (error) {
      // Check if it's an auth error vs other errors
      if (error instanceof Anthropic.AuthenticationError) {
        return {
          valid: false,
          error: "API key authentication failed",
        };
      }
      // Other errors might not indicate invalid credentials
      // e.g., rate limits, server errors
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
   * Create transform config for Anthropic API calls.
   *
   * @param model - Optional model ID for model-specific features
   * @param enableCaching - Whether to enable prompt caching (default: true)
   *
   * @remarks
   * Caching is enabled by default to reduce costs and latency for:
   * - System prompts (reused across requests)
   * - Recent conversation context (likely to be repeated)
   * - Tool definitions (static per session)
   *
   * See: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
   */
  private createTransformConfig(model?: string, enableCaching = true): TransformConfig {
    return {
      provider: "anthropic",
      modelId: model,
      enableCaching,
    };
  }

  private resolveReasoningEffort(
    params: CompletionParams,
    modelInfo: ModelInfo
  ): ReasoningEffort | undefined {
    if (!params.thinking?.enabled) {
      return undefined;
    }

    if (!modelInfo.supportsReasoning) {
      return undefined;
    }

    const supportedEfforts = modelInfo.reasoningEfforts ?? [];
    const requested = params.thinking.reasoningEffort;
    const fallback = modelInfo.defaultReasoningEffort ?? supportedEfforts[0];
    const allowedEfforts =
      supportedEfforts.length > 0 ? supportedEfforts : fallback ? [fallback] : [];

    let resolved: ReasoningEffort | undefined;
    if (requested && allowedEfforts.includes(requested)) {
      resolved = requested;
    } else if (fallback && allowedEfforts.includes(fallback)) {
      resolved = fallback;
    }

    if (resolved === "none") {
      return undefined;
    }

    if (requested && !allowedEfforts.includes(requested)) {
      if (process.env.VELLUM_DEBUG) {
        console.debug(
          `[AnthropicProvider] Reasoning effort '${requested}' not supported by ${params.model}; omitting effort.`
        );
      }
    }

    return resolved;
  }

  /**
   * Resolve thinking configuration if the model supports reasoning.
   */
  private resolveThinkingConfig(params: CompletionParams): { budgetTokens: number } | null {
    if (!params.thinking?.enabled) {
      return null;
    }

    const modelInfo = getModelInfo(this.name, params.model);
    if (!modelInfo.supportsReasoning) {
      if (process.env.VELLUM_DEBUG) {
        console.debug(
          `[AnthropicProvider] Thinking disabled: model ${params.model} does not support reasoning.`
        );
      }
      return null;
    }

    if (params.thinking.reasoningEffort === "none") {
      return null;
    }

    const resolvedEffort = this.resolveReasoningEffort(params, modelInfo);
    const budgetTokens =
      params.thinking.budgetTokens ??
      (resolvedEffort ? THINKING_BUDGET_BY_EFFORT[resolvedEffort] : undefined) ??
      DEFAULT_THINKING_BUDGET;

    return { budgetTokens };
  }

  /**
   * Build the Anthropic API request from completion params
   */
  private buildRequest(params: CompletionParams): MessageCreateParams {
    const config = this.createTransformConfig(params.model);
    const { data: messages, warnings } = anthropicTransform.transformMessages(
      params.messages,
      config
    );

    // Log transform warnings if any
    if (warnings.length > 0) {
      console.warn("[Anthropic] Transform warnings:", warnings);
    }

    // Extract system message if present
    const systemMessage = params.messages.find((m) => m.role === "system");
    const system =
      systemMessage && typeof systemMessage.content === "string"
        ? systemMessage.content
        : undefined;

    // Build base request
    const request: MessageCreateParams = {
      model: params.model,
      messages: messages as Anthropic.MessageParam[],
      max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(system && { system }),
      ...(params.temperature !== undefined && { temperature: params.temperature }),
      ...(params.topP !== undefined && { top_p: params.topP }),
      ...(params.stopSequences && { stop_sequences: params.stopSequences }),
    };

    // Add tools if present
    if (params.tools && params.tools.length > 0) {
      request.tools = this.convertTools(params.tools);
    }

    const thinkingConfig = this.resolveThinkingConfig(params);
    if (thinkingConfig) {
      (
        request as MessageCreateParams & { thinking?: { type: string; budget_tokens: number } }
      ).thinking = {
        type: "enabled",
        budget_tokens: thinkingConfig.budgetTokens,
      };
      // Extended thinking requires temperature = 1
      request.temperature = 1;
    }

    return request;
  }

  /**
   * Convert tool definitions to Anthropic format
   */
  private convertTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: stripSchemaMetaFields(tool.inputSchema) as Anthropic.Tool.InputSchema,
    }));
  }

  /**
   * Normalize Anthropic response to our CompletionResult format
   */
  private normalizeResponse(response: Message): CompletionResult {
    let content = "";
    let thinking = "";
    const toolCalls: CompletionResult["toolCalls"] = [];

    // Process content blocks
    for (const block of response.content) {
      if (block.type === "text") {
        content += (block as TextBlock).text;
      } else if (block.type === "thinking") {
        thinking += (block as ThinkingBlock).thinking;
      } else if (block.type === "tool_use") {
        const toolBlock = block as ToolUseBlock;
        toolCalls.push({
          id: toolBlock.id,
          name: toolBlock.name,
          input: toolBlock.input as Record<string, unknown>,
        });
      }
    }

    // Map stop reason
    const stopReason = this.mapStopReason(response.stop_reason);

    // Build token usage
    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    // Add cache tokens if present
    if ("cache_read_input_tokens" in response.usage) {
      usage.cacheReadTokens = response.usage.cache_read_input_tokens as number;
    }
    if ("cache_creation_input_tokens" in response.usage) {
      usage.cacheWriteTokens = response.usage.cache_creation_input_tokens as number;
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
  private async *processStream(
    stream: ReturnType<Anthropic["messages"]["stream"]>
  ): AsyncIterable<StreamEvent> {
    // Track state for tool calls
    const toolCallState: Map<number, { id: string; name: string; inputJson: string }> = new Map();

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens: number | undefined;
    let cacheWriteTokens: number | undefined;
    let stopReason: StopReason = "end_turn";

    for await (const event of stream) {
      yield* this.processStreamEvent(event, toolCallState);

      // Track usage from message_delta
      if (event.type === "message_delta") {
        const delta = event as RawMessageStreamEvent & {
          type: "message_delta";
          usage?: { output_tokens: number };
          delta?: { stop_reason?: string };
        };

        if (delta.usage) {
          outputTokens = delta.usage.output_tokens;
        }

        if (delta.delta?.stop_reason) {
          stopReason = this.mapStopReason(delta.delta.stop_reason);
        }
      }

      // Get input tokens from message_start
      if (event.type === "message_start") {
        const start = event as RawMessageStreamEvent & {
          type: "message_start";
          message?: {
            usage?: {
              input_tokens: number;
              cache_read_input_tokens?: number;
              cache_creation_input_tokens?: number;
            };
          };
        };

        if (start.message?.usage) {
          inputTokens = start.message.usage.input_tokens;
          if (start.message.usage.cache_read_input_tokens !== undefined) {
            cacheReadTokens = start.message.usage.cache_read_input_tokens;
          }
          if (start.message.usage.cache_creation_input_tokens !== undefined) {
            cacheWriteTokens = start.message.usage.cache_creation_input_tokens;
          }
        }
      }
    }

    // Emit usage event with new flat structure
    const usageEvent: StreamUsageEvent = {
      type: "usage",
      inputTokens,
      outputTokens,
      ...(cacheReadTokens !== undefined && { cacheReadTokens }),
      ...(cacheWriteTokens !== undefined && { cacheWriteTokens }),
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
   * Process a single stream event and yield normalized events
   */
  private *processStreamEvent(
    event: RawMessageStreamEvent,
    toolCallState: Map<number, { id: string; name: string; inputJson: string }>
  ): Generator<StreamEvent> {
    switch (event.type) {
      case "content_block_start": {
        const blockStart = event as RawMessageStreamEvent & {
          type: "content_block_start";
          index: number;
          content_block: ContentBlock;
        };

        if (blockStart.content_block.type === "tool_use") {
          const toolBlock = blockStart.content_block as ToolUseBlock;
          // Initialize tool call state
          toolCallState.set(blockStart.index, {
            id: toolBlock.id,
            name: toolBlock.name,
            inputJson: "",
          });

          // Emit new tool_call_start event
          const startEvent: StreamToolCallStartEvent = {
            type: "tool_call_start",
            id: toolBlock.id,
            name: toolBlock.name,
            index: blockStart.index,
          };
          yield startEvent;

          // Also emit legacy toolCallDelta for backward compatibility
          const legacyDeltaEvent: LegacyStreamToolCallDeltaEvent = {
            type: "toolCallDelta",
            id: toolBlock.id,
            name: toolBlock.name,
            inputDelta: "",
          };
          yield legacyDeltaEvent;
        }
        break;
      }

      case "content_block_delta": {
        const blockDelta = event as RawMessageStreamEvent & {
          type: "content_block_delta";
          index: number;
          delta: { type: string; text?: string; thinking?: string; partial_json?: string };
        };

        if (blockDelta.delta.type === "text_delta" && blockDelta.delta.text) {
          const textEvent: StreamTextEvent = {
            type: "text",
            content: blockDelta.delta.text,
            index: blockDelta.index,
          };
          yield textEvent;
        } else if (blockDelta.delta.type === "thinking_delta" && blockDelta.delta.thinking) {
          const reasoningEvent: StreamReasoningEvent = {
            type: "reasoning",
            content: blockDelta.delta.thinking,
            index: blockDelta.index,
          };
          yield reasoningEvent;
        } else if (blockDelta.delta.type === "input_json_delta" && blockDelta.delta.partial_json) {
          const state = toolCallState.get(blockDelta.index);
          if (state) {
            state.inputJson += blockDelta.delta.partial_json;

            // Emit new tool_call_delta event
            const deltaEvent: StreamToolCallDeltaEvent = {
              type: "tool_call_delta",
              id: state.id,
              arguments: blockDelta.delta.partial_json,
              index: blockDelta.index,
            };
            yield deltaEvent;

            // Also emit legacy toolCallDelta for backward compatibility
            const legacyDeltaEvent: LegacyStreamToolCallDeltaEvent = {
              type: "toolCallDelta",
              id: state.id,
              inputDelta: blockDelta.delta.partial_json,
            };
            yield legacyDeltaEvent;
          }
        }
        break;
      }

      case "content_block_stop": {
        const blockStop = event as RawMessageStreamEvent & {
          type: "content_block_stop";
          index: number;
        };

        // Emit complete tool call when block ends
        const state = toolCallState.get(blockStop.index);
        if (state) {
          // Emit new tool_call_end event
          const endEvent: StreamToolCallEndEvent = {
            type: "tool_call_end",
            id: state.id,
            index: blockStop.index,
          };
          yield endEvent;

          // Also emit legacy toolCall for backward compatibility
          try {
            const input = state.inputJson ? JSON.parse(state.inputJson) : {};
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
          toolCallState.delete(blockStop.index);
        }
        break;
      }
    }
  }

  /**
   * Map Anthropic stop reason to our StopReason type
   */
  private mapStopReason(reason: string | null | undefined): StopReason {
    switch (reason) {
      case "end_turn":
        return "end_turn";
      case "max_tokens":
        return "max_tokens";
      case "stop_sequence":
        return "stop_sequence";
      case "tool_use":
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

    // Handle Anthropic SDK errors
    if (error instanceof Anthropic.APIError) {
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
   * Map Anthropic API error to our error code
   */
  private mapApiErrorCode(error: APIError): ErrorCode {
    if (error instanceof Anthropic.AuthenticationError) {
      return ErrorCode.CREDENTIAL_VALIDATION_FAILED;
    }
    if (error instanceof Anthropic.RateLimitError) {
      return ErrorCode.RATE_LIMITED;
    }
    if (error instanceof Anthropic.BadRequestError) {
      return ErrorCode.INVALID_ARGUMENT;
    }
    if (error instanceof Anthropic.NotFoundError) {
      return ErrorCode.PROVIDER_NOT_FOUND;
    }
    if (error.status !== undefined && error.status >= 500) {
      return ErrorCode.SERVICE_UNAVAILABLE;
    }
    return ErrorCode.API_ERROR;
  }

  /**
   * Map Anthropic API error to our error category
   */
  private mapApiErrorCategory(error: APIError): ProviderError["category"] {
    if (error instanceof Anthropic.AuthenticationError) {
      return "credential_invalid";
    }
    if (error instanceof Anthropic.RateLimitError) {
      return "rate_limited";
    }
    return "api_error";
  }

  /**
   * Check if an Anthropic API error is retryable
   */
  private isApiErrorRetryable(error: APIError): boolean {
    if (error instanceof Anthropic.RateLimitError) {
      return true;
    }
    if (error.status !== undefined && error.status >= 500) {
      return true;
    }
    return false;
  }

  /**
   * Get retry delay for Anthropic API error
   */
  private getApiErrorRetryDelay(error: APIError): number | undefined {
    if (error instanceof Anthropic.RateLimitError) {
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
