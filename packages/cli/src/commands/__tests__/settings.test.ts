import { beforeEach, describe, expect, it, vi } from "vitest";
import { settingsCommand } from "../settings.js";
import type { CommandContext } from "../types.js";

const preferences = vi.hoisted(() => ({
  mode: undefined as string | undefined,
  saveMode: vi.fn(),
  saveTheme: vi.fn(),
  saveThinking: vi.fn(),
  saveDiff: vi.fn(),
}));
vi.mock("@vellum/core", async (original) => ({
  ...(await original<typeof import("@vellum/core")>()),
  loadConfig: () => ({
    ok: true,
    value: { workingDir: "/project", debug: false, logLevel: "info" },
  }),
}));
vi.mock("../../tui/i18n/index.js", () => ({
  getAlternateBufferEnabled: () => true,
  getDiffViewMode: () => "unified",
  getModeFromSettings: () => preferences.mode,
  getModelSettings: () => ({ provider: "fixture", modelId: "test-model" }),
  getSavedLanguage: () => "en",
  getThemeFromSettings: () => "dark",
  getThinkingSettings: () => ({ enabled: false, budgetTokens: 10000, priority: "merge" }),
  saveUserSetting: vi.fn(),
  setAlternateBufferEnabled: vi.fn(),
  setDiffViewMode: preferences.saveDiff,
  setModeInSettings: preferences.saveMode,
  setThemeInSettings: preferences.saveTheme,
  setThinkingSettings: preferences.saveThinking,
}));

beforeEach(() => {
  preferences.mode = undefined;
  vi.clearAllMocks();
});

function context(...positional: string[]) {
  const emit = vi.fn();
  return { emit, parsedArgs: { positional } } as unknown as CommandContext & { emit: typeof emit };
}

describe("settings panel command entry", () => {
  it.each([
    [undefined, "general", "Vellum Settings"],
    ["general", "general", "General Settings"],
    ["model", "model", "Model Settings"],
    ["mode", "mode", "Mode Settings"],
    ["theme", "theme", "Theme Settings"],
    ["diff", "diff", "Diff Settings"],
    ["think", "thinking", "Thinking Settings"],
  ] as const)(
    "opens the %s category and preserves its text fallback",
    async (argument, category, title) => {
      const ctx = argument ? context(argument) : context();
      const result = await settingsCommand.execute(ctx);
      expect(ctx.emit).toHaveBeenCalledExactlyOnceWith("settings:open", { category });
      expect(result).toEqual(
        expect.objectContaining({ kind: "success", message: expect.stringContaining(title) })
      );
    }
  );

  it.each(["language", "vim", "lsp", "mcp"])(
    "keeps unsupported panel category %s as text",
    async (category) => {
      const ctx = context(category);
      expect((await settingsCommand.execute(ctx)).kind).toBe("success");
      expect(ctx.emit).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["mode", "orch"],
    ["theme", "light"],
    ["think.enabled", "true"],
    ["think.budget", "12000"],
    ["diff-mode", "side-by-side"],
    ["mode", ""],
  ])("does not open a panel while setting %s to %s", async (key, value) => {
    const ctx = context(key, value);
    await settingsCommand.execute(ctx);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it("accepts orch as a saved mode and reports it when no preference exists", async () => {
    const result = await settingsCommand.execute(context("mode", "orch"));
    expect(result.kind).toBe("success");
    expect(preferences.saveMode).toHaveBeenCalledExactlyOnceWith("orch");
    const displayed = await settingsCommand.execute(context("mode"));
    expect(displayed).toEqual(
      expect.objectContaining({ message: expect.stringContaining("codingMode: orch") })
    );
  });

  it.each(["unknown", "", "ORCH"])(
    "rejects invalid mode %s without saving or opening",
    async (mode) => {
      const ctx = context("mode", mode);
      const result = await settingsCommand.execute(ctx);
      expect(result).toEqual(expect.objectContaining({ kind: "error", code: "INVALID_ARGUMENT" }));
      expect(preferences.saveMode).not.toHaveBeenCalled();
      expect(ctx.emit).not.toHaveBeenCalled();
    }
  );
});
