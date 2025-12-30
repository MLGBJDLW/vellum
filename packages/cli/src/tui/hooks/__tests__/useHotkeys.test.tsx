/**
 * useHotkeys Hook Tests (T042)
 *
 * Tests for the useHotkeys hook which manages keyboard shortcuts.
 *
 * @module @vellum/cli
 */

import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "../../context/AppContext.js";
import {
  createStandardHotkeys,
  formatHotkey,
  generateHotkeyHelp,
  type HotkeyDefinition,
  type UseHotkeysOptions,
  type UseHotkeysReturn,
  useHotkeys,
} from "../useHotkeys.js";

// =============================================================================
// Test Helper Component
// =============================================================================

interface TestHarnessProps {
  hotkeys: ReadonlyArray<HotkeyDefinition>;
  options?: UseHotkeysOptions;
  onHookReturn: (hookReturn: UseHotkeysReturn) => void;
}

function TestHarness({ hotkeys, options, onHookReturn }: TestHarnessProps): React.ReactElement {
  const hookReturn = useHotkeys(hotkeys, options);
  onHookReturn(hookReturn);
  return null as unknown as React.ReactElement;
}

/**
 * Render the hook with AppProvider context.
 */
function renderHotkeysHook(hotkeys: ReadonlyArray<HotkeyDefinition>, options?: UseHotkeysOptions) {
  let hookReturn: UseHotkeysReturn | null = null;

  const { rerender, unmount } = render(
    <AppProvider>
      <TestHarness hotkeys={hotkeys} options={options} onHookReturn={(r) => (hookReturn = r)} />
    </AppProvider>
  );

  return {
    get current() {
      return hookReturn!;
    },
    rerender: (newHotkeys?: ReadonlyArray<HotkeyDefinition>, newOptions?: UseHotkeysOptions) => {
      rerender(
        <AppProvider>
          <TestHarness
            hotkeys={newHotkeys ?? hotkeys}
            options={newOptions ?? options}
            onHookReturn={(r) => (hookReturn = r)}
          />
        </AppProvider>
      );
    },
    unmount,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("useHotkeys", () => {
  describe("initialization", () => {
    it("returns hotkeys array", () => {
      const hotkeys: HotkeyDefinition[] = [
        { key: "c", ctrl: true, handler: vi.fn(), description: "Test" },
      ];

      const result = renderHotkeysHook(hotkeys);

      expect(result.current.hotkeys).toHaveLength(1);
      expect(result.current.hotkeys.at(0)!.key).toBe("c");
    });

    it("applies default scope to hotkeys without scope", () => {
      const hotkeys: HotkeyDefinition[] = [{ key: "c", ctrl: true, handler: vi.fn() }];

      const result = renderHotkeysHook(hotkeys);

      expect(result.current.hotkeys.at(0)!.scope).toBe("global");
    });

    it("preserves explicit scope on hotkeys", () => {
      const hotkeys: HotkeyDefinition[] = [
        { key: "v", ctrl: true, handler: vi.fn(), scope: "input" },
      ];

      const result = renderHotkeysHook(hotkeys);

      expect(result.current.hotkeys.at(0)!.scope).toBe("input");
    });

    it("overrides scope with options.scope", () => {
      const hotkeys: HotkeyDefinition[] = [
        { key: "c", ctrl: true, handler: vi.fn(), scope: "input" },
      ];

      const result = renderHotkeysHook(hotkeys, { scope: "messages" });

      expect(result.current.hotkeys.at(0)!.scope).toBe("messages");
    });
  });

  describe("matchHotkey", () => {
    it("matches simple key", () => {
      const handler = vi.fn();
      const hotkeys: HotkeyDefinition[] = [{ key: "f1", handler, description: "Help" }];

      const result = renderHotkeysHook(hotkeys);
      const match = result.current.matchHotkey("f1", {});

      expect(match).not.toBeNull();
      expect(match?.key).toBe("f1");
    });

    it("matches key with ctrl modifier", () => {
      const handler = vi.fn();
      const hotkeys: HotkeyDefinition[] = [
        { key: "c", ctrl: true, handler, description: "Interrupt" },
      ];

      const result = renderHotkeysHook(hotkeys);

      // Without ctrl - no match
      expect(result.current.matchHotkey("c", {})).toBeNull();

      // With ctrl - matches
      const match = result.current.matchHotkey("c", { ctrl: true });
      expect(match).not.toBeNull();
      expect(match?.key).toBe("c");
    });

    it("matches key with shift modifier", () => {
      const handler = vi.fn();
      const hotkeys: HotkeyDefinition[] = [
        { key: "a", shift: true, handler, description: "Select all" },
      ];

      const result = renderHotkeysHook(hotkeys);

      // Without shift - no match
      expect(result.current.matchHotkey("a", {})).toBeNull();

      // With shift - matches
      const match = result.current.matchHotkey("a", { shift: true });
      expect(match).not.toBeNull();
    });

    it("matches key with multiple modifiers", () => {
      const handler = vi.fn();
      const hotkeys: HotkeyDefinition[] = [
        {
          key: "!",
          ctrl: true,
          shift: true,
          handler,
          description: "Trust mode 1",
        },
      ];

      const result = renderHotkeysHook(hotkeys);

      // Missing modifiers - no match
      expect(result.current.matchHotkey("!", { ctrl: true })).toBeNull();
      expect(result.current.matchHotkey("!", { shift: true })).toBeNull();

      // All modifiers - matches
      const match = result.current.matchHotkey("!", {
        ctrl: true,
        shift: true,
      });
      expect(match).not.toBeNull();
    });

    it("returns null when no hotkey matches", () => {
      const hotkeys: HotkeyDefinition[] = [{ key: "c", ctrl: true, handler: vi.fn() }];

      const result = renderHotkeysHook(hotkeys);

      expect(result.current.matchHotkey("x", {})).toBeNull();
      expect(result.current.matchHotkey("c", { shift: true })).toBeNull();
    });

    it("matches first hotkey when multiple could match", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const hotkeys: HotkeyDefinition[] = [
        { key: "c", ctrl: true, handler: handler1, description: "First" },
        { key: "c", ctrl: true, handler: handler2, description: "Second" },
      ];

      const result = renderHotkeysHook(hotkeys);
      const match = result.current.matchHotkey("c", { ctrl: true });

      expect(match?.description).toBe("First");
    });
  });

  describe("key normalization", () => {
    it("normalizes key case", () => {
      const handler = vi.fn();
      const hotkeys: HotkeyDefinition[] = [{ key: "F1", handler }];

      const result = renderHotkeysHook(hotkeys);

      // Should match regardless of case
      expect(result.current.matchHotkey("f1", {})).not.toBeNull();
      expect(result.current.matchHotkey("F1", {})).not.toBeNull();
    });

    it("normalizes escape key", () => {
      const handler = vi.fn();
      const hotkeys: HotkeyDefinition[] = [{ key: "escape", handler }];

      const result = renderHotkeysHook(hotkeys);

      expect(result.current.matchHotkey("escape", {})).not.toBeNull();
      expect(result.current.matchHotkey("esc", {})).not.toBeNull();
    });

    it("normalizes return/enter key", () => {
      const handler = vi.fn();
      const hotkeys: HotkeyDefinition[] = [{ key: "return", handler }];

      const result = renderHotkeysHook(hotkeys);

      expect(result.current.matchHotkey("return", {})).not.toBeNull();
      expect(result.current.matchHotkey("enter", {})).not.toBeNull();
    });
  });
});

describe("createStandardHotkeys", () => {
  it("creates empty array with no handlers", () => {
    const hotkeys = createStandardHotkeys({});

    expect(hotkeys).toHaveLength(0);
  });

  it("creates interrupt hotkey", () => {
    const onInterrupt = vi.fn();
    const hotkeys = createStandardHotkeys({ onInterrupt });

    expect(hotkeys).toHaveLength(1);
    expect(hotkeys.at(0)!.key).toBe("c");
    expect(hotkeys.at(0)!.ctrl).toBe(true);
    expect(hotkeys.at(0)!.scope).toBe("global");
  });

  it("creates clear screen hotkey", () => {
    const onClearScreen = vi.fn();
    const hotkeys = createStandardHotkeys({ onClearScreen });

    expect(hotkeys).toHaveLength(1);
    expect(hotkeys.at(0)!.key).toBe("l");
    expect(hotkeys.at(0)!.ctrl).toBe(true);
  });

  it("creates vim toggle hotkey with input scope", () => {
    const onToggleVim = vi.fn();
    const hotkeys = createStandardHotkeys({ onToggleVim });

    expect(hotkeys).toHaveLength(1);
    expect(hotkeys.at(0)!.key).toBe("v");
    expect(hotkeys.at(0)!.ctrl).toBe(true);
    expect(hotkeys.at(0)!.scope).toBe("input");
  });

  it("creates help hotkey for F1", () => {
    const onShowHelp = vi.fn();
    const hotkeys = createStandardHotkeys({ onShowHelp });

    expect(hotkeys).toHaveLength(1);
    expect(hotkeys.at(0)!.key).toBe("f1");
    expect(hotkeys.at(0)!.ctrl).toBeUndefined();
  });

  it("creates trust mode hotkeys with ctrl+shift", () => {
    const onTrustMode1 = vi.fn();
    const onTrustMode2 = vi.fn();
    const hotkeys = createStandardHotkeys({ onTrustMode1, onTrustMode2 });

    expect(hotkeys).toHaveLength(2);

    const mode1 = hotkeys.find((h) => h.description === "Paranoid mode");
    expect(mode1?.ctrl).toBe(true);
    expect(mode1?.shift).toBe(true);

    const mode2 = hotkeys.find((h) => h.description === "Cautious mode");
    expect(mode2?.ctrl).toBe(true);
    expect(mode2?.shift).toBe(true);
  });

  it("creates all standard hotkeys when all handlers provided", () => {
    const hotkeys = createStandardHotkeys({
      onInterrupt: vi.fn(),
      onClearScreen: vi.fn(),
      onToggleVim: vi.fn(),
      onAcceptSuggestion: vi.fn(),
      onToggleThinking: vi.fn(),
      onShowHelp: vi.fn(),
      onTrustMode1: vi.fn(),
      onTrustMode2: vi.fn(),
      onTrustMode3: vi.fn(),
      onTrustMode4: vi.fn(),
      onTrustMode5: vi.fn(),
    });

    expect(hotkeys).toHaveLength(11);
  });
});

describe("formatHotkey", () => {
  it("formats simple key", () => {
    const hotkey: HotkeyDefinition = { key: "f1", handler: vi.fn() };

    expect(formatHotkey(hotkey)).toBe("f1");
  });

  it("formats key with ctrl", () => {
    const hotkey: HotkeyDefinition = {
      key: "c",
      ctrl: true,
      handler: vi.fn(),
    };

    expect(formatHotkey(hotkey)).toBe("Ctrl+C");
  });

  it("formats key with shift", () => {
    const hotkey: HotkeyDefinition = {
      key: "a",
      shift: true,
      handler: vi.fn(),
    };

    expect(formatHotkey(hotkey)).toBe("Shift+A");
  });

  it("formats key with alt", () => {
    const hotkey: HotkeyDefinition = {
      key: "x",
      alt: true,
      handler: vi.fn(),
    };

    expect(formatHotkey(hotkey)).toBe("Alt+X");
  });

  it("formats key with multiple modifiers", () => {
    const hotkey: HotkeyDefinition = {
      key: "!",
      ctrl: true,
      shift: true,
      handler: vi.fn(),
    };

    expect(formatHotkey(hotkey)).toBe("Ctrl+Shift+!");
  });

  it("formats key with all modifiers", () => {
    const hotkey: HotkeyDefinition = {
      key: "z",
      ctrl: true,
      shift: true,
      alt: true,
      handler: vi.fn(),
    };

    expect(formatHotkey(hotkey)).toBe("Ctrl+Shift+Alt+Z");
  });
});

describe("generateHotkeyHelp", () => {
  it("generates help header", () => {
    const hotkeys: HotkeyDefinition[] = [];
    const help = generateHotkeyHelp(hotkeys);

    expect(help).toContain("Keyboard Shortcuts:");
  });

  it("groups hotkeys by scope", () => {
    const hotkeys: HotkeyDefinition[] = [
      { key: "c", ctrl: true, handler: vi.fn(), scope: "global" },
      { key: "v", ctrl: true, handler: vi.fn(), scope: "input" },
    ];

    const help = generateHotkeyHelp(hotkeys);

    expect(help).toContain("Global:");
    expect(help).toContain("Input Area:");
  });

  it("includes hotkey descriptions", () => {
    const hotkeys: HotkeyDefinition[] = [
      {
        key: "c",
        ctrl: true,
        handler: vi.fn(),
        description: "Interrupt operation",
        scope: "global",
      },
    ];

    const help = generateHotkeyHelp(hotkeys);

    expect(help).toContain("Interrupt operation");
  });

  it("uses default description when none provided", () => {
    const hotkeys: HotkeyDefinition[] = [{ key: "x", handler: vi.fn(), scope: "global" }];

    const help = generateHotkeyHelp(hotkeys);

    expect(help).toContain("No description");
  });

  it("formats hotkey combinations correctly", () => {
    const hotkeys: HotkeyDefinition[] = [
      {
        key: "c",
        ctrl: true,
        handler: vi.fn(),
        description: "Test",
        scope: "global",
      },
    ];

    const help = generateHotkeyHelp(hotkeys);

    expect(help).toContain("Ctrl+C");
  });
});
