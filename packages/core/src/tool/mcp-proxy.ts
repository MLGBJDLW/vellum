// ============================================
// MCP Proxy - T038, T039, T040, T041
// ============================================

import { z } from "zod";

import { ErrorCode, VellumError } from "../errors/index.js";
import {
  defineTool,
  fail,
  ok,
  type Tool,
  type ToolContext,
  type ToolResult,
} from "../types/tool.js";

// =============================================================================
// Zod v4 Compatibility Types
// =============================================================================

/**
 * Primitive types that can be used with z.literal() in Zod v4.
 * Note: symbol is no longer supported in Zod v4.
 */
type LiteralPrimitive = string | number | boolean | null | undefined | bigint;

// =============================================================================
// T038: Core Types and Interfaces
// =============================================================================

/**
 * JSON Schema type representation for MCP tool input schemas.
 */
export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  description?: string;
  additionalProperties?: boolean | JSONSchema;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

/**
 * MCP tool definition as received from tools/list.
 */
export interface MCPToolDefinition {
  /** Unique name of the tool */
  name: string;
  /** Human-readable description */
  description?: string;
  /** JSON Schema for input parameters */
  inputSchema?: JSONSchema;
}

/**
 * Result from an MCP tool call.
 */
export interface MCPToolResult {
  /** Result content from the tool */
  content: unknown;
  /** Whether the tool call was an error */
  isError?: boolean;
}

/**
 * Transport abstraction for MCP communication.
 *
 * Implementations can support stdio, HTTP, or other transports.
 */
export interface MCPTransport {
  /**
   * Start the transport and prepare for communication.
   */
  start(): Promise<void>;

  /**
   * Close the transport and clean up resources.
   */
  close(): Promise<void>;

  /**
   * Send a JSON-RPC request and receive a response.
   *
   * @param request - JSON-RPC 2.0 request object
   * @returns JSON-RPC 2.0 response object
   */
  send(request: JSONRPCRequest): Promise<JSONRPCResponse>;

  /**
   * Check if the transport is currently active.
   */
  isActive(): boolean;
}

/**
 * JSON-RPC 2.0 request format.
 */
export interface JSONRPCRequest {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
  id: string | number;
}

/**
 * JSON-RPC 2.0 response format.
 */
export interface JSONRPCResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: JSONRPCError;
  id: string | number | null;
}

/**
 * JSON-RPC 2.0 error format.
 */
export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * MCP Proxy interface for connecting to MCP servers.
 *
 * Provides:
 * - Connection lifecycle management
 * - Tool discovery and listing
 * - Tool execution via JSON-RPC
 */
export interface MCPProxy {
  /**
   * Establish connection to the MCP server.
   */
  connect(): Promise<void>;

  /**
   * Close connection to the MCP server.
   */
  disconnect(): Promise<void>;

  /**
   * Get list of available tools from the MCP server.
   */
  listTools(): Promise<MCPToolDefinition[]>;

  /**
   * Execute a tool on the MCP server.
   *
   * @param name - Tool name
   * @param params - Tool parameters
   * @returns Tool execution result
   */
  callTool(name: string, params: unknown): Promise<MCPToolResult>;

  /**
   * Check if currently connected to the MCP server.
   */
  isConnected(): boolean;

  /**
   * Discover and convert MCP tools to internal Tool instances.
   *
   * @returns Array of Tool instances for all available MCP tools
   */
  discoverTools(): Promise<Tool<z.ZodType, unknown>[]>;
}

// =============================================================================
// MCP-specific Errors
// =============================================================================

/**
 * Error thrown when MCP connection fails.
 */
export class MCPConnectionError extends VellumError {
  constructor(message: string, cause?: Error) {
    super(message, ErrorCode.MCP_CONNECTION, {
      cause,
      isRetryable: true,
      retryDelay: 1000,
    });
    this.name = "MCPConnectionError";
  }
}

/**
 * Error thrown when MCP protocol is violated.
 */
export class MCPProtocolError extends VellumError {
  constructor(message: string, cause?: Error) {
    super(message, ErrorCode.MCP_PROTOCOL, {
      cause,
      isRetryable: false,
    });
    this.name = "MCPProtocolError";
  }
}

/**
 * Error thrown when MCP operation times out.
 */
export class MCPTimeoutError extends VellumError {
  constructor(message: string, timeoutMs: number) {
    super(message, ErrorCode.MCP_TIMEOUT, {
      context: { timeoutMs },
      isRetryable: true,
      retryDelay: 500,
    });
    this.name = "MCPTimeoutError";
  }
}

