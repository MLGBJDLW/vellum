/**
 * useModeShortcuts Hook Tests (T046)
 *
 * Focus: ensure mode switching goes through ModeManager (including spec confirmation).
 */

import type { CodingMode, ModeManager } from "@vellum/core";
import { createModeManager } from "@vellum/core";
import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { type UseModeShortcutsReturn, useModeShortcuts } from "../useModeShortcuts.js";

// =============================================================================
// Test Harness
// =============================================================================

interface TestHarnessProps {
  readonly modeManager: ModeManager | null;
  readonly enabled?: boolean;
  readonly onHookReturn: (hookReturn: UseModeShortcutsReturn) => void;
  readonly onModeSwitch?: (mode: CodingMode, success: boolean) => void;
  readonly onError?: (mode: CodingMode, error: string) => void;
}

function TestHarness({
  modeManager,
  enabled,
  onHookReturn,
  onModeSwitch,
  onError,
}: TestHarnessProps): React.ReactElement {
  const hookReturn = useModeShortcuts({ modeManager, enabled, onModeSwitch, onError });
  onHookReturn(hookReturn);
  return null as unknown as React.ReactElement;
}

function renderUseModeShortcutsHook(options: Omit<TestHarnessProps, "onHookReturn">) {
  let hookReturn: UseModeShortcutsReturn | null = null;

  const { rerender, unmount } = render(
    <TestHarness
      modeManager={options.modeManager}
      enabled={options.enabled}
      onModeSwitch={options.onModeSwitch}
      onError={options.onError}
      onHookReturn={(r) => {
        hookReturn = r;
      }}
    />
  );

  return {
    get current() {
      if (!hookReturn) {
        throw new Error("Hook return not initialized");
      }
      return hookReturn;
    },
    rerender: (next: Omit<TestHarnessProps, "onHookReturn">) => {
      rerender(
        <TestHarness
          modeManager={next.modeManager}
          enabled={next.enabled}
          onModeSwitch={next.onModeSwitch}
          onError={next.onError}
          onHookReturn={(r) => {
            hookReturn = r;
          }}
        />
      );
    },
    unmount,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("useModeShortcuts", () => {
  it("switches mode through ModeManager", async () => {
    const manager = createModeManager({ initialMode: "vibe", requireSpecConfirmation: true });
    const onModeSwitch = vi.fn();
    const onError = vi.fn();

    const result = renderUseModeShortcutsHook({
      modeManager: manager,
      enabled: true,
      onModeSwitch,
      onError,
    });

    const success = await result.current.switchMode("plan");

    expect(success).toBe(true);
    expect(manager.getCurrentMode()).toBe("plan");
    expect(onModeSwitch).toHaveBeenCalledWith("plan", true);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not bypass spec confirmation when required", async () => {
    const manager = createModeManager({ initialMode: "vibe", requireSpecConfirmation: true });
    const onModeSwitch = vi.fn();
    const onError = vi.fn();

    const result = renderUseModeShortcutsHook({
      modeManager: manager,
      enabled: true,
      onModeSwitch,
      onError,
    });

    const success = await result.current.switchMode("spec");

    // When spec confirmation is required, ModeManager should not immediately switch.
    expect(success).toBe(false);
    expect(manager.getCurrentMode()).toBe("vibe");
    expect(manager.isPendingSpecConfirmation()).toBe(true);
    expect(onModeSwitch).toHaveBeenCalledWith("spec", false);
    expect(onError).toHaveBeenCalled();
  });

  it("is inactive when disabled or manager is null", async () => {
    const onModeSwitch = vi.fn();
    const onError = vi.fn();

    const result = renderUseModeShortcutsHook({
      modeManager: null,
      enabled: true,
      onModeSwitch,
      onError,
    });

    expect(result.current.isActive).toBe(false);

    const success = await result.current.switchMode("plan");
    expect(success).toBe(false);
    expect(onModeSwitch).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });
});
