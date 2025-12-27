/**
 * TelemetryInstrumentor - Instruments async functions and streams with OpenTelemetry spans
 * @module telemetry/instrumentor
 */

import { context, type Span, SpanStatusCode, trace } from "@opentelemetry/api";

import type { LLMCallMetadata, LLMResponseData } from "./types.js";
import { LLM_SEMANTIC_CONVENTIONS } from "./types.js";

/**
 * Instruments LLM operations with OpenTelemetry tracing
 */
export class TelemetryInstrumentor {
  private tracer = trace.getTracer("vellum-llm");

  /**
   * Instrument an async function with OpenTelemetry span
   * @param metadata - LLM call metadata for span attributes
   * @param fn - Async function to instrument
   * @returns Result of the instrumented function
   */
  async instrument<T>(metadata: LLMCallMetadata, fn: () => Promise<T>): Promise<T> {
    const span = this.tracer.startSpan(`llm.${metadata.operation}`, {
      attributes: {
        [LLM_SEMANTIC_CONVENTIONS.PROVIDER]: metadata.provider,
        [LLM_SEMANTIC_CONVENTIONS.MODEL]: metadata.model,
        [LLM_SEMANTIC_CONVENTIONS.OPERATION]: metadata.operation,
        [LLM_SEMANTIC_CONVENTIONS.REQUEST_ID]: metadata.requestId,
      },
    });

    try {
      const result = await context.with(trace.setSpan(context.active(), span), fn);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      this.recordError(span, error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Instrument an async iterable with OpenTelemetry span
   * @param metadata - LLM call metadata for span attributes
   * @param stream - Async iterable to instrument
   * @yields Chunks from the stream
   */
  async *instrumentStream<T>(
    metadata: LLMCallMetadata,
    stream: AsyncIterable<T>
  ): AsyncGenerator<T> {
    const span = this.tracer.startSpan(`llm.${metadata.operation}.stream`, {
      attributes: {
        [LLM_SEMANTIC_CONVENTIONS.PROVIDER]: metadata.provider,
        [LLM_SEMANTIC_CONVENTIONS.MODEL]: metadata.model,
        [LLM_SEMANTIC_CONVENTIONS.OPERATION]: metadata.operation,
        [LLM_SEMANTIC_CONVENTIONS.REQUEST_ID]: metadata.requestId,
      },
    });

    let chunkCount = 0;
    try {
      for await (const chunk of stream) {
        chunkCount++;
        yield chunk;
      }
      span.setAttribute("gen_ai.stream.chunk_count", chunkCount);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      this.recordError(span, error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Record response data (token usage) on a span
   * @param span - The span to record data on
   * @param data - LLM response data with token counts
   */
  recordResponseData(span: Span, data: LLMResponseData): void {
    if (data.promptTokens !== undefined) {
      span.setAttribute(LLM_SEMANTIC_CONVENTIONS.PROMPT_TOKENS, data.promptTokens);
    }
    if (data.completionTokens !== undefined) {
      span.setAttribute(LLM_SEMANTIC_CONVENTIONS.COMPLETION_TOKENS, data.completionTokens);
    }
    if (data.finishReason) {
      span.setAttribute(LLM_SEMANTIC_CONVENTIONS.FINISH_REASON, [data.finishReason]);
    }
  }

  /**
   * Record an error on a span with exception details
   * @param span - The span to record the error on
   * @param error - The error to record
   */
  private recordError(span: Span, error: unknown): void {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
    if (error instanceof Error) {
      span.recordException(error);
    } else {
      span.recordException(new Error(String(error)));
    }
  }
}
