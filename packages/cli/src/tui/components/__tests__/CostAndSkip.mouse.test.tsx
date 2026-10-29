import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import type React from "react";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MouseInteractionScope } from "../../context/MouseContext.js";
import { ThemeProvider } from "../../theme/index.js";
import { globalClickRegistry } from "../../utils/click-region.js";
import { parseMouseEvent } from "../../utils/mouse-parser.js";
import { CostWarning } from "../common/CostWarning.js";
import { OptionSelector } from "../Tools/OptionSelector.js";

function wrap(content: React.ReactNode, enabled = true) {
  return (
    <ThemeProvider>
      <MouseInteractionScope enabled={enabled}>
        <Box marginLeft={5} marginTop={2} width={90}>
          {content}
        </Box>
      </MouseInteractionScope>
    </ThemeProvider>
  );
}
function click(screen: ReturnType<typeof render>, label: string) {
  const lines = (screen.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes(label));
  expect(row, `Missing ${label}`).toBeGreaterThanOrEqual(0);
  const line = lines[row] ?? "";
  const col = stringWidth(line.slice(0, line.indexOf(label))) + 1;
  for (const suffix of ["M", "m"]) {
    const event = parseMouseEvent(`\x1b[<0;${col};${row + 1}${suffix}`);
    if (!event) throw new Error("Invalid mouse fixture");
    globalClickRegistry.dispatch(col, row + 1, event);
  }
}
afterEach(async () => {
  await act(async () => cleanup());
  globalClickRegistry.clear();
});
const costProps = {
  costUsed: 6,
  costLimit: 5,
  requestsUsed: 5,
  percentUsed: 120,
  limitReached: true,
};

describe("cost confirmation and option skip clicks", () => {
  it.each([false, true])(
    "resolves the clicked cost decision once in compact=%s and resets for the next approval",
    async (compact) => {
      const approve = vi.fn();
      const deny = vi.fn();
      let screen!: ReturnType<typeof render>;
      const tree = (awaitingApproval: boolean) =>
        wrap(
          <CostWarning
            {...costProps}
            compact={compact}
            awaitingApproval={awaitingApproval}
            onApprove={approve}
            onDeny={deny}
          />
        );
      await act(async () => {
        screen = render(tree(true));
      });
      await act(async () => {
        click(screen, "[n]");
        click(screen, "[n]");
        click(screen, "[y]");
      });
      expect(deny).toHaveBeenCalledTimes(1);
      expect(approve).not.toHaveBeenCalled();
      await act(async () => {
        screen.rerender(tree(false));
      });
      expect(screen.lastFrame()).not.toContain("[y]");
      expect(globalClickRegistry.size).toBe(0);
      await act(async () => {
        screen.rerender(tree(true));
      });
      await act(async () => {
        click(screen, "[y]");
      });
      expect(approve).toHaveBeenCalledTimes(1);
    }
  );
  it("leaves a cost status passive without handlers and blocks approval behind another modal", async () => {
    const approve = vi.fn();
    const deny = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(wrap(<CostWarning {...costProps} awaitingApproval />));
    });
    expect(globalClickRegistry.size).toBe(0);
    await act(async () => {
      screen.rerender(
        wrap(
          <CostWarning {...costProps} awaitingApproval onApprove={approve} onDeny={deny} />,
          false
        )
      );
    });
    await act(async () => {
      click(screen, "[y]");
      click(screen, "[n]");
    });
    expect(approve).not.toHaveBeenCalled();
    expect(deny).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "shows a clickable skip with showHelpText=%s and resolves before queued input",
    async (showHelpText) => {
      const cancel = vi.fn();
      const select = vi.fn();
      let screen!: ReturnType<typeof render>;
      const tree = (question: string) =>
        wrap(
          <OptionSelector
            question={question}
            options={["Alpha", "Beta"]}
            onSelect={select}
            onCancel={cancel}
            showHelpText={showHelpText}
          />
        );
      await act(async () => {
        screen = render(tree("First question"));
      });
      await act(async () => {
        click(screen, "Skip");
        click(screen, "Skip");
        click(screen, "Beta");
        screen.stdin.write("\r");
      });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(select).not.toHaveBeenCalled();
      await act(async () => {
        screen.rerender(tree("Next question"));
      });
      await act(async () => {
        click(screen, "Beta");
        click(screen, "Skip");
      });
      expect(select).toHaveBeenCalledExactlyOnceWith("Beta", 1);
      expect(cancel).toHaveBeenCalledTimes(1);
    }
  );
  it("respects option focus, missing cancel callback, and modal isolation for both mouse and keyboard", async () => {
    const cancel = vi.fn();
    const select = vi.fn();
    let screen!: ReturnType<typeof render>;
    const content = (focused = true, onCancel: (() => void) | undefined = cancel) => (
      <OptionSelector
        question="Choose"
        options={["Alpha"]}
        isFocused={focused}
        onSelect={select}
        onCancel={onCancel}
      />
    );
    await act(async () => {
      screen = render(wrap(content(false)));
    });
    await act(async () => {
      click(screen, "Skip");
      screen.stdin.write("\x1b");
    });
    expect(cancel).not.toHaveBeenCalled();
    await act(async () => {
      screen.rerender(wrap(content(), false));
    });
    await act(async () => {
      click(screen, "Skip");
      click(screen, "Alpha");
      screen.stdin.write("\r");
    });
    expect(cancel).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    await act(async () => {
      screen.rerender(
        wrap(<OptionSelector question="Choose" options={["Alpha"]} onSelect={select} />)
      );
    });
    expect(screen.lastFrame()).not.toContain("Skip");
  });
});
