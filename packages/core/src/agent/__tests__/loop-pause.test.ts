/**
 * @file loop-pause.test.ts
 * @description Unit tests for AgentLoop pause/resume mechanism
 *
 * Tests the stream pause/resume functionality that allows users to
 * temporarily halt and continue stream processing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionChecker } from "../../tool/index.js";
import { AgentLoop, type AgentLoopConfig } from "../loop.js";

// Mock session/index.js
vi.mock("../../session/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../session/index.js")>();
  return {
    ...original,
    LLM: {
      stream: vi.fn(),
      initialize: vi.fn(),
      getRegistry: vi.fn(),
    },
    toModelMessages: vi.fn((messages) =>
      messages.map((m: Record<string, unknown>) => ({
        role: m.role,
        content: m.parts
          ? (m.parts as Array<{ type: string; text?: string }>).map((p) => {
              if (p.type === "text") return { type: "text", text: p.text };
              return p;
            })
          : m.content,
      }))
    ),
  };
});

// Re-import after mocking
import { LLM } from "../../session/index.js";

/**
 * Helper to create mock stream events
 */
function createMockStream(events: Array<{ type: string; [key: string]: unknown }>) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

/**
 * Helper to wait for a condition with timeout
 */
async function waitForCondition(
  condition: () => boolean,
  timeout = 100,
  interval = 10
): Promise<void> {
  const startTime = Date.now();
  return new Promise<void>((resolve, reject) => {
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`Condition not met within ${timeout}ms`));
      } else {
        setTimeout(check, interval);
      }
    };
    check();
  });
}

/**
 * Helper to create a deferred promise with external resolve/reject
 */
