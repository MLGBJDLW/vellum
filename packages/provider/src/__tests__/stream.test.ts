/**
 * Streaming Utilities Tests
 *
 * T034: Unit tests for streaming utilities
 */

import { describe, expect, it } from "vitest";
import { ProviderError } from "../errors.js";
import {
  collectStream,
  consumeStream,
  createDoneEvent,
  normalizeReasoningDelta,
  normalizeTextDelta,
  normalizeToolCall,
  normalizeUsage,
  streamWithAbort,
  streamWithOptions,
  streamWithTimeout,
  TextAccumulator,
} from "../stream.js";
import type { StreamEvent } from "../types.js";

// =============================================================================
// Helper Functions
// =============================================================================

async function* createAsyncIterable<T>(items: T[], delayMs = 0): AsyncGenerator<T> {
  for (const item of items) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    yield item;
  }
}

async function* createSlowIterable<T>(items: T[], delayMs: number): AsyncGenerator<T> {
  for (const item of items) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    yield item;
  }
}

// =============================================================================
// T028: Stream Normalization Tests
// =============================================================================

describe("stream normalization", () => {
  describe("normalizeTextDelta", () => {
    it("should normalize Anthropic text_delta format", () => {
      const result = normalizeTextDelta({
        type: "text_delta",
        text: "Hello",
      });
      expect(result).toEqual({ type: "text", content: "Hello" });
    });

    it("should normalize OpenAI delta.content format", () => {
      const result = normalizeTextDelta({
        type: "delta",
        delta: { content: "World" },
      });
      expect(result).toEqual({ type: "text", content: "World" });
    });

    it("should normalize delta.text format", () => {
      const result = normalizeTextDelta({
        type: "delta",
        delta: { text: "Test" },
      });
      expect(result).toEqual({ type: "text", content: "Test" });
    });

    it("should normalize direct content format", () => {
      const result = normalizeTextDelta({
        type: "text",
        content: "Direct",
      });
      expect(result).toEqual({ type: "text", content: "Direct" });
    });

    it("should return undefined for empty text", () => {
      const result = normalizeTextDelta({
        type: "text_delta",
        text: "",
      });
      expect(result).toBeUndefined();
    });

    it("should return undefined for missing text", () => {
      const result = normalizeTextDelta({
        type: "delta",
        delta: {},
      });
      expect(result).toBeUndefined();
    });
  });

  describe("normalizeReasoningDelta", () => {
    it("should normalize text field", () => {
      const result = normalizeReasoningDelta({
        type: "thinking_delta",
        text: "Let me think...",
      });
      expect(result).toEqual({ type: "reasoning", content: "Let me think..." });
    });

    it("should normalize thinking field", () => {
      const result = normalizeReasoningDelta({
        type: "thinking",
        thinking: "Analyzing...",
      });
      expect(result).toEqual({ type: "reasoning", content: "Analyzing..." });
    });

    it("should normalize delta.thinking format", () => {
      const result = normalizeReasoningDelta({
        type: "reasoning_delta",
        delta: { thinking: "Processing..." },
      });
      expect(result).toEqual({ type: "reasoning", content: "Processing..." });
    });

    it("should return undefined for empty reasoning", () => {
      const result = normalizeReasoningDelta({
        type: "thinking_delta",
        text: "",
      });
      expect(result).toBeUndefined();
    });
  });

  describe("normalizeToolCall", () => {
    it("should normalize tool call with input", () => {
      const result = normalizeToolCall({
        type: "tool_use",
        id: "call_123",
        name: "search",
        input: { query: "test" },
      });
      expect(result).toEqual({
        type: "toolCall",
        id: "call_123",
        name: "search",
        input: { query: "test" },
      });
    });

    it("should parse arguments JSON string", () => {
      const result = normalizeToolCall({
        type: "tool_call",
        id: "call_456",
        name: "calculate",
        arguments: '{"a": 1, "b": 2}',
      });
      expect(result).toEqual({
        type: "toolCall",
        id: "call_456",
        name: "calculate",
        input: { a: 1, b: 2 },
      });
    });

    it("should parse function.arguments format", () => {
      const result = normalizeToolCall({
        type: "function_call",
        id: "call_789",
        function: { name: "greet", arguments: '{"name": "World"}' },
      });
      expect(result).toEqual({
        type: "toolCall",
        id: "call_789",
        name: "greet",
        input: { name: "World" },
      });
    });

    it("should handle invalid JSON arguments", () => {
      const result = normalizeToolCall({
        type: "tool_call",
        id: "call_bad",
        name: "test",
        arguments: "not json",
      });
      expect(result?.input).toEqual({});
    });

    it("should generate ID if not provided", () => {
      const result = normalizeToolCall({
        type: "tool_use",
        name: "search",
        input: {},
      });
      expect(result?.id).toBeDefined();
      expect(typeof result?.id).toBe("string");
    });
  });

  describe("normalizeUsage", () => {
    it("should normalize Anthropic usage format", () => {
      const result = normalizeUsage({
        input_tokens: 100,
        output_tokens: 50,
      });
      expect(result).toEqual({
        type: "usage",
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      });
    });

    it("should normalize OpenAI usage format", () => {
      const result = normalizeUsage({
        prompt_tokens: 80,
        completion_tokens: 40,
      });
      expect(result.inputTokens).toBe(80);
      expect(result.outputTokens).toBe(40);
    });

    it("should include cache tokens", () => {
      const result = normalizeUsage({
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 80,
        cache_creation_input_tokens: 20,
      });
      expect(result.cacheReadTokens).toBe(80);
      expect(result.cacheWriteTokens).toBe(20);
    });
  });

  describe("createDoneEvent", () => {
    it("should create done event with stop reason", () => {
      const result = createDoneEvent("end_turn");
      expect(result).toEqual({ type: "done", stopReason: "end_turn" });
    });

    it("should create done event for max_tokens", () => {
      const result = createDoneEvent("max_tokens");
      expect(result).toEqual({ type: "done", stopReason: "max_tokens" });
    });
  });
});

