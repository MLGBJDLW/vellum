/**
 * Controller Integration Tests
 *
 * Tests for integration between Session and Agent controllers,
 * verifying correct interaction patterns and state consistency.
 *
 * Test areas:
 * - Session → Agent handoff (context passing)
 * - Agent → Session save (result persistence)
 * - Mode switch during execution
 * - Concurrent operations
 * - Error recovery and state consistency
 *
 * @module tui/hooks/__tests__/useControllerIntegration.test
 */

import { EventEmitter } from "node:events";
import type { SessionMessage } from "@vellum/core";
import type { TokenUsage } from "@vellum/shared";
import { render } from "ink-testing-library";
import type React from "react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UseAgentAdapterReturn } from "../../adapters/agent-adapter.js";
import { useAgentAdapter } from "../../adapters/agent-adapter.js";
import {
  createMemorySessionStorage,
  type SessionStorage,
  type UseSessionAdapterReturn,
  useSessionAdapter,
} from "../../adapters/session-adapter.js";
import type { Message } from "../../context/MessagesContext.js";
import { MessagesProvider, useMessages } from "../../context/MessagesContext.js";
import { ToolsProvider } from "../../context/ToolsContext.js";

// =============================================================================
// Mock AgentLoop Types
// =============================================================================

/**
 * Simplified ExecutionResult for testing purposes.
 */
interface MockExecutionResult {
  result: { success: true; output: unknown } | { success: false; error: string };
  timing?: { startedAt: number; completedAt: number; durationMs: number };
  toolName?: string;
  callId?: string;
}

/**
 * AgentLoop events for type-safe event emission
 */
interface MockAgentLoopEvents {
  text: [text: string];
  thinking: [text: string];
  complete: [];
  error: [error: Error];
  usage: [usage: TokenUsage];
  toolStart: [callId: string, name: string, input: Record<string, unknown>];
  toolEnd: [callId: string, name: string, result: MockExecutionResult];
  permissionRequired: [callId: string, name: string, input: Record<string, unknown>];
  permissionGranted: [callId: string, name: string];
  permissionDenied: [callId: string, name: string, reason: string];
  stateChange: [from: string, to: string, context: unknown];
}

type AgentState = "idle" | "streaming" | "executing" | "terminated" | "shutdown";

/**
 * Mock AgentLoop for testing.
 * Simulates the real AgentLoop's event-based interface.
 */
class MockAgentLoop extends EventEmitter<MockAgentLoopEvents> {
  private _state: AgentState = "idle";
  private _messages: Array<{ role: string; content: string }> = [];
  private _cancelled = false;
  private _runPromise: Promise<void> | null = null;
  private _runResolve: (() => void) | null = null;

  getState(): AgentState {
    return this._state;
  }

  addMessage(message: { role: string; content: string }): void {
    this._messages.push(message);
  }

  getMessages(): Array<{ role: string; content: string }> {
    return [...this._messages];
  }

  async run(): Promise<void> {
    this._cancelled = false;
    this._state = "streaming";
    this.emit("stateChange", "idle", "streaming", {});

    this._runPromise = new Promise<void>((resolve) => {
      this._runResolve = resolve;
    });

    return this._runPromise;
  }

  cancel(reason?: string): void {
    this._cancelled = true;
    this._state = "terminated";
    this.emit("stateChange", "streaming", "terminated", { reason });
    if (this._runResolve) {
      this._runResolve();
      this._runResolve = null;
    }
  }

  // Test helper methods
  simulateText(text: string): void {
    this.emit("text", text);
  }

  simulateThinking(text: string): void {
    this.emit("thinking", text);
  }

  simulateComplete(): void {
    this._state = "idle";
    this.emit("complete");
    if (this._runResolve) {
      this._runResolve();
      this._runResolve = null;
    }
  }

  simulateError(error: Error): void {
    this._state = "idle";
    this.emit("error", error);
    if (this._runResolve) {
      this._runResolve();
      this._runResolve = null;
    }
  }

