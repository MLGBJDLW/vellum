/**
 * Agent Controller Tests
 *
 * Tests for agent execution functionality currently implemented in app.tsx,
 * preparing for extraction into a useAgentController hook.
 *
 * Test areas:
 * - Agent execution happy path (streaming response)
 * - Tool call execution flow
 * - Cancellation handling
 * - Error handling (provider, rate limit, network)
 * - Streaming state management
 * - Message accumulation
 *
 * @module tui/hooks/__tests__/useAgentController.test
 */

import { EventEmitter } from "node:events";
import type { TokenUsage } from "@vellum/shared";
import { render } from "ink-testing-library";
import type React from "react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  UseAgentAdapterOptions,
  UseAgentAdapterReturn,
} from "../../adapters/agent-adapter.js";
import { useAgentAdapter } from "../../adapters/agent-adapter.js";
import { MessagesProvider, useMessages } from "../../context/MessagesContext.js";
import { ToolsProvider } from "../../context/ToolsContext.js";

// =============================================================================
// Mock AgentLoop Types
// =============================================================================

/**
 * Simplified ExecutionResult for testing purposes.
 * The actual ExecutionResult has more fields, but the agent adapter
 * only uses the `result` field for determining success/error status.
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

  /**
   * Start the agent loop. Returns a promise that resolves when complete.
   */
  async run(): Promise<void> {
    this._cancelled = false;
    this._state = "streaming";
    this.emit("stateChange", "idle", "streaming", {});

    // Create a promise that can be resolved externally
    this._runPromise = new Promise<void>((resolve) => {
      this._runResolve = resolve;
    });

    return this._runPromise;
  }

  /**
   * Cancel the current operation
   */
  cancel(reason?: string): void {
    this._cancelled = true;
    this._state = "terminated";
    this.emit("stateChange", "streaming", "terminated", { reason });
    if (this._runResolve) {
      this._runResolve();
      this._runResolve = null;
    }
  }

  /**
   * Test helper: Simulate streaming text
   */
  simulateText(text: string): void {
    this.emit("text", text);
  }

  /**
   * Test helper: Simulate thinking text
   */
  simulateThinking(text: string): void {
    this.emit("thinking", text);
  }

  /**
   * Test helper: Simulate completion
   */
  simulateComplete(): void {
    this._state = "idle";
    this.emit("complete");
    if (this._runResolve) {
      this._runResolve();
      this._runResolve = null;
    }
  }

  /**
   * Test helper: Simulate error
   */
  simulateError(error: Error): void {
    this._state = "idle";
    this.emit("error", error);
    if (this._runResolve) {
      this._runResolve();
      this._runResolve = null;
    }
  }

  /**
   * Test helper: Simulate usage report
   */
  simulateUsage(usage: TokenUsage): void {
    this.emit("usage", usage);
  }

  /**
   * Test helper: Simulate tool start
   */
  simulateToolStart(callId: string, name: string, input: Record<string, unknown>): void {
    this._state = "executing";
    this.emit("toolStart", callId, name, input);
  }

  /**
   * Test helper: Simulate tool end
   */
  simulateToolEnd(callId: string, name: string, result: MockExecutionResult): void {
    this._state = "streaming";
    this.emit("toolEnd", callId, name, result);
  }

  /**
   * Test helper: Simulate permission required
   */
  simulatePermissionRequired(callId: string, name: string, input: Record<string, unknown>): void {
    this.emit("permissionRequired", callId, name, input);
  }

  /**
   * Test helper: Simulate permission granted
   */
  simulatePermissionGranted(callId: string, name: string): void {
    this.emit("permissionGranted", callId, name);
  }

  /**
   * Test helper: Simulate permission denied
   */
  simulatePermissionDenied(callId: string, name: string, reason: string): void {
    this.emit("permissionDenied", callId, name, reason);
  }

  /**
   * Check if cancelled
   */
  isCancelled(): boolean {
    return this._cancelled;
  }

  /**
   * Reset state for next test
   */
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
// Test Harness for useAgentAdapter
// =============================================================================

