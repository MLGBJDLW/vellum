import { LLM } from "@vellum/core";
import {
  type CompletionParams,
  type LLMProvider,
  OpenAIProvider,
  type ProviderRegistry,
} from "@vellum/provider";
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
  vi.unstubAllGlobals();
});

const context = (...positional: string[]) =>
  ({ parsedArgs: { positional, named: {} } }) as unknown as CommandContext;

describe("model-aware thinking effort", () => {
  it("sends none explicitly and falls back after a model switch", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(
          `data: ${JSON.stringify({ type: "response.completed", response: { id: "resp_test", status: "completed", output: [] } })}\n\n`,
          { headers: { "content-type": "text/event-stream" } }
        );
      })
    );
    const provider = new OpenAIProvider();
    await provider.initialize({ apiKey: "sk-fixture-only" });
    LLM.initialize({ get: async () => provider } as unknown as ProviderRegistry);
    setModelCommandConfig("openai", "gpt-6.1-terra");
    expect((await thinkCommand.execute(context("effort", "none"))).kind).toBe("success");
    for (const model of ["gpt-6.1-terra", "gpt-6.1-sol"]) {
      setModelCommandConfig("openai", model);
      for await (const _ of LLM.stream({
        providerType: "openai",
        model,
        messages: [{ role: "user", content: "Hello" }],
        thinking: getEffectiveThinkingConfig(),
      })) {
        /* consume */
      }
    }
    expect(bodies[0]?.reasoning).toEqual({ effort: "none" });
    expect(bodies[1]?.reasoning).toEqual({ effort: "medium", summary: "auto" });
  });

  it("persists an effort selected in the menu and passes it to the model request", async () => {
    setModelCommandConfig("openai", "gpt-6.1-sol");
    const menu = await thinkCommand.execute(context("effort"));
    expect(menu.kind).toBe("interactive");
    if (menu.kind !== "interactive") throw new Error("Missing effort menu");
    expect(menu.prompt.options).toEqual(["auto", "low", "medium", "high", "xhigh", "max"]);
    expect((await menu.prompt.handler("high")).kind).toBe("success");
    expect(setThinkingSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ reasoningEffort: "high" })
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
