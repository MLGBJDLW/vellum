/**
 * Streaming JSON Output Tests (T-049)
 *
 * @module cli/commands/__tests__/stream-json.test
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  createCollector,
  formatResultAsJson,
  parseNdjson,
  type StreamEventType,
  StreamJsonWriter,
  type StreamOutput,
} from "../output/stream-json.js";
import type { CommandResult } from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestOutput(): { output: StreamOutput; lines: string[] } {
  const lines: string[] = [];
  return {
    output: { write: (line) => lines.push(line) },
    lines,
  };
}

function parseLine(lines: string[], index: number): Record<string, unknown> {
  const line = lines[index];
  if (line === undefined) throw new Error(`No line at index ${index}`);
  return JSON.parse(line) as Record<string, unknown>;
}

// =============================================================================
// StreamJsonWriter Tests
// =============================================================================

describe("StreamJsonWriter", () => {
  let output: StreamOutput;
  let lines: string[];
  let writer: StreamJsonWriter;

  beforeEach(() => {
    const test = createTestOutput();
    output = test.output;
    lines = test.lines;
    writer = new StreamJsonWriter({ output });
  });

  describe("write", () => {
    it("should write valid JSON", () => {
      writer.write("start" as StreamEventType, { foo: "bar" });

      expect(lines).toHaveLength(1);
      const parsed = parseLine(lines, 0);
      expect(parsed.type).toBe("start");
      expect((parsed.data as Record<string, unknown>).foo).toBe("bar");
    });

    it("should include timestamp by default", () => {
      writer.write("start" as StreamEventType, {});

      const parsed = parseLine(lines, 0);
      expect(parsed.timestamp).toBeDefined();
      expect(new Date(parsed.timestamp as string).toISOString()).toBe(parsed.timestamp);
    });

    it("should include sequence number", () => {
      writer.write("start" as StreamEventType, {});
      writer.write("result" as StreamEventType, {});

      expect(parseLine(lines, 0).seq).toBe(0);
      expect(parseLine(lines, 1).seq).toBe(1);
    });

    it("should respect includeTimestamps option", () => {
      const noTimestamp = new StreamJsonWriter({ output, includeTimestamps: false });
      noTimestamp.write("start" as StreamEventType, {});

      const parsed = parseLine(lines, 0);
      expect(parsed.timestamp).toBeUndefined();
    });

    it("should respect includeSequence option", () => {
      const noSeq = new StreamJsonWriter({ output, includeSequence: false });
      noSeq.write("start" as StreamEventType, {});

      const parsed = parseLine(lines, 0);
      expect(parsed.seq).toBeUndefined();
    });
  });

  describe("start", () => {
    it("should write start event", () => {
      writer.start({ command: "/help" });

      const parsed = parseLine(lines, 0);
      expect(parsed.type).toBe("start");
      expect((parsed.data as Record<string, unknown>).command).toBe("/help");
    });

    it("should include args if provided", () => {
      writer.start({ command: "/login", args: { provider: "anthropic" } });

      const parsed = parseLine(lines, 0);
      const data = parsed.data as Record<string, unknown>;
      expect((data.args as Record<string, unknown>).provider).toBe("anthropic");
    });
  });

  describe("result", () => {
    it("should write success result", () => {
      const result: CommandResult = { kind: "success", message: "Done" };
      writer.result(result);

      const parsed = parseLine(lines, 0);
      expect(parsed.type).toBe("result");
      const data = parsed.data as Record<string, unknown>;
      expect(data.kind).toBe("success");
      expect(data.message).toBe("Done");
    });

    it("should write error result", () => {
      const result: CommandResult = {
        kind: "error",
        code: "INVALID_ARGUMENT",
        message: "Bad input",
      };
      writer.result(result);

      const parsed = parseLine(lines, 0);
      const data = parsed.data as Record<string, unknown>;
      expect(data.kind).toBe("error");
      expect(data.code).toBe("INVALID_ARGUMENT");
      expect(data.message).toBe("Bad input");
    });

    it("should write interactive result", () => {
      const result: CommandResult = {
        kind: "interactive",
        prompt: {
          inputType: "text",
          message: "Enter value",
          handler: async () => ({ kind: "success" }),
        },
      };
      writer.result(result);

      const parsed = parseLine(lines, 0);
      const data = parsed.data as Record<string, unknown>;
      expect(data.kind).toBe("interactive");
      expect(data.message).toBe("Enter value");
    });

    it("should write pending result", () => {
      const result: CommandResult = {
        kind: "pending",
        operation: {
          message: "Processing...",
          promise: Promise.resolve({ kind: "success" }),
        },
      };
      writer.result(result);

      const parsed = parseLine(lines, 0);
      const data = parsed.data as Record<string, unknown>;
      expect(data.kind).toBe("pending");
      expect(data.message).toBe("Processing...");
    });

    it("should include data for success result", () => {
      const result: CommandResult = {
        kind: "success",
        message: "Done",
        data: { count: 42 },
      };
      writer.result(result);

      const parsed = parseLine(lines, 0);
      const data = parsed.data as Record<string, unknown>;
      expect((data.data as Record<string, unknown>).count).toBe(42);
    });
  });

  describe("error", () => {
    it("should write Error objects", () => {
      const error = new Error("Something failed");
      writer.error(error);

      const parsed = parseLine(lines, 0);
      expect(parsed.type).toBe("error");
      const data = parsed.data as Record<string, unknown>;
      expect(data.message).toBe("Something failed");
      expect(data.code).toBe("Error");
    });

    it("should write string errors", () => {
      writer.error("String error");

      const parsed = parseLine(lines, 0);
      const data = parsed.data as Record<string, unknown>;
      expect(data.message).toBe("String error");
    });

    it("should handle unknown error types", () => {
      writer.error(null);

      const parsed = parseLine(lines, 0);
      const data = parsed.data as Record<string, unknown>;
      expect(data.message).toBe("Unknown error");
    });
  });

  describe("progress", () => {
    it("should write progress event", () => {
      writer.progress({ current: 5, total: 10 });

      const parsed = parseLine(lines, 0);
      expect(parsed.type).toBe("progress");
      const data = parsed.data as Record<string, unknown>;
      expect(data.current).toBe(5);
      expect(data.total).toBe(10);
    });

    it("should calculate percentage", () => {
      writer.progress({ current: 5, total: 10 });

      const parsed = parseLine(lines, 0);
      const data = parsed.data as Record<string, unknown>;
      expect(data.percentage).toBe(50);
    });
  });

  describe("writeOutput", () => {
    it("should write output event", () => {
      writer.writeOutput("Hello, world!");

      const parsed = parseLine(lines, 0);
      expect(parsed.type).toBe("output");
      const data = parsed.data as Record<string, unknown>;
      expect(data.content).toBe("Hello, world!");
      expect(data.stream).toBe("stdout");
    });

    it("should support stderr stream", () => {
      writer.writeOutput("Error!", "stderr");

      const parsed = parseLine(lines, 0);
      const data = parsed.data as Record<string, unknown>;
      expect(data.stream).toBe("stderr");
    });
  });

  describe("complete", () => {
    it("should write complete event", () => {
      writer.complete(0, 100);

      const parsed = parseLine(lines, 0);
      expect(parsed.type).toBe("complete");
      const data = parsed.data as Record<string, unknown>;
      expect(data.exitCode).toBe(0);
      expect(data.duration).toBe(100);
    });

    it("should calculate duration from start", async () => {
      writer.start({ command: "/test" });
      // Small delay to ensure measurable duration
      await new Promise((resolve) => setTimeout(resolve, 10));
      writer.complete(0);

      const parsed = parseLine(lines, 1);
      const data = parsed.data as Record<string, unknown>;
      expect(data.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("metadata", () => {
    it("should write metadata event", () => {
      writer.metadata({ version: "1.0.0", extra: "data" });

      const parsed = parseLine(lines, 0);
      expect(parsed.type).toBe("metadata");
      const data = parsed.data as Record<string, unknown>;
      expect(data.version).toBe("1.0.0");
      expect(data.extra).toBe("data");
    });
  });

  describe("reset", () => {
    it("should reset sequence counter", () => {
      writer.write("start" as StreamEventType, {});
      writer.write("result" as StreamEventType, {});
      expect(writer.getSequence()).toBe(2);

      writer.reset();
      expect(writer.getSequence()).toBe(0);

      writer.write("start" as StreamEventType, {});
      expect(parseLine(lines, 2).seq).toBe(0);
    });
  });
});

// =============================================================================
// Utility Functions Tests
// =============================================================================

describe("formatResultAsJson", () => {
  it("should format success result", () => {
    const result: CommandResult = { kind: "success", message: "Done" };
    const json = formatResultAsJson(result);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed.kind).toBe("success");
    expect(parsed.message).toBe("Done");
  });

  it("should format error result", () => {
    const result: CommandResult = {
      kind: "error",
      code: "INVALID_ARGUMENT",
      message: "Bad input",
    };
    const json = formatResultAsJson(result);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed.kind).toBe("error");
    expect(parsed.code).toBe("INVALID_ARGUMENT");
  });

  it("should produce single-line JSON", () => {
    const result: CommandResult = { kind: "success", message: "Done", data: { nested: true } };
    const json = formatResultAsJson(result);

    expect(json).not.toContain("\n");
  });
});

describe("parseNdjson", () => {
  it("should parse NDJSON string", () => {
    const ndjson =
      '{"type":"start","data":{}}\n{"type":"result","data":{"kind":"success"}}\n{"type":"complete","data":{}}';
    const events = parseNdjson(ndjson);

    expect(events).toHaveLength(3);
    expect(events[0]?.type).toBe("start");
    expect(events[1]?.type).toBe("result");
    expect(events[2]?.type).toBe("complete");
  });

  it("should skip empty lines", () => {
    const ndjson = '{"type":"start"}\n\n{"type":"complete"}\n';
    const events = parseNdjson(ndjson);

    expect(events).toHaveLength(2);
  });
});

describe("createCollector", () => {
  it("should collect written lines", () => {
    const { output, lines } = createCollector();
    const writer = new StreamJsonWriter({ output });

    writer.write("start" as StreamEventType, {});
    writer.write("result" as StreamEventType, {});

    expect(lines).toHaveLength(2);
  });
});
