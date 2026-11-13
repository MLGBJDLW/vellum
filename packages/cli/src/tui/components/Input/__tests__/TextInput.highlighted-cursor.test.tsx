import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act, type ComponentProps, createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/index.js";
import { TextInput } from "../TextInput.js";

// Ink suppresses ANSI styling in tests. Expose the inverse cursor cell as text
// while retaining real layout, input processing and syntax highlighting.
vi.mock("ink", async (importOriginal) => {
  const ink = await importOriginal<typeof import("ink")>();
  return {
    ...ink,
    Text: (props: ComponentProps<typeof ink.Text>) =>
      createElement(ink.Text, props, props.inverse ? `[${props.children}]` : props.children),
  };
});

afterEach(() => act(() => cleanup()));

it("renders the cursor within highlighted content after a soft wrap", async () => {
  let screen!: ReturnType<typeof render>;
  act(() => {
    screen = render(
      <ThemeProvider>
        <Box width={24} flexDirection="column">
          <TextInput value="012345678901234567@file" onChange={vi.fn()} enableHighlight />
        </Box>
      </ThemeProvider>
    );
  });
  await act(async () => {
    screen.stdin.write("\x1b[D".repeat(3));
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(screen.lastFrame()).toContain("@f[i]le");
});
