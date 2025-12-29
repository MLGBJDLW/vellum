import type { StreamEvent } from "@vellum/provider";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantMessage } from "../collector.js";
import { type StreamContext, StreamingHookManager, type StreamingHooks } from "../hooks.js";
import type { StreamError } from "../processor.js";

describe("StreamingHookManager", () => {
  let manager: StreamingHookManager;
  let ctx: StreamContext;

  beforeEach(() => {
    manager = new StreamingHookManager();
    ctx = {
      streamId: "test-stream-123",
      startTime: Date.now(),
      eventCount: 0,
      metadata: {},
    };
  });

  describe("register()", () => {
    it("adds hooks and returns unregister function", () => {
      const onStreamStart = vi.fn();
      const hooks: StreamingHooks = { onStreamStart };

      const unregister = manager.register(hooks);

      expect(typeof unregister).toBe("function");
    });

    it("unregister function removes hooks", async () => {
      const onStreamStart = vi.fn();
      const unregister = manager.register({ onStreamStart });

      await manager.fireStreamStart(ctx);
      expect(onStreamStart).toHaveBeenCalledTimes(1);

      unregister();

      await manager.fireStreamStart(ctx);
      expect(onStreamStart).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });

  describe("fireStreamStart()", () => {
    it("calls onStreamStart hooks with context", async () => {
      const onStreamStart = vi.fn();
      manager.register({ onStreamStart });

      await manager.fireStreamStart(ctx);

      expect(onStreamStart).toHaveBeenCalledWith(ctx);
    });

    it("handles async hooks", async () => {
      const order: number[] = [];
      const asyncHook = vi.fn(async () => {
        await Promise.resolve();
        order.push(1);
      });
      manager.register({ onStreamStart: asyncHook });

      await manager.fireStreamStart(ctx);

      expect(asyncHook).toHaveBeenCalled();
      expect(order).toEqual([1]);
    });
  });

  describe("fireChunk()", () => {
    it("calls onChunk hooks with event and context", async () => {
      const onChunk = vi.fn();
      manager.register({ onChunk });

      const event: StreamEvent = { type: "text", content: "hello" };
      await manager.fireChunk(event, ctx);

      expect(onChunk).toHaveBeenCalledWith(event, ctx);
    });
  });

  describe("fireStreamEnd()", () => {
    it("calls onStreamEnd hooks with message and context", async () => {
      const onStreamEnd = vi.fn();
      manager.register({ onStreamEnd });

      const message: AssistantMessage = {
        parts: [{ type: "text", content: "Hello" }],
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 5 },
      };
      await manager.fireStreamEnd(message, ctx);

      expect(onStreamEnd).toHaveBeenCalledWith(message, ctx);
    });
  });

  describe("fireStreamError()", () => {
    it("calls onStreamError hooks with error and context", async () => {
      const onStreamError = vi.fn();
      manager.register({ onStreamError });

      const error: StreamError = {
        code: "STREAM_ERROR",
        message: "Connection lost",
        retryable: true,
      };
      await manager.fireStreamError(error, ctx);

      expect(onStreamError).toHaveBeenCalledWith(error, ctx);
    });
  });

  describe("clear()", () => {
    it("removes all hooks", async () => {
      const onStreamStart1 = vi.fn();
      const onStreamStart2 = vi.fn();
      manager.register({ onStreamStart: onStreamStart1 });
      manager.register({ onStreamStart: onStreamStart2 });

      manager.clear();
      await manager.fireStreamStart(ctx);

      expect(onStreamStart1).not.toHaveBeenCalled();
      expect(onStreamStart2).not.toHaveBeenCalled();
    });
  });

  describe("multiple hooks", () => {
    it("execute in registration order", async () => {
      const order: number[] = [];

      manager.register({
        onStreamStart: () => {
          order.push(1);
        },
      });
      manager.register({
        onStreamStart: () => {
          order.push(2);
        },
      });
      manager.register({
        onStreamStart: () => {
          order.push(3);
        },
      });

      await manager.fireStreamStart(ctx);

      expect(order).toEqual([1, 2, 3]);
    });

    it("all hooks receive the same context", async () => {
      const contexts: StreamContext[] = [];

      manager.register({
        onStreamStart: (c) => {
          contexts.push(c);
        },
      });
      manager.register({
        onStreamStart: (c) => {
          contexts.push(c);
        },
      });

      await manager.fireStreamStart(ctx);

      expect(contexts).toHaveLength(2);
      expect(contexts[0]).toBe(ctx);
      expect(contexts[1]).toBe(ctx);
    });
  });
});
