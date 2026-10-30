import { LLM } from "@vellum/core";
import type { CompletionParams, LLMProvider, ProviderRegistry } from "@vellum/provider";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setThinkingSettings } from "../../tui/i18n/index.js";
import { setModelCommandConfig } from "../model.js";
import { getEffectiveThinkingConfig, resetThinkingState, thinkCommand } from "../think.js";
import type { CommandContext } from "../types.js";

vi.mock("../../tui/i18n/index.js", async (original) => ({
  ...(await original<typeof import("../../tui/i18n/index.js")>()),
  getThinkingSettings: () => ({}),
  setThinkingSettings: vi.fn(),
}));

afterEach(() => {
  resetThinkingState();
  vi.clearAllMocks();
});

const context = (...positional: string[]) =>
  ({ parsedArgs: { positional, named: {} } }) as unknown as CommandContext;

describe("model-aware thinking effort", () => {
  it("persists an effort selected in the menu and passes it to the model request", async () => {
    setModelCommandConfig("openai", "gpt-6.1-sol");
    const menu = await thinkCommand.execute(context("effort"));
    expect(menu.kind).toBe("interactive");
    if (menu.kind !== "interactive") throw new Error("Missing effort menu");
    expect(menu.prompt.options).toEqual(["auto", "low", "medium", "high", "xhigh", "max"]);
    expect((await menu.prompt.handler("high")).kind).toBe("success");
    expect(setThinkingSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true, reasoningEffort: "high" })
    );
    let request: CompletionParams | undefined;
    const provider = {
      isInitialized: () => true,
      async *stream(params: CompletionParams) {
        request = params;
        yield { type: "text", content: "Ready" };
        yield { type: "done", stopReason: "end_turn" };
      },
    } as unknown as LLMProvider;
    LLM.initialize({ get: async () => provider } as unknown as ProviderRegistry);
    for await (const _ of LLM.stream({
      providerType: "openai",
      model: "gpt-6.1-sol",
      messages: [{ role: "user", content: "Work" }],
      thinking: getEffectiveThinkingConfig(),
    })) {
      /* consume */
    }
    expect(request?.thinking?.reasoningEffort).toBe("high");
    expect(request?.maxTokens).toBeLessThan(128_000);
  });

  it("filters choices on model switch, rejects unsupported effort and allows auto", async () => {
    setModelCommandConfig("deepseek", "deepseek-flash");
    const menu = await thinkCommand.execute(context("effort"));
    if (menu.kind !== "interactive") throw new Error("Missing effort menu");
    expect(menu.prompt.options).toEqual(["auto", "low", "high", "max"]);
    expect((await thinkCommand.execute(context("effort", "xhigh"))).kind).toBe("error");
    expect((await menu.prompt.handler("auto")).kind).toBe("success");
    expect(getEffectiveThinkingConfig().reasoningEffort).toBeUndefined();
  });
});
