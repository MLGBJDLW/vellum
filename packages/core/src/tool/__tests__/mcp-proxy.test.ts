// ============================================
// MCP Proxy Tests - T042
// ============================================

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { z } from "zod";
import type { ToolContext } from "../../types/tool.js";
import {
  _internal,
  createMCPProxy,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type JSONSchema,
  jsonSchemaToZod,
  MCPConnectionError,
  MCPProtocolError,
  type MCPProxy,
  MCPTimeoutError,
  type MCPToolDefinition,
  type MCPTransport,
} from "../mcp-proxy.js";

// =============================================================================
// Mock Transport
// =============================================================================

/**
 * Create a mock MCP transport for testing.
 */
function createMockTransport(options?: {
  tools?: MCPToolDefinition[];
  callResults?: Record<string, unknown>;
  startError?: Error;
  sendError?: Error;
}): MCPTransport & {
  startMock: Mock;
  closeMock: Mock;
  sendMock: Mock;
  setActive: (active: boolean) => void;
} {
  let active = false;

  const startMock = vi.fn(async () => {
    if (options?.startError) {
      throw options.startError;
    }
    active = true;
  });

  const closeMock = vi.fn(async () => {
    active = false;
  });

  const sendMock = vi.fn(async (request: JSONRPCRequest): Promise<JSONRPCResponse> => {
    if (options?.sendError) {
      throw options.sendError;
    }

    // Handle tools/list
    if (request.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        result: { tools: options?.tools ?? [] },
        id: request.id,
      };
    }

    // Handle tools/call
    if (request.method === "tools/call") {
      const params = request.params as { name: string; arguments: unknown };
      const result = options?.callResults?.[params.name] ?? { content: "default result" };
      return {
        jsonrpc: "2.0",
        result,
        id: request.id,
      };
    }

    return {
      jsonrpc: "2.0",
      error: { code: -32601, message: "Method not found" },
      id: request.id,
    };
  });

  return {
    start: startMock,
    close: closeMock,
    send: sendMock,
    isActive: () => active,
    startMock,
    closeMock,
    sendMock,
    setActive: (a: boolean) => {
      active = a;
    },
  };
}

/**
 * Create a mock ToolContext for testing.
 */
function createMockContext(): ToolContext {
  return {
    workingDir: "/test",
    sessionId: "test-session",
    messageId: "test-message",
    callId: "test-call",
    abortSignal: new AbortController().signal,
    checkPermission: vi.fn(async () => true),
  };
}

// =============================================================================
// T038: MCPProxy Factory and Interface Tests
// =============================================================================

describe("createMCPProxy", () => {
  it("should create an MCPProxy instance", () => {
    const transport = createMockTransport();
    const proxy = createMCPProxy(transport);

    expect(proxy).toBeDefined();
    expect(proxy.connect).toBeInstanceOf(Function);
    expect(proxy.disconnect).toBeInstanceOf(Function);
    expect(proxy.listTools).toBeInstanceOf(Function);
    expect(proxy.callTool).toBeInstanceOf(Function);
    expect(proxy.isConnected).toBeInstanceOf(Function);
    expect(proxy.discoverTools).toBeInstanceOf(Function);
  });

  it("should accept custom options", () => {
    const transport = createMockTransport();
    const proxy = createMCPProxy(transport, {
      timeoutMs: 5000,
      toolPrefix: "custom_",
    });

    expect(proxy).toBeDefined();
  });
});

// =============================================================================
// T038: Connection Lifecycle Tests
// =============================================================================

