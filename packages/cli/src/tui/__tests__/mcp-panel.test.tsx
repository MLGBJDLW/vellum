/**
 * MCP panel render tests
 *
 * Verifies basic read-only status output for the MCP sidebar panel.
 */

import { createToolRegistry, type ToolExecutor } from "@vellum/core";
import { render } from "ink-testing-library";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

let mockConnections: Array<{ server: { name: string; statusInfo: unknown } }> = [];

vi.mock("@vellum/mcp", () => {
  class MockMcpHub {
    public connections = mockConnections as unknown[];

    async initialize(): Promise<void> {}

    async dispose(): Promise<void> {}
  }

  return {
    McpHub: MockMcpHub,
    createOAuthCredentialAdapter: vi.fn(),
    getProcessManager: () => ({
      onCleanup: vi.fn(),
    }),
  };
});

describe("McpPanel", () => {
  it("renders server count and MCP tool count", async () => {
    const { RootProvider, McpPanel } = await import("../index.js");

    const registry = createToolRegistry();

    registry.registerMcpTool(
      "c1a2b3",
      {
        name: "ping",
        description: "Ping",
        inputSchema: { type: "object", properties: {} },
      },
      async () => "ok"
    );

    const executor: ToolExecutor = {
      registerTool: vi.fn(),
    } as unknown as ToolExecutor;

    mockConnections = [
      { server: { name: "Server A", statusInfo: { status: "connected" } } },
      { server: { name: "Server B", statusInfo: { status: "failed", error: "boom" } } },
    ];

    const { lastFrame } = render(
      <RootProvider theme="dark" toolRegistry={registry} toolExecutor={executor}>
        <McpPanel isFocused={true} toolRegistry={registry} />
      </RootProvider>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const frame = lastFrame() ?? "";

    expect(frame).toContain("MCP");
    expect(frame).toContain("Servers: 2");
    expect(frame).toContain("MCP tools registered: 1");
    expect(frame).toContain("Last error:");

    // Footer hotkey hints (now show Ctrl/Alt alternatives)
    expect(frame).toContain("Ctrl/Alt+K");
    expect(frame).toContain("Ctrl/Alt+O");
    expect(frame).toContain("MCP");
  });
});
