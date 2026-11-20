import { afterEach, describe, expect, it, vi } from "vitest";
import { BaichuanProvider } from "../baichuan.js";
import { DeepSeekProvider } from "../deepseek.js";
import { MiniMaxProvider } from "../minimax.js";
import { MistralProvider } from "../mistral.js";
import {
  MODEL_CATALOG,
  normalizeDiscoveredModels,
  updateDiscoveredModels,
} from "../models/index.js";
import { MoonshotProvider } from "../moonshot.js";
import { OpenAICompatibleProvider } from "../openai-compat.js";
import { QwenProvider } from "../qwen.js";
import type { CompletionMessage, CompletionParams, StreamEvent } from "../types.js";
import { YiProvider } from "../yi.js";
import { ZhipuProvider } from "../zhipu.js";

afterEach(() => vi.unstubAllGlobals());

function mockCompletion(stream: boolean, message: Record<string, unknown>, usage?: unknown) {
  const fetch = vi.fn(async () => {
    if (!stream) {
      return new Response(
        JSON.stringify({ choices: [{ message, finish_reason: "stop" }], usage }),
        {
          headers: { "content-type": "application/json" },
        }
      );
    }
    return new Response(
      `data: ${JSON.stringify({ choices: [{ delta: message, finish_reason: "stop" }], usage })}\n\ndata: [DONE]\n\n`,
      { headers: { "content-type": "text/event-stream" } }
    );
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function invoke(
  provider: OpenAICompatibleProvider,
  params: CompletionParams,
  stream: boolean
) {
  await provider.initialize({ apiKey: "fixture" });
  if (!stream) return provider.complete(params);
  const events: StreamEvent[] = [];
  for await (const event of provider.stream(params)) events.push(event);
  return events;
}

function requestBody(fetch: ReturnType<typeof mockCompletion>) {
  const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(String(init.body));
}

const toolHistory: CompletionMessage[] = [
  { role: "user", content: "Look up both" },
  {
    role: "assistant",
    content: [
      { type: "tool_use", id: "call_sameprefix_one", name: "lookup", input: {} },
      { type: "tool_use", id: "call_sameprefix_two", name: "lookup", input: {} },
      { type: "tool_use", id: "callsamep", name: "lookup", input: {} },
    ],
  },
  {
    role: "user",
    content: [
      { type: "tool_result", toolUseId: "call_sameprefix_one", content: "First" },
      { type: "tool_result", toolUseId: "call_sameprefix_two", content: "Second" },
      { type: "tool_result", toolUseId: "callsamep", content: "Third" },
      { type: "text", text: "Continue" },
    ],
  },
];

it.each([
  {
    provider: new YiProvider(),
    inventory: [{ id: "yi-lightning", context_window: 65_536 }, { id: "yi-id-only" }],
    limits: [
      ["yi-lightning", 32_768],
      ["yi-vision-v2", undefined],
      ["yi-id-only", 32_768],
      ["yi-private", 32_768],
    ],
  },
  {
    provider: new BaichuanProvider(),
    inventory: [
      { id: "Baichuan4", max_completion_tokens: 4000 },
      { id: "custom", max_tokens: 3000 },
    ],
    limits: [
      ["Baichuan4", 4000],
      ["custom", 3000],
      ["Baichuan4-Turbo", 2048],
      ["Baichuan-private", 32_768],
    ],
  },
] as const)(
  "uses refreshed, bundled and custom output limits for $provider.providerName",
  async ({ provider, inventory, limits }) => {
    const key = provider.providerName;
    const original = MODEL_CATALOG.get(key);
    if (!original) throw new Error(`Missing catalog for ${key}`);
    const fetch = mockCompletion(false, { role: "assistant", content: "Done" });
    try {
      updateDiscoveredModels(key, normalizeDiscoveredModels(key, [...inventory]));
      await provider.initialize({ apiKey: "fixture" });
      for (const [model, expected] of limits) {
        fetch.mockClear();
        await provider.complete({
          model,
          messages: [{ role: "user", content: "Hi" }],
          maxTokens: 32_768,
        });
        expect(requestBody(fetch).max_tokens, model).toBe(expected);
      }
    } finally {
      updateDiscoveredModels(key, original);
    }
  }
);

describe.each([false, true])("real provider wire compatibility (stream=%s)", (stream) => {
  it.each(["kimi-k2.6", "kimi-k2.7-code", "kimi-k3.1-pro"])(
    "omits fixed sampling and uses the supported thinking switch for %s",
    async (model) => {
      const fetch = mockCompletion(stream, { role: "assistant", content: "Done" });
      await invoke(
        new MoonshotProvider(),
        {
          model,
          messages: [{ role: "user", content: "Hello" }],
          temperature: 0.4,
          topP: 0.8,
          frequencyPenalty: 0.25,
          presencePenalty: 0.5,
          extraBody: { n: 2, top_p: 0.7, thinking: { keep: "all", type: "disabled" } },
          thinking: { enabled: true, reasoningEffort: "none" },
        },
        stream
      );
      const body = requestBody(fetch);
      for (const field of ["temperature", "top_p", "presence_penalty", "frequency_penalty", "n"]) {
        expect(body).not.toHaveProperty(field);
      }
      if (model === "kimi-k2.6") {
        expect(body.thinking).toEqual({ type: "disabled", keep: "all" });
        expect(body).not.toHaveProperty("reasoning_effort");
      } else {
        expect(body).not.toHaveProperty("thinking");
      }
    }
  );

  it.each(["MiniMax-M3", "MiniMax-M3.1-Flash"])(
    "honors the thinking switch on %s when supported",
    async (model) => {
      const fetch = mockCompletion(stream, { role: "assistant", content: "Done" });
      await invoke(
        new MiniMaxProvider(),
        {
          model,
          messages: [{ role: "user", content: "Hello" }],
          thinking: { enabled: true, reasoningEffort: "none" },
          extraBody: { thinking: { type: "disabled" }, reasoning_split: false },
        },
        stream
      );
      const body = requestBody(fetch);
      expect(body.reasoning_split).toBe(true);
      expect(body.thinking).toEqual(model === "MiniMax-M3" ? { type: "disabled" } : undefined);
      if (model === "MiniMax-M3") expect(body).not.toHaveProperty("reasoning_effort");
    }
  );

  it.each([
    ["qwen-long", new QwenProvider()],
    ["glm-4.5v", new ZhipuProvider()],
    ["Baichuan3-Turbo-128k", new BaichuanProvider()],
  ] as const)(
    "preserves prior tool turns as text when switching to %s",
    async (model, provider) => {
      const fetch = mockCompletion(stream, { role: "assistant", content: "Done" });
      await invoke(
        provider,
        {
          model,
          messages: toolHistory,
          extraBody: { tools: [], tool_choice: "auto", parallel_tool_calls: true },
        },
        stream
      );
      const request = requestBody(fetch);
      expect(request).not.toHaveProperty("tools");
      expect(request).not.toHaveProperty("tool_choice");
      expect(request).not.toHaveProperty("parallel_tool_calls");
      expect(request.messages).toContainEqual({
        role: "user",
        content: "Tool result (call_sameprefix_two)\nSecond",
      });
      expect(request.messages).toContainEqual({
        role: "assistant",
        content: expect.stringContaining("Tool call lookup (callsamep)\n{}"),
      });
      expect(request.messages).not.toContainEqual(expect.objectContaining({ role: "tool" }));
    }
  );

  it.each([
    "qwen4-max",
    "qwen4-max-preview",
    "qwen3.8-max",
    "qwen3.8-flash",
    "qwen3.8-27b",
    "qwen3.8-2.4t-a95b",
    "mindlab/macaron-v1.1-coding-venti",
  ])("keeps %s reasoning controls exclusive and retains tool-turn reasoning", async (model) => {
    const fetch = mockCompletion(stream, { role: "assistant", content: "Done" });
    const provider = new QwenProvider();
    await provider.initialize({
      apiKey: "fixture",
      baseUrl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    });
    const params: CompletionParams = {
      model,
      messages: [
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "call_a", name: "lookup", input: {} }],
          providerMetadata: { provider: "qwen", model, reasoningContent: "opaque" },
        },
        {
          role: "user",
          content: [{ type: "tool_result", toolUseId: "call_a", content: "Found" }],
        },
      ],
      thinking: { enabled: true, reasoningEffort: "low", budgetTokens: 4096 },
      extraBody: { reasoning_effort: "xhigh" },
      maxTokens: 65536,
    };
    const consume = async (request: CompletionParams) => {
      if (!stream) return provider.complete(request);
      for await (const _ of provider.stream(request)) {
        /* consume */
      }
    };
    await consume(params);
    expect(requestBody(fetch)).toMatchObject({
      enable_thinking: true,
      thinking_budget: 4096,
      max_tokens: 65536,
      messages: [{ role: "assistant", reasoning_content: "opaque" }, { role: "tool" }],
    });
    expect(requestBody(fetch)).not.toHaveProperty("reasoning_effort");
    if (model.startsWith("mindlab/")) expect(requestBody(fetch).preserve_thinking).toBe(true);
    fetch.mockClear();
    await consume({
      ...params,
      thinking: { enabled: true, reasoningEffort: "low" },
      extraBody: {},
    });
    expect(requestBody(fetch)).toMatchObject({ enable_thinking: true, reasoning_effort: "low" });
    expect(requestBody(fetch)).not.toHaveProperty("thinking_budget");
    fetch.mockClear();
    await consume({ ...params, thinking: { enabled: true, reasoningEffort: "none" } });
    expect(requestBody(fetch)).toMatchObject({ enable_thinking: false });
    expect(requestBody(fetch)).not.toHaveProperty("reasoning_effort");
    expect(requestBody(fetch)).not.toHaveProperty("thinking_budget");
  });

  it("applies output budgets to the selected route and thinking mode", async () => {
    const fetch = mockCompletion(stream, { role: "assistant", content: "Done" });
    const messages: CompletionMessage[] = [{ role: "user", content: "Hello" }];
    await invoke(
      new ZhipuProvider(),
      { model: "glm-5.2", messages, thinking: { enabled: false } },
      stream
    );
    expect(requestBody(fetch).thinking).toEqual({ type: "disabled" });
    fetch.mockClear();
    await invoke(
      new ZhipuProvider(),
      { model: "glm-5.3", messages, thinking: { enabled: false } },
      stream
    );
    expect(requestBody(fetch).thinking).toEqual({ type: "enabled" });
    fetch.mockClear();
    await invoke(
      new QwenProvider(),
      { model: "qwen4-max", messages, maxTokens: 262_144, thinking: { enabled: false } },
      stream
    );
    expect(requestBody(fetch)).toMatchObject({ enable_thinking: false, max_tokens: 131_072 });
    fetch.mockClear();
    await invoke(new YiProvider(), { model: "yi-lightning", messages, maxTokens: 32_768 }, stream);
    expect(requestBody(fetch)).not.toHaveProperty("max_tokens");
    fetch.mockClear();
    await invoke(new BaichuanProvider(), { model: "Baichuan4-Turbo", messages }, stream);
    expect(requestBody(fetch)).toMatchObject({ max_tokens: 2048 });
    fetch.mockClear();
    await invoke(
      new BaichuanProvider(),
      {
        model: "Baichuan-M3",
        messages,
        thinking: { enabled: true, budgetTokens: 8192 },
        maxTokens: 4096,
      },
      stream
    );
    expect(requestBody(fetch)).toMatchObject({
      thinking: { budget_tokens: 4095 },
      max_tokens: 4096,
    });
    fetch.mockClear();
    await invoke(
      new BaichuanProvider(),
      {
        model: "Baichuan-M3-Plus",
        messages: [{ role: "system", content: "Be concise." }, ...toolHistory],
        maxTokens: 1024,
        tools: [
          {
            name: "lookup",
            description: "Look up a result",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      },
      stream
    );
    const medicalRequest = requestBody(fetch);
    expect(medicalRequest).not.toHaveProperty("tools");
    expect(medicalRequest.messages).toEqual([
      { role: "user", content: "Be concise." },
      { role: "user", content: "Look up both" },
      {
        role: "assistant",
        content:
          "Tool call lookup (call_sameprefix_one)\n{}\n\nTool call lookup (call_sameprefix_two)\n{}\n\nTool call lookup (callsamep)\n{}",
      },
      { role: "user", content: "Tool result (call_sameprefix_one)\nFirst" },
      { role: "user", content: "Tool result (call_sameprefix_two)\nSecond" },
      { role: "user", content: "Tool result (callsamep)\nThird" },
      { role: "user", content: "Continue" },
    ]);
  });

  it.each(["deepseek-flash", "deepseek-v4-pro"])(
    "honors the documented low reasoning effort and 384Ki output limit for %s",
    async (model) => {
      const fetch = mockCompletion(stream, { role: "assistant", content: "Done" });
      const provider = new DeepSeekProvider();
      await invoke(
        provider,
        {
          model,
          messages: [{ role: "user", content: "Hello" }],
          thinking: { enabled: true, reasoningEffort: "low" },
          maxTokens: 393216,
        },
        stream
      );
      expect(requestBody(fetch)).toMatchObject({ reasoning_effort: "low", max_tokens: 393216 });
      expect(
        (await provider.listModelsAsync()).find((entry) => entry.id === model)?.maxOutputTokens
      ).toBe(393216);
    }
  );

  it.each(["insufficient_system_resource", "aborted"])(
    "does not report interrupted %s responses as successful",
    async (reason) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              stream
                ? `data: ${JSON.stringify({ choices: [{ delta: { content: "Partial" }, finish_reason: reason }] })}\n\ndata: [DONE]\n\n`
                : JSON.stringify({
                    choices: [{ message: { content: "Partial" }, finish_reason: reason }],
                  }),
              { headers: { "content-type": stream ? "text/event-stream" : "application/json" } }
            )
        )
      );
      await expect(
        invoke(
          new DeepSeekProvider(),
          { model: "deepseek-flash", messages: [{ role: "user", content: "Hello" }] },
          stream
        )
      ).rejects.toMatchObject({
        name: "ProviderError",
        retryable: reason === "insufficient_system_resource",
      });
    }
  );

  it.each(['{"command":', "null", "[]"])(
    "rejects malformed tool arguments instead of executing an empty input (%s)",
    async (argumentsJson) => {
      const tool = {
        index: 0,
        type: "function",
        id: "call_one",
        function: { name: "lookup", arguments: argumentsJson },
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              stream
                ? `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [tool] }, finish_reason: "tool_calls" }] })}\n\ndata: [DONE]\n\n`
                : JSON.stringify({
                    choices: [
                      {
                        message: { role: "assistant", content: null, tool_calls: [tool] },
                        finish_reason: "tool_calls",
                      },
                    ],
                  }),
              { headers: { "content-type": stream ? "text/event-stream" : "application/json" } }
            )
        )
      );
      await expect(
        invoke(
          new DeepSeekProvider(),
          { model: "deepseek-flash", messages: [{ role: "user", content: "Hello" }] },
          stream
        )
      ).rejects.toMatchObject({ name: "ProviderError" });
    }
  );

  it("uses collision-free Mistral tool IDs and the existing tool-result bridge", async () => {
    const fetch = mockCompletion(stream, { role: "assistant", content: "Done" });
    await invoke(
      new MistralProvider(),
      { model: "mistral-small-2603", messages: toolHistory },
      stream
    );
    const messages = requestBody(fetch).messages;
    const ids = messages[1].tool_calls.map((call: { id: string }) => call.id);
    expect(ids.every((id: string) => /^[a-zA-Z0-9]{9}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(3);
    expect(ids[2]).toBe("callsamep");
    expect(
      messages
        .filter((m: { role: string }) => m.role === "tool")
        .map((m: { tool_call_id: string }) => m.tool_call_id)
    ).toEqual(ids);
    expect(messages.at(-2)).toEqual({ role: "assistant", content: "Done." });
  });

  it("applies local-provider assistant content rules to the actual request", async () => {
    class LocalProvider extends OpenAICompatibleProvider {
      readonly defaultBaseUrl = "http://localhost:1234/v1";
      readonly providerName = "lmstudio";
    }
    const fetch = mockCompletion(stream, { role: "assistant", content: "Done" });
    await invoke(new LocalProvider(), { model: "local", messages: toolHistory }, stream);
    expect(requestBody(fetch).messages[1].content).toBe("");
  });

  it("preserves DeepSeek cache and reasoning token usage", async () => {
    mockCompletion(
      stream,
      { role: "assistant", content: "Done" },
      {
        prompt_tokens: 100,
        completion_tokens: 30,
        prompt_cache_hit_tokens: 80,
        prompt_cache_miss_tokens: 20,
        completion_tokens_details: { reasoning_tokens: 12 },
      }
    );
    const result = await invoke(
      new DeepSeekProvider(),
      { model: "deepseek-flash", messages: [{ role: "user", content: "Hello" }] },
      stream
    );
    const usage = Array.isArray(result)
      ? result.find((event) => event.type === "usage")
      : result.usage;
    expect(usage).toMatchObject({
      inputTokens: 100,
      outputTokens: 30,
      cacheReadTokens: 80,
      thinkingTokens: 12,
    });
    expect(usage).not.toHaveProperty("cacheWriteTokens");
  });

  it("preserves empty DeepSeek reasoning fields for subsequent tool requests", async () => {
    mockCompletion(stream, { role: "assistant", content: "Done", reasoning_content: "" });
    const result = await invoke(
      new DeepSeekProvider(),
      { model: "deepseek-flash", messages: [{ role: "user", content: "Hello" }] },
      stream
    );
    const metadata = Array.isArray(result)
      ? result.find((event) => event.type === "provider_metadata")?.metadata
      : result.providerMetadata;
    expect(metadata).toEqual({
      provider: "deepseek",
      model: "deepseek-flash",
      reasoningContent: "",
    });
    const fetch = mockCompletion(stream, { role: "assistant", content: "Done" });
    await invoke(
      new DeepSeekProvider(),
      {
        model: "deepseek-flash",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "", providerMetadata: metadata },
          { role: "assistant", content: "Done", providerMetadata: metadata },
          { role: "user", content: "Next" },
        ],
        thinking: { enabled: true },
        tools: [
          {
            name: "lookup",
            description: "Look up",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      },
      stream
    );
    expect(
      requestBody(fetch).messages.filter(
        (message: { role: string }) => message.role === "assistant"
      )
    ).toEqual([
      { role: "assistant", content: "", reasoning_content: "" },
      { role: "assistant", content: "Done", reasoning_content: "" },
    ]);
  });

  it("omits reasoning from another provider or model, including empty assistant messages", async () => {
    const fetch = mockCompletion(stream, { role: "assistant", content: "Done" });
    await invoke(
      new DeepSeekProvider(),
      {
        model: "deepseek-flash",
        messages: [
          { role: "user", content: "Hello" },
          {
            role: "assistant",
            content: "",
            providerMetadata: {
              provider: "deepseek",
              model: "deepseek-v4-pro",
              reasoningContent: "private",
            },
          },
          {
            role: "assistant",
            content: "Visible",
            providerMetadata: {
              provider: "moonshot",
              model: "deepseek-flash",
              reasoningContent: "private",
            },
          },
          { role: "user", content: "Next" },
        ],
      },
      stream
    );
    const assistant = requestBody(fetch).messages.filter(
      (message: { role: string }) => message.role === "assistant"
    );
    expect(assistant).toEqual([{ role: "assistant", content: "Visible" }]);
  });
});

