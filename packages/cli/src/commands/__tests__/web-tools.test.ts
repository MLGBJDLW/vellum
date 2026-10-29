import { configureWebTools, resolveWebProvider, type WebToolSettings } from "@vellum/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webSearchCommand } from "../search.js";
import type { CommandContext } from "../types.js";
import { configureWebToolsForCli } from "../web-tools-runtime.js";

const state = vi.hoisted(() => ({ settings: {} as { search?: WebToolSettings }, writable: true }));
vi.mock("../../tui/i18n/settings-integration.js", () => ({
  loadSettings: () => structuredClone(state.settings),
  saveSettings: (settings: typeof state.settings) => {
    if (!state.writable) return false;
    state.settings = structuredClone(settings);
    return true;
  },
}));

function context(args: string[], keys = new Map<string, string>()) {
  return {
    parsedArgs: { positional: args, named: {}, raw: "", command: "websearch" },
    credentials: {
      resolve: vi.fn(async (provider: string) => ({
        ok: true,
        value: keys.has(provider) ? { type: "api_key", value: keys.get(provider) } : null,
      })),
      store: vi.fn(async (input: { provider: string; value: string }) => {
        keys.set(input.provider, input.value);
        return { ok: true, value: input };
      }),
    },
  } as unknown as CommandContext;
}

beforeEach(() => {
  state.settings = {};
  state.writable = true;
});
afterEach(() => {
  configureWebTools();
  vi.unstubAllEnvs();
});

describe("web tool configuration lifecycle", () => {
  it("automatically reuses the existing DeepSeek model credential without a second key", async () => {
    const ctx = context([], new Map([["deepseek", "fixture-model-secret"]]));
    configureWebToolsForCli(ctx.credentials);
    expect(await resolveWebProvider("deepseek")).toMatchObject({
      enabled: true,
      apiKey: "fixture-model-secret",
    });
    expect(ctx.credentials.store).not.toHaveBeenCalled();
    expect(state.settings).toEqual({});
  });

  it("stores dedicated keys securely and lets them override a shared model/environment key", async () => {
    const keys = new Map([["deepseek", "fixture-model-secret"]]);
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-environment-secret");
    state.settings = { search: { providers: { deepseek: { apiKey: "old-plaintext" } } } };
    const ctx = context(["key", "deepseek", "fixture-web-secret"], keys);
    expect((await webSearchCommand.execute(ctx)).kind).toBe("success");
    expect(keys.get("deepseek")).toBe("fixture-model-secret");
    expect(keys.get("web:deepseek")).toBe("fixture-web-secret");
    expect(JSON.stringify(state.settings)).not.toContain("secret");
    expect(state.settings.search?.providers?.deepseek).not.toHaveProperty("apiKey");
    expect((await resolveWebProvider("deepseek")).apiKey).toBe("fixture-web-secret");
  });

  it("uses the same secure path for the masked interactive key prompt", async () => {
    const ctx = context(["key", "brave"]);
    const prompt = await webSearchCommand.execute(ctx);
    expect(prompt.kind).toBe("interactive");
    if (prompt.kind !== "interactive") throw new Error("Expected key prompt");
    expect(prompt.prompt.inputType).toBe("password");
    expect((await prompt.prompt.handler("fixture-brave-secret")).kind).toBe("success");
    expect((await resolveWebProvider("brave")).apiKey).toBe("fixture-brave-secret");
    expect(JSON.stringify(state.settings)).not.toContain("fixture-brave-secret");
  });

  it("applies settings and disable/enable on the next request and keeps status redacted", async () => {
    const keys = new Map([["deepseek", "fixture-private-secret"]]);
    for (const args of [
      ["engine", "brave"],
      ["fetch", "deepseek"],
      ["results", "5"],
      ["timeout", "45000"],
      ["fallback", "off"],
      ["disable", "deepseek"],
    ]) {
      expect((await webSearchCommand.execute(context(args, keys))).kind).toBe("success");
    }
    expect(state.settings.search).toMatchObject({
      engine: "brave",
      fetchProvider: "deepseek",
      defaultMaxResults: 5,
      timeout: 45000,
      fallback: false,
    });
    expect(await resolveWebProvider("deepseek")).toEqual({ enabled: false });
    await webSearchCommand.execute(context(["enable", "deepseek"], keys));
    expect((await resolveWebProvider("deepseek")).apiKey).toBe("fixture-private-secret");
    const display = await webSearchCommand.execute(context(["show"], keys));
    expect(JSON.stringify(display)).toContain("key configured");
    expect(JSON.stringify(display)).not.toContain("fixture-private-secret");
  });

  it("validates endpoints and numeric settings and reports persistence failures", async () => {
    for (const args of [
      ["endpoint", "deepseek", "https://user:secret@example.com"],
      ["endpoint", "brave", "https://example.com?api_key=secret"],
      ["results", "51"],
      ["timeout", "NaN"],
    ]) {
      expect((await webSearchCommand.execute(context(args))).kind).toBe("error");
    }
    expect(
      (
        await webSearchCommand.execute(
          context(["endpoint", "searxng", "https://search.example.com"])
        )
      ).kind
    ).toBe("success");
    expect(state.settings.search?.providers?.searxng?.baseUrl).toBe("https://search.example.com");
    state.writable = false;
    expect((await webSearchCommand.execute(context(["engine", "auto"]))).kind).toBe("error");
  });
});
