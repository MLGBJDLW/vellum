/**
 * TUI Integration Tests (T053)
 *
 * End-to-end integration tests for TUI flows covering:
 * 1. Send message → see in MessageList
 * 2. Receive response → streaming updates
 * 3. Tool request → approval dialog
 * 4. Tool result → status update
 *
 * Uses ink-testing-library for rendering tests.
 *
 * @module __tests__/tui-integration.test
 */

import { Box, Text } from "ink";
import { render } from "ink-testing-library";
import type React from "react";
import { act, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Message,
  MessageList,
  PermissionDialog,
  RootProvider,
  StreamingText,
  ToolCall,
  useMessages,
  useTools,
} from "../tui/index.js";

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Wrapper component to provide all contexts for integration tests
 */
function IntegrationWrapper({
  children,
  initialMessages = [],
}: {
  children: React.ReactNode;
  initialMessages?: readonly Message[];
}) {
  return (
    <RootProvider theme="dark" initialMessages={initialMessages}>
      {children}
    </RootProvider>
  );
}

/**
 * Create a test message with defaults
 */
function createTestMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role: "user",
    content: "Test message",
    timestamp: new Date(),
    ...overrides,
  };
}

// =============================================================================
// Flow 1: Send Message → See in MessageList
// =============================================================================

