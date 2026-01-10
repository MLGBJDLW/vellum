/**
 * useBacktrack Hook Tests (T058)
 *
 * Verifies core backtrack/branching behavior:
 * - initializes with a main branch
 * - push/undo/redo update currentState
 * - createBranch creates and switches to a new branch
 * - switchBranch switches branches and restores that branch's latest snapshot
 */

import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  type UseBacktrackOptions,
  type UseBacktrackReturn,
  useBacktrack,
} from "../useBacktrack.js";

// =============================================================================
// Test Helper Component
// =============================================================================

type TestState = { value: number };

interface TestHarnessProps {
  options: UseBacktrackOptions<TestState>;
  onHookReturn: (hookReturn: UseBacktrackReturn<TestState>) => void;
}

function TestHarness({ options, onHookReturn }: TestHarnessProps): React.ReactElement {
  const hookReturn = useBacktrack(options);
  onHookReturn(hookReturn);
  return null as unknown as React.ReactElement;
}

function renderHook(options: UseBacktrackOptions<TestState>) {
  let hookReturn: UseBacktrackReturn<TestState> | null = null;

  const setHookReturn = (r: UseBacktrackReturn<TestState>) => {
    hookReturn = r;
  };

  const { rerender, unmount } = render(
    <TestHarness options={options} onHookReturn={setHookReturn} />
  );

  return {
    get current() {
      if (!hookReturn) throw new Error("Hook not initialized");
      return hookReturn;
    },
    rerender: (newOptions?: UseBacktrackOptions<TestState>) => {
      rerender(<TestHarness options={newOptions ?? options} onHookReturn={setHookReturn} />);
    },
    unmount,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("useBacktrack", () => {
  it("initializes with main branch and initial state", () => {
    const result = renderHook({ initialState: { value: 0 } });

    expect(result.current.backtrackState.currentBranch).toBe("Main");
    expect(result.current.backtrackState.historyLength).toBe(1);
    expect(result.current.branches).toHaveLength(1);
    expect(result.current.currentState).toEqual({ value: 0 });
  });

  it("push/undo/redo update currentState", () => {
    const onStateChange = vi.fn();
    const result = renderHook({ initialState: { value: 0 }, onStateChange });

    result.current.push({ value: 1 }, "v1");
    result.rerender();
    expect(result.current.currentState).toEqual({ value: 1 });

    result.current.undo();
    result.rerender();
    expect(result.current.currentState).toEqual({ value: 0 });

    result.current.redo();
    result.rerender();
    expect(result.current.currentState).toEqual({ value: 1 });

    // Callback is best-effort and may be called multiple times; assert at least once.
    expect(onStateChange).toHaveBeenCalled();
  });

  it("createBranch creates and switches to the new branch", () => {
    const result = renderHook({ initialState: { value: 0 } });

    result.current.push({ value: 1 }, "v1");
    result.rerender();

    const branchId = result.current.createBranch("Alt");
    result.rerender();

    expect(typeof branchId).toBe("string");
    expect(result.current.backtrackState.currentBranch).toBe("Alt");
    expect(result.current.branches.length).toBe(2);
  });

  it("switchBranch switches branch and restores that branch's latest snapshot", () => {
    const result = renderHook({ initialState: { value: 0 } });

    // Main branch: 0 -> 1
    result.current.push({ value: 1 }, "main-v1");
    result.rerender();

    // Create Alt branch from current point and diverge
    const altId = result.current.createBranch("Alt");
    result.rerender();
    expect(result.current.backtrackState.currentBranch).toBe("Alt");

    result.current.push({ value: 2 }, "alt-v2");
    result.rerender();
    expect(result.current.currentState).toEqual({ value: 2 });

    // Switch back to main
    result.current.switchBranch("main");
    result.rerender();

    expect(result.current.backtrackState.currentBranch).toBe("Main");
    expect(result.current.currentState).toEqual({ value: 1 });

    // Switch to Alt again
    result.current.switchBranch(altId);
    result.rerender();

    expect(result.current.backtrackState.currentBranch).toBe("Alt");
    expect(result.current.currentState).toEqual({ value: 2 });
  });
});
