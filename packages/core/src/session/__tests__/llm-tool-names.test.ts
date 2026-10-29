import { type CompletionMessage, DeepSeekProvider, type ProviderRegistry } from "@vellum/provider";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LLM } from "../llm.js";

afterEach(() => vi.unstubAllGlobals());

describe("provider tool name boundary", () => {
  it("encodes MCP/long names on the wire and restores names for execution and history", async () => {
    const names = ["mcp:server/read", "mcp_server_read", "工具", "a".repeat(90), "shell"];
    const tools = names.map((name) => ({
      name,
      description: name,
      inputSchema: { type: "object", properties: {} },
    }));
    const requests: Array<{
      tools: Array<{ function: { name: string } }>;
      messages: Array<{ tool_calls: Array<{ function: { name: string } }> }>;
      tool_choice: { function: { name: string } };
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        requests.push(body);
        const name = body.tools[0].function.name;
        return new Response(
          `data: ${JSON.stringify({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_1",
                      type: "function",
                      function: { name, arguments: "{}" },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          })}\n\ndata: [DONE]\n\n`,
          { headers: { "content-type": "text/event-stream" } }
        );
      })
    );
    const provider = new DeepSeekProvider();
    await provider.initialize({ apiKey: "fixture-only" });
    LLM.initialize({ get: async () => provider } as unknown as ProviderRegistry);
    const messages: CompletionMessage[] = [{ role: "user", content: "Read" }];
    const events = [];
    const extraBody = { tool_choice: { type: "function", function: { name: "mcp:server/read" } } };
    for await (const event of LLM.stream({
      providerType: "deepseek",
      model: "deepseek-flash",
      tools,
      messages,
      extraBody,
    }))
      events.push(event);
    const wireNames = requests[0]?.tools.map(
      (tool: { function: { name: string } }) => tool.function.name
    ) as string[];
    expect(wireNames.every((name) => /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(name))).toBe(true);
    expect(new Set(wireNames).size).toBe(names.length);
    expect(wireNames[1]).toBe(names[1]);
    expect(wireNames[4]).toBe("shell");
    expect(requests[0]?.tool_choice.function.name).toBe(wireNames[0]);
    expect(extraBody.tool_choice.function.name).toBe("mcp:server/read");
    expect(events).toContainEqual(
      expect.objectContaining({ type: "tool_call_start", name: names[0] })
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: "toolCallDelta", name: names[0] })
    );
    expect(events).toContainEqual(expect.objectContaining({ type: "toolCall", name: names[0] }));
    messages.push(
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "call_1", name: "mcp:server/read", input: {} }],
      },
      { role: "user", content: [{ type: "tool_result", toolUseId: "call_1", content: "Done" }] }
    );
    for await (const _event of LLM.stream({
      providerType: "deepseek",
      model: "deepseek-flash",
      tools,
      messages,
    })) {
      /* consume */
    }
    expect(requests[1]?.messages[1]?.tool_calls[0]?.function.name).toBe(wireNames[0]);
    expect(tools.map((tool) => tool.name)).toEqual(names);
    expect(messages[1]?.content).toEqual([
      { type: "tool_use", id: "call_1", name: names[0], input: {} },
    ]);
  });
});
