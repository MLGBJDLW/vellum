import { SpanStatusCode } from "@opentelemetry/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TelemetryInstrumentor } from "../instrumentor.js";
import type { LLMCallMetadata, LLMResponseData } from "../types.js";
import { LLM_SEMANTIC_CONVENTIONS } from "../types.js";

// Track mock instances for assertions
const mockSpanInstances: Array<{
  setAttribute: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
  recordException: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  _name: string;
  _attributes: Record<string, unknown>;
}> = [];

const mockTracerInstances: Array<{
  startSpan: ReturnType<typeof vi.fn>;
}> = [];

let contextWithCallback: ((...args: unknown[]) => unknown) | null = null;

// Mock the OpenTelemetry API
vi.mock("@opentelemetry/api", () => {
  return {
    SpanStatusCode: {
      OK: 1,
      ERROR: 2,
    },
    trace: {
      getTracer: vi.fn().mockImplementation(() => {
        const tracer = {
          startSpan: vi
            .fn()
            .mockImplementation(
              (name: string, options?: { attributes?: Record<string, unknown> }) => {
                const span = {
                  setAttribute: vi.fn(),
                  setStatus: vi.fn(),
                  recordException: vi.fn(),
                  end: vi.fn(),
                  _name: name,
                  _attributes: options?.attributes || {},
                };
                mockSpanInstances.push(span);
                return span;
              }
            ),
        };
        mockTracerInstances.push(tracer);
        return tracer;
      }),
      setSpan: vi.fn().mockReturnValue({}),
    },
    context: {
      active: vi.fn().mockReturnValue({}),
      with: vi.fn().mockImplementation((_ctx: unknown, fn: () => unknown) => {
        contextWithCallback = fn as (...args: unknown[]) => unknown;
        return fn();
      }),
    },
  };
});

