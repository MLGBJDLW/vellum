// ============================================
// Vellum Retry Header Parsing
// T021 - Parse retry-related HTTP headers
// ============================================

/**
 * Result of parsing retry-related headers.
 */
export interface RetryHeadersResult {
  /** Parsed retry delay in milliseconds, or null if no valid header found */
  retryAfterMs: number | null;
  /** Which header the delay was parsed from, or null if none */
  source: "retry-after-ms" | "retry-after" | "x-ratelimit-reset" | null;
}

/**
 * Gets a header value from either Headers object or Record.
 * Header names are case-insensitive.
 */
function getHeader(headers: Headers | Record<string, string>, name: string): string | null {
  if (headers instanceof Headers) {
    return headers.get(name);
  }
  // Record lookup - check both exact and lowercase
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return null;
}

/**
 * Parses an HTTP-date string into a Date object.
 * Format: "Wed, 21 Oct 2015 07:28:00 GMT"
 *
 * @param dateStr - HTTP-date formatted string
 * @returns Date object or null if invalid
 */
function parseHttpDate(dateStr: string): Date | null {
  const parsed = Date.parse(dateStr);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed);
}

/**
 * Parses the retry-after-ms header (milliseconds directly).
 * AC-005-1: retry-after-ms parsed as milliseconds directly
 *
 * @param value - Header value
 * @returns Milliseconds or null if invalid
 */
function parseRetryAfterMs(value: string): number | null {
  const ms = Number.parseInt(value, 10);
  if (Number.isNaN(ms) || ms < 0) {
    return null;
  }
  return ms;
}

/**
 * Parses the retry-after header (seconds or HTTP-date).
 * AC-005-2: retry-after parsed as seconds → ms
 * AC-005-3: HTTP-date retry-after calculated to ms
 *
 * @param value - Header value (seconds as integer or HTTP-date string)
 * @returns Milliseconds or null if invalid
 */
function parseRetryAfter(value: string): number | null {
  // Try parsing as seconds first (more common)
  const seconds = Number.parseInt(value, 10);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    // It's a valid number - treat as seconds
    // Check if the string is purely numeric
    if (/^\d+$/.test(value.trim())) {
      return seconds * 1000;
    }
  }

  // Try parsing as HTTP-date
  const date = parseHttpDate(value);
  if (date) {
    const now = Date.now();
    const delayMs = date.getTime() - now;
    // Return 0 if the date is in the past
    return Math.max(0, delayMs);
  }

  return null;
}

/**
 * Parses the x-ratelimit-reset header (Unix timestamp).
 * AC-005-4: x-ratelimit-reset parsed as Unix timestamp
 *
 * @param value - Header value (Unix timestamp in seconds)
 * @returns Milliseconds until reset or null if invalid
 */
function parseRateLimitReset(value: string): number | null {
  const timestamp = Number.parseInt(value, 10);
  if (Number.isNaN(timestamp) || timestamp < 0) {
    return null;
  }

  // Convert Unix timestamp (seconds) to milliseconds and calculate delay
  const resetTimeMs = timestamp * 1000;
  const now = Date.now();
  const delayMs = resetTimeMs - now;

  // Return 0 if the reset time is in the past
  return Math.max(0, delayMs);
}

/**
 * Parses retry-related HTTP headers with priority ordering.
 *
 * AC-005-5 Priority order:
 * 1. retry-after-ms (milliseconds directly)
 * 2. retry-after (seconds or HTTP-date)
 * 3. x-ratelimit-reset (Unix timestamp)
 *
 * @param headers - HTTP headers as Headers object or Record
 * @returns RetryHeadersResult with parsed delay and source
 *
 * @example
 * ```typescript
 * const response = await fetch(url);
 * const result = parseRetryHeaders(response.headers);
 * if (result.retryAfterMs !== null) {
 *   await sleep(result.retryAfterMs);
 * }
 * ```
 */
export function parseRetryHeaders(headers: Headers | Record<string, string>): RetryHeadersResult {
  // Priority 1: retry-after-ms (AC-005-1)
  const retryAfterMsHeader = getHeader(headers, "retry-after-ms");
  if (retryAfterMsHeader) {
    const ms = parseRetryAfterMs(retryAfterMsHeader);
    if (ms !== null) {
      return { retryAfterMs: ms, source: "retry-after-ms" };
    }
  }

  // Priority 2: retry-after (AC-005-2, AC-005-3)
  const retryAfterHeader = getHeader(headers, "retry-after");
  if (retryAfterHeader) {
    const ms = parseRetryAfter(retryAfterHeader);
    if (ms !== null) {
      return { retryAfterMs: ms, source: "retry-after" };
    }
  }

  // Priority 3: x-ratelimit-reset (AC-005-4)
  const rateLimitResetHeader = getHeader(headers, "x-ratelimit-reset");
  if (rateLimitResetHeader) {
    const ms = parseRateLimitReset(rateLimitResetHeader);
    if (ms !== null) {
      return { retryAfterMs: ms, source: "x-ratelimit-reset" };
    }
  }

  // No valid retry header found
  return { retryAfterMs: null, source: null };
}
