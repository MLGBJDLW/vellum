// ============================================
// Vellum Network Error Detection Tests
// T023 - isNetworkError and wrapNetworkError tests
// ============================================

import { describe, expect, it } from "vitest";
import {
  getNetworkErrorCode,
  isNetworkError,
  maybeWrapNetworkError,
  NETWORK_ERROR_CODES,
  NetworkError,
  wrapNetworkError,
} from "../network.js";
import { ErrorCode, ErrorSeverity } from "../types.js";

describe("Network Error Detection", () => {
  describe("isNetworkError", () => {
    it("AC-010-1: detects ECONNRESET as network error", () => {
      const error = new Error("Connection reset");
      (error as Error & { code: string }).code = "ECONNRESET";

      expect(isNetworkError(error)).toBe(true);
    });

    it("AC-010-1: detects ETIMEDOUT as network error", () => {
      const error = new Error("Connection timed out");
      (error as Error & { code: string }).code = "ETIMEDOUT";

      expect(isNetworkError(error)).toBe(true);
    });

    it("AC-010-1: detects ENOTFOUND as network error", () => {
      const error = new Error("DNS lookup failed");
      (error as Error & { code: string }).code = "ENOTFOUND";

      expect(isNetworkError(error)).toBe(true);
    });

    it("detects ECONNREFUSED as network error", () => {
      const error = new Error("Connection refused");
      (error as Error & { code: string }).code = "ECONNREFUSED";

      expect(isNetworkError(error)).toBe(true);
    });

    it("detects ENETUNREACH as network error", () => {
      const error = new Error("Network unreachable");
      (error as Error & { code: string }).code = "ENETUNREACH";

      expect(isNetworkError(error)).toBe(true);
    });

    it("detects EAI_AGAIN as network error", () => {
      const error = new Error("DNS lookup timed out");
      (error as Error & { code: string }).code = "EAI_AGAIN";

      expect(isNetworkError(error)).toBe(true);
    });

    it("detects EPIPE as network error", () => {
      const error = new Error("Broken pipe");
      (error as Error & { code: string }).code = "EPIPE";

      expect(isNetworkError(error)).toBe(true);
    });

    it("detects ECONNABORTED as network error", () => {
      const error = new Error("Connection aborted");
      (error as Error & { code: string }).code = "ECONNABORTED";

      expect(isNetworkError(error)).toBe(true);
    });

    it("returns false for errors without code property", () => {
      const error = new Error("Some error");

      expect(isNetworkError(error)).toBe(false);
    });

    it("returns false for unknown error codes", () => {
      const error = new Error("Unknown error");
      (error as Error & { code: string }).code = "UNKNOWN_CODE";

      expect(isNetworkError(error)).toBe(false);
    });

    it("returns false for non-Error values", () => {
      expect(isNetworkError("error")).toBe(false);
      expect(isNetworkError(null)).toBe(false);
      expect(isNetworkError(undefined)).toBe(false);
      expect(isNetworkError({ code: "ECONNRESET" })).toBe(false);
    });

    it("returns false for numeric code property", () => {
      const error = new Error("Error with numeric code");
      (error as Error & { code: number }).code = 1234 as unknown as number;

      expect(isNetworkError(error)).toBe(false);
    });
  });

  describe("getNetworkErrorCode", () => {
    it("returns the error code for network errors", () => {
      const error = new Error("Connection reset");
      (error as Error & { code: string }).code = "ECONNRESET";

      expect(getNetworkErrorCode(error)).toBe("ECONNRESET");
    });

    it("returns null for non-network errors", () => {
      const error = new Error("Some error");

      expect(getNetworkErrorCode(error)).toBeNull();
    });

    it("returns null for unknown error codes", () => {
      const error = new Error("Unknown error");
      (error as Error & { code: string }).code = "UNKNOWN";

      expect(getNetworkErrorCode(error)).toBeNull();
    });
  });

  describe("NETWORK_ERROR_CODES", () => {
    it("contains all expected error codes", () => {
      expect(NETWORK_ERROR_CODES).toContain("ECONNRESET");
      expect(NETWORK_ERROR_CODES).toContain("ETIMEDOUT");
      expect(NETWORK_ERROR_CODES).toContain("ENOTFOUND");
      expect(NETWORK_ERROR_CODES).toContain("ECONNREFUSED");
      expect(NETWORK_ERROR_CODES).toContain("ENETUNREACH");
      expect(NETWORK_ERROR_CODES).toContain("EAI_AGAIN");
      expect(NETWORK_ERROR_CODES).toContain("EPIPE");
      expect(NETWORK_ERROR_CODES).toContain("ECONNABORTED");
    });
  });

  describe("NetworkError", () => {
    it("creates a NetworkError with correct properties", () => {
      const error = new NetworkError("Connection failed", "ECONNRESET");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(NetworkError);
      expect(error.name).toBe("NetworkError");
      expect(error.message).toBe("Connection failed");
      expect(error.originalCode).toBe("ECONNRESET");
      expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
    });

    it("is always retryable", () => {
      const error = new NetworkError("Connection failed", "ECONNRESET");

      expect(error.isRetryable).toBe(true);
    });

    it("has RECOVERABLE severity", () => {
      const error = new NetworkError("Connection failed", "ECONNRESET");

      expect(error.severity).toBe(ErrorSeverity.RECOVERABLE);
    });

    it("includes originalCode in context", () => {
      const error = new NetworkError("Connection failed", "ECONNRESET");

      expect(error.context).toEqual({ originalCode: "ECONNRESET" });
    });

    it("preserves additional context", () => {
      const error = new NetworkError("Connection failed", "ECONNRESET", {
        context: { host: "example.com", port: 443 },
      });

      expect(error.context).toEqual({
        originalCode: "ECONNRESET",
        host: "example.com",
        port: 443,
      });
    });

    it("preserves cause", () => {
      const cause = new Error("Original error");
      const error = new NetworkError("Connection failed", "ECONNRESET", { cause });

      expect(error.cause).toBe(cause);
    });
  });

  describe("wrapNetworkError", () => {
    it("wraps ECONNRESET with friendly message", () => {
      const original = new Error("connect ECONNRESET");
      (original as Error & { code: string }).code = "ECONNRESET";

      const wrapped = wrapNetworkError(original);

      expect(wrapped).toBeInstanceOf(NetworkError);
      expect(wrapped.message).toBe("Connection was reset by the server");
      expect(wrapped.originalCode).toBe("ECONNRESET");
      expect(wrapped.cause).toBe(original);
    });

    it("wraps ETIMEDOUT with friendly message", () => {
      const original = new Error("connect ETIMEDOUT");
      (original as Error & { code: string }).code = "ETIMEDOUT";

      const wrapped = wrapNetworkError(original);

      expect(wrapped.message).toBe("Connection timed out");
      expect(wrapped.originalCode).toBe("ETIMEDOUT");
    });

    it("wraps ENOTFOUND with friendly message", () => {
      const original = new Error("getaddrinfo ENOTFOUND");
      (original as Error & { code: string }).code = "ENOTFOUND";

      const wrapped = wrapNetworkError(original);

      expect(wrapped.message).toBe("Could not resolve hostname");
      expect(wrapped.originalCode).toBe("ENOTFOUND");
    });

    it("wraps ECONNREFUSED with friendly message", () => {
      const original = new Error("connect ECONNREFUSED");
      (original as Error & { code: string }).code = "ECONNREFUSED";

      const wrapped = wrapNetworkError(original);

      expect(wrapped.message).toBe("Connection refused by the server");
      expect(wrapped.originalCode).toBe("ECONNREFUSED");
    });

    it("preserves original message in context", () => {
      const original = new Error("connect ECONNRESET 192.168.1.1:443");
      (original as Error & { code: string }).code = "ECONNRESET";

      const wrapped = wrapNetworkError(original);

      expect(wrapped.context?.originalMessage).toBe("connect ECONNRESET 192.168.1.1:443");
    });

    it("throws for non-network errors", () => {
      const error = new Error("Not a network error");

      expect(() => wrapNetworkError(error)).toThrow(
        "wrapNetworkError called with non-network error"
      );
    });
  });

  describe("maybeWrapNetworkError", () => {
    it("wraps network errors", () => {
      const original = new Error("connect ECONNRESET");
      (original as Error & { code: string }).code = "ECONNRESET";

      const result = maybeWrapNetworkError(original);

      expect(result).toBeInstanceOf(NetworkError);
    });

    it("returns original error for non-network errors", () => {
      const original = new Error("Not a network error");

      const result = maybeWrapNetworkError(original);

      expect(result).toBe(original);
    });

    it("returns original error for errors without code", () => {
      const original = new Error("Some error");

      const result = maybeWrapNetworkError(original);

      expect(result).toBe(original);
    });
  });
});
