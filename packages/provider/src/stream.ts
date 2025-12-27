/**
 * Streaming Utilities
 *
 * Helper functions for working with async iterables and streaming responses.
 * Provides normalization, timeout handling, and abort support.
 *
 * @module @vellum/provider/stream
 */

import { ErrorCode } from "@vellum/shared";
import { ProviderError } from "./errors.js";
import type {
  StopReason,
  StreamDoneEvent,
  StreamEvent,
  StreamReasoningEvent,
  StreamTextEvent,
  StreamToolCallEvent,
  StreamUsageEvent,
  TokenUsage,
} from "./types.js";

// =============================================================================
// T028: Stream Normalization Utilities
// =============================================================================

/**
 * Provider-specific text event formats
 */
export interface ProviderTextDelta {
  type: "text_delta" | "content_block_delta" | "delta" | "text";
  text?: string;
  delta?: { text?: string; content?: string };
  content?: string;
}

/**
 * Provider-specific reasoning/thinking event formats
 */
export interface ProviderReasoningDelta {
  type: "thinking_delta" | "reasoning_delta" | "thinking";
  text?: string;
  thinking?: string;
  delta?: { thinking?: string };
}

/**
 * Provider-specific tool call formats
 */
export interface ProviderToolCallDelta {
  type: "tool_use" | "tool_call" | "function_call";
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  arguments?: string;
  function?: { name?: string; arguments?: string };
}

/**
 * Provider-specific usage formats
 */
export interface ProviderUsage {
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  thinking_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/**
 * Normalize provider-specific text delta to StreamTextEvent
 *
 * @param delta - Provider-specific text delta event
 * @returns Normalized StreamTextEvent or undefined if no text
 *
 * @example
 * ```typescript
 * const event = normalizeTextDelta({ type: 'text_delta', text: 'Hello' });
 * // { type: 'text', text: 'Hello' }
 * ```
 */
export function normalizeTextDelta(delta: ProviderTextDelta): StreamTextEvent | undefined {
  let text: string | undefined;

  // Anthropic: text_delta with text
  if (delta.text !== undefined) {
    text = delta.text;
  }
  // OpenAI: delta.content
  else if (delta.delta?.content !== undefined) {
    text = delta.delta.content;
  }
  // OpenAI alt: delta.text
  else if (delta.delta?.text !== undefined) {
    text = delta.delta.text;
  }
  // Direct content
  else if (delta.content !== undefined) {
    text = delta.content;
  }

  if (text !== undefined && text.length > 0) {
    return { type: "text", text };
  }
  return undefined;
}

/**
 * Normalize provider-specific reasoning delta to StreamReasoningEvent
 *
 * @param delta - Provider-specific reasoning delta event
 * @returns Normalized StreamReasoningEvent or undefined if no reasoning
 */
export function normalizeReasoningDelta(
  delta: ProviderReasoningDelta
): StreamReasoningEvent | undefined {
  let text: string | undefined;

  if (delta.text !== undefined) {
    text = delta.text;
  } else if (delta.thinking !== undefined) {
    text = delta.thinking;
  } else if (delta.delta?.thinking !== undefined) {
    text = delta.delta.thinking;
  }

  if (text !== undefined && text.length > 0) {
    return { type: "reasoning", text };
  }
  return undefined;
}

/**
 * Normalize provider-specific tool call to StreamToolCallEvent
 *
 * @param delta - Provider-specific tool call event
 * @returns Normalized StreamToolCallEvent or undefined
 */
export function normalizeToolCall(delta: ProviderToolCallDelta): StreamToolCallEvent | undefined {
  const id = delta.id ?? crypto.randomUUID();
  const name = delta.name ?? delta.function?.name;
  let input: Record<string, unknown> | undefined;

  if (delta.input !== undefined) {
    input = delta.input;
  } else if (delta.arguments !== undefined) {
    try {
      input = JSON.parse(delta.arguments);
    } catch {
      input = {};
    }
  } else if (delta.function?.arguments !== undefined) {
    try {
      input = JSON.parse(delta.function.arguments);
    } catch {
      input = {};
    }
  }

  if (name !== undefined && input !== undefined) {
    return { type: "toolCall", id, name, input };
  }
  return undefined;
}

/**
 * Normalize provider-specific usage to StreamUsageEvent
 *
 * @param usage - Provider-specific usage object
 * @returns Normalized StreamUsageEvent
 */
export function normalizeUsage(usage: ProviderUsage): StreamUsageEvent {
  const tokenUsage: TokenUsage = {
    inputTokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
    outputTokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
    thinkingTokens: usage.thinking_tokens,
    cacheReadTokens: usage.cache_read_input_tokens,
    cacheWriteTokens: usage.cache_creation_input_tokens,
  };

  return { type: "usage", usage: tokenUsage };
}

/**
 * Create a done event with the given stop reason
 *
 * @param stopReason - The reason generation stopped
 * @returns StreamDoneEvent
 */
export function createDoneEvent(stopReason: StopReason): StreamDoneEvent {
  return { type: "done", stopReason };
}

// =============================================================================
// Text Accumulator
// =============================================================================

/**
 * Accumulator for building complete responses from stream chunks
 */
export class TextAccumulator {
  private textChunks: string[] = [];
  private reasoningChunks: string[] = [];
  private _usage: TokenUsage | undefined;
  private _stopReason: StopReason = "end_turn";
  private toolCallBuilders: Map<string, { name: string; inputChunks: string[] }> = new Map();

