// ============================================
// T026: Unit Tests for McpHub Tool System
// ============================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpConnectionError, McpTimeoutError, McpToolError } from "../errors.js";
import type { McpConnection, McpResource, McpServer, McpTool } from "../types.js";

// Mock the MCP SDK Client
const mockListTools = vi.fn();
const mockCallTool = vi.fn();
const mockListResources = vi.fn();
const mockReadResource = vi.fn();
const mockListPrompts = vi.fn();
const mockGetPrompt = vi.fn();
const mockListResourceTemplates = vi.fn();
const mockConnect = vi.fn();
const mockClose = vi.fn();

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    listTools: mockListTools,
    callTool: mockCallTool,
    listResources: mockListResources,
    readResource: mockReadResource,
    listPrompts: mockListPrompts,
    getPrompt: mockGetPrompt,
    listResourceTemplates: mockListResourceTemplates,
    connect: mockConnect,
    close: mockClose,
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  getDefaultEnvironment: vi.fn().mockReturnValue({}),
}));

vi.mock("chokidar", () => ({
  watch: vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    access: vi.fn().mockRejectedValue(new Error("File not found")),
    readFile: vi.fn().mockResolvedValue("{}"),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

// Import after mocks are set up
import { McpHub } from "../McpHub.js";

describe("McpHub Tool System", () => {
  let hub: McpHub;

  // Helper to create a mock connected server
  const createMockConnection = (
    name: string,
    options: {
      status?: "connected" | "disconnected" | "disabled" | "failed";
      disabled?: boolean;
      timeout?: number;
      tools?: McpTool[];
      resources?: McpResource[];
      config?: Record<string, unknown>;
    } = {}
  ): McpConnection => {
    const {
      status = "connected",
      disabled = false,
      timeout = 60,
      tools = [],
      resources = [],
      config = { command: "test", autoApprove: [] },
    } = options;

    const server: McpServer = {
      name,
      config: JSON.stringify(config),
      statusInfo:
        status === "failed" ? { status: "failed", error: "Connection failed" } : { status },
      disabled,
      timeout,
      tools,
      resources,
      uid: `c${name.slice(0, 6)}`,
    };

    return {
      server,
      client: {
        listTools: mockListTools,
        callTool: mockCallTool,
        listResources: mockListResources,
        readResource: mockReadResource,
        listPrompts: mockListPrompts,
        getPrompt: mockGetPrompt,
        listResourceTemplates: mockListResourceTemplates,
        connect: mockConnect,
        close: mockClose,
      } as unknown as McpConnection["client"],
      transport: {
        start: vi.fn(),
        close: vi.fn(),
      } as unknown as McpConnection["transport"],
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    hub = new McpHub({
      getMcpServersPath: () => Promise.resolve("/tmp/mcp.json"),
      getSettingsDirectoryPath: () => Promise.resolve("/tmp"),
      clientVersion: "1.0.0",
    });
  });

  afterEach(async () => {
    await hub.dispose();
  });

  // ============================================
  // T022: Tool Discovery Tests
  // ============================================

  describe("fetchToolsList (T022)", () => {
    it("should fetch tools from a connected server", async () => {
      const mockTools = [
        { name: "tool1", description: "First tool", inputSchema: { type: "object" } },
        { name: "tool2", description: "Second tool", inputSchema: { type: "object" } },
      ];
      mockListTools.mockResolvedValue({ tools: mockTools });

      const connection = createMockConnection("test-server", {
        config: { command: "test", autoApprove: ["tool1"] },
      });
      hub.connections.push(connection);

      const result = await hub.fetchToolsList("test-server");

      expect(mockListTools).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: "tool1",
        description: "First tool",
        inputSchema: { type: "object" },
        autoApprove: true, // Should be auto-approved
      });
      expect(result[1]).toEqual({
        name: "tool2",
        description: "Second tool",
        inputSchema: { type: "object" },
        autoApprove: false, // Should not be auto-approved
      });
      // Should store on server object
      expect(connection.server.tools).toEqual(result);
    });

    it("should throw McpToolError for non-existent server", async () => {
      await expect(hub.fetchToolsList("non-existent")).rejects.toThrow(McpToolError);
      await expect(hub.fetchToolsList("non-existent")).rejects.toThrow(
        'Server "non-existent" not found'
      );
    });

    it("should throw McpToolError for disabled server", async () => {
      const connection = createMockConnection("disabled-server", {
        status: "disabled",
        disabled: true,
      });
      hub.connections.push(connection);

      await expect(hub.fetchToolsList("disabled-server")).rejects.toThrow(McpToolError);
      await expect(hub.fetchToolsList("disabled-server")).rejects.toThrow("is disabled");
    });

    it("should throw McpToolError for disconnected server", async () => {
      const connection = createMockConnection("disconnected-server", {
        status: "disconnected",
      });
      hub.connections.push(connection);

      await expect(hub.fetchToolsList("disconnected-server")).rejects.toThrow(McpToolError);
      await expect(hub.fetchToolsList("disconnected-server")).rejects.toThrow("is not connected");
    });

    it("should handle SDK errors gracefully", async () => {
      mockListTools.mockRejectedValue(new Error("SDK error"));

      const connection = createMockConnection("error-server");
      hub.connections.push(connection);

      await expect(hub.fetchToolsList("error-server")).rejects.toThrow(McpToolError);
      await expect(hub.fetchToolsList("error-server")).rejects.toThrow("Failed to fetch tools");
    });
  });

  // ============================================
  // T023: Tool Execution Tests
  // ============================================

  describe("callTool (T023)", () => {
    it("should call tool and return typed content", async () => {
      const mockResponse = {
        content: [{ type: "text", text: "Hello, World!" }],
        isError: false,
      };
      mockCallTool.mockResolvedValue(mockResponse);

      const connection = createMockConnection("test-server");
      hub.connections.push(connection);

      const result = await hub.callTool("test-server", "greet", { name: "World" });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: "greet",
        arguments: { name: "World" },
      });
      expect(result).toEqual({
        content: [{ type: "text", text: "Hello, World!" }],
        isError: false,
      });
    });

    it("should return multiple content types", async () => {
      const mockResponse = {
        content: [
          { type: "text", text: "Result" },
          { type: "image", data: "base64data", mimeType: "image/png" },
        ],
        isError: false,
      };
      mockCallTool.mockResolvedValue(mockResponse);

      const connection = createMockConnection("test-server");
      hub.connections.push(connection);

      const result = await hub.callTool("test-server", "generate", {});

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toEqual({ type: "text", text: "Result" });
      expect(result.content[1]).toEqual({
        type: "image",
        data: "base64data",
        mimeType: "image/png",
      });
    });

    it("should throw McpToolError for disabled server", async () => {
      const connection = createMockConnection("disabled-server", {
        status: "disabled",
        disabled: true,
      });
      hub.connections.push(connection);

      await expect(hub.callTool("disabled-server", "tool1", {})).rejects.toThrow(McpToolError);
      await expect(hub.callTool("disabled-server", "tool1", {})).rejects.toThrow("is disabled");
    });

    it("should throw McpToolError for non-existent server", async () => {
      await expect(hub.callTool("non-existent", "tool1", {})).rejects.toThrow(McpToolError);
      await expect(hub.callTool("non-existent", "tool1", {})).rejects.toThrow(
        'Server "non-existent" not found'
      );
    });

    it("should throw McpToolError for not connected server", async () => {
      const connection = createMockConnection("failed-server", { status: "failed" });
      hub.connections.push(connection);

      await expect(hub.callTool("failed-server", "tool1", {})).rejects.toThrow(McpToolError);
      await expect(hub.callTool("failed-server", "tool1", {})).rejects.toThrow("is not connected");
    });

    it("should handle tool execution errors", async () => {
      mockCallTool.mockRejectedValue(new Error("Tool execution failed"));

      const connection = createMockConnection("test-server");
      hub.connections.push(connection);

      await expect(hub.callTool("test-server", "failing-tool", {})).rejects.toThrow(McpToolError);
      await expect(hub.callTool("test-server", "failing-tool", {})).rejects.toThrow(
        "Tool call failed"
      );
    });

    it("should enforce timeout and throw McpTimeoutError", async () => {
      // Create a promise that never resolves
      mockCallTool.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({}), 10000))
      );

      const connection = createMockConnection("slow-server", { timeout: 0.1 }); // 100ms timeout
      hub.connections.push(connection);

      await expect(hub.callTool("slow-server", "slow-tool", {})).rejects.toThrow(McpTimeoutError);
      await expect(hub.callTool("slow-server", "slow-tool", {})).rejects.toThrow("timed out");
    }, 5000);

    it("should emit tool:called event on success", async () => {
      const mockResponse = { content: [{ type: "text", text: "ok" }], isError: false };
      mockCallTool.mockResolvedValue(mockResponse);

      const events: Array<{ event: string; data: unknown }> = [];
      const hubWithEvents = new McpHub({
        getMcpServersPath: () => Promise.resolve("/tmp/mcp.json"),
        getSettingsDirectoryPath: () => Promise.resolve("/tmp"),
        clientVersion: "1.0.0",
        onEvent: (event, data) => events.push({ event, data }),
      });

      const connection = createMockConnection("event-server");
      hubWithEvents.connections.push(connection);

      await hubWithEvents.callTool("event-server", "test-tool", {});

      expect(events).toContainEqual(
        expect.objectContaining({
          event: "tool:called",
          data: expect.objectContaining({
            serverName: "event-server",
            toolName: "test-tool",
          }),
        })
      );

      await hubWithEvents.dispose();
    });
  });

  // ============================================
  // T024: Resource Discovery and Reading Tests
  // ============================================

  describe("fetchResourcesList (T024)", () => {
    it("should fetch resources from a connected server", async () => {
      const mockResources = [
        { uri: "file:///path/to/file.txt", name: "file.txt", mimeType: "text/plain" },
        { uri: "db://table/users", name: "users", description: "User table" },
      ];
      mockListResources.mockResolvedValue({ resources: mockResources });

      const connection = createMockConnection("resource-server");
      hub.connections.push(connection);

      const result = await hub.fetchResourcesList("resource-server");

      expect(mockListResources).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        uri: "file:///path/to/file.txt",
        name: "file.txt",
        mimeType: "text/plain",
        description: undefined,
      });
      expect(result[1]).toEqual({
        uri: "db://table/users",
        name: "users",
        mimeType: undefined,
        description: "User table",
      });
      // Should store on server object
      expect(connection.server.resources).toEqual(result);
    });

    it("should throw McpConnectionError for disabled server", async () => {
      const connection = createMockConnection("disabled-server", {
        status: "disabled",
        disabled: true,
      });
      hub.connections.push(connection);

      await expect(hub.fetchResourcesList("disabled-server")).rejects.toThrow(McpConnectionError);
      await expect(hub.fetchResourcesList("disabled-server")).rejects.toThrow("is disabled");
    });

    it("should throw McpConnectionError for non-existent server", async () => {
      await expect(hub.fetchResourcesList("non-existent")).rejects.toThrow(McpConnectionError);
    });
  });

  describe("readResource (T024)", () => {
    it("should read resource content", async () => {
      const mockResponse = {
        contents: [{ uri: "file:///test.txt", mimeType: "text/plain", text: "File content" }],
      };
      mockReadResource.mockResolvedValue(mockResponse);

      const connection = createMockConnection("resource-server");
      hub.connections.push(connection);

      const result = await hub.readResource("resource-server", "file:///test.txt");

      expect(mockReadResource).toHaveBeenCalledWith({ uri: "file:///test.txt" });
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toEqual({
        uri: "file:///test.txt",
        mimeType: "text/plain",
        text: "File content",
      });
    });

    it("should read binary resource content", async () => {
      const mockResponse = {
        contents: [{ uri: "file:///image.png", mimeType: "image/png", blob: "base64data" }],
      };
      mockReadResource.mockResolvedValue(mockResponse);

      const connection = createMockConnection("resource-server");
      hub.connections.push(connection);

      const result = await hub.readResource("resource-server", "file:///image.png");

      expect(result.contents[0]).toHaveProperty("blob", "base64data");
    });

    it("should throw McpConnectionError for disabled server", async () => {
      const connection = createMockConnection("disabled-server", {
        status: "disabled",
        disabled: true,
      });
      hub.connections.push(connection);

      await expect(hub.readResource("disabled-server", "file:///test")).rejects.toThrow(
        McpConnectionError
      );
      await expect(hub.readResource("disabled-server", "file:///test")).rejects.toThrow(
        "is disabled"
      );
    });

    it("should handle read errors gracefully", async () => {
      mockReadResource.mockRejectedValue(new Error("Resource not found"));

      const connection = createMockConnection("resource-server");
      hub.connections.push(connection);

      await expect(hub.readResource("resource-server", "file:///missing")).rejects.toThrow(
        McpConnectionError
      );
      await expect(hub.readResource("resource-server", "file:///missing")).rejects.toThrow(
        "Failed to read resource"
      );
    });
  });

  // ============================================
  // T025: Prompt Discovery and Execution Tests
  // ============================================

  describe("listPrompts (T025)", () => {
    it("should list prompts from a connected server", async () => {
      const mockPrompts = [
        {
          name: "summarize",
          description: "Summarize text",
          arguments: [{ name: "text", description: "Text to summarize", required: true }],
        },
        {
          name: "translate",
          description: "Translate text",
          arguments: [
            { name: "text", required: true },
            { name: "language", required: false },
          ],
        },
      ];
      mockListPrompts.mockResolvedValue({ prompts: mockPrompts });

      const connection = createMockConnection("prompt-server");
      hub.connections.push(connection);

      const result = await hub.listPrompts("prompt-server");

      expect(mockListPrompts).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: "summarize",
        description: "Summarize text",
        arguments: [{ name: "text", description: "Text to summarize", required: true }],
      });
    });

    it("should throw McpConnectionError for disabled server", async () => {
      const connection = createMockConnection("disabled-server", {
        status: "disabled",
        disabled: true,
      });
      hub.connections.push(connection);

      await expect(hub.listPrompts("disabled-server")).rejects.toThrow(McpConnectionError);
      await expect(hub.listPrompts("disabled-server")).rejects.toThrow("is disabled");
    });

    it("should throw McpConnectionError for non-existent server", async () => {
      await expect(hub.listPrompts("non-existent")).rejects.toThrow(McpConnectionError);
    });
  });

  describe("getPrompt (T025)", () => {
    it("should get prompt and return messages", async () => {
      const mockResponse = {
        description: "Summarization prompt",
        messages: [
          { role: "user", content: { type: "text", text: "Please summarize: test content" } },
        ],
      };
      mockGetPrompt.mockResolvedValue(mockResponse);

      const connection = createMockConnection("prompt-server");
      hub.connections.push(connection);

      const result = await hub.getPrompt("prompt-server", "summarize", { text: "test content" });

      expect(mockGetPrompt).toHaveBeenCalledWith({
        name: "summarize",
        arguments: { text: "test content" },
      });
      expect(result.description).toBe("Summarization prompt");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.role).toBe("user");
    });

    it("should return assistant messages", async () => {
      const mockResponse = {
        messages: [
          { role: "user", content: { type: "text", text: "Question" } },
          { role: "assistant", content: { type: "text", text: "Answer" } },
        ],
      };
      mockGetPrompt.mockResolvedValue(mockResponse);

      const connection = createMockConnection("prompt-server");
      hub.connections.push(connection);

      const result = await hub.getPrompt("prompt-server", "qa", {});

      expect(result.messages).toHaveLength(2);
      expect(result.messages[1]?.role).toBe("assistant");
    });

    it("should throw McpConnectionError for disabled server", async () => {
      const connection = createMockConnection("disabled-server", {
        status: "disabled",
        disabled: true,
      });
      hub.connections.push(connection);

      await expect(hub.getPrompt("disabled-server", "test", {})).rejects.toThrow(
        McpConnectionError
      );
      await expect(hub.getPrompt("disabled-server", "test", {})).rejects.toThrow("is disabled");
    });

    it("should handle prompt errors gracefully", async () => {
      mockGetPrompt.mockRejectedValue(new Error("Prompt not found"));

      const connection = createMockConnection("prompt-server");
      hub.connections.push(connection);

      await expect(hub.getPrompt("prompt-server", "missing", {})).rejects.toThrow(
        McpConnectionError
      );
      await expect(hub.getPrompt("prompt-server", "missing", {})).rejects.toThrow(
        "Failed to get prompt"
      );
    });
  });

  // ============================================
  // Additional Tests: getAllTools, getAllResources
  // ============================================

  describe("getAllTools", () => {
    it("should return tools from all connected servers", () => {
      const tools1: McpTool[] = [{ name: "tool1", description: "Tool 1" }];
      const tools2: McpTool[] = [{ name: "tool2", description: "Tool 2" }];

      hub.connections.push(createMockConnection("server1", { tools: tools1 }));
      hub.connections.push(createMockConnection("server2", { tools: tools2 }));

      const result = hub.getAllTools();

      expect(result).toHaveLength(2);
      expect(result[0]?.serverName).toBe("server1");
      expect(result[0]?.name).toBe("tool1");
      expect(result[1]?.serverName).toBe("server2");
      expect(result[1]?.name).toBe("tool2");
    });

    it("should exclude tools from disconnected servers", () => {
      const tools1: McpTool[] = [{ name: "tool1" }];
      const tools2: McpTool[] = [{ name: "tool2" }];

      hub.connections.push(createMockConnection("connected", { tools: tools1 }));
      hub.connections.push(
        createMockConnection("disconnected", { tools: tools2, status: "disconnected" })
      );

      const result = hub.getAllTools();

      expect(result).toHaveLength(1);
      expect(result[0]?.serverName).toBe("connected");
    });
  });

  describe("getAllResources", () => {
    it("should return resources from all connected servers", () => {
      const resources1: McpResource[] = [{ uri: "file://1", name: "res1" }];
      const resources2: McpResource[] = [{ uri: "file://2", name: "res2" }];

      hub.connections.push(createMockConnection("server1", { resources: resources1 }));
      hub.connections.push(createMockConnection("server2", { resources: resources2 }));

      const result = hub.getAllResources();

      expect(result).toHaveLength(2);
      expect(result[0]?.serverName).toBe("server1");
      expect(result[1]?.serverName).toBe("server2");
    });
  });
});
