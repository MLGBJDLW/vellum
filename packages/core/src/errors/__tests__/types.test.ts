import { describe, expect, it } from "vitest";
import {
  ErrorCode,
  ErrorSeverity,
  inferSeverity,
  isFatalError,
  isRetryableError,
  VellumError,
} from "../types.js";

describe("ErrorCode", () => {
  it("should have configuration error codes in 1xxx range", () => {
    expect(ErrorCode.CONFIG_INVALID).toBe(1001);
    expect(ErrorCode.CONFIG_NOT_FOUND).toBe(1002);
    expect(ErrorCode.CONFIG_PARSE_ERROR).toBe(1003);
  });

  it("should have LLM error codes in 2xxx range", () => {
    expect(ErrorCode.LLM_RATE_LIMIT).toBe(2001);
    expect(ErrorCode.LLM_CONTEXT_LENGTH).toBe(2002);
    expect(ErrorCode.LLM_AUTH_FAILED).toBe(2003);
    expect(ErrorCode.LLM_NETWORK_ERROR).toBe(2004);
    expect(ErrorCode.LLM_TIMEOUT).toBe(2005);
    expect(ErrorCode.LLM_INVALID_RESPONSE).toBe(2006);
  });

  it("should have tool error codes in 3xxx range", () => {
    expect(ErrorCode.TOOL_NOT_FOUND).toBe(3001);
    expect(ErrorCode.TOOL_VALIDATION_FAILED).toBe(3002);
    expect(ErrorCode.TOOL_EXECUTION_FAILED).toBe(3003);
    expect(ErrorCode.TOOL_PERMISSION_DENIED).toBe(3004);
    expect(ErrorCode.TOOL_TIMEOUT).toBe(3005);
  });

  it("should have session error codes in 4xxx range", () => {
    expect(ErrorCode.SESSION_NOT_FOUND).toBe(4001);
    expect(ErrorCode.SESSION_EXPIRED).toBe(4002);
    expect(ErrorCode.SESSION_CONFLICT).toBe(4003);
  });

  it("should have system error codes in 5xxx range", () => {
    expect(ErrorCode.SYSTEM_IO_ERROR).toBe(5001);
    expect(ErrorCode.SYSTEM_OUT_OF_MEMORY).toBe(5002);
    expect(ErrorCode.SYSTEM_UNKNOWN).toBe(5999);
  });

  it("should have all error codes as numbers", () => {
    const codes = Object.values(ErrorCode).filter((v) => typeof v === "number") as number[];
    expect(codes.length).toBeGreaterThan(0);
    codes.forEach((code) => {
      expect(typeof code).toBe("number");
      expect(code).toBeGreaterThan(0);
    });
  });
});

describe("ErrorSeverity", () => {
  it("should have all severity levels", () => {
    expect(ErrorSeverity.RECOVERABLE).toBe("recoverable");
    expect(ErrorSeverity.USER_ACTION).toBe("user_action");
    expect(ErrorSeverity.FATAL).toBe("fatal");
  });
});