// =============================================================================
// T039: JSON Schema to Zod Conversion
// =============================================================================

/**
 * Convert a JSON Schema to a Zod schema.
 *
 * Supports common JSON Schema patterns:
 * - Primitive types: string, number, integer, boolean, null
 * - Compound types: object, array
 * - Modifiers: required, optional, default, description
 * - Constraints: enum, const
 * - Nested structures
 *
 * @param schema - JSON Schema to convert
 * @returns Equivalent Zod schema
 * @throws Error for unsupported patterns (oneOf, anyOf, allOf, $ref)
 *
 * @example
 * ```typescript
 * const jsonSchema = {
 *   type: "object",
 *   properties: {
 *     name: { type: "string", description: "User name" },
 *     age: { type: "integer", minimum: 0 }
 *   },
 *   required: ["name"]
 * };
 *
 * const zodSchema = jsonSchemaToZod(jsonSchema);
 * // z.object({ name: z.string().describe("User name"), age: z.number().int().min(0).optional() })
 * ```
 */
export function jsonSchemaToZod(schema: JSONSchema | undefined): z.ZodType {
  // Handle undefined or empty schema
  if (!schema || Object.keys(schema).length === 0) {
    return z.object({});
  }

  // Check for unsupported patterns
  const unsupportedKeys = ["oneOf", "anyOf", "allOf", "$ref", "not"];
  for (const key of unsupportedKeys) {
    if (key in schema) {
      throw new Error(`Unsupported JSON Schema pattern: ${key}`);
    }
  }

  // Handle const value
  if ("const" in schema && schema.const !== undefined) {
    return z.literal(schema.const as LiteralPrimitive);
  }

  // Handle enum
  if (schema.enum) {
    if (schema.enum.length === 0) {
      throw new Error("Empty enum is not supported");
    }
    // Type assertion for enum values
    const values = schema.enum as [LiteralPrimitive, ...LiteralPrimitive[]];
    let zodEnum: z.ZodType = z.literal(values[0]);
    for (let i = 1; i < values.length; i++) {
      zodEnum = zodEnum.or(z.literal(values[i]));
    }
    return applyDescription(zodEnum, schema.description);
  }

  // Handle type-based conversion
  const schemaType = normalizeType(schema.type);

  switch (schemaType) {
    case "string":
      return buildStringSchema(schema);

    case "number":
    case "integer":
      return buildNumberSchema(schema, schemaType === "integer");

    case "boolean":
      return applyDescription(z.boolean(), schema.description);

    case "null":
      return applyDescription(z.null(), schema.description);

    case "array":
      return buildArraySchema(schema);

    case "object":
      return buildObjectSchema(schema);

    default:
      // No type specified, try to infer from properties
      if (schema.properties) {
        return buildObjectSchema(schema);
      }
      if (schema.items) {
        return buildArraySchema(schema);
      }
      // Default to any/unknown
      return z.unknown();
  }
}

/**
 * Normalize type field which can be string or array.
 */
function normalizeType(type: string | string[] | undefined): string | undefined {
  if (!type) return undefined;
  if (Array.isArray(type)) {
    // For union types, take first non-null type or "null"
    const nonNull = type.find((t) => t !== "null");
    return nonNull ?? "null";
  }
  return type;
}

/**
 * Apply description to a Zod schema if present.
 */
function applyDescription<T extends z.ZodType>(schema: T, description?: string): T {
  if (description) {
    return schema.describe(description) as T;
  }
  return schema;
}

/**
 * Apply default value to a Zod schema if present.
 * In Zod v4, default value must match the schema's output type.
 */
function applyDefault(schema: z.ZodType, defaultValue: unknown): z.ZodType {
  if (defaultValue !== undefined && defaultValue !== null) {
    // Use type assertion to bypass Zod v4's stricter default typing
    return (schema as z.ZodType<unknown>).default(defaultValue as never);
  }
  return schema;
}

/**
 * Build a Zod string schema with constraints.
 */
function buildStringSchema(schema: JSONSchema): z.ZodType {
  let zodSchema: z.ZodType = z.string();

  if (schema.minLength !== undefined) {
    zodSchema = (zodSchema as z.ZodString).min(schema.minLength);
  }
  if (schema.maxLength !== undefined) {
    zodSchema = (zodSchema as z.ZodString).max(schema.maxLength);
  }
  if (schema.pattern) {
    zodSchema = (zodSchema as z.ZodString).regex(new RegExp(schema.pattern));
  }

  let result: z.ZodType = applyDescription(zodSchema, schema.description);
  result = applyDefault(result, schema.default);
  return result;
}

