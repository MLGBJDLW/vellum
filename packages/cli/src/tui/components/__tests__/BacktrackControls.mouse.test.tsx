import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MouseInteractionScope } from "../../context/MouseContext.js";
import { ThemeProvider } from "../../theme/index.js";
import { globalClickRegistry } from "../../utils/click-region.js";
import { parseMouseEvent } from "../../utils/mouse-parser.js";
import { BacktrackControls } from "../backtrack/BacktrackControls.js";

const state = {
  canUndo: true,
  canRedo: true,
  forkCount: 1,
  currentBranch: "Main",
  currentIndex: 1,
  historyLength: 3,
};
const branches = [
  { id: "main", name: "Main", forkPoint: 0, history: [], parentBranchId: null, createdAt: 0 },
  {
    id: "other",
    name: "Other branch",
    forkPoint: 1,
    history: [],
    parentBranchId: "main",
    createdAt: 1,
  },
];
function click(screen: ReturnType<typeof render>, label: string) {
  const lines = (screen.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes(label));
  expect(row, `Missing ${label}`).toBeGreaterThanOrEqual(0);
  const line = lines[row] ?? "";
  const col = stringWidth(line.slice(0, line.indexOf(label))) + 1;
  for (const suffix of ["M", "m"]) {
    const event = parseMouseEvent(`\x1b[<0;${col};${row + 1}${suffix}`);
    if (!event) throw new Error("Bad fixture event");
    globalClickRegistry.dispatch(col, row + 1, event);
  }
}
afterEach(async () => {
  await act(async () => cleanup());
  globalClickRegistry.clear();
});

describe("backtrack mouse controls", () => {
  it.each([false, true])(
    "clicks enabled undo/redo exactly once in compact=%s with keyboard owner disabled",
    async (compact) => {
      const undo = vi.fn();
      const redo = vi.fn();
      let screen!: ReturnType<typeof render>;
      const tree = (enabled = true, canUndo = true, canRedo = true) => (
        <ThemeProvider>
          <Box width={80} marginLeft={5} marginTop={2}>
            <BacktrackControls
              backtrackState={{ ...state, canUndo, canRedo }}
              branches={branches}
              onUndo={undo}
              onRedo={redo}
              onCreateBranch={vi.fn()}
              onSwitchBranch={vi.fn()}
              isFocused={false}
              mouseEnabled={enabled}
              compact={compact}
            />
          </Box>
        </ThemeProvider>
      );
      await act(async () => {
        screen = render(tree());
      });
      await act(async () => {
        click(screen, compact ? "◀" : "[<]");
        click(screen, compact ? "▶" : "[>]");
        screen.stdin.write("\x1a\x19");
      });
      expect(undo).toHaveBeenCalledTimes(1);
      expect(redo).toHaveBeenCalledTimes(1);
      await act(async () => {
        screen.rerender(tree(true, false, false));
      });
      await act(async () => {
        click(screen, compact ? "◀" : "[<]");
        click(screen, compact ? "▶" : "[>]");
      });
      await act(async () => {
        screen.rerender(tree(false));
      });
      await act(async () => {
        click(screen, compact ? "◀" : "[<]");
        click(screen, compact ? "▶" : "[>]");
      });
      expect(undo).toHaveBeenCalledTimes(1);
      expect(redo).toHaveBeenCalledTimes(1);
    }
  );
  it("opens the branch popup and selects, creates, and closes through the existing owners", async () => {
    const switchBranch = vi.fn();
    const create = vi.fn();
    const open = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        <ThemeProvider>
          <Box width={80}>
            <BacktrackControls
              backtrackState={state}
              branches={branches}
              onUndo={vi.fn()}
              onRedo={vi.fn()}
              onCreateBranch={create}
              onSwitchBranch={switchBranch}
              isFocused={false}
              mouseEnabled
              onOpenChange={open}
            />
          </Box>
        </ThemeProvider>
      );
    });
    await act(async () => {
      click(screen, "⎇");
    });
    expect(open).toHaveBeenCalledExactlyOnceWith(true);
    await act(async () => {
      click(screen, "Other branch");
      click(screen, "Other branch");
    });
    expect(switchBranch).toHaveBeenCalledExactlyOnceWith("other");
    expect(open.mock.calls.map(([value]) => value)).toEqual([true, false]);
    await act(async () => {
      click(screen, "⎇");
    });
    await act(async () => {
      click(screen, "New branch");
    });
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => {
      click(screen, "⎇");
    });
    await act(async () => {
      click(screen, "[Esc]");
    });
    expect(open).toHaveBeenLastCalledWith(false);
    expect(switchBranch).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("lets only the open active popup receive keys and blocks it under an inherited modal", async () => {
    const switchBranch = vi.fn();
    const open = vi.fn();
    let screen!: ReturnType<typeof render>;
    const tree = (enabled: boolean) => (
      <ThemeProvider>
        <MouseInteractionScope enabled={enabled}>
          <Box width={80}>
            <BacktrackControls
              backtrackState={state}
              branches={branches}
              onUndo={vi.fn()}
              onRedo={vi.fn()}
              onCreateBranch={vi.fn()}
              onSwitchBranch={switchBranch}
              isFocused={false}
              mouseEnabled
              onOpenChange={open}
            />
          </Box>
        </MouseInteractionScope>
      </ThemeProvider>
    );
    await act(async () => {
      screen = render(tree(true));
    });
    await act(async () => {
      click(screen, "⎇");
    });
    await act(async () => {
      screen.rerender(tree(false));
    });
    await act(async () => {
      click(screen, "Other branch");
      screen.stdin.write("\r");
    });
    expect(switchBranch).not.toHaveBeenCalled();
    await act(async () => {
      screen.rerender(tree(true));
    });
    await act(async () => {
      screen.stdin.write("j");
    });
    await act(async () => {
      screen.stdin.write("\r");
    });
    expect(switchBranch).toHaveBeenCalledExactlyOnceWith("other");
    expect(open).toHaveBeenLastCalledWith(false);
  });
});
