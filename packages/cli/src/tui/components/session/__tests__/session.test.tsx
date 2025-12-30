/**
 * Session Components Tests (T056)
 *
 * Tests for session management components: SessionItem, SessionListPanel,
 * SessionPicker, and SessionPreview.
 *
 * @module tui/components/session/__tests__/session.test
 */

import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/index.js";
import { SessionItem } from "../SessionItem.js";
import { SessionListPanel } from "../SessionListPanel.js";
import { SessionPicker } from "../SessionPicker.js";
import { SessionPreview } from "../SessionPreview.js";
import type { SessionMetadata, SessionPreviewMessage } from "../types.js";

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
 * Create a test session with default values.
 */
function createTestSession(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
  return {
    id: "test-session-1",
    title: "Test Session",
    lastMessage: "This is the last message",
    timestamp: new Date("2025-12-30T10:00:00"),
    messageCount: 5,
    ...overrides,
  };
}

/**
 * Create test preview messages.
 */
function createTestMessages(): SessionPreviewMessage[] {
  return [
    {
      id: "msg-1",
      role: "user",
      content: "Hello, how can you help?",
      timestamp: new Date("2025-12-30T10:00:00"),
    },
    {
      id: "msg-2",
      role: "assistant",
      content: "I can help you with many things!",
      timestamp: new Date("2025-12-30T10:01:00"),
    },
  ];
}

// =============================================================================
// SessionItem Tests
// =============================================================================

describe("SessionItem", () => {
  it("renders session title", () => {
    const session = createTestSession({ title: "Debug React App" });

    const { lastFrame } = renderWithTheme(<SessionItem session={session} />);

    expect(lastFrame()).toContain("Debug React App");
  });

  it("renders message count", () => {
    const session = createTestSession({ messageCount: 12 });

    const { lastFrame } = renderWithTheme(<SessionItem session={session} />);

    expect(lastFrame()).toContain("(12)");
  });

  it("renders last message preview", () => {
    const session = createTestSession({ lastMessage: "I will help you" });

    const { lastFrame } = renderWithTheme(<SessionItem session={session} />);

    expect(lastFrame()).toContain("I will help you");
  });

  it("shows selection indicator when selected", () => {
    const session = createTestSession();

    const { lastFrame } = renderWithTheme(<SessionItem session={session} isSelected={true} />);

    expect(lastFrame()).toContain("▶");
  });

  it("shows active indicator when active", () => {
    const session = createTestSession();

    const { lastFrame } = renderWithTheme(<SessionItem session={session} isActive={true} />);

    expect(lastFrame()).toContain("●");
  });

  it("truncates long titles", () => {
    const session = createTestSession({
      title: "This is a very long session title that should be truncated for display",
    });

    const { lastFrame } = renderWithTheme(<SessionItem session={session} />);
    const frame = lastFrame() || "";

    // Should contain truncated title (40 chars max) with ellipsis
    expect(frame).toContain("…");
  });
});

// =============================================================================
// SessionListPanel Tests
// =============================================================================

describe("SessionListPanel", () => {
  it("renders empty state when no sessions", () => {
    const { lastFrame } = renderWithTheme(<SessionListPanel sessions={[]} isFocused={false} />);

    expect(lastFrame()).toContain("No sessions found");
  });

  it("renders session list", () => {
    const sessions = [
      createTestSession({ id: "s1", title: "Session 1" }),
      createTestSession({ id: "s2", title: "Session 2" }),
    ];

    const { lastFrame } = renderWithTheme(
      <SessionListPanel sessions={sessions} isFocused={false} />
    );

    expect(lastFrame()).toContain("Session 1");
    expect(lastFrame()).toContain("Session 2");
  });

  it("shows total session count", () => {
    const sessions = [
      createTestSession({ id: "s1" }),
      createTestSession({ id: "s2" }),
      createTestSession({ id: "s3" }),
    ];

    const { lastFrame } = renderWithTheme(
      <SessionListPanel sessions={sessions} isFocused={false} />
    );

    expect(lastFrame()).toContain("Sessions (3)");
  });

  it("shows navigation hints", () => {
    const sessions = [createTestSession()];

    const { lastFrame } = renderWithTheme(
      <SessionListPanel sessions={sessions} isFocused={false} />
    );

    expect(lastFrame()).toContain("j/k");
    expect(lastFrame()).toContain("navigate");
  });

  it("highlights active session", () => {
    const sessions = [
      createTestSession({ id: "s1", title: "Session 1" }),
      createTestSession({ id: "s2", title: "Session 2" }),
    ];

    const { lastFrame } = renderWithTheme(
      <SessionListPanel sessions={sessions} activeSessionId="s2" isFocused={false} />
    );

    // Active session should have indicator
    expect(lastFrame()).toContain("●");
  });
});