/**
 * Build a Zod number schema with constraints.
 */
function buildNumberSchema(schema: JSONSchema, isInteger: boolean): z.ZodType {
  let zodSchema = z.number();

  if (isInteger) {
    zodSchema = zodSchema.int();
  }
  if (schema.minimum !== undefined) {
    zodSchema = zodSchema.min(schema.minimum);
  }
  if (schema.maximum !== undefined) {
    zodSchema = zodSchema.max(schema.maximum);
  }

  let result: z.ZodType = applyDescription(zodSchema, schema.description);
  result = applyDefault(result, schema.default);
  return result;
}

/**
 * Build a Zod array schema.
 */
function buildArraySchema(schema: JSONSchema): z.ZodType {
  const itemSchema = schema.items ? jsonSchemaToZod(schema.items) : z.unknown();
  let result: z.ZodType = z.array(itemSchema);
  result = applyDescription(result, schema.description);
  result = applyDefault(result, schema.default);
  return result;
}

/**
 * Build a Zod object schema with required/optional fields.
 */
function buildObjectSchema(schema: JSONSchema): z.ZodType {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  const shape: Record<string, z.ZodType> = {};

  for (const [key, propSchema] of Object.entries(properties)) {
    let fieldSchema = jsonSchemaToZod(propSchema);

    // Apply default if present in the property schema
    if (propSchema.default !== undefined) {
      fieldSchema = fieldSchema.default(propSchema.default);
    }

    // Make optional if not in required list (and no default)
    if (!required.has(key) && propSchema.default === undefined) {
      fieldSchema = fieldSchema.optional();
    }

    shape[key] = fieldSchema;
  }

  let result: z.ZodType = z.object(shape);

  // Handle additionalProperties
  if (schema.additionalProperties === true) {
    result = (result as z.ZodObject<z.ZodRawShape>).passthrough();
  } else if (schema.additionalProperties === false) {
    result = (result as z.ZodObject<z.ZodRawShape>).strict();
  }

  result = applyDescription(result, schema.description);
  return result;
}

// =============================================================================
// T040, T041: MCPProxy Implementation
// =============================================================================

/**
 * Configuration options for MCP Proxy.
 */
export interface MCPProxyConfig {
  /** Transport for communication */
  transport: MCPTransport;
  /** Timeout for operations in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Prefix for tool names (default: "mcp_") */
  toolPrefix?: string;
}

/** Default timeout for MCP operations */
const DEFAULT_MCP_TIMEOUT_MS = 30000;

/** Default prefix for MCP tool names */
const DEFAULT_TOOL_PREFIX = "mcp_";

/**
 * Implementation of MCPProxy.
 *
 * Handles:
 * - Connection lifecycle via transport
 * - Tool discovery via tools/list
 * - Tool execution via tools/call
 * - Conversion of MCP tools to internal Tool instances
 */
class MCPProxyImpl implements MCPProxy {
  private readonly transport: MCPTransport;
  private readonly timeoutMs: number;
  private readonly toolPrefix: string;
  private connected = false;
  private requestId = 0;

  constructor(config: MCPProxyConfig) {
    this.transport = config.transport;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_MCP_TIMEOUT_MS;
    this.toolPrefix = config.toolPrefix ?? DEFAULT_TOOL_PREFIX;
  }

  /**
   * Establish connection to the MCP server.
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.transport.start();
      this.connected = true;
    } catch (error) {
      throw new MCPConnectionError(
        `Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Close connection to the MCP server.
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.transport.close();
    } finally {
      this.connected = false;
    }
  }

  /**
   * Check if currently connected.
   */
  isConnected(): boolean {
    return this.connected && this.transport.isActive();
  }

  /**
   * Get list of available tools from the MCP server.
   */
  async listTools(): Promise<MCPToolDefinition[]> {
    this.ensureConnected();

    const response = await this.sendRequest("tools/list", {});

    if (response.error) {
      throw new MCPProtocolError(
        `tools/list failed: ${response.error.message} (code: ${response.error.code})`
      );
    }

    // Parse response - MCP returns { tools: [...] }
    const result = response.result as { tools?: MCPToolDefinition[] } | undefined;
    return result?.tools ?? [];
  }

