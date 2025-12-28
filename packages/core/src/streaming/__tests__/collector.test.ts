/**
 * @file collector.test.ts
 * @description Unit tests for StreamCollector - T024
 *
 * Tests cover:
 * - Text event accumulation across multiple chunks
 * - Reasoning event accumulation
 * - Tool call lifecycle (start → delta → end)
 * - Citation collection
 * - Usage tracking
 * - End event handling
 * - build() returns correct AssistantMessage with all parts
 * - Edge cases (EC-001, EC-002, EC-006, EC-007)
 */

import { describe, expect, it, beforeEach } from "vitest";
import type { GroundingChunk } from "@vellum/provider";
import { StreamCollector } from "../collector.js";

describe("StreamCollector", () => {
  let collector: StreamCollector;

  beforeEach(() => {
    collector = new StreamCollector();
  });

  // ===========================================================================
  // Text Event Accumulation
  // ===========================================================================

  describe("Text Event Accumulation", () => {
    it("should accumulate text from multiple chunks with same index", () => {
      // When index is provided, chunks accumulate into the same buffer
      collector.processEvent({ type: "text", content: "Hello, ", index: 0 });
      collector.processEvent({ type: "text", content: "world!", index: 0 });
      collector.processEvent({ type: "end", stopReason: "end_turn" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.parts).toHaveLength(1);
        expect(result.value.parts[0]).toEqual({
          type: "text",
          content: "Hello, world!",
        });
      }
    });

    it("should create separate parts when no index provided (auto-increment)", () => {
      // Without explicit index, each event gets a new auto-incremented index
      collector.processEvent({ type: "text", content: "Hello, " });
      collector.processEvent({ type: "text", content: "world!" });
      collector.processEvent({ type: "end", stopReason: "end_turn" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Each event without index creates a new part
        expect(result.value.parts).toHaveLength(2);
        expect(result.value.parts[0]).toEqual({
          type: "text",
          content: "Hello, ",
        });
        expect(result.value.parts[1]).toEqual({
          type: "text",
          content: "world!",
        });
      }
    });

    it("should accumulate text with explicit indices", () => {
      collector.processEvent({ type: "text", content: "First ", index: 0 });
      collector.processEvent({ type: "text", content: "Second ", index: 1 });
      collector.processEvent({ type: "text", content: "part", index: 0 });
      collector.processEvent({ type: "text", content: "block", index: 1 });
      collector.processEvent({ type: "end", stopReason: "end_turn" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.parts).toHaveLength(2);
        expect(result.value.parts[0]).toEqual({
          type: "text",
          content: "First part",
        });
        expect(result.value.parts[1]).toEqual({
          type: "text",
          content: "Second block",
        });
      }
    });

    it("should return emit_text action for each text event", () => {
      const action1 = collector.processEvent({ type: "text", content: "Hello" });
      const action2 = collector.processEvent({ type: "text", content: " there" });

      expect(action1).toEqual({ type: "emit_text", content: "Hello", index: 0 });
      expect(action2).toEqual({ type: "emit_text", content: " there", index: 1 });
    });
  });

  // ===========================================================================
  // Reasoning Event Accumulation
  // ===========================================================================

  describe("Reasoning Event Accumulation", () => {
    it("should accumulate reasoning content with same index", () => {
      collector.processEvent({ type: "reasoning", content: "Let me think...", index: 0 });
      collector.processEvent({ type: "reasoning", content: " First, I need to", index: 0 });
      collector.processEvent({ type: "end", stopReason: "end_turn" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const reasoningPart = result.value.parts.find((p) => p.type === "reasoning");
        expect(reasoningPart).toEqual({
          type: "reasoning",
          content: "Let me think... First, I need to",
        });
      }
    });

    it("should create separate parts when no index provided", () => {
      // Without explicit index, each event gets auto-incremented index
      collector.processEvent({ type: "reasoning", content: "Let me think..." });
      collector.processEvent({ type: "reasoning", content: " First, I need to" });
      collector.processEvent({ type: "end", stopReason: "end_turn" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const reasoningParts = result.value.parts.filter((p) => p.type === "reasoning");
        expect(reasoningParts).toHaveLength(2);
      }
    });

    it("should accumulate reasoning with explicit indices", () => {
      collector.processEvent({ type: "reasoning", content: "Block 0: ", index: 0 });
      collector.processEvent({ type: "reasoning", content: "Block 1: ", index: 1 });
      collector.processEvent({ type: "reasoning", content: "A", index: 0 });
      collector.processEvent({ type: "reasoning", content: "B", index: 1 });
      collector.processEvent({ type: "end", stopReason: "end_turn" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const reasoningParts = result.value.parts.filter((p) => p.type === "reasoning");
        expect(reasoningParts).toHaveLength(2);
        expect(reasoningParts[0]).toEqual({ type: "reasoning", content: "Block 0: A" });
        expect(reasoningParts[1]).toEqual({ type: "reasoning", content: "Block 1: B" });
      }
    });

    it("should return emit_reasoning action for each reasoning event", () => {
      const action = collector.processEvent({ type: "reasoning", content: "Thinking" });

      expect(action).toEqual({ type: "emit_reasoning", content: "Thinking", index: 0 });
    });
  });

  // ===========================================================================
  // Tool Call Lifecycle
  // ===========================================================================

  describe("Tool Call Lifecycle", () => {
    it("should handle tool call start event", () => {
      const action = collector.processEvent({
        type: "tool_call_start",
        id: "call_123",
        name: "read_file",
        index: 0,
      });

      expect(action).toEqual({
        type: "tool_call_started",
        id: "call_123",
        name: "read_file",
        index: 0,
      });
    });

    it("should handle tool call delta events", () => {
      collector.processEvent({
        type: "tool_call_start",
        id: "call_123",
        name: "read_file",
        index: 0,
      });

      const deltaAction1 = collector.processEvent({
        type: "tool_call_delta",
        id: "call_123",
        arguments: '{"path":',
        index: 0,
      });

      const deltaAction2 = collector.processEvent({
        type: "tool_call_delta",
        id: "call_123",
        arguments: ' "/test.txt"}',
        index: 0,
      });

      // Delta events return { type: "none" } since they're accumulating
      expect(deltaAction1).toEqual({ type: "none" });
      expect(deltaAction2).toEqual({ type: "none" });
    });

    it("should handle tool call end event with parsed arguments", () => {
      collector.processEvent({
        type: "tool_call_start",
        id: "call_123",
        name: "read_file",
        index: 0,
      });
      collector.processEvent({
        type: "tool_call_delta",
        id: "call_123",
        arguments: '{"path": "/test.txt"}',
        index: 0,
      });
      const endAction = collector.processEvent({
        type: "tool_call_end",
        id: "call_123",
        index: 0,
      });

      expect(endAction).toEqual({
        type: "tool_call_completed",
        id: "call_123",
        arguments: { path: "/test.txt" },
      });
    });

    it("should build complete tool call in final message", () => {
      collector.processEvent({
        type: "tool_call_start",
        id: "call_123",
        name: "search",
        index: 0,
      });
      collector.processEvent({
        type: "tool_call_delta",
        id: "call_123",
        arguments: '{"query": "test"}',
        index: 0,
      });
      collector.processEvent({
        type: "tool_call_end",
        id: "call_123",
        index: 0,
      });
      collector.processEvent({ type: "end", stopReason: "tool_use" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const toolPart = result.value.parts.find((p) => p.type === "tool");
        expect(toolPart).toEqual({
          type: "tool",
          id: "call_123",
          name: "search",
          arguments: { query: "test" },
          state: "complete",
        });
        expect(result.value.stopReason).toBe("tool_use");
      }
    });

    it("should handle multiple tool calls", () => {
      collector.processEvent({
        type: "tool_call_start",
        id: "call_1",
        name: "read_file",
        index: 0,
      });
      collector.processEvent({
        type: "tool_call_delta",
        id: "call_1",
        arguments: '{"path": "/a.txt"}',
        index: 0,
      });
      collector.processEvent({
        type: "tool_call_end",
        id: "call_1",
        index: 0,
      });

      collector.processEvent({
        type: "tool_call_start",
        id: "call_2",
        name: "write_file",
        index: 1,
      });
      collector.processEvent({
        type: "tool_call_delta",
        id: "call_2",
        arguments: '{"path": "/b.txt", "content": "hello"}',
        index: 1,
      });
      collector.processEvent({
        type: "tool_call_end",
        id: "call_2",
        index: 1,
      });

      collector.processEvent({ type: "end", stopReason: "tool_use" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const toolParts = result.value.parts.filter((p) => p.type === "tool");
        expect(toolParts).toHaveLength(2);
        expect(toolParts[0]).toMatchObject({
          id: "call_1",
          name: "read_file",
          arguments: { path: "/a.txt" },
        });
        expect(toolParts[1]).toMatchObject({
          id: "call_2",
          name: "write_file",
          arguments: { path: "/b.txt", content: "hello" },
        });
      }
    });
  });

  // ===========================================================================
  // Citation Collection
  // ===========================================================================

  describe("Citation Collection", () => {
    it("should collect citation events", () => {
      const chunk: GroundingChunk = {
        uri: "https://example.com/source",
        title: "Example Source",
        text: "Relevant excerpt",
        relevanceScore: 0.95,
      };

      const action = collector.processEvent({ type: "citation", chunk });

      expect(action).toEqual({ type: "emit_citations", citations: [chunk] });
    });

    it("should include citations in final message", () => {
      const chunk1: GroundingChunk = { uri: "https://a.com", title: "A" };
      const chunk2: GroundingChunk = { uri: "https://b.com", title: "B" };

      collector.processEvent({ type: "citation", chunk: chunk1 });
      collector.processEvent({ type: "citation", chunk: chunk2 });
      collector.processEvent({ type: "text", content: "Referenced text" });
      collector.processEvent({ type: "end", stopReason: "end_turn" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.citations).toHaveLength(2);
        expect(result.value.citations![0]).toEqual(chunk1);
        expect(result.value.citations![1]).toEqual(chunk2);
      }
    });

    it("should not include citations field when no citations", () => {
      collector.processEvent({ type: "text", content: "No citations" });
      collector.processEvent({ type: "end", stopReason: "end_turn" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.citations).toBeUndefined();
      }
    });
  });

  // ===========================================================================
  // Usage Tracking
  // ===========================================================================

  describe("Usage Tracking", () => {
    it("should track basic usage statistics", () => {
      const usageAction = collector.processEvent({
        type: "usage",
        inputTokens: 150,
        outputTokens: 200,
      });

      expect(usageAction).toEqual({ type: "none" });

      collector.processEvent({ type: "end", stopReason: "end_turn" });
      const result = collector.build();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.usage).toEqual({
          inputTokens: 150,
          outputTokens: 200,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        });
      }
    });

    it("should track cache token statistics", () => {
      collector.processEvent({
        type: "usage",
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 30,
        cacheWriteTokens: 20,
      });
      collector.processEvent({ type: "end", stopReason: "end_turn" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.usage?.cacheReadTokens).toBe(30);
        expect(result.value.usage?.cacheWriteTokens).toBe(20);
      }
    });

    it("should handle missing usage event", () => {
      collector.processEvent({ type: "text", content: "Hello" });
      collector.processEvent({ type: "end", stopReason: "end_turn" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.usage).toBeUndefined();
      }
    });
  });

  // ===========================================================================
  // End Event Handling
  // ===========================================================================

  describe("End Event Handling", () => {
    it("should return stream_complete action on end event", () => {
      collector.processEvent({ type: "text", content: "Hello" });
      const endAction = collector.processEvent({
        type: "end",
        stopReason: "end_turn",
      });

      expect(endAction.type).toBe("stream_complete");
      if (endAction.type === "stream_complete") {
        expect(endAction.message.stopReason).toBe("end_turn");
      }
    });

    it("should handle all stop reasons", () => {
      const stopReasons = [
        "end_turn",
        "max_tokens",
        "stop_sequence",
        "tool_use",
        "content_filter",
        "error",
      ] as const;

      for (const stopReason of stopReasons) {
        const localCollector = new StreamCollector();
        localCollector.processEvent({ type: "text", content: "Test" });
        localCollector.processEvent({ type: "end", stopReason });

        const result = localCollector.build();
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.stopReason).toBe(stopReason);
        }
      }
    });

    it("should handle legacy done event", () => {
      collector.processEvent({ type: "text", content: "Hello" });
      const doneAction = collector.processEvent({
        type: "done",
        stopReason: "end_turn",
      });

      expect(doneAction.type).toBe("stream_complete");
    });
  });

  // ===========================================================================
  // Error Event Handling
  // ===========================================================================

  describe("Error Event Handling", () => {
    it("should return error action for error events", () => {
      const action = collector.processEvent({
        type: "error",
        code: "rate_limit",
        message: "Rate limit exceeded",
        retryable: true,
      });

      expect(action).toEqual({
        type: "error",
        code: "rate_limit",
        message: "Rate limit exceeded",
      });
    });
  });

  // ===========================================================================
  // MCP Events
  // ===========================================================================

  describe("MCP Events", () => {
    it("should pass through mcp_tool_start without action", () => {
      const action = collector.processEvent({
        type: "mcp_tool_start",
        toolId: "mcp_1",
        serverName: "memory",
        toolName: "store",
      });

      expect(action).toEqual({ type: "none" });
    });

    it("should pass through mcp_tool_progress without action", () => {
      const action = collector.processEvent({
        type: "mcp_tool_progress",
        toolId: "mcp_1",
        progress: 50,
        message: "Processing...",
      });

      expect(action).toEqual({ type: "none" });
    });

    it("should pass through mcp_tool_end without action", () => {
      const action = collector.processEvent({
        type: "mcp_tool_end",
        toolId: "mcp_1",
        result: { success: true },
      });

      expect(action).toEqual({ type: "none" });
    });
  });

  // ===========================================================================
  // Legacy Tool Call Events
  // ===========================================================================

  describe("Legacy Tool Call Events", () => {
    it("should handle legacy toolCall event", () => {
      const action = collector.processEvent({
        type: "toolCall",
        id: "tc_legacy",
        name: "legacy_tool",
        input: { foo: "bar" },
      });

      expect(action).toEqual({
        type: "tool_call_completed",
        id: "tc_legacy",
        arguments: { foo: "bar" },
      });

      collector.processEvent({ type: "end", stopReason: "tool_use" });
      const result = collector.build();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const toolPart = result.value.parts.find((p) => p.type === "tool");
        expect(toolPart?.name).toBe("legacy_tool");
      }
    });

    it("should handle legacy toolCallDelta event", () => {
      collector.processEvent({
        type: "toolCallDelta",
        id: "tc_delta",
        name: "delta_tool",
        inputDelta: '{"key":',
      });
      collector.processEvent({
        type: "toolCallDelta",
        id: "tc_delta",
        inputDelta: ' "value"}',
      });
      collector.processEvent({ type: "end", stopReason: "tool_use" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const toolPart = result.value.parts.find((p) => p.type === "tool");
        expect(toolPart?.name).toBe("delta_tool");
        expect(toolPart?.arguments).toEqual({ key: "value" });
      }
    });
  });

  // ===========================================================================
  // Reset Functionality
  // ===========================================================================

  describe("Reset Functionality", () => {
    it("should reset all state for reuse", () => {
      collector.processEvent({ type: "text", content: "First" });
      collector.processEvent({
        type: "usage",
        inputTokens: 100,
        outputTokens: 50,
      });
      collector.processEvent({ type: "end", stopReason: "end_turn" });

      collector.reset();

      collector.processEvent({ type: "text", content: "Second" });
      collector.processEvent({ type: "end", stopReason: "max_tokens" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.parts).toHaveLength(1);
        expect(result.value.parts[0]).toEqual({
          type: "text",
          content: "Second",
        });
        expect(result.value.usage).toBeUndefined();
        expect(result.value.stopReason).toBe("max_tokens");
      }
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("Edge Cases", () => {
    /**
     * EC-001: Empty stream
     */
    it("EC-001: should handle empty stream", () => {
      collector.processEvent({ type: "end", stopReason: "end_turn" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.parts).toHaveLength(0);
        expect(result.value.stopReason).toBe("end_turn");
      }
    });

    /**
     * EC-002: Single character chunks
     */
    it("EC-002: should accumulate single character chunks with same index", () => {
      const text = "Hello, World!";
      for (const char of text) {
        collector.processEvent({ type: "text", content: char, index: 0 });
      }
      collector.processEvent({ type: "end", stopReason: "end_turn" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.parts[0]).toEqual({
          type: "text",
          content: "Hello, World!",
        });
      }
    });

    /**
     * EC-006: Tool call with malformed JSON arguments
     */
    it("EC-006: should handle tool call with malformed JSON arguments", () => {
      collector.processEvent({
        type: "tool_call_start",
        id: "call_malformed",
        name: "test_tool",
        index: 0,
      });
      collector.processEvent({
        type: "tool_call_delta",
        id: "call_malformed",
        arguments: "{invalid json",
        index: 0,
      });
      collector.processEvent({
        type: "tool_call_end",
        id: "call_malformed",
        index: 0,
      });
      collector.processEvent({ type: "end", stopReason: "tool_use" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const toolPart = result.value.parts.find((p) => p.type === "tool");
        // Should fall back to empty object for invalid JSON
        expect(toolPart?.arguments).toEqual({});
      }
    });

    /**
     * EC-006 Variant: Tool call with empty arguments
     */
    it("EC-006: should handle tool call with empty arguments", () => {
      collector.processEvent({
        type: "tool_call_start",
        id: "call_empty",
        name: "no_args_tool",
        index: 0,
      });
      // No delta events - empty arguments
      collector.processEvent({
        type: "tool_call_end",
        id: "call_empty",
        index: 0,
      });
      collector.processEvent({ type: "end", stopReason: "tool_use" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const toolPart = result.value.parts.find((p) => p.type === "tool");
        expect(toolPart?.arguments).toEqual({});
      }
    });

    /**
     * EC-007: Interleaved text/reasoning
     */
    it("EC-007: should handle interleaved text and reasoning", () => {
      collector.processEvent({ type: "reasoning", content: "First thought" });
      collector.processEvent({ type: "text", content: "Response part 1" });
      collector.processEvent({ type: "reasoning", content: " Second thought" });
      collector.processEvent({ type: "text", content: " Response part 2" });
      collector.processEvent({ type: "end", stopReason: "end_turn" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const textParts = result.value.parts.filter((p) => p.type === "text");
        const reasoningParts = result.value.parts.filter((p) => p.type === "reasoning");

        // Both should be accumulated correctly
        expect(textParts.length).toBeGreaterThan(0);
        expect(reasoningParts.length).toBeGreaterThan(0);

        // Text content should be combined (based on index)
        const combinedText = textParts.map((p) => p.type === "text" ? p.content : "").join("");
        expect(combinedText).toContain("Response part 1");
        expect(combinedText).toContain("Response part 2");

        // Reasoning content should be combined
        const combinedReasoning = reasoningParts
          .map((p) => p.type === "reasoning" ? p.content : "")
          .join("");
        expect(combinedReasoning).toContain("First thought");
        expect(combinedReasoning).toContain("Second thought");
      }
    });

    /**
     * Tool call end for unknown ID
     */
    it("should handle tool_call_end for unknown ID", () => {
      const action = collector.processEvent({
        type: "tool_call_end",
        id: "unknown_id",
        index: 0,
      });

      expect(action).toEqual({ type: "none" });
    });

    /**
     * Build without end event
     */
    it("should build message even without end event", () => {
      collector.processEvent({ type: "text", content: "Incomplete" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.parts[0]).toEqual({
          type: "text",
          content: "Incomplete",
        });
        expect(result.value.stopReason).toBeUndefined();
      }
    });

    /**
     * Large text accumulation
     */
    it("should handle large text accumulation with same index", () => {
      const largeContent = "x".repeat(100000);
      const chunkSize = 1000;

      for (let i = 0; i < largeContent.length; i += chunkSize) {
        collector.processEvent({
          type: "text",
          content: largeContent.slice(i, i + chunkSize),
          index: 0,
        });
      }
      collector.processEvent({ type: "end", stopReason: "end_turn" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.parts[0]).toEqual({
          type: "text",
          content: largeContent,
        });
      }
    });
  });

  // ===========================================================================
  // Complete Message Build
  // ===========================================================================

  describe("Complete Message Build", () => {
    it("should build complete message with all parts", () => {
      const chunk: GroundingChunk = { uri: "https://example.com" };

      // Reasoning first
      collector.processEvent({ type: "reasoning", content: "Thinking..." });

      // Then text
      collector.processEvent({ type: "text", content: "Here is the answer:" });

      // Tool call
      collector.processEvent({
        type: "tool_call_start",
        id: "call_1",
        name: "search",
        index: 0,
      });
      collector.processEvent({
        type: "tool_call_delta",
        id: "call_1",
        arguments: '{"q":"test"}',
        index: 0,
      });
      collector.processEvent({
        type: "tool_call_end",
        id: "call_1",
        index: 0,
      });

      // Citation
      collector.processEvent({ type: "citation", chunk });

      // Usage
      collector.processEvent({
        type: "usage",
        inputTokens: 100,
        outputTokens: 200,
        cacheReadTokens: 50,
      });

      // End
      collector.processEvent({ type: "end", stopReason: "tool_use" });

      const result = collector.build();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const message = result.value;

        // Should have text, reasoning, and tool parts
        expect(message.parts.length).toBeGreaterThanOrEqual(3);

        // Check text
        const textPart = message.parts.find((p) => p.type === "text");
        expect(textPart?.type).toBe("text");

        // Check reasoning
        const reasoningPart = message.parts.find((p) => p.type === "reasoning");
        expect(reasoningPart?.type).toBe("reasoning");

        // Check tool
        const toolPart = message.parts.find((p) => p.type === "tool");
        expect(toolPart).toMatchObject({
          type: "tool",
          id: "call_1",
          name: "search",
        });

        // Check citations
        expect(message.citations).toHaveLength(1);
        expect(message.citations![0]).toEqual(chunk);

        // Check usage
        expect(message.usage).toEqual({
          inputTokens: 100,
          outputTokens: 200,
          cacheReadTokens: 50,
          cacheWriteTokens: undefined,
        });

        // Check stopReason
        expect(message.stopReason).toBe("tool_use");
      }
    });
  });
});
