import { describe, it, expect, vi } from "vitest";
import type { StreamEvent } from "@vellum/provider";
import { StreamLogger } from "../logging.js";

describe("StreamLogger", () => {
  describe("logChunk()", () => {
    it("logs text events", () => {
      const logFn = vi.fn();
      const logger = new StreamLogger({ level: "trace", logFn });
      const event: StreamEvent = { type: "text", content: "Hello world" };

      logger.logChunk(event);

      expect(logFn).toHaveBeenCalledWith("trace", "[text] Hello world", event);
    });

    it("logs error events at error level", () => {
      const logFn = vi.fn();
      const logger = new StreamLogger({ level: "trace", logFn });
      const event: StreamEvent = {
        type: "error",
        code: "TEST_ERROR",
        message: "Something went wrong",
        retryable: false,
      };

      logger.logChunk(event);

      expect(logFn).toHaveBeenCalledWith(
        "error",
        "[error] Something went wrong",
        event
      );
    });

    it("respects log level filtering", () => {
      const logFn = vi.fn();
      const logger = new StreamLogger({ level: "error", logFn });
      const textEvent: StreamEvent = { type: "text", content: "Hello" };
      const errorEvent: StreamEvent = {
        type: "error",
        code: "ERR",
        message: "Error",
        retryable: false,
      };

      logger.logChunk(textEvent); // trace level - should be filtered
      logger.logChunk(errorEvent); // error level - should pass

      expect(logFn).toHaveBeenCalledTimes(1);
      expect(logFn).toHaveBeenCalledWith("error", "[error] Error", errorEvent);
    });
  });

  describe("custom logFn", () => {
    it("is called with level, message, and data", () => {
      const logFn = vi.fn();
      const logger = new StreamLogger({ level: "info", logFn });

      logger.log("info", "Test message", { extra: "data" });

      expect(logFn).toHaveBeenCalledWith("info", "Test message", {
        extra: "data",
      });
    });
  });

  describe("timestamps", () => {
    it("includes timestamp when enabled", () => {
      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const logger = new StreamLogger({ level: "info", timestamps: true });

      logger.log("info", "Test");

      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0];
      expect(call).toBeDefined();
      const loggedMessage = call![0] as string;
      expect(loggedMessage).toMatch(/^\[\d{4}-\d{2}-\d{2}T/); // ISO timestamp
      expect(loggedMessage).toContain("Test");

      consoleSpy.mockRestore();
    });

    it("excludes timestamp when disabled", () => {
      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const logger = new StreamLogger({ level: "info", timestamps: false });

      logger.log("info", "Test");

      expect(consoleSpy).toHaveBeenCalledWith("Test");

      consoleSpy.mockRestore();
    });
  });

  describe("prefix", () => {
    it("includes event type prefix when enabled", () => {
      const logFn = vi.fn();
      const logger = new StreamLogger({ level: "trace", prefix: true, logFn });
      const event: StreamEvent = { type: "text", content: "Hello" };

      logger.logChunk(event);

      expect(logFn).toHaveBeenCalledWith("trace", "[text] Hello", event);
    });

    it("excludes event type prefix when disabled", () => {
      const logFn = vi.fn();
      const logger = new StreamLogger({ level: "trace", prefix: false, logFn });
      const event: StreamEvent = { type: "text", content: "Hello" };

      logger.logChunk(event);

      expect(logFn).toHaveBeenCalledWith("trace", "Hello", event);
    });
  });
});