describe("MCPProxy Connection Lifecycle", () => {
  let transport: ReturnType<typeof createMockTransport>;
  let proxy: MCPProxy;

  beforeEach(() => {
    transport = createMockTransport();
    proxy = createMCPProxy(transport);
  });

  describe("connect()", () => {
    it("should establish connection via transport", async () => {
      expect(proxy.isConnected()).toBe(false);

      await proxy.connect();

      expect(transport.startMock).toHaveBeenCalledOnce();
      expect(proxy.isConnected()).toBe(true);
    });

    it("should be idempotent when already connected", async () => {
      await proxy.connect();
      await proxy.connect();

      expect(transport.startMock).toHaveBeenCalledOnce();
    });

    it("should throw MCPConnectionError on transport failure", async () => {
      const errorTransport = createMockTransport({
        startError: new Error("Connection refused"),
      });
      const errorProxy = createMCPProxy(errorTransport);

      await expect(errorProxy.connect()).rejects.toThrow(MCPConnectionError);
      await expect(errorProxy.connect()).rejects.toThrow("Failed to connect to MCP server");
    });
  });

  describe("disconnect()", () => {
    it("should close connection via transport", async () => {
      await proxy.connect();
      expect(proxy.isConnected()).toBe(true);

      await proxy.disconnect();

      expect(transport.closeMock).toHaveBeenCalledOnce();
      expect(proxy.isConnected()).toBe(false);
    });

    it("should be idempotent when already disconnected", async () => {
      await proxy.disconnect();
      await proxy.disconnect();

      expect(transport.closeMock).not.toHaveBeenCalled();
    });
  });

  describe("isConnected()", () => {
    it("should return false initially", () => {
      expect(proxy.isConnected()).toBe(false);
    });

    it("should return true after connect", async () => {
      await proxy.connect();
      expect(proxy.isConnected()).toBe(true);
    });

    it("should return false after disconnect", async () => {
      await proxy.connect();
      await proxy.disconnect();
      expect(proxy.isConnected()).toBe(false);
    });

    it("should return false if transport becomes inactive", async () => {
      await proxy.connect();
      expect(proxy.isConnected()).toBe(true);

      // Simulate transport going inactive
      transport.setActive(false);
      expect(proxy.isConnected()).toBe(false);
    });
  });
});

// =============================================================================
// T039: JSON Schema to Zod Conversion Tests
// =============================================================================

