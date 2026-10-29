import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import type React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAllCollapsibleStates } from "../../../hooks/useCollapsible.js";
import { ThemeProvider } from "../../../theme/index.js";
import { ThinkingBlock, type ThinkingBlockProps } from "../ThinkingBlock.js";

const header = vi.hoisted(() => ({ click: undefined as (() => void) | undefined, enabled: false }));

// Exercise ThinkingBlock's actual state/rendering while isolating mouse geometry,
// which is covered by Clickable's integration tests.
vi.mock("../../common/Clickable.js", () => ({
  Clickable: ({
    onClick,
    enabled = true,
    children,
  }: {
    onClick: () => void;
    enabled?: boolean;
    children: React.ReactNode;
  }) => {
    header.click = onClick;
    header.enabled = enabled;
    return <Box>{children}</Box>;
  },
}));

async function renderThinking(props: ThinkingBlockProps, width = 100) {
  const element = (next: ThinkingBlockProps) => (
    <ThemeProvider>
      <Box width={width}>
        <ThinkingBlock {...next} />
      </Box>
    </ThemeProvider>
  );
  let screen!: ReturnType<typeof render>;
  await act(async () => {
    screen = render(element(props));
  });
  return {
    ...screen,
    update: async (next: ThinkingBlockProps) => {
      await act(async () => {
        screen.rerender(element(next));
      });
    },
    click: async () => {
      expect(header.enabled).toBe(true);
      await act(async () => {
        header.click?.();
      });
    },
  };
}

afterEach(async () => {
  await act(async () => {
    cleanup();
  });
  clearAllCollapsibleStates();
});

