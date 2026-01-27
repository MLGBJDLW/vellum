// ============================================
// McpCapabilityDiscovery - Capability Discovery & Operations
// ============================================

import type { ToolExecutor, ToolRegistry } from "@vellum/core";
import { DEFAULT_MCP_TIMEOUT_SECONDS } from "./constants.js";
import { McpConnectionError, McpTimeoutError, McpToolError } from "./errors.js";
import type {
  McpConnection,
  McpHubEvents,
  McpPrompt,
  McpPromptResponse,
  McpResource,
  McpResourceResponse,
  McpServerConfig,
  McpTool,
  McpToolCallResponse,
  ToolFilter,
} from "./types.js";

// ============================================
// Standalone Utility Functions
// ============================================

/**
 * Filter tools based on include/exclude configuration.
 * This is a pure function with no side effects.
 *
 * Filtering order:
 * 1. Apply includeTools whitelist first (if specified)
 * 2. Apply excludeTools blacklist second (if specified)
 *
 * @param tools - Array of discovered MCP tools
 * @param filter - Tool filter configuration from server config
 * @returns Filtered array of tools (returns all if no filter)
 *
 * @example
 * ```typescript
 * const tools = [{ name: 'read_file', ... }, { name: 'write_file', ... }];
 * const filtered = filterTools(tools, { includeTools: ['read_file'] });
 * // filtered = [{ name: 'read_file', ... }]
 * ```
 */
export function filterTools(tools: McpTool[], filter?: ToolFilter): McpTool[] {
  if (!filter) return tools;

  let filtered = tools;

  // Apply whitelist first
  if (filter.includeTools?.length) {
    const includeSet = new Set(filter.includeTools);
    filtered = filtered.filter((tool) => includeSet.has(tool.name));
  }

  // Apply blacklist second
  if (filter.excludeTools?.length) {
    const excludeSet = new Set(filter.excludeTools);
    filtered = filtered.filter((tool) => !excludeSet.has(tool.name));
  }

  return filtered;
}

// ============================================
// Interfaces
// ============================================

/**
 * Interface for accessing MCP server connections.
 * McpHub implements this to provide connection access to capability discovery.
 */
export interface ConnectionProvider {
  /** Get all active connections */
  getConnections(): McpConnection[];
  /** Get a specific connection by name */
  getConnection(serverName: string): McpConnection | undefined;
  /** Check if server is connected */
  isServerConnected(serverName: string): boolean;
}

/**
 * Configuration options for McpCapabilityDiscovery initialization.
 */
export interface CapabilityDiscoveryOptions {
  /** Connection provider for accessing servers */
  connectionProvider: ConnectionProvider;
  /** Tool registry for automatic tool registration (optional) */
  toolRegistry?: ToolRegistry;
  /** Tool executor for executing tools (optional) */
  toolExecutor?: ToolExecutor;
  /** Event emitter for notifications */
  emitEvent?: <K extends keyof McpHubEvents>(event: K, data: McpHubEvents[K]) => void;
}

// ============================================
// McpCapabilityDiscovery Class
// ============================================

/**
 * McpCapabilityDiscovery - Handles capability discovery and operations for MCP servers.
 *
 * Provides:
 * - Server capability discovery (tools, resources, prompts)
 * - Tool operations (call, list, fetch)
 * - Resource operations (read, list, fetch)
 * - Prompt operations (list, get)
 * - Tool filtering (include/exclude lists)
 *
 * @example
 * ```typescript
 * const discovery = new McpCapabilityDiscovery({
 *   connectionProvider: mcpHub,
 *   toolRegistry: registry,
 *   emitEvent: (event, data) => hub.emitEvent(event, data),
 * });
 *
 * await discovery.discoverServerCapabilities(connection, serverName, config);
 * const tools = discovery.getAllTools();
 * await discovery.callTool('serverName', 'toolName', { arg: 'value' });
 * ```
 */
export class McpCapabilityDiscovery {
  private readonly connectionProvider: ConnectionProvider;
  private readonly toolRegistry?: ToolRegistry;
  private readonly toolExecutor?: ToolExecutor;
  private readonly emitEvent?: CapabilityDiscoveryOptions["emitEvent"];

  constructor(options: CapabilityDiscoveryOptions) {
    this.connectionProvider = options.connectionProvider;
    this.toolRegistry = options.toolRegistry;
    this.toolExecutor = options.toolExecutor;
    this.emitEvent = options.emitEvent;
  }

  // ============================================
  // Tool Filtering
  // ============================================

