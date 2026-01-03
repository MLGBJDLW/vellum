// ============================================
// T050: McpHub Integration Tests
// ============================================
// These tests use injected mock connections to test McpHub functionality
// without relying on actual MCP server processes.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpHub, type McpHubOptions } from "../McpHub.js";
import type { McpConnection, McpResource, McpServer, McpTool } from "../types.js";

// ============================================
// Mock MCP SDK and Dependencies
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
// Test Suites
// ============================================

describe("McpHub Integration Tests (T050)", () => {
  let hub: McpHub;
  let events: Array<{ event: string; data: unknown }>;

  const createHub = (overrides?: Partial<McpHubOptions>): McpHub => {
    return new McpHub({
      getMcpServersPath: () => Promise.resolve("/tmp/mcp.json"),
      getSettingsDirectoryPath: () => Promise.resolve("/tmp"),
      clientVersion: "1.0.0",
      onEvent: (event, data) => events.push({ event, data }),
      ...overrides,
    });
  };

  // Mock tools/resources/prompts data
  const mockTools = [
    { name: "echo", description: "Echoes the input", inputSchema: { type: "object" } },
    { name: "calculate", description: "Performs calculations", inputSchema: { type: "object" } },
  ];

  const mockResources = [
    { uri: "file:///test.txt", name: "test.txt", mimeType: "text/plain" },
    { uri: "db://users", name: "users", mimeType: "application/json" },
  ];

  const mockPrompts = [
    {
      name: "summarize",
      description: "Summarize text",
      arguments: [{ name: "text", required: true }],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    events = [];

    // Setup default mock responses
    mockListTools.mockResolvedValue({ tools: mockTools });
    mockCallTool.mockResolvedValue({
      content: [{ type: "text", text: "Echo: test" }],
      isError: false,
    });
    mockListResources.mockResolvedValue({ resources: mockResources });
    mockReadResource.mockResolvedValue({
      contents: [{ uri: "file:///test.txt", mimeType: "text/plain", text: "File content" }],
    });
    mockListPrompts.mockResolvedValue({ prompts: mockPrompts });
    mockGetPrompt.mockResolvedValue({
      description: "Summarize text",
      messages: [{ role: "user", content: { type: "text", text: "Summary" } }],
    });
    mockListResourceTemplates.mockResolvedValue({ resourceTemplates: [] });
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await hub?.dispose();
  });

  // ============================================
  // Connection Lifecycle Tests
  // ============================================

  describe("Connection Lifecycle", () => {
    it("should manage server connection states", async () => {
      hub = createHub();

      // Add mock connection directly
      const connection = createMockConnection("test-server", hub, {
        status: "connected",
        tools: mockTools as McpTool[],
        resources: mockResources as McpResource[],
      });
      hub.connections.push(connection);

      const servers = hub.getServers();
      expect(servers).toHaveLength(1);
      expect(servers[0]?.name).toBe("test-server");
      expect(servers[0]?.statusInfo.status).toBe("connected");
    });

    it("should handle multiple servers", async () => {
      hub = createHub();

      hub.connections.push(createMockConnection("server-a", hub, { status: "connected" }));
      hub.connections.push(createMockConnection("server-b", hub, { status: "connected" }));
      hub.connections.push(createMockConnection("server-c", hub, { status: "connected" }));

      const servers = hub.getServers();
      expect(servers).toHaveLength(3);
      expect(servers.map((s) => s.name).sort()).toEqual(["server-a", "server-b", "server-c"]);
      expect(servers.every((s) => s.statusInfo.status === "connected")).toBe(true);
    });

    it("should identify disabled servers", async () => {
      hub = createHub();

      hub.connections.push(createMockConnection("enabled-server", hub, { status: "connected" }));
      hub.connections.push(
        createMockConnection("disabled-server", hub, { status: "disabled", disabled: true })
      );

      const servers = hub.getServers();
      expect(servers).toHaveLength(2);

      const enabledServer = servers.find((s) => s.name === "enabled-server");
      const disabledServer = servers.find((s) => s.name === "disabled-server");

      expect(enabledServer?.statusInfo.status).toBe("connected");
      expect(disabledServer?.statusInfo.status).toBe("disabled");
      expect(disabledServer?.disabled).toBe(true);
    });

    it("should cleanup on dispose", async () => {
      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      expect(hub.getServers()).toHaveLength(1);

      await hub.dispose();

      expect(hub.connections).toHaveLength(0);
    });

    it("should check server connection status", async () => {
      hub = createHub();

      hub.connections.push(createMockConnection("connected-server", hub, { status: "connected" }));
      hub.connections.push(createMockConnection("failed-server", hub, { status: "failed" }));

      expect(hub.isServerConnected("connected-server")).toBe(true);
      expect(hub.isServerConnected("failed-server")).toBe(false);
      expect(hub.isServerConnected("nonexistent")).toBe(false);
    });
  });

  // ============================================
  // Tool Integration Tests
  // ============================================

  describe("Tool Operations", () => {
    it("should call tool and receive response", async () => {
      hub = createHub();
      const connection = createMockConnection("test-server", hub, {
        config: { command: "test", autoApprove: [] },
      });
      hub.connections.push(connection);

      const result = await hub.callTool("test-server", "echo", { message: "test message" });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: "echo",
        arguments: { message: "test message" },
      });
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: "text", text: "Echo: test" });
      expect(result.isError).toBe(false);

      // Verify tool:called event
      expect(events).toContainEqual(
        expect.objectContaining({
          event: "tool:called",
          data: expect.objectContaining({ serverName: "test-server", toolName: "echo" }),
        })
      );
    });

    it("should fetch tools list with autoApprove mapping", async () => {
      hub = createHub();
      const connection = createMockConnection("test-server", hub, {
        config: { command: "test", autoApprove: ["echo"] },
      });
      hub.connections.push(connection);

      const tools = await hub.fetchToolsList("test-server");

      expect(tools).toHaveLength(2);

      const echoTool = tools.find((t) => t.name === "echo");
      const calcTool = tools.find((t) => t.name === "calculate");

      expect(echoTool?.autoApprove).toBe(true);
      expect(calcTool?.autoApprove).toBe(false);
    });

    it("should get all tools from multiple servers", async () => {
      hub = createHub();

      hub.connections.push(
        createMockConnection("server-a", hub, {
          tools: [{ name: "tool-a1" }, { name: "tool-a2" }] as McpTool[],
        })
      );
      hub.connections.push(
        createMockConnection("server-b", hub, {
          tools: [{ name: "tool-b1" }, { name: "tool-b2" }] as McpTool[],
        })
      );

      const allTools = hub.getAllTools();

      expect(allTools).toHaveLength(4);
      expect(allTools.filter((t) => t.serverName === "server-a")).toHaveLength(2);
      expect(allTools.filter((t) => t.serverName === "server-b")).toHaveLength(2);
    });

    it("should handle tool call errors gracefully", async () => {
      mockCallTool.mockRejectedValueOnce(new Error("Tool execution failed"));

      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      await expect(hub.callTool("test-server", "unknown-tool", {})).rejects.toThrow(
        "Tool call failed"
      );
    });

    it("should reject tool calls on disabled servers", async () => {
      hub = createHub();
      hub.connections.push(
        createMockConnection("disabled-server", hub, {
          status: "disabled",
          disabled: true,
        })
      );

      await expect(hub.callTool("disabled-server", "echo", {})).rejects.toThrow("is disabled");
    });
  });

  // ============================================
  // Resource Integration Tests
  // ============================================

  describe("Resource Operations", () => {
    it("should list resources from server", async () => {
      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      const resources = await hub.fetchResourcesList("test-server");

      expect(resources).toHaveLength(2);
      expect(resources[0]?.uri).toBe("file:///test.txt");
      expect(resources[0]?.name).toBe("test.txt");
    });

    it("should read resource content", async () => {
      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      const result = await hub.readResource("test-server", "file:///test.txt");

      expect(mockReadResource).toHaveBeenCalledWith({ uri: "file:///test.txt" });
      expect(result.contents).toHaveLength(1);
      expect((result.contents[0] as { text: string }).text).toBe("File content");
    });

    it("should get all resources from multiple servers", async () => {
      hub = createHub();

      hub.connections.push(
        createMockConnection("server-a", hub, {
          resources: [{ uri: "file://a", name: "a" }] as McpResource[],
        })
      );
      hub.connections.push(
        createMockConnection("server-b", hub, {
          resources: [{ uri: "file://b", name: "b" }] as McpResource[],
        })
      );

      const allResources = hub.getAllResources();

      expect(allResources).toHaveLength(2);
      expect(allResources.map((r) => r.serverName).sort()).toEqual(["server-a", "server-b"]);
    });
  });

  // ============================================
  // Prompt Integration Tests
  // ============================================

  describe("Prompt Operations", () => {
    it("should list prompts from server", async () => {
      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      const prompts = await hub.listPrompts("test-server");

      expect(prompts).toHaveLength(1);
      expect(prompts[0]?.name).toBe("summarize");
      expect(prompts[0]?.description).toBe("Summarize text");
    });

    it("should get prompt with arguments", async () => {
      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      const result = await hub.getPrompt("test-server", "summarize", { text: "Test content" });

      expect(mockGetPrompt).toHaveBeenCalledWith({
        name: "summarize",
        arguments: { text: "Test content" },
      });
      expect(result.description).toBe("Summarize text");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.role).toBe("user");
    });

    it("should reject prompts on disabled servers", async () => {
      hub = createHub();
      hub.connections.push(
        createMockConnection("disabled-server", hub, {
          status: "disabled",
          disabled: true,
        })
      );

      await expect(hub.listPrompts("disabled-server")).rejects.toThrow("is disabled");
    });
  });

  // ============================================
  // Config Change Detection Tests
  // ============================================

  describe("Configuration Management", () => {
    it("should detect config changes requiring restart", () => {
      hub = createHub();

      const oldConfig = { command: "node", args: ["old.js"] };
      const newConfig = { command: "python", args: ["new.py"] };

      expect(hub.configsRequireRestart(oldConfig, newConfig)).toBe(true);
    });

    it("should detect config changes not requiring restart", () => {
      hub = createHub();

      const oldConfig = { command: "node", args: ["test.js"], timeout: 30 };
      const newConfig = { command: "node", args: ["test.js"], timeout: 60 };

      expect(hub.configsRequireRestart(oldConfig, newConfig)).toBe(false);
    });

    it("should detect disabled state changes", () => {
      hub = createHub();

      const oldConfig = { command: "node", args: ["test.js"], disabled: false };
      const newConfig = { command: "node", args: ["test.js"], disabled: true };

      expect(hub.configsRequireRestart(oldConfig, newConfig)).toBe(true);
    });
  });

  // ============================================
  // Server UID Tests
  // ============================================

  describe("Server UID Management", () => {
    it("should assign unique UIDs to servers", async () => {
      hub = createHub();

      hub.connections.push(createMockConnection("server-a", hub));
      hub.connections.push(createMockConnection("server-b", hub));

      const servers = hub.getServers();
      const uids = servers.map((s) => s.uid);

      // All UIDs should be defined
      expect(uids.every((uid) => uid !== undefined)).toBe(true);

      // All UIDs should be unique
      expect(new Set(uids).size).toBe(uids.length);
    });

    it("should generate UIDs with correct format", () => {
      hub = createHub();

      const uid = hub.getMcpServerKey("test-server");

      // UIDs should follow c + 6 alphanumeric pattern
      expect(/^c[a-z0-9]{6}$/.test(uid)).toBe(true);
    });

    it("should maintain UID consistency for same server", () => {
      hub = createHub();

      const uid1 = hub.getMcpServerKey("test-server");
      const uid2 = hub.getMcpServerKey("test-server");

      expect(uid1).toBe(uid2);
    });

    it("should allow reverse lookup by UID", () => {
      hub = createHub();

      const uid = hub.getMcpServerKey("test-server");
      const resolvedName = McpHub.getMcpServerByKey(uid);

      expect(resolvedName).toBe("test-server");
    });

    it("should return undefined for unknown UID", () => {
      const resolvedName = McpHub.getMcpServerByKey("cunknown");
      expect(resolvedName).toBeUndefined();
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================

  describe("Error Handling", () => {
    it("should throw on operations for non-existent servers", async () => {
      hub = createHub();

      await expect(hub.callTool("nonexistent", "tool", {})).rejects.toThrow("not found");
      await expect(hub.fetchResourcesList("nonexistent")).rejects.toThrow("not found");
      await expect(hub.listPrompts("nonexistent")).rejects.toThrow("not found");
    });

    it("should throw on disposed hub operations", async () => {
      hub = createHub();
      await hub.dispose();

      await expect(hub.initialize()).rejects.toThrow("disposed");
    });

    it("should handle failed server status", async () => {
      hub = createHub();
      hub.connections.push(createMockConnection("failed-server", hub, { status: "failed" }));

      await expect(hub.callTool("failed-server", "tool", {})).rejects.toThrow("not connected");
    });
  });

  // ============================================
  // Event Emission Tests
  // ============================================

  describe("Event Emission", () => {
    it("should emit tool:called event on success", async () => {
      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      await hub.callTool("test-server", "echo", { message: "test" });

      expect(events).toContainEqual(
        expect.objectContaining({
          event: "tool:called",
          data: expect.objectContaining({ serverName: "test-server", toolName: "echo" }),
        })
      );
    });

    it("should include duration in tool:called events", async () => {
      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      await hub.callTool("test-server", "echo", {});

      const toolEvent = events.find((e) => e.event === "tool:called");
      expect(toolEvent).toBeDefined();
      expect((toolEvent?.data as { duration: number }).duration).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================
  // Integration Flow Tests
  // ============================================

  describe("Integration Flows", () => {
    it("should support full tool discovery and execution flow", async () => {
      hub = createHub();
      const connection = createMockConnection("test-server", hub, {
        config: { command: "node", args: ["test.js"], autoApprove: ["echo"] },
      });
      hub.connections.push(connection);

      // Step 1: Discover tools
      const tools = await hub.fetchToolsList("test-server");
      expect(tools.length).toBeGreaterThan(0);

      // Step 2: Call a discovered tool
      const echoTool = tools.find((t) => t.name === "echo");
      expect(echoTool).toBeDefined();
      expect(echoTool?.autoApprove).toBe(true);

      const result = await hub.callTool("test-server", "echo", { message: "hello" });
      expect(result.isError).toBe(false);

      // Verify events
      expect(events.some((e) => e.event === "tool:called")).toBe(true);
    });

    it("should support resource discovery and read flow", async () => {
      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      // Step 1: Discover resources
      const resources = await hub.fetchResourcesList("test-server");
      expect(resources.length).toBeGreaterThan(0);

      // Step 2: Read a discovered resource
      const firstResource = resources[0];
      expect(firstResource).toBeDefined();
      if (!firstResource) throw new Error("Expected firstResource to be defined");

      const content = await hub.readResource("test-server", firstResource.uri);
      expect(content.contents.length).toBeGreaterThan(0);
    });

    it("should support prompt discovery and execution flow", async () => {
      hub = createHub();
      hub.connections.push(createMockConnection("test-server", hub));

      // Step 1: Discover prompts
      const prompts = await hub.listPrompts("test-server");
      expect(prompts.length).toBeGreaterThan(0);

      // Step 2: Execute a prompt
      const firstPrompt = prompts[0];
      expect(firstPrompt).toBeDefined();
      if (!firstPrompt) throw new Error("Expected firstPrompt to be defined");

      const response = await hub.getPrompt("test-server", firstPrompt.name, { text: "test" });
      expect(response.messages.length).toBeGreaterThan(0);
    });
  });
});
