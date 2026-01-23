/**
 * Tests for FallbackChain Multi-Model Summarization
 *
 * Covers:
 * - REQ-009: Multi-model fallback for summarization
 * - Primary model success (no fallback needed)
 * - First model fails → second succeeds
 * - All models fail → error thrown
 * - Timeout handling per model
 * - Retry logic within each model
 *
 * @module @vellum/core/context/__tests__/fallback-chain.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompactionError, CompactionErrorCode } from "../errors.js";
import { createFallbackChain, FallbackChain, type ModelClientFactory } from "../fallback-chain.js";
import type { ContextMessage } from "../types.js";
import { MessagePriority } from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createMessage(
  id: string,
  role: ContextMessage["role"],
  content: string,
  options: Partial<ContextMessage> = {}
): ContextMessage {
  return {
    id,
    role,
    content,
    priority: options.priority ?? MessagePriority.NORMAL,
    tokens: options.tokens ?? Math.ceil(content.length / 4),
    createdAt: options.createdAt ?? Date.now(),
    ...options,
  };
}

function createTestMessages(count: number): ContextMessage[] {
  const messages: ContextMessage[] = [];
  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? "user" : "assistant";
    messages.push(createMessage(`msg-${i}`, role, `Message ${i} content`, { tokens: 100 }));
  }
  return messages;
}

interface MockClientState {
  summarizeFn: ReturnType<typeof vi.fn>;
}

function createMockClientFactory(behavior: Record<string, () => Promise<string>>): {
  factory: ModelClientFactory;
  clients: Map<string, MockClientState>;
} {
  const clients = new Map<string, MockClientState>();

  const factory: ModelClientFactory = (model: string) => {
    const modelBehavior = behavior[model];
    const summarizeFn = vi.fn().mockImplementation(async () => {
      if (modelBehavior) {
        return modelBehavior();
      }
      return `Summary from ${model}`;
    });
    clients.set(model, { summarizeFn });
    return { summarize: summarizeFn };
  };

  return { factory, clients };
}

// ============================================================================
// FallbackChain Constructor Tests
// ============================================================================

describe("FallbackChain", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create FallbackChain with valid configuration", () => {
      const { factory } = createMockClientFactory({});
      const chain = new FallbackChain({
        models: [{ model: "gpt-4o" }],
        createClient: factory,
      });
      expect(chain).toBeDefined();
      expect(chain.getModels()).toEqual(["gpt-4o"]);
    });

    it("should throw error when no models provided", () => {
      const { factory } = createMockClientFactory({});
      expect(
        () =>
          new FallbackChain({
            models: [],
            createClient: factory,
          })
      ).toThrow("FallbackChain requires at least one model configuration");
    });

    it("should preserve model order", () => {
      const { factory } = createMockClientFactory({});
      const chain = new FallbackChain({
        models: [{ model: "gpt-4o" }, { model: "claude-3-haiku" }, { model: "gemini-flash" }],
        createClient: factory,
      });
      expect(chain.getModels()).toEqual(["gpt-4o", "claude-3-haiku", "gemini-flash"]);
    });

    it("should return primary model correctly", () => {
      const { factory } = createMockClientFactory({});
      const chain = new FallbackChain({
        models: [{ model: "primary" }, { model: "secondary" }],
        createClient: factory,
      });
      expect(chain.getPrimaryModel()).toBe("primary");
    });
  });

  // ============================================================================
  // Primary Model Success Tests
  // ============================================================================

  describe("summarize - primary success", () => {
    it("should succeed with primary model on first attempt", async () => {
      const { factory } = createMockClientFactory({
        "gpt-4o": async () => "Primary model summary",
      });

      const chain = new FallbackChain({
        models: [{ model: "gpt-4o" }, { model: "claude-3-haiku" }],
        createClient: factory,
      });

      const messages = createTestMessages(5);
      const resultPromise = chain.summarize(messages, "Summarize these messages");

      // Advance timers to allow async operations
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.summary).toBe("Primary model summary");
      expect(result.model).toBe("gpt-4o");
      expect(result.attempts).toBe(1);
      expect(result.attemptHistory).toHaveLength(1);
      expect(result.attemptHistory[0]).toMatchObject({
        model: "gpt-4o",
        attempt: 1,
        success: true,
      });
    });

    it("should not invoke fallback models when primary succeeds", async () => {
      const gptMock = vi.fn().mockResolvedValue("GPT summary");
      const claudeMock = vi.fn().mockResolvedValue("Claude summary");

      const factory: ModelClientFactory = (model) => {
        if (model === "gpt-4o") return { summarize: gptMock };
        return { summarize: claudeMock };
      };

      const chain = new FallbackChain({
        models: [{ model: "gpt-4o" }, { model: "claude-3-haiku" }],
        createClient: factory,
      });

      const messages = createTestMessages(5);
      const resultPromise = chain.summarize(messages, "Summarize");
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(gptMock).toHaveBeenCalledTimes(1);
      expect(claudeMock).not.toHaveBeenCalled();
    });

    it("should track latency in successful attempt", async () => {
      const { factory } = createMockClientFactory({
        "gpt-4o": async () => {
          return "Summary";
        },
      });

      const chain = new FallbackChain({
        models: [{ model: "gpt-4o" }],
        createClient: factory,
      });

      const resultPromise = chain.summarize(createTestMessages(3), "Summarize");
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.attemptHistory[0]?.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Fallback on Failure Tests
  // ============================================================================

  describe("summarize - fallback on failure", () => {
    it("should fallback to second model when first fails", async () => {
      const { factory } = createMockClientFactory({
        "gpt-4o": async () => {
          throw new Error("GPT API error");
        },
        "claude-3-haiku": async () => "Claude fallback summary",
      });

      const chain = new FallbackChain({
        models: [
          { model: "gpt-4o", maxRetries: 1 },
          { model: "claude-3-haiku", maxRetries: 1 },
        ],
        createClient: factory,
      });

      const resultPromise = chain.summarize(createTestMessages(5), "Summarize");
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.summary).toBe("Claude fallback summary");
      expect(result.model).toBe("claude-3-haiku");
      expect(result.attempts).toBe(2);
      expect(result.attemptHistory).toHaveLength(2);
      expect(result.attemptHistory[0]).toMatchObject({
        model: "gpt-4o",
        success: false,
        error: "GPT API error",
      });
      expect(result.attemptHistory[1]).toMatchObject({
        model: "claude-3-haiku",
        success: true,
      });
    });

    it("should try third model when first two fail", async () => {
      const { factory } = createMockClientFactory({
        "model-a": async () => {
          throw new Error("Model A failed");
        },
        "model-b": async () => {
          throw new Error("Model B failed");
        },
        "model-c": async () => "Model C success",
      });

      const chain = new FallbackChain({
        models: [
          { model: "model-a", maxRetries: 1 },
          { model: "model-b", maxRetries: 1 },
          { model: "model-c", maxRetries: 1 },
        ],
        createClient: factory,
      });

      const resultPromise = chain.summarize(createTestMessages(5), "Summarize");
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.summary).toBe("Model C success");
      expect(result.model).toBe("model-c");
      expect(result.attempts).toBe(3);
    });

    it("should invoke onFallback callback when falling back", async () => {
      const onFallback = vi.fn();
      const { factory } = createMockClientFactory({
        primary: async () => {
          throw new Error("Primary failed");
        },
        secondary: async () => "Secondary success",
      });

      const chain = new FallbackChain({
        models: [
          { model: "primary", maxRetries: 1 },
          { model: "secondary", maxRetries: 1 },
        ],
        createClient: factory,
        onFallback,
      });

      const resultPromise = chain.summarize(createTestMessages(3), "Summarize");
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(onFallback).toHaveBeenCalledTimes(1);
      expect(onFallback).toHaveBeenCalledWith("primary", "secondary");
    });

    it("should invoke onAttemptFailed callback for each failure", async () => {
      const onAttemptFailed = vi.fn();
      const { factory } = createMockClientFactory({
        "model-a": async () => {
          throw new Error("Error A");
        },
        "model-b": async () => "Success",
      });

      const chain = new FallbackChain({
        models: [
          { model: "model-a", maxRetries: 1 },
          { model: "model-b", maxRetries: 1 },
        ],
        createClient: factory,
        onAttemptFailed,
      });

      const resultPromise = chain.summarize(createTestMessages(3), "Summarize");
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(onAttemptFailed).toHaveBeenCalledTimes(1);
      expect(onAttemptFailed).toHaveBeenCalledWith("model-a", 1, expect.any(Error));
    });
  });

  // ============================================================================
  // All Models Failed Tests
  // ============================================================================

  describe("summarize - all models failed", () => {
    it("should throw ALL_MODELS_FAILED when all models fail", async () => {
      const { factory } = createMockClientFactory({
        "model-a": async () => {
          throw new Error("Model A failed");
        },
        "model-b": async () => {
          throw new Error("Model B failed");
        },
      });

      const chain = new FallbackChain({
        models: [
          { model: "model-a", maxRetries: 1 },
          { model: "model-b", maxRetries: 1 },
        ],
        createClient: factory,
      });

      const resultPromise = chain.summarize(createTestMessages(5), "Summarize");
      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow(CompactionError);

      try {
        await resultPromise;
      } catch (error) {
        expect(CompactionError.isCompactionError(error)).toBe(true);
        if (CompactionError.isCompactionError(error)) {
          expect(error.code).toBe(CompactionErrorCode.ALL_MODELS_FAILED);
          expect(error.context?.attemptedModels).toEqual(["model-a", "model-b"]);
          expect(error.context?.totalAttempts).toBe(2);
          expect(error.isRetryable).toBe(false);
        }
      }
    });

    it("should include attempt history in error context", async () => {
      const { factory } = createMockClientFactory({
        "model-a": async () => {
          throw new Error("Error A");
        },
        "model-b": async () => {
          throw new Error("Error B");
        },
      });

      const chain = new FallbackChain({
        models: [
          { model: "model-a", maxRetries: 1 },
          { model: "model-b", maxRetries: 1 },
        ],
        createClient: factory,
      });

      const resultPromise = chain.summarize(createTestMessages(3), "Summarize");
      await vi.runAllTimersAsync();

      try {
        await resultPromise;
        expect.fail("Should have thrown");
      } catch (error) {
        if (CompactionError.isCompactionError(error)) {
          const history = error.context?.attemptHistory as any[];
          expect(history).toHaveLength(2);
          expect(history[0]).toMatchObject({ model: "model-a", success: false });
          expect(history[1]).toMatchObject({ model: "model-b", success: false });
        }
      }
    });

    it("should include total latency in error context", async () => {
      const { factory } = createMockClientFactory({
        "model-a": async () => {
          throw new Error("Failed");
        },
      });

      const chain = new FallbackChain({
        models: [{ model: "model-a", maxRetries: 1 }],
        createClient: factory,
      });

      const resultPromise = chain.summarize(createTestMessages(3), "Summarize");
      await vi.runAllTimersAsync();

      try {
        await resultPromise;
        expect.fail("Should have thrown");
      } catch (error) {
        if (CompactionError.isCompactionError(error)) {
          expect(error.context?.totalLatencyMs).toBeDefined();
          expect(typeof error.context?.totalLatencyMs).toBe("number");
        }
      }
    });
  });

  // ============================================================================
  // Timeout Handling Tests
  // ============================================================================

  describe("summarize - timeout handling", () => {
    it("should timeout and fallback when model exceeds timeout", async () => {
      const slowModelMock = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve("Slow result"), 5000);
        });
      });
      const fastModelMock = vi.fn().mockResolvedValue("Fast result");

      const factory: ModelClientFactory = (model) => {
        if (model === "slow-model") return { summarize: slowModelMock };
        return { summarize: fastModelMock };
      };

      const chain = new FallbackChain({
        models: [
          { model: "slow-model", timeout: 1000, maxRetries: 1 },
          { model: "fast-model", timeout: 5000, maxRetries: 1 },
        ],
        createClient: factory,
      });

      const resultPromise = chain.summarize(createTestMessages(3), "Summarize");

      // Advance past slow model timeout
      await vi.advanceTimersByTimeAsync(1500);
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.model).toBe("fast-model");
      expect(result.summary).toBe("Fast result");
      expect(result.attemptHistory[0]).toMatchObject({
        model: "slow-model",
        success: false,
        timedOut: true,
      });
    });

    it("should mark timeout attempts with timedOut flag", async () => {
      const slowMock = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve("Slow"), 10000);
          })
      );

      const factory: ModelClientFactory = () => ({ summarize: slowMock });

      const chain = new FallbackChain({
        models: [{ model: "slow-model", timeout: 100, maxRetries: 1 }],
        createClient: factory,
      });

      const resultPromise = chain.summarize(createTestMessages(3), "Summarize");
      await vi.advanceTimersByTimeAsync(200);
      await vi.runAllTimersAsync();

      try {
        await resultPromise;
        expect.fail("Should have thrown");
      } catch (error) {
        if (CompactionError.isCompactionError(error)) {
          const history = error.context?.attemptHistory as any[];
          expect(history[0].timedOut).toBe(true);
        }
      }
    });

    it("should respect per-model timeout configuration", async () => {
      const model1Mock = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve("M1"), 3000);
          })
      );
      const model2Mock = vi.fn().mockResolvedValue("M2 immediate");

      const factory: ModelClientFactory = (model) => {
        if (model === "model-1") return { summarize: model1Mock };
        return { summarize: model2Mock };
      };

      const chain = new FallbackChain({
        models: [
          { model: "model-1", timeout: 1000, maxRetries: 1 }, // 1 second timeout
          { model: "model-2", timeout: 5000, maxRetries: 1 }, // 5 second timeout
        ],
        createClient: factory,
      });

      const resultPromise = chain.summarize(createTestMessages(3), "Summarize");

      // Advance 1.5 seconds - model-1 should timeout
      await vi.advanceTimersByTimeAsync(1500);
      await vi.runAllTimersAsync();

      const result = await resultPromise;
      expect(result.model).toBe("model-2");
    });
  });

  // ============================================================================
  // Retry Logic Tests
  // ============================================================================

  describe("summarize - retry logic", () => {
    it("should retry within a model before falling back", async () => {
      let model1Attempts = 0;
      const model1Mock = vi.fn().mockImplementation(async () => {
        model1Attempts++;
        if (model1Attempts < 3) {
          throw new Error(`Attempt ${model1Attempts} failed`);
        }
        return "Success on third try";
      });

      const factory: ModelClientFactory = () => ({ summarize: model1Mock });

      const chain = new FallbackChain({
        models: [{ model: "model-1", maxRetries: 3, retryDelayMs: 100 }],
        createClient: factory,
      });

      const resultPromise = chain.summarize(createTestMessages(3), "Summarize");

      // Advance through retries
      await vi.advanceTimersByTimeAsync(500); // Allow for retry delays
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(model1Mock).toHaveBeenCalledTimes(3);
      expect(result.summary).toBe("Success on third try");
      expect(result.attempts).toBe(3);
    });

    it("should use progressive backoff for retries", async () => {
      let attempts = 0;
      const mock = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts <= 2) {
          throw new Error("Retry needed");
        }
        return "Success";
      });

      const factory: ModelClientFactory = () => ({ summarize: mock });

      const chain = new FallbackChain({
        models: [{ model: "model-1", maxRetries: 3, retryDelayMs: 1000 }],
        createClient: factory,
      });

      const resultPromise = chain.summarize(createTestMessages(3), "Summarize");

      // First attempt fails, wait for first retry delay (1000ms)
      await vi.advanceTimersByTimeAsync(1100);
      // Second attempt fails, wait for second retry delay (2000ms)
      await vi.advanceTimersByTimeAsync(2100);
      await vi.runAllTimersAsync();

      const result = await resultPromise;
      expect(result.attempts).toBe(3);
    });

    it("should track each retry attempt in history", async () => {
      let callCount = 0;
      const mock = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) throw new Error(`Fail ${callCount}`);
        return "Success";
      });

      const factory: ModelClientFactory = () => ({ summarize: mock });

      const chain = new FallbackChain({
        models: [{ model: "retry-model", maxRetries: 3, retryDelayMs: 100 }],
        createClient: factory,
      });

      const resultPromise = chain.summarize(createTestMessages(3), "Summarize");
      await vi.advanceTimersByTimeAsync(1000);
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.attemptHistory).toHaveLength(3);
      expect(result.attemptHistory[0]).toMatchObject({
        model: "retry-model",
        attempt: 1,
        success: false,
      });
      expect(result.attemptHistory[1]).toMatchObject({
        model: "retry-model",
        attempt: 2,
        success: false,
      });
      expect(result.attemptHistory[2]).toMatchObject({
        model: "retry-model",
        attempt: 3,
        success: true,
      });
    });

    it("should exhaust retries before moving to next model", async () => {
      let _model1Calls = 0;
      const model1Mock = vi.fn().mockImplementation(async () => {
        _model1Calls++;
        throw new Error("Always fails");
      });
      const model2Mock = vi.fn().mockResolvedValue("Model 2 success");

      const factory: ModelClientFactory = (model) => {
        if (model === "model-1") return { summarize: model1Mock };
        return { summarize: model2Mock };
      };

      const chain = new FallbackChain({
        models: [
          { model: "model-1", maxRetries: 2, retryDelayMs: 100 },
          { model: "model-2", maxRetries: 1 },
        ],
        createClient: factory,
      });

      const resultPromise = chain.summarize(createTestMessages(3), "Summarize");
      await vi.advanceTimersByTimeAsync(500);
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(model1Mock).toHaveBeenCalledTimes(2);
      expect(model2Mock).toHaveBeenCalledTimes(1);
      expect(result.model).toBe("model-2");
      expect(result.attempts).toBe(3); // 2 from model-1 + 1 from model-2
    });

    it("should default to 1 retry when maxRetries not specified", async () => {
      const mock = vi.fn().mockRejectedValue(new Error("Failed"));

      const factory: ModelClientFactory = () => ({ summarize: mock });

      const chain = new FallbackChain({
        models: [{ model: "model-1" }], // No maxRetries specified
        createClient: factory,
      });

      const resultPromise = chain.summarize(createTestMessages(3), "Summarize");
      await vi.runAllTimersAsync();

      try {
        await resultPromise;
        expect.fail("Should have thrown");
      } catch (_error) {
        // Should only try once (default maxRetries = 1)
        expect(mock).toHaveBeenCalledTimes(1);
      }
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe("createFallbackChain", () => {
    it("should create FallbackChain with factory function", async () => {
      const { factory } = createMockClientFactory({
        "test-model": async () => "Factory test summary",
      });

      const chain = createFallbackChain([{ model: "test-model" }], factory);

      const resultPromise = chain.summarize(createTestMessages(3), "Summarize");
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.summary).toBe("Factory test summary");
      expect(chain.getModels()).toEqual(["test-model"]);
    });
  });
});
