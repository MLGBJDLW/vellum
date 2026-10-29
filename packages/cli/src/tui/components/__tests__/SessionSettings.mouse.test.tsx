import type { SessionCheckpoint, SnapshotInfo } from "@vellum/core";
import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import type React from "react";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BracketedPasteProvider } from "../../context/BracketedPasteContext.js";
import { MouseContext } from "../../context/MouseContext.js";
import { ThemeProvider } from "../../theme/index.js";
import { globalClickRegistry } from "../../utils/click-region.js";
import { type MouseEvent, parseMouseEvent } from "../../utils/mouse-parser.js";
import { CheckpointDiffView } from "../Checkpoint/CheckpointDiffView.js";
import { SnapshotCheckpointPanel } from "../Checkpoint/SnapshotCheckpointPanel.js";
import { SettingsPanel } from "../SettingsPanel.js";
import { CheckpointPanel } from "../session/CheckpointPanel.js";
import { RollbackDialog } from "../session/RollbackDialog.js";
import { SessionListPanel } from "../session/SessionListPanel.js";
import { SessionPicker } from "../session/SessionPicker.js";

const settings = vi.hoisted(() => ({
  thinking: { enabled: true, budgetTokens: 10000 },
  setThinking: vi.fn(),
  setMode: vi.fn(),
}));
vi.mock("../../i18n/index.js", () => ({
  useTUITranslation: () => ({ t: (key: string) => key }),
  getThinkingSettings: () => settings.thinking,
  getModelSettings: () => ({}),
  getSavedLanguage: () => "en",
  getDiffViewMode: () => "unified",
  getAlternateBufferEnabled: () => true,
  getThemeFromSettings: () => "dark",
  getModeFromSettings: () => "vibe",
  setThinkingSettings: (value: typeof settings.thinking) => {
    settings.setThinking(value);
    settings.thinking = value;
  },
  setAlternateBufferEnabled: vi.fn(),
  setDiffViewMode: vi.fn(),
  setModeInSettings: settings.setMode,
  setThemeInSettings: vi.fn(),
}));

const sessions = Array.from({ length: 16 }, (_, index) => ({
  id: `session-${index}`,
  title: `Session ${String(index).padStart(2, "0")}`,
  timestamp: new Date("2026-10-20T12:00:00Z"),
  messageCount: index + 1,
}));
const checkpoints: SessionCheckpoint[] = Array.from({ length: 16 }, (_, index) => ({
  id: `check-${index}`,
  description: `Checkpoint ${String(index).padStart(2, "0")}`,
  createdAt: new Date("2026-10-20T12:00:00Z"),
  sessionId: "c0862224-7560-4bcd-a4c0-1077e705ff57",
  messageIndex: index,
}));
const snapshots: SnapshotInfo[] = sessions.map((session, index) => ({
  hash: `hash-${index}`,
  timestamp: session.timestamp,
  message: `Snapshot ${String(index).padStart(2, "0")}`,
  files: ["fixture.ts"],
}));

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
    wrap: (element: React.ReactNode, hidden = false, left = 4) => (
      <ThemeProvider>
        <BracketedPasteProvider>
          <MouseContext.Provider value={mouse}>
            <Box width={110} marginTop={2} marginLeft={left} display={hidden ? "none" : "flex"}>
              {element}
            </Box>
          </MouseContext.Provider>
        </BracketedPasteProvider>
      </ThemeProvider>
    ),
    wheel: (col: number, row: number, down = true) => {
      const event = parseMouseEvent(`\x1b[<${down ? 65 : 64};${col};${row}M`);
      if (!event) throw new Error("Invalid wheel event");
      for (const handler of wheelHandlers) handler(event);
    },
  };
}
function position(screen: ReturnType<typeof render>, label: string) {
  const lines = (screen.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes(label));
  expect(row, `Missing label ${label}: ${screen.lastFrame()}`).toBeGreaterThanOrEqual(0);
  const line = lines[row] ?? "";
  return { col: stringWidth(line.slice(0, line.indexOf(label))) + 1, row: row + 1 };
}
function clickAt(col: number, row: number) {
  for (const suffix of ["M", "m"]) {
    const event = parseMouseEvent(`\x1b[<0;${col};${row}${suffix}`);
    if (!event) throw new Error("Invalid click event");
    globalClickRegistry.dispatch(col, row, event);
  }
}
async function click(screen: ReturnType<typeof render>, label: string) {
  const target = position(screen, label);
  await act(async () => {
    clickAt(target.col, target.row);
  });
}

