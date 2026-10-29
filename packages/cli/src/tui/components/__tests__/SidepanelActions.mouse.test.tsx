import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import type React from "react";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MouseContext, MouseInteractionScope } from "../../context/MouseContext.js";
import { ThemeProvider } from "../../theme/index.js";
import { globalClickRegistry } from "../../utils/click-region.js";
import { type MouseEvent, parseMouseEvent } from "../../utils/mouse-parser.js";
import { HotkeyHelpModal } from "../common/HotkeyHelpModal.js";
import { LspConfirmDialog } from "../Dialogs/LspConfirmDialog.js";
import { LspSetupPanel, type ServerInfo } from "../LspSetupPanel.js";
import { MemoryPanel } from "../MemoryPanel.js";
import { TipBanner } from "../TipBanner.js";
import { TodoPanel } from "../TodoPanel.js";
import { ApprovalQueue } from "../Tools/ApprovalQueue.js";
import { TrustPrompt } from "../TrustPrompt.js";
import { UpdateBanner } from "../UpdateBanner.js";

function position(screen: ReturnType<typeof render>, label: string) {
  const lines = (screen.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes(label));
  expect(row, `Missing rendered label ${label}`).toBeGreaterThanOrEqual(0);
  const line = lines[row] ?? "";
  return { col: stringWidth(line.slice(0, line.indexOf(label))) + 1, row: row + 1 };
}
function click(screen: ReturnType<typeof render>, label: string) {
  const { col, row } = position(screen, label);
  for (const suffix of ["M", "m"]) {
    const event = parseMouseEvent(`\x1b[<0;${col};${row}${suffix}`);
    if (!event) throw new Error("Invalid mouse fixture");
    globalClickRegistry.dispatch(col, row, event);
  }
}
function harness() {
  const wheelHandlers = new Set<(event: MouseEvent) => void>();
  const mouse = {
    isMouseActive: true,
    lastPosition: null,
    onWheel: (handler: (event: MouseEvent) => void) => {
      wheelHandlers.add(handler);
      return () => {
        wheelHandlers.delete(handler);
      };
    },
    onClick: () => () => {},
    onPointer: () => () => {},
    cancelPointerCapture: () => {},
  };
  return {
    wrap: (element: React.ReactNode, enabled = true, left = 4) => (
      <ThemeProvider>
        <MouseContext.Provider value={mouse}>
          <MouseInteractionScope enabled={enabled}>
            <Box width={90} marginTop={2} marginLeft={left}>
              {element}
            </Box>
          </MouseInteractionScope>
        </MouseContext.Provider>
      </ThemeProvider>
    ),
    wheel: (col: number, row: number, down = true) => {
      const event = parseMouseEvent(`\x1b[<${down ? 65 : 64};${col};${row}M`);
      if (!event) throw new Error("Invalid wheel fixture");
      for (const handler of wheelHandlers) handler(event);
    },
  };
}
afterEach(async () => {
  await act(async () => cleanup());
  globalClickRegistry.clear();
});
const todos = Array.from({ length: 12 }, (_, i) => ({
  id: String(i),
  title: `Task ${i}`,
  status: "pending" as const,
  description: `Details for task ${i}`,
  createdAt: "2026-10-29T00:00:00Z",
}));
const entries = Array.from({ length: 12 }, (_, i) => ({
  key: `Memory ${i}`,
  type: "context" as const,
  content: `Memory content ${i}`,
  createdAt: new Date("2026-10-29"),
  updatedAt: new Date("2026-10-29"),
  metadata: { tags: [], importance: 0.5 },
}));

