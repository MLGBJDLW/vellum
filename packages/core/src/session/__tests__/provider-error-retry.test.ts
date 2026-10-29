import { ProviderError, type ProviderRegistry, type StreamEvent } from "@vellum/provider";
import { describe, expect, it, vi } from "vitest";
import { CancellationToken } from "../../agent/cancellation.js";
import { AgentRetryManager } from "../../agent/retry-manager.js";
import { AgentStreamHandler } from "../../agent/stream-handler.js";
import { ErrorCode, VellumError } from "../../errors/index.js";
import { StreamProcessor } from "../../streaming/processor.js";
import { classifyError } from "../errors.js";
import { LLM } from "../llm.js";

describe.each([false, true])(
  "provider error through the agent retry boundary (processor=%s)",
  (useStreamProcessor) => {
    it.each([
      {
        code: ErrorCode.INVALID_ARGUMENT,
        retryable: false,
        message: "Invalid schema for timeout: expected number",
      },
      {
        code: ErrorCode.SERVICE_UNAVAILABLE,
        retryable: true,
        message: "Provider interrupted generation: insufficient_system_resource",
      },
      {
        code: ErrorCode.API_ERROR,
        retryable: false,
        message: "Provider interrupted generation: aborted",
      },
      { code: ErrorCode.RATE_LIMITED, retryable: true, message: "Capacity temporarily exhausted" },
    ])("retains $code and retryable=$retryable", async ({ code, retryable, message }) => {
      const error = new ProviderError(message, { code, retryable, category: "api_error" });
      const provider = {
        isInitialized: () => true,
        // biome-ignore lint/correctness/useYield: Reproduce rejection before the first stream event.
        async *stream(): AsyncGenerator<StreamEvent> {
          throw error;
        },
      };
      LLM.initialize({ get: async () => provider } as unknown as ProviderRegistry);
      const handler = new AgentStreamHandler(
        { useStreamProcessor },
        {
          streamProcessor: new StreamProcessor(),
          isCancelled: () => false,
          emitText: vi.fn(),
          emitThinking: vi.fn(),
          emitToolCall: vi.fn(),
          emitError: vi.fn(),
          recordUsage: vi.fn(),
        }
      );
      const rejected = await handler
        .processStream(
          LLM.stream({
            providerType: "deepseek",
            model: "deepseek-flash",
            messages: [{ role: "user", content: "Hello" }],
          })
        )
        .then(
          () => undefined,
          (caught: Error) => caught
        );
      expect(rejected).toBeInstanceOf(Error);
      if (!rejected) throw new Error("Expected the stream to fail");
      const manager = new AgentRetryManager({
        config: { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 },
        getCancellationToken: () => new CancellationToken(),
        emitRetryAttempt: vi.fn(),
        emitRetryExhausted: vi.fn(),
      });
      const result = manager.handleError(rejected);
      expect(result.shouldRetry).toBe(retryable);
      expect(result.errorInfo.code).toBe(code);
      expect(result.errorInfo.retryable).toBe(retryable);
      if (retryable) {
        expect(manager.handleError(rejected).shouldRetry).toBe(true);
        expect(manager.handleError(rejected).shouldRetry).toBe(true);
        expect(manager.handleError(rejected).shouldRetry).toBe(false);
        expect(manager.getRetryAttempts()).toBe(3);
      }
    });

    it("keeps caller cancellation as graceful completion", async () => {
      const provider = {
        isInitialized: () => true,
        // biome-ignore lint/correctness/useYield: A cancelled provider throws before yielding.
        async *stream(): AsyncGenerator<StreamEvent> {
          throw new DOMException("Cancelled", "AbortError");
        },
      };
      LLM.initialize({ get: async () => provider } as unknown as ProviderRegistry);
      const handler = new AgentStreamHandler(
        { useStreamProcessor },
        {
          streamProcessor: new StreamProcessor(),
          isCancelled: () => false,
          emitText: vi.fn(),
          emitThinking: vi.fn(),
          emitToolCall: vi.fn(),
          emitError: vi.fn(),
          recordUsage: vi.fn(),
        }
      );
      await expect(
        handler.processStream(
          LLM.stream({
            providerType: "deepseek",
            model: "deepseek-flash",
            messages: [{ role: "user", content: "Hello" }],
          })
        )
      ).resolves.toMatchObject({ pendingToolCalls: [] });
    });
  }
);

it("respects explicit retryability overrides without changing default code classification", () => {
  expect(classifyError(new VellumError("Default", ErrorCode.API_ERROR)).retryable).toBe(true);
  const stopped = classifyError(
    new VellumError("Stopped", ErrorCode.API_ERROR, { isRetryable: false })
  );
  expect(stopped.retryable).toBe(false);
  expect(stopped.suggestedAction).not.toBe("retry");
  expect(stopped.retryDelay).toBeUndefined();
  const recoverable = classifyError(
    new VellumError("Recoverable", ErrorCode.UNKNOWN, { isRetryable: true })
  );
  expect(recoverable).toMatchObject({
    retryable: true,
    severity: "transient",
    suggestedAction: "retry",
  });
});
