import type { CodingMode } from "@vellum/core";
import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import type React from "react";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MouseInteractionScope } from "../../context/MouseContext.js";
import { ThemeProvider } from "../../theme/index.js";
import { globalClickRegistry } from "../../utils/click-region.js";
import { parseMouseEvent } from "../../utils/mouse-parser.js";
import { ModeSelector } from "../ModeSelector.js";
import { SIDEBAR_PANELS, SidebarHeader } from "../Sidebar/SidebarHeader.js";
import { StatusBar } from "../StatusBar/StatusBar.js";

afterEach(async () => {
  await act(async () => cleanup());
  globalClickRegistry.clear();
});

function wrap(element: React.ReactNode, enabled = true, width = 90) {
  return (
    <ThemeProvider>
      <MouseInteractionScope enabled={enabled}>
        <Box width={width} marginLeft={4} marginTop={2}>
          {element}
        </Box>
      </MouseInteractionScope>
    </ThemeProvider>
  );
}

function position(screen: ReturnType<typeof render>, label: string) {
  const lines = (screen.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes(label));
  expect(row, `Missing rendered label: ${label}`).toBeGreaterThanOrEqual(0);
  const line = lines[row] ?? "";
  return { col: stringWidth(line.slice(0, line.indexOf(label))) + 1, row: row + 1 };
}

function pointer({ col, row }: { col: number; row: number }, suffix: "M" | "m") {
  const event = parseMouseEvent(`\x1b[<0;${col};${row}${suffix}`);
  if (!event) throw new Error("Invalid mouse fixture");
  globalClickRegistry.dispatch(col, row, event);
}

function click(screen: ReturnType<typeof render>, label: string) {
  const target = position(screen, label);
  pointer(target, "M");
  pointer(target, "m");
}

