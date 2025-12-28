/**
 * @file processor.test.ts
 * @description Tests for block processors, processMultiBlockStream, and StreamProcessor integration
 */

import { describe, expect, it, vi } from "vitest";
import type { StreamEvent } from "@vellum/provider";
import { Ok, Err } from "../../types/result.js";
import type { Result } from "../../types/result.js";
import {
  TextBlockProcessor,
  ReasoningBlockProcessor,
  processMultiBlockStream,
  StreamProcessor,
  type UiEvent,
  type StreamProcessorHooks,
} from "../processor.js";

// =============================================================================
// T031: TextBlockProcessor Tests
// =============================================================================

describe("TextBlockProcessor", () => {
  it("should accumulate text deltas", () => {
    const processor = new TextBlockProcessor();
    processor.processDelta("Hello, ");
    processor.processDelta("world!");
    const part = processor.finalize();

    expect(part.type).toBe("text");
    expect(part.content).toBe("Hello, world!");
  });

  it("should return empty content when no deltas processed", () => {
    const processor = new TextBlockProcessor();
    const part = processor.finalize();

    expect(part.type).toBe("text");
    expect(part.content).toBe("");
  });

  it("should reset state", () => {
    const processor = new TextBlockProcessor();
    processor.processDelta("Hello");
    processor.reset();
    const part = processor.finalize();

    expect(part.content).toBe("");
  });

  it("should handle single large delta", () => {
    const processor = new TextBlockProcessor();
    const largeText = "a".repeat(10000);
    processor.processDelta(largeText);
    const part = processor.finalize();

    expect(part.content).toBe(largeText);
  });
});

// =============================================================================
// T032: ReasoningBlockProcessor Tests
// =============================================================================

describe("ReasoningBlockProcessor", () => {
  it("should accumulate reasoning deltas", () => {
    const processor = new ReasoningBlockProcessor();
    processor.processDelta("Let me think...");
    processor.processDelta(" First, I need to consider...");
    const part = processor.finalize();

    expect(part.type).toBe("reasoning");
    expect(part.content).toBe("Let me think... First, I need to consider...");
  });

  it("should return empty content when no deltas processed", () => {
    const processor = new ReasoningBlockProcessor();
    const part = processor.finalize();

    expect(part.type).toBe("reasoning");
    expect(part.content).toBe("");
  });

  it("should reset state", () => {
    const processor = new ReasoningBlockProcessor();
    processor.processDelta("Thinking...");
    processor.reset();
    const part = processor.finalize();

    expect(part.content).toBe("");
  });
});

// =============================================================================
// T033: processMultiBlockStream Tests
// =============================================================================