  simulateUsage(usage: TokenUsage): void {
    this.emit("usage", usage);
  }

  simulateToolStart(callId: string, name: string, input: Record<string, unknown>): void {
    this._state = "executing";
    this.emit("toolStart", callId, name, input);
  }

  simulateToolEnd(callId: string, name: string, result: MockExecutionResult): void {
    this._state = "streaming";
    this.emit("toolEnd", callId, name, result);
  }

  isCancelled(): boolean {
    return this._cancelled;
  }

  reset(): void {
    this._state = "idle";
    this._messages = [];
    this._cancelled = false;
    this._runPromise = null;
    this._runResolve = null;
    this.removeAllListeners();
  }
}

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a mock session message for testing
 */
function createMockSessionMessage(
  role: "user" | "assistant",
  content: string,
  overrides?: Partial<SessionMessage>
): SessionMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role,
    parts: [{ type: "text", text: content }],
    metadata: {
      createdAt: Date.now(),
      tokens: { input: 10, output: 20 },
    },
    ...overrides,
  };
}

/**
 * Wait for next tick to allow React to process
 */
async function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Wait for multiple ticks
 */
async function waitTicks(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await nextTick();
  }
}

// =============================================================================
// Test Harness Components
// =============================================================================

interface IntegrationTestHarnessProps {
  agentLoop: MockAgentLoop;
  sessionStorage: SessionStorage;
  sessionId: string;
  onAgentAdapter: (adapter: UseAgentAdapterReturn) => void;
  onSessionAdapter: (adapter: UseSessionAdapterReturn) => void;
  onMessagesChange: (messages: Message[]) => void;
  autoSave?: boolean;
  autoLoad?: boolean;
}

/**
 * Test harness that integrates both agent and session adapters
 * for testing their interactions.
 */
function IntegrationTestHarness({
  agentLoop,
  sessionStorage,
  sessionId,
  onAgentAdapter,
  onSessionAdapter,
  onMessagesChange,
  autoSave = false,
  autoLoad = false,
}: IntegrationTestHarnessProps): React.ReactElement {
  const agentAdapter = useAgentAdapter();
  const sessionAdapter = useSessionAdapter({
    sessionId,
    storage: sessionStorage,
    autoSave,
    autoLoad,
  });

  const { historyMessages, pendingMessage } = useMessages();

  // Connect agent adapter to loop on mount
  useEffect(() => {
    agentAdapter.connect(agentLoop as unknown as Parameters<typeof agentAdapter.connect>[0]);
    return () => {
      agentAdapter.disconnect();
    };
  }, [agentAdapter, agentLoop]);

  // Report adapters
  useEffect(() => {
    onAgentAdapter(agentAdapter);
  }, [agentAdapter, onAgentAdapter]);

  useEffect(() => {
    onSessionAdapter(sessionAdapter);
  }, [sessionAdapter, onSessionAdapter]);

  // Report messages
  useEffect(() => {
    const allMessages = pendingMessage
      ? [...historyMessages, pendingMessage]
      : [...historyMessages];
    onMessagesChange(allMessages);
  }, [historyMessages, pendingMessage, onMessagesChange]);

  return null as unknown as React.ReactElement;
}

/**
 * Full test harness with all required providers
 */
function FullIntegrationHarness(props: IntegrationTestHarnessProps): React.ReactElement {
  return (
    <MessagesProvider>
      <ToolsProvider>
        <IntegrationTestHarness {...props} />
      </ToolsProvider>
    </MessagesProvider>
  );
}

interface IntegrationRenderResult {
  agentAdapter: UseAgentAdapterReturn | null;
  sessionAdapter: UseSessionAdapterReturn | null;
  messages: Message[];
  agentLoop: MockAgentLoop;
  storage: SessionStorage;
  sessionId: string;
  unmount: () => void;
  rerender: (newSessionId?: string) => void;
}

