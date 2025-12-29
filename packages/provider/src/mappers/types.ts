/**
 * Mapper Types Module
 *
 * Provides interfaces for mapping provider-specific events to unified StreamEvent types.
 * Each provider implements EventMapper to normalize their response format.
 *
 * @module mappers/types
 */

import type { Result } from "@vellum/shared";
import type { StreamEvent } from "../types.js";

// =============================================================================
// T003: EventMapper Interface
// =============================================================================

/**
 * Maps provider-specific events to unified StreamEvent
 *
 * Implementations handle the conversion from provider-specific streaming formats
 * (e.g., Anthropic's message_delta, OpenAI's chunk format) to our unified StreamEvent union.
 *
 * @template TProviderEvent - The provider-specific event type
 *
 * @example
 * ```typescript
 * class AnthropicEventMapper implements EventMapper<AnthropicStreamEvent> {
 *   mapEvent(event: AnthropicStreamEvent): Result<StreamEvent[], MapperError> {
 *     switch (event.type) {
 *       case 'content_block_delta':
 *         if (event.delta.type === 'text_delta') {
 *           return Ok([{ type: 'text', text: event.delta.text }]);
 *         }
 *         break;
 *       // ... other cases
 *     }
 *     return Ok([]);
 *   }
 *
 *   reset(): void {
 *     this.accumulatedToolCalls.clear();
 *   }
 * }
 * ```
 */
export interface EventMapper<TProviderEvent> {
  /**
   * Map a raw provider event to unified StreamEvent(s)
   *
   * A single provider event may map to zero, one, or multiple StreamEvents.
   * For example, a message_stop event might emit both a usage event and a done event.
   *
   * @param event - The raw provider-specific event
   * @returns Result containing an array of StreamEvents or an error
   */
  mapEvent(event: TProviderEvent): Result<StreamEvent[], MapperError>;

  /**
   * Reset mapper state between streams
   *
   * Called when starting a new stream to clear any accumulated state
   * (e.g., partial tool call JSON, content block tracking).
   */
  reset(): void;
}

/**
 * Error that can occur during event mapping
 */
export interface MapperError {
  /** Error code for programmatic handling */
  code: MapperErrorCode;
  /** Human-readable error message */
  message: string;
  /** Original provider event that caused the error (if available) */
  originalEvent?: unknown;
}

/**
 * Error codes for mapper operations
 */
export type MapperErrorCode =
  | "invalid_event" // Event structure is malformed
  | "unknown_event_type" // Unrecognized event type
  | "parse_error" // Failed to parse event data (e.g., JSON)
  | "state_error"; // Invalid mapper state (e.g., tool delta without start)

// =============================================================================
// SSE Parser Configuration
// =============================================================================

/**
 * Configuration for SSE (Server-Sent Events) parsing
 *
 * Used to configure the SSE parser behavior for handling streaming responses.
 */
export interface SSEParserConfig {
  /**
   * Maximum buffer size for incomplete events in bytes
   *
   * SSE events may arrive split across multiple chunks. This sets the maximum
   * size of the buffer used to accumulate incomplete events.
   *
   * @default 65536 (64KB)
   */
  maxBufferSize?: number;

  /**
   * Custom line delimiter
   *
   * SSE spec uses \n, \r, or \r\n. Most implementations use \n.
   *
   * @default '\n'
   */
  lineDelimiter?: string;
}
