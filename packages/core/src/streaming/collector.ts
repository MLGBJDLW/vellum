/**
 * Stream Collector Module
 *
 * Collects and processes stream events into structured assistant messages.
 * Implements a state machine pattern for building complete responses from
 * incremental streaming data.
 *
 * @module @vellum/core/streaming/collector
 */

import type { GroundingChunk, StopReason, StreamEvent } from "@vellum/provider";
import { Ok, type Result } from "../types/result.js";

// =============================================================================
// T005: Usage and AssistantMessage Interfaces
// =============================================================================

/**
 * Token usage statistics
 *
 * @example
 * ```typescript
 * const usage: Usage = {
 *   inputTokens: 150,
 *   outputTokens: 250,
 *   cacheReadTokens: 50,
 * };
 * ```
 */
export interface Usage {
  /** Number of tokens in the input/prompt */
  inputTokens: number;
  /** Number of tokens in the output/completion */
  outputTokens: number;
  /** Number of tokens read from cache (if applicable) */
  cacheReadTokens?: number;
  /** Number of tokens written to cache (if applicable) */
  cacheWriteTokens?: number;
}

/**
 * Text content part in an assistant message (streaming collector output)
 */
export interface StreamTextPart {
  /** Discriminator for text parts */
  type: "text";
  /** The text content */
  content: string;
}

/**
 * Reasoning/thinking content part in an assistant message (streaming collector output)
 */
export interface StreamReasoningPart {
  /** Discriminator for reasoning parts */
  type: "reasoning";
  /** The reasoning content */
  content: string;
}

/**
 * Tool call part in an assistant message (streaming collector output)
 */
export interface StreamToolPart {
  /** Discriminator for tool parts */
  type: "tool";
  /** Unique identifier for the tool call */
  id: string;
  /** Name of the tool being called */
  name: string;
  /** Parsed input arguments for the tool */
  arguments: Record<string, unknown>;
  /** Current state of the tool call */
  state: "pending" | "complete" | "error";
}

/**
 * Union of all message part types for streaming collector output
 */
export type StreamMessagePart = StreamTextPart | StreamReasoningPart | StreamToolPart;

/**
 * Complete assistant message built from stream events
 *
 * @example
 * ```typescript
 * const message: AssistantMessage = {
 *   parts: [
 *     { type: 'text', content: 'Hello, I can help with that.' },
 *     { type: 'tool', id: 'call_1', name: 'search', arguments: { query: 'test' }, state: 'complete' },
 *   ],
 *   usage: { inputTokens: 100, outputTokens: 50 },
 *   stopReason: 'tool_use',
 * };
 * ```
 */
export interface AssistantMessage {
  /** Ordered parts of the message (text, reasoning, tool calls) */
  parts: StreamMessagePart[];
  /** Token usage statistics (if available) */
  usage?: Usage;
  /** Reason why generation stopped */
  stopReason?: StopReason;
  /** Citations/grounding chunks (if available) */
  citations?: GroundingChunk[];
}

// =============================================================================
// T006: CollectorAction Discriminated Union
// =============================================================================

/**
 * Actions that can be taken in response to stream events
 *
 * Used by the collector to communicate what happened after processing
 * each event, enabling UI updates and state tracking.
 *
 * @example
 * ```typescript
 * const action = collector.processEvent(event);
 * switch (action.type) {
 *   case 'emit_text':
 *     process.stdout.write(action.content);
 *     break;
 *   case 'tool_call_started':
 *     console.log(`Tool ${action.name} started`);
 *     break;
 *   case 'stream_complete':
 *     console.log('Final message:', action.message);
 *     break;
 * }
 * ```
 */
export type CollectorAction =
  | { type: "none" }
  | { type: "emit_text"; content: string; index: number }
  | { type: "emit_reasoning"; content: string; index: number }
  | { type: "tool_call_started"; id: string; name: string; index: number }
  | { type: "tool_call_completed"; id: string; arguments: Record<string, unknown> }
  | { type: "emit_citations"; citations: GroundingChunk[] }
  | { type: "stream_complete"; message: AssistantMessage }
  | { type: "error"; code: string; message: string };

// =============================================================================
// T007 & T008: StreamCollector Implementation
// =============================================================================