  /**
   * Process a stream event and accumulate content
   *
   * @param event - The stream event to process
   */
  process(event: StreamEvent): void {
    switch (event.type) {
      case "text":
        this.textChunks.push(event.text);
        break;
      case "reasoning":
        this.reasoningChunks.push(event.text);
        break;
      case "toolCallDelta":
        this.processToolCallDelta(event.id, event.name, event.inputDelta);
        break;
      case "toolCall":
        // Complete tool call, already processed
        break;
      case "usage":
        this._usage = event.usage;
        break;
      case "done":
        this._stopReason = event.stopReason;
        break;
      case "error":
        // Errors handled externally
        break;
    }
  }

  private processToolCallDelta(id: string, name: string | undefined, inputDelta: string): void {
    let builder = this.toolCallBuilders.get(id);
    if (!builder) {
      builder = { name: name ?? "", inputChunks: [] };
      this.toolCallBuilders.set(id, builder);
    }
    if (name && !builder.name) {
      builder.name = name;
    }
    builder.inputChunks.push(inputDelta);
  }

  /**
   * Get accumulated text content
   */
  get text(): string {
    return this.textChunks.join("");
  }

  /**
   * Get accumulated reasoning content
   */
  get reasoning(): string | undefined {
    return this.reasoningChunks.length > 0 ? this.reasoningChunks.join("") : undefined;
  }

  /**
   * Get token usage if available
   */
  get usage(): TokenUsage | undefined {
    return this._usage;
  }

  /**
   * Get the stop reason
   */
  get stopReason(): StopReason {
    return this._stopReason;
  }

  /**
   * Get accumulated tool calls
   */
  get toolCalls(): Array<{ id: string; name: string; input: Record<string, unknown> }> {
    const results: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    for (const [id, builder] of this.toolCallBuilders) {
      const inputJson = builder.inputChunks.join("");
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(inputJson);
      } catch {
        // Invalid JSON, keep empty object
      }
      results.push({ id, name: builder.name, input });
    }
    return results;
  }

  /**
   * Reset the accumulator
   */
  reset(): void {
    this.textChunks = [];
    this.reasoningChunks = [];
    this._usage = undefined;
    this._stopReason = "end_turn";
    this.toolCallBuilders.clear();
  }
}

// =============================================================================
// T029: Stream Timeout Wrapper
// =============================================================================

/**
 * Wraps an async iterable with timeout on inactivity.
 * Timer resets on each data received.
 *
 * @param source - The source async iterable
 * @param timeoutMs - Timeout in milliseconds for inactivity
 * @returns Async iterable that throws on timeout
 *
 * @example
 * ```typescript
 * const stream = provider.stream(params);
 * const withTimeout = streamWithTimeout(stream, 30000);
 *
 * for await (const event of withTimeout) {
 *   // Process event, timeout resets on each iteration
 * }
 * ```
 */