// =============================================================================
// TextAccumulator Tests
// =============================================================================

describe("TextAccumulator", () => {
  it("should accumulate text events", () => {
    const accumulator = new TextAccumulator();
    accumulator.process({ type: "text", content: "Hello" });
    accumulator.process({ type: "text", content: " " });
    accumulator.process({ type: "text", content: "World" });

    expect(accumulator.text).toBe("Hello World");
  });

  it("should accumulate reasoning events", () => {
    const accumulator = new TextAccumulator();
    accumulator.process({ type: "reasoning", content: "Let me " });
    accumulator.process({ type: "reasoning", content: "think..." });

    expect(accumulator.reasoning).toBe("Let me think...");
  });

  it("should return undefined reasoning if none", () => {
    const accumulator = new TextAccumulator();
    accumulator.process({ type: "text", content: "Hello" });

    expect(accumulator.reasoning).toBeUndefined();
  });

  it("should capture usage event", () => {
    const accumulator = new TextAccumulator();
    accumulator.process({
      type: "usage",
      inputTokens: 100,
      outputTokens: 50,
    });

    expect(accumulator.usage?.inputTokens).toBe(100);
    expect(accumulator.usage?.outputTokens).toBe(50);
  });

  it("should capture stop reason from done event", () => {
    const accumulator = new TextAccumulator();
    accumulator.process({ type: "done", stopReason: "max_tokens" });

    expect(accumulator.stopReason).toBe("max_tokens");
  });

  it("should accumulate tool call deltas", () => {
    const accumulator = new TextAccumulator();
    accumulator.process({
      type: "toolCallDelta",
      id: "call_1",
      name: "search",
      inputDelta: '{"query":',
    });
    accumulator.process({
      type: "toolCallDelta",
      id: "call_1",
      inputDelta: '"test"}',
    });

    const toolCalls = accumulator.toolCalls;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.name).toBe("search");
    expect(toolCalls[0]?.input).toEqual({ query: "test" });
  });

  it("should reset state", () => {
    const accumulator = new TextAccumulator();
    accumulator.process({ type: "text", content: "Hello" });
    accumulator.process({ type: "done", stopReason: "max_tokens" });

    accumulator.reset();

    expect(accumulator.text).toBe("");
    expect(accumulator.stopReason).toBe("end_turn");
  });
});

// =============================================================================
// T029: Stream Timeout Tests
// =============================================================================

describe("streamWithTimeout", () => {
  it("should pass through items normally", async () => {
    const items = [1, 2, 3];
    const stream = streamWithTimeout(createAsyncIterable(items), 1000);
    const results = await collectStream(stream);

    expect(results).toEqual([1, 2, 3]);
  });

  it("should throw on timeout", async () => {
    const slowStream = (async function* () {
      yield 1;
      // This delay exceeds the timeout
      await new Promise((resolve) => setTimeout(resolve, 200));
      yield 2;
    })();

    const withTimeout = streamWithTimeout(slowStream, 50);

    const results: number[] = [];
    await expect(async () => {
      for await (const item of withTimeout) {
        results.push(item);
      }
    }).rejects.toThrow(ProviderError);

    expect(results).toContain(1);
  });

  it("should reset timer on each item", async () => {
    // Each item comes within timeout, so should complete
    const items = [1, 2, 3];
    const stream = createAsyncIterable(items, 10);
    const withTimeout = streamWithTimeout(stream, 100);

    const results = await collectStream(withTimeout);
    expect(results).toEqual([1, 2, 3]);
  });
});

