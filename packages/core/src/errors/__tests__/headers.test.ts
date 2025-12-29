// ============================================
// Vellum Retry Headers Parsing Tests
// T021 - parseRetryHeaders tests
// ============================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseRetryHeaders, type RetryHeadersResult } from "../headers.js";

describe("parseRetryHeaders", () => {
  let mockDateNow: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock Date.now to return a fixed timestamp for predictable tests
    mockDateNow = vi.spyOn(Date, "now").mockReturnValue(1640000000000); // 2021-12-20T11:33:20.000Z
  });

  afterEach(() => {
    mockDateNow.mockRestore();
  });

  describe("with Headers object", () => {
    it("returns null when no retry headers are present", () => {
      const headers = new Headers();
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: null,
        source: null,
      });
    });

    it("AC-005-1: parses retry-after-ms as milliseconds directly", () => {
      const headers = new Headers();
      headers.set("retry-after-ms", "5000");
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 5000,
        source: "retry-after-ms",
      });
    });

    it("AC-005-2: parses retry-after as seconds → ms", () => {
      const headers = new Headers();
      headers.set("retry-after", "120");
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 120000,
        source: "retry-after",
      });
    });

    it("AC-005-3: parses HTTP-date retry-after and calculates delay", () => {
      const headers = new Headers();
      // Set a date 60 seconds in the future from our mocked Date.now
      const futureDate = new Date(1640000000000 + 60000);
      headers.set("retry-after", futureDate.toUTCString());
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 60000,
        source: "retry-after",
      });
    });

    it("AC-005-4: parses x-ratelimit-reset as Unix timestamp", () => {
      const headers = new Headers();
      // Set a timestamp 30 seconds in the future
      const futureTimestamp = Math.floor((1640000000000 + 30000) / 1000);
      headers.set("x-ratelimit-reset", futureTimestamp.toString());
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 30000,
        source: "x-ratelimit-reset",
      });
    });

    it("AC-005-5: priority - retry-after-ms > retry-after", () => {
      const headers = new Headers();
      headers.set("retry-after-ms", "1000");
      headers.set("retry-after", "60");
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 1000,
        source: "retry-after-ms",
      });
    });

    it("AC-005-5: priority - retry-after > x-ratelimit-reset", () => {
      const headers = new Headers();
      headers.set("retry-after", "30");
      const futureTimestamp = Math.floor((1640000000000 + 60000) / 1000);
      headers.set("x-ratelimit-reset", futureTimestamp.toString());
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 30000,
        source: "retry-after",
      });
    });

    it("AC-005-5: priority - retry-after-ms > retry-after > x-ratelimit-reset", () => {
      const headers = new Headers();
      headers.set("retry-after-ms", "500");
      headers.set("retry-after", "30");
      const futureTimestamp = Math.floor((1640000000000 + 60000) / 1000);
      headers.set("x-ratelimit-reset", futureTimestamp.toString());
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 500,
        source: "retry-after-ms",
      });
    });

    it("returns 0 for HTTP-date in the past", () => {
      const headers = new Headers();
      const pastDate = new Date(1640000000000 - 60000);
      headers.set("retry-after", pastDate.toUTCString());
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 0,
        source: "retry-after",
      });
    });

    it("returns 0 for x-ratelimit-reset in the past", () => {
      const headers = new Headers();
      const pastTimestamp = Math.floor((1640000000000 - 60000) / 1000);
      headers.set("x-ratelimit-reset", pastTimestamp.toString());
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 0,
        source: "x-ratelimit-reset",
      });
    });

    it("skips invalid retry-after-ms and falls back to retry-after", () => {
      const headers = new Headers();
      headers.set("retry-after-ms", "invalid");
      headers.set("retry-after", "10");
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 10000,
        source: "retry-after",
      });
    });

    it("skips negative values", () => {
      const headers = new Headers();
      headers.set("retry-after-ms", "-100");
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: null,
        source: null,
      });
    });
  });

  describe("with Record<string, string>", () => {
    it("parses headers from a plain object", () => {
      const headers = { "retry-after-ms": "2500" };
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 2500,
        source: "retry-after-ms",
      });
    });

    it("handles case-insensitive header names", () => {
      const headers = { "Retry-After-Ms": "3000" };
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 3000,
        source: "retry-after-ms",
      });
    });

    it("handles mixed case header names", () => {
      const headers = {
        "RETRY-AFTER-MS": "1000",
        "Retry-After": "60",
      };
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 1000,
        source: "retry-after-ms",
      });
    });

    it("parses x-ratelimit-reset from object", () => {
      const headers = {
        "X-RateLimit-Reset": Math.floor((1640000000000 + 45000) / 1000).toString(),
      };
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 45000,
        source: "x-ratelimit-reset",
      });
    });
  });

  describe("edge cases", () => {
    it("handles empty string values", () => {
      const headers = new Headers();
      headers.set("retry-after", "");
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: null,
        source: null,
      });
    });

    it("handles zero as valid value", () => {
      const headers = new Headers();
      headers.set("retry-after-ms", "0");
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 0,
        source: "retry-after-ms",
      });
    });

    it("handles very large values", () => {
      const headers = new Headers();
      headers.set("retry-after-ms", "9999999999");
      const result = parseRetryHeaders(headers);

      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 9999999999,
        source: "retry-after-ms",
      });
    });

    it("handles retry-after with leading/trailing spaces", () => {
      const headers = new Headers();
      headers.set("retry-after", "  60  ");
      const result = parseRetryHeaders(headers);

      // parseInt handles leading spaces, so it should parse
      expect(result).toEqual<RetryHeadersResult>({
        retryAfterMs: 60000,
        source: "retry-after",
      });
    });
  });
});