describe("processMultiBlockStream", () => {
  // Helper to create async iterable from array
  async function* createStream(
    events: Array<Result<StreamEvent, Error>>
  ): AsyncIterable<Result<StreamEvent, Error>> {
    for (const event of events) {
      yield event;
    }
  }

  it("should process single text block", async () => {
    const events: Array<Result<StreamEvent, Error>> = [
      Ok({ type: "text", content: "Hello, " } as StreamEvent),
      Ok({ type: "text", content: "world!" } as StreamEvent),
      Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
    ];

    const result = await processMultiBlockStream(createStream(events));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.parts).toHaveLength(1);
      expect(result.value.parts[0]).toEqual({
        type: "text",
        content: "Hello, world!",
      });
      expect(result.value.stopReason).toBe("end_turn");
    }
  });

  it("should process multiple indexed text blocks", async () => {
    const events: Array<Result<StreamEvent, Error>> = [
      Ok({ type: "text", content: "Block 0: ", index: 0 } as StreamEvent),
      Ok({ type: "text", content: "Block 1: ", index: 1 } as StreamEvent),
      Ok({ type: "text", content: "A", index: 0 } as StreamEvent),
      Ok({ type: "text", content: "B", index: 1 } as StreamEvent),
      Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
    ];

    const result = await processMultiBlockStream(createStream(events));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.parts).toHaveLength(2);
      expect(result.value.parts[0]).toEqual({
        type: "text",
        content: "Block 0: A",
      });
      expect(result.value.parts[1]).toEqual({
        type: "text",
        content: "Block 1: B",
      });
    }
  });

  it("should process reasoning blocks", async () => {
    const events: Array<Result<StreamEvent, Error>> = [
      Ok({ type: "reasoning", content: "Let me ", index: 0 } as StreamEvent),
      Ok({ type: "reasoning", content: "think...", index: 0 } as StreamEvent),
      Ok({ type: "text", content: "The answer is 42." } as StreamEvent),
      Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
    ];

    const result = await processMultiBlockStream(createStream(events));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.parts).toHaveLength(2);
      expect(result.value.parts[0]).toEqual({
        type: "text",
        content: "The answer is 42.",
      });
      expect(result.value.parts[1]).toEqual({
        type: "reasoning",
        content: "Let me think...",
      });
    }
  });

  it("should process tool calls", async () => {
    const events: Array<Result<StreamEvent, Error>> = [
      Ok({
        type: "tool_call_start",
        id: "call_1",
        name: "search",
        index: 0,
      } as StreamEvent),
      Ok({
        type: "tool_call_delta",
        id: "call_1",
        arguments: '{"query":',
        index: 0,
      } as StreamEvent),
      Ok({
        type: "tool_call_delta",
        id: "call_1",
        arguments: '"test"}',
        index: 0,
      } as StreamEvent),
      Ok({ type: "tool_call_end", id: "call_1", index: 0 } as StreamEvent),
      Ok({ type: "end", stopReason: "tool_use" } as StreamEvent),
    ];

    const result = await processMultiBlockStream(createStream(events));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.parts).toHaveLength(1);
      const toolPart = result.value.parts[0];
      expect(toolPart).toBeDefined();
      expect(toolPart?.type).toBe("tool");
      if (toolPart && toolPart.type === "tool") {
        expect(toolPart.id).toBe("call_1");
        expect(toolPart.name).toBe("search");
        expect(toolPart.arguments).toEqual({ query: "test" });
        expect(toolPart.state).toBe("complete");
      }
      expect(result.value.stopReason).toBe("tool_use");
    }
  });

  it("should handle usage events", async () => {
    const events: Array<Result<StreamEvent, Error>> = [
      Ok({ type: "text", content: "Response" } as StreamEvent),
      Ok({
        type: "usage",
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
      } as StreamEvent),
      Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
    ];

    const result = await processMultiBlockStream(createStream(events));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
      });
    }
  });

  it("should handle citation events", async () => {
    const events: Array<Result<StreamEvent, Error>> = [
      Ok({ type: "text", content: "According to sources..." } as StreamEvent),
      Ok({
        type: "citation",
        chunk: {
          uri: "https://example.com",
          title: "Example Source",
          startIndex: 0,
          endIndex: 10,
        },
      } as StreamEvent),
      Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
    ];

    const result = await processMultiBlockStream(createStream(events));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.citations).toHaveLength(1);
      expect(result.value.citations?.[0]?.uri).toBe("https://example.com");
    }
  });

  it("should propagate errors from stream", async () => {
    const events: Array<Result<StreamEvent, Error>> = [
      Ok({ type: "text", content: "Hello" } as StreamEvent),
      Err(new Error("Stream error")),
    ];

    const result = await processMultiBlockStream(createStream(events));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("Stream error");
    }
  });

  it("should handle legacy done event", async () => {
    const events: Array<Result<StreamEvent, Error>> = [
      Ok({ type: "text", content: "Response" } as StreamEvent),
      Ok({ type: "done", stopReason: "max_tokens" } as StreamEvent),
    ];

    const result = await processMultiBlockStream(createStream(events));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stopReason).toBe("max_tokens");
    }
  });

  it("should handle empty stream", async () => {
    const events: Array<Result<StreamEvent, Error>> = [];

    const result = await processMultiBlockStream(createStream(events));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.parts).toHaveLength(0);
      expect(result.value.usage).toBeUndefined();
      expect(result.value.stopReason).toBeUndefined();
      expect(result.value.citations).toBeUndefined();
    }
  });

  it("should handle malformed tool call JSON gracefully", async () => {
    const events: Array<Result<StreamEvent, Error>> = [
      Ok({
        type: "tool_call_start",
        id: "call_1",
        name: "search",
        index: 0,
      } as StreamEvent),
      Ok({
        type: "tool_call_delta",
        id: "call_1",
        arguments: "invalid json {",
        index: 0,
      } as StreamEvent),
      Ok({ type: "tool_call_end", id: "call_1", index: 0 } as StreamEvent),
      Ok({ type: "end", stopReason: "tool_use" } as StreamEvent),
    ];

    const result = await processMultiBlockStream(createStream(events));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.parts).toHaveLength(1);
      const toolPart = result.value.parts[0];
      expect(toolPart).toBeDefined();
      if (toolPart && toolPart.type === "tool") {
        // Arguments should be empty object when JSON parsing fails
        expect(toolPart.arguments).toEqual({});
        expect(toolPart.state).toBe("complete");
      }
    }
  });
});