// =============================================================================
// T030: Stream Abort Tests
// =============================================================================

describe("streamWithAbort", () => {
  it("should pass through items when not aborted", async () => {
    const controller = new AbortController();
    const items = [1, 2, 3];
    const stream = streamWithAbort(createAsyncIterable(items), controller.signal);

    const results = await collectStream(stream);
    expect(results).toEqual([1, 2, 3]);
  });

  it("should stop cleanly when aborted (not throw)", async () => {
    const controller = new AbortController();
    const items = [1, 2, 3, 4, 5];
    const stream = streamWithAbort(createSlowIterable(items, 50), controller.signal);

    const results: number[] = [];

    // Abort after collecting some items
    setTimeout(() => controller.abort(), 80);

    for await (const item of stream) {
      results.push(item);
    }

    // Should have gotten some items but not all
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThan(5);
  });

  it("should not start if already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const items = [1, 2, 3];
    const stream = streamWithAbort(createAsyncIterable(items), controller.signal);

    const results = await collectStream(stream);
    expect(results).toEqual([]);
  });

  it("should not throw error on abort", async () => {
    const controller = new AbortController();

    const neverEndingStream = (async function* () {
      let i = 0;
      while (true) {
        yield i++;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    })();

    const stream = streamWithAbort(neverEndingStream, controller.signal);
    const results: number[] = [];

    // Abort after a short delay
    setTimeout(() => controller.abort(), 50);

    // Should complete without throwing
    for await (const item of stream) {
      results.push(item);
    }

    expect(results.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Combined Options Tests
// =============================================================================

describe("streamWithOptions", () => {
  it("should apply both timeout and abort", async () => {
    const controller = new AbortController();
    const items = [1, 2, 3];
    const stream = streamWithOptions(createAsyncIterable(items), {
      timeoutMs: 1000,
      signal: controller.signal,
    });

    const results = await collectStream(stream);
    expect(results).toEqual([1, 2, 3]);
  });

  it("should work with timeout only", async () => {
    const items = [1, 2, 3];
    const stream = streamWithOptions(createAsyncIterable(items), {
      timeoutMs: 1000,
    });

    const results = await collectStream(stream);
    expect(results).toEqual([1, 2, 3]);
  });

  it("should work with abort only", async () => {
    const controller = new AbortController();
    const items = [1, 2, 3];
    const stream = streamWithOptions(createAsyncIterable(items), {
      signal: controller.signal,
    });

    const results = await collectStream(stream);
    expect(results).toEqual([1, 2, 3]);
  });

  it("should work with no options", async () => {
    const items = [1, 2, 3];
    const stream = streamWithOptions(createAsyncIterable(items), {});

    const results = await collectStream(stream);
    expect(results).toEqual([1, 2, 3]);
  });
});

// =============================================================================
// Consume Stream Tests
// =============================================================================

describe("consumeStream", () => {
  it("should consume stream and return accumulated result", async () => {
    const events: StreamEvent[] = [
      { type: "text", content: "Hello " },
      { type: "text", content: "World" },
      { type: "usage", inputTokens: 10, outputTokens: 5 },
      { type: "done", stopReason: "end_turn" },
    ];

    const result = await consumeStream(createAsyncIterable(events));

    expect(result.text).toBe("Hello World");
    expect(result.usage?.inputTokens).toBe(10);
    expect(result.stopReason).toBe("end_turn");
  });

  it("should include reasoning if present", async () => {
    const events: StreamEvent[] = [
      { type: "reasoning", content: "Thinking..." },
      { type: "text", content: "Answer" },
      { type: "done", stopReason: "end_turn" },
    ];

    const result = await consumeStream(createAsyncIterable(events));

    expect(result.text).toBe("Answer");
    expect(result.reasoning).toBe("Thinking...");
  });

  it("should collect tool calls", async () => {
    const events: StreamEvent[] = [
      { type: "toolCallDelta", id: "call_1", name: "search", inputDelta: '{"q":' },
      { type: "toolCallDelta", id: "call_1", inputDelta: '"test"}' },
      { type: "done", stopReason: "tool_use" },
    ];

    const result = await consumeStream(createAsyncIterable(events));

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.name).toBe("search");
    expect(result.stopReason).toBe("tool_use");
  });
});

// =============================================================================
// collectStream Tests
// =============================================================================

describe("collectStream", () => {
  it("should collect all items from async iterable", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await collectStream(createAsyncIterable(items));
    expect(results).toEqual([1, 2, 3, 4, 5]);
  });

  it("should return empty array for empty stream", async () => {
    const results = await collectStream(createAsyncIterable([]));
    expect(results).toEqual([]);
  });
});