describe("jsonSchemaToZod", () => {
  describe("empty/undefined schema", () => {
    it("should return empty object for undefined schema", () => {
      const result = jsonSchemaToZod(undefined);
      expect(result.parse({})).toEqual({});
    });

    it("should return empty object for empty schema", () => {
      const result = jsonSchemaToZod({});
      expect(result.parse({})).toEqual({});
    });
  });

  describe("string type", () => {
    it("should convert basic string type", () => {
      const schema: JSONSchema = { type: "string" };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse("hello")).toBe("hello");
      expect(() => zodSchema.parse(123)).toThrow();
    });

    it("should apply description", () => {
      const schema: JSONSchema = { type: "string", description: "A name" };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.description).toBe("A name");
    });

    it("should apply minLength constraint", () => {
      const schema: JSONSchema = { type: "string", minLength: 3 };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse("abc")).toBe("abc");
      expect(() => zodSchema.parse("ab")).toThrow();
    });

    it("should apply maxLength constraint", () => {
      const schema: JSONSchema = { type: "string", maxLength: 5 };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse("hello")).toBe("hello");
      expect(() => zodSchema.parse("hello!")).toThrow();
    });

    it("should apply pattern constraint", () => {
      const schema: JSONSchema = { type: "string", pattern: "^[a-z]+$" };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse("abc")).toBe("abc");
      expect(() => zodSchema.parse("ABC")).toThrow();
    });

    it("should apply default value", () => {
      const schema: JSONSchema = { type: "string", default: "default" };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse(undefined)).toBe("default");
    });
  });

  describe("number type", () => {
    it("should convert basic number type", () => {
      const schema: JSONSchema = { type: "number" };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse(42)).toBe(42);
      expect(zodSchema.parse(3.14)).toBe(3.14);
      expect(() => zodSchema.parse("42")).toThrow();
    });

    it("should apply minimum constraint", () => {
      const schema: JSONSchema = { type: "number", minimum: 0 };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse(0)).toBe(0);
      expect(() => zodSchema.parse(-1)).toThrow();
    });

    it("should apply maximum constraint", () => {
      const schema: JSONSchema = { type: "number", maximum: 100 };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse(100)).toBe(100);
      expect(() => zodSchema.parse(101)).toThrow();
    });

    it("should apply default value", () => {
      const schema: JSONSchema = { type: "number", default: 0 };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse(undefined)).toBe(0);
    });
  });

  describe("integer type", () => {
    it("should convert integer type with int validation", () => {
      const schema: JSONSchema = { type: "integer" };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse(42)).toBe(42);
      expect(() => zodSchema.parse(3.14)).toThrow();
    });

    it("should apply min/max constraints", () => {
      const schema: JSONSchema = { type: "integer", minimum: 1, maximum: 10 };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse(5)).toBe(5);
      expect(() => zodSchema.parse(0)).toThrow();
      expect(() => zodSchema.parse(11)).toThrow();
    });
  });

  describe("boolean type", () => {
    it("should convert boolean type", () => {
      const schema: JSONSchema = { type: "boolean" };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse(true)).toBe(true);
      expect(zodSchema.parse(false)).toBe(false);
      expect(() => zodSchema.parse("true")).toThrow();
    });

    it("should apply description", () => {
      const schema: JSONSchema = { type: "boolean", description: "Is enabled" };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.description).toBe("Is enabled");
    });
  });

  describe("null type", () => {
    it("should convert null type", () => {
      const schema: JSONSchema = { type: "null" };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse(null)).toBe(null);
      expect(() => zodSchema.parse(undefined)).toThrow();
    });
  });

  describe("array type", () => {
    it("should convert array type without items", () => {
      const schema: JSONSchema = { type: "array" };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse([1, "two", true])).toEqual([1, "two", true]);
    });

    it("should convert array type with typed items", () => {
      const schema: JSONSchema = { type: "array", items: { type: "string" } };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse(["a", "b", "c"])).toEqual(["a", "b", "c"]);
      expect(() => zodSchema.parse([1, 2, 3])).toThrow();
    });

    it("should apply description", () => {
      const schema: JSONSchema = { type: "array", description: "A list" };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.description).toBe("A list");
    });

    it("should apply default value", () => {
      const schema: JSONSchema = { type: "array", default: [] };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse(undefined)).toEqual([]);
    });
  });

  describe("object type", () => {
    it("should convert basic object type", () => {
      const schema: JSONSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "integer" },
        },
      };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse({ name: "John" })).toEqual({ name: "John" });
      expect(zodSchema.parse({ name: "John", age: 30 })).toEqual({ name: "John", age: 30 });
    });

    it("should handle required fields", () => {
      const schema: JSONSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "integer" },
        },
        required: ["name"],
      };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse({ name: "John" })).toEqual({ name: "John" });
      expect(() => zodSchema.parse({ age: 30 })).toThrow();
    });

    it("should handle optional fields", () => {
      const schema: JSONSchema = {
        type: "object",
        properties: {
          required: { type: "string" },
          optional: { type: "string" },
        },
        required: ["required"],
      };
      const zodSchema = jsonSchemaToZod(schema);

      const result = zodSchema.parse({ required: "value" });
      expect(result).toEqual({ required: "value" });
    });

    it("should handle default values in properties", () => {
      const schema: JSONSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          count: { type: "integer", default: 0 },
        },
        required: ["name"],
      };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse({ name: "test" })).toEqual({ name: "test", count: 0 });
    });

    it("should handle nested objects", () => {
      const schema: JSONSchema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
            },
            required: ["name"],
          },
        },
        required: ["user"],
      };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse({ user: { name: "John", email: "john@example.com" } })).toEqual({
        user: { name: "John", email: "john@example.com" },
      });
      expect(() => zodSchema.parse({ user: { email: "john@example.com" } })).toThrow();
    });

    it("should handle additionalProperties: true (passthrough)", () => {
      const schema: JSONSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        additionalProperties: true,
      };
      const zodSchema = jsonSchemaToZod(schema);

      const result = zodSchema.parse({ name: "test", extra: "value" });
      expect(result).toEqual({ name: "test", extra: "value" });
    });

    it("should handle additionalProperties: false (strict)", () => {
      const schema: JSONSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        additionalProperties: false,
      };
      const zodSchema = jsonSchemaToZod(schema);

      expect(() => zodSchema.parse({ name: "test", extra: "value" })).toThrow();
    });
  });

  describe("enum and const", () => {
    it("should handle enum values", () => {
      const schema: JSONSchema = { enum: ["a", "b", "c"] };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse("a")).toBe("a");
      expect(zodSchema.parse("b")).toBe("b");
      expect(() => zodSchema.parse("d")).toThrow();
    });

    it("should handle numeric enum values", () => {
      const schema: JSONSchema = { enum: [1, 2, 3] };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse(1)).toBe(1);
      expect(() => zodSchema.parse(4)).toThrow();
    });

    it("should handle const value", () => {
      const schema: JSONSchema = { const: "fixed" };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse("fixed")).toBe("fixed");
      expect(() => zodSchema.parse("other")).toThrow();
    });

    it("should throw on empty enum", () => {
      const schema: JSONSchema = { enum: [] };
      expect(() => jsonSchemaToZod(schema)).toThrow("Empty enum is not supported");
    });
  });

  describe("unsupported patterns", () => {
    it("should throw on oneOf", () => {
      const schema = { oneOf: [{ type: "string" }, { type: "number" }] } as JSONSchema;
      expect(() => jsonSchemaToZod(schema)).toThrow("Unsupported JSON Schema pattern: oneOf");
    });

    it("should throw on anyOf", () => {
      const schema = { anyOf: [{ type: "string" }, { type: "number" }] } as JSONSchema;
      expect(() => jsonSchemaToZod(schema)).toThrow("Unsupported JSON Schema pattern: anyOf");
    });

    it("should throw on allOf", () => {
      const schema = { allOf: [{ type: "object" }] } as JSONSchema;
      expect(() => jsonSchemaToZod(schema)).toThrow("Unsupported JSON Schema pattern: allOf");
    });

    it("should throw on $ref", () => {
      const schema = { $ref: "#/definitions/foo" } as JSONSchema;
      expect(() => jsonSchemaToZod(schema)).toThrow("Unsupported JSON Schema pattern: $ref");
    });
  });

  describe("type inference", () => {
    it("should infer object type from properties", () => {
      const schema: JSONSchema = {
        properties: {
          name: { type: "string" },
        },
      };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse({ name: "test" })).toEqual({ name: "test" });
    });

    it("should infer array type from items", () => {
      const schema: JSONSchema = {
        items: { type: "string" },
      };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse(["a", "b"])).toEqual(["a", "b"]);
    });

    it("should handle array type union (take first non-null)", () => {
      const schema: JSONSchema = { type: ["null", "string"] };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse("test")).toBe("test");
    });
  });
});

