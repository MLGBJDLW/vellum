/**
 * Mappers Module
 *
 * Provides utilities for mapping provider-specific events to unified types.
 *
 * @module mappers
 */

// Types
export type {
  EventMapper,
  MapperError,
  MapperErrorCode,
  SSEParserConfig,
} from "./types.js";

// SSE Utilities
export {
  parseSSE,
  createSSEParser,
  isRetryable,
  RETRYABLE_STATUS_CODES,
  type SSEEvent,
  type SSEParseError,
  type SSEParser,
  type RetryableStatusCode,
} from "./sse.js";