async function send(screen: ReturnType<typeof render>, keys: string) {
  await act(async () => {
    screen.stdin.write(keys);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("mode, status and sidebar entrypoints", () => {
  it("renders all existing modes and chooses the clicked row on release", async () => {
    const onSelect = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(wrap(<ModeSelector currentMode="plan" onSelect={onSelect} />));
    });
    for (const mode of ["orch", "vibe", "plan", "spec"] as const)
      expect(screen.lastFrame()).toContain(mode);
    const target = position(screen, "[4] spec");
    await act(async () => {
      pointer(target, "M");
    });
    expect(onSelect).not.toHaveBeenCalled();
    await act(async () => {
      pointer(target, "m");
    });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("spec");
  });

  it("keeps the current mode as initial selection and supports coalesced arrows/Enter plus digits", async () => {
    const onSelect = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(wrap(<ModeSelector currentMode="plan" onSelect={onSelect} />));
    });
    await send(screen, "\r");
    expect(onSelect).toHaveBeenLastCalledWith("plan");
    await send(screen, "\x1b[A\x1b[A\r");
    expect(onSelect).toHaveBeenLastCalledWith("orch");
    for (const [index, mode] of (["orch", "vibe", "plan", "spec"] as CodingMode[]).entries()) {
      await send(screen, String(index + 1));
      expect(onSelect).toHaveBeenLastCalledWith(mode);
    }
  });

  it("routes thinking and approval labels independently and leaves absent handlers as readings", async () => {
    const thinking = vi.fn();
    const approval = vi.fn();
    let screen!: ReturnType<typeof render>;
    const content = (interactive: boolean) =>
      wrap(
        <StatusBar
          trustMode="ask"
          thinking={{ active: false }}
          onThinkingClick={interactive ? thinking : undefined}
          onApprovalClick={interactive ? approval : undefined}
        />
      );
    await act(async () => {
      screen = render(content(true));
    });
    await act(async () => {
      click(screen, "Think");
    });
    expect(thinking).toHaveBeenCalledTimes(1);
    expect(approval).not.toHaveBeenCalled();
    await act(async () => {
      click(screen, "Approval: Ask");
    });
    expect(approval).toHaveBeenCalledTimes(1);
    await act(async () => {
      screen.rerender(content(false));
    });
    await act(async () => {
      click(screen, "Think");
      click(screen, "Approval: Ask");
    });
    expect(thinking).toHaveBeenCalledTimes(1);
    expect(approval).toHaveBeenCalledTimes(1);
  });

  it("cycles the six sidebar panels in both directions and closes with separate compact controls", async () => {
    const select = vi.fn();
    const close = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        wrap(
          <SidebarHeader panel="todo" isFocused={false} onSelectPanel={select} onClose={close} />,
          true,
          28
        )
      );
    });
    await act(async () => {
      click(screen, "[‹]");
    });
    expect(select).toHaveBeenLastCalledWith(SIDEBAR_PANELS.at(-1));
    await act(async () => {
      click(screen, "[›]");
    });
    expect(select).toHaveBeenLastCalledWith("memory");
    expect(close).not.toHaveBeenCalled();
    await act(async () => {
      click(screen, "[×]");
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("refreshes mode selection when the current mode changes and disables all input when inactive", async () => {
    const onSelect = vi.fn();
    let screen!: ReturnType<typeof render>;
    const content = (currentMode: CodingMode, isActive = true) =>
      wrap(<ModeSelector currentMode={currentMode} isActive={isActive} onSelect={onSelect} />);
    await act(async () => {
      screen = render(content("spec"));
    });
    expect(screen.lastFrame()).toContain("❯ [4] spec");
    await send(screen, "\x1b[A");
    await act(async () => {
      screen.rerender(content("vibe"));
    });
    expect(screen.lastFrame()).toContain("❯ [2] vibe");
    await send(screen, "\r");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("vibe");
    await act(async () => {
      screen.rerender(content("vibe", false));
    });
    await act(async () => {
      click(screen, "[4] spec");
    });
    await send(screen, "\x1b[B\r4");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("makes mode descriptions part of their own clickable rows", async () => {
    const onSelect = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(wrap(<ModeSelector currentMode="orch" onSelect={onSelect} />));
    });
    await act(async () => {
      click(screen, "6-phase workflow");
    });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("spec");
  });

  it("keeps each sidebar panel's next/previous targets current after rerender", async () => {
    const select = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        wrap(
          <SidebarHeader panel="todo" isFocused onSelectPanel={select} onClose={vi.fn()} />,
          true,
          24
        )
      );
    });
    for (const [index, panel] of SIDEBAR_PANELS.entries()) {
      await act(async () => {
        screen.rerender(
          wrap(
            <SidebarHeader panel={panel} isFocused onSelectPanel={select} onClose={vi.fn()} />,
            true,
            24
          )
        );
      });
      expect(screen.lastFrame()).toContain(`${index + 1}/6`);
      await act(async () => {
        click(screen, "[›]");
      });
      expect(select).toHaveBeenLastCalledWith(SIDEBAR_PANELS[(index + 1) % 6]);
      await act(async () => {
        click(screen, "[‹]");
      });
      expect(select).toHaveBeenLastCalledWith(SIDEBAR_PANELS[(index + 5) % 6]);
    }
  });

  it("keeps read-only sidebar headers compact and honors mouseEnabled", async () => {
    const select = vi.fn();
    const close = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(wrap(<SidebarHeader panel="memory" isFocused={false} />, true, 24));
    });
    expect(screen.lastFrame()).toContain("2/6");
    expect(screen.lastFrame()).not.toContain("[‹]");
    expect(screen.lastFrame()).not.toContain("[×]");
    await act(async () => {
      screen.rerender(
        wrap(
          <SidebarHeader
            panel="memory"
            isFocused={false}
            mouseEnabled={false}
            onSelectPanel={select}
            onClose={close}
          />,
          true,
          24
        )
      );
    });
    await act(async () => {
      click(screen, "[‹]");
      click(screen, "[›]");
      click(screen, "[×]");
    });
    expect(select).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("suppresses all new controls when an overlay disables their mouse scope", async () => {
    const mode = vi.fn();
    const thinking = vi.fn();
    const approval = vi.fn();
    const select = vi.fn();
    const close = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        wrap(
          <Box flexDirection="column">
            <ModeSelector currentMode="orch" onSelect={mode} />
            <StatusBar
              trustMode="ask"
              thinking={{ active: true }}
              onThinkingClick={thinking}
              onApprovalClick={approval}
            />
            <SidebarHeader panel="todo" isFocused onSelectPanel={select} onClose={close} />
          </Box>,
          false
        )
      );
    });
    await act(async () => {
      for (const label of ["[2] vibe", "Think", "Approval: Ask", "[‹]", "[›]", "[×]"])
        click(screen, label);
    });
    for (const callback of [mode, thinking, approval, select, close])
      expect(callback).not.toHaveBeenCalled();
  });
});
