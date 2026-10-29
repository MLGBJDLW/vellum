import { PassThrough } from "node:stream";
import { Box, Text } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mouseCommand } from "../../../commands/mouse.js";
import type { CommandContext } from "../../../commands/types.js";
import { Clickable } from "../../components/common/Clickable.js";
import { globalClickRegistry } from "../../utils/click-region.js";
import { disableMouseTracking, enableMouseTracking } from "../../utils/mouse-parser.js";
import {
  type MouseContextValue,
  MouseInteractionScope,
  MouseProvider,
  useMouseContext,
} from "../MouseContext.js";

const input = vi.hoisted(() => ({ stream: null as unknown as NodeJS.ReadStream }));
vi.mock("ink", async (original) => ({
  ...(await original<typeof import("ink")>()),
  useStdin: () => ({ stdin: input.stream }),
}));
vi.mock("../../utils/mouse-parser.js", async (original) => ({
  ...(await original<typeof import("../../utils/mouse-parser.js")>()),
  enableMouseTracking: vi.fn(),
  disableMouseTracking: vi.fn(),
}));
let originalTTY: PropertyDescriptor | undefined;
let context: MouseContextValue;
const renderConsumer = vi.fn();
function Consumer() {
  context = useMouseContext();
  renderConsumer();
  return <Text>listener</Text>;
}
async function command(mode: string) {
  await act(async () => {
    await mouseCommand.execute({ parsedArgs: { positional: [mode] } } as unknown as CommandContext);
  });
}
async function send(raw: string) {
  await act(async () => {
    input.stream.push(raw);
    while (input.stream.read() !== null) {
      /* drain like Ink's input owner */
    }
  });
}
beforeEach(async () => {
  input.stream = new PassThrough() as unknown as NodeJS.ReadStream;
  originalTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
  vi.stubEnv("TERM", "xterm-256color");
  vi.stubEnv("VELLUM_DISABLE_MOUSE", "0");
  vi.stubEnv("VELLUM_DISABLE_MOUSE_CLICKS", "0");
  await command("on");
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => cleanup());
  globalClickRegistry.clear();
  input.stream.destroy();
  if (originalTTY) Object.defineProperty(process.stdout, "isTTY", originalTTY);
  else Reflect.deleteProperty(process.stdout, "isTTY");
  vi.unstubAllEnvs();
});

