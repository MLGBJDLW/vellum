import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../anthropic.js";
import { DeepSeekProvider } from "../deepseek.js";
import { DoubaoProvider } from "../doubao.js";
import { GoogleProvider } from "../google.js";
import { GroqProvider } from "../groq.js";
import { MistralProvider } from "../mistral.js";
import { DEFAULT_MODEL_IDS, getProviderModels, MODEL_CATALOG } from "../models/catalog.js";
import { normalizeDiscoveredModels, updateDiscoveredModels } from "../models/discovery.js";
import { calculateCost, getModelInfo } from "../models/index.js";
import { modelInfoSchema } from "../models/types.js";
import { OpenAIProvider } from "../openai.js";
import { buildResponsesRequest, mapResponsesStream } from "../openai-responses.js";
import { anthropicTransform } from "../transforms/anthropic.js";
import { googleTransform } from "../transforms/google.js";
import { openaiTransform } from "../transforms/openai.js";
import type { CompletionParams, ProviderResponseMetadata } from "../types.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const responseBody = {
  id: "resp_test",
  object: "response",
  created_at: 1,
  status: "completed",
  model: "gpt-6.1-sol",
  output: [
    { type: "reasoning", id: "rs_test", summary: [], encrypted_content: "opaque-reasoning" },
    {
      type: "function_call",
      id: "fc_test",
      call_id: "call_test",
      name: "lookup",
      arguments: '{"query":"weather"}',
    },
  ],
  usage: {
    input_tokens: 12,
    output_tokens: 8,
    total_tokens: 20,
    input_tokens_details: { cached_tokens: 5 },
    output_tokens_details: { reasoning_tokens: 3 },
  },
};