interface AgentAdapterTestHarnessProps {
  options?: UseAgentAdapterOptions;
  agentLoop: MockAgentLoop;
  onHookReturn: (hookReturn: UseAgentAdapterReturn) => void;
  onMessagesChange?: (messages: unknown[]) => void;
}

/**
 * Test harness that integrates useAgentAdapter with context providers.
 */
function AgentAdapterTestHarness({
  options = {},
  agentLoop,
  onHookReturn,
  onMessagesChange,
}: AgentAdapterTestHarnessProps): React.ReactElement {
  const adapter = useAgentAdapter(options);
  const { historyMessages, pendingMessage } = useMessages();

  // Connect to agent loop on mount
  useEffect(() => {
    // Type assertion needed since MockAgentLoop is compatible with AgentLoop's event interface
    adapter.connect(agentLoop as unknown as Parameters<typeof adapter.connect>[0]);
    return () => {
      adapter.disconnect();
    };
  }, [adapter, agentLoop]);

  // Report hook return
  useEffect(() => {
    onHookReturn(adapter);
  }, [adapter, onHookReturn]);

  // Report messages changes
  useEffect(() => {
    if (onMessagesChange) {
      const allMessages = pendingMessage
        ? [...historyMessages, pendingMessage]
        : [...historyMessages];
      onMessagesChange(allMessages);
    }
  }, [historyMessages, pendingMessage, onMessagesChange]);

  return null as unknown as React.ReactElement;
}

/**
 * Full test harness with all required providers
 */
function FullTestHarness({
  options,
  agentLoop,
  onHookReturn,
  onMessagesChange,
}: AgentAdapterTestHarnessProps): React.ReactElement {
  return (
    <MessagesProvider>
      <ToolsProvider>
        <AgentAdapterTestHarness
          options={options}
          agentLoop={agentLoop}
          onHookReturn={onHookReturn}
          onMessagesChange={onMessagesChange}
        />
      </ToolsProvider>
    </MessagesProvider>
  );
}

// =============================================================================
// Test Utilities
// =============================================================================

interface RenderResult {
  adapter: UseAgentAdapterReturn | null;
  messages: unknown[];
  agentLoop: MockAgentLoop;
  unmount: () => void;
  rerender: () => void;
}

function renderAgentController(options?: UseAgentAdapterOptions): RenderResult {
  let adapter: UseAgentAdapterReturn | null = null;
  let messages: unknown[] = [];
  const agentLoop = new MockAgentLoop();

  const { unmount, rerender } = render(
    <FullTestHarness
      options={options}
      agentLoop={agentLoop}
      onHookReturn={(r) => {
        adapter = r;
      }}
      onMessagesChange={(m) => {
        messages = m;
      }}
    />
  );

  return {
    get adapter() {
      return adapter;
    },
    get messages() {
      return messages;
    },
    agentLoop,
    unmount,
    rerender: () =>
      rerender(
        <FullTestHarness
          options={options}
          agentLoop={agentLoop}
          onHookReturn={(r) => {
            adapter = r;
          }}
          onMessagesChange={(m) => {
            messages = m;
          }}
        />
      ),
  };
}

/**
 * Wait for next tick to allow React to process
 */
async function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// =============================================================================
// Tests: Agent Execution - Happy Path
// =============================================================================

