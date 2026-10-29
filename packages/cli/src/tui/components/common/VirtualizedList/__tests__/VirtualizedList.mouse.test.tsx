import { Box, type DOMElement, getVerticalScrollbarBoundingBox, Text } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MouseProvider } from "../../../../context/MouseContext.js";
import type { UseMouseOptions } from "../../../../hooks/useMouse.js";
import { parseMouseEvent } from "../../../../utils/mouse-parser.js";
import { NewMessagesBanner } from "../NewMessagesBanner.js";
import { SCROLL_TO_ITEM_END, type VirtualizedListRef } from "../types.js";
import { VirtualizedList } from "../VirtualizedList.js";

const mouse = vi.hoisted(() => ({ options: {} as UseMouseOptions }));
vi.mock("../../../../hooks/useMouse.js", () => ({
  useMouse: (options: UseMouseOptions) => {
    mouse.options = options;
    return { isActive: true, lastPosition: null, setEnabled: vi.fn() };
  },
}));

type Item = { id: string; text: string };
const keyExtractor = (item: Item) => item.id;
const renderItem = ({ item }: { item: Item }) => <Text>{item.text}</Text>;
const lines = (count: number) =>
  Array.from({ length: count }, (_, index) => `History line ${index}`).join("\n");

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 70));
  });
}

async function pointer(code: number, col: number, row: number, release = false) {
  const event = parseMouseEvent(`\u001b[<${code};${col};${row}${release ? "m" : "M"}`);
  if (!event) throw new Error("Invalid test mouse report");
  await act(async () => {
    mouse.options.onMouseEvent?.(event);
    if (event.action === "move") mouse.options.onMove?.(event);
    else mouse.options.onClick?.(event);
  });
  await settle();
}

async function mountList(
  initialData: Item[],
  initialOptions: { height: number; enabled: boolean; smooth: boolean; initialIndex?: number } = {
    height: 12,
    enabled: true,
    smooth: false,
  }
) {
  const list = createRef<VirtualizedListRef<Item>>();
  const container = createRef<DOMElement>();
  let data = initialData;
  let options = initialOptions;
  const view = () => (
    <MouseProvider enabled mode="full">
      <Box width={40} height={options.height} ref={container}>
        <VirtualizedList
          ref={list}
          data={data}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          estimatedItemHeight={1}
          initialScrollIndex={options.initialIndex ?? SCROLL_TO_ITEM_END}
          isStreaming
          enableSmoothScroll={options.smooth}
          enableMouseInteraction={options.enabled}
        />
      </Box>
    </MouseProvider>
  );
  let screen!: ReturnType<typeof render>;
  await act(async () => {
    screen = render(view());
  });
  await settle();
  return {
    list,
    screen,
    scrollbar: () => {
      const node = container.current?.childNodes[0] as DOMElement | undefined;
      const bounds = node && getVerticalScrollbarBoundingBox(node);
      if (!bounds) throw new Error("Native Ink scrollbar is missing");
      return bounds;
    },
    update: async (next: Item[]) => {
      data = next;
      await act(async () => screen.rerender(view()));
      await settle();
    },
    configure: async (next: Partial<typeof options>) => {
      options = { ...options, ...next };
      await act(async () => screen.rerender(view()));
      await settle();
    },
  };
}

afterEach(async () => {
  await act(async () => cleanup());
});

