/**
 * SSE (Server-Sent Events) Parsing Utilities
 *
 * Provides utilities for parsing SSE formatted data from streaming responses.
 * Implements the SSE specification for handling event streams from LLM providers.
 *
 * @module mappers/sse
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */

import { Err, Ok, type Result } from "@vellum/shared";

// =============================================================================
// T038: SSE Types
// =============================================================================

/**
 * Parsed SSE event
 *
 * Represents a single event parsed from an SSE stream.
 * Fields correspond to the SSE specification.
 *
 * @example
 * ```typescript
 * // Input SSE data:
 * // event: message
 * // data: {"type": "text", "text": "Hello"}
 * // id: 1
 * //
 * // Parsed result:
 * const event: SSEEvent = {
 *   event: 'message',
 *   data: '{"type": "text", "text": "Hello"}',
 *   id: '1',
 * };
 * ```
 */
export interface SSEEvent {
  /** Event type (from 'event:' field) */
  event?: string;
  /** Event data (from 'data:' field, may span multiple lines) */
  data: string;
  /** Event ID (from 'id:' field) */
  id?: string;
  /** Retry delay in milliseconds (from 'retry:' field) */
  retry?: number;
}

/**
 * Error that can occur during SSE parsing
 */
export interface SSEParseError {
  /** Error code */
  code: "buffer_overflow" | "invalid_format" | "decode_error";
  /** Human-readable message */
  message: string;
  /** Byte offset where error occurred (if applicable) */
  offset?: number;
}

// =============================================================================
// T038: Retryable Error Detection
// =============================================================================

/**
 * HTTP status codes that indicate a retryable error
 *
 * These status codes typically indicate temporary conditions that may resolve:
 * - 429: Too Many Requests (rate limiting)
 * - 500: Internal Server Error
 * - 502: Bad Gateway
 * - 503: Service Unavailable
 * - 504: Gateway Timeout
 */
export const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504] as const;

/**
 * Type for retryable status codes
 */
export type RetryableStatusCode = (typeof RETRYABLE_STATUS_CODES)[number];

/**
 * Check if an error is retryable
 *
 * An error is considered retryable if it represents a temporary condition
 * that may resolve on retry, such as:
 * - Network errors (connection reset, timeout)
 * - Rate limiting (429 status)
 * - Server errors (5xx status)
 *
 * @param error - The error to check
 * @returns true if the error is retryable
 *
 * @example
 * ```typescript
 * try {
 *   await provider.stream(params);
 * } catch (error) {
 *   if (isRetryable(error)) {
 *     // Implement retry with exponential backoff
 *     await delay(1000);
 *     return retry();
 *   }
 *   throw error;
 * }
 * ```
 */
export function isRetryable(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false;
  }

  // Check for HTTP status code
  if (typeof error === "object") {
    const errorObj = error as Record<string, unknown>;

    // Check status/statusCode property
    const status = errorObj.status ?? errorObj.statusCode;
    if (typeof status === "number") {
      return (RETRYABLE_STATUS_CODES as readonly number[]).includes(status);
    }

    // Check for nested response.status
    if (typeof errorObj.response === "object" && errorObj.response !== null) {
      const response = errorObj.response as Record<string, unknown>;
      if (typeof response.status === "number") {
        return (RETRYABLE_STATUS_CODES as readonly number[]).includes(response.status);
      }
    }

    // Check for common network error codes
    const code = errorObj.code;
    if (typeof code === "string") {
      const networkErrorCodes = [
        "ECONNRESET",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "ENOTFOUND",
        "ENETUNREACH",
        "EAI_AGAIN",
        "EPIPE",
        "EHOSTUNREACH",
      ];
      return networkErrorCodes.includes(code);
    }

    // Check error message for common patterns
    const message = errorObj.message;
    if (typeof message === "string") {
      const retryablePatterns = [
        /rate limit/i,
        /too many requests/i,
        /timeout/i,
        /connection reset/i,
        /network error/i,
        /temporarily unavailable/i,
        /service unavailable/i,
        /internal server error/i,
        /bad gateway/i,
        /gateway timeout/i,
      ];
      return retryablePatterns.some((pattern) => pattern.test(message));
    }
  }

  return false;
}

// =============================================================================
// T038: SSE Parsing
// =============================================================================

/** Default maximum buffer size (64KB) */
const DEFAULT_MAX_BUFFER_SIZE = 65536;

/** Text decoder for UTF-8 */
const textDecoder = new TextDecoder("utf-8");

/**
 * Parse SSE formatted data from a Uint8Array buffer
 *
 * Extracts complete SSE events from the buffer. Events are delimited by
 * blank lines (double newline). Incomplete events at the end of the buffer
 * are not returned - accumulate chunks and re-parse.
 *
 * @param buffer - Raw bytes from the SSE stream
 * @param maxBufferSize - Maximum allowed buffer size (default: 64KB)
 * @returns Result containing parsed events or an error
 *
 * @example
 * ```typescript
 * const chunk = new TextEncoder().encode(
 *   'event: message\ndata: {"text":"Hello"}\n\n'
 * );
 *
 * const result = parseSSE(chunk);
 * if (result.ok) {
 *   for (const event of result.value) {
 *     console.log(event.event, event.data);
 *   }
 * }
 * ```
 */
