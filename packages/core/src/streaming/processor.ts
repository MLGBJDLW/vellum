/**
 * Stream Processor Module
 *
 * Provides types and interfaces for processing streaming events
 * and dispatching them to the UI layer.
 *
 * @module @vellum/core/streaming/processor
 */

import type { GroundingChunk, StopReason, StreamEvent } from "@vellum/provider";
import type { Result } from "../types/result.js";
import { Err, Ok } from "../types/result.js";
import {
  type AssistantMessage,
  type CollectorAction,
  StreamCollector,
  type StreamMessagePart,
  type StreamReasoningPart,
  type StreamTextPart,
  type StreamToolPart,
  type Usage,
} from "./collector.js";
import { NewlineGate, type NewlineGateConfig } from "./newline-gate.js";

// =============================================================================
// T014: UiEvent and StreamError Types
// =============================================================================

/** Structured stream error */
export interface StreamError {
  code: string;
  message: string;
  retryable: boolean;
  cause?: unknown;
}

/** Events dispatched to UI layer */
export type UiEvent =
  | { type: "text_chunk"; content: string; index: number }
  | { type: "reasoning_chunk"; content: string; index: number }
  | { type: "tool_started"; id: string; name: string }
  | { type: "tool_completed"; id: string; result: unknown }
  | { type: "tool_error"; id: string; error: string }
  | { type: "citation"; chunk: GroundingChunk }
  | { type: "usage"; usage: Usage }
  | { type: "complete"; message: AssistantMessage }
  | { type: "error"; error: StreamError };

/** UI event handler callback */
export type UiEventHandler = (event: UiEvent) => void | Promise<void>;

// =============================================================================
// T030: BlockProcessor Interface
// =============================================================================

/** Processor for a single content block in a multi-block stream */
export interface BlockProcessor<T> {
  /** Process an incremental delta for this block */
  processDelta(delta: string): void;

  /** Finalize and return the completed part */
  finalize(): T;

  /** Reset processor state */
  reset(): void;
}

// =============================================================================
// T031: TextBlockProcessor Implementation
// =============================================================================

/**
 * Processes text content blocks in a multi-block stream.
 *
 * Accumulates text deltas and produces a StreamTextPart on finalization.
 *
 * @example
 * ```typescript
 * const processor = new TextBlockProcessor();
 * processor.processDelta('Hello, ');
 * processor.processDelta('world!');
 * const part = processor.finalize();
 * // part = { type: 'text', content: 'Hello, world!' }
 * ```
 */
export class TextBlockProcessor implements BlockProcessor<StreamTextPart> {
  private content: string = "";

  /**
   * Process an incremental text delta.
   *
   * @param delta - The text content to append
   */
  processDelta(delta: string): void {
    this.content += delta;
  }

  /**
   * Finalize and return the completed text part.
   *
   * @returns A StreamTextPart with accumulated content
   */
  finalize(): StreamTextPart {
    return {
      type: "text",
      content: this.content,
    };
  }

  /**
   * Reset processor state for reuse.
   */
  reset(): void {
    this.content = "";
  }
}

// =============================================================================
// T032: ReasoningBlockProcessor Implementation
// =============================================================================

/**
 * Processes reasoning/thinking content blocks in a multi-block stream.
 *
 * Accumulates reasoning deltas and produces a StreamReasoningPart on finalization.
 *
 * @example
 * ```typescript
 * const processor = new ReasoningBlockProcessor();
 * processor.processDelta('Let me think...');
 * processor.processDelta(' First, I need to consider...');
 * const part = processor.finalize();
 * // part = { type: 'reasoning', content: 'Let me think... First, I need to consider...' }
 * ```
 */
export class ReasoningBlockProcessor implements BlockProcessor<StreamReasoningPart> {
  private content: string = "";

  /**
   * Process an incremental reasoning delta.
   *
   * @param delta - The reasoning content to append
   */
  processDelta(delta: string): void {
    this.content += delta;
  }

  /**
   * Finalize and return the completed reasoning part.
   *
   * @returns A StreamReasoningPart with accumulated content
   */
  finalize(): StreamReasoningPart {
    return {
      type: "reasoning",
      content: this.content,
    };
  }

  /**
   * Reset processor state for reuse.
   */
  reset(): void {
    this.content = "";
  }
}

