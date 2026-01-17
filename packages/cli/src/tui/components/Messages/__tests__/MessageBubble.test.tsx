/**
 * MessageBubble Component Tests
 *
 * Tests for the MessageBubble component which renders styled message bubbles
 * with role-specific formatting and alignment.
 *
 * @module tui/components/Messages/__tests__/MessageBubble.test
 */

import { getIcons } from "@vellum/shared";
import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it } from "vitest";
import type { Message } from "../../../context/MessagesContext.js";
import { ThemeProvider } from "../../../theme/index.js";
import { MessageBubble } from "../MessageBubble.js";

// Get icons for test assertions
const icons = getIcons();

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
      expect(lastFrame()).toContain("Vellum");
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
      expect(lastFrame()).not.toContain(icons.user);
    });

    it("shows user avatar when showAvatar is true", () => {
      const message = createTestMessage({ role: "user" });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} showAvatar />);

      expect(lastFrame()).toContain(icons.user);
    });

    it("shows assistant avatar when showAvatar is true", () => {
      const message = createTestMessage({ role: "assistant" });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} showAvatar />);

      expect(lastFrame()).toContain(icons.assistant);
    });

    it("shows system avatar when showAvatar is true", () => {
      const message = createTestMessage({ role: "system" });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} showAvatar />);

      expect(lastFrame()).toContain(icons.system);
    });

    it("shows tool avatar when showAvatar is true", () => {
      const message = createTestMessage({ role: "tool" });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} showAvatar />);

      expect(lastFrame()).toContain(icons.tool);
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

    it("renders assistant message in compact mode without extra spacing", () => {
      const message = createTestMessage({
        role: "assistant",
        content: "Compact assistant message",
      });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} compact />);

      expect(lastFrame()).toContain("Compact assistant message");
      expect(lastFrame()).toContain("Vellum");
    });
  });

  describe("unknown/unhandled roles", () => {
    it("renders unknown role with fallback label", () => {
      // tool_group role is not handled by MessageBubble (use ToolGroupItem instead)
      // This tests the fallback behavior for unrecognized roles
      const message = createTestMessage({
        role: "tool_group", // Not handled by MessageBubble
        content: "Some content",
      });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} />);

      // Shows "Unknown" label for unhandled roles
      expect(lastFrame()).toContain("Unknown");
      expect(lastFrame()).toContain("Some content");
    });

    it("renders unknown role with empty content placeholder", () => {
      const message = createTestMessage({
        role: "tool_group",
        content: "",
      });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} />);

      // Empty content shows placeholder
      expect(lastFrame()).toContain("(empty)");
    });
  });

  describe("combined props", () => {
    it("renders with all props enabled", () => {
      const message = createTestMessage({
        role: "assistant",
        content: "Full featured message",
      });

      const { lastFrame } = renderWithTheme(
        <MessageBubble message={message} showTimestamp showAvatar />
      );

      expect(lastFrame()).toContain("Full featured message");
      expect(lastFrame()).toContain(icons.assistant); // Avatar
      expect(lastFrame()).toContain("Vellum");
      expect(lastFrame()).toContain("•"); // Timestamp separator
    });

    it("renders message with thinking content", () => {
      const message = createTestMessage({
        role: "assistant",
        content: "Final response",
        thinking: "Let me think about this...",
      });

      const { lastFrame } = renderWithTheme(<MessageBubble message={message} />);

      expect(lastFrame()).toContain("Final response");
    });
  });
});
