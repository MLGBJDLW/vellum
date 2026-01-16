/**
 * Unit tests for Provider Types and Error Classification
 *
 * @see packages/provider/src/types.ts
 * @see packages/provider/src/errors.ts
 */

import { ErrorCode } from "@vellum/shared";
import { describe, expect, it } from "vitest";
import {
  classifyHttpStatus,
  classifyProviderError,
  createProviderError,
  getRetryDelay,
  isRetryable,
  ProviderError,
} from "../errors.js";
import type {
  CompletionMessage,
  CompletionParams,
  CompletionResult,
  ContentPart,
  ImageContentPart,
  ModelInfo,
  ProviderOptions,
  ProviderType,
  StreamDoneEvent,
  StreamErrorEvent,
  StreamEvent,
  StreamReasoningEvent,
  StreamTextEvent,
  StreamToolCallDeltaEvent,
  StreamToolCallEvent,
  StreamUsageEvent,
  TextContentPart,
  ThinkingConfig,
  TokenUsage,
  ToolCall,
  ToolDefinition,
  ToolResultContentPart,
  ToolUseContentPart,
} from "../types.js";

// =============================================================================
// Type Inference Tests (Compile-Time Verification)
// =============================================================================

describe("Type Inference Tests", () => {
  describe("ProviderType", () => {
    it("should accept valid provider types", () => {
      const anthropic: ProviderType = "anthropic";
      const openai: ProviderType = "openai";
      const google: ProviderType = "google";

      expect(anthropic).toBe("anthropic");
      expect(openai).toBe("openai");
      expect(google).toBe("google");
    });
  });

  describe("ProviderOptions", () => {
    it("should allow empty options", () => {
      const options: ProviderOptions = {};
      expect(options).toEqual({});
    });

    it("should allow all optional fields", () => {
      const options: ProviderOptions = {
        apiKey: "sk-test-key",
        baseUrl: "https://api.example.com",
        timeout: 30000,
        headers: { "X-Custom": "value" },
      };

      expect(options.apiKey).toBe("sk-test-key");
      expect(options.baseUrl).toBe("https://api.example.com");
      expect(options.timeout).toBe(30000);
      expect(options.headers).toEqual({ "X-Custom": "value" });
    });
  });

  describe("ContentPart Types", () => {
    it("should discriminate TextContentPart", () => {
      const part: TextContentPart = {
        type: "text",
        text: "Hello world",
      };

      expect(part.type).toBe("text");
      expect(part.text).toBe("Hello world");
    });

    it("should discriminate ImageContentPart", () => {
      const part: ImageContentPart = {
        type: "image",
        source: "base64data",
        mimeType: "image/png",
      };

      expect(part.type).toBe("image");
      expect(part.mimeType).toBe("image/png");
    });

    it("should discriminate ToolUseContentPart", () => {
      const part: ToolUseContentPart = {
        type: "tool_use",
        id: "tool_123",
        name: "read_file",
        input: { path: "/test.txt" },
      };

      expect(part.type).toBe("tool_use");
      expect(part.name).toBe("read_file");
    });

    it("should discriminate ToolResultContentPart", () => {
      const part: ToolResultContentPart = {
        type: "tool_result",
        toolUseId: "tool_123",
        content: "File contents here",
        isError: false,
      };

      expect(part.type).toBe("tool_result");
      expect(part.toolUseId).toBe("tool_123");
    });

    it("should allow ContentPart union type", () => {
      const parts: ContentPart[] = [
        { type: "text", text: "Hello" },
        { type: "image", source: "data", mimeType: "image/jpeg" },
        { type: "tool_use", id: "1", name: "test", input: {} },
        { type: "tool_result", toolUseId: "1", content: "result" },
      ];

      expect(parts).toHaveLength(4);
      expect(parts[0]?.type).toBe("text");
      expect(parts[1]?.type).toBe("image");
    });
  });

  describe("CompletionMessage", () => {
    it("should accept string content", () => {
      const message: CompletionMessage = {
        role: "user",
        content: "Hello",
      };

      expect(message.role).toBe("user");
      expect(message.content).toBe("Hello");
    });

    it("should accept ContentPart array", () => {
      const message: CompletionMessage = {
        role: "assistant",
        content: [
          { type: "text", text: "Here's an image:" },
          { type: "image", source: "base64", mimeType: "image/png" },
        ],
      };

      expect(message.role).toBe("assistant");
      expect(Array.isArray(message.content)).toBe(true);
    });
  });

  describe("CompletionParams", () => {
    it("should require model and messages", () => {
      const params: CompletionParams = {
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hi" }],
      };

      expect(params.model).toBe("claude-sonnet-4-20250514");
      expect(params.messages).toHaveLength(1);
    });

    it("should allow all optional fields", () => {
      const tools: ToolDefinition[] = [
        {
          name: "calculator",
          description: "Performs calculations",
          inputSchema: { type: "object" },
        },
      ];

      const thinking: ThinkingConfig = {
        enabled: true,
        budgetTokens: 5000,
        reasoningEffort: "medium",
      };

      const params: CompletionParams = {
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hi" }],
        temperature: 0.7,
        maxTokens: 1024,
        tools,
        thinking,
        stopSequences: ["END"],
        topP: 0.9,
        presencePenalty: 0.1,
        frequencyPenalty: 0.1,
      };

      expect(params.temperature).toBe(0.7);
      expect(params.maxTokens).toBe(1024);
      expect(params.tools).toHaveLength(1);
      expect(params.thinking?.enabled).toBe(true);
    });
  });

  describe("TokenUsage", () => {
    it("should require input and output tokens", () => {
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 200,
      };

      expect(usage.inputTokens).toBe(100);
      expect(usage.outputTokens).toBe(200);
    });

    it("should allow optional cache and thinking tokens", () => {
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 200,
        thinkingTokens: 500,
        cacheReadTokens: 50,
        cacheWriteTokens: 30,
      };

      expect(usage.thinkingTokens).toBe(500);
      expect(usage.cacheReadTokens).toBe(50);
    });
  });

  describe("CompletionResult", () => {
    it("should require content, usage, and stopReason", () => {
      const result: CompletionResult = {
        content: "Hello there!",
        usage: { inputTokens: 10, outputTokens: 5 },
        stopReason: "end_turn",
      };

      expect(result.content).toBe("Hello there!");
      expect(result.stopReason).toBe("end_turn");
    });

    it("should allow optional thinking and toolCalls", () => {
      const toolCalls: ToolCall[] = [{ id: "tc_1", name: "read_file", input: { path: "/test" } }];

      const result: CompletionResult = {
        content: "",
        usage: { inputTokens: 10, outputTokens: 5 },
        stopReason: "tool_use",
        thinking: "Let me think about this...",
        toolCalls,
      };

      expect(result.thinking).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);
    });
  });

  describe("StreamEvent Union", () => {
    it("should discriminate text events", () => {
      const event: StreamTextEvent = { type: "text", content: "Hello" };
      const streamEvent: StreamEvent = event;

      if (streamEvent.type === "text") {
        expect(streamEvent.content).toBe("Hello");
      }
    });

    it("should discriminate reasoning events", () => {
      const event: StreamReasoningEvent = { type: "reasoning", content: "Thinking..." };
      const streamEvent: StreamEvent = event;

      if (streamEvent.type === "reasoning") {
        expect(streamEvent.content).toBe("Thinking...");
      }
    });

    it("should discriminate toolCall events", () => {
      const event: StreamToolCallEvent = {
        type: "toolCall",
        id: "tc_1",
        name: "test",
        input: {},
      };

      const streamEvent: StreamEvent = event;
      if (streamEvent.type === "toolCall") {
        expect(streamEvent.name).toBe("test");
      }
    });

    it("should discriminate tool_call_delta events", () => {
      const event: StreamToolCallDeltaEvent = {
        type: "tool_call_delta",
        id: "tc_1",
        arguments: '{"partial":',
        index: 0,
      };

      const streamEvent: StreamEvent = event;
      if (streamEvent.type === "tool_call_delta") {
        expect(streamEvent.arguments).toBeDefined();
      }
    });

    it("should discriminate usage events", () => {
      const event: StreamUsageEvent = {
        type: "usage",
        inputTokens: 10,
        outputTokens: 20,
      };

      const streamEvent: StreamEvent = event;
      if (streamEvent.type === "usage") {
        expect(streamEvent.inputTokens).toBe(10);
      }
    });

    it("should discriminate error events", () => {
      const event: StreamErrorEvent = {
        type: "error",
        code: "rate_limit",
        message: "Too many requests",
        retryable: true,
      };

      const streamEvent: StreamEvent = event;
      if (streamEvent.type === "error") {
        expect(streamEvent.retryable).toBe(true);
      }
    });

    it("should discriminate done events", () => {
      const event: StreamDoneEvent = {
        type: "done",
        stopReason: "end_turn",
      };

      const streamEvent: StreamEvent = event;
      if (streamEvent.type === "done") {
        expect(streamEvent.stopReason).toBe("end_turn");
      }
    });

    it("should allow exhaustive switch pattern", () => {
      const events: StreamEvent[] = [
        { type: "text", content: "Hi" },
        { type: "reasoning", content: "Think" },
        { type: "toolCall", id: "1", name: "t", input: {} },
        { type: "tool_call_delta", id: "1", arguments: "{", index: 0 },
        { type: "usage", inputTokens: 1, outputTokens: 1 },
        { type: "error", code: "e", message: "m", retryable: false },
        { type: "done", stopReason: "end_turn" },
      ];

      const results: string[] = [];

      for (const event of events) {
        switch (event.type) {
          case "text":
            results.push("text");
            break;
          case "reasoning":
            results.push("reasoning");
            break;
          case "toolCall":
            results.push("toolCall");
            break;
          case "tool_call_delta":
            results.push("tool_call_delta");
            break;
          case "usage":
            results.push("usage");
            break;
          case "error":
            results.push("error");
            break;
          case "done":
            results.push("done");
            break;
        }
      }

      expect(results).toEqual([
        "text",
        "reasoning",
        "toolCall",
        "tool_call_delta",
        "usage",
        "error",
        "done",
      ]);
    });
  });

  // =============================================================================
  // T023: StreamEvent Type Guards - All 12 Event Types
  // =============================================================================

  describe("StreamEvent Type Guards - All 12 Event Types", () => {
    /**
     * T023: Test type narrowing for all 12 stream event types
     * Events: text, reasoning, tool_call_start, tool_call_delta, tool_call_end,
     * mcp_tool_start, mcp_tool_progress, mcp_tool_end, citation, usage, end, error
     */

    it("should narrow text event type", () => {
      const event: StreamEvent = { type: "text", content: "Hello", index: 0 };

      expect(event.type).toBe("text");
      if (event.type === "text") {
        // TypeScript should narrow to StreamTextEvent
        expect(event.content).toBe("Hello");
        expect(event.index).toBe(0);
      }
    });

    it("should narrow reasoning event type", () => {
      const event: StreamEvent = { type: "reasoning", content: "Thinking...", index: 1 };

      expect(event.type).toBe("reasoning");
      if (event.type === "reasoning") {
        // TypeScript should narrow to StreamReasoningEvent
        expect(event.content).toBe("Thinking...");
        expect(event.index).toBe(1);
      }
    });

    it("should narrow tool_call_start event type", () => {
      const event: StreamEvent = {
        type: "tool_call_start",
        id: "call_abc123",
        name: "read_file",
        index: 0,
      };

      expect(event.type).toBe("tool_call_start");
      if (event.type === "tool_call_start") {
        // TypeScript should narrow to StreamToolCallStartEvent
        expect(event.id).toBe("call_abc123");
        expect(event.name).toBe("read_file");
        expect(event.index).toBe(0);
      }
    });

    it("should narrow tool_call_delta event type", () => {
      const event: StreamEvent = {
        type: "tool_call_delta",
        id: "call_abc123",
        arguments: '{"path": "/test.txt"}',
        index: 0,
      };

      expect(event.type).toBe("tool_call_delta");
      if (event.type === "tool_call_delta") {
        // TypeScript should narrow to StreamToolCallDeltaEvent
        expect(event.id).toBe("call_abc123");
        expect(event.arguments).toBe('{"path": "/test.txt"}');
        expect(event.index).toBe(0);
      }
    });

    it("should narrow tool_call_end event type", () => {
      const event: StreamEvent = {
        type: "tool_call_end",
        id: "call_abc123",
        index: 0,
      };

      expect(event.type).toBe("tool_call_end");
      if (event.type === "tool_call_end") {
        // TypeScript should narrow to StreamToolCallEndEvent
        expect(event.id).toBe("call_abc123");
        expect(event.index).toBe(0);
      }
    });

    it("should narrow mcp_tool_start event type", () => {
      const event: StreamEvent = {
        type: "mcp_tool_start",
        toolId: "mcp_tool_001",
        serverName: "memory-server",
        toolName: "store_memory",
      };

      expect(event.type).toBe("mcp_tool_start");
      if (event.type === "mcp_tool_start") {
        // TypeScript should narrow to StreamMcpToolStartEvent
        expect(event.toolId).toBe("mcp_tool_001");
        expect(event.serverName).toBe("memory-server");
        expect(event.toolName).toBe("store_memory");
      }
    });

    it("should narrow mcp_tool_progress event type", () => {
      const event: StreamEvent = {
        type: "mcp_tool_progress",
        toolId: "mcp_tool_001",
        progress: 50,
        message: "Processing...",
      };

      expect(event.type).toBe("mcp_tool_progress");
      if (event.type === "mcp_tool_progress") {
        // TypeScript should narrow to StreamMcpToolProgressEvent
        expect(event.toolId).toBe("mcp_tool_001");
        expect(event.progress).toBe(50);
        expect(event.message).toBe("Processing...");
      }
    });

    it("should narrow mcp_tool_end event type", () => {
      const event: StreamEvent = {
        type: "mcp_tool_end",
        toolId: "mcp_tool_001",
        result: { success: true, data: "stored" },
      };

      expect(event.type).toBe("mcp_tool_end");
      if (event.type === "mcp_tool_end") {
        // TypeScript should narrow to StreamMcpToolEndEvent
        expect(event.toolId).toBe("mcp_tool_001");
        expect(event.result).toEqual({ success: true, data: "stored" });
      }
    });

    it("should narrow mcp_tool_end event type with error", () => {
      const event: StreamEvent = {
        type: "mcp_tool_end",
        toolId: "mcp_tool_001",
        error: "Connection failed",
      };

      expect(event.type).toBe("mcp_tool_end");
      if (event.type === "mcp_tool_end") {
        // TypeScript should narrow to StreamMcpToolEndEvent
        expect(event.toolId).toBe("mcp_tool_001");
        expect(event.error).toBe("Connection failed");
      }
    });

    it("should narrow citation event type", () => {
      const event: StreamEvent = {
        type: "citation",
        chunk: {
          uri: "https://example.com/source",
          title: "Source Document",
          text: "Relevant excerpt...",
          relevanceScore: 0.95,
        },
      };

      expect(event.type).toBe("citation");
      if (event.type === "citation") {
        // TypeScript should narrow to StreamCitationEvent
        expect(event.chunk.uri).toBe("https://example.com/source");
        expect(event.chunk.title).toBe("Source Document");
        expect(event.chunk.text).toBe("Relevant excerpt...");
        expect(event.chunk.relevanceScore).toBe(0.95);
      }
    });

    it("should narrow usage event type", () => {
      const event: StreamEvent = {
        type: "usage",
        inputTokens: 150,
        outputTokens: 200,
        cacheReadTokens: 50,
        cacheWriteTokens: 30,
      };

      expect(event.type).toBe("usage");
      if (event.type === "usage") {
        // TypeScript should narrow to StreamUsageEvent
        expect(event.inputTokens).toBe(150);
        expect(event.outputTokens).toBe(200);
        expect(event.cacheReadTokens).toBe(50);
        expect(event.cacheWriteTokens).toBe(30);
      }
    });

    it("should narrow end event type", () => {
      const event: StreamEvent = {
        type: "end",
        stopReason: "end_turn",
      };

      expect(event.type).toBe("end");
      if (event.type === "end") {
        // TypeScript should narrow to StreamEndEvent
        expect(event.stopReason).toBe("end_turn");
      }
    });

    it("should narrow error event type", () => {
      const event: StreamEvent = {
        type: "error",
        code: "rate_limit",
        message: "Rate limit exceeded",
        retryable: true,
      };

      expect(event.type).toBe("error");
      if (event.type === "error") {
        // TypeScript should narrow to StreamErrorEvent
        expect(event.code).toBe("rate_limit");
        expect(event.message).toBe("Rate limit exceeded");
        expect(event.retryable).toBe(true);
      }
    });

    it("should allow exhaustive switch for all 12 event types", () => {
      const events: StreamEvent[] = [
        { type: "text", content: "Hello" },
        { type: "reasoning", content: "Thinking" },
        { type: "tool_call_start", id: "1", name: "test", index: 0 },
        { type: "tool_call_delta", id: "1", arguments: "{}", index: 0 },
        { type: "tool_call_end", id: "1", index: 0 },
        { type: "mcp_tool_start", toolId: "m1", serverName: "s", toolName: "t" },
        { type: "mcp_tool_progress", toolId: "m1", progress: 50 },
        { type: "mcp_tool_end", toolId: "m1", result: {} },
        { type: "citation", chunk: { uri: "http://example.com" } },
        { type: "usage", inputTokens: 10, outputTokens: 20 },
        { type: "end", stopReason: "end_turn" },
        { type: "error", code: "e", message: "m", retryable: false },
      ];

      const results: string[] = [];

      for (const event of events) {
        switch (event.type) {
          case "text":
            results.push("text");
            break;
          case "reasoning":
            results.push("reasoning");
            break;
          case "tool_call_start":
            results.push("tool_call_start");
            break;
          case "tool_call_delta":
            results.push("tool_call_delta");
            break;
          case "tool_call_end":
            results.push("tool_call_end");
            break;
          case "mcp_tool_start":
            results.push("mcp_tool_start");
            break;
          case "mcp_tool_progress":
            results.push("mcp_tool_progress");
            break;
          case "mcp_tool_end":
            results.push("mcp_tool_end");
            break;
          case "citation":
            results.push("citation");
            break;
          case "usage":
            results.push("usage");
            break;
          case "end":
            results.push("end");
            break;
          case "error":
            results.push("error");
            break;
          // Legacy types (not part of the 12 core types)
          case "toolCall":
          case "toolCallDelta":
          case "done":
            results.push(`legacy_${event.type}`);
            break;
        }
      }

      expect(results).toEqual([
        "text",
        "reasoning",
        "tool_call_start",
        "tool_call_delta",
        "tool_call_end",
        "mcp_tool_start",
        "mcp_tool_progress",
        "mcp_tool_end",
        "citation",
        "usage",
        "end",
        "error",
      ]);
    });

    it("should handle all stop reasons in end event", () => {
      const stopReasons = [
        "end_turn",
        "max_tokens",
        "stop_sequence",
        "tool_use",
        "content_filter",
        "error",
      ] as const;

      for (const stopReason of stopReasons) {
        const event: StreamEvent = { type: "end", stopReason };
        expect(event.type).toBe("end");
        if (event.type === "end") {
          expect(event.stopReason).toBe(stopReason);
        }
      }
    });

    it("should handle optional fields in events", () => {
      // text event without index
      const textEvent: StreamEvent = { type: "text", content: "No index" };
      if (textEvent.type === "text") {
        expect(textEvent.content).toBe("No index");
        expect(textEvent.index).toBeUndefined();
      }

      // reasoning event without index
      const reasoningEvent: StreamEvent = { type: "reasoning", content: "No index" };
      if (reasoningEvent.type === "reasoning") {
        expect(reasoningEvent.content).toBe("No index");
        expect(reasoningEvent.index).toBeUndefined();
      }

      // mcp_tool_progress without message
      const progressEvent: StreamEvent = {
        type: "mcp_tool_progress",
        toolId: "m1",
        progress: 75,
      };
      if (progressEvent.type === "mcp_tool_progress") {
        expect(progressEvent.progress).toBe(75);
        expect(progressEvent.message).toBeUndefined();
      }

      // usage event without cache tokens
      const usageEvent: StreamEvent = {
        type: "usage",
        inputTokens: 100,
        outputTokens: 200,
      };
      if (usageEvent.type === "usage") {
        expect(usageEvent.inputTokens).toBe(100);
        expect(usageEvent.cacheReadTokens).toBeUndefined();
        expect(usageEvent.cacheWriteTokens).toBeUndefined();
      }
    });
  });

  describe("ModelInfo", () => {
    it("should require all mandatory fields", () => {
      const model: ModelInfo = {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        provider: "anthropic",
        contextWindow: 200000,
        supportsTools: true,
        supportsVision: true,
        supportsReasoning: true,
      };

      expect(model.id).toBe("claude-sonnet-4-20250514");
      expect(model.provider).toBe("anthropic");
    });

    it("should allow optional pricing fields", () => {
      const model: ModelInfo = {
        id: "gpt-4",
        name: "GPT-4",
        provider: "openai",
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: true,
        supportsReasoning: false,
        supportsStreaming: true,
        inputPrice: 30.0,
        outputPrice: 60.0,
      };

      expect(model.inputPrice).toBe(30.0);
      expect(model.outputPrice).toBe(60.0);
    });
  });
});

