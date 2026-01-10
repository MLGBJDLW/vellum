/**
 * Regression tests for Ctrl+<key> input handling via Ink's stdin.
 *
 * These tests specifically validate that actual control-character sequences
 * produced by terminals (e.g. Ctrl+G => \x07) trigger our hotkey handlers.
 */

import { render } from "ink-testing-library";
import type React from "react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppProvider } from "../../context/AppContext.js";
import type { HotkeyDefinition } from "../useHotkeys.js";
import { useHotkeys } from "../useHotkeys.js";

function Harness({ hotkeys }: { hotkeys: ReadonlyArray<HotkeyDefinition> }): React.ReactElement {
  useHotkeys(hotkeys, { enabled: true });
  return null as unknown as React.ReactElement;
}

async function tick(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe("useHotkeys - ctrl control-character sequences", () => {
  it("triggers Ctrl+G hotkey when stdin receives \\x07", async () => {
    const handler = vi.fn();

    const { stdin } = render(
      <AppProvider>
        <Harness hotkeys={[{ key: "g", ctrl: true, handler }]} />
      </AppProvider>
    );

    await act(async () => {
      stdin.write("\x07");
      await tick();
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("triggers Ctrl+P hotkey when stdin receives \\x10", async () => {
    const handler = vi.fn();

    const { stdin } = render(
      <AppProvider>
        <Harness hotkeys={[{ key: "p", ctrl: true, handler }]} />
      </AppProvider>
    );

    await act(async () => {
      stdin.write("\x10");
      await tick();
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("triggers Ctrl+T hotkey when stdin receives \\x14", async () => {
    const handler = vi.fn();

    const { stdin } = render(
      <AppProvider>
        <Harness hotkeys={[{ key: "t", ctrl: true, handler }]} />
      </AppProvider>
    );

    await act(async () => {
      stdin.write("\x14");
      await tick();
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("triggers Ctrl+\\ hotkey when stdin receives \\x1c (Windows/Ink behavior)", async () => {
    const handler = vi.fn();

    const { stdin } = render(
      <AppProvider>
        <Harness hotkeys={[{ key: "\\", ctrl: true, handler }]} />
      </AppProvider>
    );

    await act(async () => {
      stdin.write("\x1c");
      await tick();
    });

    // On Windows/Ink, Ctrl+\\ arrives as the raw control byte 0x1C.
    // We normalize that sequence so it matches the configured { key: "\\", ctrl: true } hotkey.
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