describe("VirtualizedList native scrollbar and reading ownership", () => {
  it("activates the new-message banner once for a complete primary click", async () => {
    const jump = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        <MouseProvider enabled mode="full">
          <NewMessagesBanner unreadCount={2} isAtBottom={false} onJumpToBottom={jump} width={60} />
        </MouseProvider>
      );
    });
    await settle();
    const frame = screen.lastFrame()?.split("\n") ?? [];
    const row = frame.findIndex((line) => line.includes("2 new messages"));
    const col = frame[row]?.indexOf("2 new messages") ?? -1;
    expect(row).toBeGreaterThanOrEqual(0);
    expect(col).toBeGreaterThanOrEqual(0);
    await pointer(0, col + 1, row + 1);
    expect(jump).not.toHaveBeenCalled();
    await pointer(0, col + 1, row + 1, true);
    expect(jump).toHaveBeenCalledTimes(1);
  });

  it("drags the native thumb across regions, then stops on release", async () => {
    const app = await mountList([{ id: "response", text: lines(80) }]);
    expect(app.screen.lastFrame()).toContain("History line 79");
    const bar = app.scrollbar();
    await pointer(0, bar.x + 1, bar.thumb.y + 1);
    await pointer(32, 2, bar.y + 1);
    expect(app.list.current?.getScrollState().scrollTop).toBe(0);
    expect(app.screen.lastFrame()).toContain("History line 0");
    await pointer(0, 2, bar.y + 1, true);
    await pointer(32, 2, bar.y + bar.height);
    expect(app.list.current?.getScrollState().scrollTop).toBe(0);
  });

  it("preserves an explicit near-bottom reading position during streaming and appends", async () => {
    const app = await mountList([{ id: "response", text: lines(80) }]);
    await act(async () => app.list.current?.scrollBy(-1));
    await settle();
    const before = app.list.current?.getScrollState().scrollTop;
    expect(app.list.current?.getFollowMode(), app.screen.lastFrame()).toBe("off");
    expect(app.screen.lastFrame()).not.toContain("History line 79");
    await app.update([{ id: "response", text: lines(81) }]);
    expect(app.list.current?.getScrollState().scrollHeight).toBe(81);
    expect(app.list.current?.getScrollState().scrollTop).toBe(before);
    expect(app.screen.lastFrame()).not.toContain("History line 80");
    await app.update([
      { id: "response", text: lines(81) },
      { id: "next", text: "New message arrives" },
    ]);
    expect(app.list.current?.getScrollState().scrollTop).toBe(before);
    expect(app.list.current?.getFollowMode()).toBe("off");
  });

  it("pages the native track once and preserves the grabbed thumb offset", async () => {
    const app = await mountList([{ id: "response", text: lines(40) }]);
    let bar = app.scrollbar();
    await pointer(0, bar.x + 1, bar.y + 1);
    expect(app.list.current?.getScrollState().scrollTop).toBe(16);
    await pointer(0, bar.x + 1, bar.y + 1, true);
    expect(app.list.current?.getScrollState().scrollTop).toBe(16);
    bar = app.scrollbar();
    const grabRow = bar.thumb.y + bar.thumb.height;
    await pointer(0, bar.x + 1, grabRow);
    await pointer(32, 2, grabRow);
    expect(app.list.current?.getScrollState().scrollTop).toBe(16);
    await pointer(32, 2, grabRow - 1);
    expect(app.list.current?.getScrollState().scrollTop).toBeLessThan(16);
    expect(app.list.current?.getScrollState().scrollTop).toBeGreaterThan(4);
    await pointer(0, 2, grabRow - 1, true);
  });

  it("keeps reading through a drag and restores follow only when dragged to bottom", async () => {
    const app = await mountList([{ id: "response", text: lines(80) }]);
    let bar = app.scrollbar();
    await pointer(0, bar.x + 1, bar.thumb.y + 1);
    await pointer(32, 2, bar.y + 4);
    const reading = app.list.current?.getScrollState().scrollTop;
    await app.update([{ id: "response", text: lines(83) }]);
    expect(app.list.current?.getScrollState().scrollTop).toBe(reading);
    bar = app.scrollbar();
    await pointer(32, 2, bar.y + bar.height + 5);
    await pointer(0, 2, bar.y + bar.height + 5, true);
    expect(app.list.current?.getFollowMode()).toBe("auto");
    await app.update([{ id: "response", text: lines(84) }]);
    expect(app.list.current?.getScrollState().scrollTop).toBe(72);
    expect(app.screen.lastFrame()).toContain("History line 83");
  });

  it.each(["disable", "resize"] as const)("cancels captured dragging on %s", async (change) => {
    const app = await mountList([{ id: "response", text: lines(80) }]);
    await act(async () => app.list.current?.scrollTo(20));
    await settle();
    const bar = app.scrollbar();
    await pointer(0, bar.x + 1, bar.thumb.y + 1);
    await app.configure(change === "disable" ? { enabled: false } : { height: 16 });
    await pointer(32, 2, bar.y + bar.height + 5);
    expect(app.list.current?.getScrollState().scrollTop).toBe(20);
    expect(app.list.current?.getFollowMode()).toBe("off");
  });

  it("ignores the old scrollbar after content stops overflowing", async () => {
    const app = await mountList([{ id: "response", text: lines(80) }]);
    const bar = app.scrollbar();
    await pointer(0, bar.x + 1, bar.thumb.y + 1);
    await pointer(32, 2, bar.y + 4);
    await app.update([{ id: "response", text: lines(4) }]);
    await pointer(32, 2, bar.y + bar.height + 5);
    await pointer(0, 2, bar.y + bar.height + 5, true);
    expect(app.list.current?.getScrollState().scrollTop).toBe(0);
    expect(app.list.current?.getFollowMode()).toBe("off");
    await app.update([{ id: "response", text: lines(80) }]);
    expect(app.list.current?.getScrollState().scrollTop).toBe(0);
    expect(app.screen.lastFrame()).toContain("History line 0");
  });

  it("honors reading intent with smooth scrolling enabled and follows one-row growth after End", async () => {
    const app = await mountList([{ id: "response", text: lines(80) }], {
      height: 12,
      enabled: true,
      smooth: true,
    });
    await act(async () => app.list.current?.scrollBy(-1));
    await settle();
    await app.update([{ id: "response", text: lines(81) }]);
    expect(app.list.current?.getScrollState().scrollTop).toBe(67);
    await act(async () => app.list.current?.scrollToEnd());
    await settle();
    await app.update([{ id: "response", text: lines(82) }]);
    expect(app.list.current?.getScrollState().scrollTop).toBe(70);
    expect(app.screen.lastFrame()).toContain("History line 81");
  });

  it("keeps the reader within the anchored message when that message shrinks", async () => {
    const later = {
      id: "later",
      text: Array.from({ length: 50 }, (_, i) => `Later line ${i}`).join("\n"),
    };
    const app = await mountList([{ id: "response", text: lines(80) }, later]);
    await act(async () => app.list.current?.scrollTo(30));
    await settle();
    expect(app.screen.lastFrame()).toContain("History line 30");
    await app.update([{ id: "response", text: lines(20) }, later]);
    expect(app.list.current?.getScrollState().scrollTop).toBe(19);
    expect(app.screen.lastFrame()).toContain("History line 19");
    expect(app.list.current?.getFollowMode()).toBe("off");
  });

  it("restores a configured initial history position when data arrives after mount", async () => {
    const app = await mountList([], { height: 12, enabled: true, smooth: false, initialIndex: 10 });
    await app.update(Array.from({ length: 50 }, (_, i) => ({ id: String(i), text: `Item ${i}` })));
    expect(app.list.current?.getScrollState().scrollTop).toBe(10);
    expect(app.screen.lastFrame()?.split("\n")[0]).toContain("Item 10");
    expect(app.list.current?.getFollowMode()).toBe("off");
  });

  it("restores follow after coalesced scroll events return to the bottom", async () => {
    const app = await mountList([{ id: "response", text: lines(80) }]);
    await act(async () => {
      app.list.current?.scrollBy(-1);
      app.list.current?.scrollBy(1);
    });
    await settle();
    expect(app.list.current?.getScrollState().scrollTop).toBe(68);
    expect(app.list.current?.getFollowMode()).toBe("auto");
    await act(async () => app.list.current?.scrollTo(20));
    await settle();
    await act(async () => {
      app.list.current?.scrollBy(40);
      app.list.current?.scrollBy(8);
    });
    await settle();
    expect(app.list.current?.getFollowMode()).toBe("auto");
    await app.update([{ id: "response", text: lines(81) }]);
    expect(app.list.current?.getScrollState().scrollTop).toBe(69);
    expect(app.screen.lastFrame()).toContain("History line 80");
  });
});
