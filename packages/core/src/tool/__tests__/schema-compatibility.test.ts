import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { DeepSeekProvider, type ProviderRegistry } from "@vellum/provider";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { bashTool } from "../../builtin/bash.js";
import { ALL_BUILTIN_TOOLS } from "../../builtin/index.js";
import { LLM } from "../../session/llm.js";
import { defineTool, ok } from "../../types/tool.js";
import { UnifiedToolContainer } from "../container.js";
import { createToolRegistry } from "../registry.js";

function invalidBounds(schema: unknown, path = "parameters"): string[] {
  if (!schema || typeof schema !== "object") return [];
  return Object.entries(schema).flatMap(([key, value]) => {
    if ((key === "exclusiveMinimum" || key === "exclusiveMaximum") && typeof value !== "number")
      return [`${path}.${key}: expected number, received ${typeof value}`];
    return invalidBounds(value, `${path}.${key}`);
  });
}

describe("tool schema wire compatibility", () => {
  it("exports the actual bash timeout using numeric JSON Schema bounds and optional defaults", () => {
    const registry = createToolRegistry();
    registry.register(bashTool);
    const schema = registry.getDefinitions()[0]?.parameters;
    expect(schema).toMatchObject({
      properties: { timeout: { type: "integer", minimum: 0 } },
      required: ["command"],
    });
    expect(invalidBounds(schema)).toEqual([]);
    expect(bashTool.definition.parameters.parse({ command: "pwd" }).timeout).toBe(0);
    expect(bashTool.definition.parameters.safeParse({ command: "pwd", timeout: 0 }).success).toBe(
      true
    );
  });

  it("exports all builtin tools consistently through both container formats", () => {
    const registry = createToolRegistry();
    const container = new UnifiedToolContainer();
    for (const tool of ALL_BUILTIN_TOOLS) registry.register(tool);
    container.registerBuiltins();
    const registryDefinitions = registry.getDefinitions();
    expect(container.getDefinitions()).toEqual(registryDefinitions);
    expect(container.getProviderToolDefinitions()).toEqual(
      registryDefinitions.map(({ name, description, parameters }) => ({
        name,
        description,
        inputSchema: parameters,
      }))
    );
    const errors = registryDefinitions.flatMap((tool) => invalidBounds(tool.parameters, tool.name));
    expect(errors).toEqual([]);
  });

  it("exports read_many_files tuples as 2020-12 prefixItems before reaching any provider", () => {
    const container = new UnifiedToolContainer();
    container.registerBuiltins();
    const schema = container
      .getProviderToolDefinitions()
      .find((tool) => tool.name === "read_many_files")?.inputSchema;
    expect(schema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        lineRange: {
          type: "array",
          prefixItems: [
            { type: "integer", exclusiveMinimum: 0 },
            { type: "integer", exclusiveMinimum: 0 },
          ],
          items: false,
          minItems: 2,
          maxItems: 2,
        },
      },
    });
  });

  it("describes accepted inputs before transforms and retains nullable and default semantics", () => {
    const registry = createToolRegistry();
    registry.register(
      defineTool({
        name: "input_contract",
        description: "Input contract fixture",
        kind: "read",
        parameters: z.object({
          value: z.string().transform((value) => value.length),
          label: z.string().nullable(),
          limit: z.number().lt(10).default(5),
        }),
        execute: async (input) => ok(input),
      })
    );
    expect(registry.getDefinitions()[0]?.parameters).toMatchObject({
      properties: {
        value: { type: "string" },
        label: { type: ["string", "null"] },
        limit: { type: "number", exclusiveMaximum: 10 },
      },
      required: ["value", "label"],
    });
  });

  it("preserves MCP schemas across registry and container instead of publishing an unrestricted record", () => {
    const registry = createToolRegistry();
    const inputSchema = {
      type: "object",
      properties: { location: { $ref: "#/$defs/location" } },
      required: ["location"],
      $defs: { location: { type: "string", pattern: "^[A-Z]{2}$" } },
    };
    registry.registerMcpTool("server", { name: "weather", inputSchema }, async () => ({}));
    expect(registry.getDefinitions()[0]?.parameters).toEqual(inputSchema);
    const container = new UnifiedToolContainer();
    container.registerTools(registry.list());
    expect(container.getProviderToolDefinitions()[0]?.inputSchema).toEqual(inputSchema);
    const exported = registry.getDefinitions()[0]?.parameters;
    if (exported) exported.properties = {};
    expect(registry.getDefinitions()[0]?.parameters).toEqual(inputSchema);
  });

  it("sends builtin schemas through LLM.stream and DeepSeek without the bash schema 400", async () => {
    let receivedTools = 0;
    const server = createServer(async (request, response) => {
      let raw = "";
      for await (const chunk of request) raw += String(chunk);
      const body = JSON.parse(raw) as {
        tools: Array<{ function: { name: string; parameters: Record<string, unknown> } }>;
      };
      const errors = body.tools.flatMap((tool) =>
        invalidBounds(tool.function.parameters, tool.function.name)
      );
      receivedTools = body.tools.length;
      if (errors.length) {
        response.writeHead(400, { "content-type": "application/json" });
        return response.end(
          JSON.stringify({
            error: {
              message: `Invalid schema for function 'bash': ${errors.join("; ")}`,
              type: "invalid_request_error",
            },
          })
        );
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Done" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const provider = new DeepSeekProvider();
      await provider.initialize({
        apiKey: "fixture-only",
        baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
      });
      LLM.initialize({ get: async () => provider } as unknown as ProviderRegistry);
      const container = new UnifiedToolContainer();
      container.registerBuiltins();
      const events = [];
      for await (const event of LLM.stream({
        providerType: "deepseek",
        model: "deepseek-flash",
        messages: [{ role: "user", content: "Inspect files" }],
        tools: container.getProviderToolDefinitions(),
      }))
        events.push(event);
      expect(events.some((event) => event.type === "error")).toBe(false);
      expect(events).toContainEqual(expect.objectContaining({ type: "text", content: "Done" }));
      expect(receivedTools).toBe(
        ALL_BUILTIN_TOOLS.filter((tool) => tool.definition.enabled !== false).length
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