describe("inferSeverity", () => {
  describe("RECOVERABLE errors", () => {
    it("should return RECOVERABLE for rate limit errors", () => {
      expect(inferSeverity(ErrorCode.LLM_RATE_LIMIT)).toBe(ErrorSeverity.RECOVERABLE);
    });

    it("should return RECOVERABLE for timeout errors", () => {
      expect(inferSeverity(ErrorCode.LLM_TIMEOUT)).toBe(ErrorSeverity.RECOVERABLE);
      expect(inferSeverity(ErrorCode.TOOL_TIMEOUT)).toBe(ErrorSeverity.RECOVERABLE);
    });

    it("should return RECOVERABLE for network errors", () => {
      expect(inferSeverity(ErrorCode.LLM_NETWORK_ERROR)).toBe(ErrorSeverity.RECOVERABLE);
    });

    it("should return RECOVERABLE for IO errors", () => {
      expect(inferSeverity(ErrorCode.SYSTEM_IO_ERROR)).toBe(ErrorSeverity.RECOVERABLE);
    });
  });

  describe("USER_ACTION errors", () => {
    it("should return USER_ACTION for config errors", () => {
      expect(inferSeverity(ErrorCode.CONFIG_INVALID)).toBe(ErrorSeverity.USER_ACTION);
      expect(inferSeverity(ErrorCode.CONFIG_NOT_FOUND)).toBe(ErrorSeverity.USER_ACTION);
      expect(inferSeverity(ErrorCode.CONFIG_PARSE_ERROR)).toBe(ErrorSeverity.USER_ACTION);
    });

    it("should return USER_ACTION for auth errors", () => {
      expect(inferSeverity(ErrorCode.LLM_AUTH_FAILED)).toBe(ErrorSeverity.USER_ACTION);
    });

    it("should return USER_ACTION for validation errors", () => {
      expect(inferSeverity(ErrorCode.TOOL_VALIDATION_FAILED)).toBe(ErrorSeverity.USER_ACTION);
    });

    it("should return USER_ACTION for permission errors", () => {
      expect(inferSeverity(ErrorCode.TOOL_PERMISSION_DENIED)).toBe(ErrorSeverity.USER_ACTION);
    });

    it("should return USER_ACTION for context length errors", () => {
      expect(inferSeverity(ErrorCode.LLM_CONTEXT_LENGTH)).toBe(ErrorSeverity.USER_ACTION);
    });

    it("should return USER_ACTION for tool errors", () => {
      expect(inferSeverity(ErrorCode.TOOL_NOT_FOUND)).toBe(ErrorSeverity.USER_ACTION);
      expect(inferSeverity(ErrorCode.TOOL_EXECUTION_FAILED)).toBe(ErrorSeverity.USER_ACTION);
    });

    it("should return USER_ACTION for session errors", () => {
      expect(inferSeverity(ErrorCode.SESSION_NOT_FOUND)).toBe(ErrorSeverity.USER_ACTION);
      expect(inferSeverity(ErrorCode.SESSION_EXPIRED)).toBe(ErrorSeverity.USER_ACTION);
      expect(inferSeverity(ErrorCode.SESSION_CONFLICT)).toBe(ErrorSeverity.USER_ACTION);
    });

    it("should return USER_ACTION for invalid response errors", () => {
      expect(inferSeverity(ErrorCode.LLM_INVALID_RESPONSE)).toBe(ErrorSeverity.USER_ACTION);
    });
  });

  describe("FATAL errors", () => {
    it("should return FATAL for out of memory errors", () => {
      expect(inferSeverity(ErrorCode.SYSTEM_OUT_OF_MEMORY)).toBe(ErrorSeverity.FATAL);
    });

    it("should return FATAL for unknown errors", () => {
      expect(inferSeverity(ErrorCode.SYSTEM_UNKNOWN)).toBe(ErrorSeverity.FATAL);
    });
  });
});