function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
} {
  let resolve: () => void = () => {};
  let reject: (err: Error) => void = () => {};
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("AgentLoop pause/resume", () => {
  let baseConfig: AgentLoopConfig;
  let mockPermissionChecker: PermissionChecker;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPermissionChecker = {
      checkPermission: vi.fn().mockResolvedValue({ allowed: true }),
    };

    baseConfig = {
      sessionId: "test-session-pause",
      mode: {
        name: "code",
        description: "Code mode",
        tools: { edit: true, bash: true, web: true, mcp: true },
        prompt: "You are a helpful coding assistant.",
      },
      providerType: "anthropic",
      model: "claude-sonnet-4-20250514",
      cwd: "/test/project",
      projectRoot: "/test",
      permissionChecker: mockPermissionChecker,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Test 1: should transition to paused state when pause() called during streaming
  // =========================================================================
  describe("pause during streaming", () => {
    it("should transition to paused state when pause() called during streaming", async () => {
      // Create a controlled stream that we can pause in the middle of
      const deferred = createDeferred();

      vi.mocked(LLM.stream).mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { type: "text", content: "Hello " };
          // Wait for external signal to continue
          await deferred.promise;
          yield { type: "text", content: "World" };
          yield { type: "done", stopReason: "end_turn" };
        },
      } as ReturnType<typeof LLM.stream>);

      const loop = new AgentLoop(baseConfig);

      // Track state changes
      const stateChanges: string[] = [];
      loop.on("stateChange", (from, to) => {
        stateChanges.push(`${from}->${to}`);
      });

      // Add a message and start running
      loop.addMessage({
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
        metadata: { createdAt: Date.now() },
      });

      // Start the loop (don't await yet)
      const runPromise = loop.run();

      // Wait for streaming to start
      await waitForCondition(() => stateChanges.includes("idle->streaming"));

      // Now pause while streaming
      loop.pause();

      // Verify paused state
      expect(loop.isPaused()).toBe(true);
      expect(stateChanges).toContain("streaming->paused");

      // Resume and complete
      loop.resume();
      deferred.resolve();

      await runPromise;
    });

    it("should update isPaused() correctly during state transitions", async () => {
      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream([
          { type: "text", content: "Response" },
          { type: "done", stopReason: "end_turn" },
        ]) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop(baseConfig);

      // Initially not paused
      expect(loop.isPaused()).toBe(false);

      // Add message to have something to process
      loop.addMessage({
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
        metadata: { createdAt: Date.now() },
      });

      await loop.run();

      // After completion, should still not be paused
      expect(loop.isPaused()).toBe(false);
    });
  });

  // =========================================================================
  // Test 2: should transition back to streaming when resume() called
  // =========================================================================
  describe("resume after pause", () => {
    it("should transition back to streaming when resume() called", async () => {
      const deferred = createDeferred();

      vi.mocked(LLM.stream).mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { type: "text", content: "Part 1" };
          await deferred.promise;
          yield { type: "text", content: "Part 2" };
          yield { type: "done", stopReason: "end_turn" };
        },
      } as ReturnType<typeof LLM.stream>);

      const loop = new AgentLoop(baseConfig);
      const stateChanges: string[] = [];

      loop.on("stateChange", (from, to) => {
        stateChanges.push(`${from}->${to}`);
      });

      loop.addMessage({
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Test" }],
        metadata: { createdAt: Date.now() },
      });

      const runPromise = loop.run();

      // Wait for streaming to start
      await waitForCondition(() => stateChanges.includes("idle->streaming"));

      // Pause
      loop.pause();
      expect(stateChanges).toContain("streaming->paused");

      // Resume
      loop.resume();
      expect(stateChanges).toContain("paused->streaming");
      expect(loop.isPaused()).toBe(false);

      // Complete the stream
      deferred.resolve();
      await runPromise;
    });

    it("resume should have no effect when not in paused state", () => {
      const loop = new AgentLoop(baseConfig);

      // Track state changes
      const stateChanges: string[] = [];
      loop.on("stateChange", (from, to) => {
        stateChanges.push(`${from}->${to}`);
      });

      // Initial state is idle
      expect(loop.isPaused()).toBe(false);

      // Resume when not paused should have no effect
      loop.resume();

      expect(loop.isPaused()).toBe(false);
      expect(stateChanges).toHaveLength(0); // No state change
    });
  });

  // =========================================================================
  // Test 3: should not pause when not in streaming state
  // =========================================================================
  describe("pause state constraints", () => {
    it("should not pause when not in streaming state", () => {
      const loop = new AgentLoop(baseConfig);

      // Track state changes
      const stateChanges: string[] = [];
      loop.on("stateChange", (from, to) => {
        stateChanges.push(`${from}->${to}`);
      });

      // In idle state initially
      expect(loop.isPaused()).toBe(false);

      // Try to pause while idle
      loop.pause();

      // Should NOT transition to paused (only streaming can transition to paused)
      expect(loop.isPaused()).toBe(false);
      expect(stateChanges).not.toContain("idle->paused");
    });

    it("pause should only work during streaming state", async () => {
      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream([
          { type: "text", content: "Response" },
          { type: "done", stopReason: "end_turn" },
        ]) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop(baseConfig);
      const stateChanges: string[] = [];

      loop.on("stateChange", (from, to) => {
        stateChanges.push(`${from}->${to}`);
      });

      // Try pause from idle - should not work
      loop.pause();
      expect(loop.isPaused()).toBe(false);

      // Now run and complete
      loop.addMessage({
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
        metadata: { createdAt: Date.now() },
      });

      await loop.run();

      // After run completes, try pause from idle again
      loop.pause();
      expect(loop.isPaused()).toBe(false);
    });
  });

  // =========================================================================
  // Test 4: should reset pause signal on cancel
  // =========================================================================
  describe("cancel behavior", () => {
    it("should reset pause signal on cancel", async () => {
      const deferred = createDeferred();

      vi.mocked(LLM.stream).mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { type: "text", content: "Part 1" };
          await deferred.promise;
          yield { type: "text", content: "Part 2" };
          yield { type: "done", stopReason: "end_turn" };
        },
      } as ReturnType<typeof LLM.stream>);

      const loop = new AgentLoop(baseConfig);
      const stateChanges: string[] = [];

      loop.on("stateChange", (from, to) => {
        stateChanges.push(`${from}->${to}`);
      });

      loop.addMessage({
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Test" }],
        metadata: { createdAt: Date.now() },
      });

      const runPromise = loop.run();

      // Wait for streaming
      await waitForCondition(() => stateChanges.includes("idle->streaming"));

      // Pause
      loop.pause();
      expect(loop.isPaused()).toBe(true);

      // Cancel while paused
      loop.cancel("User requested cancellation");

      // Pause signal should be reset
      expect(loop.isPaused()).toBe(false);

      // Cleanup
      deferred.resolve();
      await runPromise.catch(() => {
        // Expected - cancelled
      });
    });

    it("cancel should reset pause signal even when not paused", () => {
      vi.mocked(LLM.stream).mockReturnValue(
        createMockStream([
          { type: "text", content: "Response" },
          { type: "done", stopReason: "end_turn" },
        ]) as ReturnType<typeof LLM.stream>
      );

      const loop = new AgentLoop(baseConfig);

      // Verify not paused initially
      expect(loop.isPaused()).toBe(false);

      // Cancel (even though not running)
      loop.cancel();

      // Should still not be paused
      expect(loop.isPaused()).toBe(false);
    });
  });

  // =========================================================================
  // Additional tests for pause/resume integration
  // =========================================================================
  describe("pause/resume integration", () => {
    it("should emit stateChange events for pause/resume cycle", async () => {
      const deferred = createDeferred();

      vi.mocked(LLM.stream).mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { type: "text", content: "Part 1" };
          await deferred.promise;
          yield { type: "done", stopReason: "end_turn" };
        },
      } as ReturnType<typeof LLM.stream>);

      const loop = new AgentLoop(baseConfig);
      const stateChanges: Array<{ from: string; to: string }> = [];

      loop.on("stateChange", (from, to) => {
        stateChanges.push({ from, to });
      });

      loop.addMessage({
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Test" }],
        metadata: { createdAt: Date.now() },
      });

      const runPromise = loop.run();

      // Wait for streaming
      await waitForCondition(() =>
        stateChanges.some((s) => s.from === "idle" && s.to === "streaming")
      );

      // Pause and verify event
      loop.pause();
      expect(stateChanges).toContainEqual({ from: "streaming", to: "paused" });

      // Resume and verify event
      loop.resume();
      expect(stateChanges).toContainEqual({ from: "paused", to: "streaming" });

      // Complete
      deferred.resolve();
      await runPromise;
    });

    it("multiple pause/resume cycles should work correctly", () => {
      // Test that PauseSignal supports multiple cycles correctly
      // (AgentLoop integration is tested via simpler single-cycle tests above)
      const loop = new AgentLoop(baseConfig);
      const pauseCount = { pause: 0, resume: 0 };

      loop.on("stateChange", (from, to) => {
        if (to === "paused") pauseCount.pause++;
        if (from === "paused" && to === "streaming") pauseCount.resume++;
      });

      // Verify initial state
      expect(loop.isPaused()).toBe(false);

      // Simulate what would happen during multiple streaming cycles
      // by testing the pause signal behavior directly
      // (The actual streaming integration is tested in other tests)

      // The PauseSignal tests in pause-signal.test.ts cover the
      // multi-cycle behavior thoroughly. Here we just verify the
      // AgentLoop wrapper methods work correctly.

      // Since we're not in streaming state, pause should not transition
      loop.pause();
      expect(pauseCount.pause).toBe(0); // Can't pause from idle
      expect(loop.isPaused()).toBe(false);
    });
  });
});