describe("TelemetryInstrumentor", () => {
  let instrumentor: TelemetryInstrumentor;
  const testMetadata: LLMCallMetadata = {
    provider: "openai",
    model: "gpt-4",
    operation: "chat",
    requestId: "test-request-123",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpanInstances.length = 0;
    mockTracerInstances.length = 0;
    contextWithCallback = null;
    instrumentor = new TelemetryInstrumentor();
  });

  describe("instrument()", () => {
    it("creates span with correct attributes", async () => {
      const mockFn = vi.fn().mockResolvedValue("result");

      await instrumentor.instrument(testMetadata, mockFn);

      expect(mockSpanInstances.length).toBe(1);
      const span = mockSpanInstances[0]!;
      expect(span._name).toBe("llm.chat");
      expect(span._attributes).toEqual({
        [LLM_SEMANTIC_CONVENTIONS.PROVIDER]: "openai",
        [LLM_SEMANTIC_CONVENTIONS.MODEL]: "gpt-4",
        [LLM_SEMANTIC_CONVENTIONS.OPERATION]: "chat",
        [LLM_SEMANTIC_CONVENTIONS.REQUEST_ID]: "test-request-123",
      });
    });

    it("sets OK status on success", async () => {
      const mockFn = vi.fn().mockResolvedValue("result");

      const result = await instrumentor.instrument(testMetadata, mockFn);

      expect(result).toBe("result");
      const span = mockSpanInstances[0]!;
      expect(span.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
      expect(span.end).toHaveBeenCalled();
    });

    it("executes function within context", async () => {
      const mockFn = vi.fn().mockResolvedValue("result");

      await instrumentor.instrument(testMetadata, mockFn);

      expect(contextWithCallback).not.toBeNull();
      expect(mockFn).toHaveBeenCalled();
    });

    it("records exception on error and rethrows", async () => {
      const testError = new Error("Test error");
      const mockFn = vi.fn().mockRejectedValue(testError);

      await expect(instrumentor.instrument(testMetadata, mockFn)).rejects.toThrow("Test error");

      const span = mockSpanInstances[0]!;
      expect(span.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: "Error: Test error",
      });
      expect(span.recordException).toHaveBeenCalledWith(testError);
      expect(span.end).toHaveBeenCalled();
    });

    it("records non-Error exceptions", async () => {
      const mockFn = vi.fn().mockRejectedValue("string error");

      await expect(instrumentor.instrument(testMetadata, mockFn)).rejects.toThrow();

      const span = mockSpanInstances[0]!;
      expect(span.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: "string error",
      });
      expect(span.recordException).toHaveBeenCalledWith(expect.any(Error));
    });

    it("always ends span even on error", async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error("fail"));

      await expect(instrumentor.instrument(testMetadata, mockFn)).rejects.toThrow();

      const span = mockSpanInstances[0]!;
      expect(span.end).toHaveBeenCalled();
    });
  });

  describe("instrumentStream()", () => {
    async function* createTestStream<T>(items: T[]): AsyncGenerator<T> {
      for (const item of items) {
        yield item;
      }
    }

    async function* createFailingStream(): AsyncGenerator<string> {
      yield "chunk1";
      yield "chunk2";
      throw new Error("Stream error");
    }

    it("creates span with stream suffix", async () => {
      const stream = createTestStream(["a", "b", "c"]);

      const chunks: string[] = [];
      for await (const chunk of instrumentor.instrumentStream(testMetadata, stream)) {
        chunks.push(chunk);
      }

      expect(mockSpanInstances.length).toBe(1);
      const span = mockSpanInstances[0]!;
      expect(span._name).toBe("llm.chat.stream");
      expect(span._attributes).toEqual({
        [LLM_SEMANTIC_CONVENTIONS.PROVIDER]: "openai",
        [LLM_SEMANTIC_CONVENTIONS.MODEL]: "gpt-4",
        [LLM_SEMANTIC_CONVENTIONS.OPERATION]: "chat",
        [LLM_SEMANTIC_CONVENTIONS.REQUEST_ID]: "test-request-123",
      });
    });

    it("counts chunks correctly", async () => {
      const stream = createTestStream(["a", "b", "c", "d", "e"]);

      const chunks: string[] = [];
      for await (const chunk of instrumentor.instrumentStream(testMetadata, stream)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["a", "b", "c", "d", "e"]);
      const span = mockSpanInstances[0]!;
      expect(span.setAttribute).toHaveBeenCalledWith("gen_ai.stream.chunk_count", 5);
    });

    it("sets OK status when stream completes", async () => {
      const stream = createTestStream(["a", "b"]);

      for await (const _chunk of instrumentor.instrumentStream(testMetadata, stream)) {
        // consume stream
      }

      const span = mockSpanInstances[0]!;
      expect(span.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
    });

    it("closes span when stream ends", async () => {
      const stream = createTestStream(["a"]);

      for await (const _chunk of instrumentor.instrumentStream(testMetadata, stream)) {
        // consume stream
      }

      const span = mockSpanInstances[0]!;
      expect(span.end).toHaveBeenCalled();
    });

    it("records exception on stream error", async () => {
      const stream = createFailingStream();

      const chunks: string[] = [];
      await expect(async () => {
        for await (const chunk of instrumentor.instrumentStream(testMetadata, stream)) {
          chunks.push(chunk);
        }
      }).rejects.toThrow("Stream error");

      // Should have yielded chunks before error
      expect(chunks).toEqual(["chunk1", "chunk2"]);
      const span = mockSpanInstances[0]!;
      expect(span.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: "Error: Stream error",
      });
      expect(span.recordException).toHaveBeenCalled();
      expect(span.end).toHaveBeenCalled();
    });

    it("handles empty stream", async () => {
      const stream = createTestStream<string>([]);

      const chunks: string[] = [];
      for await (const chunk of instrumentor.instrumentStream(testMetadata, stream)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([]);
      const span = mockSpanInstances[0]!;
      expect(span.setAttribute).toHaveBeenCalledWith("gen_ai.stream.chunk_count", 0);
      expect(span.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
      expect(span.end).toHaveBeenCalled();
    });
  });

  describe("recordResponseData()", () => {
    it("sets promptTokens attribute", () => {
      const data: LLMResponseData = {
        promptTokens: 100,
      };

      // Need a span to test with
      const mockSpan = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      };

      instrumentor.recordResponseData(
        mockSpan as unknown as import("@opentelemetry/api").Span,
        data
      );

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        LLM_SEMANTIC_CONVENTIONS.PROMPT_TOKENS,
        100
      );
    });

    it("sets completionTokens attribute", () => {
      const data: LLMResponseData = {
        completionTokens: 50,
      };

      const mockSpan = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      };

      instrumentor.recordResponseData(
        mockSpan as unknown as import("@opentelemetry/api").Span,
        data
      );

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        LLM_SEMANTIC_CONVENTIONS.COMPLETION_TOKENS,
        50
      );
    });

    it("sets finishReason as array", () => {
      const data: LLMResponseData = {
        finishReason: "stop",
      };

      const mockSpan = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      };

      instrumentor.recordResponseData(
        mockSpan as unknown as import("@opentelemetry/api").Span,
        data
      );

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(LLM_SEMANTIC_CONVENTIONS.FINISH_REASON, [
        "stop",
      ]);
    });

    it("sets all token attributes together", () => {
      const data: LLMResponseData = {
        promptTokens: 100,
        completionTokens: 50,
        finishReason: "stop",
      };

      const mockSpan = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      };

      instrumentor.recordResponseData(
        mockSpan as unknown as import("@opentelemetry/api").Span,
        data
      );

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        LLM_SEMANTIC_CONVENTIONS.PROMPT_TOKENS,
        100
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        LLM_SEMANTIC_CONVENTIONS.COMPLETION_TOKENS,
        50
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(LLM_SEMANTIC_CONVENTIONS.FINISH_REASON, [
        "stop",
      ]);
    });

    it("skips undefined values", () => {
      const data: LLMResponseData = {};

      const mockSpan = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      };

      instrumentor.recordResponseData(
        mockSpan as unknown as import("@opentelemetry/api").Span,
        data
      );

      expect(mockSpan.setAttribute).not.toHaveBeenCalled();
    });

    it("handles zero token values", () => {
      const data: LLMResponseData = {
        promptTokens: 0,
        completionTokens: 0,
      };

      const mockSpan = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      };

      instrumentor.recordResponseData(
        mockSpan as unknown as import("@opentelemetry/api").Span,
        data
      );

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(LLM_SEMANTIC_CONVENTIONS.PROMPT_TOKENS, 0);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        LLM_SEMANTIC_CONVENTIONS.COMPLETION_TOKENS,
        0
      );
    });
  });
});
