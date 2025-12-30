/**
 * MessageBubble Component Tests
 *
 * Tests for the MessageBubble component which renders styled message bubbles
 * with role-specific formatting and alignment.
 *
 * @module tui/components/Messages/__tests__/MessageBubble.test
 */

import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it } from "vitest";
import type { Message } from "../../../context/MessagesContext.js";
import { ThemeProvider } from "../../../theme/index.js";
import { MessageBubble } from "../MessageBubble.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Wrap component with ThemeProvider for testing.
 */
function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

/**
 * Create a test message with default values.
 */
function createTestMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "test-1",
    role: "user",
    content: "Test message content",
    timestamp: new Date("2025-01-01T12:00:00Z"),
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("MessageBubble", () => {
  describe("rendering", () => {
    it("renders user message content", () => {
      const message = createTestMessage({
        role: "user",
        content: "Hello from user",
      });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} />);

      expect(lastFrame()).toContain("Hello from user");
      expect(lastFrame()).toContain("You");
    });

    it("renders assistant message content", () => {
      const message = createTestMessage({
        role: "assistant",
        content: "Hello from assistant",
      });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} />);

      expect(lastFrame()).toContain("Hello from assistant");
      expect(lastFrame()).toContain("Assistant");
    });

    it("renders system message content", () => {
      const message = createTestMessage({
        role: "system",
        content: "System notification",
      });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} />);

      expect(lastFrame()).toContain("System notification");
      expect(lastFrame()).toContain("System");
    });

    it("renders tool message content", () => {
      const message = createTestMessage({
        role: "tool",
        content: "Tool output",
      });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} />);

      expect(lastFrame()).toContain("Tool output");
      expect(lastFrame()).toContain("Tool");
    });

    it("renders empty message placeholder", () => {
      const message = createTestMessage({
        content: "",
      });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} />);

      expect(lastFrame()).toContain("(empty)");
    });

    it("renders streaming indicator", () => {
      const message = createTestMessage({
        content: "",
        isStreaming: true,
      });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} />);

      expect(lastFrame()).toContain("streaming");
      expect(lastFrame()).toContain("...");
    });
  });

  describe("timestamp display", () => {
    it("does not show timestamp by default", () => {
      const message = createTestMessage();

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} />);

      // Should not contain time format like "12:00"
      expect(lastFrame()).not.toContain("•");
    });

    it("shows timestamp when showTimestamp is true", () => {
      const message = createTestMessage({
        timestamp: new Date("2025-01-01T14:30:00Z"),
      });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} showTimestamp />);

      expect(lastFrame()).toContain("•");
    });
  });

  describe("avatar display", () => {
    it("does not show avatar by default", () => {
      const message = createTestMessage({ role: "user" });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} />);

      // User icon should not appear
      expect(lastFrame()).not.toContain("👤");
    });

    it("shows user avatar when showAvatar is true", () => {
      const message = createTestMessage({ role: "user" });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} showAvatar />);

      expect(lastFrame()).toContain("👤");
    });

    it("shows assistant avatar when showAvatar is true", () => {
      const message = createTestMessage({ role: "assistant" });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} showAvatar />);

      expect(lastFrame()).toContain("🤖");
    });

    it("shows system avatar when showAvatar is true", () => {
      const message = createTestMessage({ role: "system" });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} showAvatar />);

      expect(lastFrame()).toContain("⚙️");
    });

    it("shows tool avatar when showAvatar is true", () => {
      const message = createTestMessage({ role: "tool" });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} showAvatar />);

      expect(lastFrame()).toContain("🔧");
    });
  });

  describe("compact mode", () => {
    it("renders in compact mode", () => {
      const message = createTestMessage({
        content: "Compact message",
      });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} compact />);

      expect(lastFrame()).toContain("Compact message");
    });

    it("hides tool calls in compact mode", () => {
      const message = createTestMessage({
        role: "assistant",
        content: "Message with tools",
        toolCalls: [
          {
            id: "tool-1",
            name: "read_file",
            arguments: { path: "/test.txt" },
            status: "completed",
          },
        ],
      });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} compact />);

      expect(lastFrame()).toContain("Message with tools");
      expect(lastFrame()).not.toContain("read_file");
    });
  });

  describe("tool calls", () => {
    it("renders tool calls for assistant messages", () => {
      const message = createTestMessage({
        role: "assistant",
        content: "Executing tools...",
        toolCalls: [
          {
            id: "tool-1",
            name: "read_file",
            arguments: { path: "/test.txt" },
            status: "completed",
          },
          {
            id: "tool-2",
            name: "write_file",
            arguments: { path: "/output.txt" },
            status: "running",
          },
        ],
      });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} />);

      expect(lastFrame()).toContain("read_file");
      expect(lastFrame()).toContain("completed");
      expect(lastFrame()).toContain("write_file");
      expect(lastFrame()).toContain("running");
    });

    it("does not render tool calls section when empty", () => {
      const message = createTestMessage({
        role: "assistant",
        content: "No tools",
        toolCalls: [],
      });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} />);

      expect(lastFrame()).toContain("No tools");
      // Should only have the main content, no extra tool icons
      expect(lastFrame()?.split("🔧").length).toBeLessThanOrEqual(1);
    });
  });

  describe("combined props", () => {
    it("renders with all props enabled", () => {
      const message = createTestMessage({
        role: "assistant",
        content: "Full featured message",
        toolCalls: [
          {
            id: "tool-1",
            name: "test_tool",
            arguments: {},
            status: "pending",
          },
        ],
      });

      const { lastFrame } = renderWithTheme(
        <MessageBubble message={message} showTimestamp showAvatar />
      );

      expect(lastFrame()).toContain("Full featured message");
      expect(lastFrame()).toContain("🤖"); // Avatar
      expect(lastFrame()).toContain("Assistant");
      expect(lastFrame()).toContain("•"); // Timestamp separator
      expect(lastFrame()).toContain("test_tool");
    });
  });
});
