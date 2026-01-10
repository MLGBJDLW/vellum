/**
 * MCP wiring tests
 *
 * Ensures that the TUI-level McpProvider (via RootProvider) receives the shared
 * ToolRegistry and ToolExecutor so MCP tools are registered into the same
 * running tool system as the agent.
 */

import { createToolRegistry, type ToolExecutor, type ToolRegistry } from "@vellum/core";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

let lastMcpHubOptions: Record<string, unknown> | null = null;

vi.mock("@vellum/mcp", () => {
  class MockMcpHub {
    public connections: unknown[] = [];

    constructor(options: Record<string, unknown>) {
      lastMcpHubOptions = options;
    }

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

describe("MCP wiring", () => {
  it("passes shared ToolRegistry and ToolExecutor into McpHub", async () => {
    const { RootProvider } = await import("../index.js");

    const registry: ToolRegistry = createToolRegistry();
    const executor: ToolExecutor = {
      // The provider only forwards this reference to McpHub.
      registerTool: vi.fn(),
    } as unknown as ToolExecutor;

    lastMcpHubOptions = null;

    render(
      <RootProvider theme="dark" toolRegistry={registry} toolExecutor={executor}>
        <Text>ok</Text>
      </RootProvider>
    );

    // Allow effects to run.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lastMcpHubOptions).not.toBeNull();
    if (!lastMcpHubOptions) {
      throw new Error("Expected McpHub to be constructed");
    }

    const options = lastMcpHubOptions as unknown as {
      toolRegistry?: unknown;
      toolExecutor?: unknown;
    };

    expect(options.toolRegistry).toBe(registry);
    expect(options.toolExecutor).toBe(executor);
  });
});
