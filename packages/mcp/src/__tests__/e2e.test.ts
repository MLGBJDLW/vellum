// ============================================
// T051: McpHub End-to-End Tests
// ============================================
// Full flow: config load → connect → discover tools → register → execute → disconnect
// Uses injected mock connections to avoid real network calls.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpHub, type McpHubOptions } from "../McpHub.js";
import type { McpConnection, McpResource, McpServer, McpTool } from "../types.js";

// ============================================
// Mock Dependencies
// ============================================

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

// ============================================
// Test Helper: Create Mock Connection
// ============================================

interface MockConnectionOptions {
  status?: "connected" | "disconnected" | "disabled" | "failed";
  disabled?: boolean;
  timeout?: number;
  tools?: McpTool[];
  resources?: McpResource[];
  config?: Record<string, unknown>;
}

const createMockConnection = (
  name: string,
  hub: McpHub,
  options: MockConnectionOptions = {}
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
    statusInfo: status === "failed" ? { status: "failed", error: "Connection failed" } : { status },
    disabled,
    timeout,
    tools,
    resources,
    uid: hub.getMcpServerKey(name),
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

// ============================================
// E2E Test Suites
// ============================================

describe("McpHub E2E Tests (T051)", () => {
  let hub: McpHub;
  let events: Array<{ event: string; data: unknown }>;

  const mockTools = [
    { name: "echo", description: "Echoes input", inputSchema: { type: "object" } },
    { name: "analyze", description: "Analyzes data", inputSchema: { type: "object" } },
    { name: "transform", description: "Transforms data", inputSchema: { type: "object" } },
  ];

  const mockResources = [
    { uri: "file:///doc.txt", name: "doc.txt", mimeType: "text/plain" },
    { uri: "db://records", name: "records", mimeType: "application/json" },
  ];

  const mockPrompts = [
    {
      name: "summarize",
      description: "Summarize text",
      arguments: [{ name: "text", required: true }],
    },
    {
      name: "translate",
      description: "Translate text",
      arguments: [
        { name: "text", required: true },
        { name: "lang", required: true },
      ],
    },
  ];

  const createHub = (overrides?: Partial<McpHubOptions>): McpHub => {
    return new McpHub({
      getMcpServersPath: () => Promise.resolve("/tmp/mcp.json"),
      getSettingsDirectoryPath: () => Promise.resolve("/tmp"),
      clientVersion: "1.0.0",
      onEvent: (event, data) => events.push({ event, data }),
      ...overrides,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    events = [];

    // Default mock responses
    mockListTools.mockResolvedValue({ tools: mockTools });
    mockCallTool.mockResolvedValue({ content: [{ type: "text", text: "Result" }], isError: false });
    mockListResources.mockResolvedValue({ resources: mockResources });
    mockReadResource.mockResolvedValue({ contents: [{ uri: "file:///doc.txt", text: "Content" }] });
    mockListPrompts.mockResolvedValue({ prompts: mockPrompts });
    mockGetPrompt.mockResolvedValue({
      description: "Prompt",
      messages: [{ role: "user", content: { type: "text", text: "Msg" } }],
    });
    mockListResourceTemplates.mockResolvedValue({ resourceTemplates: [] });
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await hub?.dispose();
  });

  // ============================================
  // Complete E2E Flow Tests
  // ============================================

  describe("Complete E2E Flow", () => {
    it("should execute full lifecycle: config → connect → discover → execute → disconnect", async () => {
      hub = createHub();

      // Step 1: Config load → Connect (simulated with mock injection)
      const connection = createMockConnection("test-server", hub, {
        config: { command: "node", args: ["server.js"], autoApprove: ["echo"] },
        tools: mockTools as McpTool[],
        resources: mockResources as McpResource[],
      });
      hub.connections.push(connection);

      expect(hub.getServers()).toHaveLength(1);
      expect(hub.isServerConnected("test-server")).toBe(true);

      // Step 2: Discover tools
      const tools = await hub.fetchToolsList("test-server");
      expect(tools).toHaveLength(3);
      expect(tools.map((t) => t.name)).toContain("echo");

      // Step 3: Execute tool
      const result = await hub.callTool("test-server", "echo", { message: "hello" });
      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);

      // Verify tool:called event
      expect(events).toContainEqual(
        expect.objectContaining({
          event: "tool:called",
          data: expect.objectContaining({ serverName: "test-server", toolName: "echo" }),
        })
      );

      // Step 4: Disconnect
      await hub.dispose();
      expect(hub.connections).toHaveLength(0);
    });

    it("should support multi-server orchestration flow", async () => {
      hub = createHub();

      // Add multiple servers
      hub.connections.push(
        createMockConnection("server-a", hub, {
          tools: [{ name: "tool-a" }] as McpTool[],
          resources: [{ uri: "a://res", name: "a" }] as McpResource[],
        })
      );
      hub.connections.push(
        createMockConnection("server-b", hub, {
          tools: [{ name: "tool-b" }] as McpTool[],
          resources: [{ uri: "b://res", name: "b" }] as McpResource[],
        })
      );
      hub.connections.push(
        createMockConnection("server-c", hub, {
          tools: [{ name: "tool-c" }] as McpTool[],
          resources: [{ uri: "c://res", name: "c" }] as McpResource[],
        })
      );

      // Verify all connected
      expect(hub.getServers()).toHaveLength(3);
      expect(hub.getServers().every((s) => s.statusInfo.status === "connected")).toBe(true);

      // Get all tools across servers
      const allTools = hub.getAllTools();
      expect(allTools).toHaveLength(3);
      expect(allTools.map((t) => t.serverName).sort()).toEqual([
        "server-a",
        "server-b",
        "server-c",
      ]);

      // Get all resources across servers
      const allResources = hub.getAllResources();
      expect(allResources).toHaveLength(3);

      // Execute tool on specific server
      await hub.callTool("server-a", "tool-a", {});
      expect(events).toContainEqual(
        expect.objectContaining({
          event: "tool:called",
          data: expect.objectContaining({ serverName: "server-a" }),
        })
      );

      await hub.callTool("server-b", "tool-b", {});
      expect(events).toContainEqual(
        expect.objectContaining({
          event: "tool:called",
          data: expect.objectContaining({ serverName: "server-b" }),
        })
      );
    });

    it("should support mixed enabled/disabled server configuration", async () => {
      hub = createHub();

      hub.connections.push(createMockConnection("active", hub, { status: "connected" }));
      hub.connections.push(
        createMockConnection("disabled", hub, { status: "disabled", disabled: true })
      );

      const servers = hub.getServers();
      expect(servers).toHaveLength(2);

      const activeServer = servers.find((s) => s.name === "active");
      const disabledServer = servers.find((s) => s.name === "disabled");

      expect(activeServer?.statusInfo.status).toBe("connected");
      expect(disabledServer?.statusInfo.status).toBe("disabled");

      // Active server works
      await hub.callTool("active", "echo", {});
      expect(mockCallTool).toHaveBeenCalled();

      // Disabled server rejects
      await expect(hub.callTool("disabled", "echo", {})).rejects.toThrow("is disabled");
    });
  });

  // ============================================
  // Resource Flow Tests
  // ============================================

  describe("Resource Operations Flow", () => {
    it("should discover and read resources end-to-end", async () => {
      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      // Step 1: List resources
      const resources = await hub.fetchResourcesList("test-server");
      expect(resources).toHaveLength(2);

      // Step 2: Read first resource
      const firstResource = resources[0];
      if (!firstResource) throw new Error("Expected first resource to be defined");
      const firstUri = firstResource.uri;
      const content = await hub.readResource("test-server", firstUri);
      expect(content.contents).toHaveLength(1);
      expect(mockReadResource).toHaveBeenCalledWith({ uri: firstUri });
    });

    it("should aggregate resources from multiple servers", async () => {
      hub = createHub();

      hub.connections.push(
        createMockConnection("server-a", hub, {
          resources: [
            { uri: "file://a1", name: "a1" },
            { uri: "file://a2", name: "a2" },
          ] as McpResource[],
        })
      );
      hub.connections.push(
        createMockConnection("server-b", hub, {
          resources: [{ uri: "file://b1", name: "b1" }] as McpResource[],
        })
      );

      const allResources = hub.getAllResources();
      expect(allResources).toHaveLength(3);
      expect(allResources.filter((r) => r.serverName === "server-a")).toHaveLength(2);
      expect(allResources.filter((r) => r.serverName === "server-b")).toHaveLength(1);
    });
  });

  // ============================================
  // Prompt Flow Tests
  // ============================================

  describe("Prompt Operations Flow", () => {
    it("should discover and execute prompts end-to-end", async () => {
      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      // Step 1: List prompts
      const prompts = await hub.listPrompts("test-server");
      expect(prompts).toHaveLength(2);

      // Step 2: Execute a prompt
      const summarizePrompt = prompts.find((p) => p.name === "summarize");
      expect(summarizePrompt).toBeDefined();
      if (!summarizePrompt) throw new Error("Expected summarizePrompt to be defined");

      const result = await hub.getPrompt("test-server", summarizePrompt.name, {
        text: "Test content",
      });
      expect(result.messages).toHaveLength(1);
      expect(mockGetPrompt).toHaveBeenCalledWith({
        name: "summarize",
        arguments: { text: "Test content" },
      });
    });
  });

  // ============================================
  // Error Recovery Tests
  // ============================================

  describe("Error Recovery Flow", () => {
    it("should handle tool call failure gracefully", async () => {
      mockCallTool.mockRejectedValueOnce(new Error("Tool execution failed"));

      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      // First call fails
      await expect(hub.callTool("test-server", "echo", {})).rejects.toThrow("Tool call failed");

      // Subsequent call succeeds (mock reset to default)
      mockCallTool.mockResolvedValueOnce({
        content: [{ type: "text", text: "Success" }],
        isError: false,
      });
      const result = await hub.callTool("test-server", "echo", {});
      expect(result.isError).toBe(false);
    });

    it("should handle resource read failure gracefully", async () => {
      mockReadResource.mockRejectedValueOnce(new Error("Resource unavailable"));

      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      await expect(hub.readResource("test-server", "file:///missing")).rejects.toThrow();

      // Subsequent read succeeds
      mockReadResource.mockResolvedValueOnce({
        contents: [{ uri: "file:///doc.txt", text: "Found" }],
      });
      const result = await hub.readResource("test-server", "file:///doc.txt");
      expect(result.contents).toHaveLength(1);
    });

    it("should handle operation on failed server", async () => {
      hub = createHub();
      hub.connections.push(createMockConnection("failed-server", hub, { status: "failed" }));

      await expect(hub.callTool("failed-server", "echo", {})).rejects.toThrow("not connected");
      await expect(hub.fetchResourcesList("failed-server")).rejects.toThrow("not connected");
      await expect(hub.listPrompts("failed-server")).rejects.toThrow("not connected");
    });
  });

  // ============================================
  // UID Consistency Tests
  // ============================================

  describe("UID Consistency", () => {
    it("should maintain consistent UIDs for servers", async () => {
      hub = createHub();

      // Add server
      hub.connections.push(createMockConnection("test-server", hub));

      const uid1 = hub.getMcpServerKey("test-server");
      const uid2 = hub.getMcpServerKey("test-server");

      expect(uid1).toBe(uid2);
      expect(/^c[a-z0-9]{6}$/.test(uid1)).toBe(true);
    });

    it("should support reverse UID lookup", async () => {
      hub = createHub();

      const uid = hub.getMcpServerKey("my-server");
      const name = McpHub.getMcpServerByKey(uid);

      expect(name).toBe("my-server");
    });

    it("should assign unique UIDs to different servers", async () => {
      hub = createHub();

      hub.connections.push(createMockConnection("server-a", hub));
      hub.connections.push(createMockConnection("server-b", hub));
      hub.connections.push(createMockConnection("server-c", hub));

      const servers = hub.getServers();
      const uids = servers.map((s) => s.uid);

      // All unique
      expect(new Set(uids).size).toBe(3);

      // All valid format
      expect(uids.every((uid) => uid !== undefined && /^c[a-z0-9]{6}$/.test(uid))).toBe(true);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe("Edge Cases", () => {
    it("should handle empty server list", async () => {
      hub = createHub();

      expect(hub.getServers()).toHaveLength(0);
      expect(hub.getAllTools()).toHaveLength(0);
      expect(hub.getAllResources()).toHaveLength(0);
    });

    it("should handle non-existent server operations", async () => {
      hub = createHub();

      await expect(hub.callTool("nonexistent", "tool", {})).rejects.toThrow("not found");
      await expect(hub.fetchResourcesList("nonexistent")).rejects.toThrow("not found");
      await expect(hub.listPrompts("nonexistent")).rejects.toThrow("not found");
    });

    it("should reject operations on disposed hub", async () => {
      hub = createHub();
      await hub.dispose();

      await expect(hub.initialize()).rejects.toThrow("disposed");
    });

    it("should handle server with empty capabilities", async () => {
      hub = createHub();
      hub.connections.push(
        createMockConnection("empty-server", hub, {
          tools: [],
          resources: [],
        })
      );

      const server = hub.getServer("empty-server");
      expect(server).toBeDefined();
      expect(server?.tools).toHaveLength(0);
      expect(server?.resources).toHaveLength(0);
    });

    it("should handle rapid sequential operations", async () => {
      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      // Rapid sequential calls
      const promises = [
        hub.callTool("test-server", "echo", { id: 1 }),
        hub.callTool("test-server", "echo", { id: 2 }),
        hub.callTool("test-server", "echo", { id: 3 }),
        hub.callTool("test-server", "echo", { id: 4 }),
        hub.callTool("test-server", "echo", { id: 5 }),
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      expect(results.every((r) => r.isError === false)).toBe(true);
      expect(mockCallTool).toHaveBeenCalledTimes(5);
    });

    it("should handle concurrent resource reads", async () => {
      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      const promises = [
        hub.readResource("test-server", "file:///a"),
        hub.readResource("test-server", "file:///b"),
        hub.readResource("test-server", "file:///c"),
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      expect(mockReadResource).toHaveBeenCalledTimes(3);
    });
  });

  // ============================================
  // Tool Aggregation Tests
  // ============================================

  describe("Tool Aggregation", () => {
    it("should correctly attribute tools to servers", async () => {
      hub = createHub();

      hub.connections.push(
        createMockConnection("llm-tools", hub, {
          tools: [
            { name: "chat", description: "Chat completion" },
            { name: "embed", description: "Embeddings" },
          ] as McpTool[],
        })
      );
      hub.connections.push(
        createMockConnection("code-tools", hub, {
          tools: [
            { name: "lint", description: "Lint code" },
            { name: "format", description: "Format code" },
          ] as McpTool[],
        })
      );

      const allTools = hub.getAllTools();
      expect(allTools).toHaveLength(4);

      const llmTools = allTools.filter((t) => t.serverName === "llm-tools");
      const codeTools = allTools.filter((t) => t.serverName === "code-tools");

      expect(llmTools.map((t) => t.name).sort()).toEqual(["chat", "embed"]);
      expect(codeTools.map((t) => t.name).sort()).toEqual(["format", "lint"]);
    });

    it("should handle autoApprove configuration", async () => {
      hub = createHub();
      hub.connections.push(
        createMockConnection("test-server", hub, {
          config: { command: "node", autoApprove: ["echo", "analyze"] },
        })
      );

      const tools = await hub.fetchToolsList("test-server");

      const echoTool = tools.find((t) => t.name === "echo");
      const analyzeTool = tools.find((t) => t.name === "analyze");
      const transformTool = tools.find((t) => t.name === "transform");

      expect(echoTool?.autoApprove).toBe(true);
      expect(analyzeTool?.autoApprove).toBe(true);
      expect(transformTool?.autoApprove).toBe(false);
    });
  });
});
