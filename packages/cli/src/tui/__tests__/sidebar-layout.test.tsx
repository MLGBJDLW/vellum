import { Box, Text } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSidebarWidth, Layout } from "../components/Layout.js";
import { MemoryPanel } from "../components/MemoryPanel.js";
import { SidebarHeader } from "../components/Sidebar/SidebarHeader.js";
import {
  AnimationProvider,
  useAnimation,
  useAnimationControls,
} from "../context/AnimationContext.js";
import { ThemeProvider } from "../theme/index.js";

afterEach(async () => {
  await act(async () => cleanup());
  vi.unstubAllEnvs();
});

describe("sidebar and motion layout", () => {
  it("keeps chat mounted while a compact sidebar is focused", async () => {
    const mounted = vi.fn();
    function Draft() {
      useEffect(mounted, []);
      return <Text>saved draft</Text>;
    }
    const view = (focused: boolean) => (
      <ThemeProvider>
        <Layout
          compactMode
          sidebarFocused={focused}
          showSidebar
          sidebar={<Text>Memory workspace</Text>}
        >
          <Draft />
        </Layout>
      </ThemeProvider>
    );
    const screen = render(view(false));
    await act(async () => {
      screen.rerender(view(true));
    });
    expect(screen.lastFrame()).toContain("Memory workspace");
    expect(screen.lastFrame()).not.toContain("saved draft");
    await act(async () => {
      screen.rerender(view(false));
    });
    expect(screen.lastFrame()).toContain("saved draft");
    expect(mounted).toHaveBeenCalledOnce();
    expect(getSidebarWidth(80)).toBe(0);
    expect(getSidebarWidth(120)).toBeGreaterThanOrEqual(28);
    expect(120 - getSidebarWidth(120)).toBeGreaterThanOrEqual(52);
  });

  it("renders readable memory previews at sidebar width without taking chat keystrokes", async () => {
    const onActivate = vi.fn();
    const entries = [
      {
        key: "Meeting preference",
        type: "preference" as const,
        content: "Always prepare a short agenda",
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { tags: [], importance: 0.5 },
      },
    ];
    const screen = render(
      <ThemeProvider>
        <Box width={28} flexDirection="column">
          <SidebarHeader panel="memory" isFocused={false} />
          <MemoryPanel
            entries={entries}
            width={26}
            maxHeight={10}
            isFocused={false}
            onActivateEntry={onActivate}
          />
        </Box>
      </ThemeProvider>
    );
    await act(async () => {
      screen.stdin.write("j\r");
    });
    expect(screen.lastFrame()).toContain("Meeting preference");
    expect(screen.lastFrame()).toContain("Always prepare");
    expect(screen.lastFrame()).toContain("Alt+B");
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("updates animation frames without repainting input-control consumers", async () => {
    vi.stubEnv("VELLUM_TEST_DISABLE_ANIMATION", "0");
    const controlRender = vi.fn();
    let lastFrame = 0;
    function Controls() {
      useAnimationControls();
      controlRender();
      return <Text>Input</Text>;
    }
    function Animated() {
      lastFrame = useAnimation().frame;
      return <Text>{lastFrame}</Text>;
    }
    render(
      <AnimationProvider tickInterval={20}>
        <Controls />
        <Animated />
      </AnimationProvider>
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(lastFrame).toBeGreaterThan(0);
    expect(controlRender).toHaveBeenCalledOnce();
  });
});
