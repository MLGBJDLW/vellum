import type { SnapshotInfo } from "@vellum/core";
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
import { SnapshotCheckpointPanel } from "../Checkpoint/SnapshotCheckpointPanel.js";

const snapshots: SnapshotInfo[] = Array.from({ length: 12 }, (_, index) => ({
  hash: `hash-${String(index).padStart(2, "0")}-abcdefghijkl`,
  timestamp: new Date("2026-10-20T12:00:00Z"),
  message: `Checkpoint ${String(index).padStart(2, "0")} with a long description that exceeds the sidebar width`,
  files: ["fixture.ts"],
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
    wrap: (element: React.ReactNode) => (
      <ThemeProvider>
        <MouseContext.Provider value={mouse}>
          <Box width={34} height={17} marginTop={2} marginLeft={3} overflow="hidden">
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

describe("snapshot sidebar layout", () => {
  it("keeps every action visible inside a clipped 34 by 17 sidebar and selects without restoring", async () => {
    const context = harness();
    const onSelect = vi.fn();
    const onRestore = vi.fn();
    const onDiff = vi.fn();
    const onTakeCheckpoint = vi.fn();
    const onRefresh = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        context.wrap(
          <SnapshotCheckpointPanel
            {...{ width: 34 }}
            maxHeight={17}
            snapshots={snapshots}
            isLoading={false}
            isInitialized
            error={null}
            onSelect={onSelect}
            onRestore={onRestore}
            onDiff={onDiff}
            onTakeCheckpoint={onTakeCheckpoint}
            onRefresh={onRefresh}
          />
        )
      );
    });
    const footer = position(screen, "refresh");
    position(screen, "new");
    position(screen, "restore");
    position(screen, "diff");
    const first = position(screen, "Checkpoint 00");
    const second = position(screen, "Checkpoint 01");
    expect(second.row - first.row).toBe(2);
    await act(async () => {
      for (let i = 0; i < 20; i++) context.wheel(first.col, first.row);
    });
    expect(screen.lastFrame()).toContain("Checkpoint 11");
    expect(position(screen, "refresh").row).toBe(footer.row);
    expect(onRestore).not.toHaveBeenCalled();
    await click(screen, "Checkpoint 11");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(snapshots[11]);
    expect(onRestore).not.toHaveBeenCalled();
    await click(screen, "restore");
    await click(screen, "diff");
    await click(screen, "new");
    await click(screen, "refresh");
    expect(onRestore).toHaveBeenCalledExactlyOnceWith(snapshots[11]?.hash);
    expect(onDiff).toHaveBeenCalledExactlyOnceWith(snapshots[11]?.hash);
    expect(onTakeCheckpoint).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect((screen.lastFrame() ?? "").split("\n")).toHaveLength(19);
  });
  it("keeps recovery buttons in the same place for error/empty states and disables loading actions", async () => {
    const context = harness();
    const onRestore = vi.fn();
    const onTakeCheckpoint = vi.fn();
    const onRefresh = vi.fn();
    const panel = (isLoading: boolean, error: string | null, empty = false) => (
      <SnapshotCheckpointPanel
        {...{ width: 34 }}
        maxHeight={17}
        snapshots={empty ? [] : snapshots}
        isLoading={isLoading}
        isInitialized
        error={error}
        onRestore={onRestore}
        onTakeCheckpoint={onTakeCheckpoint}
        onRefresh={onRefresh}
      />
    );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(context.wrap(panel(false, null)));
    });
    const footer = position(screen, "refresh");
    await act(async () => {
      screen.rerender(context.wrap(panel(false, "fixture failed")));
    });
    expect(position(screen, "refresh").row).toBe(footer.row);
    await click(screen, "refresh");
    await click(screen, "restore");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRestore).not.toHaveBeenCalled();
    await act(async () => {
      screen.rerender(context.wrap(panel(false, null, true)));
    });
    await click(screen, "new");
    expect(onTakeCheckpoint).toHaveBeenCalledTimes(1);
    await act(async () => {
      screen.rerender(context.wrap(panel(true, null)));
    });
    await click(screen, "new");
    await click(screen, "refresh");
    await click(screen, "restore");
    await act(async () => {
      screen.stdin.write("r");
      screen.stdin.write("n");
      screen.stdin.write("R");
    });
    expect(onRestore).not.toHaveBeenCalled();
    expect(onTakeCheckpoint).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
