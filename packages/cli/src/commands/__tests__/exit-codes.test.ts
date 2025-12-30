/**
 * Exit Code Tests (T-046)
 *
 * @module cli/commands/__tests__/exit-codes.test
 */

import { describe, expect, it } from "vitest";

import { EXIT_CODES, ExitCodeMapper } from "../exit-codes.js";
import type { CommandError, CommandResult } from "../types.js";

// =============================================================================
// EXIT_CODES Constants Tests
// =============================================================================

describe("EXIT_CODES", () => {
  it("should define SUCCESS as 0", () => {
    expect(EXIT_CODES.SUCCESS).toBe(0);
  });

  it("should define ERROR as 1", () => {
    expect(EXIT_CODES.ERROR).toBe(1);
  });

  it("should define USAGE_ERROR as 2", () => {
    expect(EXIT_CODES.USAGE_ERROR).toBe(2);
  });

  it("should define INTERRUPTED as 130 (128 + SIGINT)", () => {
    expect(EXIT_CODES.INTERRUPTED).toBe(130);
  });
});

// =============================================================================
// ExitCodeMapper Tests
// =============================================================================

describe("ExitCodeMapper", () => {
  // ===========================================================================
  // fromResult Tests
  // ===========================================================================

  describe("fromResult", () => {
    it("should return SUCCESS for success result", () => {
      const result: CommandResult = { kind: "success", message: "Done" };
      expect(ExitCodeMapper.fromResult(result)).toBe(EXIT_CODES.SUCCESS);
    });

    it("should return SUCCESS for success result with data", () => {
      const result: CommandResult = {
        kind: "success",
        message: "Done",
        data: { foo: "bar" },
      };
      expect(ExitCodeMapper.fromResult(result)).toBe(EXIT_CODES.SUCCESS);
    });

    it("should return ERROR for generic error result", () => {
      const result: CommandResult = {
        kind: "error",
        code: "INTERNAL_ERROR",
        message: "Something went wrong",
      };
      expect(ExitCodeMapper.fromResult(result)).toBe(EXIT_CODES.ERROR);
    });

    it("should return USAGE_ERROR for argument errors", () => {
      const testCases: CommandError[] = [
        { kind: "error", code: "INVALID_ARGUMENT", message: "Invalid arg" },
        { kind: "error", code: "MISSING_ARGUMENT", message: "Missing arg" },
        { kind: "error", code: "ARGUMENT_TYPE_ERROR", message: "Type error" },
        { kind: "error", code: "COMMAND_NOT_FOUND", message: "Not found" },
      ];

      for (const result of testCases) {
        expect(ExitCodeMapper.fromResult(result)).toBe(EXIT_CODES.USAGE_ERROR);
      }
    });

    it("should return INTERRUPTED for COMMAND_ABORTED", () => {
      const result: CommandResult = {
        kind: "error",
        code: "COMMAND_ABORTED",
        message: "Aborted by user",
      };
      expect(ExitCodeMapper.fromResult(result)).toBe(EXIT_CODES.INTERRUPTED);
    });

    it("should return SUCCESS for interactive result", () => {
      const result: CommandResult = {
        kind: "interactive",
        prompt: {
          inputType: "text",
          message: "Enter value",
          handler: async () => ({ kind: "success" }),
        },
      };
      expect(ExitCodeMapper.fromResult(result)).toBe(EXIT_CODES.SUCCESS);
    });

    it("should return SUCCESS for pending result", () => {
      const result: CommandResult = {
        kind: "pending",
        operation: {
          message: "Processing...",
          promise: Promise.resolve({ kind: "success" }),
        },
      };
      expect(ExitCodeMapper.fromResult(result)).toBe(EXIT_CODES.SUCCESS);
    });
  });

  // ===========================================================================
  // fromError Tests
  // ===========================================================================

  describe("fromError", () => {
    it("should return USAGE_ERROR for INVALID_ARGUMENT", () => {
      const error: CommandError = {
        kind: "error",
        code: "INVALID_ARGUMENT",
        message: "Invalid",
      };
      expect(ExitCodeMapper.fromError(error)).toBe(EXIT_CODES.USAGE_ERROR);
    });

    it("should return ERROR for unmapped error codes", () => {
      const error: CommandError = {
        kind: "error",
        code: "NETWORK_ERROR",
        message: "Network failed",
      };
      expect(ExitCodeMapper.fromError(error)).toBe(EXIT_CODES.ERROR);
    });
  });

  // ===========================================================================
  // fromException Tests
  // ===========================================================================

  describe("fromException", () => {
    it("should return INTERRUPTED for AbortError", () => {
      const error = new Error("Aborted");
      error.name = "AbortError";
      expect(ExitCodeMapper.fromException(error)).toBe(EXIT_CODES.INTERRUPTED);
    });

    it("should return INTERRUPTED for DOMException AbortError", () => {
      const error = new DOMException("Aborted", "AbortError");
      expect(ExitCodeMapper.fromException(error)).toBe(EXIT_CODES.INTERRUPTED);
    });

    it("should return ERROR for generic errors", () => {
      const error = new Error("Something failed");
      expect(ExitCodeMapper.fromException(error)).toBe(EXIT_CODES.ERROR);
    });

    it("should return ERROR for non-Error values", () => {
      expect(ExitCodeMapper.fromException("string error")).toBe(EXIT_CODES.ERROR);
      expect(ExitCodeMapper.fromException(null)).toBe(EXIT_CODES.ERROR);
      expect(ExitCodeMapper.fromException(undefined)).toBe(EXIT_CODES.ERROR);
    });
  });

  // ===========================================================================
  // Utility Method Tests
  // ===========================================================================

  describe("isSuccess", () => {
    it("should return true for SUCCESS", () => {
      expect(ExitCodeMapper.isSuccess(EXIT_CODES.SUCCESS)).toBe(true);
    });

    it("should return false for other codes", () => {
      expect(ExitCodeMapper.isSuccess(EXIT_CODES.ERROR)).toBe(false);
      expect(ExitCodeMapper.isSuccess(EXIT_CODES.USAGE_ERROR)).toBe(false);
      expect(ExitCodeMapper.isSuccess(EXIT_CODES.INTERRUPTED)).toBe(false);
    });
  });

  describe("isUsageError", () => {
    it("should return true for USAGE_ERROR", () => {
      expect(ExitCodeMapper.isUsageError(EXIT_CODES.USAGE_ERROR)).toBe(true);
    });

    it("should return false for other codes", () => {
      expect(ExitCodeMapper.isUsageError(EXIT_CODES.SUCCESS)).toBe(false);
      expect(ExitCodeMapper.isUsageError(EXIT_CODES.ERROR)).toBe(false);
    });
  });

  describe("isInterrupted", () => {
    it("should return true for INTERRUPTED", () => {
      expect(ExitCodeMapper.isInterrupted(EXIT_CODES.INTERRUPTED)).toBe(true);
    });

    it("should return false for other codes", () => {
      expect(ExitCodeMapper.isInterrupted(EXIT_CODES.SUCCESS)).toBe(false);
      expect(ExitCodeMapper.isInterrupted(EXIT_CODES.ERROR)).toBe(false);
    });
  });

  describe("describe", () => {
    it("should describe SUCCESS", () => {
      expect(ExitCodeMapper.describe(EXIT_CODES.SUCCESS)).toBe("Success");
    });

    it("should describe ERROR", () => {
      expect(ExitCodeMapper.describe(EXIT_CODES.ERROR)).toBe("Error");
    });

    it("should describe USAGE_ERROR", () => {
      expect(ExitCodeMapper.describe(EXIT_CODES.USAGE_ERROR)).toBe("Usage error");
    });

    it("should describe INTERRUPTED", () => {
      expect(ExitCodeMapper.describe(EXIT_CODES.INTERRUPTED)).toBe("Interrupted");
    });
  });
});
