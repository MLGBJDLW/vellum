import {
  AnthropicProvider,
  BaichuanProvider,
  DeepSeekProvider,
  DoubaoProvider,
  GoogleProvider,
  GroqProvider,
  LMStudioProvider,
  MiniMaxProvider,
  MistralProvider,
  MoonshotProvider,
  OllamaProvider,
  OpenAIProvider,
  OpenRouterProvider,
  QwenProvider,
  type ToolDefinition,
  XAIProvider,
  YiProvider,
  ZhipuProvider,
} from "@vellum/provider";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnifiedToolContainer } from "../container.js";

afterEach(() => vi.unstubAllGlobals());

const adapters = [
  ["anthropic", () => new AnthropicProvider()],
  ["openai", () => new OpenAIProvider()],
  ["google", () => new GoogleProvider()],
  ["deepseek", () => new DeepSeekProvider()],
  ["groq", () => new GroqProvider()],
  ["xai", () => new XAIProvider()],
  ["qwen", () => new QwenProvider()],
  ["ollama", () => new OllamaProvider()],
  ["lmstudio", () => new LMStudioProvider()],
  ["openrouter", () => new OpenRouterProvider()],
  ["zhipu", () => new ZhipuProvider()],
  ["moonshot", () => new MoonshotProvider()],
  ["mistral", () => new MistralProvider()],
  ["yi", () => new YiProvider()],
  ["baichuan", () => new BaichuanProvider()],
  ["doubao", () => new DoubaoProvider()],
  ["minimax", () => new MiniMaxProvider()],
] as const;

type WireTool = { name: string; schema: Record<string, unknown>; strict?: boolean };
type WireRequest = Record<string, unknown> & { tools?: Record<string, unknown>[] };

function readTools(provider: string, body: WireRequest): WireTool[] {
  if (provider === "google") {
    return ((body.tools?.[0]?.functionDeclarations ?? []) as Record<string, unknown>[]).map(
      (tool) => {
        expect(tool).not.toHaveProperty("parameters");
        return {
          name: tool.name as string,
          schema: tool.parametersJsonSchema as Record<string, unknown>,
        };
      }
    );
  }
  return (body.tools ?? []).map((tool) => {
    const definition = (tool.function ?? tool) as Record<string, unknown>;
    return {
      name: definition.name as string,
      schema: (definition.parameters ?? definition.input_schema) as Record<string, unknown>,
      ...(typeof definition.strict === "boolean" ? { strict: definition.strict } : {}),
    };
  });
}

function invalidBounds(value: unknown, path = "parameters"): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    (key === "exclusiveMinimum" || key === "exclusiveMaximum") && typeof child !== "number"
      ? [`${path}.${key}: ${typeof child}`]
      : invalidBounds(child, `${path}.${key}`)
  );
}

function event(data: unknown, type?: string): string {
  return `${type ? `event: ${type}\n` : ""}data: ${JSON.stringify(data)}\n\n`;
}

