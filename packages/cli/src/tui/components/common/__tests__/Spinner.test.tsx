import { setIconSet, themes } from "@vellum/shared";
import { Box, Text } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act, type ReactElement } from "react";
import stringWidth from "string-width";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimationContext, AnimationProvider } from "../../../context/AnimationContext.js";
import { ThemeProvider } from "../../../theme/index.js";
import { ASCII_SPINNER_FRAMES, SPINNER_FRAMES, Spinner } from "../Spinner.js";
import { StreamingIndicator } from "../StreamingIndicator.js";

vi.mock("ink", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ink")>();
  return { ...actual, Text: vi.fn(actual.Text) };
});

beforeEach(() => {
  setIconSet("unicode");
  vi.stubEnv("NO_COLOR", undefined);
});
afterEach(async () => {
  await act(async () => cleanup());
  setIconSet("unicode");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const animation = {
  frame: 0,
  timestamp: 0,
  isVSCode: false,
  tickInterval: 120,
  isPaused: false,
  pauseAnimations: () => {},
  resumeAnimations: () => {},
};

function renderInAct(element: ReactElement) {
  let screen: ReturnType<typeof render> | undefined;
  act(() => {
    screen = render(element);
  });
  if (!screen) throw new Error("Ink did not render");
  return screen;
}

describe("Vellum activity ink mark", () => {
  it.each(["unicode", "ascii"] as const)(
    "keeps the label aligned across %s frames",
    async (icons) => {
      setIconSet(icons);
      const frames = icons === "ascii" ? ASCII_SPINNER_FRAMES : SPINNER_FRAMES;
      const view = (frame: number) => (
        <ThemeProvider>
          <AnimationContext.Provider value={{ ...animation, frame }}>
            <Box width={20}>
              <Spinner label="Using tool" />
            </Box>
          </AnimationContext.Provider>
        </ThemeProvider>
      );
      const screen = renderInAct(view(0));
      for (let frame = 0; frame < frames.length; frame++) {
        await act(async () => screen.rerender(view(frame)));
        const line = screen.lastFrame() ?? "";
        expect(line).toBe(`${frames[frame]} Using tool`);
        expect(stringWidth(line.split("Using")[0] ?? "")).toBe(4);
        if (icons === "ascii") expect(line).toMatch(/^[\x20-\x7e]+$/u);
      }
    }
  );

  it("pads custom frames and falls back for an empty sequence", async () => {
    const view = (frames: readonly string[], frame: number) => (
      <ThemeProvider>
        <AnimationContext.Provider value={{ ...animation, frame }}>
          <Spinner frames={frames} label="Writing" />
        </AnimationContext.Provider>
      </ThemeProvider>
    );
    const screen = renderInAct(view([".", "..."], 0));
    expect(screen.lastFrame()).toBe(".   Writing");
    await act(async () => screen.rerender(view([".", "..."], 1)));
    expect(screen.lastFrame()).toBe("... Writing");
    await act(async () => screen.rerender(view([], 0)));
    expect(screen.lastFrame()).toBe(`${SPINNER_FRAMES[0]} Writing`);
  });

  it.each(["parchment", "dark", "light", "ansi"] as const)("uses readable %s ink", (name) => {
    vi.mocked(Text).mockClear();
    renderInAct(
      <ThemeProvider theme={name}>
        <Spinner label="Working" />
      </ThemeProvider>
    );
    expect(Text).toHaveBeenCalledWith(
      expect.objectContaining({ color: themes[name].semantic.text.primary, "aria-hidden": true }),
      undefined
    );
  });

  it("respects NO_COLOR even with an explicit spinner color", () => {
    vi.stubEnv("NO_COLOR", "1");
    vi.mocked(Text).mockClear();
    renderInAct(
      <ThemeProvider>
        <Spinner color="red" label="Working" />
      </ThemeProvider>
    );
    expect(Text).toHaveBeenCalledWith(
      expect.objectContaining({ color: undefined, "aria-hidden": true }),
      undefined
    );
  });

  it("shares one timer across active indicators and none in reduced motion", async () => {
    vi.stubEnv("VELLUM_TEST_DISABLE_ANIMATION", "0");
    vi.stubEnv("VELLUM_REDUCED_MOTION", "0");
    const interval = vi.spyOn(globalThis, "setInterval");
    const view = () => (
      <ThemeProvider>
        <AnimationProvider>
          <Box>
            {"abcdefghijkl".split("").map((id) => (
              <Spinner key={id} />
            ))}
          </Box>
        </AnimationProvider>
      </ThemeProvider>
    );
    await act(async () => {
      renderInAct(view());
    });
    expect(interval).toHaveBeenCalledTimes(1);
    await act(async () => cleanup());
    interval.mockClear();
    vi.stubEnv("VELLUM_REDUCED_MOTION", "1");
    const screen = renderInAct(view());
    await act(async () => {});
    expect(interval).not.toHaveBeenCalled();
    expect(screen.lastFrame()).toBe(SPINNER_FRAMES[0].repeat(12));
  });

  it("uses the same mark for tool activity in a narrow layout", () => {
    const screen = renderInAct(
      <ThemeProvider>
        <Box width={24}>
          <StreamingIndicator phase="tool_executing" toolName="read" narrow showPhaseTime={false} />
        </Box>
      </ThemeProvider>
    );
    expect(screen.lastFrame()).toContain(`${SPINNER_FRAMES[0]} [*] Using read...`);
    for (const line of (screen.lastFrame() ?? "").split("\n"))
      expect(stringWidth(line)).toBeLessThanOrEqual(24);
  });
});
