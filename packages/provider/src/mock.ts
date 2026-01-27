/**
 * MockProvider - Deterministic LLM provider for testing
 *
 * Provides reproducible responses from a script for:
 * - Framework testing
 * - Reproducible evaluation scenarios
 * - Offline development
 *
 * @module @vellum/provider
 */

import type {
  CompletionMessage,
  CompletionParams,
  CompletionResult,
  CredentialValidationResult,
  LLMProvider,
  ModelInfo,
  ProviderCredential,
  ProviderOptions,
  StopReason,
  StreamEndEvent,
  StreamEvent,
  StreamTextEvent,
  StreamToolCallEndEvent,
  StreamToolCallStartEvent,
  StreamUsageEvent,
  TokenUsage,
  ToolCall,
} from "./types.js";

// =============================================================================
// Mock Types
// =============================================================================

/**
 * Mock response for deterministic testing
 */
export interface MockResponse {
  /** Text content to return */
  content: string;
  /** Optional tool calls to simulate */
  toolCalls?: ToolCall[];
  /** Optional token usage to report */
  tokenUsage?: TokenUsage;
  /** Optional delay in ms to simulate latency */
  delay?: number;
  /** Optional stop reason (defaults to 'end_turn') */
  stopReason?: StopReason;
  /** Optional thinking/reasoning content */
  thinking?: string;
}

/**
 * Mock script - sequence of responses
 */
export interface MockScript {
  /** Ordered list of responses to return */
  responses: MockResponse[];
  /** Whether to cycle responses when exhausted (default: false, returns last) */
  cycle?: boolean;
}

// =============================================================================
// MockProvider Implementation
// =============================================================================

/**
 * MockProvider returns deterministic responses from a script
 *
 * Implements the full LLMProvider interface for seamless integration
 * with the provider registry and agent systems.
 *
 * @example
 * ```typescript
 * const provider = new MockProvider({
 *   responses: [
 *     { content: 'Hello!' },
 *     { content: 'How can I help?', toolCalls: [...] }
 *   ]
 * });
 *
 * await provider.initialize({});
 * const result = await provider.complete({ model: 'mock', messages: [] });
 * console.log(result.content); // 'Hello!'
 * ```
 */
export class MockProvider implements LLMProvider {
  private script: MockScript;
  private currentIndex: number = 0;
  private initialized: boolean = false;

  constructor(script: MockScript) {
    this.script = script;
  }

  // ===========================================================================
  // LLMProvider Interface Implementation
  // ===========================================================================

  /**
   * Initialize the mock provider
   */
  async initialize(_options: ProviderOptions): Promise<void> {
    this.initialized = true;
  }

  /**
   * Check if provider is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Generate a non-streaming completion
   */
  async complete(_params: CompletionParams): Promise<CompletionResult> {
    const response = this.getNextResponse();

    // Simulate network delay if specified
    if (response.delay && response.delay > 0) {
      await this.delay(response.delay);
    }

    return {
      content: response.content,
      usage: response.tokenUsage ?? this.defaultTokenUsage(),
      stopReason: response.stopReason ?? (response.toolCalls?.length ? "tool_use" : "end_turn"),
      thinking: response.thinking,
      toolCalls: response.toolCalls,
    };
  }

  /**
   * Generate a streaming completion
   */
  async *stream(_params: CompletionParams): AsyncIterable<StreamEvent> {
    const response = this.getNextResponse();

    // Simulate initial delay
    if (response.delay && response.delay > 0) {
      await this.delay(response.delay);
    }

    // Emit text content in chunks
    if (response.content) {
      const chunkSize = 20;
      for (let i = 0; i < response.content.length; i += chunkSize) {
        const textEvent: StreamTextEvent = {
          type: "text",
          content: response.content.slice(i, i + chunkSize),
          index: 0,
        };
        yield textEvent;
        // Small delay between chunks for realistic streaming
        await this.delay(10);
      }
    }

    // Emit tool calls if any
    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolCalls = response.toolCalls;
      for (let i = 0; i < toolCalls.length; i++) {
        const toolCall = toolCalls[i];
        if (!toolCall) {
          continue;
        }

        // Tool call start
        const startEvent: StreamToolCallStartEvent = {
          type: "tool_call_start",
          id: toolCall.id,
          name: toolCall.name,
          index: i + 1, // index 0 is for text content
        };
        yield startEvent;

        // Tool call end (arguments are complete)
        const endEvent: StreamToolCallEndEvent = {
          type: "tool_call_end",
          id: toolCall.id,
          index: i + 1,
        };
        yield endEvent;
      }
    }

