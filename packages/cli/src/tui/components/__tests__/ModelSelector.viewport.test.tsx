import { getProviderModels, getSupportedProviders } from "@vellum/provider";
import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../../i18n/index.js";
import { ThemeProvider } from "../../theme/index.js";
import { ModelSelector } from "../ModelSelector.js";

const terminal = vi.hoisted(() => ({ width: 80, height: 24, isNarrow: true, maxContentWidth: 78 }));
vi.mock("../../hooks/useTerminalSize.js", () => ({ useTerminalDimensions: () => terminal }));
afterEach(() => act(() => cleanup()));
beforeAll(() => {
  initI18n({ cliLanguage: "en" });
});

describe("ModelSelector viewport with the complete model catalog", () => {
  it.each([
    [80, 24],
    [120, 34],
  ])("keeps selection and footer visible at %i by %i", async (width, height) => {
    Object.assign(terminal, { width, height, isNarrow: width <= 80, maxContentWidth: width - 2 });
    const options = getSupportedProviders().flatMap((provider) =>
      getProviderModels(provider).map((model) => ({ provider, model }))
    );
    expect(options.length).toBeGreaterThan(24);
    const first = options[0];
    const last = options[options.length - 1];
    if (!first || !last) throw new Error("The complete model catalog must not be empty");
    const onSelect = vi.fn();
    let view!: ReturnType<typeof render>;
    act(() => {
      view = render(
        <ThemeProvider>
          <Box width={width}>
            <Box
              flexDirection="column"
              marginTop={width <= 80 ? 2 : 5}
              marginLeft={width <= 80 ? 1 : 10}
              borderStyle="round"
              padding={width <= 80 ? 0 : 1}
            >
              <ModelSelector
                currentModel={first.model.id}
                currentProvider={first.provider}
                onSelect={onSelect}
              />
            </Box>
          </Box>
        </ThemeProvider>
      );
    });
    await act(async () => {
      Object.defineProperty(view.stdout, "columns", { configurable: true, get: () => width });
      view.stdout.emit("resize");
    });
    const checkViewport = () => {
      const frame = view.lastFrame() ?? "";
      expect(frame.split("\n").length).toBeLessThanOrEqual(height);
      expect(frame.split("\n").every((line) => stringWidth(line) <= width)).toBe(true);
      expect(frame).toContain("Thinking:");
      expect(frame).toContain("Enter");
      return frame;
    };
    expect(checkViewport()).toContain(first.model.name);
    await act(async () => {
      view.stdin.write("\x1b[F\r");
    });
    expect(onSelect).toHaveBeenLastCalledWith(last.provider, last.model.id);
    expect(checkViewport()).toContain(last.model.name);
    expect(checkViewport()).toContain(`${options.length}/${options.length}`);
    await act(async () => {
      view.stdin.write("\x1b[H\r");
    });
    expect(onSelect).toHaveBeenLastCalledWith(first.provider, first.model.id);
    expect(checkViewport()).toContain(`1/${options.length}`);
    await act(async () => {
      view.stdin.write("\x1b[6~");
    });
    expect(checkViewport()).not.toContain(`1/${options.length}`);
    await act(async () => {
      view.stdin.write("\x1b[5~");
    });
    expect(checkViewport()).toContain(`1/${options.length}`);
  });
});