describe("sidepanel mouse actions", () => {
  it("keeps trust decisions explicit and resolves only the clicked choice once", async () => {
    const decide = vi.fn();
    const context = harness();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        context.wrap(
          <TrustPrompt
            promptInfo={{
              rootPath: "D:/fixture",
              currentPath: "D:/fixture",
              reason: "new_project",
            }}
            onDecision={decide}
          />
        )
      );
    });
    await act(async () => {
      click(screen, "[A]");
      click(screen, "[Y]");
    });
    expect(decide).toHaveBeenCalledExactlyOnceWith("always", "always");
  });
  it.each([false, true])(
    "dismisses tip and update banners by click in compact=%s mode",
    async (compact) => {
      const dismissTip = vi.fn();
      const dismissUpdate = vi.fn();
      const context = harness();
      let screen!: ReturnType<typeof render>;
      await act(async () => {
        screen = render(
          context.wrap(
            <TipBanner
              tip={{
                id: "fixture",
                title: "Fixture tip",
                content: "Try a command",
                category: "features",
                trigger: {},
                priority: 1,
                dismissable: true,
              }}
              onDismiss={dismissTip}
              compact={compact}
            />
          )
        );
      });
      await act(async () => {
        click(screen, "[d]");
      });
      expect(dismissTip).toHaveBeenCalledTimes(1);
      await act(async () => {
        screen.rerender(
          context.wrap(
            <UpdateBanner
              currentVersion="1.0.0"
              latestVersion="2.0.0"
              onDismiss={dismissUpdate}
              compact={compact}
            />
          )
        );
      });
      await act(async () => {
        click(screen, "dismiss");
      });
      expect(dismissUpdate).toHaveBeenCalledTimes(1);
      expect(screen.lastFrame()).not.toContain("2.0.0");
    }
  );
  it("expands the clicked todo before activation and changes empty filters", async () => {
    const select = vi.fn();
    const activate = vi.fn();
    const refresh = vi.fn();
    const context = harness();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        context.wrap(
          <TodoPanel
            items={todos}
            onSelectItem={select}
            onActivateItem={activate}
            onRefresh={refresh}
          />
        )
      );
    });
    await act(async () => {
      click(screen, "Task 1");
    });
    expect(select).toHaveBeenCalledExactlyOnceWith(todos[1]);
    expect(screen.lastFrame()).toContain("Details for task 1");
    expect(activate).not.toHaveBeenCalled();
    await act(async () => {
      click(screen, "Task 1");
    });
    expect(activate).toHaveBeenCalledExactlyOnceWith(todos[1]);
    await act(async () => {
      click(screen, "Completed");
    });
    expect(screen.lastFrame()).not.toContain("Task 1");
    await act(async () => {
      click(screen, "Completed");
    });
    expect(screen.lastFrame()).toContain("Task 0");
    await act(async () => {
      click(screen, "Refresh");
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("routes wheel input to live bounds, supports mouse-only activation, and blocks modal backgrounds", async () => {
    const select = vi.fn();
    const context = harness();
    const panel = (
      <TodoPanel items={todos} maxHeight={9} isFocused={false} mouseEnabled onSelectItem={select} />
    );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(context.wrap(panel));
    });
    const old = position(screen, "Task 0");
    await act(async () => {
      context.wheel(1, old.row);
      screen.stdin.write("j");
    });
    expect(select).not.toHaveBeenCalled();
    await act(async () => {
      context.wheel(old.col, old.row);
    });
    expect(select).toHaveBeenCalledTimes(1);
    expect(screen.lastFrame()).toContain("Task 3");
    await act(async () => {
      screen.rerender(context.wrap(panel, true, 20));
    });
    await act(async () => {
      context.wheel(old.col, old.row);
    });
    expect(select).toHaveBeenCalledTimes(1);
    await act(async () => {
      screen.rerender(context.wrap(panel, false));
    });
    const current = position(screen, "Task 3");
    await act(async () => {
      context.wheel(current.col, current.row);
      click(screen, "Task 3");
    });
    expect(select).toHaveBeenCalledTimes(1);
  });
  it("activates memory exactly once and ignores unfocused rows and wheel events", async () => {
    const activate = vi.fn();
    const select = vi.fn();
    const context = harness();
    const content = (focused: boolean) =>
      context.wrap(
        <MemoryPanel
          entries={entries}
          width={30}
          maxHeight={9}
          isFocused={focused}
          onSelectEntry={select}
          onActivateEntry={activate}
        />
      );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(content(true));
    });
    await act(async () => {
      click(screen, "Memory 1");
    });
    expect(activate).toHaveBeenCalledExactlyOnceWith(entries[1]);
    expect(select).toHaveBeenCalledExactlyOnceWith(entries[1]);
    await act(async () => {
      screen.rerender(content(false));
    });
    const pos = position(screen, "Memory 0");
    await act(async () => {
      click(screen, "Memory 0");
      context.wheel(pos.col, pos.row);
    });
    expect(select).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledTimes(1);
  });
  it("accumulates rapid memory wheel ticks and clamps both ends of the visible list", async () => {
    const select = vi.fn();
    const context = harness();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        context.wrap(
          <MemoryPanel entries={entries} width={30} maxHeight={9} onSelectEntry={select} />
        )
      );
    });
    const first = position(screen, "Memory 0");
    await act(async () => {
      for (let index = 0; index < 12; index++) context.wheel(first.col, first.row);
    });
    expect(select).toHaveBeenLastCalledWith(entries[11]);
    expect(screen.lastFrame()).toContain("Memory 11");
    expect(screen.lastFrame()).not.toContain("Memory 0");
    const last = position(screen, "Memory 11");
    await act(async () => {
      for (let index = 0; index < 12; index++) context.wheel(last.col, last.row, false);
    });
    expect(select).toHaveBeenLastCalledWith(entries[0]);
    expect(screen.lastFrame()).toContain("Memory 0");
  });
  it("does not dismiss a banner behind a modal or register a hidden help action", async () => {
    const dismiss = vi.fn();
    const close = vi.fn();
    const context = harness();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        context.wrap(
          <UpdateBanner currentVersion="1.0.0" latestVersion="2.0.0" onDismiss={dismiss} />,
          false
        )
      );
    });
    await act(async () => {
      click(screen, "dismiss");
    });
    expect(dismiss).not.toHaveBeenCalled();
    await act(async () => {
      screen.rerender(
        context.wrap(<HotkeyHelpModal isVisible={false} onClose={close} hotkeys={[]} />)
      );
    });
    expect(globalClickRegistry.size).toBe(0);
    expect(close).not.toHaveBeenCalled();
  });
  it("selects approval rows without approving and separates individual and batch actions", async () => {
    const approve = vi.fn();
    const reject = vi.fn();
    const all = vi.fn();
    const rejectAll = vi.fn();
    const context = harness();
    const content = (focused: boolean) =>
      context.wrap(
        <ApprovalQueue
          isFocused={focused}
          executions={[
            { id: "first", toolName: "read_file", params: {}, status: "pending" },
            { id: "second", toolName: "write_file", params: {}, status: "pending" },
          ]}
          onApprove={approve}
          onReject={reject}
          onApproveAll={all}
          onRejectAll={rejectAll}
        />
      );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(content(true));
    });
    await act(async () => {
      click(screen, "write_file");
    });
    expect(approve).not.toHaveBeenCalled();
    await act(async () => {
      click(screen, "[y]");
    });
    expect(approve).toHaveBeenCalledExactlyOnceWith("second");
    await act(async () => {
      click(screen, "[r]");
    });
    expect(rejectAll).toHaveBeenCalledTimes(1);
    await act(async () => {
      screen.rerender(content(false));
    });
    await act(async () => {
      click(screen, "[a]");
      click(screen, "[n]");
    });
    expect(all).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
  });
  it("resolves LSP confirmation once and keeps help dismissal clickable", async () => {
    const confirm = vi.fn();
    const close = vi.fn();
    const context = harness();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        context.wrap(
          <LspConfirmDialog
            request={{
              serverId: "fixture",
              languageId: "typescript",
              action: "install",
              message: "Install fixture",
            }}
            onConfirm={confirm}
          />
        )
      );
    });
    await act(async () => {
      click(screen, "[N]");
      click(screen, "[Y]");
    });
    expect(confirm).toHaveBeenCalledExactlyOnceWith(false);
    await act(async () => {
      screen.rerender(context.wrap(<HotkeyHelpModal isVisible onClose={close} hotkeys={[]} />));
    });
    await act(async () => {
      click(screen, "close");
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("installs the clicked LSP server once while pending and preserves system guides and inactive guards", async () => {
    let finish!: () => void;
    const install = vi.fn(
      (_server: ServerInfo) =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const close = vi.fn();
    const context = harness();
    const content = (active: boolean) =>
      context.wrap(
        <LspSetupPanel
          isActive={active}
          onInstall={install}
          onClose={close}
          servers={[
            { id: "first", name: "First server", installed: false, installMethod: "npm" },
            { id: "second", name: "Second server", installed: false, installMethod: "npm" },
            {
              id: "system",
              name: "System server",
              installed: false,
              requiresSystem: true,
              systemRequirement: "needs compiler",
            },
          ]}
        />
      );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(content(true));
    });
    await act(async () => {
      click(screen, "Second server");
      click(screen, "Second server");
    });
    expect(install).toHaveBeenCalledTimes(1);
    expect(install.mock.calls[0]?.[0]).toMatchObject({ id: "second" });
    await act(async () => {
      finish();
    });
    await act(async () => {
      click(screen, "System server");
    });
    expect(screen.lastFrame()).toContain("Please install manually");
    expect(install).toHaveBeenCalledTimes(1);
    await act(async () => {
      screen.rerender(content(false));
    });
    await act(async () => {
      click(screen, "First server");
      click(screen, "Esc Close");
    });
    expect(install).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });
});
