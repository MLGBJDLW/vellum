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
  StreamEndEvent,
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
  type: "thinking_delta" | "reasoning_delta" | "thinking" | "reasoning_details";
  text?: string;
  thinking?: string;
  delta?: { thinking?: string };
  reasoning_details?: Array<{ text?: string }>;
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
 * // { type: 'text', content: 'Hello' }
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
    return { type: "text", content: text };
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
  } else if (delta.reasoning_details) {
    text = delta.reasoning_details
      .map((detail) => detail.text?.trim())
      .filter((detail): detail is string => Boolean(detail && detail.length > 0))
      .join("\n");
  }

  if (text !== undefined && text.length > 0) {
    return { type: "reasoning", content: text };
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
  return {
    type: "usage",
    inputTokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
    outputTokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens,
    cacheWriteTokens: usage.cache_creation_input_tokens,
  };
}

/**
 * Create a done event with the given stop reason
 *
 * @param stopReason - The reason generation stopped
 * @returns StreamDoneEvent
 * @deprecated Use createEndEvent instead
 */
export function createDoneEvent(stopReason: StopReason): StreamDoneEvent {
  return { type: "done", stopReason };
}

/**
 * Create an end event with the given stop reason
 *
 * @param stopReason - The reason generation stopped
 * @returns StreamEndEvent
 */
export function createEndEvent(stopReason: StopReason): StreamEndEvent {
  return { type: "end", stopReason };
}

// =============================================================================
// Text Accumulator
// =============================================================================

/**
 * Accumulator for building complete responses from stream chunks
 *
 * @deprecated Use {@link StreamCollector} from `@vellum/core` instead.
 * StreamCollector provides:
 * - Action-based processing (CollectorAction discriminated union)
 * - Part-based message output (AssistantMessage with MessagePart[])
 * - Better type safety with Result<T, E> pattern
 * - Support for citations and grounding chunks
 *
 * @example Migration
 * ```typescript
 * // Before (deprecated)
 * import { TextAccumulator } from '@vellum/provider';
 * const accumulator = new TextAccumulator();
 * for await (const event of stream) {
 *   accumulator.process(event);
 * }
 * const text = accumulator.text;
 *
 * // After (recommended)
 * import { StreamCollector } from '@vellum/core';
 * const collector = new StreamCollector();
 * for await (const event of stream) {
 *   const action = collector.processEvent(event);
 *   // Handle action (emit_text, tool_call_started, etc.)
 * }
 * const result = collector.build();
 * if (result.ok) {
 *   const message = result.value; // AssistantMessage with parts[]
 * }
 * ```
 *
 * @see {@link https://github.com/vellum-ai/vellum/blob/main/packages/core/MIGRATION.md#textaccumulator--streamcollector | Migration Guide}
 */
