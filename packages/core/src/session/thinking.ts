// ============================================
// Thinking Handler for Extended Thinking
// ============================================

/**
 * Handles extended thinking/reasoning from LLM responses.
 *
 * Accumulates reasoning deltas and creates ReasoningPart with timestamps.
 * Emits events for reasoning lifecycle (start/delta/end).
 *
 * @module @vellum/core/session/thinking
 */

import type { SessionReasoningPart } from "./message.js";

// =============================================================================
// Event Types
// =============================================================================

/**
 * Event emitted when reasoning starts
 */
export interface ReasoningStartEvent {
  type: "reasoning-start";
  timestamp: number;
}

/**
 * Event emitted for each reasoning delta
 */
export interface ReasoningDeltaEvent {
  type: "reasoning-delta";
  text: string;
  timestamp: number;
}

/**
 * Event emitted when reasoning completes
 */
export interface ReasoningEndEvent {
  type: "reasoning-end";
  part: SessionReasoningPart;
  timestamp: number;
}

/**
 * Union of all thinking events
 */
export type ThinkingEvent = ReasoningStartEvent | ReasoningDeltaEvent | ReasoningEndEvent;

// =============================================================================
// Thinking Handler
// =============================================================================

/**
 * Handler state for accumulating reasoning content
 */
export interface ThinkingState {
  /** Whether reasoning is currently active */
  active: boolean;
  /** Accumulated reasoning text chunks */
  chunks: string[];
  /** Timestamp when reasoning started */
  startedAt?: number;
}

/**
 * Creates a new thinking state
 */
export function createThinkingState(): ThinkingState {
  return {
    active: false,
    chunks: [],
    startedAt: undefined,
  };
}

/**
 * Handles a reasoning delta from the stream.
 *
 * Accumulates reasoning text and emits appropriate events:
 * - reasoning-start: First delta received
 * - reasoning-delta: Each delta with text
 *
 * @param state - Current thinking state
 * @param text - Reasoning text delta
 * @returns Tuple of [updated state, events to emit]
 *
 * @example
 * ```typescript
 * let state = createThinkingState();
 * const [newState, events] = handleThinkingDelta(state, 'Let me think...');
 *
 * for (const event of events) {
 *   if (event.type === 'reasoning-start') {
 *     console.log('Reasoning started');
 *   } else if (event.type === 'reasoning-delta') {
 *     console.log('Reasoning:', event.text);
 *   }
 * }
 *
 * state = newState;
 * ```
 */
export function handleThinkingDelta(
  state: ThinkingState,
  text: string
): [ThinkingState, ThinkingEvent[]] {
  const events: ThinkingEvent[] = [];
  const now = Date.now();

  let newState = { ...state };

  // Emit start event on first delta
  if (!state.active) {
    newState = {
      ...newState,
      active: true,
      startedAt: now,
    };

    events.push({
      type: "reasoning-start",
      timestamp: now,
    });
  }

  // Accumulate chunk and emit delta
  newState = {
    ...newState,
    chunks: [...newState.chunks, text],
  };

  events.push({
    type: "reasoning-delta",
    text,
    timestamp: now,
  });

  return [newState, events];
}

/**
 * Finalizes reasoning and creates a SessionReasoningPart.
 *
 * Should be called when the stream indicates reasoning is complete.
 *
 * @param state - Current thinking state
 * @returns Tuple of [reset state, end event or null]
 *
 * @example
 * ```typescript
 * const [newState, endEvent] = finalizeThinking(state);
 * if (endEvent) {
 *   message.parts.push(endEvent.part);
 * }
 * ```
 */
export function finalizeThinking(state: ThinkingState): [ThinkingState, ReasoningEndEvent | null] {
  if (!state.active || state.chunks.length === 0) {
    return [createThinkingState(), null];
  }

  const now = Date.now();
  const part: SessionReasoningPart = {
    type: "reasoning",
    text: state.chunks.join(""),
    startedAt: state.startedAt,
    completedAt: now,
  };

  const event: ReasoningEndEvent = {
    type: "reasoning-end",
    part,
    timestamp: now,
  };

  return [createThinkingState(), event];
}

