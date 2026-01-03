/**
 * useVim Hook Tests (T041)
 *
 * @module @vellum/cli
 */

import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it } from "vitest";
import { type UseVimReturn, useVim } from "../useVim.js";

// =============================================================================
// Test Helper Component
// =============================================================================

interface TestHarnessProps {
  onHookReturn: (hookReturn: UseVimReturn) => void;
}

function TestHarness({ onHookReturn }: TestHarnessProps): React.ReactElement {
  const hookReturn = useVim();
  onHookReturn(hookReturn);
  return null as unknown as React.ReactElement;
}

/**
 * Simple wrapper to render and capture hook state.
 */
function renderVimHook() {
  let hookReturn: UseVimReturn | null = null;

  const setHookReturn = (r: UseVimReturn) => {
    hookReturn = r;
  };

  const { rerender, unmount } = render(<TestHarness onHookReturn={setHookReturn} />);

  return {
    get current() {
      if (!hookReturn) throw new Error("Hook not initialized");
      return hookReturn;
    },
    rerender: () => {
      rerender(<TestHarness onHookReturn={setHookReturn} />);
    },
    unmount,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("useVim", () => {
  describe("initial state", () => {
    it("starts with Vim disabled", () => {
      const result = renderVimHook();

      expect(result.current.enabled).toBe(false);
    });

    it("starts in NORMAL mode", () => {
      const result = renderVimHook();

      expect(result.current.mode).toBe("NORMAL");
    });
  });

  describe("toggle", () => {
    it("enables Vim mode when disabled", () => {
      const result = renderVimHook();

      result.current.toggle();
      result.rerender();

      expect(result.current.enabled).toBe(true);
    });

    it("disables Vim mode when enabled", () => {
      const result = renderVimHook();

      result.current.toggle();
      result.rerender();
      expect(result.current.enabled).toBe(true);

      result.current.toggle();
      result.rerender();
      expect(result.current.enabled).toBe(false);
    });

    it("resets to NORMAL mode when toggling", () => {
      const result = renderVimHook();

      result.current.toggle();
      result.rerender();
      result.current.setMode("INSERT");
      result.rerender();

      result.current.toggle();
      result.rerender();

      result.current.toggle();
      result.rerender();
      expect(result.current.mode).toBe("NORMAL");
    });
  });

  describe("setMode", () => {
    it("changes to INSERT mode", () => {
      const result = renderVimHook();

      result.current.setMode("INSERT");
      result.rerender();

      expect(result.current.mode).toBe("INSERT");
    });

    it("changes to VISUAL mode", () => {
      const result = renderVimHook();

      result.current.setMode("VISUAL");
      result.rerender();

      expect(result.current.mode).toBe("VISUAL");
    });

    it("changes to COMMAND mode", () => {
      const result = renderVimHook();

      result.current.setMode("COMMAND");
      result.rerender();

      expect(result.current.mode).toBe("COMMAND");
    });
  });

  describe("handleKey when disabled", () => {
    it("returns null for all keys when Vim is disabled", () => {
      const result = renderVimHook();

      expect(result.current.handleKey("h")).toBeNull();
      expect(result.current.handleKey("j")).toBeNull();
      expect(result.current.handleKey("i")).toBeNull();
      expect(result.current.handleKey("escape")).toBeNull();
    });
  });

  describe("NORMAL mode motions", () => {
    it("returns motion action for h (left)", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("h");

      expect(action).toEqual({ type: "motion", direction: "h" });
    });

    it("returns motion action for j (down)", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("j");

      expect(action).toEqual({ type: "motion", direction: "j" });
    });

    it("returns motion action for k (up)", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("k");

      expect(action).toEqual({ type: "motion", direction: "k" });
    });

    it("returns motion action for l (right)", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("l");

      expect(action).toEqual({ type: "motion", direction: "l" });
    });

    it("returns motion action for w (word forward)", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("w");

      expect(action).toEqual({ type: "motion", direction: "w" });
    });

    it("returns motion action for b (word backward)", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("b");

      expect(action).toEqual({ type: "motion", direction: "b" });
    });

    it("returns motion action for e (word end)", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("e");

      expect(action).toEqual({ type: "motion", direction: "e" });
    });

    it("returns motion action for 0 (line start)", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("0");

      expect(action).toEqual({ type: "motion", direction: "0" });
    });

    it("returns motion action for $ (line end)", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("$");

      expect(action).toEqual({ type: "motion", direction: "$" });
    });
  });

  describe("NORMAL mode transitions", () => {
    it("transitions to INSERT mode on i", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("i");
      result.rerender();

      expect(action).toEqual({ type: "mode", target: "INSERT" });
      expect(result.current.mode).toBe("INSERT");
    });

    it("transitions to INSERT mode on a", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("a");
      result.rerender();

      expect(action).toEqual({ type: "mode", target: "INSERT" });
      expect(result.current.mode).toBe("INSERT");
    });

    it("transitions to VISUAL mode on v", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("v");
      result.rerender();

      expect(action).toEqual({ type: "mode", target: "VISUAL" });
      expect(result.current.mode).toBe("VISUAL");
    });

    it("transitions to COMMAND mode on :", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey(":");
      result.rerender();

      expect(action).toEqual({ type: "mode", target: "COMMAND" });
      expect(result.current.mode).toBe("COMMAND");
    });
  });

  describe("NORMAL mode edit actions", () => {
    it("returns delete action for x", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("x");

      expect(action).toEqual({ type: "delete" });
    });

    it("returns delete action for d", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("d");

      expect(action).toEqual({ type: "delete" });
    });

    it("returns yank action for y", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("y");

      expect(action).toEqual({ type: "yank" });
    });

    it("returns paste action for p", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      const action = result.current.handleKey("p");

      expect(action).toEqual({ type: "paste" });
    });
  });

  describe("INSERT mode", () => {
    it("returns to NORMAL mode on escape", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();
      result.current.setMode("INSERT");
      result.rerender();

      const action = result.current.handleKey("escape");
      result.rerender();

      expect(action).toEqual({ type: "mode", target: "NORMAL" });
      expect(result.current.mode).toBe("NORMAL");
    });

    it("returns to NORMAL mode on Ctrl+c", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();
      result.current.setMode("INSERT");
      result.rerender();

      const action = result.current.handleKey("c", { ctrl: true });
      result.rerender();

      expect(action).toEqual({ type: "mode", target: "NORMAL" });
      expect(result.current.mode).toBe("NORMAL");
    });

    it("returns to NORMAL mode on Ctrl+[", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();
      result.current.setMode("INSERT");
      result.rerender();

      const action = result.current.handleKey("[", { ctrl: true });
      result.rerender();

      expect(action).toEqual({ type: "mode", target: "NORMAL" });
      expect(result.current.mode).toBe("NORMAL");
    });

    it("returns null for regular keys (pass through)", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();
      result.current.setMode("INSERT");
      result.rerender();

      expect(result.current.handleKey("a")).toBeNull();
      expect(result.current.handleKey("h")).toBeNull();
      expect(result.current.handleKey("1")).toBeNull();
    });
  });

  describe("VISUAL mode", () => {
    it("supports motion keys", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();
      result.current.setMode("VISUAL");
      result.rerender();

      expect(result.current.handleKey("h")).toEqual({ type: "motion", direction: "h" });
      expect(result.current.handleKey("j")).toEqual({ type: "motion", direction: "j" });
      expect(result.current.handleKey("w")).toEqual({ type: "motion", direction: "w" });
    });

    it("returns to NORMAL mode on escape", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();
      result.current.setMode("VISUAL");
      result.rerender();

      const action = result.current.handleKey("escape");
      result.rerender();

      expect(action).toEqual({ type: "mode", target: "NORMAL" });
      expect(result.current.mode).toBe("NORMAL");
    });

    it("returns to NORMAL mode on v", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();
      result.current.setMode("VISUAL");
      result.rerender();

      const action = result.current.handleKey("v");
      result.rerender();

      expect(action).toEqual({ type: "mode", target: "NORMAL" });
      expect(result.current.mode).toBe("NORMAL");
    });

    it("yanks selection and returns to NORMAL on y", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();
      result.current.setMode("VISUAL");
      result.rerender();

      const action = result.current.handleKey("y");
      result.rerender();

      expect(action).toEqual({ type: "yank" });
      expect(result.current.mode).toBe("NORMAL");
    });

    it("deletes selection and returns to NORMAL on d", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();
      result.current.setMode("VISUAL");
      result.rerender();

      const action = result.current.handleKey("d");
      result.rerender();

      expect(action).toEqual({ type: "delete" });
      expect(result.current.mode).toBe("NORMAL");
    });
  });

  describe("COMMAND mode", () => {
    it("returns to NORMAL mode on escape", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();
      result.current.setMode("COMMAND");
      result.rerender();

      const action = result.current.handleKey("escape");
      result.rerender();

      expect(action).toEqual({ type: "mode", target: "NORMAL" });
      expect(result.current.mode).toBe("NORMAL");
    });

    it("returns null for regular keys (pass through for command input)", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();
      result.current.setMode("COMMAND");
      result.rerender();

      expect(result.current.handleKey("w")).toBeNull();
      expect(result.current.handleKey("q")).toBeNull();
    });
  });

  describe("unknown keys", () => {
    it("returns null for unknown keys in NORMAL mode", () => {
      const result = renderVimHook();
      result.current.toggle();
      result.rerender();

      expect(result.current.handleKey("z")).toBeNull();
      expect(result.current.handleKey("1")).toBeNull();
      expect(result.current.handleKey("@")).toBeNull();
    });
  });
});
