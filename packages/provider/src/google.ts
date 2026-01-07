/**
 * Google Provider Implementation
 *
 * Native implementation using @google/genai SDK.
 * Supports:
 * - Non-streaming and streaming completions
 * - Tool/function calling
 * - Token counting
 *
 * @module @vellum/provider/google
 */

import {
  type Content,
  type FunctionDeclaration,
  type GenerateContentConfig,
  type GenerateContentResponse,
  GoogleGenAI,
  type Part,
  type Tool,
} from "@google/genai";
import { ErrorCode } from "@vellum/shared";
import { createProviderError, ProviderError } from "./errors.js";
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
 * Google AI API key format pattern
 * Format: AIza*
 */
const GOOGLE_KEY_PATTERN = /^AIza/;

/**
 * Default maximum tokens for completions
 */
const DEFAULT_MAX_TOKENS = 8192;

/**
 * Model information for Google Gemini models
 */
const GOOGLE_MODELS: ModelInfo[] = [
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    contextWindow: 1048576, // 1M tokens
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    inputPrice: 1.25, // per million input tokens (<=200K)
    outputPrice: 10.0, // per million output tokens (<=200K)
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    contextWindow: 1048576, // 1M tokens
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    inputPrice: 0.15, // per million input tokens (<=200K)
    outputPrice: 0.6, // per million output tokens (<=200K, non-thinking)
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "google",
    contextWindow: 2097152, // 2M tokens
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    inputPrice: 1.25,
    outputPrice: 5.0,
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    provider: "google",
    contextWindow: 1048576, // 1M tokens
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    inputPrice: 0.075,
    outputPrice: 0.3,
  },
  {
    id: "gemini-1.5-flash-8b",
    name: "Gemini 1.5 Flash 8B",
    provider: "google",
    contextWindow: 1048576, // 1M tokens
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    inputPrice: 0.0375,
    outputPrice: 0.15,
  },
];

// =============================================================================
// Provider Options
// =============================================================================

/**
 * Options for GoogleProvider constructor
 */
export interface GoogleProviderOptions {
  /** API key for Google AI. If not provided, uses GOOGLE_GENERATIVE_AI_API_KEY env var */
  apiKey?: string;
  /** Base URL override for API endpoint */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

// =============================================================================
// GoogleProvider Implementation
// =============================================================================

/**
 * LLM Provider implementation for Google Gemini models
 *
 * Implements both the new LLMProvider interface and the legacy Provider interface
 * for backward compatibility.
 *
 * @example
 * ```typescript
 * // New interface (LLMProvider)
 * const provider = new GoogleProvider();
 * await provider.initialize({ apiKey: 'AIza...' });
 * const result = await provider.complete({
 *   model: 'gemini-2.5-pro',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 *
 * // Legacy interface (Provider)
 * const provider = new GoogleProvider({ apiKey: 'AIza...' });
 * const model = provider.createModel('gemini-2.5-pro');
 * ```
 */
export class GoogleProvider implements Provider {
  // Legacy Provider interface properties
  readonly name = "google" as const;

  // LLMProvider interface properties
  private client: GoogleGenAI | null = null;
  private initialized = false;
  private apiKey: string | undefined;
  private configured = false;

