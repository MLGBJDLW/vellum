import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/index.js";
import { SystemStatusPanel, type SystemStatusPanelProps } from "../SystemStatusPanel.js";

vi.mock("../../../context/AppContext.js", () => ({
  useApp: () => ({ state: { vimMode: false } }),
}));
vi.mock("../../../context/LspContext.js", () => ({ useLspOptional: () => null }));
vi.mock("../../../context/McpContext.js", () => ({
  useMcp: () => ({ hub: null, isInitialized: false, isInitializing: false, error: null }),
}));

afterEach(() => {
  act(() => cleanup());
});

async function frame(props: SystemStatusPanelProps, width = 26) {
  let screen!: ReturnType<typeof render>;
  await act(async () => {
    screen = render(
      <ThemeProvider>
        <Box width={width}>
          <SystemStatusPanel {...props} />
        </Box>
      </ThemeProvider>
    );
  });
  return screen.lastFrame() ?? "";
}

describe("sidebar context usage", () => {
  it("shows a meter for actual last-request occupancy and marks compacted estimates", async () => {
    const output = await frame({ context: { tokens: 100000, window: 200000, estimated: true } });
    expect(output).toContain("▓▓▓▓▓▓░░░░░░ ~50%");
    expect(output).toContain("100K/200K tokens");
    expect(output).toContain("estimated after");
    for (const line of output.split("\n")) expect(stringWidth(line)).toBeLessThanOrEqual(26);
  });

  it("preserves unknown usage and unknown limits without fabricating zero percent", async () => {
    const awaiting = await frame({ context: { window: 200000 } });
    expect(awaiting).toContain("awaiting usage");
    expect(awaiting).toContain("?/200K tokens");
    expect(awaiting).not.toContain("0%");
    const unknownLimit = await frame({ compact: true, context: { tokens: 64000 } }, 22);
    expect(unknownLimit).toContain("64K/? tokens");
    expect(unknownLimit).not.toContain("%");
  });

  it("clamps the fill while preserving over-capacity evidence in a narrow sidebar", async () => {
    const output = await frame({ compact: true, context: { tokens: 120000, window: 100000 } }, 22);
    expect(output).toContain("▓▓▓▓▓▓▓▓ 120%");
    expect(output).toContain("120K/100K tokens");
    for (const line of output.split("\n")) expect(stringWidth(line)).toBeLessThanOrEqual(22);
  });

  it("handles invalid usage without crashing the terminal", async () => {
    const output = await frame({ context: { tokens: -1, window: Number.NaN } });
    expect(output).toContain("?/? tokens");
    expect(output).not.toContain("NaN");
    expect(output).not.toContain("%");
  });
});