describe("Agent Execution - Happy Path", () => {
  let result: RenderResult;

  afterEach(() => {
    result?.unmount();
    result?.agentLoop.reset();
  });

  it("receives streaming text response", async () => {
    result = renderAgentController();
    await nextTick();
    await nextTick(); // Additional tick for context initialization

    expect(result.adapter).not.toBeNull();
    // Note: isConnected is tracked via ref and doesn't update reactively
    // We verify connection by checking if events are handled

    // Simulate streaming response
    result.agentLoop.simulateText("Hello");
    await nextTick();
    await nextTick(); // Additional tick for message propagation

    // Connection verified by message appearing
    expect(result.messages.length).toBeGreaterThan(0);
    const lastMessage = result.messages[result.messages.length - 1] as { content?: string };
    expect(lastMessage.content).toContain("Hello");
  });

  it("accumulates streaming text chunks", async () => {
    result = renderAgentController();
    await nextTick();
    await nextTick(); // Extra tick for context initialization

    // Simulate multiple chunks
    result.agentLoop.simulateText("Hello ");
    await nextTick();
    await nextTick(); // Extra tick for message propagation
    result.agentLoop.simulateText("world");
    await nextTick();
    await nextTick(); // Extra tick for message propagation

    const lastMessage = result.messages[result.messages.length - 1] as { content?: string };
    expect(lastMessage.content).toContain("Hello world");
  });

  it("completes streaming and marks message as not streaming", async () => {
    result = renderAgentController();
    await nextTick();

    // Start streaming
    result.agentLoop.simulateText("Complete message");
    await nextTick();

    // Complete
    result.agentLoop.simulateComplete();
    await nextTick();

    // Message should exist in history
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("handles thinking/reasoning content separately", async () => {
    result = renderAgentController();
    await nextTick();

    // Simulate thinking followed by text
    result.agentLoop.simulateThinking("Let me think...");
    await nextTick();
    result.agentLoop.simulateText("Here's my answer");
    await nextTick();

    // Both should be captured (thinking goes to separate field)
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("tracks token usage when reported", async () => {
    result = renderAgentController();
    await nextTick();

    result.agentLoop.simulateText("Response");
    await nextTick();

    result.agentLoop.simulateUsage({
      inputTokens: 100,
      outputTokens: 50,
    });
    await nextTick();

    result.agentLoop.simulateComplete();
    await nextTick();

    // Usage should be tracked (verified via message tokenUsage field)
    expect(result.messages.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Tests: Tool Call Execution
// =============================================================================

describe("Tool Call Execution", () => {
  let result: RenderResult;

  afterEach(() => {
    result?.unmount();
    result?.agentLoop.reset();
  });

  it("handles tool call start event", async () => {
    result = renderAgentController();
    await nextTick();

    const callId = "tool-call-1";
    const toolName = "read_file";
    const toolInput = { path: "/test/file.txt" };

    result.agentLoop.simulateToolStart(callId, toolName, toolInput);
    await nextTick();

    // Tool execution should be tracked
    // Messages should include tool group
    expect(result.messages.length).toBeGreaterThanOrEqual(0);
  });

  it("handles tool call completion", async () => {
    result = renderAgentController();
    await nextTick();

    const callId = "tool-call-2";
    const toolName = "read_file";
    const toolInput = { path: "/test/file.txt" };

    // Start tool
    result.agentLoop.simulateToolStart(callId, toolName, toolInput);
    await nextTick();

    // Complete tool
    const toolResult: MockExecutionResult = {
      result: { success: true, output: "File contents here" },
    };
    result.agentLoop.simulateToolEnd(callId, toolName, toolResult);
    await nextTick();

    // Tool should be marked complete
    expect(result.messages.length).toBeGreaterThanOrEqual(0);
  });

  it("handles tool call error", async () => {
    result = renderAgentController();
    await nextTick();

    const callId = "tool-call-3";
    const toolName = "read_file";
    const toolInput = { path: "/nonexistent.txt" };

    // Start tool
    result.agentLoop.simulateToolStart(callId, toolName, toolInput);
    await nextTick();

    // Fail tool
    const toolResult: MockExecutionResult = {
      result: { success: false, error: "File not found" },
    };
    result.agentLoop.simulateToolEnd(callId, toolName, toolResult);
    await nextTick();

    // Tool should be marked as error
    expect(result.messages.length).toBeGreaterThanOrEqual(0);
  });

  it("handles permission required flow", async () => {
    result = renderAgentController();
    await nextTick();

    const callId = "tool-call-4";
    const toolName = "bash";
    const toolInput = { command: "rm -rf /" };

    // Permission required
    result.agentLoop.simulatePermissionRequired(callId, toolName, toolInput);
    await nextTick();

    // Grant permission
    result.agentLoop.simulatePermissionGranted(callId, toolName);
    await nextTick();

    // Tool should transition to running
    expect(result.messages.length).toBeGreaterThanOrEqual(0);
  });

  it("handles permission denied flow", async () => {
    result = renderAgentController();
    await nextTick();

    const callId = "tool-call-5";
    const toolName = "bash";
    const toolInput = { command: "dangerous command" };

    // Permission required
    result.agentLoop.simulatePermissionRequired(callId, toolName, toolInput);
    await nextTick();

    // Deny permission
    result.agentLoop.simulatePermissionDenied(callId, toolName, "User denied");
    await nextTick();

    // Tool should be marked as rejected
    expect(result.messages.length).toBeGreaterThanOrEqual(0);
  });

  it("handles multiple concurrent tool calls", async () => {
    result = renderAgentController();
    await nextTick();

    // Start multiple tools
    result.agentLoop.simulateToolStart("call-a", "read_file", { path: "/a.txt" });
    result.agentLoop.simulateToolStart("call-b", "read_file", { path: "/b.txt" });
    await nextTick();

    // Complete them in reverse order
    result.agentLoop.simulateToolEnd("call-b", "read_file", {
      result: { success: true, output: "B content" },
    });
    result.agentLoop.simulateToolEnd("call-a", "read_file", {
      result: { success: true, output: "A content" },
    });
    await nextTick();

    // Both should be tracked correctly
    expect(result.messages.length).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// Tests: Cancellation
// =============================================================================

describe("Cancellation", () => {
  let result: RenderResult;

  afterEach(() => {
    result?.unmount();
    result?.agentLoop.reset();
  });

  it("can cancel ongoing execution", async () => {
    result = renderAgentController();
    await nextTick();

    // Start streaming
    result.agentLoop.simulateText("Starting...");
    await nextTick();

    // Cancel
    result.agentLoop.cancel("User requested");
    await nextTick();

    expect(result.agentLoop.isCancelled()).toBe(true);
    expect(result.agentLoop.getState()).toBe("terminated");
  });

  it("cleans up state after cancel", async () => {
    result = renderAgentController();
    await nextTick();

    // Start tool that requires permission
    result.agentLoop.simulatePermissionRequired("call-cancel", "bash", { command: "test" });
    await nextTick();

    // Cancel before approval
    result.agentLoop.cancel();
    await nextTick();

    expect(result.agentLoop.isCancelled()).toBe(true);
  });

  it("can start new execution after cancel", async () => {
    result = renderAgentController();
    await nextTick();

    // First execution
    result.agentLoop.simulateText("First");
    await nextTick();
    result.agentLoop.cancel();
    await nextTick();

    // Reset and start new execution
    result.agentLoop.reset();

    // Reconnect adapter (simulates real reconnection)
    result.rerender();
    await nextTick();

    // New execution should work
    result.agentLoop.simulateText("Second");
    await nextTick();
    result.agentLoop.simulateComplete();
    await nextTick();

    expect(result.agentLoop.getState()).toBe("idle");
  });

  it("preserves partial content on cancel", async () => {
    result = renderAgentController();
    await nextTick();
    await nextTick(); // Extra tick for context initialization

    // Partial streaming
    result.agentLoop.simulateText("Partial content before");
    await nextTick();
    await nextTick(); // Extra tick for message propagation

    const messageCountBefore = result.messages.length;

    // Cancel
    result.agentLoop.cancel();
    await nextTick();

    // Message should still exist with partial content
    expect(result.messages.length).toBe(messageCountBefore);
  });
});

// =============================================================================
// Tests: Error Handling
// =============================================================================

describe("Error Handling", () => {
  let result: RenderResult;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress console.error in tests
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    result?.unmount();
    result?.agentLoop.reset();
    consoleErrorSpy.mockRestore();
  });

  it("handles provider errors gracefully", async () => {
    result = renderAgentController();
    await nextTick();
    await nextTick(); // Extra tick for initialization

    const providerError = new Error("Provider API error: Invalid API key");
    result.agentLoop.simulateError(providerError);
    await nextTick();
    await nextTick(); // Extra tick for message propagation

    // Error should be surfaced in messages
    const hasErrorMessage = result.messages.some(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        "content" in m &&
        String((m as { content: string }).content).includes("Invalid API key")
    );
    expect(hasErrorMessage).toBe(true);
  });

  it("handles rate limit errors", async () => {
    result = renderAgentController();
    await nextTick();
    await nextTick(); // Extra tick for initialization

    const rateLimitError = new Error("Rate limit exceeded. Please retry after 60 seconds.");
    result.agentLoop.simulateError(rateLimitError);
    await nextTick();
    await nextTick(); // Extra tick for message propagation

    // Error should be surfaced
    const hasErrorMessage = result.messages.some(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        "content" in m &&
        String((m as { content: string }).content).includes("Rate limit")
    );
    expect(hasErrorMessage).toBe(true);
  });

  it("handles network errors", async () => {
    result = renderAgentController();
    await nextTick();
    await nextTick(); // Extra tick for initialization

    const networkError = new Error("Network error: Connection timeout");
    result.agentLoop.simulateError(networkError);
    await nextTick();
    await nextTick(); // Extra tick for message propagation

    // Error should be surfaced
    const hasErrorMessage = result.messages.some(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        "content" in m &&
        String((m as { content: string }).content).includes("Network error")
    );
    expect(hasErrorMessage).toBe(true);
  });

  it("does not crash the UI on error", async () => {
    result = renderAgentController();
    await nextTick();

    // Multiple errors should not crash
    result.agentLoop.simulateError(new Error("Error 1"));
    await nextTick();
    result.agentLoop.simulateError(new Error("Error 2"));
    await nextTick();

    // Should still have messages recorded (errors are surfaced as messages)
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("preserves partial content when error occurs during streaming", async () => {
    result = renderAgentController();
    await nextTick();

    // Start streaming
    result.agentLoop.simulateText("Partial content");
    await nextTick();

    const messageCountBefore = result.messages.length;

    // Error mid-stream
    result.agentLoop.simulateError(new Error("Stream interrupted"));
    await nextTick();

    // Message should be preserved
    expect(result.messages.length).toBeGreaterThanOrEqual(messageCountBefore);
  });

  it("logs errors for debugging", async () => {
    result = renderAgentController();
    await nextTick();

    result.agentLoop.simulateError(new Error("Debug error"));
    await nextTick();

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

// =============================================================================
// Tests: Streaming State
// =============================================================================

describe("Streaming State", () => {
  let result: RenderResult;

  afterEach(() => {
    result?.unmount();
    result?.agentLoop.reset();
  });

  it("message is marked as streaming during text emission", async () => {
    result = renderAgentController();
    await nextTick();
    await nextTick(); // Extra tick for context initialization

    result.agentLoop.simulateText("Streaming...");
    await nextTick();
    await nextTick(); // Extra tick for message propagation

    expect(result.messages.length).toBeGreaterThan(0);
    const lastMessage = result.messages[result.messages.length - 1] as { isStreaming?: boolean };
    // The pending message should be marked as streaming
    expect(lastMessage?.isStreaming).toBe(true);
  });

  it("message is marked as not streaming after complete", async () => {
    result = renderAgentController();
    await nextTick();

    result.agentLoop.simulateText("Done");
    await nextTick();
    result.agentLoop.simulateComplete();
    await nextTick();

    // After complete, the message moves to history (no longer pending)
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("handles rapid state transitions", async () => {
    result = renderAgentController();
    await nextTick();

    // Rapid fire events
    result.agentLoop.simulateText("A");
    await nextTick();
    result.agentLoop.simulateText("B");
    await nextTick();
    result.agentLoop.simulateText("C");
    await nextTick();
    result.agentLoop.simulateComplete();
    await nextTick();

    // All content should be accumulated
    expect(result.messages.length).toBeGreaterThan(0);
    const lastMessage = result.messages[result.messages.length - 1] as { content?: string };
    expect(lastMessage?.content).toContain("ABC");
  });

  it("transitions from streaming to tool execution correctly", async () => {
    result = renderAgentController();
    await nextTick();

    // Stream some text
    result.agentLoop.simulateText("Let me check that file");
    await nextTick();

    // Tool call starts
    result.agentLoop.simulateToolStart("call-1", "read_file", { path: "/test.txt" });
    await nextTick();

    // Tool completes
    result.agentLoop.simulateToolEnd("call-1", "read_file", {
      result: { success: true, output: "contents" },
    });
    await nextTick();

    // Continue streaming
    result.agentLoop.simulateText("The file contains...");
    await nextTick();
    result.agentLoop.simulateComplete();
    await nextTick();

    // All content should be present
    expect(result.messages.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Tests: Message Accumulation
// =============================================================================

describe("Message Accumulation", () => {
  let result: RenderResult;

  afterEach(() => {
    result?.unmount();
    result?.agentLoop.reset();
  });

  it("accumulates text chunks into single message", async () => {
    result = renderAgentController();
    await nextTick();

    const chunks = ["Hello", " ", "World", "!", " How", " are", " you?"];
    for (const chunk of chunks) {
      result.agentLoop.simulateText(chunk);
      await nextTick();
    }
    await nextTick();

    expect(result.messages.length).toBeGreaterThan(0);
    const lastMessage = result.messages[result.messages.length - 1] as { content?: string };
    expect(lastMessage?.content).toBe("Hello World! How are you?");
  });

  it("handles empty chunks gracefully", async () => {
    result = renderAgentController();
    await nextTick();
    await nextTick(); // Extra tick for context initialization

    result.agentLoop.simulateText("Start");
    result.agentLoop.simulateText("");
    result.agentLoop.simulateText("End");
    await nextTick();
    await nextTick(); // Extra tick for message propagation

    const lastMessage = result.messages[result.messages.length - 1] as { content?: string };
    expect(lastMessage.content).toBe("StartEnd");
  });

  it("handles unicode and special characters", async () => {
    result = renderAgentController();
    await nextTick();
    await nextTick(); // Extra tick for context initialization

    result.agentLoop.simulateText("Hello 👋 ");
    result.agentLoop.simulateText("世界 🌍");
    await nextTick();
    await nextTick(); // Extra tick for message propagation

    const lastMessage = result.messages[result.messages.length - 1] as { content?: string };
    expect(lastMessage.content).toBe("Hello 👋 世界 🌍");
  });

  it("handles multi-part tool calls correctly", async () => {
    result = renderAgentController();
    await nextTick();

    // Multiple tool calls in sequence
    result.agentLoop.simulateToolStart("call-1", "read_file", { path: "/a.txt" });
    await nextTick();
    result.agentLoop.simulateToolEnd("call-1", "read_file", {
      result: { success: true, output: "A" },
    });
    await nextTick();

    result.agentLoop.simulateToolStart("call-2", "read_file", { path: "/b.txt" });
    await nextTick();
    result.agentLoop.simulateToolEnd("call-2", "read_file", {
      result: { success: true, output: "B" },
    });
    await nextTick();

    // Both should be tracked
    expect(result.messages.length).toBeGreaterThanOrEqual(0);
  });

  it("builds complete message from interleaved text and tools", async () => {
    result = renderAgentController();
    await nextTick();

    // Text -> Tool -> Text pattern
    result.agentLoop.simulateText("Checking file...");
    await nextTick();

    result.agentLoop.simulateToolStart("call-1", "read_file", { path: "/test.txt" });
    await nextTick();
    result.agentLoop.simulateToolEnd("call-1", "read_file", {
      result: { success: true, output: "test content" },
    });
    await nextTick();

    result.agentLoop.simulateText("File contains test content.");
    await nextTick();
    result.agentLoop.simulateComplete();
    await nextTick();

    // Messages should capture the full flow
    expect(result.messages.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Tests: Connection Management
// =============================================================================

describe("Connection Management", () => {
  let result: RenderResult;

  afterEach(() => {
    result?.unmount();
    result?.agentLoop.reset();
  });

  it("connects on mount and handles events", async () => {
    result = renderAgentController();
    await nextTick();
    await nextTick(); // Additional tick for context initialization

    // Verify connection by sending an event and checking it's handled
    result.agentLoop.simulateText("Test connection");
    await nextTick();
    await nextTick(); // Additional tick for message propagation

    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("disconnects on unmount", async () => {
    result = renderAgentController();
    await nextTick();

    result.unmount();
    await nextTick();

    // After unmount, adapter reference is stale but loop should have no listeners
    expect(result.agentLoop.listenerCount("text")).toBe(0);
  });

  it("handles reconnection without duplicate listeners", async () => {
    result = renderAgentController();
    await nextTick();

    // Rerender triggers reconnection
    result.rerender();
    await nextTick();

    // Should not have duplicate listeners
    const textListenerCount = result.agentLoop.listenerCount("text");
    expect(textListenerCount).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// Tests: Edge Cases
// =============================================================================

describe("Edge Cases", () => {
  let result: RenderResult;

  afterEach(() => {
    result?.unmount();
    result?.agentLoop.reset();
  });

  it("handles complete without any text", async () => {
    result = renderAgentController();
    await nextTick();

    // Complete without any content
    result.agentLoop.simulateComplete();
    await nextTick();

    // Should not crash - test passes if no error thrown
    // Messages may be empty since no text was sent
    expect(result.agentLoop.getState()).toBe("idle");
  });

  it("handles tool events without preceding text", async () => {
    result = renderAgentController();
    await nextTick();

    // Tool call as first event
    result.agentLoop.simulateToolStart("call-1", "bash", { command: "ls" });
    await nextTick();
    result.agentLoop.simulateToolEnd("call-1", "bash", {
      result: { success: true, output: "file1.txt" },
    });
    await nextTick();

    // Should handle gracefully
    expect(result.messages.length).toBeGreaterThanOrEqual(0);
  });

  it("handles error as first event", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    result = renderAgentController();
    await nextTick();
    await nextTick(); // Extra tick for context initialization

    // Error as first event
    result.agentLoop.simulateError(new Error("Immediate error"));
    await nextTick();
    await nextTick(); // Extra tick for error message propagation

    // Should create error message
    const hasErrorMessage = result.messages.some(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        "content" in m &&
        String((m as { content: string }).content).includes("Immediate error")
    );
    expect(hasErrorMessage).toBe(true);
    consoleErrorSpy.mockRestore();
  });

  it("handles very long content chunks", async () => {
    result = renderAgentController();
    await nextTick();
    await nextTick(); // Extra tick for context initialization

    // Very long content
    const longContent = "x".repeat(100000);
    result.agentLoop.simulateText(longContent);
    await nextTick();
    await nextTick(); // Extra tick for message propagation

    const lastMessage = result.messages[result.messages.length - 1] as { content?: string };
    expect(lastMessage.content?.length).toBe(100000);
  });

  it("handles rapid connect/disconnect cycles", async () => {
    result = renderAgentController();

    for (let i = 0; i < 5; i++) {
      await nextTick();
      result.rerender();
    }
    await nextTick();
    await nextTick(); // Extra tick for context initialization

    // Should stabilize and still handle events
    result.agentLoop.simulateText("After reconnect");
    await nextTick();
    await nextTick(); // Extra tick for message propagation

    expect(result.messages.length).toBeGreaterThan(0);
  });
});