  /**
   * Create a new GoogleProvider
   *
   * @param options - Optional configuration (for legacy Provider interface)
   */
  constructor(options?: GoogleProviderOptions) {
    this.apiKey = options?.apiKey;
    // If apiKey is provided, mark as configured
    // If not provided, SDK will use GOOGLE_GENERATIVE_AI_API_KEY env var
    this.configured = !!this.apiKey || !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
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
    return "gemini-2.5-flash";
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
      const apiKey = options.apiKey ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;

      if (!apiKey) {
        throw new ProviderError("No API key provided for Google AI", {
          code: ErrorCode.CREDENTIAL_NOT_FOUND,
          category: "credential_invalid",
          retryable: false,
        });
      }

      this.client = new GoogleGenAI({ apiKey });

      this.apiKey = apiKey;
      this.initialized = true;
      this.configured = true;
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw createProviderError(error, "Failed to initialize Google provider");
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
      const { contents, config } = this.buildRequest(params);

      const response = await this.client?.models.generateContent({
        model: params.model,
        contents,
        config,
      });

      if (!response) {
        throw new ProviderError("No response from Google API", {
          code: ErrorCode.API_ERROR,
          category: "api_error",
          retryable: true,
        });
      }

      return this.normalizeResponse(response);
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
      const { contents, config } = this.buildRequest(params);

      const stream = await this.client?.models.generateContentStream({
        model: params.model,
        contents,
        config,
      });

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
   * @param model - Optional model ID (defaults to gemini-2.5-flash)
   * @returns Promise resolving to token count
   */
  async countTokens(input: string | CompletionMessage[], model?: string): Promise<number> {
    this.ensureInitialized();

    try {
      const modelId = model ?? "gemini-2.5-flash";

      // Convert input to contents format
      const contents: Content[] =
        typeof input === "string"
          ? [{ role: "user", parts: [{ text: input }] }]
          : this.convertMessages(input);

      const result = await this.client?.models.countTokens({
        model: modelId,
        contents,
      });

      return result?.totalTokens ?? 0;
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
   * List available Google models (synchronous, for legacy Provider interface)
   *
   * @returns Array of model IDs
   */
  listModels(): string[] {
    return GOOGLE_MODELS.map((m) => m.id);
  }

  /**
   * List available Google models with full details (async, for LLMProvider interface)
   *
   * @returns Promise resolving to array of ModelInfo
   */
  async listModelsAsync(): Promise<ModelInfo[]> {
    return GOOGLE_MODELS;
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
        error: `Google AI only supports api_key credentials, got: ${credential.type}`,
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
    if (!GOOGLE_KEY_PATTERN.test(apiKey)) {
      return {
        valid: false,
        error: "Invalid Google AI API key format. Expected format: AIza*",
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
      const testClient = new GoogleGenAI({ apiKey });
      await testClient.models.generateContent({
        model: "gemini-1.5-flash-8b",
        contents: [{ role: "user", parts: [{ text: "test" }] }],
        config: { maxOutputTokens: 1 },
      });
      return { valid: true };
    } catch (error) {
      // Check if it's an auth error vs other errors
      if (this.isAuthError(error)) {
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
   * Build the Google API request from completion params
   */
  private buildRequest(params: CompletionParams): {
    contents: Content[];
    config: GenerateContentConfig;
  } {
    const contents = this.convertMessages(params.messages);

    // Extract system instruction if present
    const systemMessage = params.messages.find((m) => m.role === "system");
    const systemInstruction =
      systemMessage && typeof systemMessage.content === "string"
        ? systemMessage.content
        : undefined;

    // Build config
    const config: GenerateContentConfig = {
      maxOutputTokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(systemInstruction && { systemInstruction }),
      ...(params.temperature !== undefined && { temperature: params.temperature }),
      ...(params.topP !== undefined && { topP: params.topP }),
      ...(params.stopSequences && { stopSequences: params.stopSequences }),
      ...(params.presencePenalty !== undefined && { presencePenalty: params.presencePenalty }),
      ...(params.frequencyPenalty !== undefined && { frequencyPenalty: params.frequencyPenalty }),
    };

    // Add tools if present
    if (params.tools && params.tools.length > 0) {
      config.tools = this.convertTools(params.tools);
    }

    return { contents, config };
  }

  /**
   * Convert our message format to Google format
   */
  private convertMessages(messages: CompletionMessage[]): Content[] {
    return messages
      .filter((m) => m.role !== "system") // System handled separately
      .map((m) => this.convertMessage(m));
  }

  /**
   * Convert a single message to Google format
   */
  private convertMessage(message: CompletionMessage): Content {
    const role = message.role === "assistant" ? "model" : "user";

    if (typeof message.content === "string") {
      return { role, parts: [{ text: message.content }] };
    }

    // Convert content parts to Google format
    const parts: Part[] = message.content.map((part) => {
      switch (part.type) {
        case "text":
          return { text: part.text };

        case "image":
          return {
            inlineData: {
              mimeType: part.mimeType,
              data: part.source,
            },
          };

        case "tool_use":
          return {
            functionCall: {
              name: part.name,
              args: part.input,
            },
          };

        case "tool_result":
          return {
            functionResponse: {
              name: part.toolUseId, // Google uses name, we map from toolUseId
              response: {
                result: typeof part.content === "string" ? part.content : part.content,
              },
            },
          };

        default:
          throw new ProviderError(`Unknown content part type: ${(part as { type: string }).type}`, {
            code: ErrorCode.INVALID_ARGUMENT,
            category: "api_error",
            retryable: false,
          });
      }
    });

    return { role, parts };
  }

  /**
   * Convert tool definitions to Google format
   */
  private convertTools(tools: ToolDefinition[]): Tool[] {
    const functionDeclarations: FunctionDeclaration[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema as FunctionDeclaration["parameters"],
    }));

    return [{ functionDeclarations }];
  }

  /**
   * Normalize Google response to our CompletionResult format
   */
  private normalizeResponse(response: GenerateContentResponse): CompletionResult {
    let content = "";
    const toolCalls: ToolCall[] = [];

    // Process candidates
    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if ("text" in part && part.text) {
          content += part.text;
        } else if ("functionCall" in part && part.functionCall) {
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            name: part.functionCall.name ?? "",
            input: (part.functionCall.args ?? {}) as Record<string, unknown>,
          });
        }
      }
    }

    // Map finish reason to stop reason
    const stopReason = this.mapFinishReason(candidate?.finishReason);

    // Build token usage
    const usage: TokenUsage = {
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };

    // Add thinking tokens if present (for 2.5 models with thinking)
    if (response.usageMetadata && "thoughtsTokenCount" in response.usageMetadata) {
      usage.thinkingTokens = (
        response.usageMetadata as { thoughtsTokenCount?: number }
      ).thoughtsTokenCount;
    }

    return {
      content,
      usage,
      stopReason,
      ...(toolCalls.length > 0 && { toolCalls }),
    };
  }

  /**
   * Process streaming response and yield normalized events
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Stream processing requires handling multiple content types and tool calls
  private async *processStream(
    stream: AsyncIterable<GenerateContentResponse>
  ): AsyncIterable<StreamEvent> {
    // Track state for tool calls
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: StopReason = "end_turn";
    let toolCallIndex = 0;

    for await (const chunk of stream) {
      const candidate = chunk.candidates?.[0];

      // Process content parts
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if ("text" in part && part.text) {
            const textEvent: StreamTextEvent = {
              type: "text",
              content: part.text,
            };
            yield textEvent;
          } else if ("functionCall" in part && part.functionCall) {
            const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            const name = part.functionCall.name ?? "";
            const args = part.functionCall.args ?? {};
            const currentIndex = toolCallIndex++;

            // Emit new format tool_call_start event
            const startEvent: StreamToolCallStartEvent = {
              type: "tool_call_start",
              id: callId,
              name,
              index: currentIndex,
            };
            yield startEvent;

            // Emit new format tool_call_delta event
            const newDeltaEvent: StreamToolCallDeltaEvent = {
              type: "tool_call_delta",
              id: callId,
              arguments: JSON.stringify(args),
              index: currentIndex,
            };
            yield newDeltaEvent;

            // Also emit legacy toolCallDelta for backward compatibility
            const legacyDeltaEvent: LegacyStreamToolCallDeltaEvent = {
              type: "toolCallDelta",
              id: callId,
              name,
              inputDelta: JSON.stringify(args),
            };
            yield legacyDeltaEvent;

            // Emit new format tool_call_end event
            const endEvent: StreamToolCallEndEvent = {
              type: "tool_call_end",
              id: callId,
              index: currentIndex,
            };
            yield endEvent;

            // Also emit legacy toolCall for backward compatibility
            const toolCallEvent: StreamToolCallEvent = {
              type: "toolCall",
              id: callId,
              name,
              input: args as Record<string, unknown>,
            };
            yield toolCallEvent;
          }
        }
      }

      // Track finish reason
      if (candidate?.finishReason) {
        stopReason = this.mapFinishReason(candidate.finishReason);
      }

      // Track usage metadata
      if (chunk.usageMetadata) {
        inputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
        outputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
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
   * Map Google finish reason to our StopReason type
   */
  private mapFinishReason(reason: string | undefined | null): StopReason {
    switch (reason) {
      case "STOP":
        return "end_turn";
      case "MAX_TOKENS":
        return "max_tokens";
      case "STOP_SEQUENCE":
        return "stop_sequence";
      case "TOOL_USE":
      case "FUNCTION_CALL":
        return "tool_use";
      case "SAFETY":
      case "BLOCKLIST":
      case "PROHIBITED_CONTENT":
        return "content_filter";
      default:
        return "end_turn";
    }
  }

  /**
   * Check if an error is an authentication error
   */
  private isAuthError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("api key") ||
        message.includes("authentication") ||
        message.includes("unauthorized") ||
        message.includes("invalid_api_key") ||
        message.includes("permission denied")
      );
    }
    return false;
  }

  /**
   * Handle and wrap errors appropriately
   */
  private handleError(error: unknown, context: string): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }

    // Handle Google SDK errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Authentication errors
      if (this.isAuthError(error)) {
        return new ProviderError(`${context}: ${error.message}`, {
          code: ErrorCode.CREDENTIAL_VALIDATION_FAILED,
          category: "credential_invalid",
          retryable: false,
          cause: error,
        });
      }

      // Rate limit errors
      if (message.includes("rate") || message.includes("quota") || message.includes("429")) {
        return new ProviderError(`${context}: ${error.message}`, {
          code: ErrorCode.RATE_LIMITED,
          category: "rate_limited",
          retryable: true,
          cause: error,
          retryDelayMs: 1000,
        });
      }

      // Context overflow
      if (message.includes("token") && (message.includes("limit") || message.includes("exceed"))) {
        return new ProviderError(`${context}: ${error.message}`, {
          code: ErrorCode.CONTEXT_OVERFLOW,
          category: "context_overflow",
          retryable: false,
          cause: error,
        });
      }

      // Safety/content filter
      if (
        message.includes("safety") ||
        message.includes("blocked") ||
        message.includes("prohibited")
      ) {
        return new ProviderError(`${context}: ${error.message}`, {
          code: ErrorCode.API_ERROR,
          category: "content_filter",
          retryable: false,
          cause: error,
        });
      }
    }

    return createProviderError(error, context);
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
