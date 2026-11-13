import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../anthropic.js";
import { GoogleProvider } from "../google.js";
import { GroqProvider } from "../groq.js";
import { OpenAIProvider } from "../openai.js";

afterEach(() => vi.unstubAllGlobals());

const providers = [
  ["openai", () => new OpenAIProvider()],
  ["anthropic", () => new AnthropicProvider()],
  ["google", () => new GoogleProvider()],
  ["groq", () => new GroqProvider()],
] as const;

describe("cloud model discovery", () => {
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
