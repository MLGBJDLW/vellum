/**
 * useCopyMode Hook Tests (T055)
 *
 * @module @vellum/cli
 */

import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { type UseCopyModeReturn, useCopyMode } from "../useCopyMode.js";

// =============================================================================
// Test Helper Component
// =============================================================================

interface TestHarnessProps {
  onHookReturn: (hookReturn: UseCopyModeReturn) => void;
}

function TestHarness({ onHookReturn }: TestHarnessProps): React.ReactElement {
  const hookReturn = useCopyMode();
  onHookReturn(hookReturn);
  return null as unknown as React.ReactElement;
}

/**
 * Simple wrapper to render and capture hook state.
 */
function renderCopyModeHook() {
  let hookReturn: UseCopyModeReturn | null = null;

  const { rerender, unmount } = render(<TestHarness onHookReturn={(r) => (hookReturn = r)} />);

  return {
    get current() {
      return hookReturn!;
    },
    rerender: () => {
      rerender(<TestHarness onHookReturn={(r) => (hookReturn = r)} />);
    },
    unmount,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("useCopyMode", () => {
  describe("initial state", () => {
    it("starts with inactive state", () => {
      const result = renderCopyModeHook();

      expect(result.current.state).toEqual({
        active: false,
        startLine: 0,
        endLine: 0,
        startCol: 0,
        endCol: 0,
      });
    });
  });

  describe("enterCopyMode", () => {
    it("activates copy mode", () => {
      const result = renderCopyModeHook();

      result.current.enterCopyMode();
      result.rerender();

      expect(result.current.state.active).toBe(true);
    });

    it("resets selection to origin", () => {
      const result = renderCopyModeHook();

      result.current.enterCopyMode();
      result.rerender();

      expect(result.current.state.startLine).toBe(0);
      expect(result.current.state.startCol).toBe(0);
      expect(result.current.state.endLine).toBe(0);
      expect(result.current.state.endCol).toBe(0);
    });
  });

  describe("exitCopyMode", () => {
    it("deactivates copy mode", () => {
      const result = renderCopyModeHook();

      result.current.enterCopyMode();
      result.rerender();
      expect(result.current.state.active).toBe(true);

      result.current.exitCopyMode();
      result.rerender();
      expect(result.current.state.active).toBe(false);
    });

    it("resets all selection state", () => {
      const result = renderCopyModeHook();

      result.current.enterCopyMode();
      result.rerender();

      result.current.expandSelection("down");
      result.current.expandSelection("right");
      result.rerender();

      expect(result.current.state.endLine).toBeGreaterThan(0);

      result.current.exitCopyMode();
      result.rerender();

      expect(result.current.state).toEqual({
        active: false,
        startLine: 0,
        endLine: 0,
        startCol: 0,
        endCol: 0,
      });
    });
  });

  describe("expandSelection", () => {
    it("expands selection down", () => {
      const result = renderCopyModeHook();

      result.current.enterCopyMode();
      result.rerender();

      result.current.expandSelection("down");
      result.rerender();

      expect(result.current.state.endLine).toBe(1);
      expect(result.current.state.startLine).toBe(0);
    });

    it("expands selection up", () => {
      const result = renderCopyModeHook();

      result.current.enterCopyMode();
      result.rerender();

      result.current.expandSelection("down");
      result.current.expandSelection("down");
      result.rerender();

      expect(result.current.state.endLine).toBe(2);

      result.current.expandSelection("up");
      result.rerender();

      expect(result.current.state.endLine).toBe(1);
    });

    it("does not expand below 0 for up", () => {
      const result = renderCopyModeHook();

      result.current.enterCopyMode();
      result.rerender();

      result.current.expandSelection("up");
      result.rerender();

      expect(result.current.state.endLine).toBe(0);
    });

    it("expands selection right", () => {
      const result = renderCopyModeHook();

      result.current.enterCopyMode();
      result.rerender();

      result.current.expandSelection("right");
      result.rerender();

      expect(result.current.state.endCol).toBe(1);
      expect(result.current.state.startCol).toBe(0);
    });

    it("expands selection left", () => {
      const result = renderCopyModeHook();

      result.current.enterCopyMode();
      result.rerender();

      result.current.expandSelection("right");
      result.current.expandSelection("right");
      result.rerender();

      expect(result.current.state.endCol).toBe(2);

      result.current.expandSelection("left");
      result.rerender();

      expect(result.current.state.endCol).toBe(1);
    });

    it("does not expand below 0 for left", () => {
      const result = renderCopyModeHook();

      result.current.enterCopyMode();
      result.rerender();

      result.current.expandSelection("left");
      result.rerender();

      expect(result.current.state.endCol).toBe(0);
    });

    it("does nothing when not active", () => {
      const result = renderCopyModeHook();

      result.current.expandSelection("down");
      result.rerender();

      expect(result.current.state.endLine).toBe(0);
    });
  });

  describe("isInSelection", () => {
    it("returns false when not active", () => {
      const result = renderCopyModeHook();

      expect(result.current.isInSelection(0, 0)).toBe(false);
    });

    it("returns true for position within single cell selection", () => {
      const result = renderCopyModeHook();

      result.current.enterCopyMode();
      result.rerender();

      expect(result.current.isInSelection(0, 0)).toBe(true);
      expect(result.current.isInSelection(0, 1)).toBe(false);
      expect(result.current.isInSelection(1, 0)).toBe(false);
    });

    it("returns true for positions within horizontal selection", () => {
      const result = renderCopyModeHook();

      result.current.enterCopyMode();
      result.rerender();

      result.current.expandSelection("right");
      result.current.expandSelection("right");
      result.rerender();

      expect(result.current.isInSelection(0, 0)).toBe(true);
      expect(result.current.isInSelection(0, 1)).toBe(true);
      expect(result.current.isInSelection(0, 2)).toBe(true);
      expect(result.current.isInSelection(0, 3)).toBe(false);
      expect(result.current.isInSelection(1, 0)).toBe(false);
    });

    it("returns true for positions within multi-line selection", () => {
      const result = renderCopyModeHook();

      result.current.enterCopyMode();
      result.rerender();

      result.current.expandSelection("down");
      result.current.expandSelection("down");
      result.current.expandSelection("right");
      result.current.expandSelection("right");
      result.rerender();

      // First line: from column 0 to end (any column >= 0)
      expect(result.current.isInSelection(0, 0)).toBe(true);
      expect(result.current.isInSelection(0, 5)).toBe(true);
      expect(result.current.isInSelection(0, 100)).toBe(true);

      // Middle line: entire line
      expect(result.current.isInSelection(1, 0)).toBe(true);
      expect(result.current.isInSelection(1, 100)).toBe(true);

      // Last line: from column 0 to endCol
      expect(result.current.isInSelection(2, 0)).toBe(true);
      expect(result.current.isInSelection(2, 2)).toBe(true);
      expect(result.current.isInSelection(2, 3)).toBe(false);

      // Outside selection
      expect(result.current.isInSelection(3, 0)).toBe(false);
    });
  });

  describe("copySelection", () => {
    it("deactivates mode after copy", async () => {
      const result = renderCopyModeHook();

      // Mock child_process exec to prevent actual clipboard access
      vi.mock("node:child_process", () => ({
        exec: vi.fn((_cmd: string, _opts: unknown, cb: (err: null) => void) => {
          cb?.(null);
          return { stdin: { write: vi.fn(), end: vi.fn() } };
        }),
      }));

      result.current.enterCopyMode();
      result.rerender();
      expect(result.current.state.active).toBe(true);

      result.current.expandSelection("right");
      result.current.expandSelection("right");
      result.rerender();

      const content = [
        ["H", "e", "l", "l", "o"],
        ["W", "o", "r", "l", "d"],
      ];

      await result.current.copySelection(content);
      result.rerender();

      expect(result.current.state.active).toBe(false);
    });

    it("does nothing when not active", async () => {
      const result = renderCopyModeHook();

      const content = [["H", "e", "l", "l", "o"]];

      await result.current.copySelection(content);
      result.rerender();

      // State should remain unchanged
      expect(result.current.state.active).toBe(false);
    });
  });
});
