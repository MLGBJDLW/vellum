import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../anthropic.js";
import { GoogleProvider } from "../google.js";
import { GroqProvider } from "../groq.js";
import { OpenAIProvider } from "../openai.js";
import { OpenRouterProvider } from "../openrouter.js";
import { QwenProvider } from "../qwen.js";

afterEach(() => vi.unstubAllGlobals());

const providers = [
  ["openai", () => new OpenAIProvider()],
  ["anthropic", () => new AnthropicProvider()],
  ["google", () => new GoogleProvider()],
  ["groq", () => new GroqProvider()],
  ["openrouter", () => new OpenRouterProvider()],
  ["qwen", () => new QwenProvider()],
] as const;

describe("cloud model discovery", () => {
  it.each([
    ["https://openrouter.ai/api/v1", "/api/v1/models/user"],
    ["https://eu.openrouter.ai/api/v1/", "/api/v1/models/user"],
    ["https://proxy.example/v1", "/v1/models"],
  ])("refreshes the OpenRouter inventory on its configured host %s", async (baseUrl, path) => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      expect(new URL(url).host).toBe(new URL(baseUrl).host);
      expect(new URL(url).pathname).toBe(path);
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer fixture");
      return Response.json({ data: [{ id: "vendor/private" }, { id: "vendor/private:batch" }] });
    });
    vi.stubGlobal("fetch", fetch);
    const provider = new OpenRouterProvider();
    await provider.initialize({ apiKey: "fixture", baseUrl });
    expect((await provider.refreshModels()).map((model) => model.id)).toEqual(["vendor/private"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("distinguishes an empty account inventory from a malformed response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ data: [] }))
        .mockResolvedValueOnce(Response.json({ data: [{}] }))
    );
    const provider = new OpenRouterProvider();
    await provider.initialize({ apiKey: "fixture" });
    expect(await provider.refreshModels()).toEqual([]);
    await expect(provider.refreshModels()).rejects.toThrow();
  });

  it("reads each native Model Studio page and keeps text-generating chat routes", async () => {
    const fetch = vi.fn(async (url: string) => {
      const request = new URL(url);
      expect(request.pathname).toBe("/api/v1/models");
      expect(request.searchParams.get("supports")).toBe("inference");
      const page = Number(request.searchParams.get("page_no"));
      const models =
        page === 1
          ? [
              {
                model: "qwen-live-text",
                name: "Live text",
                capabilities: ["TG", "Reasoning"],
                features: ["function-calling", "cache"],
                inference_metadata: {
                  request_modality: ["Text", "Image"],
                  response_modality: ["Text"],
                },
                model_info: { context_window: 32768, max_output_tokens: 8192 },
              },
            ]
          : [{ model: "media-only", inference_metadata: { response_modality: ["Image"] } }];
      return Response.json({ success: true, output: { total: 2, page_no: page, models } });
    });
    vi.stubGlobal("fetch", fetch);
    const provider = new QwenProvider();
    await provider.initialize({
      apiKey: "fixture",
      baseUrl: "https://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    });
    const models = await provider.refreshModels();
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: "qwen-live-text",
      contextWindow: 32768,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: true,
      supportsPromptCache: true,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("uses the configured OpenAI-compatible inventory for Qwen proxies", async () => {
    const fetch = vi.fn(async (url: string) => {
      expect(new URL(url).pathname).toBe("/v1/models");
      return Response.json({ data: [{ id: "custom-chat" }] });
    });
    vi.stubGlobal("fetch", fetch);
    const provider = new QwenProvider();
    await provider.initialize({ apiKey: "fixture", baseUrl: "https://proxy.example/v1" });
    expect(await provider.refreshModels()).toEqual([
      expect.objectContaining({ id: "custom-chat" }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(providers)("cancels an in-flight %s discovery request", async (_name, create) => {
    let requestStarted: (signal: AbortSignal) => void = () => {};
    const started = new Promise<AbortSignal>((resolve) => {
      requestStarted = resolve;
    });
    const fetch = vi.fn(
      (_url: unknown, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          requestStarted(signal);
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        })
    );
    vi.stubGlobal("fetch", fetch);
    const provider = create();
    await provider.initialize({ apiKey: "fixture" });
    const controller = new AbortController();
    const pending = provider.refreshModels(controller.signal).catch((error: unknown) => error);
    const requestSignal = await started;
    controller.abort();
    expect(requestSignal.aborted).toBe(true);
    expect(await pending).toBeInstanceOf(Error);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(providers)("does not dispatch an already cancelled %s refresh", async (_name, create) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const provider = create();
    const controller = new AbortController();
    controller.abort();
    await expect(provider.refreshModels(controller.signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["anthropic", "google"] as const)(
    "retains all %s pages and cancels the next page without returning a partial inventory",
    async (name) => {
      let secondPageStarted: () => void = () => {};
      const started = new Promise<void>((resolve) => {
        secondPageStarted = resolve;
      });
      const firstPage =
        name === "anthropic"
          ? { data: [{ id: "claude-page-one" }], has_more: true, last_id: "claude-page-one" }
          : { models: [{ name: "models/gemini-page-one" }], nextPageToken: "next" };
      const fetch = vi.fn((_url: unknown, init: RequestInit) => {
        if (fetch.mock.calls.length === 1) {
          return Promise.resolve(
            new Response(JSON.stringify(firstPage), {
              headers: { "content-type": "application/json" },
            })
          );
        }
        return new Promise<Response>((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          secondPageStarted();
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      });
      vi.stubGlobal("fetch", fetch);
      const provider = name === "anthropic" ? new AnthropicProvider() : new GoogleProvider();
      await provider.initialize({ apiKey: "fixture" });
      const controller = new AbortController();
      const pending = provider.refreshModels(controller.signal).catch((error: unknown) => error);
      await started;
      controller.abort();
      expect(await pending).toBeInstanceOf(Error);
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  );
});
