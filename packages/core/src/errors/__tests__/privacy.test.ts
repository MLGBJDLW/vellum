import { describe, expect, it } from "vitest";
import { ErrorNoTelemetry, shouldSkipTelemetry } from "../privacy/ErrorNoTelemetry.js";
import { ErrorCode, VellumError } from "../types.js";

describe("ErrorNoTelemetry", () => {
  describe("constructor", () => {
    it("should create error with skipTelemetry=true", () => {
      const error = new ErrorNoTelemetry("Sensitive error", ErrorCode.LLM_AUTH_FAILED);

      expect(error.skipTelemetry).toBe(true);
      expect(error.message).toBe("Sensitive error");
      expect(error.code).toBe(ErrorCode.LLM_AUTH_FAILED);
      expect(error.name).toBe("ErrorNoTelemetry");
    });

    it("AC-008-1: skipTelemetry should be readonly true", () => {
      const error = new ErrorNoTelemetry("Test error", ErrorCode.CONFIG_INVALID);

      // skipTelemetry is readonly, attempting to change it should be a type error
      // This test just verifies the value
      expect(error.skipTelemetry).toBe(true);
      expect(typeof error.skipTelemetry).toBe("boolean");
    });

    it("should accept context parameter", () => {
      const error = new ErrorNoTelemetry("Error with context", ErrorCode.LLM_AUTH_FAILED, {
        userId: "[REDACTED]",
      });

      expect(error.context).toEqual({ userId: "[REDACTED]" });
    });

    it("should inherit from VellumError", () => {
      const error = new ErrorNoTelemetry("Test error", ErrorCode.CONFIG_INVALID);

      expect(error).toBeInstanceOf(VellumError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should have errorId and timestamp from VellumError", () => {
      const error = new ErrorNoTelemetry("Test error", ErrorCode.CONFIG_INVALID);

      expect(error.errorId).toBeDefined();
      expect(error.errorId.length).toBe(21); // nanoid default length
      expect(error.timestamp).toBeDefined();
      expect(new Date(error.timestamp).toISOString()).toBe(error.timestamp);
    });
  });

  describe("toJSON", () => {
    it("should include skipTelemetry in JSON", () => {
      const error = new ErrorNoTelemetry("Test error", ErrorCode.LLM_AUTH_FAILED, { key: "value" });

      const json = error.toJSON();

      expect(json.skipTelemetry).toBe(true);
      expect(json.name).toBe("ErrorNoTelemetry");
      expect(json.message).toBe("Test error");
      expect(json.code).toBe(ErrorCode.LLM_AUTH_FAILED);
    });
  });

  describe("create static method", () => {
    it("should create error with all options", () => {
      const cause = new Error("Original error");
      const error = ErrorNoTelemetry.create("Created error", ErrorCode.LLM_AUTH_FAILED, {
        context: { info: "test" },
        cause,
        requestId: "req-123",
      });

      expect(error.message).toBe("Created error");
      expect(error.skipTelemetry).toBe(true);
      expect(error.context).toEqual({ info: "test" });
    });
  });
});

describe("shouldSkipTelemetry", () => {
  it("AC-008-2: should return true for ErrorNoTelemetry", () => {
    const error = new ErrorNoTelemetry("Test error", ErrorCode.LLM_AUTH_FAILED);

    expect(shouldSkipTelemetry(error)).toBe(true);
  });

  it("AC-008-2: should return false for regular VellumError", () => {
    const error = new VellumError("Test error", ErrorCode.LLM_RATE_LIMIT);

    expect(shouldSkipTelemetry(error)).toBe(false);
  });

  it("AC-008-2: should return true for VellumError with skipTelemetry property", () => {
    const error = new VellumError("Test error", ErrorCode.LLM_RATE_LIMIT);
    (error as unknown as { skipTelemetry: boolean }).skipTelemetry = true;

    expect(shouldSkipTelemetry(error)).toBe(true);
  });

  it("should return false for plain Error", () => {
    const error = new Error("Plain error");

    expect(shouldSkipTelemetry(error)).toBe(false);
  });

  it("should return false for null", () => {
    expect(shouldSkipTelemetry(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(shouldSkipTelemetry(undefined)).toBe(false);
  });

  it("should return false for non-error objects", () => {
    expect(shouldSkipTelemetry({ message: "fake error" })).toBe(false);
    expect(shouldSkipTelemetry("string error")).toBe(false);
    expect(shouldSkipTelemetry(42)).toBe(false);
  });

  it("type guard should narrow type correctly", () => {
    const error: unknown = new ErrorNoTelemetry("Test", ErrorCode.LLM_AUTH_FAILED);

    if (shouldSkipTelemetry(error)) {
      // Type should be narrowed - this should compile
      expect(error.skipTelemetry).toBe(true);
    }
  });
});
