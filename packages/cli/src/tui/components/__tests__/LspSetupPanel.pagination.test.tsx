import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import type React from "react";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MouseContext } from "../../context/MouseContext.js";
import { ThemeProvider } from "../../theme/index.js";
import { globalClickRegistry } from "../../utils/click-region.js";
import { type MouseEvent, parseMouseEvent } from "../../utils/mouse-parser.js";
import { LspSetupPanel, type ServerInfo } from "../LspSetupPanel.js";

const servers: ServerInfo[] = Array.from({ length: 25 }, (_, index) => ({
  id: `server-${index}`,
  name: `Server ${String(index).padStart(2, "0")}`,
  installed: false,
  installMethod: "npm",
}));
function harness() {
  const handlers = new Set<(event: MouseEvent) => void>();
  const mouse = {
    isMouseActive: true,
    lastPosition: null,
    onWheel: (handler: (event: MouseEvent) => void) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    onClick: () => () => {},
    onPointer: () => () => {},
    cancelPointerCapture: () => {},
  };
  return {
    wrap: (element: React.ReactNode, hidden = false, width = 46) => (
      <ThemeProvider>
        <MouseContext.Provider value={mouse}>
          <Box width={width} marginLeft={3} marginTop={2} display={hidden ? "none" : "flex"}>
            {element}
          </Box>
        </MouseContext.Provider>
      </ThemeProvider>
    ),
    wheel: (col: number, row: number, down = true) => {
      const event = parseMouseEvent(`\x1b[<${down ? 65 : 64};${col};${row}M`);
      if (!event) throw new Error("Invalid wheel");
      for (const handler of handlers) handler(event);
    },
  };
}
function position(screen: ReturnType<typeof render>, label: string) {
  const lines = (screen.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes(label));
  expect(row, `Missing ${label}: ${screen.lastFrame()}`).toBeGreaterThanOrEqual(0);
  const line = lines[row] ?? "";
  return { col: stringWidth(line.slice(0, line.indexOf(label))) + 1, row: row + 1 };
}
function clickAt(col: number, row: number) {
  for (const suffix of ["M", "m"]) {
    const event = parseMouseEvent(`\x1b[<0;${col};${row}${suffix}`);
    if (!event) throw new Error("Invalid click");
    globalClickRegistry.dispatch(col, row, event);
  }
}
async function click(screen: ReturnType<typeof render>, label: string) {
  const target = position(screen, label);
  await act(async () => {
    clickAt(target.col, target.row);
  });
}
afterEach(async () => {
  await act(async () => cleanup());
  globalClickRegistry.clear();
});

describe("bounded LSP server pagination", () => {
  it("keeps footer actions fixed while real operations are pending or fail", async () => {
    const context = harness();
    let fail!: (error: Error) => void;
    const onInstall = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        })
    );
    const onDetect = vi.fn(async () => []);
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        context.wrap(
          <LspSetupPanel
            maxHeight={12}
            servers={servers}
            onInstall={onInstall}
            onDetect={onDetect}
          />
        )
      );
    });
    const footer = position(screen, "d Detect");
    await click(screen, "Server 00");
    expect(screen.lastFrame()).toContain("Installing Server 00");
    expect(position(screen, "d Detect").row).toBe(footer.row);
    await click(screen, "d Detect");
    expect(onDetect).not.toHaveBeenCalled();
    await act(async () => {
      fail(new Error("fixture failure"));
    });
    expect(screen.lastFrame()).toContain("fixture failure");
    expect(position(screen, "d Detect").row).toBe(footer.row);
    expect((screen.lastFrame() ?? "").split("\n")).toHaveLength(14);
  });

  it("pages through 25 servers while keeping actions fixed and installs only the focused server", async () => {
    const context = harness();
    const onInstall = vi.fn(async (_server: ServerInfo) => {});
    const onDetect = vi.fn(async () => []);
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        context.wrap(
          <LspSetupPanel
            {...{ maxHeight: 12 }}
            servers={servers}
            onInstall={onInstall}
            onDetect={onDetect}
          />
        )
      );
    });
    expect((screen.lastFrame() ?? "").split("\n")).toHaveLength(14);
    expect(screen.lastFrame()).not.toContain("Server 24");
    const target = position(screen, "Server 00");
    const footer = position(screen, "Enter Install");
    await act(async () => {
      context.wheel(1, target.row);
      context.wheel(footer.col, footer.row);
    });
    expect(screen.lastFrame()).toContain("▶ ○ Server 00");
    await act(async () => {
      for (let i = 0; i < 40; i++) context.wheel(target.col, target.row);
    });
    expect(screen.lastFrame()).toContain("▶ ○ Server 24");
    expect(screen.lastFrame()).not.toContain("Server 00");
    expect(position(screen, "Enter Install").row).toBe(footer.row);
    position(screen, "a Install All");
    position(screen, "d Detect");
    position(screen, "Esc Close");
    expect(onInstall).not.toHaveBeenCalled();
    await click(screen, "Enter Install");
    expect(onInstall).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "server-24" }));
    await act(async () => {
      for (let i = 0; i < 40; i++) context.wheel(target.col, target.row, false);
    });
    expect(screen.lastFrame()).toContain("▶ ○ Server 00");
  });
  it("keeps installed servers reachable without enabling install and reflows after resize", async () => {
    const context = harness();
    const onInstall = vi.fn(async (_server: ServerInfo) => {});
    const installed = servers.map((server) => ({ ...server, installed: true }));
    const panel = (maxHeight: number) => (
      <LspSetupPanel
        {...{ maxHeight }}
        servers={installed}
        onInstall={onInstall}
        onDetect={async () => []}
      />
    );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(context.wrap(panel(12)));
    });
    const target = position(screen, "Server 00");
    await act(async () => {
      for (let i = 0; i < 40; i++) context.wheel(target.col, target.row);
    });
    expect(screen.lastFrame()).toContain("Server 24");
    await click(screen, "Enter Install");
    expect(onInstall).not.toHaveBeenCalled();
    await act(async () => {
      screen.rerender(context.wrap(panel(8), false, 35));
    });
    expect((screen.lastFrame() ?? "").split("\n")).toHaveLength(10);
    expect(screen.lastFrame()).toContain("Server 24");
    position(screen, "a Install All");
    position(screen, "d Detect");
    position(screen, "Esc Close");
  });
  it("ignores hidden and inactive wheel input while keyboard navigation also keeps the row in view", async () => {
    const context = harness();
    const panel = (active: boolean) => (
      <LspSetupPanel
        {...{ maxHeight: 12 }}
        isActive={active}
        servers={servers}
        onInstall={async () => {}}
        onDetect={async () => []}
      />
    );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(context.wrap(panel(false)));
    });
    const target = position(screen, "Server 00");
    await act(async () => {
      context.wheel(target.col, target.row);
    });
    expect(screen.lastFrame()).toContain("▶ ○ Server 00");
    await act(async () => {
      screen.rerender(context.wrap(panel(true), true));
    });
    await act(async () => {
      context.wheel(target.col, target.row);
    });
    await act(async () => {
      screen.rerender(context.wrap(panel(true)));
    });
    expect(screen.lastFrame()).toContain("▶ ○ Server 00");
    for (let i = 0; i < 24; i++)
      await act(async () => {
        screen.stdin.write("\x1b[B");
      });
    expect(screen.lastFrame()).toContain("▶ ○ Server 24");
    expect((screen.lastFrame() ?? "").split("\n")).toHaveLength(14);
  });
});