  /**
   * Execute a tool on the MCP server.
   *
   * @param name - Tool name (without prefix)
   * @param params - Tool parameters
   */
  async callTool(name: string, params: unknown): Promise<MCPToolResult> {
    this.ensureConnected();

    const response = await this.sendRequest("tools/call", {
      name,
      arguments: params,
    });

    if (response.error) {
      throw new MCPProtocolError(
        `tools/call failed for '${name}': ${response.error.message} (code: ${response.error.code})`
      );
    }

    // Parse response
    const result = response.result as MCPToolResult | undefined;
    return result ?? { content: null };
  }

  /**
   * Discover and convert MCP tools to internal Tool instances (T040).
   */
  async discoverTools(): Promise<Tool<z.ZodType, unknown>[]> {
    const mcpTools = await this.listTools();
    const tools: Tool<z.ZodType, unknown>[] = [];

    for (const mcpTool of mcpTools) {
      const tool = this.createToolFromDefinition(mcpTool);
      tools.push(tool);
    }

    return tools;
  }

  /**
   * Create an internal Tool from an MCP tool definition.
   */
  private createToolFromDefinition(mcpTool: MCPToolDefinition): Tool<z.ZodType, unknown> {
    // Convert JSON Schema to Zod (T039)
    const parameters = jsonSchemaToZod(mcpTool.inputSchema);

    // Apply mcp_ prefix to tool name
    const prefixedName = `${this.toolPrefix}${mcpTool.name}`;

    // Create Tool using defineTool factory
    return defineTool({
      name: prefixedName,
      description: mcpTool.description ?? `MCP tool: ${mcpTool.name}`,
      parameters,
      kind: "mcp",
      execute: async (input: unknown, _ctx: ToolContext): Promise<ToolResult<unknown>> => {
        try {
          const result = await this.callTool(mcpTool.name, input);
          if (result.isError) {
            return fail(String(result.content));
          }
          return ok(result.content);
        } catch (error) {
          if (error instanceof VellumError) {
            return fail(error.message);
          }
          return fail(error instanceof Error ? error.message : String(error));
        }
      },
    });
  }

  /**
   * Send a JSON-RPC request with timeout handling (T041).
   */
  private async sendRequest(method: string, params: unknown): Promise<JSONRPCResponse> {
    const id = ++this.requestId;

    const request: JSONRPCRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id,
    };

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new MCPTimeoutError(`MCP request '${method}' timed out`, this.timeoutMs));
      }, this.timeoutMs);
    });

    // Race between request and timeout
    try {
      const response = await Promise.race([this.transport.send(request), timeoutPromise]);
      return response;
    } catch (error) {
      if (error instanceof MCPTimeoutError) {
        throw error;
      }
      throw new MCPConnectionError(
        `Failed to send MCP request '${method}': ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Ensure connection is established before operations.
   */
  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw new MCPConnectionError("Not connected to MCP server");
    }
  }
}

// =============================================================================
// T038: Factory Function
// =============================================================================

/**
 * Create an MCP Proxy instance.
 *
 * Factory function that creates a proxy for communicating with MCP servers.
 * The proxy handles connection lifecycle, tool discovery, and execution.
 *
 * @param transport - Transport implementation for communication
 * @param options - Optional configuration
 * @returns MCPProxy instance
 *
 * @example
 * ```typescript
 * // Create proxy with stdio transport
 * const transport = createStdioTransport({ command: "mcp-server" });
 * const proxy = createMCPProxy(transport);
 *
 * // Connect and discover tools
 * await proxy.connect();
 * const tools = await proxy.discoverTools();
 *
 * // Register tools with registry
 * for (const tool of tools) {
 *   registry.register(tool);
 * }
 *
 * // Execute a tool
 * const result = await proxy.callTool("search", { query: "test" });
 *
 * // Cleanup
 * await proxy.disconnect();
 * ```
 */
export function createMCPProxy(
  transport: MCPTransport,
  options?: Omit<MCPProxyConfig, "transport">
): MCPProxy {
  return new MCPProxyImpl({
    transport,
    ...options,
  });
}

// =============================================================================
// Exports for Internal Use
// =============================================================================

/**
 * Internal exports for testing purposes.
 */
export const _internal = {
  /** Normalize JSON Schema type field */
  normalizeType,
  /** Apply description to Zod schema */
  applyDescription,
  /** Build string schema with constraints */
  buildStringSchema,
  /** Build number schema with constraints */
  buildNumberSchema,
  /** Build array schema */
  buildArraySchema,
  /** Build object schema */
  buildObjectSchema,
};