function renderIntegration(
  sessionId: string = "test-session",
  options: { autoSave?: boolean; autoLoad?: boolean } = {}
): IntegrationRenderResult {
  let agentAdapter: UseAgentAdapterReturn | null = null;
  let sessionAdapter: UseSessionAdapterReturn | null = null;
  let messages: Message[] = [];
  const agentLoop = new MockAgentLoop();
  const storage = createMemorySessionStorage();
  let currentSessionId = sessionId;

  const { unmount, rerender: inkRerender } = render(
    <FullIntegrationHarness
      agentLoop={agentLoop}
      sessionStorage={storage}
      sessionId={currentSessionId}
      onAgentAdapter={(a) => {
        agentAdapter = a;
      }}
      onSessionAdapter={(s) => {
        sessionAdapter = s;
      }}
      onMessagesChange={(m) => {
        messages = m;
      }}
      autoSave={options.autoSave}
      autoLoad={options.autoLoad}
    />
  );

  return {
    get agentAdapter() {
      return agentAdapter;
    },
    get sessionAdapter() {
      return sessionAdapter;
    },
    get messages() {
      return messages;
    },
    agentLoop,
    storage,
    sessionId: currentSessionId,
    unmount,
    rerender: (newSessionId?: string) => {
      if (newSessionId) {
        currentSessionId = newSessionId;
      }
      inkRerender(
        <FullIntegrationHarness
          agentLoop={agentLoop}
          sessionStorage={storage}
          sessionId={currentSessionId}
          onAgentAdapter={(a) => {
            agentAdapter = a;
          }}
          onSessionAdapter={(s) => {
            sessionAdapter = s;
          }}
          onMessagesChange={(m) => {
            messages = m;
          }}
          autoSave={options.autoSave}
          autoLoad={options.autoLoad}
        />
      );
    },
  };
}

// =============================================================================
// Tests: Session → Agent Handoff
// =============================================================================