export class TextAccumulator {
  private textChunks: string[] = [];
  private reasoningChunks: string[] = [];
  private _inputTokens = 0;
  private _outputTokens = 0;
  private _cacheReadTokens: number | undefined;
  private _cacheWriteTokens: number | undefined;
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
        this.textChunks.push(event.content);
        break;
      case "reasoning":
        this.reasoningChunks.push(event.content);
        break;
      // New format tool events
      case "tool_call_start":
        this.toolCallBuilders.set(event.id, { name: event.name, inputChunks: [] });
        break;
      case "tool_call_delta":
        this.processToolCallDelta(event.id, undefined, event.arguments);
        break;
      case "tool_call_end":
        // End event, tool call is complete
        break;
      // Legacy format tool events
      case "toolCallDelta":
        this.processToolCallDelta(event.id, event.name, event.inputDelta);
        break;
      case "toolCall":
        // Complete tool call, already processed
        break;
      // MCP events (no accumulation needed)
      case "mcp_tool_start":
      case "mcp_tool_progress":
      case "mcp_tool_end":
        break;
      // Citation events (no accumulation needed)
      case "citation":
        break;
      // Usage events
      case "usage":
        this._inputTokens = event.inputTokens;
        this._outputTokens = event.outputTokens;
        this._cacheReadTokens = event.cacheReadTokens;
        this._cacheWriteTokens = event.cacheWriteTokens;
        break;
      // Completion events
      case "end":
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
    if (this._inputTokens > 0 || this._outputTokens > 0) {
      return {
        inputTokens: this._inputTokens,
        outputTokens: this._outputTokens,
        ...(this._cacheReadTokens !== undefined && { cacheReadTokens: this._cacheReadTokens }),
        ...(this._cacheWriteTokens !== undefined && { cacheWriteTokens: this._cacheWriteTokens }),
      };
    }
    return undefined;
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
    this._inputTokens = 0;
    this._outputTokens = 0;
    this._cacheReadTokens = undefined;
    this._cacheWriteTokens = undefined;
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

// =============================================================================
// T029: StreamProcessor Integration Utilities
// =============================================================================

/**
 * Result type for StreamProcessor compatibility.
 * Mirrors @vellum/core Result<T, E> for type compatibility.
 */
type StreamResult<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Configuration for creating a StreamProcessor-compatible stream
 */
export interface StreamProcessorOptions {
  /** Timeout in milliseconds for inactivity */
  timeoutMs?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Wraps a raw provider stream into a Result<StreamEvent, Error> stream
 * compatible with StreamProcessor from @vellum/core.
 *
 * This bridge function allows existing provider streams to be used with
 * the unified StreamProcessor pipeline.
 *
 * @param source - Raw async iterable of StreamEvents from a provider
 * @param options - Optional timeout and abort configuration
 * @returns AsyncGenerator yielding Result<StreamEvent, Error>
 *
 * @example
 * ```typescript
 * import { StreamProcessor } from '@vellum/core';
 * import { wrapStreamForProcessor, streamWithOptions } from '@vellum/provider';
 *
 * const provider = new AnthropicProvider({ apiKey });
 * const rawStream = provider.stream(params);
 *
 * // Apply timeout and abort, then wrap for StreamProcessor
 * const wrapped = streamWithOptions(rawStream, { timeoutMs: 30000, signal });
 * const resultStream = wrapStreamForProcessor(wrapped);
 *
 * const processor = new StreamProcessor();
 * const result = await processor.processStream(resultStream);
 * ```
 */
export async function* wrapStreamForProcessor(
  source: AsyncIterable<StreamEvent>,
  options?: StreamProcessorOptions
): AsyncGenerator<StreamResult<StreamEvent, Error>, void, undefined> {
  // Apply options if provided
  let stream: AsyncIterable<StreamEvent> = source;

  if (options?.signal || options?.timeoutMs) {
    stream = streamWithOptions(source, {
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    });
  }

  try {
    for await (const event of stream) {
      yield { ok: true as const, value: event };
    }
  } catch (error) {
    yield {
      ok: false as const,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Creates a normalized StreamEvent from provider-specific formats.
 *
 * Use this when you have raw provider data and need to create
 * a standard StreamEvent for processing.
 *
 * @param type - The event type
 * @param data - Provider-specific data
 * @returns Normalized StreamEvent
 *
 * @example
 * ```typescript
 * // From Anthropic format
 * const event = createStreamEvent('text', { type: 'text_delta', text: 'Hello' });
 *
 * // From OpenAI format
 * const event = createStreamEvent('text', { delta: { content: 'Hello' } });
 * ```
 */
export function createStreamEvent(
  type: "text",
  data: ProviderTextDelta
): StreamTextEvent | undefined;
export function createStreamEvent(
  type: "reasoning",
  data: ProviderReasoningDelta
): StreamReasoningEvent | undefined;
export function createStreamEvent(
  type: "toolCall",
  data: ProviderToolCallDelta
): StreamToolCallEvent | undefined;
export function createStreamEvent(type: "usage", data: ProviderUsage): StreamUsageEvent;
export function createStreamEvent(type: "end", data: { stopReason: StopReason }): StreamEndEvent;
export function createStreamEvent(
  type: "text" | "reasoning" | "toolCall" | "usage" | "end",
  data: unknown
):
  | StreamTextEvent
  | StreamReasoningEvent
  | StreamToolCallEvent
  | StreamUsageEvent
  | StreamEndEvent
  | undefined {
  switch (type) {
    case "text":
      return normalizeTextDelta(data as ProviderTextDelta);
    case "reasoning":
      return normalizeReasoningDelta(data as ProviderReasoningDelta);
    case "toolCall":
      return normalizeToolCall(data as ProviderToolCallDelta);
    case "usage":
      return normalizeUsage(data as ProviderUsage);
    case "end":
      return createEndEvent((data as { stopReason: StopReason }).stopReason);
  }
}

/**
 * Maps a raw provider stream through an event transformer.
 *
 * Useful for normalizing provider-specific events before processing.
 *
 * @param source - Raw provider stream
 * @param mapper - Function to transform each event
 * @returns Transformed stream
 *
 * @example
 * ```typescript
 * const normalized = mapStreamEvents(rawStream, (event) => {
 *   // Transform provider-specific event to StreamEvent
 *   if (event.type === 'content_block_delta') {
 *     return createStreamEvent('text', event);
 *   }
 *   return event;
 * });
 * ```
 */
export async function* mapStreamEvents<T, U>(
  source: AsyncIterable<T>,
  mapper: (event: T) => U | undefined
): AsyncGenerator<U, void, undefined> {
  for await (const event of source) {
    const mapped = mapper(event);
    if (mapped !== undefined) {
      yield mapped;
    }
  }
}

/**
 * Filters stream events by predicate.
 *
 * @param source - Source stream
 * @param predicate - Filter function
 * @returns Filtered stream
 */
export async function* filterStreamEvents<T>(
  source: AsyncIterable<T>,
  predicate: (event: T) => boolean
): AsyncGenerator<T, void, undefined> {
  for await (const event of source) {
    if (predicate(event)) {
      yield event;
    }
  }
}

/**
 * Taps into a stream for side effects without modifying events.
 *
 * Useful for logging, metrics, or debugging.
 *
 * @param source - Source stream
 * @param handler - Side effect handler
 * @returns Original stream unchanged
 *
 * @example
 * ```typescript
 * const logged = tapStreamEvents(stream, (event) => {
 *   console.log('Event:', event.type);
 * });
 * ```
 */
export async function* tapStreamEvents<T>(
  source: AsyncIterable<T>,
  handler: (event: T) => void | Promise<void>
): AsyncGenerator<T, void, undefined> {
  for await (const event of source) {
    await handler(event);
    yield event;
  }
}