describe("VellumError", () => {
  it("should create error with message and code", () => {
    const error = new VellumError("Test error", ErrorCode.CONFIG_INVALID);
    expect(error.message).toBe("Test error");
    expect(error.code).toBe(ErrorCode.CONFIG_INVALID);
    expect(error.name).toBe("VellumError");
  });

  it("should infer severity from code", () => {
    const recoverableError = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT);
    expect(recoverableError.severity).toBe(ErrorSeverity.RECOVERABLE);

    const userActionError = new VellumError("Config invalid", ErrorCode.CONFIG_INVALID);
    expect(userActionError.severity).toBe(ErrorSeverity.USER_ACTION);

    const fatalError = new VellumError("OOM", ErrorCode.SYSTEM_OUT_OF_MEMORY);
    expect(fatalError.severity).toBe(ErrorSeverity.FATAL);
  });

  it("should default isRetryable based on severity", () => {
    const recoverableError = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT);
    expect(recoverableError.isRetryable).toBe(true);

    const userActionError = new VellumError("Config invalid", ErrorCode.CONFIG_INVALID);
    expect(userActionError.isRetryable).toBe(false);

    const fatalError = new VellumError("OOM", ErrorCode.SYSTEM_OUT_OF_MEMORY);
    expect(fatalError.isRetryable).toBe(false);
  });

  it("should allow explicit isRetryable override", () => {
    const error = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT, {
      isRetryable: false,
    });
    expect(error.isRetryable).toBe(false);

    const error2 = new VellumError("Config invalid", ErrorCode.CONFIG_INVALID, {
      isRetryable: true,
    });
    expect(error2.isRetryable).toBe(true);
  });

  it("should support retry delay", () => {
    const error = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT, {
      retryDelay: 5000,
    });
    expect(error.retryDelay).toBe(5000);
  });

  it("should return undefined retryDelay if not retryable", () => {
    const error = new VellumError("Config invalid", ErrorCode.CONFIG_INVALID, {
      retryDelay: 5000,
    });
    expect(error.retryDelay).toBeUndefined();
  });

  it("should support cause chaining", () => {
    const cause = new Error("Original error");
    const error = new VellumError("Wrapped error", ErrorCode.SYSTEM_IO_ERROR, { cause });
    expect(error.cause).toBe(cause);
  });

  it("should support context data", () => {
    const error = new VellumError("Test error", ErrorCode.CONFIG_INVALID, {
      context: { file: "config.json", line: 42 },
    });
    expect(error.context).toEqual({ file: "config.json", line: 42 });
  });

  it("should serialize to JSON", () => {
    const cause = new Error("Original error");
    const error = new VellumError("Test error", ErrorCode.LLM_RATE_LIMIT, {
      cause,
      context: { provider: "openai" },
      retryDelay: 1000,
    });

    const json = error.toJSON();
    expect(json).toEqual({
      name: "VellumError",
      message: "Test error",
      code: ErrorCode.LLM_RATE_LIMIT,
      severity: ErrorSeverity.RECOVERABLE,
      isRetryable: true,
      retryDelay: 1000,
      context: { provider: "openai" },
      cause: "Original error",
    });
  });

  it("should be instanceof Error", () => {
    const error = new VellumError("Test", ErrorCode.SYSTEM_UNKNOWN);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(VellumError);
  });
});

describe("isFatalError", () => {
  it("should return true for VellumError with FATAL severity", () => {
    const error = new VellumError("OOM", ErrorCode.SYSTEM_OUT_OF_MEMORY);
    expect(isFatalError(error)).toBe(true);
  });

  it("should return false for VellumError with non-FATAL severity", () => {
    const error = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT);
    expect(isFatalError(error)).toBe(false);
  });

  it("should return false for non-VellumError", () => {
    const error = new Error("Regular error");
    expect(isFatalError(error)).toBe(false);
  });

  it("should return false for non-error values", () => {
    expect(isFatalError(null)).toBe(false);
    expect(isFatalError(undefined)).toBe(false);
    expect(isFatalError("error")).toBe(false);
    expect(isFatalError({ message: "fake error" })).toBe(false);
  });
});

describe("isRetryableError", () => {
  it("should return true for retryable VellumError", () => {
    const error = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT);
    expect(isRetryableError(error)).toBe(true);
  });

  it("should return false for non-retryable VellumError", () => {
    const error = new VellumError("Config invalid", ErrorCode.CONFIG_INVALID);
    expect(isRetryableError(error)).toBe(false);
  });

  it("should return false for VellumError with explicit isRetryable=false", () => {
    const error = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT, {
      isRetryable: false,
    });
    expect(isRetryableError(error)).toBe(false);
  });

  it("should return true for VellumError with explicit isRetryable=true", () => {
    const error = new VellumError("Config invalid", ErrorCode.CONFIG_INVALID, {
      isRetryable: true,
    });
    expect(isRetryableError(error)).toBe(true);
  });

  it("should return false for non-VellumError", () => {
    const error = new Error("Regular error");
    expect(isRetryableError(error)).toBe(false);
  });

  it("should return false for non-error values", () => {
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
    expect(isRetryableError("error")).toBe(false);
  });
});

describe("cause chaining", () => {
  it("should preserve error chain", () => {
    const rootCause = new Error("Network failure");
    const middleError = new VellumError("Provider unavailable", ErrorCode.LLM_NETWORK_ERROR, {
      cause: rootCause,
    });
    const topError = new VellumError("Agent failed", ErrorCode.SYSTEM_UNKNOWN, {
      cause: middleError,
    });

    expect(topError.cause).toBe(middleError);
    expect((topError.cause as VellumError).cause).toBe(rootCause);
  });

  it("should handle undefined cause", () => {
    const error = new VellumError("Test error", ErrorCode.SYSTEM_UNKNOWN);
    expect(error.cause).toBeUndefined();
  });
});
