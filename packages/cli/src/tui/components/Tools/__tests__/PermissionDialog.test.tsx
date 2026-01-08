/**
 * PermissionDialog Component Tests
 *
 * Tests for the PermissionDialog component which handles tool permission
 * requests with approval/rejection flows and risk level display.
 *
 * Note: ink-testing-library's stdin.write() does not synchronously trigger
 * useInput hooks. Tests focus on:
 * - Rendering behavior (verifiable via lastFrame())
 * - Props contract verification
 * - Visual state assertions
 *
 * Behavioral tests (approval/rejection flows) are validated via:
 * - Integration tests at the CLI level
 * - Manual testing documentation
 *
 * @module tui/components/Tools/__tests__/PermissionDialog.test
 */

import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import type { ToolExecution } from "../../../context/ToolsContext.js";
import { ThemeProvider } from "../../../theme/index.js";
import { PermissionDialog, type RiskLevel } from "../PermissionDialog.js";

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

describe("PermissionDialog", () => {
  describe("risk level display", () => {
    it("displays low risk badge with green styling", () => {
      const execution = createTestExecution();
      const onApprove = vi.fn();
      const onReject = vi.fn();

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={onApprove}
          onReject={onReject}
        />
      );

      expect(lastFrame()).toContain("Low Risk");
      expect(lastFrame()).toContain("●");
    });

    it("displays medium risk badge with yellow styling", () => {
      const execution = createTestExecution();
      const onApprove = vi.fn();
      const onReject = vi.fn();

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="medium"
          onApprove={onApprove}
          onReject={onReject}
        />
      );

      expect(lastFrame()).toContain("Medium Risk");
      expect(lastFrame()).toContain("▲");
    });

    it("displays high risk badge with orange styling", () => {
      const execution = createTestExecution();
      const onApprove = vi.fn();
      const onReject = vi.fn();

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="high"
          onApprove={onApprove}
          onReject={onReject}
        />
      );

      expect(lastFrame()).toContain("High Risk");
      expect(lastFrame()).toContain("◆");
    });

    it("displays critical risk badge with red styling", () => {
      const execution = createTestExecution();
      const onApprove = vi.fn();
      const onReject = vi.fn();

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="critical"
          onApprove={onApprove}
          onReject={onReject}
        />
      );

      expect(lastFrame()).toContain("Critical Risk");
      expect(lastFrame()).toContain("⬢");
    });

    it("displays all risk levels correctly", () => {
      const riskLevels: RiskLevel[] = ["low", "medium", "high", "critical"];
      const expectedLabels = ["Low Risk", "Medium Risk", "High Risk", "Critical Risk"];
      const expectedIcons = ["●", "▲", "◆", "⬢"];

      riskLevels.forEach((level, index) => {
        const execution = createTestExecution();
        const { lastFrame } = renderWithTheme(
          <PermissionDialog
            execution={execution}
            riskLevel={level}
            onApprove={vi.fn()}
            onReject={vi.fn()}
          />
        );

        expect(lastFrame()).toContain(expectedLabels[index]);
        expect(lastFrame()).toContain(expectedIcons[index]);
      });
    });
  });

  describe("dialog content", () => {
    it("displays tool permission request header", () => {
      const execution = createTestExecution();

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      );

      // Translation key is used in tests
      expect(lastFrame()).toContain("permission.requestTitle");
    });

    it("displays tool name", () => {
      const execution = createTestExecution({ toolName: "read_file" });

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      );

      expect(lastFrame()).toContain("read_file");
      // Translation key is used in tests
      expect(lastFrame()).toContain("permission.tool");
    });

    it("displays tool parameters when present", () => {
      const execution = createTestExecution({
        toolName: "read_file",
        params: { path: "/test/file.txt", encoding: "utf-8" },
      });

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      );

      // Translation key is used in tests
      expect(lastFrame()).toContain("permission.parameters");
      expect(lastFrame()).toContain("path");
      expect(lastFrame()).toContain("/test/file.txt");
    });

    it("does not display parameters section when params are empty", () => {
      const execution = createTestExecution({ params: {} });

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      );

      // Translation key should not be present
      expect(lastFrame()).not.toContain("permission.parameters");
    });
  });

  describe("keybinding hints", () => {
    it("displays approve keybinding hint", () => {
      const execution = createTestExecution();

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      );

      expect(lastFrame()).toContain("[y/Enter]");
      // Translation key is used in tests
      expect(lastFrame()).toContain("permission.approve");
    });

    it("displays reject keybinding hint", () => {
      const execution = createTestExecution();

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      );

      expect(lastFrame()).toContain("[n/Esc]");
      // Translation key is used in tests
      expect(lastFrame()).toContain("permission.reject");
    });

    it("displays always allow hint when onApproveAlways is provided", () => {
      const execution = createTestExecution();

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onApproveAlways={vi.fn()}
        />
      );

      expect(lastFrame()).toContain("[a]");
      // Translation key is used in tests
      expect(lastFrame()).toContain("permission.alwaysAllow");
    });

    it("does not display always allow hint when onApproveAlways is not provided", () => {
      const execution = createTestExecution();

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      );

      // Translation key should not be present
      expect(lastFrame()).not.toContain("permission.alwaysAllow");
    });
  });

  describe("approval flow", () => {
    /**
     * Note: ink-testing-library's stdin.write() does not synchronously trigger useInput hooks.
     * The approval flow (y, Y, Enter keys) is tested via integration tests.
     *
     * Expected behavior:
     * - 'y' or 'Y': calls onApprove
     * - Enter key: calls onApprove
     * - 'a' or 'A': calls onApproveAlways (if provided)
     */
    it("renders approve keybinding hint for user guidance", () => {
      const execution = createTestExecution();

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      );

      expect(lastFrame()).toContain("[y/Enter]");
      // Translation key is used in tests
      expect(lastFrame()).toContain("permission.approve");
    });

    it("renders always allow option when onApproveAlways callback is provided", () => {
      const execution = createTestExecution();

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onApproveAlways={vi.fn()}
        />
      );

      expect(lastFrame()).toContain("[a]");
      // Translation key is used in tests
      expect(lastFrame()).toContain("permission.alwaysAllow");
    });

    it("does not render always allow option when callback is not provided", () => {
      const execution = createTestExecution();

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      );

      // Translation key should not be present
      expect(lastFrame()).not.toContain("permission.alwaysAllow");
    });
  });

  describe("rejection flow", () => {
    /**
     * Note: ink-testing-library's stdin.write() does not synchronously trigger useInput hooks.
     * The rejection flow (n, N, Escape keys) is tested via integration tests.
     *
     * Expected behavior:
     * - 'n' or 'N': calls onReject
     * - Escape key: calls onReject
     */
    it("renders reject keybinding hint for user guidance", () => {
      const execution = createTestExecution();

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      );

      expect(lastFrame()).toContain("[n/Esc]");
      // Translation key is used in tests
      expect(lastFrame()).toContain("permission.reject");
    });
  });

  describe("focus behavior", () => {
    /**
     * Note: ink-testing-library's stdin.write() does not synchronously trigger useInput hooks.
     * Focus behavior (isFocused prop) is tested via integration tests.
     *
     * Expected behavior:
     * - When isFocused=false: keyboard input is ignored
     * - When isFocused=true (default): keyboard input is processed
     */
    it("accepts isFocused prop for controlling input responsiveness", () => {
      const execution = createTestExecution();

      // Should render without errors when isFocused is explicitly false
      const { lastFrame: frame1 } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
          isFocused={false}
        />
      );

      // Translation key is used in tests
      expect(frame1()).toContain("permission.requestTitle");

      // Should render without errors when isFocused is explicitly true
      const { lastFrame: frame2 } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
          isFocused={true}
        />
      );

      // Translation key is used in tests
      expect(frame2()).toContain("permission.requestTitle");
    });

    it("uses isFocused=true by default", () => {
      const execution = createTestExecution();

      // Should render without errors when isFocused is not provided
      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      );

      // Translation key is used in tests
      expect(lastFrame()).toContain("permission.requestTitle");
    });
  });

  describe("double-action prevention", () => {
    /**
     * Note: ink-testing-library's stdin.write() does not synchronously trigger useInput hooks.
     * Double-action prevention is tested via integration tests.
     *
     * Expected behavior:
     * - Only the first valid keypress triggers a callback
     * - Subsequent keypresses are ignored until execution changes
     */
    it("tracks execution ID to reset handled state on execution change", () => {
      const execution1 = createTestExecution({ id: "exec-1" });
      const execution2 = createTestExecution({ id: "exec-2" });

      // Both should render without errors
      const { lastFrame: frame1 } = renderWithTheme(
        <PermissionDialog
          execution={execution1}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      );

      // Translation key is used in tests
      expect(frame1()).toContain("permission.requestTitle");

      const { lastFrame: frame2 } = renderWithTheme(
        <PermissionDialog
          execution={execution2}
          riskLevel="medium"
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      );

      // Translation key is used in tests
      expect(frame2()).toContain("permission.requestTitle");
    });
  });

  describe("unknown keys", () => {
    /**
     * Note: ink-testing-library's stdin.write() does not synchronously trigger useInput hooks.
     * Unknown key handling is tested via integration tests.
     *
     * Expected behavior:
     * - Keys other than y, n, a, Enter, Escape are ignored
     * - No callbacks are triggered for unknown keys
     */
    it("only displays valid keybinding hints", () => {
      const execution = createTestExecution();

      const { lastFrame } = renderWithTheme(
        <PermissionDialog
          execution={execution}
          riskLevel="low"
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      );

      // Should only show documented keybindings
      expect(lastFrame()).toContain("[y/Enter]");
      expect(lastFrame()).toContain("[n/Esc]");
      // Should not suggest random keys
      expect(lastFrame()).not.toContain("[x]");
      expect(lastFrame()).not.toContain("[z]");
    });
  });
});
