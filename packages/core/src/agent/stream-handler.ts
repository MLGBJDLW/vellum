// ============================================
// Agent Stream Handler
// ============================================

/**
 * Stream Handler for Agent Loop.
 *
 * Extracted from AgentLoop to coordinate stream processing:
 * - Wrapping streams for StreamProcessor consumption
 * - Handling individual stream events
 * - Converting between event formats
 * - Managing stream state (accumulated content, flags)
 * - Dispatching UI events
 *
 * @module @vellum/core/agent/stream-handler
 */

import type { StreamEvent } from "@vellum/provider";
import type { TokenUsage } from "@vellum/shared";
import type { Logger } from "../logger/logger.js";
import type { LLMStreamEvent } from "../session/index.js";
import type { StreamProcessor, UiEvent } from "../streaming/processor.js";
import type { Result } from "../types/result.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Streaming state tracked during stream processing
 */
export interface StreamState {
  /** Whether stream has produced text content */
  hasText: boolean;
  /** Whether stream has produced reasoning/thinking content */
  hasThinking: boolean;
  /** Whether stream has produced tool calls */
  hasToolCalls: boolean;
  /** Accumulated text content */
  accumulatedText: string;
  /** Accumulated reasoning content */
  accumulatedReasoning: string;
}

/**
 * Pending tool call collected during streaming
 */
export interface PendingToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Configuration for AgentStreamHandler
 */
export interface AgentStreamHandlerConfig {
  /** Whether to use StreamProcessor for unified handling */
  useStreamProcessor?: boolean;
}

/**
 * Dependencies for AgentStreamHandler
 */
export interface AgentStreamHandlerDeps {
  /** StreamProcessor instance (optional) */
  streamProcessor?: StreamProcessor;
  /** Logger for debugging */
  logger?: Logger;
  /** Check if cancellation was requested */
  isCancelled: () => boolean;
  /** Emit text event */
  emitText: (text: string) => void;
  /** Emit thinking/reasoning event */
  emitThinking: (text: string) => void;
  /** Emit tool call event */
  emitToolCall: (id: string, name: string, input: Record<string, unknown>) => void;
  /** Emit error event */
  emitError: (error: Error) => void;
  /** Record token usage */
  recordUsage: (usage: TokenUsage) => void;
  /** Check streaming loop detection (optional callback) */
  checkStreamingLoop?: (event: StreamEvent) => { detected: boolean; result?: unknown };
}

/**
 * Callbacks for stream events
 */
export interface StreamHandlerCallbacks {
  /** Called when UI event is dispatched (for backward compatibility) */
  onUiEvent?: (event: UiEvent) => void;
}

/**
 * Result of processing stream response
 */
export interface StreamProcessResult {
  /** Whether stream was interrupted (e.g., loop detection) */
  interrupted: boolean;
  /** Collected pending tool calls */
  pendingToolCalls: PendingToolCall[];
}

// ============================================================================
// AgentStreamHandler Class
// ============================================================================

/**
 * Manages stream processing integration for the agent loop.
 *
 * This class encapsulates stream handling logic including:
 * - Wrapping streams for StreamProcessor consumption
 * - Processing individual stream events
 * - Converting LLMStreamEvent to StreamEvent format
 * - Tracking stream state (text, thinking, tool calls)
 * - Accumulating content for message history
 *
 * @example
 * ```typescript
 * const streamHandler = new AgentStreamHandler(
 *   { useStreamProcessor: true },
 *   {
 *     streamProcessor,
 *     logger,
 *     isCancelled: () => this.cancellation.isCancelled,
 *     emitText: (text) => this.emit("text", text),
 *     emitThinking: (text) => this.emit("thinking", text),
 *     emitToolCall: (id, name, input) => this.emit("toolCall", id, name, input),
 *     emitError: (err) => this.emit("error", err),
 *     recordUsage: (usage) => this.recordUsage(usage),
 *   }
 * );
 *
 * // Reset state before processing
 * streamHandler.resetState();
 *
 * // Process stream
 * const result = await streamHandler.processStream(stream);
 * ```
 */
export class AgentStreamHandler {
  private readonly config: AgentStreamHandlerConfig;
  private readonly deps: AgentStreamHandlerDeps;
  private callbacks: StreamHandlerCallbacks = {};

  private state: StreamState = {
    hasText: false,
    hasThinking: false,
    hasToolCalls: false,
    accumulatedText: "",
    accumulatedReasoning: "",
  };

