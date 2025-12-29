/**
 * Mappers Module
 *
 * Provides utilities for mapping provider-specific events to unified types.
 *
 * @module mappers
 */

// SSE Utilities
export {
  createSSEParser,
  isRetryable,
  parseSSE,
  RETRYABLE_STATUS_CODES,
  type RetryableStatusCode,
  type SSEEvent,
  type SSEParseError,
  type SSEParser,
} from "./sse.js";
// Types
export type {
  EventMapper,
  MapperError,
  MapperErrorCode,
  SSEParserConfig,
} from "./types.js";