// =============================================================================
// SessionPreview Tests
// =============================================================================

describe("SessionPreview", () => {
  it("renders empty state when no messages", () => {
    const { lastFrame } = renderWithTheme(<SessionPreview messages={[]} />);

    expect(lastFrame()).toContain("No messages in this session");
  });

  it("renders session title", () => {
    const messages = createTestMessages();

    const { lastFrame } = renderWithTheme(
      <SessionPreview messages={messages} title="Debug Session" />
    );

    expect(lastFrame()).toContain("Debug Session");
  });

  it("renders message count", () => {
    const messages = createTestMessages();

    const { lastFrame } = renderWithTheme(<SessionPreview messages={messages} />);

    expect(lastFrame()).toContain("2 messages");
  });

  it("renders message content", () => {
    const messages = createTestMessages();

    const { lastFrame } = renderWithTheme(<SessionPreview messages={messages} />);

    expect(lastFrame()).toContain("Hello, how can you help?");
    expect(lastFrame()).toContain("I can help you");
  });

  it("shows role icons", () => {
    const messages = createTestMessages();

    const { lastFrame } = renderWithTheme(<SessionPreview messages={messages} />);

    expect(lastFrame()).toContain("👤"); // User icon
    expect(lastFrame()).toContain("🤖"); // Assistant icon
  });
});

// =============================================================================
// SessionPicker Tests
// =============================================================================

describe("SessionPicker", () => {
  it("renders nothing when closed", () => {
    const sessions = [createTestSession()];

    const { lastFrame } = renderWithTheme(
      <SessionPicker sessions={sessions} onSelect={vi.fn()} onClose={vi.fn()} isOpen={false} />
    );

    expect(lastFrame()).toBe("");
  });

  it("renders when open", () => {
    const sessions = [createTestSession({ title: "Test Session" })];

    const { lastFrame } = renderWithTheme(
      <SessionPicker sessions={sessions} onSelect={vi.fn()} onClose={vi.fn()} isOpen={true} />
    );

    expect(lastFrame()).toContain("Select Session");
    expect(lastFrame()).toContain("Test Session");
  });

  it("shows empty state when no sessions", () => {
    const { lastFrame } = renderWithTheme(
      <SessionPicker sessions={[]} onSelect={vi.fn()} onClose={vi.fn()} isOpen={true} />
    );

    expect(lastFrame()).toContain("No sessions available");
  });

  it("shows keybinding hints", () => {
    const sessions = [createTestSession()];

    const { lastFrame } = renderWithTheme(
      <SessionPicker sessions={sessions} onSelect={vi.fn()} onClose={vi.fn()} isOpen={true} />
    );

    expect(lastFrame()).toContain("j/k");
    expect(lastFrame()).toContain("Enter");
    expect(lastFrame()).toContain("Esc");
  });

  it("shows session count", () => {
    const sessions = [
      createTestSession({ id: "s1" }),
      createTestSession({ id: "s2" }),
      createTestSession({ id: "s3" }),
    ];

    const { lastFrame } = renderWithTheme(
      <SessionPicker sessions={sessions} onSelect={vi.fn()} onClose={vi.fn()} isOpen={true} />
    );

    expect(lastFrame()).toContain("(3)");
  });

  it("shows preview panel", () => {
    const sessions = [
      createTestSession({
        title: "Debug Session",
        lastMessage: "I found the bug",
      }),
    ];

    const { lastFrame } = renderWithTheme(
      <SessionPicker sessions={sessions} onSelect={vi.fn()} onClose={vi.fn()} isOpen={true} />
    );

    // Preview should show the session title
    expect(lastFrame()).toContain("Debug Session");
  });
});