// =============================================================================
// Error Classification Tests
// =============================================================================

describe("Error Classification", () => {
  describe("classifyHttpStatus", () => {
    describe("Authentication Errors (401, 403)", () => {
      it("should classify 401 as credential_invalid", () => {
        const result = classifyHttpStatus(401);

        expect(result.code).toBe(ErrorCode.CREDENTIAL_VALIDATION_FAILED);
        expect(result.category).toBe("credential_invalid");
        expect(result.retryable).toBe(false);
      });

      it("should classify 403 as credential_invalid", () => {
        const result = classifyHttpStatus(403);

        expect(result.code).toBe(ErrorCode.CREDENTIAL_VALIDATION_FAILED);
        expect(result.category).toBe("credential_invalid");
        expect(result.retryable).toBe(false);
      });
    });

    describe("Rate Limiting (429)", () => {
      it("should classify 429 as rate_limited and retryable", () => {
        const result = classifyHttpStatus(429);

        expect(result.code).toBe(ErrorCode.RATE_LIMITED);
        expect(result.category).toBe("rate_limited");
        expect(result.retryable).toBe(true);
        expect(result.retryDelayMs).toBeDefined();
      });
    });

    describe("Server Errors (5xx)", () => {
      it("should classify 500 as api_error and retryable", () => {
        const result = classifyHttpStatus(500);

        expect(result.code).toBe(ErrorCode.API_ERROR);
        expect(result.category).toBe("api_error");
        expect(result.retryable).toBe(true);
      });

      it("should classify 502 as service_unavailable", () => {
        const result = classifyHttpStatus(502);

        expect(result.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
        expect(result.retryable).toBe(true);
      });

      it("should classify 503 as service_unavailable", () => {
        const result = classifyHttpStatus(503);

        expect(result.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
        expect(result.retryable).toBe(true);
      });

      it("should classify 504 as timeout", () => {
        const result = classifyHttpStatus(504);

        expect(result.code).toBe(ErrorCode.TIMEOUT);
        expect(result.category).toBe("timeout");
        expect(result.retryable).toBe(true);
      });

      it("should classify unknown 5xx as api_error", () => {
        const result = classifyHttpStatus(599);

        expect(result.code).toBe(ErrorCode.API_ERROR);
        expect(result.category).toBe("api_error");
        expect(result.retryable).toBe(true);
      });
    });

    describe("Client Errors (4xx)", () => {
      it("should classify 400 as invalid_argument", () => {
        const result = classifyHttpStatus(400);

        expect(result.code).toBe(ErrorCode.INVALID_ARGUMENT);
        expect(result.retryable).toBe(false);
      });

      it("should classify 404 as provider_not_found", () => {
        const result = classifyHttpStatus(404);

        expect(result.code).toBe(ErrorCode.PROVIDER_NOT_FOUND);
        expect(result.retryable).toBe(false);
      });

      it("should classify unknown 4xx as api_error", () => {
        const result = classifyHttpStatus(418);

        expect(result.code).toBe(ErrorCode.API_ERROR);
        expect(result.retryable).toBe(false);
      });
    });

    describe("Unknown Status Codes", () => {
      it("should classify 200 as unknown", () => {
        const result = classifyHttpStatus(200);

        expect(result.code).toBe(ErrorCode.UNKNOWN);
        expect(result.category).toBe("unknown");
        expect(result.retryable).toBe(false);
      });
    });
  });

  describe("classifyProviderError", () => {
    describe("ProviderError instances", () => {
      it("should return existing classification from ProviderError", () => {
        const error = new ProviderError("Test error", {
          code: ErrorCode.RATE_LIMITED,
          category: "rate_limited",
          retryable: true,
          retryDelayMs: 5000,
        });

        const result = classifyProviderError(error);

        expect(result.code).toBe(ErrorCode.RATE_LIMITED);
        expect(result.category).toBe("rate_limited");
        expect(result.retryable).toBe(true);
        expect(result.retryDelayMs).toBe(5000);
      });
    });

    describe("HTTP Status Code Errors", () => {
      it("should classify error with status property", () => {
        const error = { status: 429, message: "Rate limited" };

        const result = classifyProviderError(error);

        expect(result.code).toBe(ErrorCode.RATE_LIMITED);
        expect(result.category).toBe("rate_limited");
      });

      it("should classify error with statusCode property", () => {
        const error = { statusCode: 401, message: "Unauthorized" };

        const result = classifyProviderError(error);

        expect(result.code).toBe(ErrorCode.CREDENTIAL_VALIDATION_FAILED);
        expect(result.category).toBe("credential_invalid");
      });
    });

    describe("Timeout Errors", () => {
      it("should classify timeout Error", () => {
        const error = new Error("Request timed out");

        const result = classifyProviderError(error);

        expect(result.code).toBe(ErrorCode.TIMEOUT);
        expect(result.category).toBe("timeout");
        expect(result.retryable).toBe(true);
      });

      it("should classify ETIMEDOUT error", () => {
        const error = new Error("connect ETIMEDOUT 192.168.1.1:443");

        const result = classifyProviderError(error);

        expect(result.code).toBe(ErrorCode.TIMEOUT);
        expect(result.category).toBe("timeout");
      });
    });

    describe("Network Errors", () => {
      it("should classify network error", () => {
        const error = new Error("Network request failed");

        const result = classifyProviderError(error);

        expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
        expect(result.category).toBe("network_error");
        expect(result.retryable).toBe(true);
      });

      it("should classify ECONNREFUSED", () => {
        const error = new Error("connect ECONNREFUSED 127.0.0.1:3000");

        const result = classifyProviderError(error);

        expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
        expect(result.category).toBe("network_error");
      });

      it("should classify ECONNRESET", () => {
        const error = new Error("socket hang up ECONNRESET");

        const result = classifyProviderError(error);

        expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
        expect(result.category).toBe("network_error");
      });

      it("should classify ENOTFOUND", () => {
        const error = new Error("getaddrinfo ENOTFOUND api.example.com");

        const result = classifyProviderError(error);

        expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
        expect(result.category).toBe("network_error");
      });

      it("should classify connection errors", () => {
        const error = new Error("Connection refused");

        const result = classifyProviderError(error);

        expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
        expect(result.category).toBe("network_error");
      });
    });

    describe("Context Overflow Errors", () => {
      it("should classify context length errors", () => {
        const error = new Error("context_length_exceeded");

        const result = classifyProviderError(error);

        expect(result.code).toBe(ErrorCode.CONTEXT_OVERFLOW);
        expect(result.category).toBe("context_overflow");
        expect(result.retryable).toBe(false);
      });

      it("should classify token limit errors", () => {
        const error = new Error("Token limit exceeded");

        const result = classifyProviderError(error);

        expect(result.code).toBe(ErrorCode.CONTEXT_OVERFLOW);
        expect(result.category).toBe("context_overflow");
      });
    });

    describe("Content Filter Errors", () => {
      it("should classify content filter errors", () => {
        const error = new Error("Content flagged by safety filter");

        const result = classifyProviderError(error);

        expect(result.code).toBe(ErrorCode.API_ERROR);
        expect(result.category).toBe("content_filter");
        expect(result.retryable).toBe(false);
      });
    });

    describe("Abort Errors", () => {
      it("should classify abort errors", () => {
        const error = new Error("Request was aborted");

        const result = classifyProviderError(error);

        expect(result.category).toBe("unknown");
        expect(result.retryable).toBe(false);
      });

      it("should classify cancelled errors", () => {
        const error = new Error("Operation cancelled by user");

        const result = classifyProviderError(error);

        expect(result.retryable).toBe(false);
      });
    });

    describe("Unknown Errors", () => {
      it("should classify string errors", () => {
        const result = classifyProviderError("Something went wrong");

        expect(result.code).toBe(ErrorCode.UNKNOWN);
        expect(result.category).toBe("unknown");
      });

      it("should classify null", () => {
        const result = classifyProviderError(null);

        expect(result.code).toBe(ErrorCode.UNKNOWN);
      });

      it("should classify undefined", () => {
        const result = classifyProviderError(undefined);

        expect(result.code).toBe(ErrorCode.UNKNOWN);
      });
    });
  });

  describe("isRetryable", () => {
    it("should return true for rate limit errors", () => {
      const error = { status: 429 };
      expect(isRetryable(error)).toBe(true);
    });

    it("should return true for server errors", () => {
      const error = { status: 500 };
      expect(isRetryable(error)).toBe(true);
    });

    it("should return true for timeout errors", () => {
      const error = new Error("Request timed out");
      expect(isRetryable(error)).toBe(true);
    });

    it("should return true for network errors", () => {
      const error = new Error("Network error");
      expect(isRetryable(error)).toBe(true);
    });

    it("should return false for auth errors", () => {
      const error = { status: 401 };
      expect(isRetryable(error)).toBe(false);
    });

    it("should return false for invalid argument errors", () => {
      const error = { status: 400 };
      expect(isRetryable(error)).toBe(false);
    });

    it("should return false for context overflow", () => {
      const error = new Error("Context length exceeded");
      expect(isRetryable(error)).toBe(false);
    });

    it("should return false for content filter", () => {
      const error = new Error("Content flagged by safety");
      expect(isRetryable(error)).toBe(false);
    });
  });

  describe("getRetryDelay", () => {
    it("should return base delay for first attempt", () => {
      const error = { status: 500 };
      const delay = getRetryDelay(error, 1);

      // Should be approximately base delay (1000ms) + jitter
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(1300); // max 30% jitter
    });

    it("should return exponential delay for subsequent attempts", () => {
      const error = { status: 500 };
      const delay2 = getRetryDelay(error, 2);
      const delay3 = getRetryDelay(error, 3);

      // Delay should increase with attempts
      expect(delay2).toBeGreaterThan(1300); // 2000 base for attempt 2
      expect(delay3).toBeGreaterThan(delay2);
    });

    it("should cap delay at 60 seconds", () => {
      const error = { status: 500 };
      const delay = getRetryDelay(error, 10);

      expect(delay).toBeLessThanOrEqual(60000);
    });

    it("should use Retry-After header if present", () => {
      const error = {
        status: 429,
        headers: { "Retry-After": "30" },
      };

      const delay = getRetryDelay(error, 1);
      expect(delay).toBe(30000); // 30 seconds
    });

    it("should handle numeric Retry-After header", () => {
      const error = {
        status: 429,
        headers: { "Retry-After": 15 },
      };

      const delay = getRetryDelay(error, 1);
      expect(delay).toBe(15000);
    });

    it("should handle retryAfter property", () => {
      const error = {
        status: 429,
        retryAfter: 20,
      };

      const delay = getRetryDelay(error, 1);
      expect(delay).toBe(20000);
    });
  });

  describe("createProviderError", () => {
    it("should create ProviderError from Error", () => {
      const original = new Error("Original error");
      const error = createProviderError(original, "Provider failed");

      expect(error).toBeInstanceOf(ProviderError);
      expect(error.message).toBe("Provider failed: Original error");
      expect(error.cause).toBe(original);
    });

    it("should create ProviderError from HTTP error", () => {
      const original = { status: 429, message: "Rate limited" };
      const error = createProviderError(original);

      expect(error).toBeInstanceOf(ProviderError);
      expect(error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(error.statusCode).toBe(429);
      expect(error.retryable).toBe(true);
    });

    it("should create ProviderError from string", () => {
      const error = createProviderError("Something went wrong");

      expect(error).toBeInstanceOf(ProviderError);
      expect(error.message).toBe("Something went wrong");
      expect(error.cause).toBeUndefined();
    });

    it("should include context in message", () => {
      const error = createProviderError(new Error("API error"), "Anthropic completion");

      expect(error.message).toBe("Anthropic completion: API error");
    });
  });

  describe("ProviderError", () => {
    it("should create error with all properties", () => {
      const error = new ProviderError("Test error", {
        code: ErrorCode.RATE_LIMITED,
        category: "rate_limited",
        retryable: true,
        statusCode: 429,
        retryDelayMs: 5000,
      });

      expect(error.name).toBe("ProviderError");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(error.category).toBe("rate_limited");
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(429);
      expect(error.retryDelayMs).toBe(5000);
    });

    it("should have proper stack trace", () => {
      const error = new ProviderError("Test", {
        code: ErrorCode.UNKNOWN,
        category: "unknown",
        retryable: false,
      });

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("ProviderError");
    });

    it("should format detailed string", () => {
      const cause = new Error("Original");
      const error = new ProviderError("Test error", {
        code: ErrorCode.RATE_LIMITED,
        category: "rate_limited",
        retryable: true,
        statusCode: 429,
        cause,
        retryDelayMs: 5000,
      });

      const detailed = error.toDetailedString();

      expect(detailed).toContain("[ProviderError] Test error");
      expect(detailed).toContain("Code:");
      expect(detailed).toContain("RATE_LIMITED");
      expect(detailed).toContain("Category: rate_limited");
      expect(detailed).toContain("Retryable: true");
      expect(detailed).toContain("HTTP Status: 429");
      expect(detailed).toContain("Retry Delay: 5000ms");
      expect(detailed).toContain("Caused by: Original");
    });
  });
});
