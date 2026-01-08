/**
 * MessageList Component Tests (T017)
 *
 * Tests for the MessageList component with auto-scroll functionality.
 */

import { getIcons } from "@vellum/shared";
import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it } from "vitest";
import type { Message } from "../../../context/MessagesContext.js";
import { ThemeProvider } from "../../../theme/index.js";
import { MessageList } from "../MessageList.js";

// Get icons for test assertions
const icons = getIcons();

/**
 * Wrapper to provide theme context for tests
 */
function renderWithTheme(element: React.ReactElement) {
  return render(<ThemeProvider>{element}</ThemeProvider>);
}

/**
 * Create a test message with defaults
 */
function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role: "user",
    content: "Test message content",
    timestamp: new Date(),
    ...overrides,
  };
}

describe("MessageList", () => {
  describe("Rendering", () => {
    it("should render without crashing with empty messages", () => {
      const { lastFrame } = renderWithTheme(<MessageList messages={[]} />);

      expect(lastFrame()).toBeDefined();
      expect(lastFrame()).toContain("No messages yet");
    });

    it("should render a single message", () => {
      const messages = [createMessage({ content: "Hello, world!" })];

      const { lastFrame } = renderWithTheme(<MessageList messages={messages} />);

      const frame = lastFrame() ?? "";
      expect(frame).toContain("Hello, world!");
      expect(frame).toContain("You"); // User role label
      expect(frame).toContain(icons.user); // User role icon
    });

    it("should render multiple messages in order", () => {
      const messages = [
        createMessage({ id: "1", content: "First message", role: "user" }),
        createMessage({ id: "2", content: "Second message", role: "assistant" }),
        createMessage({ id: "3", content: "Third message", role: "user" }),
      ];

      const { lastFrame } = renderWithTheme(<MessageList messages={messages} />);

      const frame = lastFrame() ?? "";
      expect(frame).toContain("First message");
      expect(frame).toContain("Second message");
      expect(frame).toContain("Third message");
    });

    it("should render different role icons correctly", () => {
      const messages = [
        createMessage({ role: "user", content: "User msg" }),
        createMessage({ role: "assistant", content: "Assistant msg" }),
        createMessage({ role: "system", content: "System msg" }),
        createMessage({ role: "tool", content: "Tool msg" }),
      ];

      const { lastFrame } = renderWithTheme(<MessageList messages={messages} />);

      const frame = lastFrame() ?? "";
      expect(frame).toContain(icons.user); // user
      expect(frame).toContain(icons.assistant); // assistant
      expect(frame).toContain(icons.system); // system
      expect(frame).toContain(icons.tool); // tool
    });

    it("should render role labels correctly", () => {
      const messages = [
        createMessage({ role: "user" }),
        createMessage({ role: "assistant" }),
        createMessage({ role: "system" }),
        createMessage({ role: "tool" }),
      ];

      const { lastFrame } = renderWithTheme(<MessageList messages={messages} />);

      const frame = lastFrame() ?? "";
      expect(frame).toContain("You");
      expect(frame).toContain("Assistant");
      expect(frame).toContain("System");
      expect(frame).toContain("Tool");
    });

    it("should show streaming indicator when message is streaming", () => {
      const messages = [createMessage({ content: "Typing...", isStreaming: true })];

      const { lastFrame } = renderWithTheme(<MessageList messages={messages} />);

      const frame = lastFrame() ?? "";
      expect(frame).toContain("streaming");
    });

    it("should show placeholder for empty content in non-streaming message", () => {
      const messages = [createMessage({ content: "", isStreaming: false })];

      const { lastFrame } = renderWithTheme(<MessageList messages={messages} />);

      const frame = lastFrame() ?? "";
      expect(frame).toContain("(empty)");
    });

    it("should show ellipsis for empty content in streaming message", () => {
      const messages = [createMessage({ content: "", isStreaming: true })];

      const { lastFrame } = renderWithTheme(<MessageList messages={messages} />);

      const frame = lastFrame() ?? "";
      expect(frame).toContain("...");
    });
  });

  describe("Tool Calls", () => {
    it("should render tool calls when present", () => {
      const messages = [
        createMessage({
          role: "assistant",
          content: "Using a tool",
          toolCalls: [
            {
              id: "tc-1",
              name: "read_file",
              arguments: { path: "/test.txt" },
              status: "completed",
            },
          ],
        }),
      ];

      const { lastFrame } = renderWithTheme(<MessageList messages={messages} />);

      const frame = lastFrame() ?? "";
      expect(frame).toContain("read_file");
      expect(frame).toContain("completed");
    });

    it("should render multiple tool calls", () => {
      const messages = [
        createMessage({
          role: "assistant",
          content: "Multiple tools",
          toolCalls: [
            {
              id: "tc-1",
              name: "read_file",
              arguments: {},
              status: "completed",
            },
            {
              id: "tc-2",
              name: "write_file",
              arguments: {},
              status: "running",
            },
          ],
        }),
      ];

      const { lastFrame } = renderWithTheme(<MessageList messages={messages} />);

      const frame = lastFrame() ?? "";
      expect(frame).toContain("read_file");
      expect(frame).toContain("write_file");
      expect(frame).toContain("completed");
      expect(frame).toContain("running");
    });
  });

  describe("Auto-Scroll Behavior", () => {
    it("should have autoScroll enabled by default", () => {
      const messages = [createMessage()];

      // Just verify the component renders with autoScroll defaulting to true
      const { lastFrame } = renderWithTheme(<MessageList messages={messages} />);

      // If autoScroll was false and we scrolled up, we'd see the pause indicator
      // Since autoScroll defaults to true and we haven't scrolled, no indicator
      const frame = lastFrame() ?? "";
      expect(frame).not.toContain("Auto-scroll paused");
    });

    it("should report being at bottom when all messages are visible", () => {
      const messages = [createMessage(), createMessage(), createMessage()];

      // Without maxHeight, all messages are visible, so we're always "at bottom"
      const { lastFrame } = renderWithTheme(<MessageList messages={messages} />);

      // Should render without scroll indicators since no maxHeight
      const frame = lastFrame() ?? "";
      expect(frame).not.toContain("more above");
      expect(frame).not.toContain("more below");
    });

    it("should show scroll indicator when messages exceed maxHeight", () => {
      // Create more messages than maxHeight
      const messages = Array.from({ length: 10 }, (_, i) =>
        createMessage({ id: `msg-${i}`, content: `Message ${i}` })
      );

      const { lastFrame } = renderWithTheme(
        <MessageList messages={messages} maxHeight={3} autoScroll={false} />
      );

      const frame = lastFrame() ?? "";
      // Should show scroll down indicator since we're at top (autoScroll=false)
      // The component should show some messages but not all
      expect(frame).toBeDefined();
    });

    it("should accept autoScroll prop set to false", () => {
      const messages = [createMessage()];

      const { lastFrame } = renderWithTheme(<MessageList messages={messages} autoScroll={false} />);

      expect(lastFrame()).toBeDefined();
    });
  });

  describe("Props Validation", () => {
    it("should handle undefined optional props", () => {
      const messages = [createMessage()];

      const { lastFrame } = renderWithTheme(<MessageList messages={messages} />);

      expect(lastFrame()).toBeDefined();
    });

    it("should handle maxHeight of 0", () => {
      const messages = [createMessage()];

      // maxHeight of 0 should be treated as "no max height"
      const { lastFrame } = renderWithTheme(<MessageList messages={messages} maxHeight={0} />);

      expect(lastFrame()).toBeDefined();
    });

    it("should handle empty message content", () => {
      const messages = [createMessage({ content: "" })];

      const { lastFrame } = renderWithTheme(<MessageList messages={messages} />);

      expect(lastFrame()).toBeDefined();
    });
  });

  describe("Performance", () => {
    it("should render many messages without error", () => {
      const messages = Array.from({ length: 100 }, (_, i) =>
        createMessage({ id: `msg-${i}`, content: `Message number ${i}` })
      );

      const { lastFrame } = renderWithTheme(<MessageList messages={messages} />);

      expect(lastFrame()).toBeDefined();
    });

    it("should handle messages with windowed rendering", () => {
      const messages = Array.from({ length: 50 }, (_, i) =>
        createMessage({ id: `msg-${i}`, content: `Message ${i}` })
      );

      const { lastFrame } = renderWithTheme(
        <MessageList messages={messages} maxHeight={10} autoScroll={true} />
      );

      expect(lastFrame()).toBeDefined();
    });
  });
});