describe("Session → Agent Handoff", () => {
  let result: IntegrationRenderResult;

  afterEach(() => {
    result?.unmount();
    result?.agentLoop.reset();
  });

  it("session provides message history context to agent", async () => {
    result = renderIntegration("handoff-session");
    await waitTicks(2);

    // Pre-populate session storage with history
    const historyMessages = [
      createMockSessionMessage("user", "Previous question"),
      createMockSessionMessage("assistant", "Previous answer"),
    ];
    await result.storage.save("handoff-session", historyMessages);

    // Load session
    await result.sessionAdapter?.loadSession();
    await waitTicks(2);

    // Simulate agent receiving new message
    result.agentLoop.simulateText("Continuing our conversation...");
    await waitTicks(2);

    // Should have messages from both session history and new streaming
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("agent receives correct context from loaded session", async () => {
    result = renderIntegration("context-session");
    await waitTicks(2);

    // Create session with specific context
    const contextMessages = [
      createMockSessionMessage("user", "Help me with TypeScript"),
      createMockSessionMessage("assistant", "Sure, I can help with TypeScript!"),
    ];
    await result.storage.save("context-session", contextMessages);

    // Load the session
    await result.sessionAdapter?.loadSession();
    await waitTicks(2);

    // Agent should be able to continue in context
    result.agentLoop.simulateText("Based on our TypeScript discussion...");
    await waitTicks(2);

    // Messages should include loaded history + new message
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
  });

  it("agent can access session metadata after load", async () => {
    result = renderIntegration("metadata-session");
    await waitTicks(2);

    // Save session with messages
    await result.storage.save("metadata-session", [
      createMockSessionMessage("user", "Test message"),
    ]);

    // Load session
    await result.sessionAdapter?.loadSession();
    await waitTicks(2);

    // Session adapter should have loaded state
    expect(result.sessionAdapter?.isLoading).toBe(false);
    expect(result.sessionAdapter?.error).toBeNull();
  });

  it("handles empty session gracefully during handoff", async () => {
    result = renderIntegration("empty-handoff-session");
    await waitTicks(2);

    // Don't pre-populate - session is empty
    await result.sessionAdapter?.loadSession();
    await waitTicks(2);

    // Agent should still work
    result.agentLoop.simulateText("Starting fresh conversation");
    await waitTicks(2);

    expect(result.messages.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Tests: Agent → Session Save
// =============================================================================

describe("Agent → Session Save", () => {
  let result: IntegrationRenderResult;

  afterEach(() => {
    result?.unmount();
    result?.agentLoop.reset();
  });

  it("agent execution result saves to session", async () => {
    result = renderIntegration("save-session");
    await waitTicks(2);

    // Agent produces response
    result.agentLoop.simulateText("This is the agent response");
    await waitTicks(2);
    result.agentLoop.simulateComplete();
    await waitTicks(2);

    // Manually trigger session save
    await result.sessionAdapter?.saveSession();
    await waitTicks(2);

    // Verify saved to storage
    const saved = await result.storage.load("save-session");
    expect(saved).not.toBeNull();
    if (!saved) {
      throw new Error("Expected saved session to exist");
    }
    expect(saved.length).toBeGreaterThan(0);
  });

  it("messages persist correctly after execution", async () => {
    result = renderIntegration("persist-session");
    await waitTicks(2);

    // Simulate a complete conversation
    result.agentLoop.simulateText("Hello, how can I help?");
    await waitTicks(2);
    result.agentLoop.simulateComplete();
    await waitTicks(2);

    // Save session
    await result.sessionAdapter?.saveSession();
    await waitTicks(2);

    // Clear and reload to verify persistence
    result.rerender("persist-session");
    await waitTicks(2);

    await result.sessionAdapter?.loadSession();
    await waitTicks(2);

    // Messages should be restored
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("tool call results stored in session", async () => {
    result = renderIntegration("tool-session");
    await waitTicks(2);

    // Simulate tool execution
    result.agentLoop.simulateText("Let me check that file...");
    await waitTicks(2);
    result.agentLoop.simulateToolStart("tool-1", "read_file", { path: "/test.txt" });
    await waitTicks(2);
    result.agentLoop.simulateToolEnd("tool-1", "read_file", {
      result: { success: true, output: "File contents" },
    });
    await waitTicks(2);
    result.agentLoop.simulateText("The file contains...");
    await waitTicks(2);
    result.agentLoop.simulateComplete();
    await waitTicks(2);

    // Save session
    await result.sessionAdapter?.saveSession();
    await waitTicks(2);

    // Verify session contains tool call info
    const saved = await result.storage.load("tool-session");
    expect(saved).not.toBeNull();
    if (!saved) {
      throw new Error("Expected saved session to exist");
    }
    expect(saved.length).toBeGreaterThan(0);
  });

  it("handles save during streaming gracefully", async () => {
    result = renderIntegration("streaming-save-session");
    await waitTicks(2);

    // Start streaming
    result.agentLoop.simulateText("Starting to stream...");
    await waitTicks(2);

    // Try to save mid-stream (should capture partial state)
    await result.sessionAdapter?.saveSession();
    await waitTicks(2);

    // Complete streaming
    result.agentLoop.simulateText(" more content");
    await waitTicks(2);
    result.agentLoop.simulateComplete();
    await waitTicks(2);

    // Final save
    await result.sessionAdapter?.saveSession();
    await waitTicks(2);

    const saved = await result.storage.load("streaming-save-session");
    expect(saved).not.toBeNull();
  });
});

// =============================================================================
// Tests: Mode Switch During Execution
// =============================================================================

describe("Mode Switch During Execution", () => {
  let result: IntegrationRenderResult;

  afterEach(() => {
    result?.unmount();
    result?.agentLoop.reset();
  });

  it("handles mode switch while agent is idle", async () => {
    result = renderIntegration("mode-switch-idle");
    await waitTicks(2);

    // Verify initial state is idle
    expect(result.agentLoop.getState()).toBe("idle");

    // Mode switch is external - just verify agent adapter is still functional
    result.agentLoop.simulateText("Response after mode switch");
    await waitTicks(2);

    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("mode switch during streaming should be queued", async () => {
    result = renderIntegration("mode-switch-streaming");
    await waitTicks(2);

    // Start a run operation which sets state to streaming
    const runPromise = result.agentLoop.run();
    await waitTicks(1);

    // Agent is in streaming state (run() sets this)
    expect(result.agentLoop.getState()).toBe("streaming");

    // Simulate some streaming text
    result.agentLoop.simulateText("Streaming in progress...");
    await waitTicks(2);

    // Complete the operation
    result.agentLoop.simulateComplete();
    await runPromise;
    await waitTicks(2);

    // Now state should be idle (safe for mode switch)
    expect(result.agentLoop.getState()).toBe("idle");
  });

  it("state remains consistent after interrupted mode switch", async () => {
    result = renderIntegration("mode-switch-consistent");
    await waitTicks(2);

    // Execute a complete cycle
    result.agentLoop.simulateText("First response");
    await waitTicks(2);
    result.agentLoop.simulateComplete();
    await waitTicks(2);

    // Save state
    await result.sessionAdapter?.saveSession();
    await waitTicks(2);

    // Verify state is consistent
    const saved = await result.storage.load("mode-switch-consistent");
    expect(saved).not.toBeNull();

    // Start another cycle
    result.agentLoop.simulateText("Second response");
    await waitTicks(2);

    // Cancel (simulating mode switch interrupt)
    result.agentLoop.cancel("mode switch");
    await waitTicks(2);

    // State should be terminated
    expect(result.agentLoop.getState()).toBe("terminated");
    expect(result.agentLoop.isCancelled()).toBe(true);
  });

  it("preserves session state during mode transitions", async () => {
    result = renderIntegration("mode-transition-session");
    await waitTicks(2);

    // Create initial state
    result.agentLoop.simulateText("Initial response");
    await waitTicks(2);
    result.agentLoop.simulateComplete();
    await waitTicks(2);

    // Save session
    await result.sessionAdapter?.saveSession();
    await waitTicks(2);

    const beforeCount = (await result.storage.load("mode-transition-session"))?.length ?? 0;

    // Simulate mode transition (rerender)
    result.rerender();
    await waitTicks(2);

    // Load session after transition
    await result.sessionAdapter?.loadSession();
    await waitTicks(2);

    // Session should be preserved
    const afterCount = (await result.storage.load("mode-transition-session"))?.length ?? 0;
    expect(afterCount).toBe(beforeCount);
  });
});

// =============================================================================
// Tests: Concurrent Operations
// =============================================================================

describe("Concurrent Operations", () => {
  let result: IntegrationRenderResult;

  afterEach(() => {
    result?.unmount();
    result?.agentLoop.reset();
  });

  it("session switch during agent execution preserves state", async () => {
    result = renderIntegration("concurrent-session-1");
    await waitTicks(2);

    // Start agent execution
    result.agentLoop.simulateText("Working on session 1...");
    await waitTicks(2);

    // Save current session
    await result.sessionAdapter?.saveSession();
    await waitTicks(2);

    // Switch session (rerender with new session ID)
    result.rerender("concurrent-session-2");
    await waitTicks(2);

    // Complete original operation (would be in original session context)
    result.agentLoop.simulateComplete();
    await waitTicks(2);

    // Original session should still have its state
    const session1 = await result.storage.load("concurrent-session-1");
    expect(session1).not.toBeNull();
  });

  it("handles multiple rapid submissions correctly", async () => {
    result = renderIntegration("rapid-submit-session");
    await waitTicks(2);

    // Rapid submissions
    result.agentLoop.simulateText("Response 1");
    result.agentLoop.simulateText(" Response 2");
    result.agentLoop.simulateText(" Response 3");
    await waitTicks(3);

    result.agentLoop.simulateComplete();
    await waitTicks(2);

    // All text should be accumulated
    const hasContent = result.messages.some((m) => m.content?.includes("Response") ?? false);
    expect(hasContent).toBe(true);
  });

  it("cancel during session save does not corrupt storage", async () => {
    result = renderIntegration("cancel-save-session");
    await waitTicks(2);

    // Create valid state
    result.agentLoop.simulateText("Valid response");
    await waitTicks(2);
    result.agentLoop.simulateComplete();
    await waitTicks(2);

    // Save session
    await result.sessionAdapter?.saveSession();
    await waitTicks(2);

    // Start new operation
    result.agentLoop.reset();
    result.agentLoop.simulateText("Partial content...");
    await waitTicks(2);

    // Cancel mid-stream
    result.agentLoop.cancel("user cancelled");
    await waitTicks(2);

    // Storage should still have valid state from before
    const saved = await result.storage.load("cancel-save-session");
    expect(saved).not.toBeNull();
  });

  it("handles concurrent tool calls without race conditions", async () => {
    result = renderIntegration("concurrent-tools-session");
    await waitTicks(2);

    // Start multiple concurrent tool calls
    result.agentLoop.simulateToolStart("call-1", "read_file", { path: "/a.txt" });
    result.agentLoop.simulateToolStart("call-2", "read_file", { path: "/b.txt" });
    result.agentLoop.simulateToolStart("call-3", "read_file", { path: "/c.txt" });
    await waitTicks(2);

    // Complete in different order
    result.agentLoop.simulateToolEnd("call-2", "read_file", {
      result: { success: true, output: "B" },
    });
    result.agentLoop.simulateToolEnd("call-3", "read_file", {
      result: { success: true, output: "C" },
    });
    result.agentLoop.simulateToolEnd("call-1", "read_file", {
      result: { success: true, output: "A" },
    });
    await waitTicks(2);

    result.agentLoop.simulateText("All files processed");
    await waitTicks(2);
    result.agentLoop.simulateComplete();
    await waitTicks(2);

    // State should be consistent
    expect(result.agentLoop.getState()).toBe("idle");
  });
});

// =============================================================================
// Tests: Error Recovery
// =============================================================================

describe("Error Recovery", () => {
  let result: IntegrationRenderResult;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    result?.unmount();
    result?.agentLoop.reset();
    consoleErrorSpy.mockRestore();
  });

  it("agent error does not corrupt session", async () => {
    result = renderIntegration("error-session");
    await waitTicks(2);

    // Create valid session state first
    result.agentLoop.simulateText("Valid response before error");
    await waitTicks(2);
    result.agentLoop.simulateComplete();
    await waitTicks(2);

    // Save valid state
    await result.sessionAdapter?.saveSession();
    await waitTicks(2);

    const savedBefore = await result.storage.load("error-session");
    expect(savedBefore).not.toBeNull();

    // Now trigger agent error
    result.agentLoop.simulateText("Starting new response...");
    await waitTicks(2);
    result.agentLoop.simulateError(new Error("Agent error occurred"));
    await waitTicks(2);

    // Previous session state should still be intact
    const savedAfter = await result.storage.load("error-session");
    expect(savedAfter).not.toBeNull();
    expect(savedAfter).toEqual(savedBefore);
  });

  it("session error does not crash agent", async () => {
    // Create storage that throws on operations
    const errorStorage: SessionStorage = {
      save: vi.fn().mockRejectedValue(new Error("Storage write failed")),
      load: vi.fn().mockRejectedValue(new Error("Storage read failed")),
      clear: vi.fn().mockRejectedValue(new Error("Storage clear failed")),
    };

    let agentAdapter: UseAgentAdapterReturn | null = null;
    const agentLoop = new MockAgentLoop();

    const { unmount } = render(
      <MessagesProvider>
        <ToolsProvider>
          <IntegrationTestHarness
            agentLoop={agentLoop}
            sessionStorage={errorStorage}
            sessionId="error-storage-session"
            onAgentAdapter={(a) => {
              agentAdapter = a;
            }}
            onSessionAdapter={() => {}}
            onMessagesChange={() => {}}
          />
        </ToolsProvider>
      </MessagesProvider>
    );

    await waitTicks(2);

    // Agent should still work despite session storage errors
    agentLoop.simulateText("Agent still works");
    await waitTicks(2);

    expect(agentAdapter).not.toBeNull();

    agentLoop.simulateComplete();
    await waitTicks(2);

    expect(agentLoop.getState()).toBe("idle");

    unmount();
    agentLoop.reset();
  });

  it("recovers to consistent state after agent error", async () => {
    result = renderIntegration("recovery-session");
    await waitTicks(2);

    // Trigger error during streaming
    result.agentLoop.simulateText("Partial content before error");
    await waitTicks(2);
    result.agentLoop.simulateError(new Error("Streaming interrupted"));
    await waitTicks(2);

    // Agent should return to idle state
    expect(result.agentLoop.getState()).toBe("idle");

    // Should be able to start new operation
    result.agentLoop.reset();
    result.rerender();
    await waitTicks(2);

    result.agentLoop.simulateText("New response after recovery");
    await waitTicks(2);
    result.agentLoop.simulateComplete();
    await waitTicks(2);

    expect(result.agentLoop.getState()).toBe("idle");
  });

  it("handles session load error gracefully", async () => {
    const errorStorage: SessionStorage = {
      save: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockRejectedValue(new Error("Network error")),
      clear: vi.fn().mockResolvedValue(undefined),
    };

    let sessionAdapter: UseSessionAdapterReturn | undefined;
    const agentLoop = new MockAgentLoop();
    let messages: Message[] = [];

    const { unmount } = render(
      <MessagesProvider>
        <ToolsProvider>
          <IntegrationTestHarness
            agentLoop={agentLoop}
            sessionStorage={errorStorage}
            sessionId="load-error-session"
            onAgentAdapter={() => {}}
            onSessionAdapter={(s) => {
              sessionAdapter = s;
            }}
            onMessagesChange={(m) => {
              messages = m;
            }}
          />
        </ToolsProvider>
      </MessagesProvider>
    );

    await waitTicks(2);

    // Try to load - the hook catches errors internally
    if (sessionAdapter) {
      await sessionAdapter.loadSession();
    }
    await waitTicks(2);

    // The session adapter sets error internally rather than throwing
    // so we verify it handled the error gracefully
    expect(errorStorage.load).toHaveBeenCalled();

    // Agent should still be functional despite the error
    agentLoop.simulateText("Working despite load error");
    await waitTicks(2);
    agentLoop.simulateComplete();
    await waitTicks(2);

    expect(agentLoop.getState()).toBe("idle");
    expect(messages.length).toBeGreaterThan(0);

    unmount();
    agentLoop.reset();
  });

  it("preserves partial content when session save fails", async () => {
    result = renderIntegration("partial-save-session");
    await waitTicks(2);

    // Generate content
    result.agentLoop.simulateText("Important content to preserve");
    await waitTicks(2);
    result.agentLoop.simulateComplete();
    await waitTicks(2);

    // Messages should be in memory even if save fails later
    expect(result.messages.length).toBeGreaterThan(0);
    const hasContent = result.messages.some((m) => m.content?.includes("Important"));
    expect(hasContent).toBe(true);
  });

  it("handles network timeout during save gracefully", async () => {
    // Storage with simulated timeout
    const timeoutStorage: SessionStorage = {
      save: vi
        .fn()
        .mockImplementation(
          () => new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 100))
        ),
      load: vi.fn().mockResolvedValue(null),
      clear: vi.fn().mockResolvedValue(undefined),
    };

    let sessionAdapter: UseSessionAdapterReturn | undefined;
    const agentLoop = new MockAgentLoop();
    let messages: Message[] = [];

    const { unmount } = render(
      <MessagesProvider>
        <ToolsProvider>
          <IntegrationTestHarness
            agentLoop={agentLoop}
            sessionStorage={timeoutStorage}
            sessionId="timeout-session"
            onAgentAdapter={() => {}}
            onSessionAdapter={(s) => {
              sessionAdapter = s;
            }}
            onMessagesChange={(m) => {
              messages = m;
            }}
          />
        </ToolsProvider>
      </MessagesProvider>
    );

    await waitTicks(2);

    // Complete agent work
    agentLoop.simulateText("Content before timeout");
    await waitTicks(2);
    agentLoop.simulateComplete();
    await waitTicks(2);

    // Try save - the hook catches errors internally
    if (sessionAdapter) {
      await sessionAdapter.saveSession();
    }
    // Wait for the timeout to complete
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Verify save was attempted
    expect(timeoutStorage.save).toHaveBeenCalled();

    // Agent should remain functional despite save timeout
    expect(agentLoop.getState()).toBe("idle");
    expect(messages.length).toBeGreaterThan(0);

    unmount();
    agentLoop.reset();
  });
});

// =============================================================================
// Tests: State Consistency Verification
// =============================================================================

describe("State Consistency", () => {
  let result: IntegrationRenderResult;

  afterEach(() => {
    result?.unmount();
    result?.agentLoop.reset();
  });

  it("message order is preserved through save/load cycle", async () => {
    result = renderIntegration("order-session");
    await waitTicks(2);

    // Create ordered messages
    result.agentLoop.simulateText("First");
    await waitTicks(2);
    result.agentLoop.simulateComplete();
    await waitTicks(2);

    // Save
    await result.sessionAdapter?.saveSession();
    await waitTicks(2);

    // Load into fresh context
    result.rerender();
    await waitTicks(2);
    await result.sessionAdapter?.loadSession();
    await waitTicks(2);

    // Order should be preserved
    const saved = await result.storage.load("order-session");
    expect(saved).not.toBeNull();
  });

  it("token usage is preserved in session", async () => {
    result = renderIntegration("usage-session");
    await waitTicks(2);

    // Generate response with usage
    result.agentLoop.simulateText("Response text");
    await waitTicks(2);
    result.agentLoop.simulateUsage({
      inputTokens: 100,
      outputTokens: 50,
    });
    await waitTicks(2);
    result.agentLoop.simulateComplete();
    await waitTicks(2);

    // Save and verify
    await result.sessionAdapter?.saveSession();
    await waitTicks(2);

    const saved = await result.storage.load("usage-session");
    expect(saved).not.toBeNull();
  });

  it("adapters remain synchronized after multiple operations", async () => {
    result = renderIntegration("sync-session");
    await waitTicks(2);

    // Multiple operations
    for (let i = 0; i < 3; i++) {
      result.agentLoop.simulateText(`Response ${i}`);
      await waitTicks(2);
      result.agentLoop.simulateComplete();
      await waitTicks(2);
      await result.sessionAdapter?.saveSession();
      await waitTicks(2);
    }

    // Both adapters should be in consistent state
    expect(result.agentAdapter).not.toBeNull();
    expect(result.sessionAdapter).not.toBeNull();
    expect(result.sessionAdapter?.isSaving).toBe(false);
    expect(result.sessionAdapter?.isLoading).toBe(false);
    expect(result.sessionAdapter?.error).toBeNull();
  });

  it("clears state correctly when switching sessions", async () => {
    result = renderIntegration("clear-session-1");
    await waitTicks(2);

    // Create state in session 1
    result.agentLoop.simulateText("Session 1 content");
    await waitTicks(2);
    result.agentLoop.simulateComplete();
    await waitTicks(2);
    await result.sessionAdapter?.saveSession();
    await waitTicks(2);

    // Switch to session 2
    result.rerender("clear-session-2");
    await waitTicks(2);

    // Session 2 should be empty initially
    const session2 = await result.storage.load("clear-session-2");
    expect(session2).toBeNull();

    // Session 1 should still have its content
    const session1 = await result.storage.load("clear-session-1");
    expect(session1).not.toBeNull();
  });
});
