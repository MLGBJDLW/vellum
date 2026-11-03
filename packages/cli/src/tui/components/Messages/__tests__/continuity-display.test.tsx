import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/index.js";
import { StreamingIndicator } from "../../common/StreamingIndicator.js";
import { TokenBreakdown } from "../../StatusBar/TokenBreakdown.js";
import { ToolResultPreview } from "../ToolResultPreview.js";

afterEach(() => {
  act(() => cleanup());
  vi.useRealTimers();
});

it("keeps elapsed task time across indicator remounts and phase changes", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  const view = (visible: boolean, phase: "thinking" | "generating" = "thinking") => (
    <ThemeProvider>
      {visible && <StreamingIndicator phase={phase} startedAt={10_000} />}
    </ThemeProvider>
  );
  let screen!: ReturnType<typeof render>;
  await act(async () => {
    screen = render(view(true));
  });
  expect(screen.lastFrame()).toContain("1m 30s");
  await act(async () => {
    screen.rerender(view(false));
  });
  vi.setSystemTime(160_000);
  await act(async () => {
    screen.rerender(view(true, "generating"));
  });
  expect(screen.lastFrame()).toContain("2m 30s");
});

it("renders shell streams as readable text rather than escaped JSON", () => {
  let screen!: ReturnType<typeof render>;
  act(() => {
    screen = render(
      <ThemeProvider>
        <ToolResultPreview
          toolName="shell"
          result={JSON.stringify({
            stdout: "\u001b[32m你好\u001b[0m\r\nDone",
            stderr: "missing path",
            exitCode: 1,
          })}
        />
      </ThemeProvider>
    );
  });
  expect(screen.lastFrame()).toContain("你好");
  expect(screen.lastFrame()).toContain("missing path");
  expect(screen.lastFrame()).toContain("Exit code: 1");
  expect(screen.lastFrame()).not.toContain("\\u001b");
});

it("shows cache hit ratio against the total prompt, excluding cache writes from hits", () => {
  let screen!: ReturnType<typeof render>;
  act(() => {
    screen = render(
      <ThemeProvider>
        <TokenBreakdown
          compact
          total={{
            inputTokens: 1000,
            outputTokens: 100,
            cacheReadTokens: 500,
            cacheWriteTokens: 200,
          }}
        />
      </ThemeProvider>
    );
  });
  expect(screen.lastFrame()).toContain("50% hit");
});
