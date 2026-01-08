import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../events/bus.js";
import { Events } from "../../events/definitions.js";
import { Logger } from "../../logger/logger.js";
import { GlobalErrorHandler } from "../handler.js";
import { ErrorCode, ErrorSeverity, VellumError } from "../types.js";

describe("GlobalErrorHandler", () => {
  let logger: Logger;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = new Logger({ level: "debug" });
    warnSpy = vi.spyOn(logger, "warn");
    errorSpy = vi.spyOn(logger, "error");
  });

  describe("constructor", () => {
    it("should create handler with logger", () => {
      const handler = new GlobalErrorHandler({ logger });
      expect(handler).toBeInstanceOf(GlobalErrorHandler);
    });

    it("should create handler with logger and eventBus", () => {
      const eventBus = new EventBus();
      const handler = new GlobalErrorHandler({ logger, eventBus });
      expect(handler).toBeInstanceOf(GlobalErrorHandler);
    });
  });

  describe("handle()", () => {
    describe("error normalization", () => {
      it("should return VellumError as-is", () => {
        const handler = new GlobalErrorHandler({ logger });
        const original = new VellumError("Test error", ErrorCode.TOOL_NOT_FOUND);

        const result = handler.handle(original);

        expect(result).toBe(original);
        expect(result.code).toBe(ErrorCode.TOOL_NOT_FOUND);
      });

      it("should wrap standard Error with UNKNOWN code", () => {
        const handler = new GlobalErrorHandler({ logger });
        const original = new Error("Something went wrong");

        const result = handler.handle(original);

        expect(result).toBeInstanceOf(VellumError);
        expect(result.code).toBe(ErrorCode.UNKNOWN);
        expect(result.message).toBe("Something went wrong");
        expect(result.cause).toBe(original);
        expect(result.context).toMatchObject({
          originalName: "Error",
        });
      });

      it("should wrap TypeError with UNKNOWN code and preserve name", () => {
        const handler = new GlobalErrorHandler({ logger });
        const original = new TypeError("Cannot read property 'x' of undefined");

        const result = handler.handle(original);

        expect(result).toBeInstanceOf(VellumError);
        expect(result.code).toBe(ErrorCode.UNKNOWN);
        expect(result.context?.originalName).toBe("TypeError");
      });

      it("should create VellumError from string", () => {
        const handler = new GlobalErrorHandler({ logger });

        const result = handler.handle("A string error message");

        expect(result).toBeInstanceOf(VellumError);
        expect(result.code).toBe(ErrorCode.UNKNOWN);
        expect(result.message).toBe("A string error message");
      });

      it("should create VellumError with generic message for undefined", () => {
        const handler = new GlobalErrorHandler({ logger });

        const result = handler.handle(undefined);

        expect(result).toBeInstanceOf(VellumError);
        expect(result.code).toBe(ErrorCode.UNKNOWN);
        expect(result.message).toBe("An unknown error occurred");
        expect(result.context?.originalType).toBe("undefined");
      });

      it("should create VellumError with generic message for null", () => {
        const handler = new GlobalErrorHandler({ logger });

        const result = handler.handle(null);

        expect(result).toBeInstanceOf(VellumError);
        expect(result.code).toBe(ErrorCode.UNKNOWN);
        expect(result.message).toBe("An unknown error occurred");
        expect(result.context?.originalValue).toBe("null");
      });

      it("should create VellumError with generic message for number", () => {
        const handler = new GlobalErrorHandler({ logger });

        const result = handler.handle(42);

        expect(result).toBeInstanceOf(VellumError);
        expect(result.code).toBe(ErrorCode.UNKNOWN);
        expect(result.message).toBe("An unknown error occurred");
        expect(result.context?.originalValue).toBe("42");
        expect(result.context?.originalType).toBe("number");
      });

      it("should create VellumError with generic message for object", () => {
        const handler = new GlobalErrorHandler({ logger });

        const result = handler.handle({ custom: "error" });

        expect(result).toBeInstanceOf(VellumError);
        expect(result.code).toBe(ErrorCode.UNKNOWN);
        expect(result.message).toBe("An unknown error occurred");
        expect(result.context?.originalType).toBe("object");
      });
    });

    describe("logging", () => {
      it("should log FATAL errors at error level", () => {
        const handler = new GlobalErrorHandler({ logger });
        const fatalError = new VellumError("Fatal!", ErrorCode.UNKNOWN);

        handler.handle(fatalError);

        expect(errorSpy).toHaveBeenCalledOnce();
        expect(errorSpy).toHaveBeenCalledWith("Fatal!", expect.any(Object));
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it("should log RECOVERABLE errors at warn level", () => {
        const handler = new GlobalErrorHandler({ logger });
        const recoverableError = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT);

        handler.handle(recoverableError);

        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy).toHaveBeenCalledWith("Rate limited", expect.any(Object));
        expect(errorSpy).not.toHaveBeenCalled();
      });

      it("should log USER_ACTION errors at warn level", () => {
        const handler = new GlobalErrorHandler({ logger });
        const userActionError = new VellumError("Config not found", ErrorCode.CONFIG_NOT_FOUND);

        handler.handle(userActionError);

        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy).toHaveBeenCalledWith("Config not found", expect.any(Object));
        expect(errorSpy).not.toHaveBeenCalled();
      });

      it("should include error JSON in log data", () => {
        const handler = new GlobalErrorHandler({ logger });
        const error = new VellumError("Test", ErrorCode.TOOL_NOT_FOUND, {
          context: { toolName: "read_file" },
        });

        handler.handle(error);

        expect(warnSpy).toHaveBeenCalledWith(
          "Test",
          expect.objectContaining({
            code: ErrorCode.TOOL_NOT_FOUND,
            context: { toolName: "read_file" },
          })
        );
      });
    });

    describe("event emission", () => {
      it("should emit Events.error when eventBus is provided", () => {
        const eventBus = new EventBus();
        const handler = new GlobalErrorHandler({ logger, eventBus });
        const emitSpy = vi.spyOn(eventBus, "emit");

        const error = new VellumError("Test error", ErrorCode.TOOL_NOT_FOUND);
        handler.handle(error);

        expect(emitSpy).toHaveBeenCalledOnce();
        expect(emitSpy).toHaveBeenCalledWith(Events.error, {
          error: error,
          context: error.context,
        });
      });

      it("should not emit when eventBus is not provided", () => {
        const handler = new GlobalErrorHandler({ logger });

        // Should not throw
        expect(() => handler.handle(new Error("Test"))).not.toThrow();
      });

      it("should include context in emitted event", () => {
        const eventBus = new EventBus();
        const handler = new GlobalErrorHandler({ logger, eventBus });
        const receivedPayloads: unknown[] = [];

        eventBus.on(Events.error, (payload) => {
          receivedPayloads.push(payload);
        });

        const error = new VellumError("Test", ErrorCode.TOOL_NOT_FOUND, {
          context: { toolName: "write_file" },
        });
        handler.handle(error);

        expect(receivedPayloads).toHaveLength(1);
        expect(receivedPayloads[0]).toMatchObject({
          error: error,
          context: { toolName: "write_file" },
        });
      });

      it("should emit for normalized errors too", () => {
        const eventBus = new EventBus();
        const handler = new GlobalErrorHandler({ logger, eventBus });
        const receivedPayloads: unknown[] = [];

        eventBus.on(Events.error, (payload) => {
          receivedPayloads.push(payload);
        });

        handler.handle("string error");

        expect(receivedPayloads).toHaveLength(1);
        const payload = receivedPayloads[0] as { error: VellumError };
        expect(payload.error).toBeInstanceOf(VellumError);
        expect(payload.error.message).toBe("string error");
      });
    });
  });

  describe("isRecoverable()", () => {
    it("should return false for FATAL VellumError", () => {
      const handler = new GlobalErrorHandler({ logger });
      const fatalError = new VellumError("Fatal!", ErrorCode.UNKNOWN);

      expect(fatalError.severity).toBe(ErrorSeverity.FATAL);
      expect(handler.isRecoverable(fatalError)).toBe(false);
    });

    it("should return false for OUT_OF_MEMORY error", () => {
      const handler = new GlobalErrorHandler({ logger });
      const oomError = new VellumError("Out of memory", ErrorCode.SYSTEM_OUT_OF_MEMORY);

      expect(oomError.severity).toBe(ErrorSeverity.FATAL);
      expect(handler.isRecoverable(oomError)).toBe(false);
    });

    it("should return true for RECOVERABLE VellumError", () => {
      const handler = new GlobalErrorHandler({ logger });
      const recoverableError = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT);

      expect(recoverableError.severity).toBe(ErrorSeverity.RECOVERABLE);
      expect(handler.isRecoverable(recoverableError)).toBe(true);
    });

    it("should return true for USER_ACTION VellumError", () => {
      const handler = new GlobalErrorHandler({ logger });
      const userActionError = new VellumError("Auth failed", ErrorCode.LLM_AUTH_FAILED);

      expect(userActionError.severity).toBe(ErrorSeverity.USER_ACTION);
      expect(handler.isRecoverable(userActionError)).toBe(true);
    });

    it("should return true for standard Error (non-VellumError)", () => {
      const handler = new GlobalErrorHandler({ logger });
      const standardError = new Error("Something went wrong");

      expect(handler.isRecoverable(standardError)).toBe(true);
    });

    it("should return true for string errors", () => {
      const handler = new GlobalErrorHandler({ logger });

      expect(handler.isRecoverable("string error")).toBe(true);
    });

    it("should return true for null", () => {
      const handler = new GlobalErrorHandler({ logger });

      expect(handler.isRecoverable(null)).toBe(true);
    });

    it("should return true for undefined", () => {
      const handler = new GlobalErrorHandler({ logger });

      expect(handler.isRecoverable(undefined)).toBe(true);
    });

    it("should return true for arbitrary objects", () => {
      const handler = new GlobalErrorHandler({ logger });

      expect(handler.isRecoverable({ custom: "error" })).toBe(true);
    });
  });
});
