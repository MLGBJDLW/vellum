import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../anthropic.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function captureProbe() {
  const fetch = vi.fn(
    async (_url: unknown, _init: RequestInit) =>
      new Response(
        JSON.stringify({
          id: "msg_fixture",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Done" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { headers: { "content-type": "application/json" } }
      )
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("Anthropic credential probe configuration", () => {
  it("retains the configured gateway and headers while testing only the candidate key", async () => {
    const fetch = captureProbe();
    const provider = new AnthropicProvider();
    await provider.initialize({
      apiKey: "sk-ant-api03-active-fixture",
      baseUrl: "https://gateway.invalid/anthropic",
      headers: { "x-route": "fixture-route" },
    });
    expect(
      await provider.validateCredentialWithApiCall({
        type: "api_key",
        value: "sk-ant-api03-candidate-fixture",
      })
    ).toEqual({ valid: true });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://gateway.invalid/anthropic/v1/messages");
    expect(new Headers(init?.headers).get("x-route")).toBe("fixture-route");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer sk-ant-api03-candidate-fixture"
    );
    expect(JSON.parse(String(init?.body)).model).toBe(provider.getDefaultModel());
    await provider.complete({
      model: provider.getDefaultModel(),
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(new Headers(fetch.mock.calls[1]?.[1].headers).get("authorization")).toBe(
      "Bearer sk-ant-api03-active-fixture"
    );
  });

  it("retains a constructor endpoint before initialization and when initializing later", async () => {
    const fetch = captureProbe();
    const provider = new AnthropicProvider({
      apiKey: "sk-ant-api03-constructor-fixture",
      baseUrl: "https://constructor.invalid/anthropic",
      timeout: 12345,
    });
    await provider.validateCredentialWithApiCall({
      type: "api_key",
      value: "sk-ant-api03-candidate-fixture",
    });
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      "https://constructor.invalid/anthropic/v1/messages"
    );
    expect(provider.isInitialized()).toBe(false);
    await provider.initialize({});
    await provider.complete({
      model: provider.getDefaultModel(),
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(String(fetch.mock.calls[1]?.[0])).toBe(
      "https://constructor.invalid/anthropic/v1/messages"
    );
    expect(new Headers(fetch.mock.calls[1]?.[1].headers).get("authorization")).toBe(
      "Bearer sk-ant-api03-constructor-fixture"
    );
  });

  it("retains the configured request timeout during the probe", async () => {
    vi.useFakeTimers();
    let ready: (signal: AbortSignal) => void = () => {};
    const started = new Promise<AbortSignal>((resolve) => {
      ready = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: unknown, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = init.signal as AbortSignal;
            ready(signal);
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("Cancelled", "AbortError")),
              { once: true }
            );
          })
      )
    );
    const provider = new AnthropicProvider();
    await provider.initialize({
      apiKey: "sk-ant-api03-active-fixture",
      baseUrl: "https://gateway.invalid/anthropic",
      timeout: 1000,
    });
    const pending = provider.validateCredentialWithApiCall({
      type: "api_key",
      value: "sk-ant-api03-candidate-fixture",
    });
    const signal = await started;
    await vi.advanceTimersByTimeAsync(1001);
    const timedOut = signal.aborted;
    await vi.runAllTimersAsync();
    await pending;
    expect(timedOut).toBe(true);
  });
});
