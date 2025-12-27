/**
 * Credential Audit Logger Tests
 *
 * @module credentials/__tests__/audit.test
 */

import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import {
  type AuditLogEntry,
  AuditLogEntrySchema,
  AuditOperationSchema,
  CredentialAuditLogger,
  createBatchHandler,
  createConsoleHandler,
  createDefaultAuditLogger,
  createFileHandler,
  createFilteredHandler,
  createManagerEventListener,
  createSilentAuditLogger,
} from "../audit.js";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Safely get the first call argument from a mock function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFirstCallArg<T>(mock: Mock): T {
  const call = mock.mock.calls[0];
  if (!call) throw new Error("Mock was not called");
  return call[0] as T;
}

// =============================================================================
// Schema Tests
// =============================================================================

describe("Audit Schemas", () => {
  describe("AuditOperationSchema", () => {
    it("should accept valid operations", () => {
      const operations = ["resolve", "store", "delete", "rotate", "validate", "refresh"];

      for (const op of operations) {
        const result = AuditOperationSchema.safeParse(op);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid operations", () => {
      const result = AuditOperationSchema.safeParse("invalid_op");
      expect(result.success).toBe(false);
    });
  });

  describe("AuditLogEntrySchema", () => {
    it("should accept valid entries", () => {
      const entry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 15,
      };

      const result = AuditLogEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
    });

    it("should accept entries with optional fields", () => {
      const entry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "store",
        provider: "openai",
        key: "default",
        source: "file",
        success: false,
        durationMs: 150,
        metadata: { error: "write failed", storePriority: 2 },
      };

      const result = AuditLogEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.key).toBe("default");
        expect(result.data.metadata).toEqual({ error: "write failed", storePriority: 2 });
      }
    });

    it("should reject entries missing required fields", () => {
      const entry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "resolve",
        // missing provider
        source: "keychain",
        success: true,
        durationMs: 15,
      };

      const result = AuditLogEntrySchema.safeParse(entry);
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// CredentialAuditLogger Tests
// =============================================================================

describe("CredentialAuditLogger", () => {
  describe("constructor", () => {
    it("should create logger with default options", () => {
      const logger = new CredentialAuditLogger();
      expect(logger.handlerCount).toBe(0);
    });

    it("should create logger with handlers", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const logger = new CredentialAuditLogger({
        handlers: [handler1, handler2],
      });

      expect(logger.handlerCount).toBe(2);
    });

    it("should create disabled logger", async () => {
      const handler = vi.fn();
      const logger = new CredentialAuditLogger({
        enabled: false,
        handlers: [handler],
      });

      await logger.log({
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 10,
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("handler management", () => {
    it("should add and remove handlers", () => {
      const logger = new CredentialAuditLogger();
      const handler = vi.fn();

      const unsubscribe = logger.addHandler(handler);
      expect(logger.handlerCount).toBe(1);

      unsubscribe();
      expect(logger.handlerCount).toBe(0);
    });

    it("should remove handler with removeHandler", () => {
      const logger = new CredentialAuditLogger();
      const handler = vi.fn();

      logger.addHandler(handler);
      expect(logger.handlerCount).toBe(1);

      const removed = logger.removeHandler(handler);
      expect(removed).toBe(true);
      expect(logger.handlerCount).toBe(0);
    });

    it("should return false when removing non-existent handler", () => {
      const logger = new CredentialAuditLogger();
      const handler = vi.fn();

      const removed = logger.removeHandler(handler);
      expect(removed).toBe(false);
    });
  });

  describe("log method", () => {
    it("should call all handlers with entry", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const logger = new CredentialAuditLogger({
        handlers: [handler1, handler2],
      });

      await logger.log({
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 15,
      });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      const entry = getFirstCallArg<AuditLogEntry>(handler1);
      expect(entry.operation).toBe("resolve");
      expect(entry.provider).toBe("anthropic");
      expect(entry.source).toBe("keychain");
      expect(entry.success).toBe(true);
      expect(entry.durationMs).toBe(15);
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("should include optional key in entry", async () => {
      const handler = vi.fn();
      const logger = new CredentialAuditLogger({ handlers: [handler] });

      await logger.log({
        operation: "store",
        provider: "openai",
        key: "project-a",
        source: "file",
        success: true,
        durationMs: 50,
      });

      const entry = getFirstCallArg<AuditLogEntry>(handler);
      expect(entry.key).toBe("project-a");
    });

    it("should merge global and input metadata", async () => {
      const handler = vi.fn();
      const logger = new CredentialAuditLogger({
        handlers: [handler],
        globalMetadata: { env: "production", version: "1.0.0" },
      });

      await logger.log({
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 10,
        metadata: { storePriority: 1 },
      });

      const entry = getFirstCallArg<AuditLogEntry>(handler);
      expect(entry.metadata).toEqual({
        env: "production",
        version: "1.0.0",
        storePriority: 1,
      });
    });

    it("should not include timestamp when disabled", async () => {
      const handler = vi.fn();
      const logger = new CredentialAuditLogger({
        handlers: [handler],
        includeTimestamp: false,
      });

      await logger.log({
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 10,
      });

      const entry = getFirstCallArg<AuditLogEntry>(handler);
      expect(entry.timestamp).toBe("");
    });

    it("should ignore handler errors", async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error("Handler error"));
      const goodHandler = vi.fn();

      const logger = new CredentialAuditLogger({
        handlers: [errorHandler, goodHandler],
      });

      // Should not throw
      await logger.log({
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 10,
      });

      expect(goodHandler).toHaveBeenCalled();
    });
  });

  describe("logSync method", () => {
    it("should call handlers synchronously", () => {
      const handler = vi.fn();
      const logger = new CredentialAuditLogger({ handlers: [handler] });

      logger.logSync({
        operation: "delete",
        provider: "anthropic",
        source: "file",
        success: true,
        durationMs: 25,
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const entry = getFirstCallArg<AuditLogEntry>(handler);
      expect(entry.operation).toBe("delete");
    });
  });

  describe("startTimer", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should measure operation duration", async () => {
      const handler = vi.fn();
      const logger = new CredentialAuditLogger({ handlers: [handler] });

      const timer = logger.startTimer("resolve", "anthropic", "keychain");

      // Simulate 100ms delay
      vi.advanceTimersByTime(100);

      await timer.success();

      const entry = getFirstCallArg<AuditLogEntry>(handler);
      expect(entry.durationMs).toBeGreaterThanOrEqual(100);
      expect(entry.success).toBe(true);
    });

    it("should log failure with metadata", async () => {
      const handler = vi.fn();
      const logger = new CredentialAuditLogger({ handlers: [handler] });

      const timer = logger.startTimer("store", "openai", "file", "project-a");

      vi.advanceTimersByTime(50);

      await timer.failure({ error: "Write failed" });

      const entry = getFirstCallArg<AuditLogEntry>(handler);
      expect(entry.success).toBe(false);
      expect(entry.key).toBe("project-a");
      expect(entry.metadata).toEqual({ error: "Write failed" });
    });

    it("should provide elapsed time", () => {
      const logger = new CredentialAuditLogger();
      const timer = logger.startTimer("resolve", "anthropic", "keychain");

      vi.advanceTimersByTime(75);

      expect(timer.elapsed()).toBeGreaterThanOrEqual(75);
    });

    it("should support sync methods", () => {
      const handler = vi.fn();
      const logger = new CredentialAuditLogger({ handlers: [handler] });

      const timer = logger.startTimer("validate", "anthropic", "validation");

      vi.advanceTimersByTime(30);

      timer.successSync({ valid: true });

      expect(handler).toHaveBeenCalledTimes(1);
      const entry = getFirstCallArg<AuditLogEntry>(handler);
      expect(entry.operation).toBe("validate");
      expect(entry.success).toBe(true);
    });
  });

  describe("convenience methods", () => {
    it("should log resolve operation", async () => {
      const handler = vi.fn();
      const logger = new CredentialAuditLogger({ handlers: [handler] });

      await logger.logResolve("anthropic", "keychain", true, 15);

      const entry = getFirstCallArg<AuditLogEntry>(handler);
      expect(entry.operation).toBe("resolve");
      expect(entry.provider).toBe("anthropic");
    });

    it("should log store operation", async () => {
      const handler = vi.fn();
      const logger = new CredentialAuditLogger({ handlers: [handler] });

      await logger.logStore("openai", "file", true, 100, {
        key: "project-a",
        metadata: { encrypted: true },
      });

      const entry = getFirstCallArg<AuditLogEntry>(handler);
      expect(entry.operation).toBe("store");
      expect(entry.key).toBe("project-a");
      expect(entry.metadata).toEqual({ encrypted: true });
    });

    it("should log delete operation", async () => {
      const handler = vi.fn();
      const logger = new CredentialAuditLogger({ handlers: [handler] });

      await logger.logDelete("anthropic", "keychain", true, 50);

      const entry = getFirstCallArg<AuditLogEntry>(handler);
      expect(entry.operation).toBe("delete");
    });

    it("should log rotate operation", async () => {
      const handler = vi.fn();
      const logger = new CredentialAuditLogger({ handlers: [handler] });

      await logger.logRotate("openai", "keychain", true, 200);

      const entry = getFirstCallArg<AuditLogEntry>(handler);
      expect(entry.operation).toBe("rotate");
    });

    it("should log validate operation", async () => {
      const handler = vi.fn();
      const logger = new CredentialAuditLogger({ handlers: [handler] });

      await logger.logValidate("anthropic", "validation", false, 500, {
        metadata: { reason: "invalid format" },
      });

      const entry = getFirstCallArg<AuditLogEntry>(handler);
      expect(entry.operation).toBe("validate");
      expect(entry.success).toBe(false);
    });

    it("should log refresh operation", async () => {
      const handler = vi.fn();
      const logger = new CredentialAuditLogger({ handlers: [handler] });

      await logger.logRefresh("google", "keychain", true, 1000);

      const entry = getFirstCallArg<AuditLogEntry>(handler);
      expect(entry.operation).toBe("refresh");
      expect(entry.provider).toBe("google");
    });
  });
});

// =============================================================================
// Built-in Handler Tests
// =============================================================================

describe("Built-in Handlers", () => {
  describe("createConsoleHandler", () => {
    it("should log to console.info by default", () => {
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const handler = createConsoleHandler();

      const entry: AuditLogEntry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 15,
      };

      handler(entry);

      expect(infoSpy).toHaveBeenCalledWith("[AUDIT] ✓ RESOLVE anthropic from keychain (15ms)");

      infoSpy.mockRestore();
    });

    it("should log failures with ✗ marker", () => {
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const handler = createConsoleHandler();

      const entry: AuditLogEntry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "store",
        provider: "openai",
        source: "file",
        success: false,
        durationMs: 100,
      };

      handler(entry);

      expect(infoSpy).toHaveBeenCalledWith("[AUDIT] ✗ STORE openai from file (100ms)");

      infoSpy.mockRestore();
    });

    it("should include key in message", () => {
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const handler = createConsoleHandler();

      const entry: AuditLogEntry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "delete",
        provider: "anthropic",
        key: "project-a",
        source: "keychain",
        success: true,
        durationMs: 25,
      };

      handler(entry);

      expect(infoSpy).toHaveBeenCalledWith(
        "[AUDIT] ✓ DELETE anthropic:project-a from keychain (25ms)"
      );

      infoSpy.mockRestore();
    });

    it("should use specified log level", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const handler = createConsoleHandler({ level: "warn" });

      const entry: AuditLogEntry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 15,
      };

      handler(entry);

      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("should include metadata in verbose mode", () => {
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const handler = createConsoleHandler({ verbose: true });

      const entry: AuditLogEntry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 15,
        metadata: { storePriority: 1 },
      };

      handler(entry);

      expect(infoSpy).toHaveBeenCalledWith("[AUDIT] ✓ RESOLVE anthropic from keychain (15ms)", {
        storePriority: 1,
      });

      infoSpy.mockRestore();
    });

    it("should use custom prefix", () => {
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const handler = createConsoleHandler({ prefix: "[CREDS]" });

      const entry: AuditLogEntry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 15,
      };

      handler(entry);

      expect(infoSpy).toHaveBeenCalledWith("[CREDS] ✓ RESOLVE anthropic from keychain (15ms)");

      infoSpy.mockRestore();
    });
  });

  describe("createFileHandler", () => {
    it("should write JSON format by default", async () => {
      const writeLine = vi.fn();
      const handler = createFileHandler({ writeLine });

      const entry: AuditLogEntry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 15,
      };

      await handler(entry);

      expect(writeLine).toHaveBeenCalledWith(JSON.stringify(entry));
    });

    it("should write text format when specified", async () => {
      const writeLine = vi.fn();
      const handler = createFileHandler({ writeLine, format: "text" });

      const entry: AuditLogEntry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "store",
        provider: "openai",
        key: "project-a",
        source: "file",
        success: false,
        durationMs: 100,
      };

      await handler(entry);

      expect(writeLine).toHaveBeenCalledWith(
        "2025-12-26T10:00:00.000Z [FAILURE] store provider=openai key=project-a source=file duration=100ms"
      );
    });
  });

  describe("createFilteredHandler", () => {
    it("should only call handler for matching entries", async () => {
      const innerHandler = vi.fn();
      const handler = createFilteredHandler(
        (entry) => !entry.success, // Only failures
        innerHandler
      );

      const successEntry: AuditLogEntry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 15,
      };

      const failureEntry: AuditLogEntry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "store",
        provider: "openai",
        source: "file",
        success: false,
        durationMs: 100,
      };

      await handler(successEntry);
      await handler(failureEntry);

      expect(innerHandler).toHaveBeenCalledTimes(1);
      expect(innerHandler).toHaveBeenCalledWith(failureEntry);
    });
  });

  describe("createBatchHandler", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should batch entries before processing", async () => {
      const processor = vi.fn();
      const { handler } = createBatchHandler(3, 5000, processor);

      const entry: AuditLogEntry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 15,
      };

      await handler(entry);
      await handler(entry);
      expect(processor).not.toHaveBeenCalled();

      await handler(entry); // Third entry triggers flush
      expect(processor).toHaveBeenCalledWith([entry, entry, entry]);
    });

    it("should flush on interval", async () => {
      const processor = vi.fn();
      const { handler } = createBatchHandler(100, 1000, processor);

      const entry: AuditLogEntry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 15,
      };

      await handler(entry);
      expect(processor).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);

      expect(processor).toHaveBeenCalledWith([entry]);
    });

    it("should flush manually", async () => {
      const processor = vi.fn();
      const { handler, flush } = createBatchHandler(100, 5000, processor);

      const entry: AuditLogEntry = {
        timestamp: "2025-12-26T10:00:00.000Z",
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 15,
      };

      await handler(entry);
      expect(processor).not.toHaveBeenCalled();

      await flush();
      expect(processor).toHaveBeenCalledWith([entry]);
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe("Factory Functions", () => {
  describe("createDefaultAuditLogger", () => {
    it("should create logger with console handler", () => {
      const logger = createDefaultAuditLogger();
      expect(logger.handlerCount).toBe(1);
    });

    it("should merge additional handlers", () => {
      const customHandler = vi.fn();
      const logger = createDefaultAuditLogger({
        handlers: [customHandler],
      });
      expect(logger.handlerCount).toBe(2);
    });
  });

  describe("createSilentAuditLogger", () => {
    it("should create disabled logger", async () => {
      const logger = createSilentAuditLogger();

      // Should not throw
      await logger.log({
        operation: "resolve",
        provider: "anthropic",
        source: "keychain",
        success: true,
        durationMs: 10,
      });

      expect(logger.handlerCount).toBe(0);
    });
  });
});

// =============================================================================
// Manager Event Listener Tests
// =============================================================================

describe("createManagerEventListener", () => {
  it("should log resolved events", () => {
    const handler = vi.fn();
    const logger = new CredentialAuditLogger({ handlers: [handler] });
    const listener = createManagerEventListener(logger);

    listener({
      type: "credential:resolved",
      provider: "anthropic",
      source: "keychain",
    });

    expect(handler).toHaveBeenCalled();
    const entry = getFirstCallArg<AuditLogEntry>(handler);
    expect(entry.operation).toBe("resolve");
    expect(entry.success).toBe(true);
    expect(entry.provider).toBe("anthropic");
    expect(entry.source).toBe("keychain");
  });

  it("should log stored events", () => {
    const handler = vi.fn();
    const logger = new CredentialAuditLogger({ handlers: [handler] });
    const listener = createManagerEventListener(logger);

    listener({
      type: "credential:stored",
      provider: "openai",
      store: "file",
    });

    const entry = getFirstCallArg<AuditLogEntry>(handler);
    expect(entry.operation).toBe("store");
    expect(entry.success).toBe(true);
  });

  it("should log deleted events", () => {
    const handler = vi.fn();
    const logger = new CredentialAuditLogger({ handlers: [handler] });
    const listener = createManagerEventListener(logger);

    listener({
      type: "credential:deleted",
      provider: "anthropic",
      key: "project-a",
      store: "keychain",
    });

    const entry = getFirstCallArg<AuditLogEntry>(handler);
    expect(entry.operation).toBe("delete");
    expect(entry.key).toBe("project-a");
  });

  it("should log validated events", () => {
    const handler = vi.fn();
    const logger = new CredentialAuditLogger({ handlers: [handler] });
    const listener = createManagerEventListener(logger);

    listener({
      type: "credential:validated",
      provider: "anthropic",
      valid: true,
    });

    const entry = getFirstCallArg<AuditLogEntry>(handler);
    expect(entry.operation).toBe("validate");
    expect(entry.success).toBe(true);
  });

  it("should log not_found as failed resolve", () => {
    const handler = vi.fn();
    const logger = new CredentialAuditLogger({ handlers: [handler] });
    const listener = createManagerEventListener(logger);

    listener({
      type: "credential:not_found",
      provider: "unknown",
    });

    const entry = getFirstCallArg<AuditLogEntry>(handler);
    expect(entry.operation).toBe("resolve");
    expect(entry.success).toBe(false);
    expect(entry.metadata).toEqual({ notFound: true });
  });

  it("should log error events", () => {
    const handler = vi.fn();
    const logger = new CredentialAuditLogger({ handlers: [handler] });
    const listener = createManagerEventListener(logger);

    listener({
      type: "error",
      operation: "store",
      error: { code: "IO_ERROR", message: "Write failed" },
    });

    const entry = getFirstCallArg<AuditLogEntry>(handler);
    expect(entry.success).toBe(false);
    expect(entry.metadata).toEqual({
      errorCode: "IO_ERROR",
      errorMessage: "Write failed",
    });
  });
});

// =============================================================================
// Security Tests - Ensure Values Are Never Logged
// =============================================================================

describe("Security - No Credential Values Logged", () => {
  it("should never include value field in entries", async () => {
    const handler = vi.fn();
    const logger = new CredentialAuditLogger({ handlers: [handler] });

    // Try to sneak value into metadata
    await logger.log({
      operation: "resolve",
      provider: "anthropic",
      source: "keychain",
      success: true,
      durationMs: 10,
      metadata: {
        attemptedValue: "sk-secret-key", // Someone might try this
      },
    });

    const entry = getFirstCallArg<AuditLogEntry>(handler);

    // Entry should not have a 'value' property
    expect("value" in entry).toBe(false);

    // The schema itself doesn't define 'value'
    const schemaKeys = Object.keys(AuditLogEntrySchema.shape);
    expect(schemaKeys).not.toContain("value");
  });

  it("should validate entry structure excludes credential value", () => {
    // Verify schema doesn't allow 'value' field
    const entryWithValue = {
      timestamp: "2025-12-26T10:00:00.000Z",
      operation: "resolve",
      provider: "anthropic",
      source: "keychain",
      success: true,
      durationMs: 15,
      value: "sk-secret-key", // This should be ignored in strict mode
    };

    const result = AuditLogEntrySchema.safeParse(entryWithValue);
    expect(result.success).toBe(true);

    // Even if parsing succeeds, 'value' is stripped
    if (result.success) {
      // Zod strips unknown keys by default
      expect("value" in result.data).toBe(false);
    }
  });
});
