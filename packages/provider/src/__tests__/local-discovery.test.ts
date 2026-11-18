import { fetchWithPool } from "@vellum/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LMStudioProvider, OllamaProvider } from "../local.js";
import { MODEL_CATALOG } from "../models/catalog.js";
import { updateDiscoveredModels } from "../models/discovery.js";

vi.mock("@vellum/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vellum/shared")>()),
  fetchWithPool: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("local provider discovery", () => {
  it.each([
    ["ollama", () => new OllamaProvider(), "/api/tags", { models: [{ name: "custom-vision" }] }],
    [
      "lmstudio",
      () => new LMStudioProvider(),
      "/api/v1/models",
      { data: [{ id: "custom-vision" }] },
    ],
  ] as const)(
    "refreshes %s from its configured endpoint without guessing capabilities",
    async (provider, create, endpoint, data) => {
      const instance = create();
      await instance.initialize({ baseUrl: "http://localhost:9876/v1/" });
      vi.mocked(fetchWithPool).mockImplementation(async (url) =>
        String(url).endsWith("/api/show") || String(url).endsWith("/api/v1/models")
          ? new Response("{}", { status: 404 })
          : new Response(JSON.stringify(data))
      );
      const models = await instance.refreshModels();
      expect(vi.mocked(fetchWithPool).mock.calls[0]?.[0]).toBe(`http://localhost:9876${endpoint}`);
      expect(models[0]).toMatchObject({
        id: "custom-vision",
        supportsVision: false,
      });
      expect(models[0]?.supportsTools).toBeUndefined();
      expect(models[0]?.maxOutputTokens).toBeUndefined();
      const previous = MODEL_CATALOG.get(provider) ?? [];
      try {
        updateDiscoveredModels(provider, models);
        expect(instance.listModels()).toEqual(["custom-vision"]);
      } finally {
        updateDiscoveredModels(provider, previous);
      }
    }
  );

  it.each(["deadline", "caller"] as const)(
    "bounds Ollama inspection concurrency and supports %s cancellation",
    async (cause) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const signals: AbortSignal[] = [];
      vi.mocked(fetchWithPool).mockImplementation(async (url, options) => {
        if (String(url).endsWith("/api/tags")) {
          return new Response(
            JSON.stringify({
              models: Array.from({ length: 20 }, (_, i) => ({ name: `model-${i}` })),
            })
          );
        }
        const signal = options?.signal;
        if (!signal) throw new Error("Missing inspection abort signal");
        signals.push(signal);
        return new Promise((_resolve, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          )
        );
      });
      const provider = new OllamaProvider();
      await provider.initialize({});
      const pending = provider.refreshModels(controller.signal);
      await vi.waitFor(() => expect(signals).toHaveLength(4));
      if (cause === "caller") {
        controller.abort();
        await expect(pending).rejects.toThrow();
      } else {
        await vi.advanceTimersByTimeAsync(10_001);
        const models = await pending;
        expect(models).toHaveLength(20);
        expect(models.every((model) => model.supportsTools === undefined)).toBe(true);
      }
      expect(signals).toHaveLength(4);
      expect(signals.every((signal) => signal.aborted)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each([
    ["ollama", () => new OllamaProvider()],
    ["lmstudio", () => new LMStudioProvider()],
  ] as const)(
    "clears a removed %s inventory only after a successful refresh",
    async (name, create) => {
      const provider = create();
      await provider.initialize({});
      const previous = MODEL_CATALOG.get(name) ?? [];
      const records =
        name === "ollama"
          ? [{ name: "local-chat" }, { name: "local-decision" }]
          : [
              { key: "local-chat", type: "llm" },
              { key: "local-decision", type: "decision" },
            ];
      const refresh = async () => updateDiscoveredModels(name, await provider.refreshModels());
      try {
        vi.mocked(fetchWithPool).mockImplementation(async (url, options) => {
          if (String(url).endsWith("/api/show")) {
            const capability =
              JSON.parse(String(options?.body)).model === "local-chat" ? "completion" : "decision";
            return Response.json({ capabilities: [capability] });
          }
          return Response.json({ models: records });
        });
        await refresh();
        expect(provider.listModels()).toEqual(["local-chat"]);
        vi.mocked(fetchWithPool).mockImplementation(
          async () => new Response(null, { status: 503 })
        );
        await expect(refresh()).rejects.toThrow("503");
        vi.mocked(fetchWithPool).mockImplementation(async () => Response.json({ models: [{}] }));
        await expect(refresh()).rejects.toThrow("identifier");
        expect(provider.listModels()).toEqual(["local-chat"]);
        vi.mocked(fetchWithPool).mockImplementation(async () => Response.json({ models: [] }));
        await refresh();
        expect(provider.listModels()).toEqual([]);
      } finally {
        updateDiscoveredModels(name, previous);
      }
    }
  );

  it("retains known model capabilities when native inspection is unavailable", async () => {
    const previous = MODEL_CATALOG.get("ollama") ?? [];
    try {
      MODEL_CATALOG.set("ollama", [
        {
          id: "custom-model",
          name: "Custom",
          provider: "ollama",
          contextWindow: 32768,
          supportsTools: true,
          supportsVision: true,
          supportsReasoning: false,
          supportsStreaming: true,
          supportsPromptCache: false,
          deprecated: false,
        },
      ]);
      vi.mocked(fetchWithPool).mockImplementation(async (url) =>
        String(url).endsWith("/api/tags")
          ? new Response(JSON.stringify({ models: [{ name: "custom-model" }] }))
          : new Response("{}", { status: 503 })
      );
      const provider = new OllamaProvider();
      await provider.initialize({});
      expect((await provider.refreshModels())[0]).toMatchObject({
        supportsTools: true,
        supportsVision: true,
        contextWindow: 32768,
      });
    } finally {
      MODEL_CATALOG.set("ollama", previous);
    }
  });
});
