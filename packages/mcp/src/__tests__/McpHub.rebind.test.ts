import { createToolRegistry, type ToolExecutor } from "@vellum/core";
import { expect, it, vi } from "vitest";
import { McpHub } from "../McpHub.js";

it("registers connected MCP tools synchronously on a replacement workspace executor", () => {
  const registry = createToolRegistry();
  registry.registerMcpTool(
    "server",
    { name: "lookup", inputSchema: { type: "object" } },
    async () => []
  );
  const oldExecutor = { registerTool: vi.fn() } as unknown as ToolExecutor;
  const nextExecutor = { registerTool: vi.fn() } as unknown as ToolExecutor;
  const hub = new McpHub({
    getMcpServersPath: async () => "unused.json",
    getSettingsDirectoryPath: async () => ".",
    clientVersion: "test",
    toolRegistry: registry,
    toolExecutor: oldExecutor,
  });
  hub.rebindToolExecutor(nextExecutor);
  expect(nextExecutor.registerTool).toHaveBeenCalledWith(registry.get("mcp:server/lookup"));
  expect(oldExecutor.registerTool).not.toHaveBeenCalled();
});
