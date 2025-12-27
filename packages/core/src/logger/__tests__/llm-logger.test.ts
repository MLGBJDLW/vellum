import { describe, expect, it } from "vitest";
import { LLMLogger } from "../llm-logger.js";
import { Logger } from "../logger.js";
import type { LogEntry, LogTransport } from "../types.js";

/**
 * Mock transport for capturing log entries.
 */
function createMockTransport(): LogTransport & { entries: LogEntry[] } {
  return {
    entries: [],
    log(entry: LogEntry) {
      this.entries.push(entry);
    },
  };
}

describe("LLMLogger", () => {
  describe("logRequestStart", () => {
    it("should log request start with correct structure", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });
      const llmLogger = new LLMLogger(logger);

      llmLogger.logRequestStart("openai", "gpt-4", "req-123");

      expect(transport.entries).toHaveLength(1);
      const entry = transport.entries[0]!;
      expect(entry.level).toBe("info");
      expect(entry.message).toBe("LLM request started");

      const data = entry.data as Record<string, unknown>;
      expect(data.event).toBe("llm.request.start");
      expect(data.provider).toBe("openai");
      expect(data.model).toBe("gpt-4");
      expect(data.requestId).toBe("req-123");
    });

    it("should handle different providers", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });
      const llmLogger = new LLMLogger(logger);

      llmLogger.logRequestStart("anthropic", "claude-3-opus", "req-abc");

      const data = transport.entries[0]!.data as Record<string, unknown>;
      expect(data.provider).toBe("anthropic");
      expect(data.model).toBe("claude-3-opus");
    });
  });

  describe("logRequestComplete", () => {
    it("should log completion with all fields", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });
      const llmLogger = new LLMLogger(logger);

      llmLogger.logRequestComplete({
        provider: "openai",
        model: "gpt-4",
        requestId: "req-456",
        inputTokens: 100,
        outputTokens: 50,
        durationMs: 1500,
      });

      expect(transport.entries).toHaveLength(1);
      const entry = transport.entries[0]!;
      expect(entry.level).toBe("info");
      expect(entry.message).toBe("LLM request completed");

      const data = entry.data as Record<string, unknown>;
      expect(data.event).toBe("llm.request.complete");
      expect(data.provider).toBe("openai");
      expect(data.model).toBe("gpt-4");
      expect(data.requestId).toBe("req-456");
      expect(data.inputTokens).toBe(100);
      expect(data.outputTokens).toBe(50);
      expect(data.durationMs).toBe(1500);
      expect(data.totalTokens).toBe(150);
    });

    it("should handle missing token counts", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });
      const llmLogger = new LLMLogger(logger);

      llmLogger.logRequestComplete({
        provider: "openai",
        model: "gpt-4",
        requestId: "req-789",
        durationMs: 1000,
      });

      const data = transport.entries[0]!.data as Record<string, unknown>;
      expect(data.inputTokens).toBeUndefined();
      expect(data.outputTokens).toBeUndefined();
      expect(data.totalTokens).toBeUndefined();
    });

    it("should calculate totalTokens only when both input and output are present", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });
      const llmLogger = new LLMLogger(logger);

      // Only inputTokens
      llmLogger.logRequestComplete({
        provider: "openai",
        model: "gpt-4",
        requestId: "req-1",
        inputTokens: 100,
      });
      expect((transport.entries[0]!.data as Record<string, unknown>).totalTokens).toBeUndefined();

      // Only outputTokens
      llmLogger.logRequestComplete({
        provider: "openai",
        model: "gpt-4",
        requestId: "req-2",
        outputTokens: 50,
      });
      expect((transport.entries[1]!.data as Record<string, unknown>).totalTokens).toBeUndefined();
    });
  });

  describe("logRequestError", () => {
    it("should log error with Error object", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });
      const llmLogger = new LLMLogger(logger);
      const error = new Error("API rate limited");

      llmLogger.logRequestError({
        provider: "anthropic",
        model: "claude-3-opus",
        requestId: "req-err-1",
        durationMs: 500,
        error,
      });

      expect(transport.entries).toHaveLength(1);
      const entry = transport.entries[0]!;
      expect(entry.level).toBe("error");
      expect(entry.message).toBe("LLM request failed");

      const data = entry.data as Record<string, unknown>;
      expect(data.event).toBe("llm.request.error");
      expect(data.provider).toBe("anthropic");
      expect(data.model).toBe("claude-3-opus");
      expect(data.requestId).toBe("req-err-1");
      expect(data.durationMs).toBe(500);

      const errorData = data.error as Record<string, unknown>;
      expect(errorData.name).toBe("Error");
      expect(errorData.message).toBe("API rate limited");
      expect(errorData.stack).toBeDefined();
    });

    it("should handle non-Error values", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });
      const llmLogger = new LLMLogger(logger);

      llmLogger.logRequestError({
        provider: "google",
        model: "gemini-pro",
        requestId: "req-err-2",
        error: "Connection timeout",
      });

      const data = transport.entries[0]!.data as Record<string, unknown>;
      const errorData = data.error as Record<string, unknown>;
      expect(errorData.raw).toBe("Connection timeout");
    });

    it("should handle TypeError", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });
      const llmLogger = new LLMLogger(logger);
      const error = new TypeError("Invalid response format");

      llmLogger.logRequestError({
        provider: "openai",
        model: "gpt-4",
        requestId: "req-err-3",
        error,
      });

      const data = transport.entries[0]!.data as Record<string, unknown>;
      const errorData = data.error as Record<string, unknown>;
      expect(errorData.name).toBe("TypeError");
      expect(errorData.message).toBe("Invalid response format");
    });
  });

  describe("integration", () => {
    it("should support full request lifecycle logging", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });
      const llmLogger = new LLMLogger(logger);

      const requestId = "req-lifecycle";

      // Start
      llmLogger.logRequestStart("openai", "gpt-4", requestId);

      // Complete
      llmLogger.logRequestComplete({
        provider: "openai",
        model: "gpt-4",
        requestId,
        inputTokens: 200,
        outputTokens: 100,
        durationMs: 2000,
      });

      expect(transport.entries).toHaveLength(2);
      expect(transport.entries[0]!.message).toBe("LLM request started");
      expect(transport.entries[1]!.message).toBe("LLM request completed");

      // Verify requestId correlation
      const startData = transport.entries[0]!.data as Record<string, unknown>;
      const completeData = transport.entries[1]!.data as Record<string, unknown>;
      expect(startData.requestId).toBe(completeData.requestId);
    });

    it("should support error lifecycle logging", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });
      const llmLogger = new LLMLogger(logger);

      const requestId = "req-error-lifecycle";

      // Start
      llmLogger.logRequestStart("anthropic", "claude-3-sonnet", requestId);

      // Error
      llmLogger.logRequestError({
        provider: "anthropic",
        model: "claude-3-sonnet",
        requestId,
        durationMs: 100,
        error: new Error("Network error"),
      });

      expect(transport.entries).toHaveLength(2);
      expect(transport.entries[0]!.level).toBe("info");
      expect(transport.entries[1]!.level).toBe("error");
    });
  });
});
