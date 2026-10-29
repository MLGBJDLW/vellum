import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../anthropic.js";
import { GoogleProvider } from "../google.js";
import { OpenAIProvider } from "../openai.js";
import type { StreamEvent } from "../types.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function mockSse(events: Record<string, unknown>[], named = false) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          events
            .map(
              (event) =>
                `${named ? `event: ${event.type}\n` : ""}data: ${JSON.stringify(event)}\n\n`
            )
            .join(""),
          { headers: { "content-type": "text/event-stream" } }
        )
    )
  );
}

async function collect(
  provider: AnthropicProvider | GoogleProvider | OpenAIProvider,
  model: string
) {
  await provider.initialize({ apiKey: "fixture-only", baseUrl: "https://fixture.invalid" });
  const events: StreamEvent[] = [];
  let error: unknown;
  try {
    for await (const event of provider.stream({
      model,
      messages: [{ role: "user", content: "Test" }],
    }))
      events.push(event);
  } catch (caught) {
    error = caught;
  }
  return { events, error };
}

function expectFailure(result: Awaited<ReturnType<typeof collect>>) {
  expect(result.error).toBeInstanceOf(Error);
  expect(
    result.events.some((event) =>
      ["end", "done", "toolCall", "tool_call_end", "provider_metadata"].includes(event.type)
    )
  ).toBe(false);
}

function anthropicEvents(argumentsJson?: string, complete = true) {
  const events: Record<string, unknown>[] = [
    {
      type: "message_start",
      message: {
        id: "msg_fixture",
        type: "message",
        role: "assistant",
        content: [],
        model: "claude-sonnet-5-5",
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 0 },
      },
    },
  ];
  if (argumentsJson === undefined) {
    events.push(
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Partial response" },
      },
      { type: "content_block_stop", index: 0 }
    );
  } else {
    events.push(
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "call_fixture", name: "lookup", input: {} },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: argumentsJson },
      },
      { type: "content_block_stop", index: 0 }
    );
  }
  if (complete)
    events.push(
      {
        type: "message_delta",
        delta: {
          stop_reason: argumentsJson === undefined ? "end_turn" : "tool_use",
          stop_sequence: null,
        },
        usage: { output_tokens: 2 },
      },
      { type: "message_stop" }
    );
  return events;
}

describe("native provider completion boundaries", () => {
  it.each([false, true])("rejects Google EOF before a finish reason (tool=%s)", async (tool) => {
    mockSse([
      {
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                tool
                  ? { functionCall: { name: "lookup", args: {} } }
                  : { text: "Partial response" },
              ],
            },
          },
        ],
      },
    ]);
    expectFailure(await collect(new GoogleProvider(), "gemini-3.8-flash"));
  });

  it.each([false, true])("rejects Anthropic EOF before message_stop (tool=%s)", async (tool) => {
    mockSse(anthropicEvents(tool ? "{}" : undefined, false), true);
    expectFailure(await collect(new AnthropicProvider(), "claude-sonnet-5-5"));
  });

  it.each(["{", "[]", "null"])(
    "rejects invalid Anthropic tool arguments %s without publishing completion",
    async (args) => {
      mockSse(anthropicEvents(args), true);
      expectFailure(await collect(new AnthropicProvider(), "claude-sonnet-5-5"));
    }
  );

  it.each([{ args: [] }, { args: null }, { args: "invalid" }])(
    "rejects non-object Google tool arguments $args",
    async ({ args }) => {
      mockSse([
        {
          candidates: [
            {
              content: { role: "model", parts: [{ functionCall: { name: "lookup", args } }] },
              finishReason: "STOP",
            },
          ],
        },
      ]);
      expectFailure(await collect(new GoogleProvider(), "gemini-3.8-flash"));
    }
  );

  it("requires Anthropic message_stop even after a stop_reason delta", async () => {
    mockSse(anthropicEvents("{}").slice(0, -1), true);
    expectFailure(await collect(new AnthropicProvider(), "claude-sonnet-5-5"));
  });

  it("treats Google prompt-level safety blocking as a terminal content filter", async () => {
    mockSse([{ promptFeedback: { blockReason: "SAFETY" } }]);
    const result = await collect(new GoogleProvider(), "gemini-3.8-flash");
    expect(result.error).toBeUndefined();
    expect(result.events).toContainEqual({ type: "done", stopReason: "content_filter" });
  });

  it.each(["MAX_TOKENS", "SAFETY"])(
    "does not release a Google tool batch cut off by %s",
    async (finishReason) => {
      mockSse([
        {
          candidates: [
            {
              content: { role: "model", parts: [{ functionCall: { name: "lookup", args: {} } }] },
              finishReason,
            },
          ],
        },
      ]);
      expectFailure(await collect(new GoogleProvider(), "gemini-3.8-flash"));
    }
  );

  it.each(["MALFORMED_FUNCTION_CALL", "UNEXPECTED_TOOL_CALL"])(
    "does not report Google's %s as a successful turn",
    async (finishReason) => {
      mockSse([
        {
          candidates: [{ content: { role: "model", parts: [{ text: "Partial" }] }, finishReason }],
        },
      ]);
      expectFailure(await collect(new GoogleProvider(), "gemini-3.8-flash"));
    }
  );

  it.each(["google", "anthropic"])(
    "releases valid %s tool calls only after a terminal confirmation",
    async (kind) => {
      if (kind === "google")
        mockSse([
          {
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [{ functionCall: { name: "lookup", args: { query: "test" } } }],
                },
              },
            ],
          },
          { candidates: [{ finishReason: "STOP" }] },
        ]);
      else mockSse(anthropicEvents('{"query":"test"}'), true);
      const result = await collect(
        kind === "google" ? new GoogleProvider() : new AnthropicProvider(),
        kind === "google" ? "gemini-3.8-flash" : "claude-sonnet-5-5"
      );
      expect(result.error).toBeUndefined();
      expect(result.events.filter((event) => event.type === "toolCall")).toEqual([
        expect.objectContaining({ name: "lookup", input: { query: "test" } }),
      ]);
      expect(result.events).toContainEqual(
        expect.objectContaining({ type: "done", stopReason: "tool_use" })
      );
    }
  );

  it("keeps completed Responses items pending if the enclosing response later fails", async () => {
    const item = {
      type: "function_call",
      id: "fc_fixture",
      call_id: "call_fixture",
      name: "lookup",
      arguments: "{}",
    };
    mockSse([
      { type: "response.output_item.added", output_index: 0, item },
      { type: "response.output_item.done", output_index: 0, item },
      {
        type: "response.failed",
        response: { status: "failed", error: { message: "Interrupted" } },
      },
    ]);
    expectFailure(await collect(new OpenAIProvider(), "gpt-6.1-sol"));
  });
});