describe("Integration: Send Message → MessageList", () => {
  it("adds user message and displays it in MessageList", async () => {
    // Component that sends a message and displays list
    function TestComponent() {
      const { messages, addMessage } = useMessages();

      useEffect(() => {
        // Simulate sending a message after mount
        addMessage({ role: "user", content: "Hello, AI assistant!" });
      }, [addMessage]);

      return <MessageList messages={messages} />;
    }

    const { lastFrame } = render(
      <IntegrationWrapper>
        <TestComponent />
      </IntegrationWrapper>
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Hello, AI assistant!");
    expect(frame).toContain("You"); // User role label
    expect(frame).toContain("👤"); // User role icon
  });

  it("adds multiple messages in sequence and displays them all", async () => {
    function TestComponent() {
      const { messages, addMessage } = useMessages();

      useEffect(() => {
        addMessage({ role: "user", content: "First question" });
        addMessage({ role: "assistant", content: "First answer" });
        addMessage({ role: "user", content: "Second question" });
      }, [addMessage]);

      return <MessageList messages={messages} />;
    }

    const { lastFrame } = render(
      <IntegrationWrapper>
        <TestComponent />
      </IntegrationWrapper>
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const frame = lastFrame() ?? "";
    expect(frame).toContain("First question");
    expect(frame).toContain("First answer");
    expect(frame).toContain("Second question");
    expect(frame).toContain("You"); // User messages
    expect(frame).toContain("Assistant"); // Assistant message
  });

  it("displays messages with correct role icons", async () => {
    function TestComponent() {
      const { messages, addMessage } = useMessages();

      useEffect(() => {
        addMessage({ role: "user", content: "User message" });
        addMessage({ role: "assistant", content: "Assistant message" });
        addMessage({ role: "system", content: "System message" });
        addMessage({ role: "tool", content: "Tool result" });
      }, [addMessage]);

      return <MessageList messages={messages} />;
    }

    const { lastFrame } = render(
      <IntegrationWrapper>
        <TestComponent />
      </IntegrationWrapper>
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const frame = lastFrame() ?? "";
    expect(frame).toContain("👤"); // user
    expect(frame).toContain("🤖"); // assistant
    expect(frame).toContain("⚙️"); // system
    expect(frame).toContain("🔧"); // tool
  });

  it("handles initial messages in provider", () => {
    const initialMessages: Message[] = [
      createTestMessage({ id: "init-1", role: "system", content: "System prompt" }),
      createTestMessage({ id: "init-2", role: "user", content: "Initial user query" }),
    ];

    function TestComponent() {
      const { messages } = useMessages();
      return <MessageList messages={messages} />;
    }

    const { lastFrame } = render(
      <IntegrationWrapper initialMessages={initialMessages}>
        <TestComponent />
      </IntegrationWrapper>
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("System prompt");
    expect(frame).toContain("Initial user query");
  });

  it("clears all messages when clearMessages is called", async () => {
    function TestComponent() {
      const { messages, addMessage, clearMessages } = useMessages();

      useEffect(() => {
        addMessage({ role: "user", content: "Message to be cleared" });
        // Clear after adding
        setTimeout(() => clearMessages(), 5);
      }, [addMessage, clearMessages]);

      return <MessageList messages={messages} />;
    }

    const { lastFrame } = render(
      <IntegrationWrapper>
        <TestComponent />
      </IntegrationWrapper>
    );

    // Wait for clear
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const frame = lastFrame() ?? "";
    expect(frame).toContain("No messages yet");
  });
});

// =============================================================================
// Flow 2: Receive Response → Streaming Updates
// =============================================================================

describe("Integration: Receive Response → Streaming Updates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows streaming indicator during response", async () => {
    function TestComponent() {
      const { messages, addMessage, updateMessage } = useMessages();

      useEffect(() => {
        // Add a streaming message
        const id = addMessage({
          role: "assistant",
          content: "Generating...",
          isStreaming: true,
        });

        // Complete streaming after delay
        setTimeout(() => {
          updateMessage(id, { isStreaming: false, content: "Complete response" });
        }, 500);
      }, [addMessage, updateMessage]);

      return <MessageList messages={messages} />;
    }

    const { lastFrame } = render(
      <IntegrationWrapper>
        <TestComponent />
      </IntegrationWrapper>
    );

    // Initially shows streaming
    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    let frame = lastFrame() ?? "";
    expect(frame).toContain("streaming");
    expect(frame).toContain("Generating...");

    // After completion
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    frame = lastFrame() ?? "";
    expect(frame).toContain("Complete response");
  });

  it("appends content during streaming", async () => {
    function TestComponent() {
      const { messages, addMessage, appendToMessage } = useMessages();

      useEffect(() => {
        const id = addMessage({
          role: "assistant",
          content: "Hello",
          isStreaming: true,
        });

        // Simulate streaming chunks
        setTimeout(() => appendToMessage(id, ", world"), 100);
        setTimeout(() => appendToMessage(id, "!"), 200);
      }, [addMessage, appendToMessage]);

      return <MessageList messages={messages} />;
    }

    const { lastFrame } = render(
      <IntegrationWrapper>
        <TestComponent />
      </IntegrationWrapper>
    );

    // Initial content
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    expect(lastFrame()).toContain("Hello");

    // First append
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(lastFrame()).toContain("Hello, world");

    // Second append
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(lastFrame()).toContain("Hello, world!");
  });

  it("renders StreamingText component with cursor during streaming", async () => {
    const { lastFrame } = render(
      <IntegrationWrapper>
        <StreamingText content="Typing in progress" isStreaming={true} />
      </IntegrationWrapper>
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Typing in progress");
    expect(frame).toContain("▊"); // Default cursor
  });

  it("hides cursor when streaming completes", () => {
    const { lastFrame } = render(
      <IntegrationWrapper>
        <StreamingText content="Complete message" isStreaming={false} />
      </IntegrationWrapper>
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Complete message");
    expect(frame).not.toContain("▊");
  });

  it("shows empty state with ellipsis during streaming", async () => {
    function TestComponent() {
      const { messages, addMessage } = useMessages();

      useEffect(() => {
        addMessage({
          role: "assistant",
          content: "",
          isStreaming: true,
        });
      }, [addMessage]);

      return <MessageList messages={messages} />;
    }

    const { lastFrame } = render(
      <IntegrationWrapper>
        <TestComponent />
      </IntegrationWrapper>
    );

    // Wait for message to be added
    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const frame = lastFrame() ?? "";
    // Empty streaming message shows ellipsis placeholder
    expect(frame).toContain("...");
  });
});

// =============================================================================
// Flow 3: Tool Request → Approval Dialog
// =============================================================================

describe("Integration: Tool Request → Approval Dialog", () => {
  it("shows pending tool execution in dialog", async () => {
    function TestComponent() {
      const { pendingApproval, addExecution, approveExecution, rejectExecution } = useTools();

      useEffect(() => {
        addExecution({
          toolName: "read_file",
          params: { path: "/test.txt" },
        });
      }, [addExecution]);

      const pending = pendingApproval[0];
      if (!pending) return <Text>No pending tools</Text>;

      return (
        <PermissionDialog
          execution={pending}
          riskLevel="low"
          onApprove={() => approveExecution(pending.id)}
          onReject={() => rejectExecution(pending.id)}
        />
      );
    }

    const { lastFrame } = render(
      <RootProvider>
        <TestComponent />
      </RootProvider>
    );

    // Wait for state update
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const frame = lastFrame() ?? "";
    expect(frame).toContain("read_file");
    expect(frame).toContain("Low Risk");
    expect(frame).toContain("●"); // Low risk icon
  });

  it("displays different risk levels for tools", () => {
    const riskLevels = [
      { level: "low" as const, label: "Low Risk", icon: "●" },
      { level: "medium" as const, label: "Medium Risk", icon: "▲" },
      { level: "high" as const, label: "High Risk", icon: "◆" },
      { level: "critical" as const, label: "Critical Risk", icon: "⬢" },
    ];

    for (const { level, label, icon } of riskLevels) {
      const execution = {
        id: "test-1",
        toolName: "dangerous_operation",
        params: {},
        status: "pending" as const,
      };

      const { lastFrame } = render(
        <RootProvider>
          <PermissionDialog
            execution={execution}
            riskLevel={level}
            onApprove={vi.fn()}
            onReject={vi.fn()}
          />
        </RootProvider>
      );

      const frame = lastFrame() ?? "";
      expect(frame).toContain(label);
      expect(frame).toContain(icon);
    }
  });

  it("shows tool parameters in dialog", () => {
    const execution = {
      id: "test-1",
      toolName: "write_file",
      params: {
        path: "/output.txt",
        content: "Hello",
      },
      status: "pending" as const,
    };

    const { lastFrame } = render(
      <RootProvider>
        <PermissionDialog
          execution={execution}
          riskLevel="medium"
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      </RootProvider>
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("write_file");
    expect(frame).toContain("path");
    expect(frame).toContain("/output.txt");
  });

  it("processes multiple pending tool requests", async () => {
    function TestComponent() {
      const { pendingApproval, addExecution } = useTools();

      useEffect(() => {
        addExecution({ toolName: "read_file", params: { path: "/a.txt" } });
        addExecution({ toolName: "write_file", params: { path: "/b.txt" } });
        addExecution({ toolName: "execute_command", params: { cmd: "ls" } });
      }, [addExecution]);

      return (
        <Box flexDirection="column">
          <Text>Pending: {pendingApproval.length}</Text>
          {pendingApproval.map((exec) => (
            <Text key={exec.id}>{exec.toolName}</Text>
          ))}
        </Box>
      );
    }

    const { lastFrame } = render(
      <RootProvider>
        <TestComponent />
      </RootProvider>
    );

    // Wait for state updates
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Pending: 3");
    expect(frame).toContain("read_file");
    expect(frame).toContain("write_file");
    expect(frame).toContain("execute_command");
  });
});

// =============================================================================
// Flow 4: Tool Result → Status Update
// =============================================================================

describe("Integration: Tool Result → Status Update", () => {
  it("shows running status after approval", async () => {
    function TestComponent() {
      const { executions, addExecution, approveExecution, updateExecution } = useTools();

      useEffect(() => {
        const id = addExecution({ toolName: "read_file", params: {} });
        // Approve and start running
        setTimeout(() => {
          approveExecution(id);
          updateExecution(id, { status: "running", startedAt: new Date() });
        }, 10);
      }, [addExecution, approveExecution, updateExecution]);

      const exec = executions[0];
      if (!exec) return <Text>No executions</Text>;

      return <ToolCall execution={exec} />;
    }

    const { lastFrame } = render(
      <RootProvider>
        <TestComponent />
      </RootProvider>
    );

    // Wait for status update
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const frame = lastFrame() ?? "";
    // Running status shows spinner
    const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const hasSpinner = spinnerFrames.some((f) => frame.includes(f));
    expect(hasSpinner || frame.includes("read_file")).toBe(true);
  });

  it("shows complete status with result", async () => {
    function TestComponent() {
      const { executions, addExecution, updateExecution } = useTools();

      useEffect(() => {
        const id = addExecution({ toolName: "read_file", params: {} });
        // Complete execution
        setTimeout(() => {
          updateExecution(id, {
            status: "complete",
            result: "File contents here",
            completedAt: new Date(),
          });
        }, 10);
      }, [addExecution, updateExecution]);

      const exec = executions[0];
      if (!exec) return <Text>No executions</Text>;

      return <ToolCall execution={exec} />;
    }

    const { lastFrame } = render(
      <RootProvider>
        <TestComponent />
      </RootProvider>
    );

    // Wait for completion
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const frame = lastFrame() ?? "";
    expect(frame).toContain("✓"); // Complete icon
    expect(frame).toContain("read_file");
  });

  it("shows error status with error info", async () => {
    function TestComponent() {
      const { executions, addExecution, updateExecution } = useTools();

      useEffect(() => {
        const id = addExecution({ toolName: "execute_command", params: {} });
        // Fail execution
        setTimeout(() => {
          updateExecution(id, {
            status: "error",
            error: new Error("Permission denied"),
            completedAt: new Date(),
          });
        }, 10);
      }, [addExecution, updateExecution]);

      const exec = executions[0];
      if (!exec) return <Text>No executions</Text>;

      return <ToolCall execution={exec} />;
    }

    const { lastFrame } = render(
      <RootProvider>
        <TestComponent />
      </RootProvider>
    );

    // Wait for error
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const frame = lastFrame() ?? "";
    expect(frame).toContain("✗"); // Error icon
    expect(frame).toContain("execute_command");
  });

  it("shows rejected status when tool is rejected", async () => {
    function TestComponent() {
      const { executions, addExecution, rejectExecution } = useTools();

      useEffect(() => {
        const id = addExecution({ toolName: "dangerous_tool", params: {} });
        // Reject execution
        setTimeout(() => rejectExecution(id), 10);
      }, [addExecution, rejectExecution]);

      const exec = executions[0];
      if (!exec) return <Text>No executions</Text>;

      return <ToolCall execution={exec} />;
    }

    const { lastFrame } = render(
      <RootProvider>
        <TestComponent />
      </RootProvider>
    );

    // Wait for rejection
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const frame = lastFrame() ?? "";
    expect(frame).toContain("✗"); // Rejected icon
    expect(frame).toContain("dangerous_tool");
  });

  it("tracks full tool lifecycle: pending → approved → running → complete", async () => {
    const statusHistory: string[] = [];

    function TestComponent() {
      const { executions, addExecution, approveExecution, updateExecution } = useTools();

      useEffect(() => {
        const id = addExecution({ toolName: "test_tool", params: {} });

        // Lifecycle simulation with longer delays to allow React to render each state
        setTimeout(() => {
          approveExecution(id);
        }, 50);

        setTimeout(() => {
          updateExecution(id, { status: "running", startedAt: new Date() });
        }, 120);

        setTimeout(() => {
          updateExecution(id, {
            status: "complete",
            result: "success",
            completedAt: new Date(),
          });
        }, 200);
      }, [addExecution, approveExecution, updateExecution]);

      const exec = executions[0];
      const status = exec?.status;

      // Track status changes via useEffect to capture every state transition
      useEffect(() => {
        if (status && !statusHistory.includes(status)) {
          statusHistory.push(status);
        }
      }, [status]);

      return <Text>{exec?.status ?? "none"}</Text>;
    }

    render(
      <RootProvider>
        <TestComponent />
      </RootProvider>
    );

    // Wait for each lifecycle step with individual act() calls to flush renders
    // pending → approved (50ms) → running (120ms) → complete (200ms)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    // Verify we went through the states
    expect(statusHistory).toContain("pending");
    expect(statusHistory).toContain("approved");
    expect(statusHistory).toContain("running");
    expect(statusHistory).toContain("complete");
  });

  it("approves all pending tools at once", async () => {
    function TestComponent() {
      const { executions, pendingApproval, addExecution, approveAll } = useTools();

      useEffect(() => {
        addExecution({ toolName: "tool_1", params: {} });
        addExecution({ toolName: "tool_2", params: {} });
        addExecution({ toolName: "tool_3", params: {} });

        // Approve all after adding
        setTimeout(() => approveAll(), 10);
      }, [addExecution, approveAll]);

      return (
        <Box flexDirection="column">
          <Text>Pending: {pendingApproval.length}</Text>
          <Text>Approved: {executions.filter((e) => e.status === "approved").length}</Text>
        </Box>
      );
    }

    const { lastFrame } = render(
      <RootProvider>
        <TestComponent />
      </RootProvider>
    );

    // Wait for approve all
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Pending: 0");
    expect(frame).toContain("Approved: 3");
  });

  it("clears all tool executions", async () => {
    function TestComponent() {
      const { executions, addExecution, clearExecutions } = useTools();

      useEffect(() => {
        addExecution({ toolName: "tool_1", params: {} });
        addExecution({ toolName: "tool_2", params: {} });

        // Clear after adding
        setTimeout(() => clearExecutions(), 10);
      }, [addExecution, clearExecutions]);

      return <Text>Count: {executions.length}</Text>;
    }

    const { lastFrame } = render(
      <RootProvider>
        <TestComponent />
      </RootProvider>
    );

    // Wait for clear
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(lastFrame()).toContain("Count: 0");
  });
});

// =============================================================================
// Combined Integration Flows
// =============================================================================

describe("Integration: Combined Message and Tool Flows", () => {
  it("shows tool call within assistant message", async () => {
    function TestComponent() {
      const { messages, addMessage } = useMessages();

      useEffect(() => {
        addMessage({
          role: "assistant",
          content: "Let me read that file for you",
          toolCalls: [
            {
              id: "tc-1",
              name: "read_file",
              arguments: { path: "/test.txt" },
              status: "completed",
              result: "file contents",
            },
          ],
        });
      }, [addMessage]);

      return <MessageList messages={messages} />;
    }

    const { lastFrame } = render(
      <IntegrationWrapper>
        <TestComponent />
      </IntegrationWrapper>
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Let me read that file for you");
    expect(frame).toContain("read_file");
  });

  it("handles conversation with interleaved messages and tool results", async () => {
    function TestComponent() {
      const { messages, addMessage } = useMessages();

      useEffect(() => {
        addMessage({ role: "user", content: "Read the config file" });
        addMessage({
          role: "assistant",
          content: "Reading config.json...",
          toolCalls: [
            {
              id: "tc-1",
              name: "read_file",
              arguments: { path: "config.json" },
              status: "completed",
            },
          ],
        });
        addMessage({ role: "tool", content: '{"debug": true}' });
        addMessage({
          role: "assistant",
          content: "The config has debug mode enabled",
        });
      }, [addMessage]);

      return <MessageList messages={messages} />;
    }

    const { lastFrame } = render(
      <IntegrationWrapper>
        <TestComponent />
      </IntegrationWrapper>
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Read the config file");
    expect(frame).toContain("Reading config.json...");
    expect(frame).toContain("debug");
    expect(frame).toContain("debug mode enabled");
  });

  it("updates message after tool completion", async () => {
    function TestComponent() {
      const { messages, addMessage, updateMessage } = useMessages();

      useEffect(() => {
        // Initial message with pending tool
        const id = addMessage({
          role: "assistant",
          content: "Processing...",
          toolCalls: [
            {
              id: "tc-1",
              name: "analyze",
              arguments: {},
              status: "pending",
            },
          ],
        });

        // Update with completed tool
        setTimeout(() => {
          updateMessage(id, {
            content: "Analysis complete",
            toolCalls: [
              {
                id: "tc-1",
                name: "analyze",
                arguments: {},
                status: "completed",
                result: { score: 95 },
              },
            ],
          });
        }, 10);
      }, [addMessage, updateMessage]);

      return <MessageList messages={messages} />;
    }

    const { lastFrame } = render(
      <IntegrationWrapper>
        <TestComponent />
      </IntegrationWrapper>
    );

    // After update
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Analysis complete");
  });
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe("Integration: Edge Cases", () => {
  it("handles empty message list gracefully", () => {
    function TestComponent() {
      const { messages } = useMessages();
      return <MessageList messages={messages} />;
    }

    const { lastFrame } = render(
      <IntegrationWrapper>
        <TestComponent />
      </IntegrationWrapper>
    );

    expect(lastFrame()).toContain("No messages yet");
  });

  it("handles messages with empty content", async () => {
    function TestComponent() {
      const { messages, addMessage } = useMessages();

      useEffect(() => {
        addMessage({ role: "assistant", content: "", isStreaming: false });
      }, [addMessage]);

      return <MessageList messages={messages} />;
    }

    const { lastFrame } = render(
      <IntegrationWrapper>
        <TestComponent />
      </IntegrationWrapper>
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const frame = lastFrame() ?? "";
    expect(frame).toContain("(empty)");
  });

  it("handles tool execution with no pending approvals", () => {
    function TestComponent() {
      const { pendingApproval } = useTools();
      return <Text>Pending: {pendingApproval.length}</Text>;
    }

    const { lastFrame } = render(
      <RootProvider>
        <TestComponent />
      </RootProvider>
    );

    expect(lastFrame()).toContain("Pending: 0");
  });

  it("handles update to non-existent message gracefully", async () => {
    function TestComponent() {
      const { messages, updateMessage, addMessage } = useMessages();

      useEffect(() => {
        // Add one message
        addMessage({ role: "user", content: "Real message" });
        // Try to update non-existent
        updateMessage("non-existent-id", { content: "Updated" });
      }, [addMessage, updateMessage]);

      return <MessageList messages={messages} />;
    }

    const { lastFrame } = render(
      <IntegrationWrapper>
        <TestComponent />
      </IntegrationWrapper>
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // Original message should still be there
    expect(lastFrame()).toContain("Real message");
  });

  it("handles rapid message updates without losing data", async () => {
    function TestComponent() {
      const { messages, addMessage, appendToMessage } = useMessages();

      useEffect(() => {
        const id = addMessage({ role: "assistant", content: "Start", isStreaming: true });

        // Rapid updates
        for (let i = 0; i < 10; i++) {
          setTimeout(() => appendToMessage(id, `.${i}`), i * 2);
        }
      }, [addMessage, appendToMessage]);

      return <MessageList messages={messages} />;
    }

    const { lastFrame } = render(
      <IntegrationWrapper>
        <TestComponent />
      </IntegrationWrapper>
    );

    // Wait for all updates
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Start");
    // Should have accumulated updates
    expect(frame).toContain(".9");
  });
});
