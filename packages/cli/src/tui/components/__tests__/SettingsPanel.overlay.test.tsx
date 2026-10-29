import { Box, Text } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../context/MessagesContext.js";
import { ThemeProvider } from "../../theme/index.js";
import { globalClickRegistry } from "../../utils/click-region.js";
import { parseMouseEvent } from "../../utils/mouse-parser.js";
import { Layout } from "../Layout.js";
import { MessageList } from "../Messages/MessageList.js";
import { type SettingCategory, SettingsPanel } from "../SettingsPanel.js";

const preferences = vi.hoisted(() => ({ alternate: true, saveAlternate: vi.fn() }));

vi.mock("@vellum/core", async (original) => ({
  ...(await original<typeof import("@vellum/core")>()),
  loadConfig: () => ({
    ok: true,
    value: { workingDir: "C:/project", debug: false, logLevel: "info" },
  }),
}));
vi.mock("../../i18n/settings-integration.js", async (original) => ({
  ...(await original<typeof import("../../i18n/settings-integration.js")>()),
  getThinkingSettings: () => ({ enabled: false, budgetTokens: 10000, priority: "merge" }),
  getModelSettings: () => ({ provider: "fixture", modelId: "test-model" }),
  getSavedLanguage: () => "en",
  getDiffViewMode: () => "unified",
  getAlternateBufferEnabled: () => preferences.alternate,
  getThemeFromSettings: () => "dark",
  getModeFromSettings: () => "orch",
  setAlternateBufferEnabled: (value: boolean) => {
    preferences.alternate = value;
    preferences.saveAlternate(value);
  },
}));
vi.mock("../../hooks/useTerminalSize.js", () => ({
  useTerminalDimensions: () => ({ width: 80, height: 24, isNarrow: true, maxContentWidth: 78 }),
}));

beforeEach(() => {
  preferences.alternate = true;
  vi.clearAllMocks();
});
afterEach(() => {
  act(() => cleanup());
  globalClickRegistry.clear();
});

const message = (id: string, content: string): Message => ({
  id,
  content,
  role: "assistant",
  timestamp: new Date(0),
});
const history = message(
  "history",
  Array.from({ length: 100 }, (_, index) => `background-history-${index}`).join("\n")
);
const report = message(
  "settings-report",
  Array.from({ length: 60 }, (_, index) => `background-settings-report-${index}`).join("\n")
);

function tree(showOverlay: boolean, messages: Message[], category: SettingCategory = "general") {
  return (
    <ThemeProvider>
      <Box width={80} flexDirection="column">
        <Layout
          header={<Text>App header</Text>}
          footer={<Text>App footer</Text>}
          showSidebar={false}
        >
          <MessageList messages={messages} isFocused={!showOverlay} mouseEnabled={!showOverlay} />
          <Text>Composer</Text>
        </Layout>
        {showOverlay && (
          <Box
            position="absolute"
            opaque
            overflowY="scroll"
            scrollbar={false}
            flexDirection="column"
            marginTop={1}
            marginLeft={1}
            width={75}
          >
            <SettingsPanel initialCategory={category} onClose={vi.fn()} isActive />
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
}

describe("settings over the actual history compositor", () => {
  it.each([
    ["general", "Alternate Buffer"],
    ["model", "Provider"],
    ["mode", "Coding Mode"],
    ["theme", "Vim Mode"],
    ["diff", "Diff View Mode"],
    ["thinking", "Budget Tokens"],
  ] as const)(
    "keeps %s body painted while long command reports enter MessageList",
    async (category, bodyLabel) => {
      let screen!: ReturnType<typeof render>;
      await act(async () => {
        screen = render(tree(false, [history]));
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      expect(screen.lastFrame()).toContain("background-history-99");
      await act(async () => {
        screen.rerender(tree(true, [history], category));
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      expect(screen.lastFrame()).toContain("Edits save defaults for the next session.");
      expect(screen.lastFrame()).toContain(bodyLabel);
      await act(async () => {
        screen.rerender(tree(true, [history, report], category));
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      expect(screen.lastFrame()).toContain("Edits save defaults for the next session.");
      expect(screen.lastFrame()).toContain(bodyLabel);
      expect(screen.lastFrame()).toContain("Space: toggle");
      const rows = (screen.lastFrame() ?? "").split("\n");
      const top = rows.findIndex((row) => row.includes("╭"));
      const bottom = rows.findIndex((row) => row.includes("╰"));
      expect(top).toBe(1);
      expect(bottom).toBeLessThan(24);
      for (const row of rows.slice(top + 1, bottom)) {
        expect(row.slice(1, 76)).not.toContain("background-");
      }
      await act(async () => {
        screen.rerender(tree(false, [history, report]));
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      expect(screen.lastFrame()).toContain("background-settings-report-59");
      expect(screen.lastFrame()).not.toContain("saved defaults");
    }
  );

  it("keeps hit-testing aligned with the independent opaque region after history updates", async () => {
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(tree(true, [history, report]));
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    const rows = (screen.lastFrame() ?? "").split("\n");
    const row = rows.findIndex((line) => line.includes("Alternate Buffer"));
    expect(row).toBeGreaterThan(0);
    const line = rows[row] ?? "";
    const col = stringWidth(line.slice(0, line.indexOf("Alternate Buffer"))) + 1;
    await act(async () => {
      for (const suffix of ["M", "m"]) {
        const event = parseMouseEvent(`\x1b[<0;${col};${row + 1}${suffix}`);
        if (!event) throw new Error("Invalid pointer fixture");
        globalClickRegistry.dispatch(col, row + 1, event);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(preferences.saveAlternate).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.lastFrame()).toContain("Alternate Buffer");
    expect(screen.lastFrame()).toContain("✗ Off");
    expect(screen.lastFrame()).toContain("Edits save defaults for the next session.");
  });
});