// =============================================================================
// T027: StreamProcessor Integration Tests
// =============================================================================

describe("StreamProcessor Integration Tests", () => {
  // Helper to create async iterable from array
  async function* createStream(
    events: Array<Result<StreamEvent, Error>>
  ): AsyncIterable<Result<StreamEvent, Error>> {
    for (const event of events) {
      yield event;
    }
  }

  // Helper to create delayed stream for timing tests
  async function* createDelayedStream(
    events: Array<{ event: Result<StreamEvent, Error>; delay?: number }>
  ): AsyncIterable<Result<StreamEvent, Error>> {
    for (const { event, delay } of events) {
      if (delay) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      yield event;
    }
  }

  describe("End-to-end stream processing", () => {
    it("should process full text stream with mock provider", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });
      const uiEvents: UiEvent[] = [];

      processor.setUiHandler((event) => {
        uiEvents.push(event);
      });

      const events: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "Hello, " } as StreamEvent),
        Ok({ type: "text", content: "world!" } as StreamEvent),
        Ok({
          type: "usage",
          inputTokens: 10,
          outputTokens: 5,
        } as StreamEvent),
        Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
      ];

      const result = await processor.processStream(createStream(events));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.parts).toHaveLength(2);
        expect(result.value.stopReason).toBe("end_turn");
      }

      // Check UI events were dispatched
      const completeEvent = uiEvents.find((e) => e.type === "complete");
      expect(completeEvent).toBeDefined();
      if (completeEvent?.type === "complete") {
        expect(completeEvent.message.parts).toHaveLength(2);
      }
    });

    it("should process mixed text and reasoning blocks", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });
      const uiEvents: UiEvent[] = [];

      processor.setUiHandler((event) => {
        uiEvents.push(event);
      });

      const events: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "reasoning", content: "Let me think...", index: 0 } as StreamEvent),
        Ok({ type: "text", content: "The answer is ", index: 0 } as StreamEvent),
        Ok({ type: "reasoning", content: " considering options", index: 0 } as StreamEvent),
        Ok({ type: "text", content: "42.", index: 0 } as StreamEvent),
        Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
      ];

      const result = await processor.processStream(createStream(events));

      expect(result.ok).toBe(true);

      // Check reasoning events were dispatched
      const reasoningEvents = uiEvents.filter((e) => e.type === "reasoning_chunk");
      expect(reasoningEvents.length).toBeGreaterThan(0);
    });

    it("should process tool calls with start, delta, and end events", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });
      const uiEvents: UiEvent[] = [];

      processor.setUiHandler((event) => {
        uiEvents.push(event);
      });

      const events: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "Let me search for that." } as StreamEvent),
        Ok({
          type: "tool_call_start",
          id: "call_123",
          name: "web_search",
          index: 0,
        } as StreamEvent),
        Ok({
          type: "tool_call_delta",
          id: "call_123",
          arguments: '{"query":',
          index: 0,
        } as StreamEvent),
        Ok({
          type: "tool_call_delta",
          id: "call_123",
          arguments: '"typescript"}',
          index: 0,
        } as StreamEvent),
        Ok({ type: "tool_call_end", id: "call_123", index: 0 } as StreamEvent),
        Ok({ type: "end", stopReason: "tool_use" } as StreamEvent),
      ];

      const result = await processor.processStream(createStream(events));

      expect(result.ok).toBe(true);
      if (result.ok) {
        const toolPart = result.value.parts.find((p) => p.type === "tool");
        expect(toolPart).toBeDefined();
        if (toolPart?.type === "tool") {
          expect(toolPart.name).toBe("web_search");
          expect(toolPart.arguments).toEqual({ query: "typescript" });
        }
      }

      // Check tool UI events
      const toolStartedEvent = uiEvents.find((e) => e.type === "tool_started");
      expect(toolStartedEvent).toBeDefined();
      if (toolStartedEvent?.type === "tool_started") {
        expect(toolStartedEvent.id).toBe("call_123");
        expect(toolStartedEvent.name).toBe("web_search");
      }

      const toolCompletedEvent = uiEvents.find((e) => e.type === "tool_completed");
      expect(toolCompletedEvent).toBeDefined();
    });
  });

  describe("Collector + Gate integration", () => {
    it("should buffer text through newline gate for visual stability", async () => {
      const processor = new StreamProcessor({
        newlineGate: { flushTimeoutMs: 100, maxBufferSize: 100 },
      });
      const textChunks: string[] = [];

      processor.setUiHandler((event) => {
        if (event.type === "text_chunk") {
          textChunks.push(event.content);
        }
      });

      // Partial text without newline should be buffered
      const events: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "Hello" } as StreamEvent),
        Ok({ type: "text", content: ", " } as StreamEvent),
        Ok({ type: "text", content: "world" } as StreamEvent),
        Ok({ type: "text", content: "!\n" } as StreamEvent),
        Ok({ type: "text", content: "New line." } as StreamEvent),
        Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
      ];

      await processor.processStream(createStream(events));

      // Gate should have flushed on newline and at end
      expect(textChunks.some((c) => c.includes("Hello"))).toBe(true);
      expect(textChunks.some((c) => c.includes("New line"))).toBe(true);
    });

    it("should force flush on timeout", async () => {
      const processor = new StreamProcessor({
        newlineGate: { flushTimeoutMs: 50, maxBufferSize: 1000 },
      });
      const textChunks: string[] = [];

      processor.setUiHandler((event) => {
        if (event.type === "text_chunk") {
          textChunks.push(event.content);
        }
      });

      const events = [
        { event: Ok({ type: "text", content: "Delayed " } as StreamEvent), delay: 0 },
        { event: Ok({ type: "text", content: "content" } as StreamEvent), delay: 100 }, // Delay > flushTimeoutMs
        { event: Ok({ type: "end", stopReason: "end_turn" } as StreamEvent), delay: 0 },
      ];

      await processor.processStream(createDelayedStream(events));

      // Content should have been flushed
      const totalContent = textChunks.join("");
      expect(totalContent).toContain("Delayed");
      expect(totalContent).toContain("content");
    });
  });

  describe("UI event dispatch verification", () => {
    it("should dispatch all event types in correct order", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });
      const eventTypes: string[] = [];

      processor.setUiHandler((event) => {
        eventTypes.push(event.type);
      });

      const events: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "Hello\n" } as StreamEvent),
        Ok({ type: "reasoning", content: "Thinking...", index: 0 } as StreamEvent),
        Ok({
          type: "tool_call_start",
          id: "call_1",
          name: "test",
          index: 0,
        } as StreamEvent),
        Ok({ type: "tool_call_delta", id: "call_1", arguments: "{}", index: 0 } as StreamEvent),
        Ok({ type: "tool_call_end", id: "call_1", index: 0 } as StreamEvent),
        Ok({
          type: "citation",
          chunk: { uri: "https://example.com", title: "Example", startIndex: 0, endIndex: 5 },
        } as StreamEvent),
        Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
      ];

      await processor.processStream(createStream(events));

      // Verify event types were dispatched
      expect(eventTypes).toContain("text_chunk");
      expect(eventTypes).toContain("reasoning_chunk");
      expect(eventTypes).toContain("tool_started");
      expect(eventTypes).toContain("tool_completed");
      expect(eventTypes).toContain("citation");
      expect(eventTypes).toContain("complete");

      // Complete should be last
      expect(eventTypes[eventTypes.length - 1]).toBe("complete");
    });

    it("should dispatch error event on stream error", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });
      const uiEvents: UiEvent[] = [];

      processor.setUiHandler((event) => {
        uiEvents.push(event);
      });

      const events: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "Starting..." } as StreamEvent),
        Err(new Error("Connection lost")),
      ];

      const result = await processor.processStream(createStream(events));

      expect(result.ok).toBe(false);

      const errorEvent = uiEvents.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type === "error") {
        expect(errorEvent.error.message).toBe("Connection lost");
      }
    });
  });

  describe("Hook lifecycle callbacks", () => {
    it("should call onStreamStart before processing begins", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });
      const callOrder: string[] = [];

      const hooks: StreamProcessorHooks = {
        onStreamStart: vi.fn().mockImplementation(() => {
          callOrder.push("start");
        }),
        onChunk: vi.fn().mockImplementation(() => {
          callOrder.push("chunk");
        }),
        onStreamEnd: vi.fn().mockImplementation(() => {
          callOrder.push("end");
        }),
      };

      processor.setHooks(hooks);

      const events: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "Hello" } as StreamEvent),
        Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
      ];

      await processor.processStream(createStream(events));

      expect(hooks.onStreamStart).toHaveBeenCalledTimes(1);
      expect(hooks.onChunk).toHaveBeenCalledTimes(2);
      expect(hooks.onStreamEnd).toHaveBeenCalledTimes(1);

      // Verify order
      expect(callOrder[0]).toBe("start");
      expect(callOrder[callOrder.length - 1]).toBe("end");
    });

    it("should call onStreamError on error", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });

      const hooks: StreamProcessorHooks = {
        onStreamError: vi.fn(),
      };

      processor.setHooks(hooks);

      const events: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "Hello" } as StreamEvent),
        Err(new Error("Test error")),
      ];

      await processor.processStream(createStream(events));

      expect(hooks.onStreamError).toHaveBeenCalledTimes(1);
      expect(hooks.onStreamError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "STREAM_ERROR",
          message: "Test error",
        })
      );
    });

    it("should pass each chunk event to onChunk hook", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });
      const chunks: StreamEvent[] = [];

      const hooks: StreamProcessorHooks = {
        onChunk: vi.fn().mockImplementation((event: StreamEvent) => {
          chunks.push(event);
        }),
      };

      processor.setHooks(hooks);

      const events: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "A" } as StreamEvent),
        Ok({ type: "text", content: "B" } as StreamEvent),
        Ok({ type: "text", content: "C" } as StreamEvent),
        Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
      ];

      await processor.processStream(createStream(events));

      expect(chunks).toHaveLength(4);
      expect(chunks.map((c) => c.type)).toEqual(["text", "text", "text", "end"]);
    });

    it("should disable hooks when enableHooks is false", async () => {
      const processor = new StreamProcessor({
        newlineGate: { flushTimeoutMs: 10 },
        enableHooks: false,
      });

      const hooks: StreamProcessorHooks = {
        onStreamStart: vi.fn(),
        onChunk: vi.fn(),
        onStreamEnd: vi.fn(),
      };

      processor.setHooks(hooks);

      const events: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "Hello" } as StreamEvent),
        Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
      ];

      await processor.processStream(createStream(events));

      expect(hooks.onStreamStart).not.toHaveBeenCalled();
      expect(hooks.onChunk).not.toHaveBeenCalled();
      expect(hooks.onStreamEnd).not.toHaveBeenCalled();
    });

    it("should await async hooks", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });
      const results: number[] = [];

      const hooks: StreamProcessorHooks = {
        onStreamStart: vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          results.push(1);
        }),
        onChunk: vi.fn().mockImplementation(async () => {
          results.push(2);
        }),
        onStreamEnd: vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          results.push(3);
        }),
      };

      processor.setHooks(hooks);

      const events: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "Hello" } as StreamEvent),
        Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
      ];

      await processor.processStream(createStream(events));

      // All async hooks should have completed
      expect(results).toContain(1);
      expect(results).toContain(2);
      expect(results).toContain(3);
    });
  });

  describe("Error handling and recovery", () => {
    it("should handle errors gracefully and return Err result", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });

      const events: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "Starting..." } as StreamEvent),
        Err(new Error("Network failure")),
      ];

      const result = await processor.processStream(createStream(events));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Network failure");
      }
    });

    it("should handle provider error events", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });
      const uiEvents: UiEvent[] = [];

      processor.setUiHandler((event) => {
        uiEvents.push(event);
      });

      const events: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "Processing..." } as StreamEvent),
        Ok({
          type: "error",
          code: "RATE_LIMIT",
          message: "Too many requests",
        } as StreamEvent),
        Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
      ];

      await processor.processStream(createStream(events));

      const errorEvent = uiEvents.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type === "error") {
        expect(errorEvent.error.code).toBe("RATE_LIMIT");
      }
    });

    it("should reset state for reuse after error", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });

      // First stream with error
      const errorEvents: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "Partial" } as StreamEvent),
        Err(new Error("Failed")),
      ];

      const result1 = await processor.processStream(createStream(errorEvents));
      expect(result1.ok).toBe(false);

      // Reset and process new stream
      processor.reset();

      const successEvents: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "New content" } as StreamEvent),
        Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
      ];

      const result2 = await processor.processStream(createStream(successEvents));

      expect(result2.ok).toBe(true);
      if (result2.ok) {
        // Should not contain content from first stream
        const textParts = result2.value.parts.filter((p) => p.type === "text");
        expect(textParts.some((p) => p.type === "text" && p.content.includes("Partial"))).toBe(
          false
        );
      }
    });

    it("should handle exceptions thrown during processing", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });
      const uiEvents: UiEvent[] = [];

      processor.setUiHandler((event) => {
        uiEvents.push(event);
      });

      // Create a stream that throws during iteration
      async function* throwingStream(): AsyncIterable<Result<StreamEvent, Error>> {
        yield Ok({ type: "text", content: "Before throw" } as StreamEvent);
        throw new Error("Unexpected exception");
      }

      const result = await processor.processStream(throwingStream());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Unexpected exception");
      }

      const errorEvent = uiEvents.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
    });
  });

  describe("Complex scenarios", () => {
    it("should process multiple tool calls in sequence", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });
      const toolEvents: UiEvent[] = [];

      processor.setUiHandler((event) => {
        if (event.type === "tool_started" || event.type === "tool_completed") {
          toolEvents.push(event);
        }
      });

      const events: Array<Result<StreamEvent, Error>> = [
        Ok({
          type: "tool_call_start",
          id: "call_1",
          name: "search",
          index: 0,
        } as StreamEvent),
        Ok({ type: "tool_call_delta", id: "call_1", arguments: '{"q":"a"}', index: 0 } as StreamEvent),
        Ok({ type: "tool_call_end", id: "call_1", index: 0 } as StreamEvent),
        Ok({
          type: "tool_call_start",
          id: "call_2",
          name: "fetch",
          index: 1,
        } as StreamEvent),
        Ok({
          type: "tool_call_delta",
          id: "call_2",
          arguments: '{"url":"http://example.com"}',
          index: 1,
        } as StreamEvent),
        Ok({ type: "tool_call_end", id: "call_2", index: 1 } as StreamEvent),
        Ok({ type: "end", stopReason: "tool_use" } as StreamEvent),
      ];

      const result = await processor.processStream(createStream(events));

      expect(result.ok).toBe(true);
      if (result.ok) {
        const toolParts = result.value.parts.filter((p) => p.type === "tool");
        expect(toolParts).toHaveLength(2);
      }

      // Should have 2 started and 2 completed events
      const startedEvents = toolEvents.filter((e) => e.type === "tool_started");
      const completedEvents = toolEvents.filter((e) => e.type === "tool_completed");
      expect(startedEvents).toHaveLength(2);
      expect(completedEvents).toHaveLength(2);
    });

    it("should handle interleaved text and tool events", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });
      const uiEvents: UiEvent[] = [];

      processor.setUiHandler((event) => {
        uiEvents.push(event);
      });

      const events: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "I'll help with that.\n" } as StreamEvent),
        Ok({
          type: "tool_call_start",
          id: "call_1",
          name: "read_file",
          index: 0,
        } as StreamEvent),
        Ok({
          type: "tool_call_delta",
          id: "call_1",
          arguments: '{"path":"test.txt"}',
          index: 0,
        } as StreamEvent),
        Ok({ type: "tool_call_end", id: "call_1", index: 0 } as StreamEvent),
        Ok({ type: "text", content: "Based on the file..." } as StreamEvent),
        Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
      ];

      const result = await processor.processStream(createStream(events));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.parts.length).toBeGreaterThan(1);
        // Should have both text and tool parts
        const hasText = result.value.parts.some((p) => p.type === "text");
        const hasTool = result.value.parts.some((p) => p.type === "tool");
        expect(hasText).toBe(true);
        expect(hasTool).toBe(true);
      }
    });

    it("should accumulate usage across multiple usage events", async () => {
      const processor = new StreamProcessor({ newlineGate: { flushTimeoutMs: 10 } });

      const events: Array<Result<StreamEvent, Error>> = [
        Ok({ type: "text", content: "Response" } as StreamEvent),
        Ok({
          type: "usage",
          inputTokens: 100,
          outputTokens: 50,
        } as StreamEvent),
        Ok({ type: "end", stopReason: "end_turn" } as StreamEvent),
      ];

      const result = await processor.processStream(createStream(events));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.usage).toBeDefined();
        expect(result.value.usage?.inputTokens).toBe(100);
        expect(result.value.usage?.outputTokens).toBe(50);
      }
    });
  });
});
