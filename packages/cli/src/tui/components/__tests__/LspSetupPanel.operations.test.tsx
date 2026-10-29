import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../theme/index.js";
import { globalClickRegistry } from "../../utils/click-region.js";
import { parseMouseEvent } from "../../utils/mouse-parser.js";
import { LspSetupPanel, type LspSetupPanelProps, type ServerInfo } from "../LspSetupPanel.js";

const servers: readonly ServerInfo[] = [
  { id: "typescript", name: "TypeScript Language Server", installed: false, installMethod: "npm" },
  { id: "python", name: "Pyright", installed: false, installMethod: "npm" },
];
async function mount(props: LspSetupPanelProps = {}) {
  let screen!: ReturnType<typeof render>;
  await act(async () => {
    screen = render(
      <ThemeProvider>
        <Box width={100} marginLeft={3} marginTop={2}>
          <LspSetupPanel servers={servers} {...props} />
        </Box>
      </ThemeProvider>
    );
  });
  return screen;
}
async function click(screen: ReturnType<typeof render>, label: string) {
  const lines = (screen.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes(label));
  expect(row, `Missing ${label}: ${screen.lastFrame()}`).toBeGreaterThanOrEqual(0);
  const line = lines[row] ?? "";
  const col = stringWidth(line.slice(0, line.indexOf(label))) + 1;
  await act(async () => {
    for (const suffix of ["M", "m"]) {
      const event = parseMouseEvent(`\x1b[<0;${col};${row + 1}${suffix}`);
      if (!event) throw new Error("Invalid click fixture");
      globalClickRegistry.dispatch(col, row + 1, event);
    }
  });
}
afterEach(async () => {
  await act(async () => cleanup());
  globalClickRegistry.clear();
});

describe("LSP setup operation evidence", () => {
  it("disables unavailable installation instead of simulating progress", async () => {
    const screen = await mount();
    await click(screen, "TypeScript Language Server");
    await click(screen, "a Install All");
    await act(async () => {
      screen.stdin.write("a");
      screen.stdin.write("\r");
    });
    expect(screen.lastFrame()).not.toContain("Installing");
    expect(screen.lastFrame()).toContain("Installation unavailable");
    expect(screen.lastFrame()).toContain("[Unavailable]");
  });
  it("does not invent project recommendations without a detection callback", async () => {
    const screen = await mount();
    await click(screen, "d Detect");
    await act(async () => {
      screen.stdin.write("d");
    });
    expect(screen.lastFrame()).not.toContain("★");
    expect(screen.lastFrame()).toContain("Project detection unavailable");
  });
  it("runs batch installation through the provided owner and keeps status authoritative", async () => {
    const onInstall = vi.fn(async (_server: ServerInfo) => {});
    const screen = await mount({ onInstall });
    await click(screen, "a Install All");
    expect(onInstall.mock.calls.map(([server]) => server.id)).toEqual(["typescript", "python"]);
    expect(screen.lastFrame()).not.toContain("Installed (2)");
    expect(screen.lastFrame()).toContain("Available (2)");
  });
  it("awaits detection once and recommends only returned server IDs", async () => {
    let complete!: (ids: readonly string[]) => void;
    const onDetect = vi.fn(
      () =>
        new Promise<readonly string[]>((resolve) => {
          complete = resolve;
        })
    );
    const screen = await mount({ ...{ onDetect } });
    await click(screen, "d Detect");
    await click(screen, "d Detect");
    expect(onDetect).toHaveBeenCalledTimes(1);
    expect(screen.lastFrame()).toContain("Detecting project");
    expect(screen.lastFrame()).not.toContain("★");
    await act(async () => {
      complete(["python"]);
    });
    expect(screen.lastFrame()).toContain("Pyright ★");
    expect(screen.lastFrame()).not.toContain("TypeScript Language Server ★");
  });
  it("reports detection failure without installing or recommending servers", async () => {
    const onDetect = vi.fn(async () => {
      throw new Error("fixture scan failed");
    });
    const onInstall = vi.fn(async () => {});
    const screen = await mount({ ...{ onDetect }, onInstall });
    await click(screen, "d Detect");
    expect(screen.lastFrame()).toContain("fixture scan failed");
    expect(screen.lastFrame()).not.toContain("★");
    expect(onInstall).not.toHaveBeenCalled();
  });
  it("shows pending real installation without a fabricated percentage and reports errors", async () => {
    let fail!: (error: Error) => void;
    const onInstall = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        })
    );
    const screen = await mount({ onInstall });
    await click(screen, "Pyright");
    expect(onInstall).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "python" }));
    expect(screen.lastFrame()).toContain("Installing Pyright");
    expect(screen.lastFrame()).not.toMatch(/\d+%/);
    await act(async () => {
      fail(new Error("fixture install failed"));
    });
    expect(screen.lastFrame()).toContain("fixture install failed");
    expect(screen.lastFrame()).not.toContain("Installed (1)");
  });
});