// =============================================================================
// T040: Tool Discovery Tests
// =============================================================================

describe("MCPProxy Tool Discovery", () => {
  const sampleTools: MCPToolDefinition[] = [
    {
      name: "search",
      description: "Search for content",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "integer", default: 10 },
        },
        required: ["query"],
      },
    },
    {
      name: "fetch_url",
      description: "Fetch a URL",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
        },
        required: ["url"],
      },
    },
    {
      name: "no_params",
      description: "Tool with no parameters",
    },
  ];

  let transport: ReturnType<typeof createMockTransport>;
  let proxy: MCPProxy;

  beforeEach(async () => {
    transport = createMockTransport({ tools: sampleTools });
    proxy = createMCPProxy(transport);
    await proxy.connect();
  });

  describe("listTools()", () => {
    it("should return tool definitions from MCP server", async () => {
      const tools = await proxy.listTools();

      expect(tools).toHaveLength(3);
      expect(tools[0]?.name).toBe("search");
      expect(tools[1]?.name).toBe("fetch_url");
      expect(tools[2]?.name).toBe("no_params");
    });

    it("should throw MCPConnectionError when not connected", async () => {
      await proxy.disconnect();

      await expect(proxy.listTools()).rejects.toThrow(MCPConnectionError);
      await expect(proxy.listTools()).rejects.toThrow("Not connected to MCP server");
    });

    it("should throw MCPProtocolError on error response", async () => {
      transport.sendMock.mockResolvedValueOnce({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid request" },
        id: 1,
      });

      await expect(proxy.listTools()).rejects.toThrow(MCPProtocolError);
    });
  });

  describe("discoverTools()", () => {
    it("should convert MCP tools to internal Tool instances", async () => {
      const tools = await proxy.discoverTools();

      expect(tools).toHaveLength(3);
    });

    it("should apply mcp_ prefix to tool names", async () => {
      const tools = await proxy.discoverTools();

      expect(tools[0]?.definition.name).toBe("mcp_search");
      expect(tools[1]?.definition.name).toBe("mcp_fetch_url");
      expect(tools[2]?.definition.name).toBe("mcp_no_params");
    });

    it("should set kind to mcp for all tools", async () => {
      const tools = await proxy.discoverTools();

      for (const tool of tools) {
        expect(tool.definition.kind).toBe("mcp");
      }
    });

    it("should preserve description", async () => {
      const tools = await proxy.discoverTools();

      expect(tools[0]?.definition.description).toBe("Search for content");
      expect(tools[1]?.definition.description).toBe("Fetch a URL");
    });

    it("should use default description for tools without one", async () => {
      const toolsWithoutDesc: MCPToolDefinition[] = [{ name: "simple" }];
      const noDescTransport = createMockTransport({ tools: toolsWithoutDesc });
      const noDescProxy = createMCPProxy(noDescTransport);
      await noDescProxy.connect();

      const tools = await noDescProxy.discoverTools();

      expect(tools[0]?.definition.description).toBe("MCP tool: simple");
    });

    it("should convert JSON Schema to Zod parameters", async () => {
      const tools = await proxy.discoverTools();
      // biome-ignore lint/style/noNonNullAssertion: tools[0] verified by test setup
      const searchTool = tools[0]!;

      // Test parameter validation
      const validParams = { query: "test" };
      const parseResult = searchTool.definition.parameters.safeParse(validParams);
      expect(parseResult.success).toBe(true);

      // Test required field
      const invalidParams = { limit: 5 };
      const failResult = searchTool.definition.parameters.safeParse(invalidParams);
      expect(failResult.success).toBe(false);
    });

    it("should handle tools without inputSchema", async () => {
      const tools = await proxy.discoverTools();
      // biome-ignore lint/style/noNonNullAssertion: tools[2] verified by test setup
      const noParamsTool = tools[2]!;

      // Should accept empty object
      const parseResult = noParamsTool.definition.parameters.safeParse({});
      expect(parseResult.success).toBe(true);
    });

    it("should support custom tool prefix", async () => {
      const customProxy = createMCPProxy(transport, { toolPrefix: "ext_" });
      await customProxy.connect();

      const tools = await customProxy.discoverTools();

      expect(tools[0]?.definition.name).toBe("ext_search");
    });
  });
});

