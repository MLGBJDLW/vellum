import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleProvider } from "../google.js";
import type { CompletionParams } from "../types.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const params: CompletionParams = {
  model: "gemini-3.8-flash",
  messages: [{ role: "user", content: "Hello" }],
};

async function run(provider: GoogleProvider, stream: boolean, abortSignal?: AbortSignal) {
  const request = { ...params, ...(abortSignal && { abortSignal }) };
  if (!stream) return provider.complete(request);
  for await (const _event of provider.stream(request)) {
    /* Consume the SDK stream. */
  }
}

function capturePendingSignal() {
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
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        })
    )
  );
  return started;
}

describe("Google HTTP configuration", () => {
  it.each([false, true])(
    "checks credentials with the current model and endpoint options (initialized=%s)",
    async (initialized) => {
      const fetch = vi.fn(
        async (_url: unknown, _init: RequestInit) =>
          new Response(
            JSON.stringify({
              candidates: [
                { content: { role: "model", parts: [{ text: "Done" }] }, finishReason: "STOP" },
              ],
            }),
            { headers: { "content-type": "application/json" } }
          )
      );
      vi.stubGlobal("fetch", fetch);
      const provider = new GoogleProvider();
      if (initialized) {
        await provider.initialize({
          apiKey: "AIzaOriginalKey",
          baseUrl: "https://gateway.example.invalid/google",
          headers: { "x-gateway-route": "test-route" },
          timeout: 120_000,
        });
      }
      expect(
        await provider.validateCredentialWithApiCall({ type: "api_key", value: "AIzaCandidateKey" })
      ).toEqual({ valid: true });
      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      const baseUrl = initialized
        ? "https://gateway.example.invalid/google"
        : "https://generativelanguage.googleapis.com";
      expect(url).toBe(`${baseUrl}/v1beta/models/${provider.getDefaultModel()}:generateContent`);
      const headers = new Headers(init.headers);
      expect(headers.get("x-goog-api-key")).toBe("AIzaCandidateKey");
      if (initialized) {
        expect(headers.get("x-gateway-route")).toBe("test-route");
        expect(headers.get("x-server-timeout")).toBe("120");
        await run(provider, false);
        expect(new Headers(fetch.mock.calls[1]?.[1].headers).get("x-goog-api-key")).toBe(
          "AIzaOriginalKey"
        );
      }
    }
  );

  it.each([false, true])(
    "uses the configured endpoint, headers and timeout (stream=%s)",
    async (stream) => {
      const body = {
        candidates: [
          { content: { role: "model", parts: [{ text: "Done" }] }, finishReason: "STOP" },
        ],
      };
      const fetch = vi.fn(
        async (_url: unknown, _init: RequestInit) =>
          new Response(stream ? `data: ${JSON.stringify(body)}\n\n` : JSON.stringify(body), {
            headers: { "content-type": stream ? "text/event-stream" : "application/json" },
          })
      );
      vi.stubGlobal("fetch", fetch);
      const provider = new GoogleProvider();
      await provider.initialize({
        apiKey: "fixture",
        baseUrl: "https://gateway.example.invalid/google",
        headers: { "x-gateway-route": "test-route" },
        timeout: 120_000,
      });
      await run(provider, stream);
      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `https://gateway.example.invalid/google/v1beta/models/gemini-3.8-flash:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`
      );
      const headers = new Headers(init.headers);
      expect(headers.get("x-gateway-route")).toBe("test-route");
      expect(headers.get("x-server-timeout")).toBe("120");
      expect(headers.get("x-goog-api-key")).toBe("fixture");
    }
  );

  it.each([false, true])(
    "aborts the SDK request at the configured timeout (stream=%s)",
    async (stream) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const started = capturePendingSignal();
      const provider = new GoogleProvider();
      await provider.initialize({ apiKey: "fixture", timeout: 120_000 });
      const pending = run(provider, stream, controller.signal).catch((error: unknown) => error);
      const signal = await started;
      await vi.advanceTimersByTimeAsync(119_999);
      expect(signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      const timedOut = signal.aborted;
      controller.abort();
      await pending;
      expect(timedOut).toBe(true);
    }
  );

  it.each([false, true])(
    "preserves caller cancellation with a configured timeout (stream=%s)",
    async (stream) => {
      const controller = new AbortController();
      const started = capturePendingSignal();
      const provider = new GoogleProvider();
      await provider.initialize({ apiKey: "fixture", timeout: 120_000 });
      const pending = run(provider, stream, controller.signal).catch((error: unknown) => error);
      const signal = await started;
      expect(signal.aborted).toBe(false);
      controller.abort();
      expect(signal.aborted).toBe(true);
      expect(await pending).toBeInstanceOf(Error);
    }
  );
});
