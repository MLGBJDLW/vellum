/**
 * Logger decorators and utilities for structured logging.
 *
 * @module logger/decorators
 */

/**
 * Context object for tracking request lifecycle.
 * Provides requestId, timing, and serialization helpers.
 *
 * @example
 * ```typescript
 * const ctx = new RequestContext('req-123');
 * // ... process request ...
 * logger.info('Request complete', ctx.toLogContext());
 * // Output: { requestId: 'req-123', durationMs: 150 }
 * ```
 */
export class RequestContext {
  /**
   * Create a new request context.
   * @param requestId - Unique identifier for the request
   * @param startTime - Start timestamp in ms (defaults to Date.now())
   */
  constructor(
    public requestId: string,
    public startTime: number = Date.now()
  ) {}

  /**
   * Get elapsed time since context creation.
   * @returns Duration in milliseconds
   */
  getDuration(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Convert context to a log-friendly object.
   * @returns Object with requestId and durationMs
   */
  toLogContext(): Record<string, unknown> {
    return {
      requestId: this.requestId,
      durationMs: this.getDuration(),
    };
  }
}

/**
 * Serialize an error into a structured log-safe format.
 * Handles both Error objects and arbitrary values.
 *
 * @param error - The error to serialize (Error or any value)
 * @returns Structured object with error details
 *
 * @example
 * ```typescript
 * serializeError(new Error('failed'));
 * // { name: 'Error', message: 'failed', stack: '...' }
 *
 * serializeError('string error');
 * // { raw: 'string error' }
 * ```
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { raw: String(error) };
}

/**
 * Default maximum string length before truncation.
 */
const DEFAULT_MAX_STRING_LENGTH = 1000;

/**
 * Sanitize data for safe logging by limiting depth and truncating strings.
 * Prevents log bloat from large objects or circular references.
 *
 * @param data - The data to sanitize
 * @param maxDepth - Maximum object nesting depth (default: 3)
 * @param maxStringLength - Maximum string length before truncation (default: 1000)
 * @returns Sanitized copy of the data
 *
 * @example
 * ```typescript
 * sanitizeData({ nested: { deep: { value: 'x'.repeat(2000) } } }, 2);
 * // { nested: { deep: '[Max depth exceeded]' } }
 *
 * sanitizeData('x'.repeat(2000));
 * // 'xxxxxxx...[truncated 1000 chars]'
 * ```
 */
export function sanitizeData(
  data: unknown,
  maxDepth: number = 3,
  maxStringLength: number = DEFAULT_MAX_STRING_LENGTH
): unknown {
  return sanitizeRecursive(data, 0, maxDepth, maxStringLength, new WeakSet());
}

/**
 * Internal recursive sanitization helper.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Recursive sanitization requires comprehensive type handling
function sanitizeRecursive(
  data: unknown,
  currentDepth: number,
  maxDepth: number,
  maxStringLength: number,
  seen: WeakSet<object>
): unknown {
  // Handle null/undefined
  if (data === null || data === undefined) {
    return data;
  }

  // Handle primitives
  if (typeof data === "string") {
    if (data.length > maxStringLength) {
      const truncated = maxStringLength - 30; // Leave room for suffix
      return `${data.slice(0, truncated)}...[truncated ${data.length - truncated} chars]`;
    }
    return data;
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return data;
  }

  if (typeof data === "bigint") {
    return data.toString();
  }

  if (typeof data === "symbol") {
    return data.toString();
  }

  if (typeof data === "function") {
    return `[Function: ${data.name || "anonymous"}]`;
  }

  // Handle objects and arrays
  if (typeof data === "object") {
    // Check for max depth
    if (currentDepth >= maxDepth) {
      return "[Max depth exceeded]";
    }

    // Check for circular references
    if (seen.has(data)) {
      return "[Circular reference]";
    }
    seen.add(data);

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map((item) =>
        sanitizeRecursive(item, currentDepth + 1, maxDepth, maxStringLength, seen)
      );
    }

    // Handle Date
    if (data instanceof Date) {
      return data.toISOString();
    }

    // Handle Error
    if (data instanceof Error) {
      return serializeError(data);
    }

    // Handle plain objects
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
      result[key] = sanitizeRecursive(
        (data as Record<string, unknown>)[key],
        currentDepth + 1,
        maxDepth,
        maxStringLength,
        seen
      );
    }
    return result;
  }

  // Fallback for unknown types
  return String(data);
}
