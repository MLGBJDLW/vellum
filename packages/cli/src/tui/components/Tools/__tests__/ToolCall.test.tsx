/**
 * ToolCall Component Tests
 *
 * Tests for the ToolCall component which displays tool executions
 * with status icons, names, and optional duration.
 *
 * @module tui/components/Tools/__tests__/ToolCall.test
 */

import { getIcons, type IconSet } from "@vellum/shared";
import { render } from "ink-testing-library";
import type React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ToolExecution } from "../../../context/ToolsContext.js";
import { ThemeProvider } from "../../../theme/index.js";
import { ToolCall } from "../ToolCall.js";

// =============================================================================
// Test Setup
// =============================================================================

// Icons are fetched in beforeEach to ensure setup has run first
let icons: IconSet;

beforeEach(() => {
  // Get icons after setup has configured Unicode mode
  icons = getIcons();
});

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
 * Create a test tool execution with default values.
 */
function createTestExecution(overrides: Partial<ToolExecution> = {}): ToolExecution {
  return {
    id: "test-exec-1",
    toolName: "test_tool",
    params: {},
    status: "pending",
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("ToolCall", () => {
  describe("status icons", () => {
    it("renders pending status with tilde icon", () => {
      const execution = createTestExecution({ status: "pending" });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} />);

      expect(lastFrame()).toContain("~");
      expect(lastFrame()).toContain("test_tool");
    });

    it("renders approved status with check icon", () => {
      const execution = createTestExecution({ status: "approved" });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} />);

      expect(lastFrame()).toContain(icons.check);
      expect(lastFrame()).toContain("test_tool");
    });

    it("renders rejected status with cross icon", () => {
      const execution = createTestExecution({ status: "rejected" });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} />);

      expect(lastFrame()).toContain(icons.cross);
      expect(lastFrame()).toContain("test_tool");
    });

    it("renders running status with spinner frame", () => {
      const execution = createTestExecution({ status: "running" });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} />);

      // Spinner will show one of the animation frames
      const frame = lastFrame();
      const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
      const hasSpinnerFrame = spinnerFrames.some((f) => frame?.includes(f));
      expect(hasSpinnerFrame).toBe(true);
      expect(frame).toContain("test_tool");
    });

    it("renders complete status with check icon", () => {
      const execution = createTestExecution({ status: "complete" });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} />);

      expect(lastFrame()).toContain(icons.check);
      expect(lastFrame()).toContain("test_tool");
    });

    it("renders error status with cross icon", () => {
      const execution = createTestExecution({
        status: "error",
        error: new Error("Something went wrong"),
      });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} />);

      expect(lastFrame()).toContain(icons.cross);
      expect(lastFrame()).toContain("test_tool");
    });
  });

  describe("tool name display", () => {
    it("displays the tool name", () => {
      const execution = createTestExecution({ toolName: "read_file" });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} />);

      expect(lastFrame()).toContain("read_file");
    });

    it("displays different tool names correctly", () => {
      const tools = ["write_file", "execute_command", "search_code"];

      for (const toolName of tools) {
        const execution = createTestExecution({ toolName });
        const { lastFrame } = renderWithTheme(<ToolCall execution={execution} />);
        expect(lastFrame()).toContain(toolName);
      }
    });
  });

  describe("duration display", () => {
    it("does not show duration when showDuration is false", () => {
      const execution = createTestExecution({
        status: "complete",
        startedAt: new Date("2025-01-01T12:00:00Z"),
        completedAt: new Date("2025-01-01T12:00:05Z"),
      });

      const { lastFrame } = renderWithTheme(
        <ToolCall execution={execution} showDuration={false} />
      );

      expect(lastFrame()).not.toContain("5s");
    });

    it("shows duration in milliseconds for short operations", () => {
      const execution = createTestExecution({
        status: "complete",
        startedAt: new Date("2025-01-01T12:00:00.000Z"),
        completedAt: new Date("2025-01-01T12:00:00.500Z"),
      });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} showDuration />);

      expect(lastFrame()).toContain("500ms");
    });

    it("shows duration in seconds for medium operations", () => {
      const execution = createTestExecution({
        status: "complete",
        startedAt: new Date("2025-01-01T12:00:00Z"),
        completedAt: new Date("2025-01-01T12:00:05Z"),
      });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} showDuration />);

      expect(lastFrame()).toContain("5s");
    });

    it("shows duration in minutes for long operations", () => {
      const execution = createTestExecution({
        status: "complete",
        startedAt: new Date("2025-01-01T12:00:00Z"),
        completedAt: new Date("2025-01-01T12:02:30Z"),
      });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} showDuration />);

      expect(lastFrame()).toContain("2m 30s");
    });

    it("does not show duration for pending status", () => {
      const execution = createTestExecution({
        status: "pending",
        startedAt: new Date("2025-01-01T12:00:00Z"),
        completedAt: new Date("2025-01-01T12:00:05Z"),
      });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} showDuration />);

      expect(lastFrame()).not.toContain("5s");
    });

    it("shows duration for error status when showDuration is true", () => {
      const execution = createTestExecution({
        status: "error",
        startedAt: new Date("2025-01-01T12:00:00Z"),
        completedAt: new Date("2025-01-01T12:00:03Z"),
        error: new Error("Failed"),
      });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} showDuration />);

      expect(lastFrame()).toContain("3s");
    });
  });

  describe("compact mode", () => {
    it("renders in compact mode with minimal info", () => {
      const execution = createTestExecution({
        status: "complete",
        startedAt: new Date("2025-01-01T12:00:00Z"),
        completedAt: new Date("2025-01-01T12:00:05Z"),
      });

      const { lastFrame } = renderWithTheme(
        <ToolCall execution={execution} compact showDuration />
      );

      expect(lastFrame()).toContain(icons.check);
      expect(lastFrame()).toContain("test_tool");
      // Duration should not be shown in compact mode
      expect(lastFrame()).not.toContain("5s");
    });

    it("shows status icon and tool name in compact mode", () => {
      const execution = createTestExecution({
        status: "pending",
        toolName: "my_custom_tool",
      });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} compact />);

      expect(lastFrame()).toContain("~");
      expect(lastFrame()).toContain("my_custom_tool");
    });
  });

  describe("error display", () => {
    it("shows error message for error status", () => {
      const execution = createTestExecution({
        status: "error",
        error: new Error("Connection timeout"),
      });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} />);

      expect(lastFrame()).toContain("Connection timeout");
    });

    it("does not show error message in compact mode", () => {
      const execution = createTestExecution({
        status: "error",
        error: new Error("Connection timeout"),
      });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} compact />);

      expect(lastFrame()).not.toContain("Connection timeout");
    });
  });

  describe("default props", () => {
    it("uses compact=false by default", () => {
      const execution = createTestExecution({
        status: "error",
        error: new Error("Test error"),
      });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} />);

      // Error message should be visible (not compact mode)
      expect(lastFrame()).toContain("Test error");
    });

    it("uses showDuration=false by default", () => {
      const execution = createTestExecution({
        status: "complete",
        startedAt: new Date("2025-01-01T12:00:00Z"),
        completedAt: new Date("2025-01-01T12:00:05Z"),
      });

      const { lastFrame } = renderWithTheme(<ToolCall execution={execution} />);

      expect(lastFrame()).not.toContain("5s");
    });
  });
});
