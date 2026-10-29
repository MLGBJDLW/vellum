import { cleanup, render } from "ink-testing-library";
import type React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../../context/MessagesContext.js";
import { MouseContext } from "../../../context/MouseContext.js";
import { ThemeProvider } from "../../../theme/index.js";
import { type MouseEvent, parseMouseEvent } from "../../../utils/mouse-parser.js";
import { MessageList } from "../MessageList.js";

vi.mock("../../../../commands/think.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../commands/think.js")>()),
  getThinkingDisplayMode: () => "compact",
  getThinkingExpandedByDefault: () => false,
  getThinkingAutoCollapse: () => false,
}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

function mouseHarness() {
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
    wrap: (element: React.ReactNode) => (
      <ThemeProvider>
        <MouseContext.Provider value={mouse}>{element}</MouseContext.Provider>
      </ThemeProvider>
    ),
    wheel: (direction: "up" | "down") => {
      const event = parseMouseEvent(`\x1b[<${direction === "up" ? 64 : 65};5;5M`);
      if (!event) throw new Error("Invalid fixture mouse event");
      for (const handler of wheelHandlers) handler(event);
    },
  };
}

afterEach(async () => {
  await act(async () => cleanup());
});

describe("MessageList mouse and compact Thinking integration", () => {
  it("allows mouse history scrolling while the sidebar has keyboard focus, but blocks overlays", async () => {
    const harness = mouseHarness();
    const activate = vi.fn();
    const message: Message = {
      id: "sidebar-focus-history",
      role: "assistant",
      content: Array.from({ length: 100 }, (_, index) => `Focus history ${index}`).join("\n"),
      timestamp: new Date(0),
    };
    const tree = (mouseEnabled: boolean) =>
      harness.wrap(
        <MessageList
          messages={[message]}
          isFocused={false}
          mouseEnabled={mouseEnabled}
          onMouseActivate={activate}
          maxHeight={12}
        />
      );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(tree(true));
      await settle();
    });
    expect(screen.lastFrame()).toContain("Focus history 99");
    await act(async () => {
      screen.stdin.write("\x1b[5~");
      await settle();
    });
    expect(screen.lastFrame()).toContain("Focus history 99");
    await act(async () => {
      harness.wheel("up");
      await settle();
    });
    expect(activate).toHaveBeenCalledTimes(1);
    expect(screen.lastFrame()).not.toContain("Focus history 99");
    await act(async () => {
      screen.rerender(tree(false));
      await settle();
    });
    const before = screen.lastFrame();
    await act(async () => {
      harness.wheel("down");
      await settle();
    });
    expect(screen.lastFrame()).toEqual(before);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it("targets a Thinking shortcut to its message and permits a new shortcut after remount", async () => {
    const harness = mouseHarness();
    const first: Message = {
      id: "targeted-thinking-first",
      role: "assistant",
      content: "Answer one",
      thinking: "**First activity**\nFirst hidden detail",
      timestamp: new Date(0),
    };
    const second: Message = {
      id: "targeted-thinking-second",
      role: "assistant",
      content: "Answer two",
      thinking: "**Second activity**\nSecond hidden detail",
      timestamp: new Date(0),
    };
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(harness.wrap(<MessageList messages={[first]} maxHeight={20} />));
      await settle();
    });
    await act(async () => {
      screen.stdin.write("\x1be");
      await settle();
    });
    expect(screen.lastFrame()).toContain("First hidden detail");
    await act(async () => {
      screen.rerender(harness.wrap(<MessageList messages={[first, second]} maxHeight={20} />));
      await settle();
    });
    expect(screen.lastFrame()).not.toContain("Second hidden detail");
    await act(async () => {
      screen.unmount();
      await settle();
    });
    await act(async () => {
      screen = render(harness.wrap(<MessageList messages={[first]} maxHeight={20} />));
      await settle();
    });
    expect(screen.lastFrame()).toContain("First hidden detail");
    await act(async () => {
      screen.stdin.write("\x1be");
      await settle();
    });
    expect(screen.lastFrame()).not.toContain("First hidden detail");
  });
  it.each([false, true])(
    "keeps wheel-selected history while streaming (alternate buffer: %s)",
    async (useAltBuffer) => {
      const harness = mouseHarness();
      const pending: Message = {
        id: `wheel-history-${useAltBuffer}`,
        role: "assistant",
        content: Array.from({ length: 100 }, (_, index) => `History line ${index}`).join("\n"),
        timestamp: new Date(0),
        isStreaming: true,
      };
      let screen!: ReturnType<typeof render>;
      await act(async () => {
        screen = render(
          harness.wrap(
            <MessageList
              messages={[]}
              pendingMessage={pending}
              isStreaming
              maxHeight={12}
              useAltBuffer={useAltBuffer}
            />
          )
        );
        await settle();
      });
      expect(screen.lastFrame()).toContain("History line 99");
      await act(async () => {
        harness.wheel("up");
        await settle();
      });
      expect(screen.lastFrame()).toContain("Reading history");
      expect(screen.lastFrame()).not.toContain("History line 99");
      const reading = screen.lastFrame()?.match(/History line \d+/g);
      await act(async () => {
        screen.rerender(
          harness.wrap(
            <MessageList
              messages={[]}
              pendingMessage={{ ...pending, content: `${pending.content}\nNew streaming tail` }}
              isStreaming
              maxHeight={12}
              useAltBuffer={useAltBuffer}
            />
          )
        );
        await settle();
      });
      expect(screen.lastFrame()?.match(/History line \d+/g)).toEqual(reading);
      expect(screen.lastFrame()).not.toContain("New streaming tail");
      await act(async () => {
        for (let index = 0; index < 6; index++) harness.wheel("down");
        await settle();
      });
      expect(screen.lastFrame()).toContain("New streaming tail");
      expect(screen.lastFrame()).not.toContain("Reading history");
    }
  );

  it("expands compact streaming Thinking from the chat shortcut without losing later text", async () => {
    const harness = mouseHarness();
    const pending: Message = {
      id: "compact-thinking-shortcut",
      role: "assistant",
      content: "",
      thinking: "**Checking input routing**\nTHINKING_BODY_SENTINEL",
      timestamp: new Date(0),
      isStreaming: true,
    };
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        harness.wrap(
          <MessageList messages={[]} pendingMessage={pending} isStreaming maxHeight={20} />
        )
      );
      await settle();
    });
    expect(screen.lastFrame()).not.toContain("THINKING_BODY_SENTINEL");
    await act(async () => {
      screen.stdin.write("\x1be");
      await settle();
    });
    expect(screen.lastFrame()).toContain("THINKING_BODY_SENTINEL");
    await act(async () => {
      screen.rerender(
        harness.wrap(
          <MessageList
            messages={[]}
            pendingMessage={{
              ...pending,
              thinking: `${pending.thinking}\nLATER_THINKING_SENTINEL`,
            }}
            isStreaming
            maxHeight={20}
          />
        )
      );
      await settle();
    });
    expect(screen.lastFrame()).toContain("LATER_THINKING_SENTINEL");
    await act(async () => {
      screen.stdin.write("\x1be");
      await settle();
    });
    expect(screen.lastFrame()).not.toContain("THINKING_BODY_SENTINEL");
    expect(screen.lastFrame()).not.toContain("LATER_THINKING_SENTINEL");
  });
});
