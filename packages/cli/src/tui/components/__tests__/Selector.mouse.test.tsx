import { getProviderModels } from "@vellum/provider";
import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import type React from "react";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MouseContext } from "../../context/MouseContext.js";
import { ThemeProvider } from "../../theme/index.js";
import { globalClickRegistry } from "../../utils/click-region.js";
import { type MouseEvent, parseMouseEvent } from "../../utils/mouse-parser.js";
import { ModelSelector } from "../ModelSelector.js";
import { ModeSelector } from "../ModeSelector.js";

const thinking = vi.hoisted(() => ({
  enabled: true,
  mode: "full" as "full" | "compact",
  enabledListeners: new Set<(state: { enabled: boolean }) => void>(),
  modeListeners: new Set<(mode: "full" | "compact") => void>(),
  toggle: vi.fn(),
  setMode: vi.fn(),
}));
vi.mock("../../../commands/think.js", () => ({
  getThinkingState: () => ({ enabled: thinking.enabled }),
  getThinkingDisplayMode: () => thinking.mode,
  toggleThinking: () => {
    thinking.toggle();
    thinking.enabled = !thinking.enabled;
    for (const listener of thinking.enabledListeners) listener({ enabled: thinking.enabled });
    return thinking.enabled;
  },
  setDisplayMode: (mode: "full" | "compact") => {
    thinking.setMode(mode);
    thinking.mode = mode;
    for (const listener of thinking.modeListeners) listener(mode);
  },
  subscribeToThinkingState: (listener: (state: { enabled: boolean }) => void) => {
    thinking.enabledListeners.add(listener);
    return () => thinking.enabledListeners.delete(listener);
  },
  subscribeToDisplayMode: (listener: (mode: "full" | "compact") => void) => {
    thinking.modeListeners.add(listener);
    return () => thinking.modeListeners.delete(listener);
  },
}));
vi.mock("../../hooks/useTerminalSize.js", () => ({
  useTerminalDimensions: () => ({ width: 90, height: 30, isNarrow: false, maxContentWidth: 88 }),
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
    wrap: (element: React.ReactNode, left = 4, hidden = false) => (
      <ThemeProvider>
        <MouseContext.Provider value={mouse}>
          <Box width={90} marginTop={2} marginLeft={left} display={hidden ? "none" : "flex"}>
            {element}
          </Box>
        </MouseContext.Provider>
      </ThemeProvider>
    ),
    wheel: (col: number, row: number, down = true) => {
      const event = parseMouseEvent(`\x1b[<${down ? 65 : 64};${col};${row}M`);
      if (!event) throw new Error("Invalid mouse fixture");
      for (const handler of wheelHandlers) handler(event);
    },
  };
}

function position(screen: ReturnType<typeof render>, label: string) {
  const lines = (screen.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes(label));
  expect(row, `Missing rendered label: ${label}`).toBeGreaterThanOrEqual(0);
  const line = lines[row] ?? "";
  return { col: stringWidth(line.slice(0, line.indexOf(label))) + 1, row: row + 1 };
}

function clickAt(col: number, row: number) {
  for (const suffix of ["M", "m"]) {
    const event = parseMouseEvent(`\x1b[<0;${col};${row}${suffix}`);
    if (!event) throw new Error("Invalid mouse fixture");
    globalClickRegistry.dispatch(col, row, event);
  }
}

beforeEach(() => {
  thinking.enabled = true;
  thinking.mode = "full";
  thinking.toggle.mockClear();
  thinking.setMode.mockClear();
});
afterEach(async () => {
  await act(async () => {
    cleanup();
  });
  globalClickRegistry.clear();
});

describe("selector mouse controls", () => {
  it("selects a rendered model with one click and ignores disabled selectors", async () => {
    const models = getProviderModels("anthropic");
    const first = models[0];
    const second = models[1];
    if (!first || !second) throw new Error("Expected provider models");
    const onSelect = vi.fn();
    const context = harness();
    const props = {
      currentProvider: "anthropic",
      currentModel: first.id,
      providers: ["anthropic"],
      onSelect,
    };
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(context.wrap(<ModelSelector {...props} />));
    });
    const target = position(screen, second.name);
    await act(async () => {
      clickAt(target.col, target.row);
    });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("anthropic", second.id);
    await act(async () => {
      screen.rerender(context.wrap(<ModelSelector {...props} isActive={false} />));
    });
    await act(async () => {
      clickAt(target.col, target.row);
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("clicks Thinking and Full/Compact independently without writing real settings", async () => {
    const model = getProviderModels("anthropic")[0];
    if (!model) throw new Error("Expected provider model");
    const context = harness();
    const onThinkingToggle = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        context.wrap(
          <ModelSelector
            currentProvider="anthropic"
            currentModel={model.id}
            providers={["anthropic"]}
            onSelect={vi.fn()}
            onThinkingToggle={onThinkingToggle}
          />
        )
      );
    });
    let target = position(screen, "Display: Full");
    await act(async () => {
      clickAt(target.col, target.row);
    });
    expect(thinking.setMode).toHaveBeenCalledExactlyOnceWith("compact");
    expect(thinking.toggle).not.toHaveBeenCalled();
    expect(screen.lastFrame()).toContain("Display: Compact");
    target = position(screen, "Thinking:");
    await act(async () => {
      clickAt(target.col, target.row);
    });
    expect(thinking.toggle).toHaveBeenCalledTimes(1);
    expect(onThinkingToggle).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.lastFrame()).not.toContain("Display:");
  });

  it("moves model focus only for wheel input within the live list bounds", async () => {
    const models = getProviderModels("anthropic");
    const first = models[0];
    if (!first || models.length < 2) throw new Error("Expected provider models");
    const context = harness();
    const onSelect = vi.fn();
    const props = {
      currentProvider: "anthropic",
      currentModel: first.id,
      providers: ["anthropic"],
      onSelect,
    };
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(context.wrap(<ModelSelector {...props} />));
    });
    const row =
      (screen.lastFrame() ?? "")
        .split("\n")
        .findIndex((line) => line.includes(`Anthropic: ${first.name}`)) + 1;
    await act(async () => {
      context.wheel(1, row);
    });
    expect(screen.lastFrame()).toContain(`1/${models.length}`);
    await act(async () => {
      context.wheel(9, row);
    });
    expect(screen.lastFrame()).toContain(`2/${models.length}`);
    await act(async () => {
      screen.stdin.write("\r");
    });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("anthropic", models[1]?.id);
    await act(async () => {
      screen.rerender(context.wrap(<ModelSelector {...props} isActive={false} />));
    });
    await act(async () => {
      context.wheel(9, row);
    });
    expect(screen.lastFrame()).toContain(`2/${models.length}`);
    await act(async () => {
      screen.rerender(context.wrap(<ModelSelector {...props} />, 30));
    });
    await act(async () => {
      context.wheel(9, row);
    });
    expect(screen.lastFrame()).toContain(`2/${models.length}`);
    await act(async () => {
      context.wheel(34, row);
    });
    expect(screen.lastFrame()).toContain(`3/${models.length}`);
    await act(async () => {
      screen.rerender(context.wrap(<ModelSelector {...props} />, 30, true));
    });
    await act(async () => {
      context.wheel(34, row);
    });
    await act(async () => {
      screen.rerender(context.wrap(<ModelSelector {...props} />, 30));
    });
    expect(screen.lastFrame()).toContain(`3/${models.length}`);
    await act(async () => {
      for (let index = 0; index < models.length * 2; index++) context.wheel(34, row);
    });
    expect(screen.lastFrame()).toContain(`${models.length}/${models.length}`);
    await act(async () => {
      for (let index = 0; index < models.length * 2; index++) context.wheel(34, row, false);
    });
    expect(screen.lastFrame()).toContain(`1/${models.length}`);
  });

  it("selects the visible mode once and respects isActive", async () => {
    const context = harness();
    const onSelect = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(context.wrap(<ModeSelector currentMode="orch" onSelect={onSelect} />));
    });
    const target = position(screen, "[1] orch");
    await act(async () => {
      clickAt(target.col, target.row);
    });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("orch");
    await act(async () => {
      screen.rerender(
        context.wrap(<ModeSelector currentMode="orch" onSelect={onSelect} isActive={false} />)
      );
    });
    await act(async () => {
      clickAt(target.col, target.row);
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
