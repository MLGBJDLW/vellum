import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createToolRegistry, type ToolContext } from "@vellum/core";
import { afterEach, describe, expect, it } from "vitest";
import { McpCapabilityDiscovery } from "../McpCapabilityDiscovery.js";
import { McpClient as Client } from "../McpClient.js";
import type { McpConnection } from "../types.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

async function fixture(supportsTools = true) {
  const server = new Server(
    { name: "paged", version: "1" },
    { capabilities: { ...(supportsTools ? { tools: {} } : {}), resources: {}, prompts: {} } }
  );
  const client = new Client({ name: "test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  if (supportsTools) {
    server.setRequestHandler(ListToolsRequestSchema, async ({ params }) => ({
      tools: [
        {
          name: params?.cursor === undefined ? "first" : "second",
          inputSchema: { type: "object" },
        },
      ],
      ...(params?.cursor === undefined ? { nextCursor: "tools/second" } : {}),
    }));
  }
  server.setRequestHandler(ListResourcesRequestSchema, async ({ params }) => ({
    resources: [
      { uri: params?.cursor === undefined ? "file:///one" : "file:///two", name: "resource" },
    ],
    ...(params?.cursor === undefined ? { nextCursor: "resources/second" } : {}),
  }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async ({ params }) => ({
    resourceTemplates: [
      {
        uriTemplate: params?.cursor === undefined ? "file:///one/{id}" : "file:///two/{id}",
        name: "template",
      },
    ],
    ...(params?.cursor === undefined ? { nextCursor: "templates/second" } : {}),
  }));
  server.setRequestHandler(ListPromptsRequestSchema, async ({ params }) => ({
    prompts: [{ name: params?.cursor === undefined ? "first-prompt" : "second-prompt" }],
    ...(params?.cursor === undefined ? { nextCursor: "prompts/second" } : {}),
  }));
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closers.push(async () => {
    await client.close();
    await server.close();
  });
  const connection: McpConnection = {
    client,
    transport: clientTransport as McpConnection["transport"],
    server: {
      name: "paged",
      uid: "cpaged",
      config: JSON.stringify({ command: "unused", autoApprove: ["second"] }),
      statusInfo: { status: "connected" },
    },
  };
  const registry = createToolRegistry();
  const discovery = new McpCapabilityDiscovery({
    connectionProvider: {
      getConnections: () => [connection],
      getConnection: () => connection,
      isServerConnected: () => true,
    },
    toolRegistry: registry,
  });
  return { server, connection, registry, discovery };
}

const context: ToolContext = {
  workingDir: process.cwd(),
  sessionId: "test",
  messageId: "message",
  callId: "call",
  abortSignal: new AbortController().signal,
  checkPermission: async () => true,
};

describe("MCP capability discovery over SDK transports", () => {
  it("discovers resources from servers that do not advertise tools", async () => {
    const { connection, discovery, registry } = await fixture(false);
    await discovery.discoverServerCapabilities(connection);
    expect(connection.server.tools).toEqual([]);
    expect(registry.listMcpTools()).toEqual([]);
    expect(connection.server.resources).toHaveLength(2);
    expect(connection.server.resourceTemplates).toHaveLength(2);
  });

  it("discovers all tool, resource, template and prompt pages", async () => {
    const { connection, registry, discovery } = await fixture();
    await discovery.discoverServerCapabilities(connection);
    expect(connection.server.tools?.map((tool) => tool.name)).toEqual(["first", "second"]);
    expect(registry.get("mcp:cpaged/second")).toBeDefined();
    expect(connection.server.resources).toHaveLength(2);
    expect(connection.server.resourceTemplates).toHaveLength(2);
    expect(await discovery.fetchResourcesList("paged")).toHaveLength(2);
    expect((await discovery.listPrompts("paged")).map((prompt) => prompt.name)).toEqual([
      "first-prompt",
      "second-prompt",
    ]);
  });

  it("keeps tool filters and auto-approval when refreshing every page", async () => {
    const { connection, discovery } = await fixture();
    connection.server.toolFilter = { excludeTools: ["first"] };
    const tools = await discovery.fetchToolsList("paged");
    expect(tools.map((tool) => [tool.name, tool.autoApprove])).toEqual([["second", true]]);
    expect(connection.server.tools).toEqual(tools);
  });

  it("rejects a repeated cursor without replacing the last complete inventory", async () => {
    const { server, connection, discovery } = await fixture();
    await discovery.fetchToolsList("paged");
    const previous = connection.server.tools;
    let requests = 0;
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      requests++;
      return { tools: [], nextCursor: "" };
    });
    await expect(discovery.fetchToolsList("paged")).rejects.toThrow("repeated pagination cursor");
    expect(requests).toBe(2);
    expect(connection.server.tools).toBe(previous);
  });

  it("does not publish a partial inventory when a later page fails", async () => {
    const { server, connection, discovery } = await fixture();
    await discovery.fetchToolsList("paged");
    const previous = connection.server.tools;
    server.setRequestHandler(ListToolsRequestSchema, async ({ params }) => {
      if (params?.cursor) throw new Error("page unavailable");
      return { tools: [], nextCursor: "later" };
    });
    await expect(discovery.fetchToolsList("paged")).rejects.toThrow("page unavailable");
    expect(connection.server.tools).toBe(previous);
  });

  it("returns structured-only output through the actual registered tool", async () => {
    const { server, connection, discovery, registry } = await fixture();
    server.setRequestHandler(CallToolRequestSchema, async () => ({
      content: [],
      structuredContent: { count: 3 },
    }));
    await discovery.discoverServerCapabilities(connection);
    const result = await registry.get("mcp:cpaged/second")?.execute({}, context);
    expect(result).toEqual({
      success: true,
      output: { content: [], structuredContent: { count: 3 } },
    });
  });

  it("marks application errors as failed receipts with server diagnostics", async () => {
    const { server, connection, discovery, registry } = await fixture();
    server.setRequestHandler(CallToolRequestSchema, async () => ({
      content: [{ type: "text", text: "Permission denied" }],
      isError: true,
    }));
    await discovery.discoverServerCapabilities(connection);
    expect(await registry.get("mcp:cpaged/first")?.execute({}, context)).toEqual({
      success: false,
      error: "Permission denied",
    });
  });

  it("preserves resource links and existing content-only output", async () => {
    const { server, connection, discovery, registry } = await fixture();
    const content = [{ type: "resource_link" as const, uri: "file:///report", name: "Report" }];
    server.setRequestHandler(CallToolRequestSchema, async () => ({ content }));
    await discovery.discoverServerCapabilities(connection);
    expect(await registry.get("mcp:cpaged/first")?.execute({}, context)).toEqual({
      success: true,
      output: content,
    });
  });
});