describe("ThinkingBlock", () => {
  it("shows only a one-line activity title while collapsed", async () => {
    const screen = await renderThinking({
      content: "**Checking the parser**\nPRIVATE_BODY_SENTINEL with detailed analysis.",
      isStreaming: true,
      initialCollapsed: true,
    });
    expect(screen.lastFrame()).toContain("Thinking");
    expect(screen.lastFrame()).toContain("Checking the parser");
    expect(screen.lastFrame()).not.toContain("PRIVATE_BODY_SENTINEL");
    expect(screen.lastFrame()).not.toContain("chars");
    expect(screen.lastFrame()?.split("\n")).toHaveLength(1);
  });

  it("allows compact thinking to expand during streaming and shows the entire content immediately", async () => {
    const content = Array.from({ length: 80 }, (_, index) => `Exact reasoning line ${index}`).join(
      "\n"
    );
    const props = {
      content,
      isStreaming: true,
      initialCollapsed: true,
      displayMode: "compact" as const,
    };
    const screen = await renderThinking(props);
    await screen.click();
    for (const line of content.split("\n")) expect(screen.lastFrame()).toContain(line);
    await screen.update({ ...props, content: `${content}\nEXACT_STREAM_TAIL` });
    expect(screen.lastFrame()).toContain("EXACT_STREAM_TAIL");
    await screen.click();
    expect(screen.lastFrame()).not.toContain("EXACT_STREAM_TAIL");
    await screen.update({ ...props, isStreaming: false, isThinkingComplete: true });
    expect(screen.lastFrame()?.split("\n")).toHaveLength(1);
    await screen.click();
    for (const line of content.split("\n")) expect(screen.lastFrame()).toContain(line);
  });

  it("preserves manual expansion when streaming completes and initial defaults change", async () => {
    const props = {
      content: "Reasoning details\nEXACT_END",
      isStreaming: true,
      initialCollapsed: false,
      expandedByDefault: true,
      autoCollapse: true,
      autoCollapseDelayMs: 5,
    };
    const screen = await renderThinking(props);
    await screen.click();
    await screen.click();
    await screen.update({
      ...props,
      isStreaming: false,
      isThinkingComplete: true,
      initialCollapsed: true,
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(screen.lastFrame()).toContain("EXACT_END");
  });

  it("keeps a completed block open after a manual toggle even with auto-collapse settings", async () => {
    const screen = await renderThinking({
      content: "**Reviewing results**\nEXACT_COMPLETED_CONTENT",
      initialCollapsed: true,
      expandedByDefault: false,
      autoCollapse: true,
      isThinkingComplete: true,
    });
    await screen.click();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(screen.lastFrame()).toContain("EXACT_COMPLETED_CONTENT");
  });

  it("updates the summary only when a new provider heading is complete", async () => {
    const props = { content: "**Inspecting files**\nDetailed reasoning.", isStreaming: true };
    const screen = await renderThinking(props);
    await screen.update({ ...props, content: `${props.content}\n**Checking res` });
    expect(screen.lastFrame()).toContain("Inspecting files");
    expect(screen.lastFrame()).not.toContain("Checking res");
    await screen.update({
      ...props,
      content: `${props.content}\n**Checking results**\nMore reasoning.`,
    });
    expect(screen.lastFrame()).toContain("Checking results");
    expect(screen.lastFrame()).not.toContain("Inspecting files");
    expect(screen.lastFrame()?.split("\n")).toHaveLength(1);
  });

  it("preserves manual collapse across streaming updates and settings changes", async () => {
    const props = {
      content: "**Inspecting source**\nSTREAM_BODY",
      isStreaming: true,
      initialCollapsed: false,
    };
    const screen = await renderThinking(props);
    await screen.click();
    await screen.update({
      ...props,
      content: `${props.content}\nNEW_DETAIL`,
      initialCollapsed: false,
      expandedByDefault: true,
    });
    expect(screen.lastFrame()).not.toContain("NEW_DETAIL");
    await screen.update({
      ...props,
      isStreaming: false,
      isThinkingComplete: true,
      displayMode: "compact",
    });
    expect(screen.lastFrame()).not.toContain("STREAM_BODY");
    await screen.click();
    expect(screen.lastFrame()).toContain("STREAM_BODY");
  });

  it("consumes external keyboard signals once across virtualized remounts", async () => {
    const props = {
      content: "**Checking state**\nPERSISTED_BODY",
      persistenceId: "remounted-thinking",
      isStreaming: true,
      displayMode: "compact" as const,
      autoCollapse: true,
      toggleSignal: 1,
    };
    const first = await renderThinking(props);
    expect(first.lastFrame()).toContain("PERSISTED_BODY");
    await act(async () => {
      first.unmount();
    });
    const second = await renderThinking({ ...props, isStreaming: false, isThinkingComplete: true });
    expect(second.lastFrame()).toContain("PERSISTED_BODY");
    await second.update({
      ...props,
      isStreaming: false,
      isThinkingComplete: true,
      toggleSignal: 2,
    });
    expect(second.lastFrame()).not.toContain("PERSISTED_BODY");
  });

  it("still auto-collapses untouched thinking after completion", async () => {
    const props = {
      content: "Untouched reasoning body",
      isStreaming: true,
      initialCollapsed: false,
      autoCollapse: true,
      autoCollapseDelayMs: 5,
    };
    const screen = await renderThinking(props);
    expect(screen.lastFrame()).toContain("Untouched reasoning body");
    await screen.update({ ...props, isStreaming: false, isThinkingComplete: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(screen.lastFrame()).not.toContain("Untouched reasoning body");
    await screen.click();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(screen.lastFrame()).toContain("Untouched reasoning body");
  });

  it("allows the configured keyboard toggle during compact streaming", async () => {
    const screen = await renderThinking({
      content: "KEYBOARD_BODY",
      isStreaming: true,
      displayMode: "compact",
      enableKeyboardToggle: true,
    });
    await act(async () => {
      screen.stdin.write("t");
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(screen.lastFrame()).toContain("KEYBOARD_BODY");
  });

  it("keeps long CJK and emoji activity titles on one narrow terminal row", async () => {
    const screen = await renderThinking(
      { content: "**检查👩🏽‍💻代码与测试方案是否正确**\nHIDDEN_BODY", isStreaming: true },
      28
    );
    expect(screen.lastFrame()?.split("\n")).toHaveLength(1);
    expect(screen.lastFrame()).toContain("Thinking");
    expect(screen.lastFrame()).not.toContain("HIDDEN_BODY");
    expect(screen.lastFrame()).not.toContain("�");
  });

  it("requests a height measurement when expanded streaming content grows", async () => {
    const onHeightChange = vi.fn();
    const props = {
      content: "First line",
      initialCollapsed: false,
      isStreaming: true,
      onHeightChange,
    };
    const screen = await renderThinking(props);
    await screen.update({ ...props, content: "First line\nSecond line" });
    expect(onHeightChange).toHaveBeenCalledTimes(1);
    await screen.click();
    onHeightChange.mockClear();
    await screen.update({ ...props, content: "First line\nSecond line\nThird line" });
    expect(onHeightChange).not.toHaveBeenCalled();
  });
});