  /**
   * Extract tool filter configuration from server config.
   * Creates a ToolFilter object if includeTools or excludeTools are specified.
   *
   * @param config - Server configuration
   * @returns ToolFilter or undefined if no filtering configured
   */
  extractToolFilter(config: McpServerConfig): ToolFilter | undefined {
    if (config.includeTools?.length || config.excludeTools?.length) {
      return {
        includeTools: config.includeTools,
        excludeTools: config.excludeTools,
      };
    }
    return undefined;
  }

  /**
   * Filter tools based on server's include/exclude configuration.
   * Delegates to the standalone filterTools function.
   *
   * @param tools - Array of discovered MCP tools
   * @param filter - Tool filter configuration from server config
   * @returns Filtered array of tools (returns all if no filter)
   */
  filterTools(tools: McpTool[], filter?: ToolFilter): McpTool[] {
    return filterTools(tools, filter);
  }

  // ============================================
  // Capability Discovery
  // ============================================

  /**
   * Discover server capabilities (tools, resources, prompts).
   * Called after a connection is established to populate server metadata.
   *
   * @param connection - Active MCP connection
   */
  async discoverServerCapabilities(connection: McpConnection): Promise<void> {
    const { client, server } = connection;

    try {
      // Discover tools
      const toolsResponse = await client.listTools();
      const allTools: McpTool[] = toolsResponse.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as McpTool["inputSchema"],
      }));

      // Apply tool filter (whitelist/blacklist)
      server.tools = this.filterTools(allTools, server.toolFilter);

      // Discover resources
      try {
        const resourcesResponse = await client.listResources();
        server.resources = resourcesResponse.resources.map((resource) => ({
          uri: resource.uri,
          name: resource.name,
          mimeType: resource.mimeType,
          description: resource.description,
        }));
      } catch {
        // Resources not supported by server
        server.resources = [];
      }

      // Discover resource templates
      try {
        const templatesResponse = await client.listResourceTemplates();
        server.resourceTemplates = templatesResponse.resourceTemplates.map((template) => ({
          uriTemplate: template.uriTemplate,
          name: template.name,
          description: template.description,
          mimeType: template.mimeType,
        }));
      } catch {
        // Resource templates not supported
        server.resourceTemplates = [];
      }

      // Register tools with ToolRegistry if available
      if (this.toolRegistry && server.tools && server.uid) {
        this.registerServerTools(server);
      }
    } catch (error) {
      throw new McpConnectionError(
        `Failed to discover capabilities: ${error instanceof Error ? error.message : String(error)}`,
        server.name,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Register server tools with the ToolRegistry.
   * Called during capability discovery if toolRegistry is available.
   */
  private registerServerTools(server: McpConnection["server"]): void {
    if (!this.toolRegistry || !server.tools || !server.uid) {
      return;
    }

    const serverKey = server.uid;
    for (const tool of server.tools) {
      this.toolRegistry.registerMcpTool(
        serverKey,
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema ?? { type: "object" },
        },
        async (params: Record<string, unknown>) => {
          const response = await this.callTool(server.name, tool.name, params);
          return response.content;
        }
      );

      if (this.toolExecutor) {
        const registered = this.toolRegistry.get(`mcp:${serverKey}/${tool.name}`);
        if (registered) {
          this.toolExecutor.registerTool(registered);
        }
      }
    }
  }

  // ============================================
  // Tool Operations
  // ============================================

  /**
   * T023: Call a tool on a specific server.
   * Enforces timeout from server config and throws on disabled server.
   *
   * @param serverName - Server to call tool on
   * @param toolName - Name of the tool
   * @param args - Tool arguments
   * @returns Tool call response with typed content array
   * @throws McpToolError if server is disabled, not connected, or tool call fails
   * @throws McpTimeoutError if tool call exceeds configured timeout
   */
  async callTool(
    serverName: string,
    toolName: string,
    args?: Record<string, unknown>
  ): Promise<McpToolCallResponse> {
    const connection = this.connectionProvider.getConnection(serverName);

    if (!connection) {
      throw new McpToolError(`Server "${serverName}" not found`, serverName, toolName);
    }

    // T023: Enforce disabled server check
    if (connection.server.disabled || connection.server.statusInfo.status === "disabled") {
      throw new McpToolError(`Server "${serverName}" is disabled`, serverName, toolName);
    }

    if (connection.server.statusInfo.status !== "connected") {
      throw new McpToolError(
        `Server "${serverName}" is not connected (status: ${connection.server.statusInfo.status})`,
        serverName,
        toolName
      );
    }

    const startTime = Date.now();
    const timeoutSeconds = connection.server.timeout ?? DEFAULT_MCP_TIMEOUT_SECONDS;
    const timeoutMs = timeoutSeconds * 1000;

    try {
      // T023: Enforce timeout using Promise.race
      const toolCallPromise = connection.client.callTool({
        name: toolName,
        arguments: args,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new McpTimeoutError(
              `Tool call "${toolName}" timed out after ${timeoutSeconds}s`,
              serverName,
              timeoutMs
            )
          );
        }, timeoutMs);
      });

      const response = await Promise.race([toolCallPromise, timeoutPromise]);

      const duration = Date.now() - startTime;
      this.emitEvent?.("tool:called", { serverName, toolName, duration });

      return {
        content: (response.content ?? []) as McpToolCallResponse["content"],
        isError: Boolean(response.isError),
      };
    } catch (error) {
      // Re-throw timeout errors as-is
      if (error instanceof McpTimeoutError) {
        throw error;
      }

      throw new McpToolError(
        `Tool call failed: ${error instanceof Error ? error.message : String(error)}`,
        serverName,
        toolName,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get all available tools across all connected servers.
   *
   * @returns Array of tools with server name prefixed
   */
  getAllTools(): Array<McpTool & { serverName: string; serverUid: string }> {
    const tools: Array<McpTool & { serverName: string; serverUid: string }> = [];
    const connections = this.connectionProvider.getConnections();

    for (const connection of connections) {
      if (connection.server.statusInfo.status === "connected" && connection.server.tools) {
        for (const tool of connection.server.tools) {
          tools.push({
            ...tool,
            serverName: connection.server.name,
            serverUid: connection.server.uid || "",
          });
        }
      }
    }

    return tools;
  }

  /**
   * T022: Fetch tools list from a specific server.
   * Sends `tools/list` request and stores tools on the server object with autoApprove mapping.
   *
   * @param serverName - Server to fetch tools from
   * @returns Array of tools from the server
   * @throws McpToolError if server is disabled or not connected
   */
  async fetchToolsList(serverName: string): Promise<McpTool[]> {
    const connection = this.connectionProvider.getConnection(serverName);

    if (!connection) {
      throw new McpToolError(`Server "${serverName}" not found`, serverName, "tools/list");
    }

    // Check if server is disabled
    if (connection.server.disabled || connection.server.statusInfo.status === "disabled") {
      throw new McpToolError(`Server "${serverName}" is disabled`, serverName, "tools/list");
    }

    if (connection.server.statusInfo.status !== "connected") {
      throw new McpToolError(
        `Server "${serverName}" is not connected (status: ${connection.server.statusInfo.status})`,
        serverName,
        "tools/list"
      );
    }

    try {
      // Send tools/list request via SDK
      const response = await connection.client.listTools();

      // Parse server config to get autoApprove list
      const config = JSON.parse(connection.server.config) as McpServerConfig;
      const autoApproveList = config.autoApprove ?? [];

      // Map tools with autoApprove flag based on config
      const tools: McpTool[] = response.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as McpTool["inputSchema"],
        autoApprove: autoApproveList.includes(tool.name),
      }));

      // Store on server object
      connection.server.tools = tools;

      return tools;
    } catch (error) {
      throw new McpToolError(
        `Failed to fetch tools: ${error instanceof Error ? error.message : String(error)}`,
        serverName,
        "tools/list",
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  // ============================================
  // Resource Operations
  // ============================================

  /**
   * T024: Read a resource from a server.
   * Returns resource content (text or blob).
   *
   * @param serverName - Server to read resource from
   * @param uri - Resource URI
   * @returns Resource response with content
   * @throws McpConnectionError if server is disabled, not connected, or read fails
   */
  async readResource(serverName: string, uri: string): Promise<McpResourceResponse> {
    const connection = this.connectionProvider.getConnection(serverName);

    if (!connection) {
      throw new McpConnectionError(`Server "${serverName}" not found`, serverName);
    }

    // Check if server is disabled
    if (connection.server.disabled || connection.server.statusInfo.status === "disabled") {
      throw new McpConnectionError(`Server "${serverName}" is disabled`, serverName);
    }

    if (connection.server.statusInfo.status !== "connected") {
      throw new McpConnectionError(
        `Server "${serverName}" is not connected (status: ${connection.server.statusInfo.status})`,
        serverName
      );
    }

    try {
      const response = await connection.client.readResource({ uri });

      return {
        contents: (response.contents ?? []) as McpResourceResponse["contents"],
      };
    } catch (error) {
      throw new McpConnectionError(
        `Failed to read resource "${uri}": ${error instanceof Error ? error.message : String(error)}`,
        serverName,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get all available resources across all connected servers.
   *
   * @returns Array of resources with server name
   */
  getAllResources(): Array<McpResource & { serverName: string }> {
    const resources: Array<McpResource & { serverName: string }> = [];
    const connections = this.connectionProvider.getConnections();

    for (const connection of connections) {
      if (connection.server.statusInfo.status === "connected" && connection.server.resources) {
        for (const resource of connection.server.resources) {
          resources.push({
            ...resource,
            serverName: connection.server.name,
          });
        }
      }
    }

    return resources;
  }

  /**
   * T024: Fetch resources list from a specific server.
   * Sends `resources/list` request and stores resources on the server object.
   *
   * @param serverName - Server to fetch resources from
   * @returns Array of resources from the server
   * @throws McpConnectionError if server is not found or not connected
   */
  async fetchResourcesList(serverName: string): Promise<McpResource[]> {
    const connection = this.connectionProvider.getConnection(serverName);

    if (!connection) {
      throw new McpConnectionError(`Server "${serverName}" not found`, serverName);
    }

    // Check if server is disabled
    if (connection.server.disabled || connection.server.statusInfo.status === "disabled") {
      throw new McpConnectionError(`Server "${serverName}" is disabled`, serverName);
    }

    if (connection.server.statusInfo.status !== "connected") {
      throw new McpConnectionError(
        `Server "${serverName}" is not connected (status: ${connection.server.statusInfo.status})`,
        serverName
      );
    }

    try {
      // Send resources/list request via SDK
      const response = await connection.client.listResources();

      // Map resources to our type
      const resources: McpResource[] = response.resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        mimeType: resource.mimeType,
        description: resource.description,
      }));

      // Store on server object
      connection.server.resources = resources;

      return resources;
    } catch (error) {
      throw new McpConnectionError(
        `Failed to fetch resources: ${error instanceof Error ? error.message : String(error)}`,
        serverName,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  // ============================================
  // Prompt Operations
  // ============================================

  /**
   * T025: List prompts from a server.
   * Returns all available prompts with name, description, and arguments.
   *
   * @param serverName - Server to list prompts from
   * @returns Array of prompts
   * @throws McpConnectionError if server is disabled or not connected
   */
  async listPrompts(serverName: string): Promise<McpPrompt[]> {
    const connection = this.connectionProvider.getConnection(serverName);

    if (!connection) {
      throw new McpConnectionError(`Server "${serverName}" not found`, serverName);
    }

    // Check if server is disabled
    if (connection.server.disabled || connection.server.statusInfo.status === "disabled") {
      throw new McpConnectionError(`Server "${serverName}" is disabled`, serverName);
    }

    if (connection.server.statusInfo.status !== "connected") {
      throw new McpConnectionError(
        `Server "${serverName}" is not connected (status: ${connection.server.statusInfo.status})`,
        serverName
      );
    }

    try {
      const response = await connection.client.listPrompts();

      return response.prompts.map((prompt) => ({
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments?.map((arg) => ({
          name: arg.name,
          description: arg.description,
          required: arg.required,
        })),
      }));
    } catch (error) {
      throw new McpConnectionError(
        `Failed to list prompts: ${error instanceof Error ? error.message : String(error)}`,
        serverName,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * T025: Get a specific prompt from a server and execute it.
   * Returns prompt messages that can be used in conversations.
   *
   * @param serverName - Server to get prompt from
   * @param promptName - Name of the prompt
   * @param args - Prompt arguments (key-value pairs)
   * @returns Prompt response with description and messages
   * @throws McpConnectionError if server is disabled or not connected
   */
  async getPrompt(
    serverName: string,
    promptName: string,
    args?: Record<string, string>
  ): Promise<McpPromptResponse> {
    const connection = this.connectionProvider.getConnection(serverName);

    if (!connection) {
      throw new McpConnectionError(`Server "${serverName}" not found`, serverName);
    }

    // Check if server is disabled
    if (connection.server.disabled || connection.server.statusInfo.status === "disabled") {
      throw new McpConnectionError(`Server "${serverName}" is disabled`, serverName);
    }

    if (connection.server.statusInfo.status !== "connected") {
      throw new McpConnectionError(
        `Server "${serverName}" is not connected (status: ${connection.server.statusInfo.status})`,
        serverName
      );
    }

    try {
      const response = await connection.client.getPrompt({
        name: promptName,
        arguments: args,
      });

      return {
        description: response.description,
        messages: response.messages.map((msg) => ({
          role: msg.role,
          content: msg.content as McpPromptResponse["messages"][0]["content"],
        })),
      };
    } catch (error) {
      throw new McpConnectionError(
        `Failed to get prompt "${promptName}": ${error instanceof Error ? error.message : String(error)}`,
        serverName,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }
}