// =============================================================================
// T041: Tool Execution Tests
// =============================================================================

describe("MCPProxy Tool Execution", () => {
  let transport: ReturnType<typeof createMockTransport>;
  let proxy: MCPProxy;

  beforeEach(async () => {
    transport = createMockTransport({
      tools: [
        {
          name: "echo",
          description: "Echo input",
          inputSchema: { type: "object", properties: { message: { type: "string" } } },
        },
      ],
      callResults: {
        echo: { content: "echoed: test" },
        error_tool: { content: "Something went wrong", isError: true },
      },
    });
    proxy = createMCPProxy(transport);
    await proxy.connect();
  });

  describe("callTool()", () => {
    it("should send JSON-RPC 2.0 request", async () => {
      await proxy.callTool("echo", { message: "test" });

      expect(transport.sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "echo", arguments: { message: "test" } },
        })
      );
    });

    it("should return tool result", async () => {
      const result = await proxy.callTool("echo", { message: "test" });

      expect(result.content).toBe("echoed: test");
    });

    it("should throw MCPConnectionError when not connected", async () => {
      await proxy.disconnect();

      await expect(proxy.callTool("echo", {})).rejects.toThrow(MCPConnectionError);
    });

    it("should throw MCPProtocolError on error response", async () => {
      // Create a new transport that returns an error for tools/call
      const errorTransport = createMockTransport();
      errorTransport.sendMock.mockImplementation(async (request: JSONRPCRequest) => {
        if (request.method === "tools/call") {
          return {
            jsonrpc: "2.0" as const,
            error: { code: -32602, message: "Invalid params" },
            id: request.id,
          };
        }
        return { jsonrpc: "2.0" as const, result: { tools: [] }, id: request.id };
      });
      const errorProxy = createMCPProxy(errorTransport);
      await errorProxy.connect();

      await expect(errorProxy.callTool("echo", {})).rejects.toThrow(MCPProtocolError);
      await expect(errorProxy.callTool("echo", {})).rejects.toThrow(
        /tools\/call failed for 'echo'/
      );
    });

    it("should increment request ID for each call", async () => {
      await proxy.callTool("echo", {});
      await proxy.callTool("echo", {});

      const calls = transport.sendMock.mock.calls;
      // Skip first call which is from beforeEach connect
      const id1 = calls[calls.length - 2]?.[0].id;
      const id2 = calls[calls.length - 1]?.[0].id;
      expect(id2).toBe(id1 + 1);
    });
  });

  describe("Tool execute function via discoverTools", () => {
    it("should execute tool and return success result", async () => {
      const tools = await proxy.discoverTools();
      // biome-ignore lint/style/noNonNullAssertion: tools[0] verified by test setup
      const echoTool = tools[0]!;
      const ctx = createMockContext();

      const result = await echoTool.execute({ message: "test" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toBe("echoed: test");
      }
    });

    it("should return failure result on MCP error", async () => {
      // Add error tool to transport
      transport = createMockTransport({
        tools: [{ name: "failing", description: "Always fails" }],
        callResults: {
          failing: { content: "Error occurred", isError: true },
        },
      });
      proxy = createMCPProxy(transport);
      await proxy.connect();

      const tools = await proxy.discoverTools();
      // biome-ignore lint/style/noNonNullAssertion: tools[0] verified by test setup
      const failingTool = tools[0]!;
      const ctx = createMockContext();

      const result = await failingTool.execute({}, ctx);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Error occurred");
      }
    });

    it("should return failure result on connection error", async () => {
      const tools = await proxy.discoverTools();
      // biome-ignore lint/style/noNonNullAssertion: tools[0] verified by test setup
      const echoTool = tools[0]!;
      const ctx = createMockContext();

      // Disconnect to simulate error
      await proxy.disconnect();

      const result = await echoTool.execute({ message: "test" }, ctx);

      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe("MCPProxy Error Handling", () => {
  describe("MCPConnectionError", () => {
    it("should have correct error code", () => {
      const error = new MCPConnectionError("Connection failed");
      expect(error.code).toBe(6010); // ErrorCode.MCP_CONNECTION
    });

    it("should be retryable", () => {
      const error = new MCPConnectionError("Connection failed");
      expect(error.isRetryable).toBe(true);
    });

    it("should preserve cause", () => {
      const cause = new Error("Original error");
      const error = new MCPConnectionError("Connection failed", cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe("MCPProtocolError", () => {
    it("should have correct error code", () => {
      const error = new MCPProtocolError("Protocol violation");
      expect(error.code).toBe(6011); // ErrorCode.MCP_PROTOCOL
    });

    it("should not be retryable", () => {
      const error = new MCPProtocolError("Protocol violation");
      expect(error.isRetryable).toBe(false);
    });
  });

  describe("MCPTimeoutError", () => {
    it("should have correct error code", () => {
      const error = new MCPTimeoutError("Request timed out", 5000);
      expect(error.code).toBe(6012); // ErrorCode.MCP_TIMEOUT
    });

    it("should be retryable", () => {
      const error = new MCPTimeoutError("Request timed out", 5000);
      expect(error.isRetryable).toBe(true);
    });

    it("should include timeout in context", () => {
      const error = new MCPTimeoutError("Request timed out", 5000);
      expect(error.context?.timeoutMs).toBe(5000);
    });
  });

  describe("Timeout handling", () => {
    it("should throw MCPTimeoutError on slow request", async () => {
      const slowTransport = createMockTransport();
      // Make send take longer than timeout
      slowTransport.sendMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ jsonrpc: "2.0", result: {}, id: 1 }), 1000);
          })
      );

      const proxy = createMCPProxy(slowTransport, { timeoutMs: 50 });
      await proxy.connect();

      await expect(proxy.listTools()).rejects.toThrow(MCPTimeoutError);
    }, 10000);
  });

  describe("Transport send error", () => {
    it("should wrap transport errors in MCPConnectionError", async () => {
      const errorTransport = createMockTransport({
        sendError: new Error("Network error"),
      });
      const proxy = createMCPProxy(errorTransport);
      await proxy.connect();

      await expect(proxy.listTools()).rejects.toThrow(MCPConnectionError);
      await expect(proxy.listTools()).rejects.toThrow(/Failed to send MCP request/);
    });
  });
});

// =============================================================================
// Internal Utilities Tests
// =============================================================================

describe("Internal Utilities", () => {
  describe("normalizeType", () => {
    it("should return undefined for undefined input", () => {
      expect(_internal.normalizeType(undefined)).toBeUndefined();
    });

    it("should return string type as-is", () => {
      expect(_internal.normalizeType("string")).toBe("string");
    });

    it("should return first non-null type from array", () => {
      expect(_internal.normalizeType(["null", "string"])).toBe("string");
      expect(_internal.normalizeType(["string", "null"])).toBe("string");
    });

    it("should return null if only null in array", () => {
      expect(_internal.normalizeType(["null"])).toBe("null");
    });
  });

  describe("applyDescription", () => {
    it("should add description to schema", () => {
      const schema = z.string();
      const result = _internal.applyDescription(schema, "test description");
      expect(result.description).toBe("test description");
    });

    it("should return schema unchanged if no description", () => {
      const schema = z.string();
      const result = _internal.applyDescription(schema, undefined);
      expect(result).toBe(schema);
    });
  });
});
