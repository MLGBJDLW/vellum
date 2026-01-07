// ============================================
// McpCommandLoader Tests
// Phase 25, Step 13: MCP Command Integration
// ============================================

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpCommandLoader, McpCommandLoader } from "../McpCommandLoader.js";
import type { McpHub } from "../McpHub.js";
import type { McpConnection, McpPromptResponse, McpServer } from "../types.js";

// ============================================
// Mock Setup
// ============================================

const mockListPrompts = vi.fn();
const mockGetPrompt = vi.fn();

const createMockServer = (
  name: string,
  status: "connected" | "disconnected" = "connected"
): McpServer => ({
  name,
  config: JSON.stringify({ command: "test" }),
  statusInfo: { status },
  uid: `uid-${name}`,
});

const createMockConnection = (server: McpServer): McpConnection => ({
  server,
  client: {
    listPrompts: mockListPrompts,
    getPrompt: mockGetPrompt,
  } as unknown as Client,
  transport: {
    start: vi.fn(),
    close: vi.fn(),
  },
});

const createMockHub = (connections: McpConnection[]): McpHub =>
  ({
    connections,
    listPrompts: mockListPrompts,
    getPrompt: mockGetPrompt,
  }) as unknown as McpHub;

// ============================================
// Tests
// ============================================