function mockJson(body: unknown) {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("current provider contracts", () => {
  it.each([true, false])(
    "sends the Doubao thinking toggle at the request root (%s)",
    async (enabled) => {
      const fetch = mockJson({
        choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Done" } }],
      });
      const provider = new DoubaoProvider();
      await provider.initialize({ apiKey: "fixture" });
      await provider.complete({
        model: "doubao-seed-2-1-pro-260915",
        messages: [{ role: "user", content: "Hello" }],
        thinking: { enabled },
      });
      const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(JSON.parse(String(init.body)).thinking).toEqual({
        type: enabled ? "enabled" : "disabled",
      });
    }
  );

  it.each([
    [() => new OpenAIProvider(), "gpt-6.1-sol"],
    [() => new AnthropicProvider(), "claude-sonnet-5-5"],
  ] as const)(
    "allows SDK default reasoning time and preserves request cancellation (%s)",
    async (create, model) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const { promise: started, resolve: signalReady } = deferred<AbortSignal>();
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              const signal = init.signal as AbortSignal;
              signalReady(signal);
              signal.addEventListener(
                "abort",
                () => reject(new DOMException("Aborted", "AbortError")),
                { once: true }
              );
            })
        )
      );
      const provider = create();
      await provider.initialize({ apiKey: "fixture" });
      const pending = provider
        .complete({
          model,
          messages: [{ role: "user", content: "Reason" }],
          abortSignal: controller.signal,
        })
        .catch((error: unknown) => error);
      const signal = await started;
      await vi.advanceTimersByTimeAsync(60_001);
      const abortedAtOneMinute = signal.aborted;
      controller.abort();
      await pending;
      expect(abortedAtOneMinute).toBe(false);
      expect(signal.aborted).toBe(true);
    }
  );

  it.each([
    [() => new OpenAIProvider(), "gpt-6.1-sol"],
    [() => new AnthropicProvider(), "claude-sonnet-5-5"],
  ] as const)("keeps explicit provider timeouts (%s)", async (create, model) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const { promise: started, resolve: signalReady } = deferred<AbortSignal>();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = init.signal as AbortSignal;
            signalReady(signal);
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true }
            );
          })
      )
    );
    const provider = create();
    await provider.initialize({ apiKey: "fixture", timeout: 120_000 });
    const pending = provider
      .complete({
        model,
        messages: [{ role: "user", content: "Reason" }],
        abortSignal: controller.signal,
      })
      .catch((error: unknown) => error);
    const signal = await started;
    await vi.advanceTimersByTimeAsync(120_001);
    const timedOut = signal.aborted;
    controller.abort();
    await vi.runAllTimersAsync();
    await pending;
    expect(timedOut).toBe(true);
  });

  it.each([
    ["openai/gpt-oss-120b", { include_reasoning: true }],
    ["qwen/qwen3.8-27b", { reasoning_format: "parsed" }],
  ])("uses the supported Groq reasoning control for %s", async (model, format) => {
    const fetch = mockJson({
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: "Done", reasoning: "Work" },
        },
      ],
    });
    const provider = new GroqProvider();
    await provider.initialize({ apiKey: "fixture" });
    const result = await provider.complete({
      model,
      messages: [{ role: "user", content: "Go" }],
      thinking: { enabled: true, reasoningEffort: "high" },
    });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ ...format, reasoning_effort: "high" });
    expect(result.thinking).toBe("Work");
    const replay = openaiTransform.transformMessages(
      [{ role: "assistant", content: "Done", providerMetadata: result.providerMetadata }],
      { provider: "groq", modelId: model }
    ).data[0];
    expect(replay).not.toHaveProperty("reasoning_content");
  });

  it("normalizes Mistral thinking chunks and replays them in the native content shape", async () => {
    const thinking = { type: "thinking", thinking: [{ type: "text", text: "Inspect the files." }] };
    const fetch = mockJson({
      id: "mistral-fixture",
      model: "mistral-medium-3-5",
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: [thinking, { type: "text", text: "Done" }] },
        },
      ],
      usage: { prompt_tokens: 2, completion_tokens: 3 },
    });
    const provider = new MistralProvider();
    await provider.initialize({ apiKey: "fixture" });
    const result = await provider.complete({
      model: "mistral-medium-3-5",
      messages: [{ role: "user", content: "Inspect" }],
      thinking: { enabled: true, reasoningEffort: "high" },
    });
    expect(result).toMatchObject({
      content: "Done",
      thinking: "Inspect the files.",
      providerMetadata: { replay: [thinking] },
    });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).reasoning_effort).toBe("high");
    const replayed = openaiTransform.transformMessages(
      [{ role: "assistant", content: result.content, providerMetadata: result.providerMetadata }],
      { provider: "mistral", modelId: "mistral-medium-3-5" }
    ).data[0];
    expect(replayed).toMatchObject({ content: [thinking, { type: "text", text: "Done" }] });
    expect(replayed).not.toHaveProperty("reasoning_content");
  });

  it("keeps mixed Mistral stream chunks out of displayed text objects", async () => {
    const thinking = { type: "thinking", thinking: [{ type: "text", text: "Inspect." }] };
    const chunks = [
      {
        choices: [
          {
            delta: { content: [thinking, { type: "text", text: "Result:" }] },
            finish_reason: null,
          },
        ],
      },
      { choices: [{ delta: { content: " done" }, finish_reason: "stop" }] },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
              "data: [DONE]\n\n",
            { headers: { "content-type": "text/event-stream" } }
          )
      )
    );
    const provider = new MistralProvider();
    await provider.initialize({ apiKey: "fixture" });
    const events = [];
    for await (const event of provider.stream({
      model: "mistral-medium-3-5",
      messages: [{ role: "user", content: "Inspect" }],
    }))
      events.push(event);
    expect(
      events
        .filter((event) => event.type === "text")
        .map((event) => event.content)
        .join("")
    ).toBe("Result: done");
    expect(events.find((event) => event.type === "reasoning")).toMatchObject({
      content: "Inspect.",
    });
    expect(events.find((event) => event.type === "provider_metadata")).toMatchObject({
      metadata: { replay: [thinking] },
    });
  });

  it("routes GPT-6 tools through Responses and preserves tool IDs, usage and opaque reasoning", async () => {
    const fetch = mockJson(responseBody);
    const provider = new OpenAIProvider();
    await provider.initialize({ apiKey: "sk-test-fixture" });
    const params: CompletionParams = {
      model: "gpt-6.1-sol",
      messages: [{ role: "user", content: "Find the weather" }],
      tools: [
        {
          name: "lookup",
          description: "Look up weather",
          inputSchema: { type: "object", properties: { query: { type: "string" } } },
        },
      ],
      temperature: 0.5,
      maxTokens: 65_536,
      thinking: { enabled: true, reasoningEffort: "max" },
    };
    const result = await provider.complete(params);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toContain("/responses");
    expect(body).toMatchObject({
      model: params.model,
      store: false,
      max_output_tokens: 65_536,
      reasoning: { effort: "max" },
      tools: [{ type: "function", name: "lookup" }],
    });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("max_tokens");
    expect(result).toMatchObject({
      stopReason: "tool_use",
      toolCalls: [{ id: "call_test", name: "lookup", input: { query: "weather" } }],
      usage: { inputTokens: 12, outputTokens: 8, cacheReadTokens: 5, thinkingTokens: 3 },
    });
    const followUp = buildResponsesRequest(
      {
        ...params,
        messages: [
          {
            role: "assistant",
            content: [
              { type: "tool_use", id: "call_test", name: "lookup", input: { query: "weather" } },
            ],
            providerMetadata: result.providerMetadata,
          },
          {
            role: "user",
            content: [{ type: "tool_result", toolUseId: "call_test", content: "Sunny" }],
          },
        ],
      },
      "openai",
      "max"
    );
    expect(followUp.input).toEqual([
      responseBody.output[0],
      {
        type: "function_call",
        call_id: "call_test",
        name: "lookup",
        arguments: '{"query":"weather"}',
      },
      { type: "function_call_output", call_id: "call_test", output: "Sunny" },
    ]);
  });

  it("streams Responses tool events exactly once and rejects interrupted streams", async () => {
    const events = [
      {
        type: "response.output_item.added",
        output_index: 1,
        item: { ...responseBody.output[1], arguments: "" },
      },
      {
        type: "response.function_call_arguments.delta",
        item_id: "fc_test",
        output_index: 1,
        delta: '{"query":"weather"}',
      },
      { type: "response.output_item.done", output_index: 1, item: responseBody.output[1] },
      { type: "response.completed", response: responseBody },
    ];
    async function* stream() {
      for (const event of events) yield event;
    }
    const results = [];
    for await (const event of mapResponsesStream(
      stream() as Parameters<typeof mapResponsesStream>[0],
      "openai",
      "gpt-6.1-sol"
    ))
      results.push(event);
    expect(results.filter((event) => event.type === "toolCall")).toHaveLength(1);
    expect(results.find((event) => event.type === "provider_metadata")).toMatchObject({
      metadata: { replay: [responseBody.output[0]] },
    });
    expect(results.at(-1)).toEqual({ type: "done", stopReason: "tool_use" });
    async function* interrupted() {
      yield { type: "response.output_text.delta", delta: "Partial" };
    }
    await expect(async () => {
      for await (const _ of mapResponsesStream(
        interrupted() as Parameters<typeof mapResponsesStream>[0],
        "openai",
        "gpt-6.1-sol"
      )) {
        /* consume */
      }
    }).rejects.toThrow("without a completion event");
  });

  it.each(["claude-opus-4-7", "claude-opus-5-5"])(
    "uses adaptive thinking without invalid sampling or manual budget on %s",
    async (model) => {
      const fetch = mockJson({
        id: "msg_test",
        model,
        role: "assistant",
        type: "message",
        content: [{ type: "text", text: "Done" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      });
      const provider = new AnthropicProvider();
      await provider.initialize({ apiKey: "sk-ant-api03-fixture" });
      await provider.complete({
        model,
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.2,
        topP: 0.8,
        thinking: { enabled: true, reasoningEffort: "xhigh", budgetTokens: 10_000 },
      });
      const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(String(init.body));
      expect(body).toMatchObject({
        thinking: { type: "adaptive" },
        output_config: { effort: "xhigh" },
      });
      expect(body).not.toHaveProperty("temperature");
      expect(body).not.toHaveProperty("top_p");
      expect(body.thinking).not.toHaveProperty("budget_tokens");
    }
  );

  it("sends DeepSeek thinking at the JSON root and retains assistant reasoning for tool continuation", async () => {
    const fetch = mockJson({
      id: "chat_test",
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            reasoning_content: "provider-reasoning",
            tool_calls: [
              { type: "function", id: "call_test", function: { name: "lookup", arguments: "{}" } },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 2, completion_tokens: 4 },
    });
    const provider = new DeepSeekProvider();
    await provider.initialize({ apiKey: "sk-test-fixture" });
    const result = await provider.complete({
      model: "deepseek-flash",
      messages: [{ role: "user", content: "Look up" }],
      thinking: { enabled: true, reasoningEffort: "high" },
    });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body).not.toHaveProperty("extra_body");
    const transformed = openaiTransform.transformMessages(
      [
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "call_test", name: "lookup", input: {} }],
          providerMetadata: result.providerMetadata,
        },
      ],
      { provider: "deepseek", modelId: "deepseek-flash" }
    );
    expect(transformed.data[0]).toMatchObject({ reasoning_content: "provider-reasoning" });
  });

  it("preserves signed provider blocks only for their original provider and model", () => {
    const metadata: ProviderResponseMetadata = {
      provider: "anthropic",
      model: "claude-opus-5-5",
      replay: [{ type: "thinking", thinking: "", signature: "signed" }],
    };
    const message = { role: "assistant" as const, content: "Done", providerMetadata: metadata };
    expect(
      anthropicTransform.transformMessages([message], {
        provider: "anthropic",
        modelId: metadata.model,
      }).data[0]?.content
    ).toEqual([
      { type: "thinking", thinking: "", signature: "signed" },
      { type: "text", text: "Done" },
    ]);
    expect(
      anthropicTransform.transformMessages([message], {
        provider: "anthropic",
        modelId: "claude-sonnet-5-5",
      }).data[0]?.content
    ).toBe("Done");
    const part = { functionCall: { name: "lookup", args: {} }, thoughtSignature: "signed-google" };
    const googleMessage = {
      role: "assistant" as const,
      content: [{ type: "tool_use" as const, id: "call_test", name: "lookup", input: {} }],
      providerMetadata: { provider: "google", model: "gemini-4-argon", replay: [part] },
    };
    expect(
      googleTransform.transformMessages([googleMessage], {
        provider: "google",
        modelId: "gemini-4-argon",
      }).data[0]?.parts
    ).toEqual([part]);
    expect(
      googleTransform.transformMessages([googleMessage], {
        provider: "google",
        modelId: "gemini-3.8-flash",
      }).data[0]?.parts
    ).not.toEqual([part]);
  });

  it("configures Gemini 4 thinking levels through the same Google adapter", async () => {
    const fetch = mockJson({
      candidates: [{ content: { role: "model", parts: [{ text: "Done" }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });
    const provider = new GoogleProvider();
    await provider.initialize({ apiKey: "AIzaSyFixtureKey123" });
    await provider.complete({
      model: "gemini-4-argon",
      messages: [{ role: "user", content: "Hi" }],
      thinking: { enabled: true, reasoningEffort: "high" },
    });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).generationConfig.thinkingConfig).toMatchObject({
      thinkingLevel: "HIGH",
    });
  });
});