function responseFor(
  provider: string,
  model: string,
  stream: boolean,
  responses: boolean
): Response {
  let body: Record<string, unknown>;
  let sse: string;
  if (provider === "anthropic") {
    body = {
      id: "msg_fixture",
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "text", text: "Done" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const events = [
      { type: "message_start", message: { ...body, content: [], stop_reason: null } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Done" } },
      { type: "content_block_stop", index: 0 },
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 1 },
      },
      { type: "message_stop" },
    ];
    sse = events.map((item) => event(item, item.type)).join("");
  } else if (provider === "google") {
    body = {
      candidates: [{ content: { role: "model", parts: [{ text: "Done" }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
    };
    sse = event(body);
  } else if (responses) {
    body = {
      id: "resp_fixture",
      object: "response",
      created_at: 1,
      model,
      status: "completed",
      output_text: "Done",
      output: [
        {
          type: "message",
          id: "msg_fixture",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Done", annotations: [] }],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    };
    sse =
      event({
        type: "response.output_text.delta",
        delta: "Done",
        output_index: 0,
        content_index: 0,
        item_id: "msg_fixture",
        sequence_number: 0,
      }) + event({ type: "response.completed", response: body, sequence_number: 1 });
  } else {
    body = {
      id: "chat_fixture",
      object: "chat.completion",
      model,
      choices: [
        { index: 0, message: { role: "assistant", content: "Done" }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
    sse = `${event({
      choices: [{ index: 0, delta: { role: "assistant", content: "Done" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })}data: [DONE]\n\n`;
  }
  return new Response(stream ? sse : JSON.stringify(body), {
    headers: { "content-type": stream ? "text/event-stream" : "application/json" },
  });
}

const referenceProbe: ToolDefinition = {
  name: "reference_probe",
  description: "Fixture for reference and optional input preservation",
  inputSchema: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      name: { type: "string" },
      options: { $ref: "#/$defs/options" },
      legacyTuple: {
        type: "array",
        items: [{ type: "string" }, { type: "integer" }],
        additionalItems: false,
        minItems: 2,
      },
      tupleFirst: { $ref: "#/properties/legacyTuple/items/0" },
    },
    required: ["name"],
    additionalProperties: false,
    $defs: {
      options: {
        type: "object",
        properties: { count: { type: "integer", minimum: 0, exclusiveMinimum: true } },
        additionalProperties: false,
      },
    },
  },
};

describe.each(adapters)("all builtin schemas through the real %s adapter", (name, create) => {
  it.each([false, true])(
    "serializes all builtin tools without weakening references or optional fields (stream=%s)",
    async (stream) => {
      const container = new UnifiedToolContainer();
      container.registerBuiltins();
      const builtinTools = container.getProviderToolDefinitions();
      expect(builtinTools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(["bash", "search_tool", "fetch_tool", "web_search", "web_fetch"])
      );
      const tools = [...builtinTools, referenceProbe];
      const original = structuredClone(tools);
      const provider = create();
      const model = provider.getDefaultModel();
      let request: WireRequest | undefined;
      let requestUrl = "";
      const fetch = vi.fn(async (url: unknown, init: RequestInit) => {
        requestUrl = String(url);
        request = JSON.parse(String(init.body));
        return responseFor(name, model, stream, Array.isArray(request?.input));
      });
      // Exercise the actual SDK serialization with no external network or credentials.
      vi.stubGlobal("fetch", fetch);
      await provider.initialize({
        apiKey: "fixture-only",
        baseUrl: "http://127.0.0.1:1/v1",
      });
      const params = {
        model,
        messages: [{ role: "user" as const, content: "Inspect files" }],
        tools,
      };
      if (stream) {
        const text: string[] = [];
        for await (const item of provider.stream(params))
          if (item.type === "text") text.push(item.content);
        expect(text.join("")).toBe("Done");
      } else expect((await provider.complete(params)).content).toBe("Done");
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(request).toBeDefined();
      const sent = readTools(name, request as WireRequest);
      expect(sent).toHaveLength(builtinTools.length + 1);
      expect(sent.map((tool) => tool.name)).toEqual(tools.map((tool) => tool.name));
      expect(sent.flatMap((tool) => invalidBounds(tool.schema, tool.name))).toEqual([]);
      expect(sent.find((tool) => tool.name === "bash")?.schema).toMatchObject({
        properties: { timeout: { type: "integer", exclusiveMinimum: 0 } },
        required: ["command"],
      });
      expect(sent.find((tool) => tool.name === "read_many_files")?.schema).toMatchObject({
        properties: {
          lineRange: {
            prefixItems: [{ type: "integer" }, { type: "integer" }],
            items: false,
            minItems: 2,
            maxItems: 2,
          },
        },
      });
      expect(sent.find((tool) => tool.name === "reference_probe")?.schema).toMatchObject({
        properties: {
          options: { $ref: "#/$defs/options" },
          legacyTuple: {
            type: "array",
            prefixItems: [{ type: "string" }, { type: "integer" }],
            items: false,
            minItems: 2,
          },
          tupleFirst: { $ref: "#/properties/legacyTuple/prefixItems/0" },
        },
        required: ["name"],
        additionalProperties: false,
        $defs: {
          options: {
            type: "object",
            properties: { count: { type: "integer", exclusiveMinimum: 0 } },
            additionalProperties: false,
          },
        },
      });
      if (name === "openai" || name === "xai") {
        expect(requestUrl).toContain("/responses");
        expect(sent.every((tool) => tool.strict === false)).toBe(true);
      }
      expect(tools).toEqual(original);
    }
  );
});