// =============================================================================
// T015: StreamProcessorConfig and StreamProcessorHooks
// =============================================================================

/** Configuration for StreamProcessor */
export interface StreamProcessorConfig {
  /** NewlineGate configuration */
  newlineGate?: Partial<NewlineGateConfig>;

  /** Enable hook callbacks (default: true) */
  enableHooks?: boolean;
}

/** Lifecycle hooks for stream processing */
export interface StreamProcessorHooks {
  /** Called when stream processing begins */
  onStreamStart?: () => void | Promise<void>;

  /** Called for each chunk received from the stream */
  onChunk?: (event: StreamEvent) => void | Promise<void>;

  /** Called when stream processing completes successfully */
  onStreamEnd?: (message: AssistantMessage) => void | Promise<void>;

  /** Called when a stream error occurs */
  onStreamError?: (error: StreamError) => void | Promise<void>;
}

// =============================================================================
// T015 & T016: StreamProcessor Implementation
// =============================================================================

/**
 * Stream processor that coordinates collector, gate, and UI dispatch.
 *
 * Integrates StreamCollector (for building messages), NewlineGate (for visual
 * stability), and lifecycle hooks to process streaming LLM responses.
 *
 * @example
 * ```typescript
 * const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 50 } });
 *
 * processor.setHooks({
 *   onStreamStart: () => console.log('Stream started'),
 *   onChunk: (event) => console.log('Received:', event.type),
 *   onStreamEnd: (msg) => console.log('Complete:', msg.parts.length, 'parts'),
 * });
 *
 * processor.setUiHandler(async (event) => {
 *   if (event.type === 'text_chunk') {
 *     process.stdout.write(event.content);
 *   }
 * });
 *
 * const result = await processor.processStream(stream);
 * if (result.ok) {
 *   console.log('Final message:', result.value);
 * }
 * ```
 */
export class StreamProcessor {
  private readonly collector: StreamCollector;
  private readonly gate: NewlineGate;
  private readonly config: StreamProcessorConfig;
  private hooks: StreamProcessorHooks = {};
  private uiHandler?: UiEventHandler;

  constructor(config: StreamProcessorConfig = {}) {
    this.config = config;
    this.collector = new StreamCollector();
    this.gate = new NewlineGate(config.newlineGate);
  }

  /**
   * Set UI event handler for dispatching UI events.
   *
   * @param handler - Callback to receive UI events
   */
  setUiHandler(handler: UiEventHandler): void {
    this.uiHandler = handler;
  }

  /**
   * Set lifecycle hooks for stream processing.
   *
   * @param hooks - Lifecycle hook callbacks
   */
  setHooks(hooks: StreamProcessorHooks): void {
    this.hooks = hooks;
  }

  /**
   * Process a stream of events.
   *
   * Iterates over the AsyncIterable, processes each event through the collector,
   * applies newline gating for visual stability, and dispatches UI events.
   *
   * @param stream - AsyncIterable of Result<StreamEvent> from provider
   * @returns Result containing the complete AssistantMessage or an error
   */
  async processStream(
    stream: AsyncIterable<Result<StreamEvent, Error>>
  ): Promise<Result<AssistantMessage, Error>> {
    // Call onStreamStart hook if enabled
    if (this.config.enableHooks !== false) {
      await this.hooks.onStreamStart?.();
    }

    try {
      for await (const result of stream) {
        if (!result.ok) {
          const error: StreamError = {
            code: "STREAM_ERROR",
            message: result.error.message,
            retryable: false,
            cause: result.error,
          };
          await this.handleError(error);
          return result;
        }

        // Call onChunk hook if enabled
        if (this.config.enableHooks !== false) {
          await this.hooks.onChunk?.(result.value);
        }

        if (result.value.type === "usage") {
          const usage: Usage = {
            inputTokens: result.value.inputTokens,
            outputTokens: result.value.outputTokens,
            ...(result.value.thinkingTokens !== undefined
              ? { thinkingTokens: result.value.thinkingTokens }
              : {}),
            ...(result.value.cacheReadTokens !== undefined
              ? { cacheReadTokens: result.value.cacheReadTokens }
              : {}),
            ...(result.value.cacheWriteTokens !== undefined
              ? { cacheWriteTokens: result.value.cacheWriteTokens }
              : {}),
          };
          await this.dispatchUiEvent({ type: "usage", usage });
        }

        // Process the event through collector and handle resulting action
        await this.processEvent(result.value);

        // Check for forced flush (timeout/overflow)
        const forced = this.gate.forceFlushIfNeeded();
        if (forced) {
          await this.dispatchUiEvent({
            type: "text_chunk",
            content: forced,
            index: 0,
          });
        }
      }

      // Flush remaining gate buffer at stream end
      const remaining = this.gate.flush();
      if (remaining) {
        await this.dispatchUiEvent({
          type: "text_chunk",
          content: remaining,
          index: 0,
        });
      }

      // Build final message
      const messageResult = this.collector.build();
      if (messageResult.ok) {
        // Call onStreamEnd hook if enabled
        if (this.config.enableHooks !== false) {
          await this.hooks.onStreamEnd?.(messageResult.value);
        }
        await this.dispatchUiEvent({
          type: "complete",
          message: messageResult.value,
        });
        return messageResult;
      }

      // Map string error to Error type
      return Err(new Error(messageResult.error));
    } catch (err) {
      const error: StreamError = {
        code: "PROCESS_ERROR",
        message: err instanceof Error ? err.message : String(err),
        retryable: false,
        cause: err,
      };
      await this.handleError(error);
      return Err(new Error(error.message));
    }
  }