/**
 * Internal state for tracking a tool call during streaming
 */
interface ToolCallState {
  /** Name of the tool being called */
  name: string;
  /** Accumulated JSON argument string */
  arguments: string;
  /** Content block index */
  index: number;
  /** Current state of the tool call */
  state: "pending" | "complete";
}

/**
 * Collector for building complete assistant messages from stream events
 *
 * Maintains internal state to accumulate text, reasoning, tool calls,
 * and metadata from incremental stream events. Produces actions that
 * can be used to update UI or trigger side effects.
 *
 * @example
 * ```typescript
 * const collector = new StreamCollector();
 *
 * for await (const event of stream) {
 *   const action = collector.processEvent(event);
 *   if (action.type === 'emit_text') {
 *     process.stdout.write(action.content);
 *   }
 * }
 *
 * const result = collector.build();
 * if (result.ok) {
 *   console.log('Complete message:', result.value);
 * }
 * ```
 */
export class StreamCollector {
  /** Text content buffers indexed by content block */
  private textBuffers: Map<number, string> = new Map();

  /** Reasoning content buffers indexed by content block */
  private reasoningBuffers: Map<number, string> = new Map();

  /** Tool call states indexed by tool call ID */
  private toolCalls: Map<string, ToolCallState> = new Map();

  /** Collected citations */
  private citations: GroundingChunk[] = [];

  /** Token usage statistics */
  private usage?: Usage;

  /** Stop reason from end event */
  private stopReason?: StopReason;

  /** Track next available index for parts without explicit index */
  private nextTextIndex = 0;
  private nextReasoningIndex = 0;

  /**
   * Process a stream event and return the action to take
   *
   * @param event - The stream event to process
   * @returns Action describing what happened
   */
  processEvent(event: StreamEvent): CollectorAction {
    switch (event.type) {
      case "text":
        return this.handleText(event.content, event.index);

      case "reasoning":
        return this.handleReasoning(event.content, event.index);

      case "tool_call_start":
        return this.handleToolCallStart(event.id, event.name, event.index);

      case "tool_call_delta":
        return this.handleToolCallDelta(event.id, event.arguments);

      case "tool_call_end":
        return this.handleToolCallEnd(event.id);

      case "citation":
        return this.handleCitation(event.chunk);

      case "usage":
        this.usage = {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cacheReadTokens: event.cacheReadTokens,
          cacheWriteTokens: event.cacheWriteTokens,
        };
        return { type: "none" };

      case "end":
        this.stopReason = event.stopReason;
        return this.buildCompleteAction();

      case "done":
        // Legacy done event
        this.stopReason = event.stopReason;
        return this.buildCompleteAction();

      case "error":
        return {
          type: "error",
          code: event.code,
          message: event.message,
        };

      // Legacy and MCP events - pass through without action
      case "toolCall":
        // Complete tool call from legacy format
        this.toolCalls.set(event.id, {
          name: event.name,
          arguments: JSON.stringify(event.input),
          index: this.toolCalls.size,
          state: "complete",
        });
        return {
          type: "tool_call_completed",
          id: event.id,
          arguments: event.input,
        };

      case "toolCallDelta":
        // Legacy incremental tool call
        return this.handleLegacyToolCallDelta(event.id, event.name, event.inputDelta);

      case "mcp_tool_start":
      case "mcp_tool_progress":
      case "mcp_tool_end":
        // MCP events are handled externally
        return { type: "none" };

      default:
        return { type: "none" };
    }
  }

  /**
   * Handle text delta event
   */
  private handleText(content: string, index?: number): CollectorAction {
    const idx = index ?? this.nextTextIndex++;
    const existing = this.textBuffers.get(idx) ?? "";
    this.textBuffers.set(idx, existing + content);
    return { type: "emit_text", content, index: idx };
  }

  /**
   * Handle reasoning delta event
   */
  private handleReasoning(content: string, index?: number): CollectorAction {
    const idx = index ?? this.nextReasoningIndex++;
    const existing = this.reasoningBuffers.get(idx) ?? "";
    this.reasoningBuffers.set(idx, existing + content);
    return { type: "emit_reasoning", content, index: idx };
  }

