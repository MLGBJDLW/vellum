import { describe, expect, it } from "vitest";
import {
  classifyError,
  isRetryable,
  isFatal,
  isTransient,
  getRetryDelay,
  getSuggestedErrorAction,
} from "../errors.js";
import { VellumError, ErrorCode } from "../../errors/index.js";

describe("Error Classification", () => {
  describe("classifyError", () => {
    describe("with VellumError", () => {
      it("should classify rate limit as transient and retryable", () => {
        const error = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT);

        const info = classifyError(error);

        expect(info.severity).toBe("transient");
        expect(info.retryable).toBe(true);
        expect(info.suggestedAction).toBe("retry");
        expect(info.retryDelay).toBe(60000);
      });

      it("should classify auth failed as fatal", () => {
        const error = new VellumError("Auth failed", ErrorCode.LLM_AUTH_FAILED);

        const info = classifyError(error);

        expect(info.severity).toBe("fatal");
        expect(info.retryable).toBe(false);
        expect(info.suggestedAction).toBe("abort");
      });

      it("should classify network error as transient", () => {
        const error = new VellumError("Network error", ErrorCode.LLM_NETWORK_ERROR);

        const info = classifyError(error);

        expect(info.severity).toBe("transient");
        expect(info.retryable).toBe(true);
        expect(info.suggestedAction).toBe("retry");
      });

      it("should classify timeout as transient", () => {
        const error = new VellumError("Timeout", ErrorCode.LLM_TIMEOUT);

        const info = classifyError(error);

        expect(info.severity).toBe("transient");
        expect(info.retryable).toBe(true);
      });

      it("should classify permission denied as recoverable", () => {
        const error = new VellumError("Permission denied", ErrorCode.TOOL_PERMISSION_DENIED);

        const info = classifyError(error);

        expect(info.severity).toBe("recoverable");
        expect(info.retryable).toBe(false);
        expect(info.suggestedAction).toBe("escalate");
      });

      it("should classify out of memory as fatal", () => {
        const error = new VellumError("OOM", ErrorCode.SYSTEM_OUT_OF_MEMORY);

        const info = classifyError(error);

        expect(info.severity).toBe("fatal");
        expect(info.retryable).toBe(false);
        expect(info.suggestedAction).toBe("abort");
      });

      it("should include error code in result", () => {
        const error = new VellumError("Test", ErrorCode.TOOL_NOT_FOUND);

        const info = classifyError(error);

        expect(info.code).toBe(ErrorCode.TOOL_NOT_FOUND);
      });

      it("should include context from error", () => {
        const error = new VellumError("Test", ErrorCode.TOOL_NOT_FOUND, {
          context: { toolName: "missing_tool" },
        });

        const info = classifyError(error);

        expect(info.context).toEqual({ toolName: "missing_tool" });
      });
    });

    describe("with plain Error", () => {
      it("should classify network errors by message", () => {
        const error = new Error("Network connection refused");

        const info = classifyError(error);

        expect(info.severity).toBe("transient");
        expect(info.retryable).toBe(true);
        expect(info.suggestedAction).toBe("retry");
      });

      it("should classify timeout errors by message", () => {
        const error = new Error("Request timed out");

        const info = classifyError(error);

        expect(info.severity).toBe("transient");
        expect(info.retryable).toBe(true);
      });

      it("should classify rate limit by message patterns", () => {
        const error = new Error("429 Too Many Requests");

        const info = classifyError(error);

        expect(info.severity).toBe("transient");
        expect(info.retryable).toBe(true);
        expect(info.retryDelay).toBe(60000);
      });

      it("should classify auth errors by message", () => {
        const error = new Error("401 Unauthorized - invalid API key");

        const info = classifyError(error);

        expect(info.severity).toBe("fatal");
        expect(info.retryable).toBe(false);
      });

      it("should classify permission errors by message", () => {
        const error = new Error("403 Forbidden - permission denied");

        const info = classifyError(error);

        expect(info.severity).toBe("recoverable");
        expect(info.retryable).toBe(false);
        expect(info.suggestedAction).toBe("escalate");
      });

      it("should classify not found errors by message", () => {
        const error = new Error("404 Not Found");

        const info = classifyError(error);

        expect(info.severity).toBe("recoverable");
        expect(info.retryable).toBe(false);
      });

      it("should default to fatal for unknown errors", () => {
        const error = new Error("Something completely unexpected");

        const info = classifyError(error);

        expect(info.severity).toBe("fatal");
        expect(info.retryable).toBe(false);
        expect(info.suggestedAction).toBe("abort");
      });
    });

    describe("with non-Error values", () => {
      it("should handle string errors", () => {
        const info = classifyError("Something went wrong");

        expect(info.error).toBeInstanceOf(Error);
        expect(info.error.message).toBe("Something went wrong");
      });

      it("should handle null/undefined", () => {
        const info = classifyError(null);

        expect(info.error).toBeInstanceOf(Error);
      });
    });
  });

  describe("isRetryable", () => {
    it("should return true for retryable errors", () => {
      expect(isRetryable(new Error("Network error"))).toBe(true);
      expect(isRetryable(new Error("Request timed out"))).toBe(true);
    });

    it("should return false for non-retryable errors", () => {
      expect(isRetryable(new Error("Invalid API key"))).toBe(false);
    });
  });

  describe("isFatal", () => {
    it("should return true for fatal errors", () => {
      expect(isFatal(new VellumError("OOM", ErrorCode.SYSTEM_OUT_OF_MEMORY))).toBe(true);
      expect(isFatal(new VellumError("Auth", ErrorCode.LLM_AUTH_FAILED))).toBe(true);
    });

    it("should return false for non-fatal errors", () => {
      expect(isFatal(new VellumError("Rate limit", ErrorCode.LLM_RATE_LIMIT))).toBe(false);
    });
  });

  describe("isTransient", () => {
    it("should return true for transient errors", () => {
      expect(isTransient(new VellumError("Rate limit", ErrorCode.LLM_RATE_LIMIT))).toBe(true);
      expect(isTransient(new VellumError("Network", ErrorCode.LLM_NETWORK_ERROR))).toBe(true);
    });

    it("should return false for non-transient errors", () => {
      expect(isTransient(new VellumError("Auth", ErrorCode.LLM_AUTH_FAILED))).toBe(false);
    });
  });

  describe("getRetryDelay", () => {
    it("should return delay for retryable errors", () => {
      const delay = getRetryDelay(new VellumError("Rate limit", ErrorCode.LLM_RATE_LIMIT));

      expect(delay).toBe(60000);
    });

    it("should return 0 for errors without delay", () => {
      const delay = getRetryDelay(new Error("Some error"));

      expect(delay).toBe(0);
    });
  });

  describe("getSuggestedErrorAction", () => {
    it("should return retry for transient errors", () => {
      expect(getSuggestedErrorAction(new Error("Network error"))).toBe("retry");
    });

    it("should return abort for fatal errors", () => {
      expect(getSuggestedErrorAction(new VellumError("Auth", ErrorCode.LLM_AUTH_FAILED))).toBe("abort");
    });

    it("should return escalate for permission errors", () => {
      expect(getSuggestedErrorAction(new VellumError("Denied", ErrorCode.TOOL_PERMISSION_DENIED))).toBe("escalate");
    });
  });
});