  /**
   * Process a single event through the collector.
   *
   * @param event - The stream event to process
   */
  private async processEvent(event: StreamEvent): Promise<void> {
    const action = this.collector.processEvent(event);
    await this.handleAction(action);
  }

  /**
   * Handle a collector action and dispatch appropriate UI events.
   *
   * @param action - The action returned by the collector
   */
  private async handleAction(action: CollectorAction): Promise<void> {
    switch (action.type) {
      case "none":
        // No action needed
        break;

      case "emit_text": {
        // Pass through newline gate for visual stability
        const gated = this.gate.feed(action.content);
        if (gated) {
          await this.dispatchUiEvent({
            type: "text_chunk",
            content: gated,
            index: action.index,
          });
        }
        break;
      }

      case "emit_reasoning": {
        // Reasoning bypasses gate (usually complete thoughts)
        await this.dispatchUiEvent({
          type: "reasoning_chunk",
          content: action.content,
          index: action.index,
        });
        break;
      }

      case "tool_call_started": {
        await this.dispatchUiEvent({
          type: "tool_started",
          id: action.id,
          name: action.name,
        });
        break;
      }

      case "tool_call_completed": {
        await this.dispatchUiEvent({
          type: "tool_completed",
          id: action.id,
          result: action.arguments,
        });
        break;
      }

      case "emit_citations": {
        for (const chunk of action.citations) {
          await this.dispatchUiEvent({ type: "citation", chunk });
        }
        break;
      }

      case "stream_complete": {
        // Complete event is dispatched in processStream after gate flush
        // to ensure all buffered content is emitted first
        break;
      }

      case "error": {
        const error: StreamError = {
          code: action.code,
          message: action.message,
          retryable: false,
        };
        await this.dispatchUiEvent({ type: "error", error });
        break;
      }
    }
  }

  /**
   * Reset processor state for reuse.
   *
   * Clears collector and gate buffers, allowing the processor
   * to be reused for a new stream.
   */
  reset(): void {
    this.collector.reset();
    this.gate.reset();
  }

  /**
   * Handle an error by calling hooks and dispatching UI event.
   *
   * @param error - The stream error to handle
   */
  private async handleError(error: StreamError): Promise<void> {
    if (this.config.enableHooks !== false) {
      await this.hooks.onStreamError?.(error);
    }
    await this.dispatchUiEvent({ type: "error", error });
  }

  /**
   * Dispatch a UI event to the registered handler.
   *
   * @param event - The UI event to dispatch
   */
  private async dispatchUiEvent(event: UiEvent): Promise<void> {
    if (this.uiHandler) {
      await this.uiHandler(event);
    }
  }
}

// =============================================================================
// T033: processMultiBlockStream Function
// =============================================================================

/** Internal state for accumulating tool call arguments */
interface ToolCallAccumulator {
  tool: StreamToolPart;
  argumentsJson: string;
}