    // Emit usage event
    const usage = response.tokenUsage ?? this.defaultTokenUsage();
    const usageEvent: StreamUsageEvent = {
      type: "usage",
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
    };
    yield usageEvent;

    // Final end event
    const endEvent: StreamEndEvent = {
      type: "end",
      stopReason: response.stopReason ?? (response.toolCalls?.length ? "tool_use" : "end_turn"),
    };
    yield endEvent;
  }

  /**
   * Count tokens in input (mock implementation)
   */
  async countTokens(input: string | CompletionMessage[], _model?: string): Promise<number> {
    // Simple approximation: ~4 chars per token
    if (typeof input === "string") {
      return Math.ceil(input.length / 4);
    }

    let totalChars = 0;
    for (const msg of input) {
      if (typeof msg.content === "string") {
        totalChars += msg.content.length;
      } else {
        for (const part of msg.content) {
          if (part.type === "text") {
            totalChars += part.text.length;
          }
        }
      }
    }
    return Math.ceil(totalChars / 4);
  }

  /**
   * List available mock models
   */
  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: "mock",
        name: "Mock Model",
        provider: "anthropic" as const, // Pretend to be anthropic for compatibility
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 0,
        outputPrice: 0,
      },
    ];
  }

  /**
   * Validate credential (always succeeds for mock)
   */
  async validateCredential(_credential: ProviderCredential): Promise<CredentialValidationResult> {
    return { valid: true };
  }

  // ===========================================================================
  // Mock-Specific Methods
  // ===========================================================================

  /**
   * Reset the script to start from beginning
   */
  reset(): void {
    this.currentIndex = 0;
  }

  /**
   * Get current position in script
   */
  getPosition(): number {
    return this.currentIndex;
  }

  /**
   * Check if more responses available
   */
  hasMoreResponses(): boolean {
    return this.currentIndex < this.script.responses.length;
  }

  /**
   * Get the provider name
   */
  get name(): string {
    return "mock";
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private getNextResponse(): MockResponse {
    const responses = this.script.responses;
    if (responses.length === 0) {
      return { content: "[No mock responses configured]" };
    }

    if (this.currentIndex >= responses.length) {
      if (this.script.cycle) {
        // Cycle back to start
        this.currentIndex = 0;
      } else {
        // Return last response for any extra calls
        const lastResponse = responses.at(-1);
        if (lastResponse) return lastResponse;
        return { content: "[No mock responses configured]" };
      }
    }

    const response = responses[this.currentIndex];
    if (!response) {
      return { content: "[No mock responses configured]" };
    }
    this.currentIndex++;
    return response;
  }

  private defaultTokenUsage(): TokenUsage {
    return {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a simple mock provider with a single response
 *
 * @example
 * ```typescript
 * const provider = createSimpleMockProvider('Hello, world!');
 * const result = await provider.complete({ model: 'mock', messages: [] });
 * console.log(result.content); // 'Hello, world!'
 * ```
 */
export function createSimpleMockProvider(content: string): MockProvider {
  return new MockProvider({
    responses: [{ content }],
  });
}

/**
 * Create a mock provider that simulates tool use
 *
 * @example
 * ```typescript
 * const provider = createToolUseMockProvider(
 *   [{ name: 'readFile', arguments: { path: '/test.txt' } }],
 *   'File contents retrieved.'
 * );
 * ```
 */
export function createToolUseMockProvider(
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>,
  finalResponse: string
): MockProvider {
  return new MockProvider({
    responses: [
      {
        content: "",
        toolCalls: toolCalls.map((tc, i) => ({
          id: `call_${i}`,
          name: tc.name,
          input: tc.arguments,
        })),
        stopReason: "tool_use",
      },
      { content: finalResponse },
    ],
  });
}

/**
 * Create a mock provider with custom responses
 *
 * @example
 * ```typescript
 * const provider = createMockProvider([
 *   { content: 'First response' },
 *   { content: 'Second response', delay: 100 },
 *   { content: '', toolCalls: [...], stopReason: 'tool_use' },
 * ]);
 * ```
 */
export function createMockProvider(responses: MockResponse[]): MockProvider {
  return new MockProvider({ responses });
}