export function parseSSE(
  buffer: Uint8Array,
  maxBufferSize: number = DEFAULT_MAX_BUFFER_SIZE
): Result<SSEEvent[], SSEParseError> {
  // Check buffer size
  if (buffer.length > maxBufferSize) {
    return Err({
      code: "buffer_overflow",
      message: `Buffer size ${buffer.length} exceeds maximum ${maxBufferSize}`,
    });
  }

  // Decode buffer to string
  let text: string;
  try {
    text = textDecoder.decode(buffer);
  } catch {
    return Err({
      code: "decode_error",
      message: "Failed to decode buffer as UTF-8",
    });
  }

  const events: SSEEvent[] = [];

  // Split by double newline (event boundary)
  // Handle both \n\n and \r\n\r\n
  const rawEvents = text.split(/\n\n|\r\n\r\n/);

  // Process each complete event (last may be incomplete)
  for (let i = 0; i < rawEvents.length; i++) {
    const rawEventRaw = rawEvents[i];
    if (rawEventRaw === undefined) {
      continue;
    }
    const rawEvent = rawEventRaw.trim();

    // Skip empty events
    if (!rawEvent) {
      continue;
    }

    // Skip if this is the last chunk and doesn't end with newline
    // (incomplete event)
    if (i === rawEvents.length - 1 && !text.endsWith("\n\n") && !text.endsWith("\r\n\r\n")) {
      continue;
    }

    // Parse the event
    const event = parseSSEEvent(rawEvent);
    if (event) {
      events.push(event);
    }
  }

  return Ok(events);
}

/**
 * Parse a single SSE event from its text representation
 *
 * @param text - Raw event text (without trailing blank line)
 * @returns Parsed SSEEvent or undefined if invalid
 */
function parseSSEEvent(text: string): SSEEvent | undefined {
  const lines = text.split(/\n|\r\n/);

  let event: string | undefined;
  const dataLines: string[] = [];
  let id: string | undefined;
  let retry: number | undefined;

  for (const line of lines) {
    // Skip comments
    if (line.startsWith(":")) {
      continue;
    }

    // Find field separator
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      // Field with no value
      continue;
    }

    const field = line.slice(0, colonIndex);
    // Value starts after colon, strip leading space if present
    let value = line.slice(colonIndex + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    switch (field) {
      case "event":
        event = value;
        break;
      case "data":
        dataLines.push(value);
        break;
      case "id":
        // Ignore IDs containing null character per spec
        if (!value.includes("\0")) {
          id = value;
        }
        break;
      case "retry": {
        const parsed = parseInt(value, 10);
        if (!Number.isNaN(parsed) && parsed >= 0) {
          retry = parsed;
        }
        break;
      }
      // Ignore unknown fields per spec
    }
  }

  // Must have data to be a valid event
  if (dataLines.length === 0) {
    return undefined;
  }

  return {
    event,
    data: dataLines.join("\n"),
    id,
    retry,
  };
}

/**
 * Create an SSE line parser for incremental parsing
 *
 * Useful when processing SSE data chunk-by-chunk where events
 * may span multiple chunks.
 *
 * @returns Parser state object with parse() and flush() methods
 *
 * @example
 * ```typescript
 * const parser = createSSEParser();
 *
 * for await (const chunk of response.body) {
 *   const events = parser.parse(chunk);
 *   for (const event of events) {
 *     handleEvent(event);
 *   }
 * }
 *
 * // Get any remaining events
 * const remaining = parser.flush();
 * ```
 */
export function createSSEParser(maxBufferSize: number = DEFAULT_MAX_BUFFER_SIZE): SSEParser {
  let buffer = "";

  return {
    /**
     * Parse a chunk of SSE data
     *
     * @param chunk - Raw bytes or string to parse
     * @returns Array of complete events parsed from this chunk
     */
    parse(chunk: Uint8Array | string): SSEEvent[] {
      const text = typeof chunk === "string" ? chunk : textDecoder.decode(chunk);
      buffer += text;

      // Check buffer overflow
      if (buffer.length > maxBufferSize) {
        buffer = "";
        throw new Error(`SSE buffer overflow: exceeded ${maxBufferSize} bytes`);
      }

      const events: SSEEvent[] = [];

      // Look for complete events (double newline)
      let boundary = buffer.indexOf("\n\n");
      if (boundary === -1) {
        boundary = buffer.indexOf("\r\n\r\n");
      }

      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + (buffer[boundary + 1] === "\r" ? 4 : 2));

        if (rawEvent) {
          const event = parseSSEEvent(rawEvent);
          if (event) {
            events.push(event);
          }
        }

        boundary = buffer.indexOf("\n\n");
        if (boundary === -1) {
          boundary = buffer.indexOf("\r\n\r\n");
        }
      }

      return events;
    },

    /**
     * Flush any remaining data in the buffer
     *
     * Call this when the stream ends to process any final incomplete event.
     *
     * @returns Array of remaining events (usually 0 or 1)
     */
    flush(): SSEEvent[] {
      const events: SSEEvent[] = [];

      if (buffer.trim()) {
        const event = parseSSEEvent(buffer.trim());
        if (event) {
          events.push(event);
        }
      }

      buffer = "";
      return events;
    },

    /**
     * Reset parser state
     */
    reset(): void {
      buffer = "";
    },
  };
}

/**
 * Incremental SSE parser interface
 */
export interface SSEParser {
  /** Parse a chunk of SSE data */
  parse(chunk: Uint8Array | string): SSEEvent[];
  /** Flush remaining buffer contents */
  flush(): SSEEvent[];
  /** Reset parser state */
  reset(): void;
}
