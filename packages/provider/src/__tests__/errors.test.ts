/**
 * Error Classification Tests
 *
 * T033: Unit tests for error classification utilities
 */

import { ErrorCode } from "@vellum/shared";
import { describe, expect, it } from "vitest";
import {
  classifyHttpStatus,
  classifyProviderError,
  createProviderError,
  getRetryDelay,
  isRetryable,
  ProviderError,
} from "../errors.js";

describe("errors", () => {
  // ==========================================================================
  // T033: HTTP Status Classification
  // ==========================================================================

  describe("classifyHttpStatus", () => {
    it("should classify 401 as CREDENTIAL_INVALID", () => {
      const result = classifyHttpStatus(401);
      expect(result.code).toBe(ErrorCode.CREDENTIAL_VALIDATION_FAILED);
      expect(result.category).toBe("credential_invalid");
      expect(result.retryable).toBe(false);
    });

    it("should classify 403 as CREDENTIAL_INVALID", () => {
      const result = classifyHttpStatus(403);
      expect(result.code).toBe(ErrorCode.CREDENTIAL_VALIDATION_FAILED);
      expect(result.category).toBe("credential_invalid");
      expect(result.retryable).toBe(false);
    });

    it("should classify 429 as LLM_RATE_LIMITED", () => {
      const result = classifyHttpStatus(429);
      expect(result.code).toBe(ErrorCode.RATE_LIMITED);
      expect(result.category).toBe("rate_limited");
      expect(result.retryable).toBe(true);
      expect(result.retryDelayMs).toBeDefined();
    });

    it("should classify 500 as LLM_API_ERROR and retryable", () => {
      const result = classifyHttpStatus(500);
      expect(result.code).toBe(ErrorCode.API_ERROR);
      expect(result.category).toBe("api_error");
      expect(result.retryable).toBe(true);
    });

    it("should classify 502 as retryable server error", () => {
      const result = classifyHttpStatus(502);
      expect(result.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
      expect(result.retryable).toBe(true);
    });

    it("should classify 503 as retryable server error", () => {
      const result = classifyHttpStatus(503);
      expect(result.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
      expect(result.retryable).toBe(true);
    });

    it("should classify 504 as LLM_TIMEOUT", () => {
      const result = classifyHttpStatus(504);
      expect(result.code).toBe(ErrorCode.TIMEOUT);
      expect(result.category).toBe("timeout");
      expect(result.retryable).toBe(true);
    });

    it("should classify 400 as non-retryable API error", () => {
      const result = classifyHttpStatus(400);
      expect(result.code).toBe(ErrorCode.INVALID_ARGUMENT);
      expect(result.retryable).toBe(false);
    });

    it("should classify 404 as non-retryable", () => {
      const result = classifyHttpStatus(404);
      expect(result.code).toBe(ErrorCode.PROVIDER_NOT_FOUND);
      expect(result.retryable).toBe(false);
    });

    it("should classify 5xx range as retryable", () => {
      const result = classifyHttpStatus(599);
      expect(result.code).toBe(ErrorCode.API_ERROR);
      expect(result.retryable).toBe(true);
    });

    it("should classify unknown 4xx as non-retryable", () => {
      const result = classifyHttpStatus(418); // I'm a teapot
      expect(result.code).toBe(ErrorCode.API_ERROR);
      expect(result.retryable).toBe(false);
    });
  });

  // ==========================================================================
  // Error Type Classification
  // ==========================================================================

  describe("classifyProviderError", () => {
    it("should classify timeout errors", () => {
      const error = new Error("Request timed out");
      const result = classifyProviderError(error);
      expect(result.code).toBe(ErrorCode.TIMEOUT);
      expect(result.category).toBe("timeout");
      expect(result.retryable).toBe(true);
    });

    it("should classify ETIMEDOUT errors", () => {
      const error = new Error("connect ETIMEDOUT");
      const result = classifyProviderError(error);
      expect(result.code).toBe(ErrorCode.TIMEOUT);
    });

    it("should classify network errors", () => {
      const error = new Error("Network error");
      const result = classifyProviderError(error);
      expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(result.retryable).toBe(true);
    });

    it("should classify ECONNREFUSED errors", () => {
      const error = new Error("connect ECONNREFUSED");
      const result = classifyProviderError(error);
      expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
    });

    it("should classify ECONNRESET errors", () => {
      const error = new Error("read ECONNRESET");
      const result = classifyProviderError(error);
      expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
    });

    it("should classify context overflow errors", () => {
      const error = new Error("context_length exceeded");
      const result = classifyProviderError(error);
      expect(result.code).toBe(ErrorCode.CONTEXT_OVERFLOW);
      expect(result.retryable).toBe(false);
    });

    it("should classify token limit errors", () => {
      const error = new Error("Maximum token limit reached");
      const result = classifyProviderError(error);
      expect(result.code).toBe(ErrorCode.CONTEXT_OVERFLOW);
    });

    it("should classify content filter errors", () => {
      const error = new Error("Content flagged by safety filter");
      const result = classifyProviderError(error);
      expect(result.category).toBe("content_filter");
      expect(result.retryable).toBe(false);
    });

    it("should classify errors with status code", () => {
      const error = { status: 429, message: "Rate limit exceeded" };
      const result = classifyProviderError(error);
      expect(result.code).toBe(ErrorCode.RATE_LIMITED);
    });

    it("should classify errors with statusCode property", () => {
      const error = { statusCode: 401, message: "Unauthorized" };
      const result = classifyProviderError(error);
      expect(result.code).toBe(ErrorCode.CREDENTIAL_VALIDATION_FAILED);
    });

    it("should return existing classification for ProviderError", () => {
      const providerError = new ProviderError("Test error", {
        code: ErrorCode.RATE_LIMITED,
        category: "rate_limited",
        retryable: true,
        retryDelayMs: 5000,
      });
      const result = classifyProviderError(providerError);
      expect(result.code).toBe(ErrorCode.RATE_LIMITED);
      expect(result.retryDelayMs).toBe(5000);
    });

    it("should classify unknown errors as unknown", () => {
      const error = new Error("Some random error");
      const result = classifyProviderError(error);
      expect(result.code).toBe(ErrorCode.UNKNOWN);
      expect(result.retryable).toBe(false);
    });

    it("should handle string errors", () => {
      const result = classifyProviderError("Connection timed out");
      expect(result.code).toBe(ErrorCode.TIMEOUT);
    });
  });

  // ==========================================================================
  // Retryable Check
  // ==========================================================================

  describe("isRetryable", () => {
    it("should return true for rate limit errors", () => {
      const error = { status: 429 };
      expect(isRetryable(error)).toBe(true);
    });

    it("should return true for server errors", () => {
      const error = { status: 500 };
      expect(isRetryable(error)).toBe(true);
    });

    it("should return false for authentication errors", () => {
      const error = { status: 401 };
      expect(isRetryable(error)).toBe(false);
    });

    it("should return false for client errors", () => {
      const error = { status: 400 };
      expect(isRetryable(error)).toBe(false);
    });

    it("should return true for network errors", () => {
      const error = new Error("ECONNREFUSED");
      expect(isRetryable(error)).toBe(true);
    });

    it("should return true for timeout errors", () => {
      const error = new Error("Request timed out");
      expect(isRetryable(error)).toBe(true);
    });
  });

  // ==========================================================================
  // Retry Delay
  // ==========================================================================

  describe("getRetryDelay", () => {
    it("should return suggested delay for rate limit", () => {
      const error = { status: 429 };
      const delay = getRetryDelay(error, 1);
      expect(delay).toBeGreaterThan(0);
    });

    it("should respect Retry-After header", () => {
      const error = {
        status: 429,
        headers: { "retry-after": "5" },
      };
      const delay = getRetryDelay(error, 1);
      expect(delay).toBe(5000); // 5 seconds in ms
    });

    it("should use exponential backoff", () => {
      const error = { status: 500 };
      const delay1 = getRetryDelay(error, 1);
      const delay2 = getRetryDelay(error, 2);
      const delay3 = getRetryDelay(error, 3);

      // Each delay should be approximately double the previous (with jitter)
      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    it("should cap delay at 60 seconds", () => {
      const error = { status: 500 };
      const delay = getRetryDelay(error, 10);
      expect(delay).toBeLessThanOrEqual(60000);
    });
  });

  // ==========================================================================
  // T032: Error Context
  // ==========================================================================

  describe("ProviderError context", () => {
    it("should include context in ProviderError", () => {
      const error = new ProviderError("Test error", {
        code: ErrorCode.API_ERROR,
        category: "api_error",
        retryable: true,
        context: {
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          requestId: "req_123",
        },
      });

      expect(error.context.provider).toBe("anthropic");
      expect(error.context.model).toBe("claude-sonnet-4-20250514");
      expect(error.context.requestId).toBe("req_123");
      expect(error.context.timestamp).toBeInstanceOf(Date);
    });

    it("should auto-set timestamp if not provided", () => {
      const error = new ProviderError("Test error", {
        code: ErrorCode.API_ERROR,
        category: "api_error",
        retryable: false,
      });

      expect(error.context.timestamp).toBeInstanceOf(Date);
    });

    it("should allow adding context with withContext", () => {
      const error = new ProviderError("Test error", {
        code: ErrorCode.API_ERROR,
        category: "api_error",
        retryable: false,
      });

      const withContext = error.withContext({
        provider: "openai",
        model: "gpt-4o",
      });

      expect(withContext.context.provider).toBe("openai");
      expect(withContext.context.model).toBe("gpt-4o");
      expect(withContext.message).toBe("Test error");
    });

    it("should include context in toDetailedString", () => {
      const error = new ProviderError("Test error", {
        code: ErrorCode.API_ERROR,
        category: "api_error",
        retryable: false,
        context: {
          provider: "anthropic",
          requestId: "req_456",
        },
      });

      const detailed = error.toDetailedString();
      expect(detailed).toContain("Provider: anthropic");
      expect(detailed).toContain("Request ID: req_456");
    });

    it("should serialize to JSON correctly", () => {
      const error = new ProviderError("Test error", {
        code: ErrorCode.API_ERROR,
        category: "api_error",
        retryable: true,
        statusCode: 500,
        context: {
          provider: "google",
          model: "gemini-2.5-flash",
        },
      });

      const json = error.toJSON();
      expect(json.name).toBe("ProviderError");
      expect(json.code).toBe(ErrorCode.API_ERROR);
      expect(json.category).toBe("api_error");
      expect((json.context as Record<string, unknown>).provider).toBe("google");
    });
  });

  // ==========================================================================
  // createProviderError
  // ==========================================================================

  describe("createProviderError", () => {
    it("should create error from HTTP error", () => {
      const httpError = { status: 401, message: "Unauthorized" };
      const error = createProviderError(httpError);

      expect(error).toBeInstanceOf(ProviderError);
      expect(error.code).toBe(ErrorCode.CREDENTIAL_VALIDATION_FAILED);
      expect(error.statusCode).toBe(401);
    });

    it("should create error with string context", () => {
      const error = createProviderError(new Error("Failed"), "Anthropic API");
      expect(error.message).toBe("Anthropic API: Failed");
    });

    it("should create error with context object", () => {
      const error = createProviderError(new Error("Failed"), {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
      });

      expect(error.context.provider).toBe("anthropic");
      expect(error.context.model).toBe("claude-sonnet-4-20250514");
    });

    it("should extract requestId from headers", () => {
      const httpError = {
        status: 500,
        message: "Server error",
        headers: { "x-request-id": "req_789" },
      };
      const error = createProviderError(httpError);
      expect(error.context.requestId).toBe("req_789");
    });

    it("should preserve original error as cause", () => {
      const original = new Error("Original error");
      const error = createProviderError(original);
      expect(error.cause).toBe(original);
    });
  });
});
