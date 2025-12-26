import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleTransport } from "../transports/console.js";
import type { LogEntry } from "../types.js";

describe("ConsoleTransport", () => {
  const mockEntry: LogEntry = {
    level: "info",
    message: "Test message",
    timestamp: new Date("2025-12-26T10:00:00.000Z"),
  };

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("log output", () => {
    it("outputs formatted message to console.log for non-error levels", () => {
      const transport = new ConsoleTransport({ colors: false });
      transport.log(mockEntry);

      expect(console.log).toHaveBeenCalledWith("[2025-12-26 10:00:00] [INFO ] Test message");
    });

    it("outputs to console.error for error level", () => {
      const transport = new ConsoleTransport({ colors: false });
      transport.log({ ...mockEntry, level: "error" });

      expect(console.error).toHaveBeenCalledWith("[2025-12-26 10:00:00] [ERROR] Test message");
    });

    it("includes data when present", () => {
      const transport = new ConsoleTransport({ colors: false });
      transport.log({ ...mockEntry, data: { key: "value" } });

      expect(console.log).toHaveBeenCalledWith(
        '[2025-12-26 10:00:00] [INFO ] Test message {"key":"value"}'
      );
    });

    it("handles string data directly", () => {
      const transport = new ConsoleTransport({ colors: false });
      transport.log({ ...mockEntry, data: "extra info" });

      expect(console.log).toHaveBeenCalledWith(
        "[2025-12-26 10:00:00] [INFO ] Test message extra info"
      );
    });
  });

  describe("color output", () => {
    it("adds ANSI colors when enabled", () => {
      const transport = new ConsoleTransport({ colors: true });
      transport.log(mockEntry);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("\x1b[32m") // green for info
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("\x1b[0m") // reset
      );
    });

    it("uses cyan for debug level", () => {
      const transport = new ConsoleTransport({ colors: true });
      transport.log({ ...mockEntry, level: "debug" });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("\x1b[36m"));
    });

    it("uses green for info level", () => {
      const transport = new ConsoleTransport({ colors: true });
      transport.log({ ...mockEntry, level: "info" });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("\x1b[32m"));
    });

    it("uses yellow for warn level", () => {
      const transport = new ConsoleTransport({ colors: true });
      transport.log({ ...mockEntry, level: "warn" });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("\x1b[33m"));
    });

    it("uses red for error level", () => {
      const transport = new ConsoleTransport({ colors: true });
      transport.log({ ...mockEntry, level: "error" });

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("\x1b[31m"));
    });

    it("does not add colors when disabled", () => {
      const transport = new ConsoleTransport({ colors: false });
      transport.log(mockEntry);

      const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(output).not.toContain("\x1b[");
    });
  });

  describe("TTY and CI detection", () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    it("disables colors when NO_COLOR is set", () => {
      process.env = { ...originalEnv, NO_COLOR: "1" };
      const transport = new ConsoleTransport();
      transport.log(mockEntry);

      const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(output).not.toContain("\x1b[");
    });

    it("disables colors when CI is set", () => {
      process.env = { ...originalEnv, CI: "true", NO_COLOR: undefined };
      const transport = new ConsoleTransport();
      transport.log(mockEntry);

      const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(output).not.toContain("\x1b[");
    });

    it("respects explicit colors option over auto-detection", () => {
      process.env = { ...originalEnv, CI: "true" };
      const transport = new ConsoleTransport({ colors: true });
      transport.log(mockEntry);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("\x1b[32m"));
    });
  });
});