describe("mouse input ownership and real Ink hit regions", () => {
  it("activates the owning focus scope before an action and honors disabled ancestors", async () => {
    const actions: string[] = [];
    const tree = (enabled: boolean) => (
      <MouseProvider>
        <MouseInteractionScope enabled={enabled} onActivate={() => actions.push("focus")}>
          <MouseInteractionScope enabled>
            <Clickable id="scope-action" onClick={() => actions.push("action")}>
              <Text>Action</Text>
            </Clickable>
          </MouseInteractionScope>
        </MouseInteractionScope>
      </MouseProvider>
    );
    let screen: ReturnType<typeof render>;
    await act(async () => {
      screen = render(tree(true));
    });
    await send("\x1b[<0;1;1M\x1b[<0;1;1m");
    expect(actions).toEqual(["focus", "action"]);
    await act(async () => {
      screen.rerender(tree(false));
    });
    await send("\x1b[<0;1;1M\x1b[<0;1;1m");
    expect(actions).toEqual(["focus", "action"]);
  });

  it("routes a wheel event to the highest priority consumer and stops at a handled event", async () => {
    await act(async () => {
      render(
        <MouseProvider>
          <Consumer />
        </MouseProvider>
      );
    });
    const actions: string[] = [];
    context.onWheel(() => {
      actions.push("history");
      return true;
    }, 0);
    const unsubscribe = context.onWheel(() => {
      actions.push("menu");
      return true;
    }, 20);
    context.onWheel(() => {
      actions.push("outside");
      return false;
    }, 30);
    await send("\x1b[<65;4;4M");
    expect(actions).toEqual(["outside", "menu"]);
    unsubscribe();
    await send("\x1b[<65;4;4M");
    expect(actions).toEqual(["outside", "menu", "outside", "history"]);
  });

  it("measures buttons outside messages and activates exactly once through terminal-input", async () => {
    const click = vi.fn();
    await act(async () => {
      render(
        <MouseProvider>
          <Box width={20} paddingLeft={4} paddingTop={2}>
            <Clickable id="outside-history" onClick={click}>
              <Text>Button</Text>
            </Clickable>
          </Box>
        </MouseProvider>
      );
    });
    await send("\x1b[<0;5;3M");
    expect(click).not.toHaveBeenCalled();
    await send("\x1b[<0;5;3m");
    expect(click).toHaveBeenCalledTimes(1);
    await send("\x1b[<0;4;3M\x1b[<0;4;3m\x1b[<0;5;2M\x1b[<0;5;2m");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("keeps adjacent inline controls in distinct rendered hit regions", async () => {
    const approve = vi.fn();
    const reject = vi.fn();
    await act(async () => {
      render(
        <MouseProvider>
          <Box width={30} gap={2}>
            <Clickable id="approve" width="auto" onClick={approve}>
              <Text>Yes</Text>
            </Clickable>
            <Clickable id="reject" width="auto" onClick={reject}>
              <Text>No</Text>
            </Clickable>
          </Box>
        </MouseProvider>
      );
    });
    await send("\x1b[<0;1;1M\x1b[<0;1;1m\x1b[<0;5;1M\x1b[<0;5;1m\x1b[<0;6;1M\x1b[<0;6;1m");
    expect(approve).toHaveBeenCalledTimes(1);
    expect(reject).toHaveBeenCalledTimes(1);
  });

  it("clips scroll children to the painted viewport and updates geometry at dispatch", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const tree = (scrollTop: number) => (
      <MouseProvider>
        <Box width={20} flexDirection="column">
          <Text>Header</Text>
          <Box height={1} overflowY="scroll" scrollTop={scrollTop} flexDirection="column">
            <Box flexShrink={0}>
              <Clickable id="first" onClick={first}>
                <Text>First</Text>
              </Clickable>
            </Box>
            <Box flexShrink={0}>
              <Clickable id="second" onClick={second}>
                <Text>Second</Text>
              </Clickable>
            </Box>
          </Box>
          <Text>Footer</Text>
        </Box>
      </MouseProvider>
    );
    let screen: ReturnType<typeof render>;
    await act(async () => {
      screen = render(tree(0));
    });
    await send("\x1b[<0;1;3M\x1b[<0;1;3m\x1b[<0;1;2M\x1b[<0;1;2m");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    await act(async () => {
      screen.rerender(tree(1));
    });
    await send("\x1b[<0;1;1M\x1b[<0;1;1m\x1b[<0;1;2M\x1b[<0;1;2m");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("uses current callbacks and cancels a pressed target when its interaction scope is disabled", async () => {
    const oldClick = vi.fn();
    const newClick = vi.fn();
    const tree = (enabled: boolean, onClick: () => void) => (
      <MouseProvider>
        <MouseInteractionScope enabled={enabled}>
          <Clickable id="scoped" onClick={onClick}>
            <Text>Scoped</Text>
          </Clickable>
        </MouseInteractionScope>
      </MouseProvider>
    );
    let screen: ReturnType<typeof render>;
    await act(async () => {
      screen = render(tree(true, oldClick));
    });
    await act(async () => {
      screen.rerender(tree(true, newClick));
    });
    await send("\x1b[<0;1;1M\x1b[<0;1;1m");
    expect(oldClick).not.toHaveBeenCalled();
    expect(newClick).toHaveBeenCalledTimes(1);
    await send("\x1b[<0;1;1M");
    await act(async () => {
      screen.rerender(tree(false, newClick));
    });
    await send("\x1b[<0;1;1m\x1b[<0;1;1M\x1b[<0;1;1m");
    expect(newClick).toHaveBeenCalledTimes(1);
  });

  it("captures drag outside its hit area and cancels capture on unsubscribe or mode change", async () => {
    await act(async () => {
      render(
        <MouseProvider>
          <Consumer />
        </MouseProvider>
      );
    });
    const click = vi.fn();
    globalClickRegistry.register({
      id: "behind",
      top: 2,
      bottom: 2,
      left: 9,
      right: 9,
      onClick: click,
    });
    const pointer = vi.fn((event) => event.action === "press" && event.col === 9);
    const cancel = vi.fn();
    const unsubscribe = context.onPointer(pointer, cancel);
    await send("\x1b[<0;9;2M\x1b[<32;50;9M\x1b[<0;50;9m\x1b[<35;2;2M");
    expect(pointer.mock.calls.map(([event]) => event.action)).toEqual([
      "press",
      "move",
      "release",
      "move",
    ]);
    expect(click).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    await send("\x1b[<0;9;2M");
    unsubscribe();
    expect(cancel).toHaveBeenCalledTimes(1);
    context.onPointer(pointer, cancel);
    await send("\x1b[<0;9;2M");
    await command("wheel");
    expect(cancel).toHaveBeenCalledTimes(2);
    await send("\x1b[<0;9;2m");
    expect(click).not.toHaveBeenCalled();
    await command("on");
    await send("\x1b[<0;9;2M\x1b[<35;20;8M");
    expect(cancel).toHaveBeenCalledTimes(3);
    await send("\x1b[<0;9;2M");
    await act(async () => cleanup());
    expect(cancel).toHaveBeenCalledTimes(4);
  });

  it("does not rerender context consumers on hover and fans out only completed generic clicks", async () => {
    await act(async () => {
      render(
        <MouseProvider>
          <Consumer />
        </MouseProvider>
      );
    });
    const baseline = renderConsumer.mock.calls.length;
    const click = vi.fn();
    context.onClick(click);
    await send("\x1b[<35;4;4M\x1b[<35;8;8M");
    expect(renderConsumer).toHaveBeenCalledTimes(baseline);
    expect(context.lastPosition).toEqual({ col: 8, row: 8 });
    await send("\x1b[<0;4;4M\x1b[<0;4;4m\x1b[<2;4;4M\x1b[<2;4;4m");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("applies runtime full/wheel/off despite disabled config and restores terminal modes on teardown", async () => {
    vi.stubEnv("VELLUM_DISABLE_MOUSE", "1");
    vi.stubEnv("VELLUM_DISABLE_MOUSE_CLICKS", "1");
    const wheel = vi.fn();
    function Wheel() {
      const mouse = useMouseContext();
      useEffect(() => mouse.onWheel(wheel), [mouse.onWheel]);
      return <Consumer />;
    }
    await act(async () => {
      render(
        <MouseProvider>
          <Wheel />
        </MouseProvider>
      );
    });
    expect(enableMouseTracking).toHaveBeenLastCalledWith(process.stdout, "full");
    const click = vi.fn();
    context.onClick(click);
    await command("wheel");
    expect(enableMouseTracking).toHaveBeenLastCalledWith(process.stdout, "wheel-only");
    await send("\x1b[<0;4;4M\x1b[<0;4;4m\x1b[<65;4;4M");
    expect(click).not.toHaveBeenCalled();
    expect(wheel).toHaveBeenCalledTimes(1);
    await command("off");
    expect(context.isMouseActive).toBe(false);
    expect(disableMouseTracking).toHaveBeenCalledTimes(2);
    await command("on");
    expect(context.isMouseActive).toBe(true);
    await act(async () => cleanup());
    expect(disableMouseTracking).toHaveBeenCalledTimes(3);
  });
});
