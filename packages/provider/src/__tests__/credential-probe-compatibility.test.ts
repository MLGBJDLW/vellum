import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekProvider } from "../deepseek.js";
import { GroqProvider } from "../groq.js";
import { OpenAIProvider } from "../openai.js";
import { anthropicTransform } from "../transforms/anthropic.js";
import { googleTransform } from "../transforms/google.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mockProbe() {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "Done" }, finish_reason: "stop" }],
          output: [],
          status: "completed",
        }),
        { headers: { "content-type": "application/json" } }
      )
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("provider-scoped credential probes", () => {
  it("uses DeepSeek's configured endpoint, headers and model with the candidate key", async () => {
    const fetch = mockProbe();
    const provider = new DeepSeekProvider();
    await provider.initialize({
      apiKey: "sk-initialized-fixture",
      baseUrl: "https://proxy.example.test/deepseek/v1",
      headers: { "x-fixture": "preserve" },
      timeout: 12345,
    });
    expect(
      await provider.validateCredentialWithApiCall({
        type: "api_key",
        value: "sk-candidate-fixture",
      })
    ).toMatchObject({ valid: true });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://proxy.example.test/deepseek/v1/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk-candidate-fixture");
    expect(new Headers(init.headers).get("x-fixture")).toBe("preserve");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "deepseek-flash" });
    await provider.complete({
      model: "deepseek-flash",
      messages: [{ role: "user", content: "Hello" }],
    });
    const [, completion] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(new Headers(completion.headers).get("authorization")).toBe(
      "Bearer sk-initialized-fixture"
    );
  });

  it("uses the compatible provider's default endpoint before initialization", async () => {
    const fetch = mockProbe();
    const provider = new DeepSeekProvider();
    await provider.validateCredentialWithApiCall({ type: "api_key", value: "sk-fixture" });
    expect(String((fetch.mock.calls[0] as unknown as [string])[0])).toBe(
      "https://api.deepseek.com/v1/chat/completions"
    );
    expect(provider.isInitialized()).toBe(false);
  });

  it("does not reject another provider's key using OpenAI's prefix rule", async () => {
    const fetch = mockProbe();
    const provider = new GroqProvider();
    expect(await provider.validateCredential({ type: "api_key", value: "gsk_fixture" })).toEqual({
      valid: true,
    });
    expect(
      await provider.validateCredentialWithApiCall({ type: "api_key", value: "gsk_fixture" })
    ).toEqual({ valid: true });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(JSON.parse(String(init.body)).model).toBe(provider.getDefaultModel());
  });

  it("probes the default OpenAI model through its actual Responses transport", async () => {
    const fetch = mockProbe();
    const provider = new OpenAIProvider();
    await provider.initialize({
      apiKey: "sk-initialized-fixture",
      baseUrl: "https://proxy.example.test/openai/v1",
    });
    await provider.validateCredentialWithApiCall({
      type: "api_key",
      value: "sk-candidate-fixture",
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://proxy.example.test/openai/v1/responses");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: provider.getDefaultModel() });
  });

  it("keeps the initialized timeout on a credential probe", async () => {
    vi.useFakeTimers();
    let markStarted: (value: AbortSignal) => void = () => {};
    const started = new Promise<AbortSignal>((resolve) => {
      markStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = init.signal as AbortSignal;
            markStarted(signal);
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true }
            );
          })
      )
    );
    const provider = new DeepSeekProvider();
    await provider.initialize({ apiKey: "sk-initialized-fixture", timeout: 1000 });
    const pending = provider.validateCredentialWithApiCall({
      type: "api_key",
      value: "sk-candidate-fixture",
    });
    const signal = await started;
    await vi.advanceTimersByTimeAsync(1001);
    const timedOut = signal.aborted;
    await vi.runAllTimersAsync();
    await pending;
    expect(timedOut).toBe(true);
  });
});

describe.each([
  {
    provider: "anthropic" as const,
    model: "claude-sonnet-5-5",
    transform: anthropicTransform,
    replay: [{ type: "thinking", thinking: "", signature: "signed" }],
  },
  {
    provider: "google" as const,
    model: "gemini-4-argon",
    transform: googleTransform,
    replay: [{ text: "", thought: true, thoughtSignature: "signed" }],
  },
])("empty $provider signed replay", ({ provider, model, transform, replay }) => {
  it.each([{ content: "" as string | [] }, { content: [] as [] }])(
    "keeps replay without creating an empty text block ($content)",
    ({ content }) => {
      const message = {
        role: "assistant" as const,
        content,
        providerMetadata: { provider, model, replay },
      };
      const result = transform.transformMessages([message], { provider, modelId: model }).data;
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        provider === "anthropic"
          ? { role: "assistant", content: replay }
          : { role: "model", parts: replay }
      );
      expect(
        transform.transformMessages([message], { provider, modelId: "different-model" }).data
      ).toEqual([]);
      expect(
        transform.transformMessages(
          [{ ...message, providerMetadata: { ...message.providerMetadata, provider: "deepseek" } }],
          { provider, modelId: model }
        ).data
      ).toEqual([]);
    }
  );
});