describe("native completion response normalization", () => {
  it.each([false, true])(
    "keeps Google reasoning separate and preserves cached/reasoning usage (stream=%s)",
    async (stream) => {
      const body = {
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: "Visible reasoning", thought: true }, { text: "Answer" }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          thoughtsTokenCount: 3,
          cachedContentTokenCount: 7,
        },
      };
      if (stream) mockSse([body]);
      else
        vi.stubGlobal(
          "fetch",
          vi.fn(
            async () =>
              new Response(JSON.stringify(body), {
                headers: { "content-type": "application/json" },
              })
          )
        );
      const provider = new GoogleProvider();
      await provider.initialize({ apiKey: "fixture-only", baseUrl: "https://fixture.invalid" });
      const params = {
        model: "gemini-3.8-flash",
        messages: [{ role: "user" as const, content: "Hello" }],
      };
      if (stream) {
        const events = [];
        for await (const event of provider.stream(params)) events.push(event);
        expect(
          events
            .filter((event) => event.type === "text")
            .map((event) => event.content)
            .join("")
        ).toBe("Answer");
        expect(
          events
            .filter((event) => event.type === "reasoning")
            .map((event) => event.content)
            .join("")
        ).toBe("Visible reasoning");
        expect(events).toContainEqual({
          type: "usage",
          inputTokens: 10,
          outputTokens: 5,
          thinkingTokens: 3,
          cacheReadTokens: 7,
        });
      } else {
        expect(await provider.complete(params)).toMatchObject({
          content: "Answer",
          thinking: "Visible reasoning",
          usage: { inputTokens: 10, outputTokens: 5, thinkingTokens: 3, cacheReadTokens: 7 },
        });
      }
    }
  );

  it.each([
    { provider: "google", args: [] },
    { provider: "google", args: null },
    { provider: "anthropic", args: [] },
    { provider: "anthropic", args: null },
  ])(
    "rejects invalid non-streaming tool inputs ($provider/$args)",
    async ({ provider: kind, args }) => {
      const body =
        kind === "google"
          ? {
              candidates: [
                {
                  content: { role: "model", parts: [{ functionCall: { name: "lookup", args } }] },
                  finishReason: "STOP",
                },
              ],
            }
          : {
              id: "msg_fixture",
              type: "message",
              role: "assistant",
              model: "claude-sonnet-5-5",
              content: [{ type: "tool_use", id: "call_fixture", name: "lookup", input: args }],
              stop_reason: "tool_use",
              usage: { input_tokens: 1, output_tokens: 1 },
            };
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } })
        )
      );
      const provider = kind === "google" ? new GoogleProvider() : new AnthropicProvider();
      await provider.initialize({ apiKey: "fixture-only", baseUrl: "https://fixture.invalid" });
      await expect(
        provider.complete({
          model: kind === "google" ? "gemini-3.8-flash" : "claude-sonnet-5-5",
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow(/JSON object/);
    }
  );
});

describe("Google credential environment aliases", () => {
  const aliases = [
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_AI_API_KEY",
    "GEMINI_API_KEY",
  ];
  it.each(aliases)("uses %s consistently for availability and requests", async (key) => {
    for (const alias of aliases) vi.stubEnv(alias, "");
    vi.stubEnv(key, "fixture-alias-key");
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
    expect(provider.isConfigured()).toBe(true);
    await provider.initialize({});
    await provider.complete({
      model: "gemini-3.8-flash",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(new Headers(fetch.mock.calls[0]?.[1].headers).get("x-goog-api-key")).toBe(
      "fixture-alias-key"
    );
  });

  it("keeps constructor credentials ahead of environment aliases", async () => {
    for (const alias of aliases) vi.stubEnv(alias, "fixture-env-key");
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
    const provider = new GoogleProvider({ apiKey: "fixture-constructor-key" });
    await provider.initialize({});
    await provider.complete({
      model: "gemini-3.8-flash",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(new Headers(fetch.mock.calls[0]?.[1].headers).get("x-goog-api-key")).toBe(
      "fixture-constructor-key"
    );
  });
});