export async function* streamWithTimeout<T>(
  source: AsyncIterable<T>,
  timeoutMs: number
): AsyncGenerator<T, void, undefined> {
  const iterator = source[Symbol.asyncIterator]();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const createTimeoutPromise = (): Promise<never> => {
    return new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new ProviderError("Stream timeout: no data received within timeout period", {
            code: ErrorCode.TIMEOUT,
            category: "timeout",
            retryable: true,
            retryDelayMs: 2000,
          })
        );
      }, timeoutMs);
    });
  };

  const clearTimeoutIfSet = (): void => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  try {
    while (true) {
      const timeoutPromise = createTimeoutPromise();
      const nextPromise = iterator.next();

      try {
        const result = await Promise.race([nextPromise, timeoutPromise]);
        clearTimeoutIfSet();

        if (result.done) {
          return;
        }

        yield result.value;
      } catch (error) {
        clearTimeoutIfSet();
        throw error;
      }
    }
  } finally {
    clearTimeoutIfSet();
    // Clean up iterator if it has a return method
    await iterator.return?.();
  }
}

// =============================================================================
// T030: Stream Abort Support
// =============================================================================

/**
 * Wraps an async iterable with AbortSignal support.
 * Stops cleanly on abort without throwing.
 *
 * @param source - The source async iterable
 * @param signal - AbortSignal to watch for cancellation
 * @returns Async iterable that terminates on abort
 *
 * @example
 * ```typescript
 * const controller = new AbortController();
 * const stream = provider.stream(params);
 * const abortable = streamWithAbort(stream, controller.signal);
 *
 * // Later: controller.abort() will cleanly stop the stream
 * for await (const event of abortable) {
 *   // Process event
 * }
 * ```
 */
export async function* streamWithAbort<T>(
  source: AsyncIterable<T>,
  signal: AbortSignal
): AsyncGenerator<T, void, undefined> {
  // If already aborted, don't start
  if (signal.aborted) {
    return;
  }

  const iterator = source[Symbol.asyncIterator]();
  let aborted = false;

  // Set up abort listener
  const onAbort = (): void => {
    aborted = true;
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (!aborted) {
      // Create abort promise that resolves (not rejects) on abort
      const abortPromise = new Promise<{ done: true; value: undefined }>((resolve) => {
        if (aborted) {
          resolve({ done: true, value: undefined });
          return;
        }
        const handler = (): void => {
          resolve({ done: true, value: undefined });
        };
        signal.addEventListener("abort", handler, { once: true });
      });

      const nextPromise = iterator.next();
      const result = await Promise.race([nextPromise, abortPromise]);

      if (result.done || aborted) {
        return;
      }

      yield result.value;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    // Clean up iterator
    await iterator.return?.();
  }
}

/**
 * Combine timeout and abort into a single wrapper
 *
 * @param source - The source async iterable
 * @param options - Configuration options
 * @returns Wrapped async iterable
 *
 * @example
 * ```typescript
 * const stream = provider.stream(params);
 * const wrapped = streamWithOptions(stream, {
 *   timeoutMs: 30000,
 *   signal: abortController.signal,
 * });
 * ```
 */
export async function* streamWithOptions<T>(
  source: AsyncIterable<T>,
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
  }
): AsyncGenerator<T, void, undefined> {
  let current: AsyncIterable<T> = source;

  // Apply abort wrapper first (outer layer)
  if (options.signal) {
    current = streamWithAbort(current, options.signal);
  }

  // Apply timeout wrapper (inner layer)
  if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
    current = streamWithTimeout(current, options.timeoutMs);
  }

  yield* current;
}

/**
 * Consume a stream and collect all events
 *
 * @param source - The source async iterable
 * @returns Array of all events
 *
 * @example
 * ```typescript
 * const events = await collectStream(provider.stream(params));
 * ```
 */
export async function collectStream<T>(source: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of source) {
    results.push(item);
  }
  return results;
}

/**
 * Consume a stream of StreamEvents and build a complete response
 *
 * @param source - Stream of StreamEvents
 * @returns Accumulated text and metadata
 */
export async function consumeStream(source: AsyncIterable<StreamEvent>): Promise<{
  text: string;
  reasoning?: string;
  usage?: TokenUsage;
  stopReason: StopReason;
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
}> {
  const accumulator = new TextAccumulator();
  for await (const event of source) {
    accumulator.process(event);
  }
  return {
    text: accumulator.text,
    reasoning: accumulator.reasoning,
    usage: accumulator.usage,
    stopReason: accumulator.stopReason,
    toolCalls: accumulator.toolCalls,
  };
}