// =============================================================================
// Unified Handler
// =============================================================================

/**
 * Unified handler for processing thinking events from a stream.
 *
 * Processes reasoning events and yields ThinkingEvents.
 *
 * @param isReasoning - Whether the current event is a reasoning event
 * @param text - Text content (if any)
 * @param state - Current thinking state
 * @param isComplete - Whether the stream is complete
 * @returns Generator yielding thinking events
 *
 * @example
 * ```typescript
 * let thinkingState = createThinkingState();
 *
 * for await (const streamEvent of providerStream) {
 *   const isReasoning = streamEvent.type === 'reasoning';
 *   const text = isReasoning ? streamEvent.text : undefined;
 *
 *   for (const thinkingEvent of handleThinking(
 *     isReasoning,
 *     text,
 *     thinkingState,
 *     streamEvent.type === 'done'
 *   )) {
 *     emit(thinkingEvent);
 *   }
 * }
 * ```
 */
export function* handleThinking(
  isReasoning: boolean,
  text: string | undefined,
  state: ThinkingState,
  isComplete: boolean
): Generator<ThinkingEvent & { newState: ThinkingState }, void, undefined> {
  let currentState = state;

  // Handle reasoning delta
  if (isReasoning && text) {
    const [newState, events] = handleThinkingDelta(currentState, text);
    currentState = newState;

    for (const event of events) {
      yield { ...event, newState: currentState };
    }
  }

  // Handle completion
  if (isComplete && currentState.active) {
    const [newState, endEvent] = finalizeThinking(currentState);
    currentState = newState;

    if (endEvent) {
      yield { ...endEvent, newState: currentState };
    }
  }

  // Handle transition from reasoning to non-reasoning
  if (!isReasoning && currentState.active && !isComplete) {
    const [newState, endEvent] = finalizeThinking(currentState);
    currentState = newState;

    if (endEvent) {
      yield { ...endEvent, newState: currentState };
    }
  }
}

// =============================================================================
// Thinking Handler Class
// =============================================================================

/**
 * Stateful handler for extended thinking.
 *
 * Provides a class-based API for processing reasoning events.
 *
 * @example
 * ```typescript
 * const handler = new ThinkingHandler();
 *
 * for await (const event of stream) {
 *   if (event.type === 'reasoning') {
 *     for (const thinkingEvent of handler.process(event.text)) {
 *       emit(thinkingEvent);
 *     }
 *   }
 * }
 *
 * // Finalize at end of stream
 * const endEvent = handler.finalize();
 * if (endEvent) {
 *   emit(endEvent);
 * }
 * ```
 */
export class ThinkingHandler {
  private state: ThinkingState;

  constructor() {
    this.state = createThinkingState();
  }

  /**
   * Check if reasoning is currently active
   */
  get isActive(): boolean {
    return this.state.active;
  }

  /**
   * Get accumulated reasoning text
   */
  get accumulatedText(): string {
    return this.state.chunks.join("");
  }

  /**
   * Process a reasoning delta
   *
   * @param text - Reasoning text delta
   * @returns Array of events to emit
   */
  process(text: string): ThinkingEvent[] {
    const [newState, events] = handleThinkingDelta(this.state, text);
    this.state = newState;
    return events;
  }

  /**
   * Finalize reasoning and get the end event
   *
   * @returns End event with SessionReasoningPart or null
   */
  finalize(): ReasoningEndEvent | null {
    const [newState, event] = finalizeThinking(this.state);
    this.state = newState;
    return event;
  }

  /**
   * Reset the handler state
   */
  reset(): void {
    this.state = createThinkingState();
  }
}
