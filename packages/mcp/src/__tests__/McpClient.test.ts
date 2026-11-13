import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";
import { McpClient } from "../McpClient.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

const firstTool: Tool = {
  name: "first",
  inputSchema: { type: "object" },
  outputSchema: {
    type: "object",
    properties: { count: { type: "number" } },
    required: ["count"],
  },
};

async function fixture() {
  const server = new Server({ name: "paged", version: "1" }, { capabilities: { tools: {} } });
  const client = new McpClient({ name: "test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  server.setRequestHandler(ListToolsRequestSchema, async ({ params }) => ({
    tools: params?.cursor ? [{ name: "last", inputSchema: { type: "object" } }] : [firstTool],
    ...(params?.cursor ? {} : { nextCursor: "last", _meta: { inventory: "first-page" } }),
  }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => ({
    content: [],
    structuredContent: params.arguments ?? {},
  }));
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closers.push(async () => {
    await client.close();
    await server.close();
  });
  return { server, client };
}

describe("MCP SDK metadata across pagination", () => {
  it("validates first-page structured output after collecting later pages", async () => {
    const { client } = await fixture();
    const inventory = await client.listTools();
    expect(inventory.tools.map((tool) => tool.name)).toEqual(["first", "last"]);
    expect(inventory.nextCursor).toBeUndefined();
    expect(inventory._meta).toEqual({ inventory: "first-page" });
    await expect(
      client.callTool({ name: "first", arguments: { count: "invalid" } })
    ).rejects.toThrow("output schema");
    expect(await client.callTool({ name: "first", arguments: { count: 3 } })).toMatchObject({
      structuredContent: { count: 3 },
    });
  });

  it("keeps the last complete SDK metadata when a later refresh page fails", async () => {
    const { server, client } = await fixture();
    await client.listTools();
    server.setRequestHandler(ListToolsRequestSchema, async ({ params }) => {
      if (params?.cursor) throw new Error("later page unavailable");
      return { tools: [], nextCursor: "later" };
    });
    await expect(client.listTools()).rejects.toThrow("later page unavailable");
    await expect(
      client.callTool({ name: "first", arguments: { count: "invalid" } })
    ).rejects.toThrow("output schema");
  });

  it("keeps first-page task requirements after collecting later pages", async () => {
    const { server, client } = await fixture();
    server.setRequestHandler(ListToolsRequestSchema, async ({ params }) => ({
      tools: params?.cursor
        ? [{ name: "last", inputSchema: { type: "object" } }]
        : [{ ...firstTool, execution: { taskSupport: "required" } }],
      ...(params?.cursor ? {} : { nextCursor: "last" }),
    }));
    await client.listTools();
    await expect(client.callTool({ name: "first" })).rejects.toThrow(
      "requires task-based execution"
    );
    expect(await client.callTool({ name: "last" })).toMatchObject({ structuredContent: {} });
  });
});