beforeEach(() => {
  settings.thinking = { enabled: true, budgetTokens: 10000 };
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => cleanup());
  globalClickRegistry.clear();
});

describe("panel mouse actions", () => {
  it.each(["picker", "list", "checkpoint", "snapshot"] as const)(
    "clamps %s wheel input within its visible list and ignores inactive or hidden bounds",
    async (kind) => {
      const context = harness();
      const action = vi.fn();
      const panel = (active = true) => {
        switch (kind) {
          case "picker":
            return (
              <SessionPicker
                sessions={sessions}
                isOpen={active}
                onSelect={action}
                onClose={action}
              />
            );
          case "list":
            return (
              <SessionListPanel
                sessions={sessions}
                maxHeight={12}
                isFocused={active}
                onSelectSession={action}
              />
            );
          case "checkpoint":
            return (
              <CheckpointPanel
                checkpoints={checkpoints}
                currentMessageCount={20}
                isOpen={active}
                onRollback={action}
                onDeleteCheckpoint={action}
                onCreateCheckpoint={action}
                onClose={action}
              />
            );
          case "snapshot":
            return (
              <SnapshotCheckpointPanel
                snapshots={snapshots}
                isFocused={active}
                isLoading={false}
                error={null}
                isInitialized
                onSelect={action}
                onRestore={action}
              />
            );
        }
      };
      const prefix =
        kind === "checkpoint" ? "Checkpoint" : kind === "snapshot" ? "Snapshot" : "Session";
      let screen!: ReturnType<typeof render>;
      await act(async () => {
        screen = render(context.wrap(panel()));
      });
      const target = position(screen, `${prefix} 00`);
      await act(async () => {
        context.wheel(1, target.row);
      });
      expect(screen.lastFrame()).toContain(`${prefix} 01`);
      await act(async () => {
        for (let i = 0; i < 30; i++) context.wheel(target.col, target.row);
      });
      expect(screen.lastFrame()).toContain(`${prefix} 15`);
      expect(screen.lastFrame()).not.toContain(`${prefix} 01`);
      expect(action).not.toHaveBeenCalled();
      await act(async () => {
        screen.rerender(context.wrap(panel(false)));
      });
      await act(async () => {
        context.wheel(target.col, target.row, false);
      });
      await act(async () => {
        screen.rerender(context.wrap(panel()));
      });
      expect(screen.lastFrame()).toContain(`${prefix} 15`);
      await act(async () => {
        screen.rerender(context.wrap(panel(), true));
      });
      await act(async () => {
        context.wheel(target.col, target.row, false);
      });
      await act(async () => {
        screen.rerender(context.wrap(panel()));
      });
      expect(screen.lastFrame()).toContain(`${prefix} 15`);
      await act(async () => {
        for (let i = 0; i < 30; i++) context.wheel(target.col, target.row, false);
      });
      expect(screen.lastFrame()).toContain(`${prefix} 00`);
      expect(screen.lastFrame()).not.toContain(`${prefix} 15`);
      expect(action).not.toHaveBeenCalled();
    }
  );

  it("allows a visible snapshot sidebar click before keyboard focus and ignores loading rows", async () => {
    const context = harness();
    const select = vi.fn();
    const restore = vi.fn();
    const panel = (loading: boolean) => (
      <SnapshotCheckpointPanel
        snapshots={snapshots}
        isLoading={loading}
        error={null}
        isInitialized
        isFocused={false}
        mouseEnabled
        onSelect={select}
        onRestore={restore}
      />
    );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(context.wrap(panel(false)));
    });
    const target = position(screen, "Snapshot 01");
    await click(screen, "Snapshot 01");
    expect(select).toHaveBeenCalledExactlyOnceWith(snapshots[1]);
    await act(async () => {
      screen.stdin.write("r");
    });
    expect(restore).not.toHaveBeenCalled();
    await act(async () => {
      screen.rerender(context.wrap(panel(true)));
    });
    await act(async () => {
      clickAt(target.col, target.row);
    });
    expect(select).toHaveBeenCalledTimes(1);
    expect(restore).not.toHaveBeenCalled();
  });

  it("ignores settings clicks and wheel while inactive or hidden", async () => {
    const context = harness();
    const close = vi.fn();
    const panel = (active: boolean) => (
      <SettingsPanel initialCategory="thinking" isActive={active} onClose={close} />
    );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(context.wrap(panel(false)));
    });
    const target = position(screen, "Extended Thinking");
    await click(screen, "Extended Thinking");
    await click(screen, "Esc to close");
    await act(async () => {
      context.wheel(target.col, target.row);
    });
    expect(settings.setThinking).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(screen.lastFrame()).toContain("▶ Extended Thinking");
    await act(async () => {
      screen.rerender(context.wrap(panel(true), true));
    });
    await act(async () => {
      clickAt(target.col, target.row);
      context.wheel(target.col, target.row);
    });
    await act(async () => {
      screen.rerender(context.wrap(panel(true)));
    });
    expect(screen.lastFrame()).toContain("▶ Extended Thinking");
    expect(settings.setThinking).not.toHaveBeenCalled();
  });

  it("opens the clicked session once, scrolls without opening, and ignores hidden picker hits", async () => {
    const select = vi.fn();
    const close = vi.fn();
    const context = harness();
    const panel = <SessionPicker sessions={sessions} isOpen onSelect={select} onClose={close} />;
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(context.wrap(panel));
    });
    const first = position(screen, "Session 00");
    await act(async () => {
      context.wheel(first.col, first.row);
    });
    expect(select).not.toHaveBeenCalled();
    await click(screen, "Session 03");
    expect(select).toHaveBeenCalledExactlyOnceWith("session-3");
    await act(async () => {
      screen.rerender(context.wrap(panel, true));
    });
    await act(async () => {
      clickAt(first.col, first.row);
    });
    expect(select).toHaveBeenCalledTimes(1);
    await act(async () => {
      screen.rerender(context.wrap(panel));
    });
    await click(screen, "Esc/q");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("selects list rows once and disables inactive panel actions", async () => {
    const select = vi.fn();
    const context = harness();
    const panel = (active: boolean) => (
      <SessionListPanel
        sessions={sessions}
        maxHeight={12}
        isFocused={active}
        onSelectSession={select}
      />
    );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(context.wrap(panel(true)));
    });
    await click(screen, "Session 01");
    expect(select).toHaveBeenCalledExactlyOnceWith("session-1");
    await act(async () => {
      screen.rerender(context.wrap(panel(false)));
    });
    await click(screen, "Session 00");
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("selects checkpoint rows without restoring and exposes separate actions", async () => {
    const rollback = vi.fn();
    const remove = vi.fn();
    const create = vi.fn();
    const close = vi.fn();
    const context = harness();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        context.wrap(
          <CheckpointPanel
            checkpoints={checkpoints}
            currentMessageCount={20}
            isOpen
            onRollback={rollback}
            onCreateCheckpoint={create}
            onDeleteCheckpoint={remove}
            onClose={close}
          />
        )
      );
    });
    await click(screen, "Checkpoint 01");
    expect(rollback).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    await click(screen, "Enter rollback");
    expect(rollback).toHaveBeenCalledExactlyOnceWith("check-1");
    await click(screen, "d delete");
    expect(remove).toHaveBeenCalledExactlyOnceWith("check-1");
    await click(screen, "n new");
    await click(screen, "Esc close");
    expect(create).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps rollback confirmation and cancellation as distinct visible buttons", async () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    const context = harness();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        context.wrap(
          <RollbackDialog
            checkpoint={checkpoints[0] ?? null}
            messagesToLose={20}
            isOpen
            onConfirm={confirm}
            onCancel={cancel}
          />
        )
      );
    });
    await click(screen, "[n]");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    await click(screen, "[y]");
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("selects snapshots without restore then invokes the selected action once", async () => {
    const select = vi.fn();
    const restore = vi.fn();
    const diff = vi.fn();
    const create = vi.fn();
    const refresh = vi.fn();
    const context = harness();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        context.wrap(
          <SnapshotCheckpointPanel
            snapshots={snapshots}
            isLoading={false}
            error={null}
            isInitialized
            onSelect={select}
            onRestore={restore}
            onDiff={diff}
            onTakeCheckpoint={create}
            onRefresh={refresh}
          />
        )
      );
    });
    await click(screen, "Snapshot 01");
    expect(select).toHaveBeenCalledExactlyOnceWith(snapshots[1]);
    expect(restore).not.toHaveBeenCalled();
    await click(screen, "restore");
    await click(screen, "diff");
    await click(screen, "new");
    await click(screen, "refresh");
    expect(restore).toHaveBeenCalledExactlyOnceWith("hash-1");
    expect(diff).toHaveBeenCalledExactlyOnceWith("hash-1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("uses live diff wheel bounds, clamps both ends, and closes by click", async () => {
    const context = harness();
    const close = vi.fn();
    const panel = (active = true) => (
      <CheckpointDiffView
        diffContent={Array.from({ length: 20 }, (_, index) => `+line ${index}`).join("\n")}
        maxHeight={10}
        isFocused={active}
        onClose={close}
      />
    );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(context.wrap(panel()));
    });
    const target = position(screen, "+line 0");
    await act(async () => {
      context.wheel(1, target.row);
    });
    expect(screen.lastFrame()).toContain("Line 1-5 of 20");
    await act(async () => {
      for (let i = 0; i < 30; i++) context.wheel(target.col, target.row);
    });
    expect(screen.lastFrame()).toContain("Line 16-20 of 20");
    await act(async () => {
      screen.rerender(context.wrap(panel(false)));
    });
    await act(async () => {
      context.wheel(target.col, target.row, false);
    });
    expect(screen.lastFrame()).toContain("Line 16-20 of 20");
    await act(async () => {
      screen.rerender(context.wrap(panel(), false, 30));
    });
    await act(async () => {
      context.wheel(target.col, target.row, false);
    });
    expect(screen.lastFrame()).toContain("Line 16-20 of 20");
    const moved = position(screen, "+line 15");
    await act(async () => {
      for (let i = 0; i < 30; i++) context.wheel(moved.col, moved.row, false);
    });
    expect(screen.lastFrame()).toContain("Line 1-5 of 20");
    await click(screen, "close");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("clicks settings tabs and editable rows, refreshes toggle values, and confirms number edits", async () => {
    const context = harness();
    const close = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(context.wrap(<SettingsPanel initialCategory="thinking" onClose={close} />));
    });
    await click(screen, "Extended Thinking");
    expect(settings.setThinking).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ enabled: false })
    );
    await click(screen, "Extended Thinking");
    expect(settings.setThinking).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true })
    );
    await click(screen, "Budget Tokens");
    await act(async () => {
      screen.stdin.write("\x1b[200~99\x1b[201~");
    });
    await click(screen, "confirm");
    expect(settings.setThinking).toHaveBeenLastCalledWith(
      expect.objectContaining({ budgetTokens: 1000099 })
    );
    await click(screen, "Coding Mode");
    await click(screen, "vibe");
    expect(settings.setMode).toHaveBeenCalledExactlyOnceWith("plan");
    await click(screen, "Esc to close");
    expect(close).toHaveBeenCalledTimes(1);
  });
});