describe("audited model catalog", () => {
  it.each([
    ["anthropic", () => new AnthropicProvider()],
    ["openai", () => new OpenAIProvider()],
    ["google", () => new GoogleProvider()],
    ["groq", () => new GroqProvider()],
  ] as const)("uses refreshed %s models in both adapter listing APIs", async (provider, create) => {
    const previous = MODEL_CATALOG.get(provider);
    if (!previous) throw new Error(`Missing catalog for ${provider}`);
    const instance = create();
    try {
      const models = normalizeDiscoveredModels(provider, [
        { id: "gpt-7-fixture", context_window: 262144 },
      ]);
      updateDiscoveredModels(provider, models);
      expect(instance.listModels()).toEqual(["gpt-7-fixture"]);
      expect(await instance.listModelsAsync()).toEqual(models);
      expect(getModelInfo(provider, "gpt-7-fixture").contextWindow).toBe(262144);
    } finally {
      updateDiscoveredModels(provider, previous);
    }
  });

  it("honors authoritative discovery capabilities and excludes non-chat model routes", () => {
    const models = normalizeDiscoveredModels("groq", [
      {
        id: "openai/gpt-oss-120b",
        context_window: 131072,
        max_completion_tokens: 65536,
        capabilities: { function_calling: false, vision: false },
      },
      { id: "whisper-large-v3" },
      { id: "canopylabs/orpheus-v1-english" },
      { id: "meta-llama/llama-prompt-guard-2-22m" },
      { id: "vendor/embedding", capabilities: { completion_chat: false } },
    ]);
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      contextWindow: 131072,
      maxOutputTokens: 65536,
      supportsTools: false,
    });
  });

  it("uses provider lifecycle and reasoning metadata for newly discovered models", () => {
    const claude = normalizeDiscoveredModels("anthropic", [
      { id: "claude-fixture-retired", lifecycle: "retired" },
      {
        id: "claude-fixture-new",
        lifecycle: "active",
        max_input_tokens: 1000000,
        capabilities: {
          thinking: {
            supported: true,
            types: { adaptive: { supported: true }, disabled: { supported: false } },
          },
          effort: {
            supported: true,
            low: { supported: true },
            high: { supported: true },
            max: { supported: false },
          },
        },
      },
    ]);
    expect(claude).toHaveLength(1);
    expect(claude[0]).toMatchObject({
      thinkingMode: "adaptive",
      requiresThinking: true,
      reasoningEfforts: ["low", "high"],
    });
    const routed = normalizeDiscoveredModels("openrouter", [
      { id: "vendor/new:batch", architecture: { output_modalities: ["text"] } },
      {
        id: "vendor/new",
        supported_parameters: ["tools", "reasoning_effort"],
        reasoning: {
          mandatory: true,
          supported_efforts: ["low", "max", "not-a-wire-effort"],
          default_effort: "max",
        },
        pricing: { prompt: "0.0000001", input_cache_read: "0.00000005" },
      },
    ]);
    expect(routed).toHaveLength(1);
    expect(routed[0]).toMatchObject({
      supportsReasoning: true,
      supportsSampling: false,
      requiresThinking: true,
      reasoningEfforts: ["low", "max"],
      defaultReasoningEffort: "max",
      inputPrice: 0.1,
      cacheReadsPrice: 0.05,
    });
  });

  it("keeps defaults valid, model IDs unique per provider, and retired IDs out of picker lists", () => {
    for (const [provider, models] of MODEL_CATALOG) {
      expect(new Set(models.map((model) => model.id)).size).toBe(models.length);
      for (const model of models) expect(modelInfoSchema.safeParse(model).success).toBe(true);
      if (!["ollama", "lmstudio"].includes(provider))
        expect(
          getProviderModels(provider).some((model) => model.id === DEFAULT_MODEL_IDS[provider])
        ).toBe(true);
    }
    expect(getProviderModels("anthropic").map((model) => model.id)).toContain("claude-opus-4-7");
    expect(getProviderModels("anthropic").map((model) => model.id)).not.toContain(
      "claude-3-5-sonnet-20241022"
    );
    expect(getProviderModels("deepseek").map((model) => model.id)).not.toContain("deepseek-v4");
    expect(getModelInfo("openai", "gpt-6").name).toBe("Unknown Model");
  });

  it("discovers fresh text models without fabricated pricing and replaces one provider atomically", () => {
    const previous = MODEL_CATALOG.get("openrouter");
    try {
      const models = normalizeDiscoveredModels("openrouter", [
        {
          id: "vendor/new-model",
          name: "New",
          context_length: 200_000,
          supported_parameters: ["tools", "reasoning"],
          architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
        },
        { id: "vendor/image", architecture: { output_modalities: ["image"] } },
        { id: "vendor/retired", active: false },
      ]);
      updateDiscoveredModels("openrouter", models);
      expect(getProviderModels("openrouter")).toHaveLength(1);
      expect(models[0]).toMatchObject({
        id: "vendor/new-model",
        supportsTools: true,
        supportsVision: true,
      });
      expect(calculateCost("openrouter", "vendor/new-model", 100, 100)).toBeUndefined();
      expect(() => updateDiscoveredModels("openrouter", [])).toThrow("No chat models");
      expect(getProviderModels("openrouter")).toHaveLength(1);
    } finally {
      if (previous) updateDiscoveredModels("openrouter", previous);
    }
  });
});