/**
 * Process a multi-block stream with indexed content blocks.
 *
 * Routes events by their index to the correct BlockProcessor, supporting
 * multiple concurrent text, reasoning, and tool call blocks.
 *
 * @param stream - AsyncIterable of Result<StreamEvent> from provider
 * @returns Result containing the complete AssistantMessage or an error
 *
 * @example
 * ```typescript
 * const result = await processMultiBlockStream(provider.stream(params));
 * if (result.ok) {
 *   for (const part of result.value.parts) {
 *     if (part.type === 'text') {
 *       console.log('Text:', part.content);
 *     } else if (part.type === 'reasoning') {
 *       console.log('Reasoning:', part.content);
 *     } else if (part.type === 'tool') {
 *       console.log('Tool:', part.name, part.arguments);
 *     }
 *   }
 * }
 * ```
 */
export async function processMultiBlockStream(
  stream: AsyncIterable<Result<StreamEvent, Error>>
): Promise<Result<AssistantMessage, Error>> {
  // Map of index -> processor for text blocks
  const textProcessors = new Map<number, TextBlockProcessor>();
  // Map of index -> processor for reasoning blocks
  const reasoningProcessors = new Map<number, ReasoningBlockProcessor>();
  // Map of tool id -> accumulator for tool calls
  const toolAccumulators = new Map<string, ToolCallAccumulator>();

  let usage: Usage | undefined;
  let stopReason: StopReason | undefined;
  const citations: GroundingChunk[] = [];

  for await (const result of stream) {
    if (!result.ok) {
      return result;
    }

    const event = result.value;

    switch (event.type) {
      case "text": {
        const index = event.index ?? 0;
        if (!textProcessors.has(index)) {
          textProcessors.set(index, new TextBlockProcessor());
        }
        textProcessors.get(index)?.processDelta(event.content);
        break;
      }

      case "reasoning": {
        const index = event.index ?? 0;
        if (!reasoningProcessors.has(index)) {
          reasoningProcessors.set(index, new ReasoningBlockProcessor());
        }
        reasoningProcessors.get(index)?.processDelta(event.content);
        break;
      }

      case "tool_call_start": {
        toolAccumulators.set(event.id, {
          tool: {
            type: "tool",
            id: event.id,
            name: event.name,
            arguments: {},
            state: "pending",
          },
          argumentsJson: "",
        });
        break;
      }

      case "tool_call_delta": {
        const accumulator = toolAccumulators.get(event.id);
        if (accumulator) {
          accumulator.argumentsJson += event.arguments;
        }
        break;
      }

      case "tool_call_end": {
        const accumulator = toolAccumulators.get(event.id);
        if (accumulator) {
          // Parse accumulated arguments JSON
          try {
            if (accumulator.argumentsJson) {
              accumulator.tool.arguments = JSON.parse(accumulator.argumentsJson);
            }
          } catch {
            // Keep empty arguments if JSON parsing fails
          }
          accumulator.tool.state = "complete";
        }
        break;
      }

      case "citation":
        citations.push(event.chunk);
        break;

      case "usage":
        usage = {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          ...(event.thinkingTokens !== undefined ? { thinkingTokens: event.thinkingTokens } : {}),
          ...(event.cacheReadTokens !== undefined
            ? { cacheReadTokens: event.cacheReadTokens }
            : {}),
          ...(event.cacheWriteTokens !== undefined
            ? { cacheWriteTokens: event.cacheWriteTokens }
            : {}),
        };
        break;

      case "end":
        stopReason = event.stopReason;
        break;

      case "done":
        // Legacy event type
        stopReason = event.stopReason;
        break;
    }
  }

  // Build final message with parts sorted by index
  const parts: StreamMessagePart[] = [];

  // Add text parts (sorted by index)
  const sortedTextEntries = Array.from(textProcessors.entries()).sort((a, b) => a[0] - b[0]);
  for (const [, processor] of sortedTextEntries) {
    parts.push(processor.finalize());
  }

  // Add reasoning parts (sorted by index)
  const sortedReasoningEntries = Array.from(reasoningProcessors.entries()).sort(
    (a, b) => a[0] - b[0]
  );
  for (const [, processor] of sortedReasoningEntries) {
    parts.push(processor.finalize());
  }

  // Add tool calls (maintain insertion order via Map)
  for (const accumulator of Array.from(toolAccumulators.values())) {
    parts.push(accumulator.tool);
  }

  return Ok({
    parts,
    usage,
    stopReason,
    citations: citations.length > 0 ? citations : undefined,
  });
}
