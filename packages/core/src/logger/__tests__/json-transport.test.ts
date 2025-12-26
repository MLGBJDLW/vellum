import { describe, expect, it, vi } from "vitest";
import { JsonTransport } from "../transports/json.js";
import type { LogEntry } from "../types.js";

/**
 * Helper to get output line from mock and parse as JSON.
 */
function getOutputLine(output: ReturnType<typeof vi.fn>, index = 0): string {
  const line = output.mock.calls[index]?.[0] as string | undefined;
  if (line === undefined) {
    throw new Error(`No output at index ${index}`);
  }
  return line;
}

function parseOutput(output: ReturnType<typeof vi.fn>, index = 0): Record<string, unknown> {
  return JSON.parse(getOutputLine(output, index)) as Record<string, unknown>;
}

describe("JsonTransport", () => {
  const mockEntry: LogEntry = {
    level: "info",
    message: "Test message",
    timestamp: new Date("2025-12-26T10:00:00.000Z"),
  };

  describe("JSON output format", () => {
    it("outputs single-line JSON", () => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log(mockEntry);

      expect(output).toHaveBeenCalledTimes(1);
      const line = getOutputLine(output);

      // Should be valid JSON
      expect(() => JSON.parse(line)).not.toThrow();

      // Should be single line (no newlines)
      expect(line).not.toContain("\n");
    });

    it("includes time field as ISO string", () => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log(mockEntry);

      const parsed = parseOutput(output);
      expect(parsed.time).toBe("2025-12-26T10:00:00.000Z");
    });

    it("includes level field", () => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log(mockEntry);

      const parsed = parseOutput(output);
      expect(parsed.level).toBe("info");
    });

    it("includes message field", () => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log(mockEntry);

      const parsed = parseOutput(output);
      expect(parsed.message).toBe("Test message");
    });

    it("includes context when present", () => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log({
        ...mockEntry,
        context: { requestId: "123", userId: "abc" },
      });

      const parsed = parseOutput(output);
      expect(parsed.context).toEqual({ requestId: "123", userId: "abc" });
    });

    it("excludes context when empty", () => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log({ ...mockEntry, context: {} });

      const parsed = parseOutput(output);
      expect(parsed).not.toHaveProperty("context");
    });

    it("excludes context when undefined", () => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log(mockEntry);

      const parsed = parseOutput(output);
      expect(parsed).not.toHaveProperty("context");
    });

    it("includes data when present", () => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log({ ...mockEntry, data: { key: "value", count: 42 } });

      const parsed = parseOutput(output);
      expect(parsed.data).toEqual({ key: "value", count: 42 });
    });

    it("excludes data when undefined", () => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log(mockEntry);

      const parsed = parseOutput(output);
      expect(parsed).not.toHaveProperty("data");
    });

    it("preserves field order: time, level, context, message, data", () => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log({
        ...mockEntry,
        context: { key: "ctx" },
        data: { key: "data" },
      });

      const line = getOutputLine(output);
      const keys = Object.keys(JSON.parse(line));

      expect(keys).toEqual(["time", "level", "context", "message", "data"]);
    });
  });

  describe("custom output function", () => {
    it("uses custom output function", () => {
      const lines: string[] = [];
      const transport = new JsonTransport({
        output: (line) => lines.push(line),
      });

      transport.log(mockEntry);
      transport.log({ ...mockEntry, message: "Second message" });

      expect(lines).toHaveLength(2);
      expect((JSON.parse(lines[0] ?? "{}") as Record<string, unknown>).message).toBe(
        "Test message"
      );
      expect((JSON.parse(lines[1] ?? "{}") as Record<string, unknown>).message).toBe(
        "Second message"
      );
    });

    it("uses console.log by default", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const transport = new JsonTransport();
      transport.log(mockEntry);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"time"'));

      consoleSpy.mockRestore();
    });
  });

  describe("all log levels", () => {
    it.each(["debug", "info", "warn", "error"] as const)("outputs %s level correctly", (level) => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log({ ...mockEntry, level });

      const parsed = parseOutput(output);
      expect(parsed.level).toBe(level);
    });
  });

  describe("data types", () => {
    it("handles string data", () => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log({ ...mockEntry, data: "simple string" });

      const parsed = parseOutput(output);
      expect(parsed.data).toBe("simple string");
    });

    it("handles number data", () => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log({ ...mockEntry, data: 42 });

      const parsed = parseOutput(output);
      expect(parsed.data).toBe(42);
    });

    it("handles array data", () => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log({ ...mockEntry, data: [1, 2, 3] });

      const parsed = parseOutput(output);
      expect(parsed.data).toEqual([1, 2, 3]);
    });

    it("handles nested object data", () => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log({
        ...mockEntry,
        data: { nested: { deeply: { value: true } } },
      });

      const parsed = parseOutput(output);
      expect(parsed.data).toEqual({ nested: { deeply: { value: true } } });
    });

    it("handles null data", () => {
      const output = vi.fn();
      const transport = new JsonTransport({ output });

      transport.log({ ...mockEntry, data: null });

      const parsed = parseOutput(output);
      expect(parsed.data).toBeNull();
    });
  });
});