it("assembles interleaved DeepSeek tool fragments and replays the complete reasoning on continuation", async () => {
  const chunks = [
    { delta: { reasoning_content: "First " }, finish_reason: null },
    { delta: { reasoning_content: "plan." }, finish_reason: null },
    {
      delta: {
        tool_calls: [
          {
            index: 0,
            id: "call_one",
            type: "function",
            function: { name: "lookup", arguments: '{"query":' },
          },
          {
            index: 1,
            id: "call_two",
            type: "function",
            function: { name: "lookup", arguments: '{"query":' },
          },
        ],
      },
      finish_reason: null,
    },
    {
      delta: {
        tool_calls: [
          { index: 1, function: { arguments: '"second"}' } },
          { index: 0, function: { arguments: '"first"}' } },
        ],
      },
      finish_reason: null,
    },
    { delta: {}, finish_reason: "tool_calls" },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          chunks.map((chunk) => `data: ${JSON.stringify({ choices: [chunk] })}\n\n`).join("") +
            "data: [DONE]\n\n",
          { headers: { "content-type": "text/event-stream" } }
        )
    )
  );
  const result = await invoke(
    new DeepSeekProvider(),
    { model: "deepseek-flash", messages: [{ role: "user", content: "Look up both" }] },
    true
  );
  if (!Array.isArray(result)) throw new Error("Expected streaming result");
  const calls = result.filter((event) => event.type === "toolCall");
  expect(calls).toEqual([
    { type: "toolCall", id: "call_one", name: "lookup", input: { query: "first" } },
    { type: "toolCall", id: "call_two", name: "lookup", input: { query: "second" } },
  ]);
  const metadata = result.find((event) => event.type === "provider_metadata")?.metadata;
  const fetch = mockCompletion(false, { role: "assistant", content: "Done" });
  await invoke(
    new DeepSeekProvider(),
    {
      model: "deepseek-flash",
      thinking: { enabled: true },
      messages: [
        { role: "user", content: "Look up both" },
        {
          role: "assistant",
          content: calls.map((call) => ({
            type: "tool_use",
            id: call.id,
            name: call.name,
            input: call.input,
          })),
          providerMetadata: metadata,
        },
        {
          role: "user",
          content: calls.map((call) => ({
            type: "tool_result",
            toolUseId: call.id,
            content: "Found",
          })),
        },
      ],
      tools: [
        {
          name: "lookup",
          description: "Look up",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      ],
    },
    false
  );
  expect(requestBody(fetch).messages[1]).toMatchObject({
    reasoning_content: "First plan.",
    tool_calls: [
      { id: "call_one", function: { name: "lookup", arguments: '{"query":"first"}' } },
      { id: "call_two", function: { name: "lookup", arguments: '{"query":"second"}' } },
    ],
  });
});

it("does not report an incomplete SSE stream as a successful turn", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content: "Partial" }, finish_reason: null }] })}\n\n`,
          { headers: { "content-type": "text/event-stream" } }
        )
    )
  );
  await expect(
    invoke(
      new DeepSeekProvider(),
      { model: "deepseek-flash", messages: [{ role: "user", content: "Hello" }] },
      true
    )
  ).rejects.toMatchObject({ name: "ProviderError", retryable: true });
});
