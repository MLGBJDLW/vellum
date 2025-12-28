import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentLoop } from "../loop.js";
import type { ModeConfig } from "../modes.js";
import { GracefulShutdownHandler, registerShutdownHandler } from "../shutdown.js";
import type { AgentState, StateContext } from "../state.js";
import { MemoryStatePersister } from "../state-persister.js";
import type { TerminationContext } from "../termination.js";

describe("Graceful Shutdown Handler (T024)", () => {
  let signalHandlers: Map<string, NodeJS.SignalsListener>;
  let mockAgentLoop: MockAgentLoop;
  let persister: MemoryStatePersister;
  let handler: GracefulShutdownHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    signalHandlers = new Map();

    // Mock process.on/off
    vi.spyOn(process, "on").mockImplementation((event, listener) => {
      signalHandlers.set(String(event), listener as NodeJS.SignalsListener);
      return process;
    });

    vi.spyOn(process, "off").mockImplementation((event) => {
      signalHandlers.delete(String(event));
      return process;
    });

    // Mock process.exit
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    mockAgentLoop = createMockAgentLoop();
    persister = new MemoryStatePersister();
    handler = new GracefulShutdownHandler({ exitProcess: false });
  });

  afterEach(() => {
    handler.unregister();
    vi.restoreAllMocks();
  });

  describe("register", () => {
    it("registers signal handlers for SIGINT, SIGTERM, SIGQUIT", () => {
      handler.register(mockAgentLoop as unknown as AgentLoop, persister);

      expect(signalHandlers.has("SIGINT")).toBe(true);
      expect(signalHandlers.has("SIGTERM")).toBe(true);
      expect(signalHandlers.has("SIGQUIT")).toBe(true);
    });

    it("unregisters previous handlers when called again", () => {
      handler.register(mockAgentLoop as unknown as AgentLoop, persister);
      const oldHandler = signalHandlers.get("SIGINT");

      handler.register(mockAgentLoop as unknown as AgentLoop, persister);
      const newHandler = signalHandlers.get("SIGINT");

      expect(oldHandler).not.toBe(newHandler);
    });
  });

  describe("unregister", () => {
    it("removes all signal handlers", () => {
      handler.register(mockAgentLoop as unknown as AgentLoop, persister);
      expect(signalHandlers.size).toBe(3);

      handler.unregister();

      expect(signalHandlers.size).toBe(0);
    });

    it("resets internal state", () => {
      handler.register(mockAgentLoop as unknown as AgentLoop, persister);
      handler.unregister();

      expect(handler.isInShutdown()).toBe(false);
    });
  });

  describe("shutdown", () => {
    it("cancels agent loop and saves state", async () => {
      handler.register(mockAgentLoop as unknown as AgentLoop, persister);

      const result = await handler.shutdown("SIGINT");

      expect(mockAgentLoop.cancel).toHaveBeenCalledWith("Received SIGINT");
      expect(result.success).toBe(true);
      expect(result.stateSaved).toBe(true);
      expect(result.exitCode).toBe(0);

      const saved = await persister.load("test-session");
      expect(saved).not.toBeNull();
      expect(saved?.state).toBe("idle");
    });

    it("returns error if not registered", async () => {
      const result = await handler.shutdown("SIGINT");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.exitCode).toBe(1);
    });

    it("handles save failure gracefully", async () => {
      const failingPersister: MemoryStatePersister = {
        ...persister,
        save: vi.fn().mockRejectedValue(new Error("Save failed")),
      } as unknown as MemoryStatePersister;

      handler.register(mockAgentLoop as unknown as AgentLoop, failingPersister);

      const result = await handler.shutdown("SIGINT");

      expect(result.success).toBe(false);
      expect(result.stateSaved).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it("respects saveTimeoutMs", async () => {
      vi.useFakeTimers();

      const slowPersister: MemoryStatePersister = {
        ...persister,
        save: vi.fn().mockImplementation(() => new Promise(() => {})), // Never resolves
      } as unknown as MemoryStatePersister;

      const timeoutHandler = new GracefulShutdownHandler({
        saveTimeoutMs: 100,
        exitProcess: false,
      });
      timeoutHandler.register(mockAgentLoop as unknown as AgentLoop, slowPersister);

      const resultPromise = timeoutHandler.shutdown("SIGTERM");

      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;

      expect(result.stateSaved).toBe(false);
      expect(result.success).toBe(false); // Save failed, so not successful
      expect(result.exitCode).toBe(1);

      vi.useRealTimers();
      timeoutHandler.unregister();
    });
  });

  describe("signal handling", () => {
    it("handles SIGINT", async () => {
      const onShutdownStart = vi.fn();
      handler = new GracefulShutdownHandler({
        exitProcess: false,
        onShutdownStart,
      });
      handler.register(mockAgentLoop as unknown as AgentLoop, persister);

      const sigintHandler = signalHandlers.get("SIGINT");
      await sigintHandler?.("SIGINT");

      expect(onShutdownStart).toHaveBeenCalledWith("SIGINT");
    });

    it("handles SIGTERM", async () => {
      const onShutdownStart = vi.fn();
      handler = new GracefulShutdownHandler({
        exitProcess: false,
        onShutdownStart,
      });
      handler.register(mockAgentLoop as unknown as AgentLoop, persister);

      const sigtermHandler = signalHandlers.get("SIGTERM");
      await sigtermHandler?.("SIGTERM");

      expect(onShutdownStart).toHaveBeenCalledWith("SIGTERM");
    });

    it("handles SIGQUIT", async () => {
      const onShutdownStart = vi.fn();
      handler = new GracefulShutdownHandler({
        exitProcess: false,
        onShutdownStart,
      });
      handler.register(mockAgentLoop as unknown as AgentLoop, persister);

      const sigquitHandler = signalHandlers.get("SIGQUIT");
      await sigquitHandler?.("SIGQUIT");

      expect(onShutdownStart).toHaveBeenCalledWith("SIGQUIT");
    });

    it("prevents multiple shutdown attempts", async () => {
      handler.register(mockAgentLoop as unknown as AgentLoop, persister);

      // Trigger shutdown twice rapidly
      const sigintHandler = signalHandlers.get("SIGINT");
      const promise1 = sigintHandler?.("SIGINT");
      const promise2 = sigintHandler?.("SIGINT");

      await Promise.all([promise1, promise2]);

      // Should only cancel once
      expect(mockAgentLoop.cancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("callbacks", () => {
    it("calls onStateSaved callback", async () => {
      const onStateSaved = vi.fn();
      handler = new GracefulShutdownHandler({
        exitProcess: false,
        onStateSaved,
      });
      handler.register(mockAgentLoop as unknown as AgentLoop, persister);

      await handler.shutdown("SIGINT");

      expect(onStateSaved).toHaveBeenCalledWith("test-session");
    });

    it("calls onShutdownError callback on failure", async () => {
      const onShutdownError = vi.fn();
      const failingPersister: MemoryStatePersister = {
        ...persister,
        save: vi.fn().mockRejectedValue(new Error("Disk full")),
      } as unknown as MemoryStatePersister;

      handler = new GracefulShutdownHandler({
        exitProcess: false,
        onShutdownError,
      });
      handler.register(mockAgentLoop as unknown as AgentLoop, failingPersister);

      await handler.shutdown("SIGINT");

      expect(onShutdownError).toHaveBeenCalled();
    });

    it("calls onShutdownComplete callback with exit code", async () => {
      const onShutdownComplete = vi.fn();
      handler = new GracefulShutdownHandler({
        exitProcess: false,
        onShutdownComplete,
      });
      handler.register(mockAgentLoop as unknown as AgentLoop, persister);

      const sigintHandler = signalHandlers.get("SIGINT");
      sigintHandler?.("SIGINT");
      // Wait for async operations to complete
      await vi.waitFor(() => {
        expect(onShutdownComplete).toHaveBeenCalledWith(0);
      });
    });
  });

  describe("process.exit", () => {
    it("exits process when exitProcess is true", async () => {
      handler = new GracefulShutdownHandler({ exitProcess: true });
      handler.register(mockAgentLoop as unknown as AgentLoop, persister);

      const sigintHandler = signalHandlers.get("SIGINT");
      sigintHandler?.("SIGINT");
      // Wait for async operations to complete
      await vi.waitFor(() => {
        expect(process.exit).toHaveBeenCalledWith(0);
      });
    });

    it("does not exit process when exitProcess is false", async () => {
      handler = new GracefulShutdownHandler({ exitProcess: false });
      handler.register(mockAgentLoop as unknown as AgentLoop, persister);

      const sigintHandler = signalHandlers.get("SIGINT");
      await sigintHandler?.("SIGINT");

      expect(process.exit).not.toHaveBeenCalled();
    });
  });

  describe("isInShutdown", () => {
    it("returns false before shutdown", () => {
      handler.register(mockAgentLoop as unknown as AgentLoop, persister);
      expect(handler.isInShutdown()).toBe(false);
    });

    it("returns true during shutdown", async () => {
      handler.register(mockAgentLoop as unknown as AgentLoop, persister);

      // Start shutdown but don't await
      const shutdownPromise = handler.shutdown("SIGINT");

      expect(handler.isInShutdown()).toBe(true);

      await shutdownPromise;
    });
  });

  describe("getSaveTimeoutMs", () => {
    it("returns default timeout", () => {
      expect(handler.getSaveTimeoutMs()).toBe(5000);
    });

    it("returns custom timeout", () => {
      const customHandler = new GracefulShutdownHandler({ saveTimeoutMs: 10000 });
      expect(customHandler.getSaveTimeoutMs()).toBe(10000);
    });
  });

  describe("registerShutdownHandler", () => {
    it("creates and registers handler", () => {
      const newHandler = registerShutdownHandler(mockAgentLoop as unknown as AgentLoop, persister, {
        exitProcess: false,
      });

      expect(signalHandlers.has("SIGINT")).toBe(true);

      newHandler.unregister();
    });
  });
});

// Mock types
interface MockAgentLoop {
  getConfig: () => {
    sessionId: string;
    cwd: string;
    projectRoot?: string;
    providerType: string;
    model: string;
    mode: ModeConfig;
  };
  getState: () => AgentState;
  getContext: () => StateContext;
  getMessages: () => [];
  getTerminationContext: () => TerminationContext;
  cancel: ReturnType<typeof vi.fn>;
}

function createMockAgentLoop(): MockAgentLoop {
  return {
    getConfig: () => ({
      sessionId: "test-session",
      cwd: "/test/cwd",
      projectRoot: "/test",
      providerType: "anthropic",
      model: "claude-3-opus",
      mode: {
        name: "code",
        description: "Test mode",
        tools: { edit: false, bash: false },
        prompt: "",
      },
    }),
    getState: () => "idle" as AgentState,
    getContext: () => ({
      sessionId: "test-session",
      messageId: "msg-1",
      attempt: 0,
      enteredAt: Date.now(),
      metadata: {},
    }),
    getMessages: () => [],
    getTerminationContext: () => ({
      stepCount: 0,
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      startTime: Date.now(),
      hasTextOnly: false,
      hasNaturalStop: false,
      recentToolCalls: [],
      recentResponses: [],
      isCancelled: false,
    }),
    cancel: vi.fn(),
  };
}