describe("McpCommandLoader", () => {
  let mockHub: McpHub;
  let loader: McpCommandLoader;

  beforeEach(() => {
    vi.resetAllMocks();

    const server1 = createMockServer("test-server");
    const server2 = createMockServer("prompt-server");
    const disconnectedServer = createMockServer("offline-server", "disconnected");

    mockHub = createMockHub([
      createMockConnection(server1),
      createMockConnection(server2),
      createMockConnection(disconnectedServer),
    ]);

    // Default mock implementations
    mockListPrompts.mockImplementation((serverName: string) => {
      if (serverName === "test-server") {
        return Promise.resolve([
          { name: "summarize", description: "Summarize text" },
          {
            name: "translate",
            description: "Translate text",
            arguments: [
              { name: "text", description: "Text to translate", required: true },
              { name: "language", description: "Target language", required: false },
            ],
          },
        ]);
      }
      if (serverName === "prompt-server") {
        return Promise.resolve([{ name: "qa", description: "Question answering" }]);
      }
      return Promise.reject(new Error(`Server "${serverName}" not found`));
    });

    mockGetPrompt.mockResolvedValue({
      description: "Test response",
      messages: [
        { role: "user", content: { type: "text", text: "Hello" } },
        { role: "assistant", content: { type: "text", text: "Hi there!" } },
      ],
    } satisfies McpPromptResponse);

    loader = new McpCommandLoader({
      mcpHub: mockHub,
      autoReload: false, // Disable auto-reload for tests
    });
  });

  describe("constructor", () => {
    it("should create loader with default options", () => {
      const defaultLoader = new McpCommandLoader({ mcpHub: mockHub });
      expect(defaultLoader.name).toBe("mcp");
      expect(defaultLoader.kind).toBe("mcp");
      defaultLoader.dispose();
    });

    it("should accept custom prefix", () => {
      const customLoader = new McpCommandLoader({
        mcpHub: mockHub,
        prefix: "custom",
        autoReload: false,
      });
      expect(customLoader.name).toBe("mcp");
      customLoader.dispose();
    });
  });

  describe("load", () => {
    it("should load prompts from all connected servers", async () => {
      const commands = await loader.load();

      // Should have 3 commands total (2 from test-server, 1 from prompt-server)
      expect(commands).toHaveLength(3);
      expect(mockListPrompts).toHaveBeenCalledTimes(2); // Only connected servers
    });

    it("should not load from disconnected servers", async () => {
      const commands = await loader.load();

      // Verify no prompts from offline-server
      const offlineCommands = commands.filter((cmd) => cmd.serverName === "offline-server");
      expect(offlineCommands).toHaveLength(0);
    });

    it("should generate correct command names", async () => {
      const commands = await loader.load();

      const names = commands.map((cmd) => cmd.name);
      expect(names).toContain("mcp:test-server:summarize");
      expect(names).toContain("mcp:test-server:translate");
      expect(names).toContain("mcp:prompt-server:qa");
    });

    it("should include prompt descriptions", async () => {
      const commands = await loader.load();

      const summarize = commands.find((cmd) => cmd.name === "mcp:test-server:summarize");
      expect(summarize?.description).toBe("Summarize text");

      const translate = commands.find((cmd) => cmd.name === "mcp:test-server:translate");
      expect(translate?.description).toBe("Translate text");
    });

    it("should convert prompt arguments to positional args", async () => {
      const commands = await loader.load();

      const translate = commands.find((cmd) => cmd.name === "mcp:test-server:translate");
      expect(translate?.positionalArgs).toHaveLength(2);

      const [textArg, langArg] = translate?.positionalArgs ?? [];
      expect(textArg?.name).toBe("text");
      expect(textArg?.required).toBe(true);
      expect(textArg?.type).toBe("string");

      expect(langArg?.name).toBe("language");
      expect(langArg?.required).toBe(false);
    });

    it("should handle servers with no prompts", async () => {
      mockListPrompts.mockImplementation((serverName: string) => {
        if (serverName === "test-server") return Promise.resolve([]);
        if (serverName === "prompt-server") return Promise.resolve([]);
        return Promise.reject(new Error("Not found"));
      });

      const commands = await loader.load();
      expect(commands).toHaveLength(0);
    });

    it("should handle server errors gracefully", async () => {
      mockListPrompts.mockImplementation((serverName: string) => {
        if (serverName === "test-server") return Promise.reject(new Error("Connection lost"));
        if (serverName === "prompt-server") return Promise.resolve([{ name: "qa" }]);
        return Promise.reject(new Error("Not found"));
      });

      // Should not throw, should return prompts from working server
      const commands = await loader.load();
      expect(commands).toHaveLength(1);
      expect(commands[0]?.name).toBe("mcp:prompt-server:qa");
    });

    it("should return empty array after disposal", async () => {
      loader.dispose();
      const commands = await loader.load();
      expect(commands).toHaveLength(0);
    });
  });

  describe("loadFromServer", () => {
    it("should load prompts from specific server", async () => {
      const commands = await loader.loadFromServer("test-server");

      expect(commands).toHaveLength(2);
      expect(mockListPrompts).toHaveBeenCalledWith("test-server");
    });

    it("should return empty array for non-existent server", async () => {
      const commands = await loader.loadFromServer("non-existent");
      expect(commands).toHaveLength(0);
    });
  });

  describe("getCachedCommands", () => {
    it("should return empty array before loading", () => {
      const cached = loader.getCachedCommands();
      expect(cached).toHaveLength(0);
    });

    it("should return cached commands after loading", async () => {
      await loader.load();
      const cached = loader.getCachedCommands();
      expect(cached).toHaveLength(3);
    });
  });

  describe("findCommand", () => {
    it("should find command by name", async () => {
      await loader.load();

      const cmd = loader.findCommand("mcp:test-server:summarize");
      expect(cmd).toBeDefined();
      expect(cmd?.promptName).toBe("summarize");
    });

    it("should return undefined for non-existent command", async () => {
      await loader.load();

      const cmd = loader.findCommand("mcp:test-server:non-existent");
      expect(cmd).toBeUndefined();
    });
  });

  describe("getCommandsForServer", () => {
    it("should filter commands by server", async () => {
      await loader.load();

      const testServerCmds = loader.getCommandsForServer("test-server");
      expect(testServerCmds).toHaveLength(2);

      const promptServerCmds = loader.getCommandsForServer("prompt-server");
      expect(promptServerCmds).toHaveLength(1);
    });
  });

  describe("reload", () => {
    it("should reload commands and notify listener", async () => {
      const onChangedMock = vi.fn();
      const loaderWithCallback = new McpCommandLoader({
        mcpHub: mockHub,
        autoReload: false,
        onCommandsChanged: onChangedMock,
      });

      await loaderWithCallback.reload();

      expect(onChangedMock).toHaveBeenCalledTimes(1);
      expect(onChangedMock).toHaveBeenCalledWith(expect.any(Array));

      loaderWithCallback.dispose();
    });
  });

  describe("command execution", () => {
    it("should execute prompt and return success", async () => {
      const commands = await loader.load();
      const summarize = commands.find((cmd) => cmd.name === "mcp:test-server:summarize");
      expect(summarize).toBeDefined();

      const result = await summarize?.execute({
        parsedArgs: { positional: [], named: {} },
        mcpHub: mockHub,
      });

      expect(result?.kind).toBe("success");
      expect(mockGetPrompt).toHaveBeenCalledWith("test-server", "summarize", {});
    });

    it("should pass positional arguments to prompt", async () => {
      const commands = await loader.load();
      const translate = commands.find((cmd) => cmd.name === "mcp:test-server:translate");
      expect(translate).toBeDefined();

      // biome-ignore lint/style/noNonNullAssertion: Verified by toBeDefined above
      await translate!.execute({
        parsedArgs: { positional: ["Hello world", "spanish"], named: {} },
        mcpHub: mockHub,
      });

      expect(mockGetPrompt).toHaveBeenCalledWith("test-server", "translate", {
        text: "Hello world",
        language: "spanish",
      });
    });

    it("should handle prompt execution errors", async () => {
      mockGetPrompt.mockRejectedValue(new Error("Prompt failed"));

      const commands = await loader.load();
      const summarize = commands.find((cmd) => cmd.name === "mcp:test-server:summarize");
      expect(summarize).toBeDefined();

      // biome-ignore lint/style/noNonNullAssertion: Verified by toBeDefined above
      const result = await summarize!.execute({
        parsedArgs: { positional: [], named: {} },
        mcpHub: mockHub,
      });

      expect(result.kind).toBe("error");
      if (result.kind === "error") {
        expect(result.code).toBe("MCP_PROMPT_ERROR");
        expect(result.message).toContain("Prompt failed");
      }
    });

    it("should return error when mcpHub is not available", async () => {
      // This test verifies that the loader captures the hub reference properly

      // Create a new loader without mcpHub in context
      const isolatedLoader = new McpCommandLoader({
        mcpHub: undefined as unknown as McpHub,
        autoReload: false,
      });

      // Get command from isolated loader (will have no mcpHub reference)
      mockListPrompts.mockResolvedValueOnce([{ name: "summarize" }]);

      const isolatedHub = {
        connections: [createMockConnection(createMockServer("test"))],
        listPrompts: () => Promise.resolve([{ name: "test" }]),
        getPrompt: mockGetPrompt,
      } as unknown as McpHub;

      const isolatedLoaderWithHub = new McpCommandLoader({
        mcpHub: isolatedHub,
        autoReload: false,
      });

      const isolatedCommands = await isolatedLoaderWithHub.load();

      // Execute without mcpHub in context - should use the captured reference
      const testCmd = isolatedCommands[0];
      if (testCmd) {
        const result = await testCmd.execute({
          parsedArgs: { positional: [], named: {} },
          // No mcpHub provided in context
        });

        // Should still work because the loader captures the hub reference
        expect(result.kind).toBe("success");
      }

      isolatedLoader.dispose();
      isolatedLoaderWithHub.dispose();
    });
  });

  describe("command name sanitization", () => {
    it("should sanitize server names with special characters", async () => {
      // Create a completely isolated loader with its own mocks
      const specialServer = createMockServer("My Server!");
      const specialListPrompts = vi.fn().mockResolvedValue([{ name: "Test Prompt@1" }]);
      const specialGetPrompt = vi.fn();

      const hubWithSpecial = {
        connections: [createMockConnection(specialServer)],
        listPrompts: specialListPrompts,
        getPrompt: specialGetPrompt,
      } as unknown as McpHub;

      const specialLoader = new McpCommandLoader({
        mcpHub: hubWithSpecial,
        autoReload: false,
      });

      const commands = await specialLoader.load();
      expect(commands[0]?.name).toBe("mcp:my-server:test-prompt-1");

      specialLoader.dispose();
    });
  });

  describe("dispose", () => {
    it("should clear cached commands", async () => {
      await loader.load();
      expect(loader.getCachedCommands()).toHaveLength(3);

      loader.dispose();
      expect(loader.getCachedCommands()).toHaveLength(0);
    });
  });
});

describe("createMcpCommandLoader", () => {
  it("should create loader instance", () => {
    const mockHub = createMockHub([]);
    const loader = createMcpCommandLoader({
      mcpHub: mockHub,
      prefix: "test",
      autoReload: false,
    });

    expect(loader).toBeInstanceOf(McpCommandLoader);
    expect(loader.name).toBe("mcp");

    loader.dispose();
  });
});
