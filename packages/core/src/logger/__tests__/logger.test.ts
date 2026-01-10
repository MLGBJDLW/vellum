import { trace } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "../logger.js";
import { ConsoleTransport } from "../transports/console.js";
import { JsonTransport } from "../transports/json.js";
import type { LogEntry, LogTransport } from "../types.js";

/**
 * Mock transport for testing that captures all log entries.
 */
function createMockTransport(): LogTransport & {
  entries: LogEntry[];
  flushed: boolean;
  disposed: boolean;
} {
  return {
    entries: [],
    flushed: false,
    disposed: false,
    log(entry: LogEntry) {
      this.entries.push(entry);
    },
    async flush() {
      this.flushed = true;
    },
    dispose() {
      this.disposed = true;
    },
  };
}

describe("Logger", () => {
  describe("log methods", () => {
    it("should log messages with trace level", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "trace", transports: [transport] });

      logger.trace("trace message", { traceData: true });

      expect(transport.entries).toHaveLength(1);
      const entry = transport.entries[0];
      if (!entry) throw new Error("Test setup error");
      expect(entry.level).toBe("trace");
      expect(entry.message).toBe("trace message");
      expect(entry.data).toEqual({ traceData: true });
    });

    it("should log messages with debug level", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "debug", transports: [transport] });

      logger.debug("debug message", { key: "value" });

      expect(transport.entries).toHaveLength(1);
      const entry = transport.entries[0];
      if (!entry) throw new Error("Test setup error");
      expect(entry.level).toBe("debug");
      expect(entry.message).toBe("debug message");
      expect(entry.data).toEqual({ key: "value" });
    });

    it("should log messages with info level", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });

      logger.info("info message", 42);

      expect(transport.entries).toHaveLength(1);
      const entry = transport.entries[0];
      if (!entry) throw new Error("Test setup error");
      expect(entry.level).toBe("info");
      expect(entry.message).toBe("info message");
      expect(entry.data).toBe(42);
    });

    it("should log messages with warn level", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "warn", transports: [transport] });

      logger.warn("warn message", ["item1", "item2"]);

      expect(transport.entries).toHaveLength(1);
      const entry = transport.entries[0];
      if (!entry) throw new Error("Test setup error");
      expect(entry.level).toBe("warn");
      expect(entry.message).toBe("warn message");
      expect(entry.data).toEqual(["item1", "item2"]);
    });

    it("should log messages with error level", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "error", transports: [transport] });
      const error = new Error("Test error");

      logger.error("error message", error);

      expect(transport.entries).toHaveLength(1);
      const entry = transport.entries[0];
      if (!entry) throw new Error("Test setup error");
      expect(entry.level).toBe("error");
      expect(entry.message).toBe("error message");
      expect(entry.data).toBe(error);
    });

    it("should log messages with fatal level", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "fatal", transports: [transport] });

      logger.fatal("fatal message", { critical: true });

      expect(transport.entries).toHaveLength(1);
      const entry = transport.entries[0];
      if (!entry) throw new Error("Test setup error");
      expect(entry.level).toBe("fatal");
      expect(entry.message).toBe("fatal message");
      expect(entry.data).toEqual({ critical: true });
    });

    it("should log messages without data", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });

      logger.info("simple message");

      expect(transport.entries).toHaveLength(1);
      expect(transport.entries[0]?.data).toBeUndefined();
    });
  });

  describe("level filtering", () => {
    it("should not log debug messages at info level", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });

      logger.debug("debug message");

      expect(transport.entries).toHaveLength(0);
    });

    it("should log info messages at info level", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });

      logger.info("info message");

      expect(transport.entries).toHaveLength(1);
    });

    it("should log warn messages at info level", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });

      logger.warn("warn message");

      expect(transport.entries).toHaveLength(1);
    });

    it("should log error messages at info level", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });

      logger.error("error message");

      expect(transport.entries).toHaveLength(1);
    });

    it("should only log error messages at error level", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "error", transports: [transport] });

      logger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.error("error");

      expect(transport.entries).toHaveLength(1);
      expect(transport.entries[0]?.level).toBe("error");
    });

    it("should respect level change via setLevel", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "error", transports: [transport] });

      logger.info("filtered");
      expect(transport.entries).toHaveLength(0);

      logger.setLevel("debug");
      logger.info("not filtered");
      expect(transport.entries).toHaveLength(1);
    });
  });

  describe("child logger", () => {
    it("should inherit parent context", () => {
      const transport = createMockTransport();
      const parent = new Logger({
        level: "info",
        context: { app: "test" },
        transports: [transport],
      });

      const child = parent.child({ requestId: "123" });
      child.info("child message");

      expect(transport.entries).toHaveLength(1);
      expect(transport.entries[0]?.context).toEqual({
        app: "test",
        requestId: "123",
      });
    });

    it("should override parent context with child context", () => {
      const transport = createMockTransport();
      const parent = new Logger({
        level: "info",
        context: { version: "v1" },
        transports: [transport],
      });

      const child = parent.child({ version: "v2" });
      child.info("child message");

      expect(transport.entries[0]?.context).toEqual({ version: "v2" });
    });

    it("should inherit parent transports", () => {
      const transport = createMockTransport();
      const parent = new Logger({ level: "info", transports: [transport] });

      const child = parent.child({ childId: "c1" });
      child.info("child message");

      expect(transport.entries).toHaveLength(1);
    });

    it("should inherit parent level", () => {
      const transport = createMockTransport();
      const parent = new Logger({ level: "warn", transports: [transport] });

      const child = parent.child({});
      child.info("filtered");
      child.warn("not filtered");

      expect(transport.entries).toHaveLength(1);
      expect(transport.entries[0]?.message).toBe("not filtered");
    });
  });

  describe("multiple transports", () => {
    it("should log to all transports", () => {
      const transport1 = createMockTransport();
      const transport2 = createMockTransport();
      const logger = new Logger({
        level: "info",
        transports: [transport1, transport2],
      });

      logger.info("test message");

      expect(transport1.entries).toHaveLength(1);
      expect(transport2.entries).toHaveLength(1);
    });

    it("should add transport via addTransport", () => {
      const transport1 = createMockTransport();
      const transport2 = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport1] });

      logger.addTransport(transport2);
      logger.info("test message");

      expect(transport1.entries).toHaveLength(1);
      expect(transport2.entries).toHaveLength(1);
    });

    it("should work with real ConsoleTransport and JsonTransport", () => {
      const consoleOutput = vi.fn();
      const jsonOutput = vi.fn();

      vi.spyOn(console, "log").mockImplementation(consoleOutput);

      const consoleTransport = new ConsoleTransport({ colors: false });
      const jsonTransport = new JsonTransport({ output: jsonOutput });

      const logger = new Logger({
        level: "info",
        transports: [consoleTransport, jsonTransport],
      });

      logger.info("multi-transport test");

      expect(consoleOutput).toHaveBeenCalled();
      expect(jsonOutput).toHaveBeenCalled();

      // Verify JSON output format
      const jsonLine = jsonOutput.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(jsonLine) as Record<string, unknown>;
      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("multi-transport test");

      vi.restoreAllMocks();
    });
  });

  describe("flush", () => {
    it("should await all transport flushes", async () => {
      const flushOrder: number[] = [];
      const transport1: LogTransport = {
        log: () => {},
        async flush() {
          await new Promise((r) => setTimeout(r, 10));
          flushOrder.push(1);
        },
      };
      const transport2: LogTransport = {
        log: () => {},
        async flush() {
          await new Promise((r) => setTimeout(r, 5));
          flushOrder.push(2);
        },
      };

      const logger = new Logger({
        level: "info",
        transports: [transport1, transport2],
      });

      await logger.flush();

      // Both should have been flushed
      expect(flushOrder).toContain(1);
      expect(flushOrder).toContain(2);
    });

    it("should handle transports without flush", async () => {
      const transport: LogTransport = {
        log: () => {},
        // No flush method
      };

      const logger = new Logger({ level: "info", transports: [transport] });

      // Should not throw
      await expect(logger.flush()).resolves.toBeUndefined();
    });

    it("should flush mock transports", async () => {
      const transport1 = createMockTransport();
      const transport2 = createMockTransport();
      const logger = new Logger({
        level: "info",
        transports: [transport1, transport2],
      });

      await logger.flush();

      expect(transport1.flushed).toBe(true);
      expect(transport2.flushed).toBe(true);
    });
  });

  describe("dispose", () => {
    it("should dispose all transports", () => {
      const transport1 = createMockTransport();
      const transport2 = createMockTransport();
      const logger = new Logger({
        level: "info",
        transports: [transport1, transport2],
      });

      logger.dispose();

      expect(transport1.disposed).toBe(true);
      expect(transport2.disposed).toBe(true);
    });

    it("should handle transports without dispose", () => {
      const transport: LogTransport = {
        log: () => {},
        // No dispose method
      };

      const logger = new Logger({ level: "info", transports: [transport] });

      // Should not throw
      expect(() => logger.dispose()).not.toThrow();
    });
  });

  describe("timestamp", () => {
    it("should include timestamp in log entries", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });

      const before = new Date();
      logger.info("test");
      const after = new Date();

      const entry = transport.entries[0];
      if (!entry) throw new Error("Test setup error");
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entry.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("context handling", () => {
    it("should not include empty context", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });

      logger.info("no context");

      expect(transport.entries[0]?.context).toBeUndefined();
    });

    it("should include context when provided", () => {
      const transport = createMockTransport();
      const logger = new Logger({
        level: "info",
        context: { service: "api" },
        transports: [transport],
      });

      logger.info("with context");

      expect(transport.entries[0]?.context).toEqual({ service: "api" });
    });
  });

  describe("getLevel", () => {
    it("should return current log level", () => {
      const logger = new Logger({ level: "warn" });
      expect(logger.getLevel()).toBe("warn");
    });

    it("should default to info level", () => {
      const logger = new Logger();
      expect(logger.getLevel()).toBe("info");
    });
  });

  describe("all 6 log levels", () => {
    it("should support all 6 log levels: trace, debug, info, warn, error, fatal", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "trace", transports: [transport] });

      logger.trace("trace level");
      logger.debug("debug level");
      logger.info("info level");
      logger.warn("warn level");
      logger.error("error level");
      logger.fatal("fatal level");

      expect(transport.entries).toHaveLength(6);
      expect(transport.entries.map((e) => e.level)).toEqual([
        "trace",
        "debug",
        "info",
        "warn",
        "error",
        "fatal",
      ]);
    });

    it("should filter levels correctly at trace level (logs all)", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "trace", transports: [transport] });

      logger.trace("1");
      logger.debug("2");
      logger.info("3");
      logger.warn("4");
      logger.error("5");
      logger.fatal("6");

      expect(transport.entries).toHaveLength(6);
    });

    it("should filter levels correctly at fatal level (logs only fatal)", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "fatal", transports: [transport] });

      logger.trace("1");
      logger.debug("2");
      logger.info("3");
      logger.warn("4");
      logger.error("5");
      logger.fatal("6");

      expect(transport.entries).toHaveLength(1);
      expect(transport.entries[0]?.level).toBe("fatal");
    });
  });

  describe("time() method", () => {
    it("should return a TimerResult with end() method", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "debug", transports: [transport] });

      const timer = logger.time("operation");
      expect(timer).toHaveProperty("end");
      expect(typeof timer.end).toBe("function");
    });

    it("should return a TimerResult with stop() method", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "debug", transports: [transport] });

      const timer = logger.time("operation");
      expect(timer).toHaveProperty("stop");
      expect(typeof timer.stop).toBe("function");
    });

    it("timer.end() should log duration", async () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "debug", transports: [transport] });

      const timer = logger.time("test-operation");
      await new Promise((r) => setTimeout(r, 10));
      timer.end();

      expect(transport.entries).toHaveLength(1);
      const entry = transport.entries[0];
      if (!entry) throw new Error("Test setup error");
      expect(entry.level).toBe("debug");
      expect(entry.message).toBe("test-operation completed");
      expect(entry.data).toHaveProperty("label", "test-operation");
      expect(entry.data).toHaveProperty("durationMs");
      // Timers are not perfectly precise across platforms/CI; allow small scheduling jitter.
      expect((entry.data as Record<string, unknown>).durationMs).toBeGreaterThanOrEqual(9);
    });

    it("timer.end() should accept custom message", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "debug", transports: [transport] });

      const timer = logger.time("db-query");
      timer.end("Database query finished");

      expect(transport.entries[0]?.message).toBe("Database query finished");
    });

    it("timer.stop() should return duration without logging", async () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "debug", transports: [transport] });

      const timer = logger.time("silent-operation");
      await new Promise((r) => setTimeout(r, 10));
      const duration = timer.stop();

      // stop() should NOT log
      expect(transport.entries).toHaveLength(0);

      // But should return duration in ms
      expect(typeof duration).toBe("number");
      expect(duration).toBeGreaterThanOrEqual(9);
    });

    it("timer.duration should be updated after stop()", async () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "debug", transports: [transport] });

      const timer = logger.time("check-duration");
      expect(timer.duration).toBe(0);

      await new Promise((r) => setTimeout(r, 10));
      timer.stop();

      expect(timer.duration).toBeGreaterThanOrEqual(9);
    });

    it("timer.duration should be updated after end()", async () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "debug", transports: [transport] });

      const timer = logger.time("check-duration-end");
      expect(timer.duration).toBe(0);

      await new Promise((r) => setTimeout(r, 10));
      timer.end();

      expect(timer.duration).toBeGreaterThanOrEqual(9);
    });
  });

  describe("trace ID injection", () => {
    let provider: NodeTracerProvider;

    beforeEach(() => {
      provider = new NodeTracerProvider();
      provider.register();
    });

    afterEach(async () => {
      await provider.shutdown();
    });

    it("should include traceId and spanId when in active span", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });
      const tracer = trace.getTracer("test-tracer");

      tracer.startActiveSpan("test-span", (span) => {
        logger.info("log within span");

        const entry = transport.entries[0];
        if (!entry) throw new Error("Test setup error");
        expect(entry.traceId).toBeDefined();
        expect(entry.spanId).toBeDefined();
        expect(entry.traceId).toHaveLength(32);
        expect(entry.spanId).toHaveLength(16);

        span.end();
      });
    });

    it("should not include traceId/spanId when not in active span", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });

      logger.info("log without span");

      const entry = transport.entries[0];
      if (!entry) throw new Error("Test setup error");
      expect(entry.traceId).toBeUndefined();
      expect(entry.spanId).toBeUndefined();
    });

    it("should include same traceId for nested logs in same trace", () => {
      const transport = createMockTransport();
      const logger = new Logger({ level: "info", transports: [transport] });
      const tracer = trace.getTracer("test-tracer");

      tracer.startActiveSpan("parent-span", (parentSpan) => {
        logger.info("parent log");

        tracer.startActiveSpan("child-span", (childSpan) => {
          logger.info("child log");
          childSpan.end();
        });

        parentSpan.end();
      });

      expect(transport.entries).toHaveLength(2);
      const parentEntry = transport.entries[0];
      const childEntry = transport.entries[1];
      if (!parentEntry || !childEntry) throw new Error("Test setup error");

      // Same trace
      expect(parentEntry.traceId).toBe(childEntry.traceId);
      // Different spans
      expect(parentEntry.spanId).not.toBe(childEntry.spanId);
    });
  });
});
