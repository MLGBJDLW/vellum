import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterProvider } from "../openrouter.js";
import { openaiTransform } from "../transforms/openai.js";
import type { CompletionMessage, ProviderResponseMetadata, StreamEvent } from "../types.js";

afterEach(() => vi.unstubAllGlobals());

const toolCall = {
  type: "function",
  id: "call_lookup",
  function: { name: "lookup", arguments: '{"query":"weather"}' },
};
const encrypted = {
  type: "reasoning.encrypted",
  id: "reasoning-encrypted-1",
  data: "opaque-encrypted-fixture",
  format: "openai-responses-v1",
  index: 0,
};

function response(model: string, reasoningDetails: Record<string, unknown>[] = []) {
  return {
    id: "chat_fixture",
    model,
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          reasoning_details: reasoningDetails,
          tool_calls: [toolCall],
        },
      },
    ],
    usage: { prompt_tokens: 2, completion_tokens: 4 },
  };
}

function followUp(metadata?: ProviderResponseMetadata): CompletionMessage[] {
  return [
    { role: "user", content: "Find the weather" },
    {
      role: "assistant",
      content: [{ type: "tool_use", id: toolCall.id, name: "lookup", input: { query: "weather" } }],
      providerMetadata: metadata,
    },
    {
      role: "user",
      content: [{ type: "tool_result", toolUseId: toolCall.id, content: "Sunny" }],
    },
  ];
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

describe("OpenRouter reasoning replay", () => {
  it.each(["openai/gpt-6.1-sol", "anthropic/claude-opus-5.5", "google/gemini-4-argon"])(
    "echoes opaque reasoning on the next %s tool turn without requiring visible text",
    async (model) => {
      const fetch = vi.fn(async () => jsonResponse(response(model, [encrypted])));
      vi.stubGlobal("fetch", fetch);
      const provider = new OpenRouterProvider();
      await provider.initialize({ apiKey: "sk-or-test-fixture" });

      const result = await provider.complete({ model, messages: followUp().slice(0, 1) });
      await provider.complete({ model, messages: followUp(result.providerMetadata) });

      const [, init] = fetch.mock.calls[1] as unknown as [string, RequestInit];
      const body = JSON.parse(String(init.body));
      expect(body.messages[1].reasoning_details).toEqual([encrypted]);
      expect(body.messages[1]).not.toHaveProperty("reasoning_content");
      expect(body.messages[2]).toMatchObject({ role: "tool", tool_call_id: toolCall.id });
      expect(result.thinking ?? "").not.toContain(encrypted.data);
    }
  );

  it("retains streamed signed, summarized and encrypted chunks in their original sequence", async () => {
    const model = "anthropic/claude-opus-5.5";
    const details = [
      { type: "reasoning.text", id: "r1", index: 0, text: "Check ", signature: null },
      { type: "reasoning.text", id: "r1", index: 0, text: "weather", signature: "signed-fixture" },
      { type: "reasoning.summary", id: "r2", index: 1, summary: "Need a lookup" },
      { ...encrypted, index: 2, format: "anthropic-claude-v1" },
    ];
    const chunks = [
      ...details.map((detail) => ({
        choices: [{ delta: { reasoning_details: [detail] }, finish_reason: null }],
      })),
      {
        choices: [
          { delta: { tool_calls: [{ ...toolCall, index: 0 }] }, finish_reason: "tool_calls" },
        ],
      },
    ];
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
          { headers: { "content-type": "text/event-stream" } }
        )
      )
      .mockResolvedValueOnce(jsonResponse(response(model)));
    vi.stubGlobal("fetch", fetch);
    const provider = new OpenRouterProvider();
    await provider.initialize({ apiKey: "sk-or-test-fixture" });
    const events: StreamEvent[] = [];
    for await (const event of provider.stream({ model, messages: followUp().slice(0, 1) }))
      events.push(event);
    const metadata = events.find((event) => event.type === "provider_metadata")?.metadata;
    await provider.complete({ model, messages: followUp(metadata) });

    const [, init] = fetch.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).messages[1].reasoning_details).toEqual(details);
    expect(metadata).toMatchObject({ provider: "openrouter", model, replay: details });
    const visible = events.filter((event) => event.type === "text" || event.type === "reasoning");
    expect(JSON.stringify(visible)).not.toContain("signed-fixture");
    expect(JSON.stringify(visible)).not.toContain(encrypted.data);

    for (const config of [
      { provider: "openrouter" as const, modelId: "different-model" },
      { provider: "deepseek" as const, modelId: model },
    ]) {
      const transformed = openaiTransform.transformMessages(followUp(metadata), config);
      expect(transformed.data[1]).not.toHaveProperty("reasoning_details");
    }
  });
});
