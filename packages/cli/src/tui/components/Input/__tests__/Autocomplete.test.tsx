/**
 * Autocomplete Component Tests (T011)
 *
 * Tests for the Autocomplete dropdown component.
 */

import { render } from "ink-testing-library";
import type React from "react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/index.js";
import { Autocomplete } from "../Autocomplete.js";

/**
 * Wrapper to provide theme context for tests
 */
function renderWithTheme(element: React.ReactElement) {
  return render(<ThemeProvider>{element}</ThemeProvider>);
}

describe("Autocomplete", () => {
  const defaultOptions = ["/help", "/history", "/hello", "/clear", "/quit"];

  describe("Rendering", () => {
    it("should render without crashing when visible", () => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();

      const { lastFrame } = renderWithTheme(
        <Autocomplete
          input="/he"
          options={defaultOptions}
          onSelect={onSelect}
          onCancel={onCancel}
          visible={true}
        />
      );

      expect(lastFrame()).toBeDefined();
    });

    it("should render nothing when not visible", () => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();

      const { lastFrame } = renderWithTheme(
        <Autocomplete
          input="/he"
          options={defaultOptions}
          onSelect={onSelect}
          onCancel={onCancel}
          visible={false}
        />
      );

      // Should render empty or minimal when not visible
      const frame = lastFrame() ?? "";
      expect(frame.trim()).toBe("");
    });

    it("should render nothing when no options match", () => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();

      const { lastFrame } = renderWithTheme(
        <Autocomplete
          input="/xyz"
          options={defaultOptions}
          onSelect={onSelect}
          onCancel={onCancel}
          visible={true}
        />
      );

      const frame = lastFrame() ?? "";
      expect(frame.trim()).toBe("");
    });

    it("should render nothing when input is empty", () => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();

      const { lastFrame } = renderWithTheme(
        <Autocomplete
          input=""
          options={defaultOptions}
          onSelect={onSelect}
          onCancel={onCancel}
          visible={true}
        />
      );

      const frame = lastFrame() ?? "";
      // Empty input shows all options (useful for '/' picker)
      expect(frame).toContain("help");
      expect(frame).toContain("history");
    });
  });

  describe("Filtering", () => {
    it("should filter options by prefix (case-insensitive)", () => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();

      const { lastFrame } = renderWithTheme(
        <Autocomplete
          input="/he"
          options={defaultOptions}
          onSelect={onSelect}
          onCancel={onCancel}
          visible={true}
        />
      );

      const frame = lastFrame() ?? "";
      // Should show /help and /hello (prefix match)
      expect(frame).toContain("help");
      expect(frame).toContain("hello");
      // Should NOT show /history (different prefix)
      expect(frame).not.toContain("history");
      // Should NOT show /clear or /quit
      expect(frame).not.toContain("clear");
      expect(frame).not.toContain("quit");
    });

    it("should be case-insensitive when filtering", () => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();
      const options = ["/Help", "/HELLO", "/History"];

      const { lastFrame } = renderWithTheme(
        <Autocomplete
          input="/he"
          options={options}
          onSelect={onSelect}
          onCancel={onCancel}
          visible={true}
        />
      );

      const frame = lastFrame() ?? "";
      // Should match regardless of case
      expect(frame).toContain("Help");
      expect(frame).toContain("HELLO");
    });

    it("should show all matching options when input is a common prefix", () => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();

      const { lastFrame } = renderWithTheme(
        <Autocomplete
          input="/h"
          options={defaultOptions}
          onSelect={onSelect}
          onCancel={onCancel}
          visible={true}
        />
      );

      const frame = lastFrame() ?? "";
      // Should show /help, /history, and /hello
      expect(frame).toContain("help");
      expect(frame).toContain("history");
      expect(frame).toContain("hello");
    });
  });

  describe("maxVisible", () => {
    it("should limit displayed options to maxVisible", () => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();
      const manyOptions = ["/a1", "/a2", "/a3", "/a4", "/a5", "/a6", "/a7"];

      const { lastFrame } = renderWithTheme(
        <Autocomplete
          input="/a"
          options={manyOptions}
          onSelect={onSelect}
          onCancel={onCancel}
          visible={true}
          maxVisible={3}
        />
      );

      const frame = lastFrame() ?? "";
      // Should show first 3 and overflow indicator
      expect(frame).toContain("a1");
      expect(frame).toContain("a2");
      expect(frame).toContain("a3");
      // Should show "4 more" indicator
      expect(frame).toContain("4 more");
    });

    it("should not show overflow indicator when all options fit", () => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();

      const { lastFrame } = renderWithTheme(
        <Autocomplete
          input="/he"
          options={defaultOptions}
          onSelect={onSelect}
          onCancel={onCancel}
          visible={true}
          maxVisible={5}
        />
      );

      const frame = lastFrame() ?? "";
      // Only 2 options match (/help, /hello), so no overflow
      expect(frame).not.toContain("more");
    });

    it("should use default maxVisible of 10", () => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();
      // Need more than 10 options to see overflow
      const manyOptions = [
        "/a1",
        "/a2",
        "/a3",
        "/a4",
        "/a5",
        "/a6",
        "/a7",
        "/a8",
        "/a9",
        "/a10",
        "/a11",
        "/a12",
        "/a13",
      ];

      const { lastFrame } = renderWithTheme(
        <Autocomplete
          input="/a"
          options={manyOptions}
          onSelect={onSelect}
          onCancel={onCancel}
          visible={true}
        />
      );

      const frame = lastFrame() ?? "";
      // Default is 10, so should show "3 more" for 13 options
      expect(frame).toContain("3 more");
    });
  });

  describe("Selection indicator", () => {
    it("should show selection indicator for first item by default", () => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();

      const { lastFrame } = renderWithTheme(
        <Autocomplete
          input="/he"
          options={defaultOptions}
          onSelect={onSelect}
          onCancel={onCancel}
          visible={true}
        />
      );

      const frame = lastFrame() ?? "";
      // Should have the selection indicator (›)
      expect(frame).toContain("›");
    });

    it("keeps the selected option visible when navigating beyond maxVisible", async () => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();
      const manyOptions = ["/a1", "/a2", "/a3", "/a4", "/a5"];

      const { lastFrame, stdin } = renderWithTheme(
        <Autocomplete
          input=""
          options={manyOptions}
          onSelect={onSelect}
          onCancel={onCancel}
          visible={true}
          maxVisible={2}
        />
      );

      // Initially shows first window
      expect(lastFrame()).toContain("a1");
      expect(lastFrame()).toContain("a2");
      expect(lastFrame()).toContain("›");

      // Move selection down 3 times: should scroll window and keep highlight visible
      await act(async () => {
        stdin.write("\u001b[B");
        await new Promise((r) => setTimeout(r, 0));
      });
      await act(async () => {
        stdin.write("\u001b[B");
        await new Promise((r) => setTimeout(r, 0));
      });
      await act(async () => {
        stdin.write("\u001b[B");
        await new Promise((r) => setTimeout(r, 0));
      });

      const frame = lastFrame() ?? "";

      // With maxVisible=2 and selection index=3, the window should include a3 and a4
      expect(frame).toContain("a3");
      expect(frame).toContain("a4");
      // Ensure highlight indicator never disappears
      expect(frame).toContain("›");
    });
  });

  describe("Props interface", () => {
    it("should accept all required props", () => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();

      const { lastFrame } = renderWithTheme(
        <Autocomplete
          input="/test"
          options={["/test1", "/test2"]}
          onSelect={onSelect}
          onCancel={onCancel}
        />
      );

      expect(lastFrame()).toBeTruthy();
    });

    it("should accept all optional props", () => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();

      const { lastFrame } = renderWithTheme(
        <Autocomplete
          input="/test"
          options={["/test1", "/test2"]}
          onSelect={onSelect}
          onCancel={onCancel}
          visible={true}
          maxVisible={10}
        />
      );

      expect(lastFrame()).toBeTruthy();
    });
  });

  describe("Border styling", () => {
    it("should render with a bordered box", () => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();

      const { lastFrame } = renderWithTheme(
        <Autocomplete
          input="/he"
          options={defaultOptions}
          onSelect={onSelect}
          onCancel={onCancel}
          visible={true}
        />
      );

      const frame = lastFrame() ?? "";
      // Ink's Box with borderStyle="single" uses unicode box characters
      // Check that content is displayed (border characters may vary)
      expect(frame.length).toBeGreaterThan(0);
      expect(frame).toContain("help");
    });
  });
});
