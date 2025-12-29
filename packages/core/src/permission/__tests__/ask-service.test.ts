import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPermissionAskService,
  DEFAULT_ASK_TIMEOUT_MS,
  type PermissionAskHandler,
  PermissionAskService,
} from "../ask-service.js";
import type { PermissionInfo } from "../types.js";

describe("PermissionAskService", () => {
  let service: PermissionAskService;

  beforeEach(() => {
    service = new PermissionAskService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================
  // Helper Functions
  // ============================================

  function createTestInfo(overrides: Partial<PermissionInfo> = {}): PermissionInfo {
    return {
      id: "perm_test_123",
      type: "bash",
      title: "Allow command execution?",
      sessionId: "sess_1",
      messageId: "msg_1",
      time: { created: Date.now() },
      ...overrides,
    };
  }

  // ============================================
  // Constructor
  // ============================================

  describe("constructor", () => {
    it("should initialize with default timeout", () => {
      const s = new PermissionAskService();
      expect(s.defaultTimeoutMs).toBe(DEFAULT_ASK_TIMEOUT_MS);
    });

    it("should accept custom default timeout", () => {
      const s = new PermissionAskService({ defaultTimeoutMs: 5000 });
      expect(s.defaultTimeoutMs).toBe(5000);
    });

    it("should accept initial handler", () => {
      const handler: PermissionAskHandler = vi.fn();
      const s = new PermissionAskService({ handler });
      expect(s.hasHandler()).toBe(true);
    });

    it("should initialize without handler", () => {
      const s = new PermissionAskService();
      expect(s.hasHandler()).toBe(false);
    });
  });

  // ============================================
  // setHandler / getHandler / hasHandler
  // ============================================

  describe("setHandler", () => {
    it("should set the handler", () => {
      const handler: PermissionAskHandler = vi.fn();
      service.setHandler(handler);
      expect(service.hasHandler()).toBe(true);
      expect(service.getHandler()).toBe(handler);
    });

    it("should allow clearing the handler", () => {
      const handler: PermissionAskHandler = vi.fn();
      service.setHandler(handler);
      service.setHandler(undefined);
      expect(service.hasHandler()).toBe(false);
      expect(service.getHandler()).toBeUndefined();
    });

    it("should replace existing handler", () => {
      const handler1: PermissionAskHandler = vi.fn();
      const handler2: PermissionAskHandler = vi.fn();
      service.setHandler(handler1);
      service.setHandler(handler2);
      expect(service.getHandler()).toBe(handler2);
    });
  });

  // ============================================
  // askPermission - No Handler
  // ============================================

  describe("askPermission - no handler", () => {
    it("should reject immediately when no handler is set", async () => {
      const info = createTestInfo();

      const result = await service.askPermission(info);

      expect(result.response).toBe("reject");
      expect(result.timedOut).toBe(false);
    });

    it("should return quickly with no handler", async () => {
      const info = createTestInfo();

      const result = await service.askPermission(info);

      expect(result.durationMs).toBeLessThan(100);
    });
  });

  // ============================================
  // askPermission - With Handler
  // ============================================

  describe("askPermission - with handler", () => {
    it("should call handler with permission info", async () => {
      const handler = vi.fn().mockResolvedValue("once");
      service.setHandler(handler);
      const info = createTestInfo();

      await service.askPermission(info);

      expect(handler).toHaveBeenCalledWith(
        info,
        expect.objectContaining({
          timeoutMs: DEFAULT_ASK_TIMEOUT_MS,
          signal: expect.any(AbortSignal),
        })
      );
    });

    it("should return handler response - once", async () => {
      const handler = vi.fn().mockResolvedValue("once");
      service.setHandler(handler);
      const info = createTestInfo();

      const result = await service.askPermission(info);

      expect(result.response).toBe("once");
      expect(result.timedOut).toBe(false);
    });

    it("should return handler response - always", async () => {
      const handler = vi.fn().mockResolvedValue("always");
      service.setHandler(handler);
      const info = createTestInfo();

      const result = await service.askPermission(info);

      expect(result.response).toBe("always");
      expect(result.timedOut).toBe(false);
    });

    it("should return handler response - reject", async () => {
      const handler = vi.fn().mockResolvedValue("reject");
      service.setHandler(handler);
      const info = createTestInfo();

      const result = await service.askPermission(info);

      expect(result.response).toBe("reject");
      expect(result.timedOut).toBe(false);
    });

    it("should reject when handler returns undefined", async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      service.setHandler(handler);
      const info = createTestInfo();

      const result = await service.askPermission(info);

      expect(result.response).toBe("reject");
      expect(result.timedOut).toBe(false);
    });

    it("should reject when handler throws error", async () => {
      const handler = vi.fn().mockRejectedValue(new Error("Handler error"));
      service.setHandler(handler);
      const info = createTestInfo();

      const result = await service.askPermission(info);

      expect(result.response).toBe("reject");
      expect(result.timedOut).toBe(false);
    });
  });

  // ============================================
  // askPermission - Timeout (EC-006)
  // ============================================

  describe("askPermission - timeout (EC-006)", () => {
    it("should default to deny after timeout", async () => {
      // Handler that never resolves
      const handler = vi.fn().mockImplementation(() => new Promise(() => {}));
      service.setHandler(handler);
      const info = createTestInfo();

      const resultPromise = service.askPermission(info);

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(DEFAULT_ASK_TIMEOUT_MS + 100);

      const result = await resultPromise;

      expect(result.response).toBe("reject");
      expect(result.timedOut).toBe(true);
    });

    it("should respect custom timeout", async () => {
      const customTimeout = 5000;
      const s = new PermissionAskService({ defaultTimeoutMs: customTimeout });
      const handler = vi.fn().mockImplementation(() => new Promise(() => {}));
      s.setHandler(handler);
      const info = createTestInfo();

      const resultPromise = s.askPermission(info);

      // Before timeout - should still be pending
      await vi.advanceTimersByTimeAsync(customTimeout - 100);

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;

      expect(result.response).toBe("reject");
      expect(result.timedOut).toBe(true);
    });

    it("should allow per-call timeout override", async () => {
      const handler = vi.fn().mockImplementation(() => new Promise(() => {}));
      service.setHandler(handler);
      const info = createTestInfo();

      const resultPromise = service.askPermission(info, { timeoutMs: 1000 });

      // Advance past custom timeout
      await vi.advanceTimersByTimeAsync(1100);

      const result = await resultPromise;

      expect(result.response).toBe("reject");
      expect(result.timedOut).toBe(true);
    });

    it("should not timeout if handler responds in time", async () => {
      const handler = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "once";
      });
      service.setHandler(handler);
      const info = createTestInfo();

      const resultPromise = service.askPermission(info);

      // Advance to allow handler to complete
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;

      expect(result.response).toBe("once");
      expect(result.timedOut).toBe(false);
    });

    it("should pass abort signal to handler", async () => {
      let receivedSignal: AbortSignal | undefined;
      const handler = vi.fn().mockImplementation(async (_info, ctx) => {
        receivedSignal = ctx.signal;
        return "once";
      });
      service.setHandler(handler);
      const info = createTestInfo();

      await service.askPermission(info);

      expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    it("should abort signal on timeout", async () => {
      let receivedSignal: AbortSignal | undefined;
      const handler = vi.fn().mockImplementation(async (_info, ctx) => {
        receivedSignal = ctx.signal;
        // Never resolves
        return new Promise(() => {});
      });
      service.setHandler(handler);
      const info = createTestInfo();

      const resultPromise = service.askPermission(info, { timeoutMs: 1000 });

      // Before timeout
      await vi.advanceTimersByTimeAsync(500);
      expect(receivedSignal?.aborted).toBe(false);

      // After timeout
      await vi.advanceTimersByTimeAsync(600);

      await resultPromise;

      expect(receivedSignal?.aborted).toBe(true);
    });
  });

  // ============================================
  // askPermission - Duration Tracking
  // ============================================

  describe("askPermission - duration tracking", () => {
    it("should track duration for immediate handler response", async () => {
      const handler = vi.fn().mockResolvedValue("once");
      service.setHandler(handler);
      const info = createTestInfo();

      const result = await service.askPermission(info);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should track duration for delayed handler response", async () => {
      const delay = 500;
      const handler = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return "once";
      });
      service.setHandler(handler);
      const info = createTestInfo();

      const resultPromise = service.askPermission(info);
      await vi.advanceTimersByTimeAsync(delay + 100);

      const result = await resultPromise;

      expect(result.durationMs).toBeGreaterThanOrEqual(delay);
    });

    it("should track duration for timeout", async () => {
      const handler = vi.fn().mockImplementation(() => new Promise(() => {}));
      service.setHandler(handler);
      const info = createTestInfo();

      const resultPromise = service.askPermission(info, { timeoutMs: 1000 });
      await vi.advanceTimersByTimeAsync(1100);

      const result = await resultPromise;

      expect(result.durationMs).toBeGreaterThanOrEqual(1000);
    });
  });

  // ============================================
  // createPermissionAskService factory
  // ============================================

  describe("createPermissionAskService", () => {
    it("should create service with defaults", () => {
      const s = createPermissionAskService();
      expect(s).toBeInstanceOf(PermissionAskService);
      expect(s.defaultTimeoutMs).toBe(DEFAULT_ASK_TIMEOUT_MS);
    });

    it("should create service with custom options", () => {
      const handler: PermissionAskHandler = vi.fn();
      const s = createPermissionAskService({
        defaultTimeoutMs: 5000,
        handler,
      });
      expect(s.defaultTimeoutMs).toBe(5000);
      expect(s.hasHandler()).toBe(true);
    });
  });

  // ============================================
  // DEFAULT_ASK_TIMEOUT_MS
  // ============================================

  describe("DEFAULT_ASK_TIMEOUT_MS", () => {
    it("should be 30 seconds", () => {
      expect(DEFAULT_ASK_TIMEOUT_MS).toBe(30_000);
    });
  });
});
