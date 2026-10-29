import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../theme/index.js";
import { globalClickRegistry } from "../../utils/click-region.js";
import { parseMouseEvent } from "../../utils/mouse-parser.js";
import { StatusBar } from "../StatusBar/StatusBar.js";
import { OptionSelector } from "../Tools/OptionSelector.js";
import { PermissionDialog } from "../Tools/PermissionDialog.js";

function clickLabel(screen: ReturnType<typeof render>, label: string) {
  const lines = (screen.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes(label));
  expect(row, `Missing ${label}`).toBeGreaterThanOrEqual(0);
  const line = lines[row] ?? "";
  const col = stringWidth(line.slice(0, line.indexOf(label))) + 1;
  for (const suffix of ["M", "m"]) {
    const event = parseMouseEvent(`\x1b[<0;${col};${row + 1}${suffix}`);
    if (!event) throw new Error("Bad fixture mouse event");
    globalClickRegistry.dispatch(col, row + 1, event);
  }
}
afterEach(async () => {
  await act(async () => cleanup());
  globalClickRegistry.clear();
});

describe("rendered control clicks", () => {
  it("opens the measured footer mode and model controls away from the terminal bottom", async () => {
    const mode = vi.fn();
    const model = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        <ThemeProvider>
          <Box marginTop={3} width={90}>
            <StatusBar
              mode="orch"
              modelName="fixture-model"
              onModeClick={mode}
              onModelClick={model}
            />
          </Box>
        </ThemeProvider>
      );
    });
    await act(async () => {
      clickLabel(screen, "orch");
    });
    expect(mode).toHaveBeenCalledExactlyOnceWith("orch");
    expect(model).not.toHaveBeenCalled();
    await act(async () => {
      clickLabel(screen, "fixture-model");
    });
    expect(model).toHaveBeenCalledTimes(1);
    expect(mode).toHaveBeenCalledTimes(1);
  });

  it("activates an approval exactly once and keeps neighboring reject separate", async () => {
    const approve = vi.fn();
    const reject = vi.fn();
    const always = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        <ThemeProvider>
          <Box width={90}>
            <PermissionDialog
              execution={{
                id: "mouse-dialog",
                toolName: "read_file",
                params: {},
                status: "pending",
              }}
              riskLevel="low"
              onApprove={approve}
              onReject={reject}
              onApproveAlways={always}
            />
          </Box>
        </ThemeProvider>
      );
    });
    await act(async () => {
      clickLabel(screen, "[n/Esc]");
      clickLabel(screen, "[y/Enter]");
    });
    expect(reject).toHaveBeenCalledTimes(1);
    expect(approve).not.toHaveBeenCalled();
    expect(always).not.toHaveBeenCalled();
  });

  it("selects the clicked option row only while its dialog has focus", async () => {
    const select = vi.fn();
    let screen!: ReturnType<typeof render>;
    const content = (isFocused: boolean) => (
      <ThemeProvider>
        <Box width={80} marginTop={2}>
          <OptionSelector
            question="Choose"
            options={["Alpha", "Beta"]}
            onSelect={select}
            isFocused={isFocused}
          />
        </Box>
      </ThemeProvider>
    );
    await act(async () => {
      screen = render(content(true));
    });
    await act(async () => {
      clickLabel(screen, "Beta");
    });
    expect(select).toHaveBeenCalledExactlyOnceWith("Beta", 1);
    await act(async () => {
      screen.rerender(content(false));
    });
    await act(async () => {
      clickLabel(screen, "Alpha");
    });
    expect(select).toHaveBeenCalledTimes(1);
  });
});
