import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../theme/index.js";
import { type SettingCategory, SettingsPanel } from "../SettingsPanel.js";

const preferences = vi.hoisted(() => ({
  mode: undefined as string | undefined,
  saveMode: vi.fn(),
}));
vi.mock("@vellum/core", async (original) => ({
  ...(await original<typeof import("@vellum/core")>()),
  loadConfig: () => ({
    ok: true,
    value: {
      workingDir: `C:/project/${"long-folder/".repeat(12)}`,
      debug: false,
      logLevel: "info",
    },
  }),
}));
vi.mock("../../i18n/index.js", () => ({
  getThinkingSettings: () => ({ enabled: false, budgetTokens: 10000, priority: "merge" }),
  getModelSettings: () => ({ provider: "fixture", modelId: "long-model-".repeat(15) }),
  getSavedLanguage: () => "en",
  getDiffViewMode: () => "unified",
  getAlternateBufferEnabled: () => true,
  getThemeFromSettings: () => "dark",
  getModeFromSettings: () => preferences.mode,
  setModeInSettings: (value: string) => {
    preferences.mode = value;
    preferences.saveMode(value);
  },
  setThinkingSettings: vi.fn(),
  setAlternateBufferEnabled: vi.fn(),
  setDiffViewMode: vi.fn(),
  setThemeInSettings: vi.fn(),
}));

beforeEach(() => {
  preferences.mode = undefined;
  vi.clearAllMocks();
});
afterEach(() => act(() => cleanup()));

async function mount(category: SettingCategory) {
  let screen!: ReturnType<typeof render>;
  await act(async () => {
    screen = render(
      <ThemeProvider>
        <Box width={80}>
          <SettingsPanel initialCategory={category} onClose={vi.fn()} />
        </Box>
      </ThemeProvider>
    );
  });
  return screen;
}

async function send(screen: ReturnType<typeof render>, data: string) {
  await act(async () => {
    screen.stdin.write(data);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("saved default preferences panel", () => {
  it.each(["general", "model", "mode", "theme", "diff", "thinking"] as const)(
    "fits %s in 80x25 and explains when edits take effect",
    async (category) => {
      const screen = await mount(category);
      const frame = screen.lastFrame() ?? "";
      expect(frame).toContain("Edits save defaults for the next session.");
      expect(frame).toContain("Current mode and Thinking: use footer controls.");
      expect(frame).toContain("Esc to close");
      expect(frame).toContain("Space: toggle");
      for (const label of ["General", "Model", "Coding Mode", "Theme", "Diff View", "Thinking"]) {
        expect(frame).toContain(label);
      }
      const lines = frame.split("\n");
      expect(lines.length).toBeLessThanOrEqual(25);
      expect(lines.every((line) => stringWidth(line) <= 80)).toBe(true);
      expect(lines.at(-1)).toContain("╯");
    }
  );

  it("defaults to orch and includes it in cycling and validated edit choices", async () => {
    const screen = await mount("mode");
    expect(screen.lastFrame()).toContain("orch");
    for (const expected of ["vibe", "plan", "spec", "orch"]) {
      await send(screen, " ");
      expect(preferences.saveMode).toHaveBeenLastCalledWith(expected);
      expect(screen.lastFrame()).toContain(expected);
    }
    await send(screen, "\r");
    expect(screen.lastFrame()).toContain("Enter: confirm");
    expect(screen.lastFrame()).toContain("Esc: cancel");
    expect((screen.lastFrame() ?? "").split("\n").length).toBeLessThanOrEqual(25);
    await send(screen, "\u0015orch\r");
    expect(preferences.saveMode).toHaveBeenLastCalledWith("orch");
  });
});