  /**
   * Handle tool call start event
   */
  private handleToolCallStart(id: string, name: string, index: number): CollectorAction {
    this.toolCalls.set(id, {
      name,
      arguments: "",
      index,
      state: "pending",
    });
    return { type: "tool_call_started", id, name, index };
  }

  /**
   * Handle tool call delta event
   */
  private handleToolCallDelta(id: string, args: string): CollectorAction {
    const state = this.toolCalls.get(id);
    if (state) {
      state.arguments += args;
    }
    // Delta events don't produce an action
    return { type: "none" };
  }

  /**
   * Handle tool call end event
   */
  private handleToolCallEnd(id: string): CollectorAction {
    const state = this.toolCalls.get(id);
    if (!state) {
      return { type: "none" };
    }

    state.state = "complete";

    // Parse arguments
    let parsedArgs: Record<string, unknown> = {};
    if (state.arguments.length > 0) {
      try {
        parsedArgs = JSON.parse(state.arguments);
      } catch {
        // Invalid JSON, keep empty object
      }
    }

    return { type: "tool_call_completed", id, arguments: parsedArgs };
  }

  /**
   * Handle legacy tool call delta event
   */
  private handleLegacyToolCallDelta(
    id: string,
    name: string | undefined,
    inputDelta: string
  ): CollectorAction {
    let state = this.toolCalls.get(id);
    if (!state) {
      state = {
        name: name ?? "",
        arguments: "",
        index: this.toolCalls.size,
        state: "pending",
      };
      this.toolCalls.set(id, state);
    }

    if (name && !state.name) {
      state.name = name;
    }
    state.arguments += inputDelta;

    return { type: "none" };
  }

  /**
   * Handle citation event
   */
  private handleCitation(chunk: GroundingChunk): CollectorAction {
    this.citations.push(chunk);
    return { type: "emit_citations", citations: [chunk] };
  }

  /**
   * Build the stream complete action
   */
  private buildCompleteAction(): CollectorAction {
    const result = this.build();
    if (result.ok) {
      return { type: "stream_complete", message: result.value };
    }
    // Build currently never fails, but handle error case for future-proofing
    return { type: "error", code: "BUILD_FAILED", message: "Failed to build message" };
  }

  /**
   * Build final AssistantMessage from accumulated state
   *
   * @returns Result containing the complete message or an error
   */
  build(): Result<AssistantMessage, string> {
    const parts: StreamMessagePart[] = [];

    // Convert text buffers to TextPart (sorted by index)
    const textEntries = Array.from(this.textBuffers.entries()).sort(([a], [b]) => a - b);
    for (const [, content] of textEntries) {
      if (content.length > 0) {
        parts.push({ type: "text", content });
      }
    }

    // Convert reasoning buffers to ReasoningPart (sorted by index)
    const reasoningEntries = Array.from(this.reasoningBuffers.entries()).sort(([a], [b]) => a - b);
    for (const [, content] of reasoningEntries) {
      if (content.length > 0) {
        parts.push({ type: "reasoning", content });
      }
    }

    // Convert tool calls to ToolPart (sorted by index)
    const toolEntries = Array.from(this.toolCalls.entries()).sort(
      ([, a], [, b]) => a.index - b.index
    );
    for (const [id, state] of toolEntries) {
      // Parse arguments
      let parsedArgs: Record<string, unknown> = {};
      if (state.arguments.length > 0) {
        try {
          parsedArgs = JSON.parse(state.arguments);
        } catch {
          // Invalid JSON, keep empty object
        }
      }

      parts.push({
        type: "tool",
        id,
        name: state.name,
        arguments: parsedArgs,
        state: state.state === "complete" ? "complete" : "pending",
      });
    }

    const message: AssistantMessage = {
      parts,
      usage: this.usage,
      stopReason: this.stopReason,
      citations: this.citations.length > 0 ? this.citations : undefined,
    };

    return Ok(message);
  }

  /**
   * Reset collector state for reuse
   *
   * Clears all accumulated data, allowing the collector to be
   * reused for a new stream without creating a new instance.
   */
  reset(): void {
    this.textBuffers.clear();
    this.reasoningBuffers.clear();
    this.toolCalls.clear();
    this.citations = [];
    this.usage = undefined;
    this.stopReason = undefined;
    this.nextTextIndex = 0;
    this.nextReasoningIndex = 0;
  }
}
