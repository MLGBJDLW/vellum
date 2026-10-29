import { Box, Text } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../context/MessagesContext.js";
import { ThemeProvider } from "../../theme/index.js";
import { BacktrackControls } from "../backtrack/BacktrackControls.js";
import { Autocomplete } from "../Input/Autocomplete.js";
import { TextInput } from "../Input/TextInput.js";
import { Layout } from "../Layout.js";
import { MessageList } from "../Messages/MessageList.js";
import { TipBanner } from "../TipBanner.js";

const terminal = vi.hoisted(() => ({ alternate: false }));
let originalTTY: PropertyDescriptor | undefined;

vi.mock("../../hooks/useTerminalSize.js", () => ({
  useTerminalDimensions: () => ({ width: 80, height: 24, isNarrow: true, maxContentWidth: 78 }),
}));
vi.mock("../../i18n/settings-integration.js", async (original) => ({
  ...(await original<typeof import("../../i18n/settings-integration.js")>()),
  getAlternateBufferEnabled: () => terminal.alternate,
}));

beforeEach(() => {
  originalTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
});
afterEach(() => {
  act(() => cleanup());
  if (originalTTY) Object.defineProperty(process.stdout, "isTTY", originalTTY);
  else Reflect.deleteProperty(process.stdout, "isTTY");
});

const history: Message = {
  id: "layout-history",
  role: "assistant",
  timestamp: new Date(0),
  content: Array.from(
    { length: 100 },
    (_, index) => `History item ${index}: reading position`
  ).join("\n"),
};

function header() {
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexGrow={1}>
          <TipBanner
            compact
            onDismiss={vi.fn()}
            tip={{
              id: "quick-help",
              icon: "Hint:",
              title: "Quick Help",
              content: "Press /help anytime to see available commands and keyboard shortcuts.",
              category: "features",
              trigger: {},
              priority: 1,
              dismissable: true,
            }}
          />
        </Box>
      </Box>
      <BacktrackControls
        backtrackState={{
          canUndo: true,
          canRedo: false,
          forkCount: 0,
          currentBranch: "Main",
          currentIndex: 5,
          historyLength: 6,
        }}
        branches={[
          {
            id: "main",
            name: "Main",
            forkPoint: 0,
            history: [],
            parentBranchId: null,
            createdAt: 0,
          },
        ]}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onCreateBranch={vi.fn()}
        onSwitchBranch={vi.fn()}
      />
    </Box>
  );
}

function tree(open: boolean) {
  return (
    <ThemeProvider>
      <Box width={80}>
        <Layout
          header={header()}
          footer={<Text>Footer status</Text>}
          workspace="workspace-fixture"
          showSidebar={false}
        >
          <Box flexDirection="column" flexGrow={1}>
            <MessageList messages={[history]} useAltBuffer={terminal.alternate} />
          </Box>
          <Box flexDirection="column" flexShrink={0}>
            <TextInput value={open ? "/mode " : ""} onChange={vi.fn()} />
            {open && (
              <Autocomplete
                input=""
                options={["orch", "plan", "spec", "vibe"]}
                onSelect={vi.fn()}
                onCancel={vi.fn()}
              />
            )}
          </Box>
        </Layout>
      </Box>
    </ThemeProvider>
  );
}

describe("fixed header with a growing autocomplete composer", () => {
  it.each([false, true])(
    "preserves tip/backtrack/separator in 24 rows (alternate buffer: %s)",
    async (alternate) => {
      terminal.alternate = alternate;
      let screen!: ReturnType<typeof render>;
      await act(async () => {
        screen = render(tree(false));
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      const before = screen.lastFrame() ?? "";
      expect(before).toContain("keyboard shortcuts.");
      expect(before).toContain("^Z undo");
      expect(before).toContain("workspace-fixture");
      const headerEnd = before.split("\n").findIndex((line) => line.includes("workspace-fixture"));
      const headerRows = before.split("\n").slice(0, headerEnd + 1);
      expect(headerRows.length).toBe(6);
      await act(async () => {
        screen.rerender(tree(true));
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      const after = (screen.lastFrame() ?? "").split("\n");
      expect(after.slice(0, headerRows.length)).toEqual(headerRows);
      expect(after[headerEnd]).not.toContain("History item");
      expect(after.join("\n")).toContain("Footer status");
      expect(after.join("\n")).toContain("vibe");
      expect(after.length).toBeLessThanOrEqual(24);
    }
  );
});
