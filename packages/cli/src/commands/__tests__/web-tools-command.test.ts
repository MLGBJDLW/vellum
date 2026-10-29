import { configureWebTools, type WebToolSettings } from "@vellum/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandExecutor } from "../executor.js";
import { CommandRegistry } from "../registry.js";
import { webSearchCommand } from "../search.js";
import type { CommandContext } from "../types.js";

const state = vi.hoisted(() => ({ settings: {} as { search?: WebToolSettings } }));
vi.mock("../../tui/i18n/settings-integration.js", () => ({
  loadSettings: () => structuredClone(state.settings),
  saveSettings: (settings: typeof state.settings) => {
    state.settings = structuredClone(settings);
    return true;
  },
}));

function executor() {
  const registry = new CommandRegistry();
  registry.register(webSearchCommand);
  return new CommandExecutor(registry, {
    createContext: (parsedArgs) => ({
      parsedArgs,
      credentials: {
        resolve: vi.fn(async () => ({ ok: true, value: null })),
        store: vi.fn(async () => ({ ok: true, value: {} })),
      } as unknown as CommandContext["credentials"],
      session: { id: "fixture", provider: "deepseek", cwd: "/fixture" },
      toolRegistry: {} as CommandContext["toolRegistry"],
      emit: vi.fn(),
    }),
  });
}

beforeEach(() => {
  state.settings = {};
});
afterEach(() => configureWebTools());

describe("web settings through the real command parser and executor", () => {
  it.each([
    "/websearch",
    "/webtools",
    "/ws",
    "/websearch engine",
    "/websearch fetch",
    "/websearch depth",
    "/websearch key",
  ])("opens the selection menu for %s when optional arguments are missing", async (input) => {
    const result = await executor().execute(input);
    expect(result).toMatchObject({ kind: "interactive", prompt: { inputType: "select" } });
  });

  it("opens the masked key prompt without requiring the optional secret argument", async () => {
    expect(await executor().execute("/websearch key deepseek")).toMatchObject({
      kind: "interactive",
      prompt: { inputType: "password" },
    });
  });

  it("retains a third endpoint argument through parsing and persistence", async () => {
    expect(
      (await executor().execute("/webtools endpoint deepseek https://gateway.example/v1")).kind
    ).toBe("success");
    expect(state.settings.search?.providers?.deepseek?.baseUrl).toBe("https://gateway.example/v1");
  });
});