  constructor(config: AgentStreamHandlerConfig, deps: AgentStreamHandlerDeps) {
    this.config = config;
    this.deps = deps;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Set callbacks for stream events.
   */
  setCallbacks(callbacks: StreamHandlerCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Get current stream state.
   */
  getState(): Readonly<StreamState> {
    return { ...this.state };
  }

  /**
   * Reset stream state for a new stream.
   */
  resetState(): void {
    this.state = {
      hasText: false,
      hasThinking: false,
      hasToolCalls: false,
      accumulatedText: "",
      accumulatedReasoning: "",
    };
  }

  /**
   * Process a stream and collect results.
   *
   * @param stream - AsyncIterable of LLMStreamEvent from provider
   * @returns Processing result with interrupt status and pending tool calls
   */
  async processStream(stream: AsyncIterable<LLMStreamEvent>): Promise<StreamProcessResult> {
    const pendingToolCalls: PendingToolCall[] = [];

    if (this.config.useStreamProcessor && this.deps.streamProcessor) {
      return this.processWithStreamProcessor(stream, pendingToolCalls);
    }

    return this.processDirectly(stream, pendingToolCalls);
  }

  /**
   * Handle a single stream event.
   *
   * This is the core event processing logic, exposed for direct use
   * when not using the processStream() method.
   *
   * @param event - Stream event from LLM
   * @param pendingToolCalls - Array to collect pending tool calls
   * @returns Whether a loop was detected (for interrupt handling)
   */
  async handleStreamEvent(
    event: LLMStreamEvent,
    pendingToolCalls: PendingToolCall[]
  ): Promise<{ loopDetected: boolean }> {
    // Check streaming loop detector if callback provided
    if (this.deps.checkStreamingLoop) {
      const streamEvent = this.convertToStreamEvent(event);
      if (streamEvent) {
        const loopCheck = this.deps.checkStreamingLoop(streamEvent);
        if (loopCheck.detected) {
          return { loopDetected: true };
        }
      }
    }

    switch (event.type) {
      case "text": {
        const textContent = event.content ?? (event as { text?: string }).text ?? "";
        if (textContent.trim().length > 0) {
          this.state.hasText = true;
        }
        this.state.accumulatedText += textContent;
        this.deps.emitText(textContent);
        break;
      }

      case "reasoning": {
        const thinkingContent = event.content ?? (event as { text?: string }).text ?? "";
        if (thinkingContent.trim().length > 0) {
          this.state.hasThinking = true;
        }
        this.state.accumulatedReasoning += thinkingContent;
        this.deps.emitThinking(thinkingContent);
        break;
      }

      case "toolCall":
        this.state.hasToolCalls = true;
        pendingToolCalls.push({
          id: event.id,
          name: event.name,
          input: event.input,
        });
        this.deps.emitToolCall(event.id, event.name, event.input);
        break;

      case "toolCallDelta":
        // Partial tool call - ignore for now, handled when complete
        break;

      case "usage": {
        const usagePayload =
          "usage" in event && event.usage && typeof event.usage === "object"
            ? (event.usage as TokenUsage)
            : event;

        this.deps.recordUsage({
          inputTokens: usagePayload.inputTokens,
          outputTokens: usagePayload.outputTokens,
          thinkingTokens: usagePayload.thinkingTokens,
          cacheReadTokens: usagePayload.cacheReadTokens,
          cacheWriteTokens: usagePayload.cacheWriteTokens,
        });
        break;
      }

      case "error":
        this.deps.emitError(new Error(`[${event.code}] ${event.message}`));
        break;

      case "done":
        // Stream complete - handled by caller after loop exits
        break;
    }

    return { loopDetected: false };
  }

  /**
   * Convert LLMStreamEvent to StreamEvent format.
   *
   * Used for StreamProcessor consumption and streaming loop detection.
   *
   * @param event - LLM stream event
   * @returns Converted StreamEvent or undefined if not mappable
   */
  convertToStreamEvent(event: LLMStreamEvent): StreamEvent | undefined {
    switch (event.type) {
      case "text":
        return {
          type: "text",
          content: event.content ?? (event as { text?: string }).text ?? "",
        };

      case "reasoning":
        return {
          type: "reasoning",
          content: event.content ?? (event as { text?: string }).text ?? "",
        };

      case "toolCall":
        return {
          type: "toolCall",
          id: event.id,
          name: event.name,
          input: event.input,
        };

      case "toolCallDelta":
        return {
          type: "tool_call_delta",
          id: event.id,
          arguments: event.inputDelta,
          index: 0,
        };

      case "usage":
        return {
          type: "usage",
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

      case "error":
        // Error is handled via Result in wrapped stream
        return undefined;

      case "done":
        return { type: "end", stopReason: "end_turn" };

      default:
        return undefined;
    }
  }

  /**
   * Handle UI events from StreamProcessor.
   *
   * Dispatches events to existing emitters for backward compatibility.
   *
   * @param event - UI event from StreamProcessor
   */
  handleUiEvent(event: UiEvent): void {
    this.callbacks.onUiEvent?.(event);

    switch (event.type) {
      case "text_chunk":
        this.deps.emitText(event.content);
        break;

      case "reasoning_chunk":
        this.deps.emitThinking(event.content);
        break;

      case "tool_started":
        // Tool started events don't have direct mapping yet
        break;

      case "tool_completed":
        // Tool completed events don't have direct mapping yet
        break;

      case "tool_error":
        this.deps.emitError(new Error(`Tool ${event.id} error: ${event.error}`));
        break;

      case "usage":
        this.deps.recordUsage(event.usage);
        break;

      case "complete":
        // Complete is handled after processStream returns
        break;

      case "error":
        this.deps.emitError(new Error(`[${event.error.code}] ${event.error.message}`));
        break;

      case "citation":
        // Citations can be logged but don't have an existing emitter
        this.deps.logger?.debug("Citation received", { chunk: event.chunk });
        break;
    }
  }

  // ==========================================================================
  // Private Implementation
  // ==========================================================================

  /**
   * Process stream using StreamProcessor.
   */
  private async processWithStreamProcessor(
    stream: AsyncIterable<LLMStreamEvent>,
    pendingToolCalls: PendingToolCall[]
  ): Promise<StreamProcessResult> {
    const processor = this.deps.streamProcessor!;
    const wrappedStream = this.wrapStreamForProcessor(stream);

    const result = await processor.processStream(wrappedStream);

    if (result.ok) {
      // Extract state from processed result
      const hasTextPart = result.value.parts.some(
        (part) => part.type === "text" && part.content.trim().length > 0
      );
      const hasThinkingPart = result.value.parts.some(
        (part) => part.type === "reasoning" && part.content.trim().length > 0
      );

      if (hasTextPart) {
        this.state.hasText = true;
      }
      if (hasThinkingPart) {
        this.state.hasThinking = true;
      }

      // Collect tool calls from parts
      for (const part of result.value.parts) {
        if (part.type === "tool") {
          this.state.hasToolCalls = true;
          pendingToolCalls.push({
            id: part.id,
            name: part.name,
            input: part.arguments,
          });
        }
      }
    }

    processor.reset();
    return { interrupted: false, pendingToolCalls };
  }

  /**
   * Process stream directly without StreamProcessor.
   */
  private async processDirectly(
    stream: AsyncIterable<LLMStreamEvent>,
    pendingToolCalls: PendingToolCall[]
  ): Promise<StreamProcessResult> {
    for await (const event of stream) {
      if (this.deps.isCancelled()) {
        break;
      }

      const result = await this.handleStreamEvent(event, pendingToolCalls);
      if (result.loopDetected) {
        this.deps.logger?.warn("Interrupting stream due to loop detection");
        return { interrupted: true, pendingToolCalls };
      }
    }

    return { interrupted: false, pendingToolCalls };
  }

  /**
   * Wrap LLM stream for StreamProcessor consumption.
   *
   * Converts LLMStreamEvent to Result<StreamEvent, Error> format
   * expected by StreamProcessor.
   *
   * @param stream - Raw LLM stream
   * @returns Wrapped stream compatible with StreamProcessor
   */
  private async *wrapStreamForProcessor(
    stream: AsyncIterable<LLMStreamEvent>
  ): AsyncIterable<Result<StreamEvent, Error>> {
    try {
      for await (const event of stream) {
        // Check for cancellation
        if (this.deps.isCancelled()) {
          return;
        }

        if (event.type === "error") {
          yield {
            ok: false as const,
            error: new Error(`[${event.code}] ${event.message}`),
          };
          return;
        }

        // Convert LLMStreamEvent to StreamEvent
        const streamEvent = this.convertToStreamEvent(event);
        if (streamEvent) {
          yield { ok: true as const, value: streamEvent };
        }
      }
    } catch (error) {
      yield {
        ok: false as const,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}
