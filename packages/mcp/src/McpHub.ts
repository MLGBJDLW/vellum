// ============================================
// T008-T015: McpHub - Central MCP Server Manager
// ============================================

import fs from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ToolExecutor, ToolRegistry } from "@vellum/core";
import { type FSWatcher, watch } from "chokidar";
import { customAlphabet } from "nanoid";
import {
  CONFIG_WATCH_DEBOUNCE_MS,
  DEFAULT_MCP_TIMEOUT_SECONDS,
  MCP_CLIENT_NAME,
} from "./constants.js";
import { expandEnvironmentVariables } from "./env-expansion.js";
import { McpConnectionError, McpTimeoutError, McpToolError } from "./errors.js";
import { McpOAuthManager, type OAuthCredentialManager } from "./McpOAuthManager.js";
import { validateMcpSettings } from "./schemas.js";
import type {
  McpConnection,
  McpHubEvents,
  McpPrompt,
  McpPromptResponse,
  McpResource,
  McpResourceResponse,
  McpServer,
  McpServerConfig,
  McpSettings,
  McpStdioConfig,
  McpTool,
  McpToolCallResponse,
} from "./types.js";

// ============================================
// T015: Server UID Generation
// ============================================

/**
 * Generate a unique 6-character ID prefixed with 'c' for MCP servers.
 * Uses lowercase alphanumeric characters for readability.
 */
const generateUid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 6);

// ============================================
// Types
// ============================================

/**
 * Configuration options for McpHub initialization.
 */
export interface McpHubOptions {
  /**
   * Function that returns the path to the MCP servers configuration file.
   * Typically returns `~/.vellum/mcp.json`.
   */
  getMcpServersPath: () => Promise<string>;

  /**
   * Function that returns the path to the settings directory.
   * Used for storing OAuth tokens and other persistent data.
   */
  getSettingsDirectoryPath: () => Promise<string>;

  /**
   * Client version string for MCP protocol handshake.
   */
  clientVersion: string;

  /**
   * Optional project-specific config path (e.g., `.vellum/mcp.json`).
   */
  projectConfigPath?: () => Promise<string | undefined>;

  /**
   * Event listener for hub events (optional).
   */
  onEvent?: <K extends keyof McpHubEvents>(event: K, data: McpHubEvents[K]) => void;

  /**
   * Optional credential manager for OAuth token persistence.
   * When provided, OAuth tokens will be stored and restored across sessions
   * using the `mcp:*` namespace.
   */
  credentialManager?: OAuthCredentialManager;

  /**
   * Optional tool registry for automatic MCP tool registration.
   * When provided, MCP tools will be automatically registered/unregistered
   * as servers connect/disconnect.
   */
  toolRegistry?: ToolRegistry;

  /**
   * Optional tool executor for executing MCP tools via ToolExecutor.
   * When provided, MCP tools will be registered for execution.
   */
  toolExecutor?: ToolExecutor;
}

/**
 * Result of reading and validating a config file.
 */
interface ConfigReadResult {
  success: boolean;
  data?: McpSettings;
  error?: string;
}

// ============================================
// McpHub Class
// ============================================

/**
 * McpHub - Central manager for MCP server connections.
 *
 * Provides:
 * - Connection lifecycle management (connect, disconnect, restart)
 * - Configuration file watching with hot-reload
 * - Tool/Resource/Prompt discovery
 * - Incremental server updates (add/remove/modify)
 * - Unique server ID generation for short tool names
 *
 * @example
 * ```typescript
 * const hub = new McpHub({
 *   getMcpServersPath: () => Promise.resolve('~/.vellum/mcp.json'),
 *   getSettingsDirectoryPath: () => Promise.resolve('~/.vellum'),
 *   clientVersion: '1.0.0',
 * });
 *
 * await hub.initialize();
 * const servers = hub.getServers();
 * await hub.callTool('serverName', 'toolName', { arg: 'value' });
 * await hub.dispose();
 * ```
 */
export class McpHub {
  // ============================================
  // T015: Bidirectional UID Mapping (Static)
  // ============================================

  /**
   * Maps server names to their unique IDs (name → uid).
   */
  private static serverNameToUid: Map<string, string> = new Map();

  /**
   * Maps unique IDs back to server names (uid → name).
   */
  private static uidToServerName: Map<string, string> = new Map();

  // ============================================
  // T008: Instance State
  // ============================================

  /**
   * Active connections to MCP servers.
   */
  public connections: McpConnection[] = [];

  /**
   * Whether initialization is in progress.
   */
  public isConnecting = false;

  /**
   * Whether the hub has been disposed.
   */
  private isDisposed = false;

  // Configuration functions
  private getMcpServersPath: () => Promise<string>;
  // Reserved for future OAuth token storage (McpOAuthManager integration)
  private _getSettingsDirectoryPath: () => Promise<string>;
  private projectConfigPath?: () => Promise<string | undefined>;
  private clientVersion: string;
  private onEvent?: McpHubOptions["onEvent"];

  // OAuth credential management
  private credentialManager?: OAuthCredentialManager;
  private oauthManager?: McpOAuthManager;

  // Tool Registry integration
  private toolRegistry?: ToolRegistry;
  private toolExecutor?: ToolExecutor;

  // Watchers
  private settingsWatcher?: FSWatcher;
  private projectWatcher?: FSWatcher;

  // T036: Source file watchers for Stdio servers (build/index.js pattern)
  private sourceFileWatchers: Map<string, FSWatcher> = new Map();

  // Debounce state
  private configReloadTimeout?: ReturnType<typeof setTimeout>;
  private pendingConfigReload = false;

  // ============================================
  // T008: Constructor
  // ============================================

  /**
   * Creates a new McpHub instance.
   *
   * @param options - Configuration options
   */
  constructor(options: McpHubOptions) {
    this.getMcpServersPath = options.getMcpServersPath;
    this._getSettingsDirectoryPath = options.getSettingsDirectoryPath;
    this.clientVersion = options.clientVersion;
    this.projectConfigPath = options.projectConfigPath;
    this.onEvent = options.onEvent;
    this.credentialManager = options.credentialManager;
    this.toolRegistry = options.toolRegistry;
    this.toolExecutor = options.toolExecutor;

    // Initialize OAuth manager if credential manager is provided
    if (this.credentialManager) {
      this.oauthManager = new McpOAuthManager(this.credentialManager);
    }
  }

  /**
   * Get the settings directory path. Used for OAuth token storage.
   * @returns Path to the settings directory
   */
  getSettingsDirectory(): Promise<string> {
    return this._getSettingsDirectoryPath();
  }

  /**
   * Get the OAuth manager instance.
   * Returns undefined if no credential manager was provided.
   * @returns McpOAuthManager instance or undefined
   */
  getOAuthManager(): McpOAuthManager | undefined {
    return this.oauthManager;
  }

  // ============================================
  // T008: Initialization
  // ============================================

  /**
   * Initialize the McpHub by reading configuration and connecting to servers.
   * Sets up file watchers for hot-reload.
   */
  async initialize(): Promise<void> {
    if (this.isDisposed) {
      throw new Error("McpHub has been disposed");
    }

    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      // Start watching config files
      await this.watchMcpSettingsFile();

      // Read and validate global config
      const globalPath = await this.getMcpServersPath();
      const globalConfig = await this.readAndValidateMcpSettingsFile(globalPath);

      // Read and validate project config if available
      let projectConfig: ConfigReadResult = { success: false };
      if (this.projectConfigPath) {
        const projectPath = await this.projectConfigPath();
        if (projectPath) {
          projectConfig = await this.readAndValidateMcpSettingsFile(projectPath);
        }
      }

      // T044: Plugin .mcp.json files will be loaded by PluginManager
      // and merged here at runtime via updateServerConnections()

      // Merge configurations (project overrides global)
      const mergedServers = {
        ...(globalConfig.data?.mcpServers || {}),
        ...(projectConfig.data?.mcpServers || {}),
      };

      // Connect to all configured servers
      await this.updateServerConnections(mergedServers);

      this.emitEvent("config:reloaded", { serverCount: Object.keys(mergedServers).length });
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Dispose of all resources and close all connections.
   */
  async dispose(): Promise<void> {
    this.isDisposed = true;

    // Clear pending reload
    if (this.configReloadTimeout) {
      clearTimeout(this.configReloadTimeout);
      this.configReloadTimeout = undefined;
    }

    // Dispose OAuth manager
    this.oauthManager?.dispose();
    this.oauthManager = undefined;

    // Close watchers
    await this.settingsWatcher?.close();
    await this.projectWatcher?.close();
    this.settingsWatcher = undefined;
    this.projectWatcher = undefined;

    // T036: Close all source file watchers
    for (const [, watcher] of this.sourceFileWatchers) {
      await watcher.close();
    }
    this.sourceFileWatchers.clear();

    // Close all connections
    const disconnectPromises = this.connections.map((conn) =>
      this.deleteConnection(conn.server.name)
    );
    await Promise.allSettled(disconnectPromises);

    this.connections = [];
  }

  // ============================================
  // T009: Config File Reading and Validation
  // ============================================

  /**
   * Read and validate an MCP settings file.
   * Handles missing files gracefully by returning empty configuration.
   *
   * @param filePath - Absolute path to the configuration file
   * @returns Validation result with parsed data or error
   */
  async readAndValidateMcpSettingsFile(filePath: string): Promise<ConfigReadResult> {
    try {
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        // File doesn't exist - return empty config (not an error)
        return {
          success: true,
          data: { mcpServers: {} },
        };
      }

      // Read file contents
      const content = await fs.readFile(filePath, "utf-8");

      // Handle empty file
      if (!content.trim()) {
        return {
          success: true,
          data: { mcpServers: {} },
        };
      }

      // Parse JSON
      let rawConfig: unknown;
      try {
        rawConfig = JSON.parse(content);
      } catch (parseError) {
        return {
          success: false,
          error: `Invalid JSON in ${filePath}: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        };
      }

      // Validate with Zod schema
      const validationResult = validateMcpSettings(rawConfig);

      if (!validationResult.success || !validationResult.data) {
        return {
          success: false,
          error: `Configuration validation failed for ${filePath}:\n${validationResult.errors?.join("\n")}`,
        };
      }

      // Expand environment variables in the config
      const expandedData = expandEnvironmentVariables(validationResult.data);

      return {
        success: true,
        data: expandedData as McpSettings,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ============================================
  // T010: Server Connection
  // ============================================

  /**
   * Connect to a single MCP server.
   * Creates transport, establishes connection, and discovers capabilities.
   *
   * @param name - Server name from configuration
   * @param config - Server configuration
   */
  private async connectToServer(name: string, config: McpServerConfig): Promise<void> {
    // Check if server is disabled
    if (config.disabled) {
      const server: McpServer = {
        name,
        config: JSON.stringify(config),
        statusInfo: { status: "disabled" },
        disabled: true,
        uid: this.getMcpServerKey(name),
      };

      // Add as a placeholder connection (no client/transport)
      this.connections.push({
        server,
        client: null as unknown as Client,
        transport: null as unknown as McpConnection["transport"],
      });

      return;
    }

    // Create server entry with connecting status
    const server: McpServer = {
      name,
      config: JSON.stringify(config),
      statusInfo: { status: "connecting" },
      timeout: config.timeout ?? DEFAULT_MCP_TIMEOUT_SECONDS,
      uid: this.getMcpServerKey(name),
    };

    this.emitEvent("server:status", { serverName: name, status: server.statusInfo });

    try {
      // Create transport based on config type
      const transport = await this.createTransport(name, config);

      // Create MCP client
      const client = new Client(
        { name: MCP_CLIENT_NAME, version: this.clientVersion },
        { capabilities: {} }
      );

      // Set up transport error handlers
      transport.onerror = (error) => {
        this.handleTransportError(name, error);
      };

      transport.onclose = () => {
        this.handleTransportClose(name);
      };

      // Connect client to transport
      await client.connect(transport);

      // Create connection entry
      const connection: McpConnection = {
        server,
        client,
        transport: transport as McpConnection["transport"],
      };

      // Discover capabilities
      await this.discoverServerCapabilities(connection);

      // Update status to connected
      connection.server.statusInfo = { status: "connected" };

      // Add to connections
      this.connections.push(connection);

      this.emitEvent("server:status", { serverName: name, status: { status: "connected" } });
      this.emitEvent("server:connected", {
        serverName: name,
        tools: connection.server.tools || [],
        resources: connection.server.resources || [],
      });
    } catch (error) {
      // Set status to failed
      const errorMessage = error instanceof Error ? error.message : String(error);
      server.statusInfo = { status: "failed", error: errorMessage };

      // Add failed connection to track status
      this.connections.push({
        server,
        client: null as unknown as Client,
        transport: null as unknown as McpConnection["transport"],
      });

      this.emitEvent("server:status", { serverName: name, status: server.statusInfo });
      this.emitEvent("server:error", {
        serverName: name,
        error: error instanceof Error ? error : new Error(errorMessage),
      });
    }
  }

  /**
   * Create a transport instance based on configuration type.
   */
  private async createTransport(name: string, config: McpServerConfig): Promise<Transport> {
    const configType = config.type ?? "stdio";

    switch (configType) {
      case "stdio": {
        const stdioConfig = config as McpStdioConfig;

        const transport = new StdioClientTransport({
          command: stdioConfig.command,
          args: stdioConfig.args ?? [],
          cwd: stdioConfig.cwd,
          env: {
            ...getDefaultEnvironment(),
            ...(stdioConfig.env ?? {}),
          },
          stderr: "pipe",
        });

        // T036: Set up source file watching if args contain build/index.js pattern
        this.setupSourceFileWatching(name, stdioConfig);

        return transport;
      }

      case "sse":
      case "streamableHttp":
      case "remote": {
        // TODO: Implement remote transports in Phase 3 (T016-T023)
        throw new McpConnectionError(`Remote transport "${configType}" not yet implemented`, name);
      }

      default:
        throw new McpConnectionError(`Unknown transport type: ${configType}`, name);
    }
  }

  /**
   * Discover server capabilities (tools, resources, prompts).
   */
  private async discoverServerCapabilities(connection: McpConnection): Promise<void> {
    const { client, server } = connection;

    try {
      // Discover tools
      const toolsResponse = await client.listTools();
      server.tools = toolsResponse.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as McpTool["inputSchema"],
      }));

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
    } catch (error) {
      throw new McpConnectionError(
        `Failed to discover capabilities: ${error instanceof Error ? error.message : String(error)}`,
        server.name,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Handle transport error.
   */
  private handleTransportError(serverName: string, error: Error): void {
    const connection = this.connections.find((c) => c.server.name === serverName);
    if (connection) {
      connection.server.statusInfo = { status: "failed", error: error.message };
      this.emitEvent("server:status", { serverName, status: connection.server.statusInfo });
      this.emitEvent("server:error", { serverName, error });
    }
  }

  /**
   * Handle transport close.
   */
  private handleTransportClose(serverName: string): void {
    const connection = this.connections.find((c) => c.server.name === serverName);
    if (connection && connection.server.statusInfo.status !== "failed") {
      connection.server.statusInfo = { status: "disconnected" };
      this.emitEvent("server:status", { serverName, status: { status: "disconnected" } });
      this.emitEvent("server:disconnected", { serverName });
    }
  }

  // ============================================
  // T011: Connection Cleanup
  // ============================================

  /**
   * Delete a connection and clean up resources.
   * Closes transport and removes from connections array.
   *
   * @param name - Server name to disconnect
   */
  async deleteConnection(name: string): Promise<void> {
    const index = this.connections.findIndex((c) => c.server.name === name);

    if (index === -1) {
      return;
    }

    const connection = this.connections.at(index);
    if (!connection) {
      return;
    }

    // Unregister tools from ToolRegistry if available
    if (this.toolRegistry && connection.server.uid) {
      const unregisteredCount = this.toolRegistry.unregisterMcpTools(connection.server.uid);
      if (unregisteredCount > 0) {
        this.emitEvent(
          "tool:unregistered" as never,
          {
            serverName: name,
            count: unregisteredCount,
          } as never
        );
      }
    }

    // Close transport if it exists and has close method
    if (connection.transport && typeof connection.transport.close === "function") {
      try {
        await connection.transport.close();
      } catch (error) {
        // Log but don't throw - best effort cleanup
        console.warn(`Error closing transport for ${name}:`, error);
      }
    }

    // Close client if it exists
    if (connection.client && typeof connection.client.close === "function") {
      try {
        await connection.client.close();
      } catch (error) {
        console.warn(`Error closing client for ${name}:`, error);
      }
    }

    // Remove from connections array
    this.connections.splice(index, 1);

    this.emitEvent("server:disconnected", { serverName: name });
  }

  // ============================================
  // T012: Connection Restart
  // ============================================

  /**
   * Restart a connection by disconnecting and reconnecting.
   *
   * @param serverName - Name of the server to restart
   */
  async restartConnection(serverName: string): Promise<void> {
    const connection = this.connections.find((c) => c.server.name === serverName);

    if (!connection) {
      throw new McpConnectionError(`Server "${serverName}" not found`, serverName);
    }

    // Parse the stored config
    const config = JSON.parse(connection.server.config) as McpServerConfig;

    // Update status to connecting
    connection.server.statusInfo = { status: "connecting" };
    this.emitEvent("server:status", { serverName, status: { status: "connecting" } });

    // Delete the existing connection
    await this.deleteConnection(serverName);

    // Reconnect with the same config
    await this.connectToServer(serverName, config);
  }

  // ============================================
  // T013: Config File Watching
  // ============================================

  /**
   * Set up file watching for MCP settings files.
   * Detects changes and triggers hot-reload with debouncing.
   */
  private async watchMcpSettingsFile(): Promise<void> {
    const globalPath = await this.getMcpServersPath();

    // Watch global config file
    this.settingsWatcher = watch(globalPath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 10,
      },
    });

    this.settingsWatcher.on("change", () => {
      this.handleConfigChange();
    });

    this.settingsWatcher.on("add", () => {
      this.handleConfigChange();
    });

    this.settingsWatcher.on("unlink", () => {
      this.handleConfigChange();
    });

    // Watch project config if available
    if (this.projectConfigPath) {
      const projectPath = await this.projectConfigPath();
      if (projectPath) {
        this.projectWatcher = watch(projectPath, {
          ignoreInitial: true,
          awaitWriteFinish: {
            stabilityThreshold: 50,
            pollInterval: 10,
          },
        });

        this.projectWatcher.on("change", () => {
          this.handleConfigChange();
        });

        this.projectWatcher.on("add", () => {
          this.handleConfigChange();
        });

        this.projectWatcher.on("unlink", () => {
          this.handleConfigChange();
        });
      }
    }
  }

  /**
   * Handle config file change with debouncing.
   * Debounces changes by CONFIG_WATCH_DEBOUNCE_MS (100ms).
   */
  private handleConfigChange(): void {
    // Clear any pending reload
    if (this.configReloadTimeout) {
      clearTimeout(this.configReloadTimeout);
    }

    // Set pending flag
    this.pendingConfigReload = true;

    // Debounce the reload
    this.configReloadTimeout = setTimeout(async () => {
      if (!this.pendingConfigReload || this.isDisposed) {
        return;
      }

      this.pendingConfigReload = false;

      try {
        await this.reloadConfiguration();
      } catch (error) {
        console.error("Failed to reload MCP configuration:", error);
      }
    }, CONFIG_WATCH_DEBOUNCE_MS);
  }

  /**
   * Reload configuration from disk and apply changes.
   */
  private async reloadConfiguration(): Promise<void> {
    // Read global config
    const globalPath = await this.getMcpServersPath();
    const globalConfig = await this.readAndValidateMcpSettingsFile(globalPath);

    if (!globalConfig.success) {
      console.error("Failed to read global config:", globalConfig.error);
      return;
    }

    // Read project config if available
    let projectConfig: ConfigReadResult = { success: false };
    if (this.projectConfigPath) {
      const projectPath = await this.projectConfigPath();
      if (projectPath) {
        projectConfig = await this.readAndValidateMcpSettingsFile(projectPath);
      }
    }

    // Merge configurations
    const mergedServers = {
      ...(globalConfig.data?.mcpServers || {}),
      ...(projectConfig.data?.mcpServers || {}),
    };

    // Apply incremental updates
    await this.updateServerConnections(mergedServers);

    this.emitEvent("config:reloaded", { serverCount: Object.keys(mergedServers).length });
  }

  // ============================================
  // T036: Source File Watching for Stdio Servers
  // ============================================

  /**
   * Set up source file watching for a stdio server.
   * Watches files matching `build/index.js` pattern in args and restarts
   * the server when changes are detected.
   *
   * @param serverName - Name of the server
   * @param config - Stdio server configuration
   */
  private setupSourceFileWatching(serverName: string, config: McpStdioConfig): void {
    if (!config.args || config.args.length === 0) {
      return;
    }

    // Find args that match the build/index.js pattern
    const buildIndexPattern = /build[/\\]index\.js$/;
    const watchablePaths = config.args.filter((arg) => buildIndexPattern.test(arg));

    if (watchablePaths.length === 0) {
      return;
    }

    // Resolve paths relative to cwd if provided
    const resolvedPaths = watchablePaths.map((p) => {
      if (config.cwd && !p.startsWith("/") && !p.match(/^[A-Z]:/i)) {
        return `${config.cwd}/${p}`;
      }
      return p;
    });

    // Close existing watcher for this server if any
    const existingWatcher = this.sourceFileWatchers.get(serverName);
    if (existingWatcher) {
      existingWatcher.close();
      this.sourceFileWatchers.delete(serverName);
    }

    // Create new watcher
    const watcher = watch(resolvedPaths, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 20,
      },
    });

    watcher.on("change", (filePath) => {
      this.handleSourceFileChange(serverName, filePath as string);
    });

    this.sourceFileWatchers.set(serverName, watcher);
  }

  /**
   * Handle source file change by restarting the affected server.
   *
   * @param serverName - Name of the server to restart
   * @param _filePath - Path of the changed file (unused, logged via event)
   */
  private handleSourceFileChange(serverName: string, _filePath: string): void {
    if (this.isDisposed) {
      return;
    }

    this.emitEvent("server:status", {
      serverName,
      status: { status: "connecting" },
    });

    // Restart the server
    this.restartConnection(serverName).catch((error) => {
      console.error(`Failed to restart server "${serverName}" after source file change:`, error);
    });
  }

  /**
   * Clean up source file watcher for a server.
   *
   * @param serverName - Name of the server
   */
  private async cleanupSourceFileWatcher(serverName: string): Promise<void> {
    const watcher = this.sourceFileWatchers.get(serverName);
    if (watcher) {
      await watcher.close();
      this.sourceFileWatchers.delete(serverName);
    }
  }

  // ============================================
  // T014: Incremental Server Updates
  // ============================================

  /**
   * Update server connections incrementally based on new configuration.
   * Identifies added, removed, and modified servers.
   *
   * @param newServers - New server configuration map
   */
  async updateServerConnections(newServers: Record<string, McpServerConfig>): Promise<void> {
    const currentServerNames = new Set(this.connections.map((c) => c.server.name));
    const newServerNames = new Set(Object.keys(newServers));

    // Identify changes
    const { toAdd, toRemove, toRestart } = this.categorizeServerChanges(
      currentServerNames,
      newServerNames,
      newServers
    );

    // Apply changes in order: remove → restart → add
    await this.applyServerRemovals(toRemove);
    await this.applyServerRestarts(toRestart, newServers);
    await this.applyServerAdditions(toAdd, newServers);
  }

  /**
   * Categorize servers into add/remove/restart based on config changes.
   */
  private categorizeServerChanges(
    currentNames: Set<string>,
    newNames: Set<string>,
    newServers: Record<string, McpServerConfig>
  ): { toAdd: string[]; toRemove: string[]; toRestart: string[] } {
    const toAdd: string[] = [];
    const toRemove: string[] = [];
    const toRestart: string[] = [];

    // Find servers to add
    for (const name of newNames) {
      if (!currentNames.has(name)) {
        toAdd.push(name);
      }
    }

    // Find servers to remove
    for (const name of currentNames) {
      if (!newNames.has(name)) {
        toRemove.push(name);
      }
    }

    // Find servers that need restart
    for (const name of newNames) {
      if (!currentNames.has(name)) continue;

      const connection = this.connections.find((c) => c.server.name === name);
      const newConfig = newServers[name];
      if (!connection || !newConfig) continue;

      const oldConfig = JSON.parse(connection.server.config) as McpServerConfig;
      if (this.configsRequireRestart(oldConfig, newConfig)) {
        toRestart.push(name);
      } else {
        // Update in place
        connection.server.config = JSON.stringify(newConfig);
        connection.server.disabled = newConfig.disabled;
        connection.server.timeout = newConfig.timeout ?? DEFAULT_MCP_TIMEOUT_SECONDS;
      }
    }

    return { toAdd, toRemove, toRestart };
  }

  /**
   * Remove servers and clean up their UID mappings.
   */
  private async applyServerRemovals(names: string[]): Promise<void> {
    for (const name of names) {
      await this.deleteConnection(name);
      // T036: Clean up source file watcher
      await this.cleanupSourceFileWatcher(name);
      const uid = McpHub.serverNameToUid.get(name);
      if (uid) {
        McpHub.uidToServerName.delete(uid);
        McpHub.serverNameToUid.delete(name);
      }
    }
  }

  /**
   * Restart servers with new config.
   */
  private async applyServerRestarts(
    names: string[],
    servers: Record<string, McpServerConfig>
  ): Promise<void> {
    for (const name of names) {
      await this.deleteConnection(name);
      const config = servers[name];
      if (config) {
        await this.connectToServer(name, config);
      }
    }
  }

  /**
   * Add new servers.
   */
  private async applyServerAdditions(
    names: string[],
    servers: Record<string, McpServerConfig>
  ): Promise<void> {
    for (const name of names) {
      const config = servers[name];
      if (config) {
        await this.connectToServer(name, config);
      }
    }
  }

  /**
   * Compare two values for equality, handling arrays/objects via JSON.
   */
  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a === "object" && a !== null && b !== null) {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }

  /**
   * Check if stdio config requires restart.
   */
  private stdioConfigRequiresRestart(
    oldConfig: McpStdioConfig,
    newConfig: McpStdioConfig
  ): boolean {
    if (oldConfig.command !== newConfig.command) return true;
    if (!this.valuesEqual(oldConfig.args ?? [], newConfig.args ?? [])) return true;
    if (oldConfig.cwd !== newConfig.cwd) return true;
    if (!this.valuesEqual(oldConfig.env ?? {}, newConfig.env ?? {})) return true;
    return false;
  }

  /**
   * Check if remote config (SSE/HTTP) requires restart.
   */
  private remoteConfigRequiresRestart(
    oldConfig: { url: string; headers?: Record<string, string> },
    newConfig: { url: string; headers?: Record<string, string> }
  ): boolean {
    if (oldConfig.url !== newConfig.url) return true;
    if (!this.valuesEqual(oldConfig.headers ?? {}, newConfig.headers ?? {})) return true;
    return false;
  }

  /**
   * Check if config changes require a connection restart.
   * Only returns true for connection-affecting properties.
   *
   * @param oldConfig - Previous configuration
   * @param newConfig - New configuration
   * @returns True if restart is required
   */
  configsRequireRestart(oldConfig: McpServerConfig, newConfig: McpServerConfig): boolean {
    const oldType = oldConfig.type ?? "stdio";
    const newType = newConfig.type ?? "stdio";

    // Type or disabled change always requires restart
    if (oldType !== newType || oldConfig.disabled !== newConfig.disabled) {
      return true;
    }

    switch (oldType) {
      case "stdio":
        return this.stdioConfigRequiresRestart(
          oldConfig as McpStdioConfig,
          newConfig as McpStdioConfig
        );
      case "sse":
      case "streamableHttp":
      case "remote":
        return this.remoteConfigRequiresRestart(
          oldConfig as { url: string; headers?: Record<string, string> },
          newConfig as { url: string; headers?: Record<string, string> }
        );
      default:
        return true;
    }
  }

  // ============================================
  // T015: Server UID Generation
  // ============================================

  /**
   * Get or create a unique ID for a server.
   * Returns a 6-char nanoid prefixed with 'c' (e.g., "c1a2b3c").
   * Maintains bidirectional mapping for lookups.
   *
   * @param serverName - Server name to get UID for
   * @returns Server UID (7 chars total: 'c' prefix + 6 char nanoid)
   */
  getMcpServerKey(serverName: string): string {
    // Check if we already have a UID for this server
    const existingUid = McpHub.serverNameToUid.get(serverName);
    if (existingUid) {
      return existingUid;
    }

    // Generate new UID with 'c' prefix
    const uid = `c${generateUid()}`;

    // Store in bidirectional maps
    McpHub.serverNameToUid.set(serverName, uid);
    McpHub.uidToServerName.set(uid, serverName);

    return uid;
  }

  /**
   * Look up a server name by its UID.
   *
   * @param uid - Server UID to look up
   * @returns Server name or undefined if not found
   */
  static getMcpServerByKey(uid: string): string | undefined {
    return McpHub.uidToServerName.get(uid);
  }

  /**
   * Get all registered server UIDs.
   *
   * @returns Map of server names to UIDs
   */
  static getAllServerKeys(): ReadonlyMap<string, string> {
    return McpHub.serverNameToUid;
  }

  // ============================================
  // Public API: Server Access
  // ============================================

  /**
   * Get all configured servers and their status.
   *
   * @returns Array of server metadata
   */
  getServers(): McpServer[] {
    return this.connections.map((c) => c.server);
  }

  /**
   * Get a specific server by name.
   *
   * @param name - Server name
   * @returns Server metadata or undefined
   */
  getServer(name: string): McpServer | undefined {
    return this.connections.find((c) => c.server.name === name)?.server;
  }

  /**
   * Get a connection by server name.
   *
   * @param name - Server name
   * @returns Connection or undefined
   */
  getConnection(name: string): McpConnection | undefined {
    return this.connections.find((c) => c.server.name === name);
  }

  /**
   * Check if a server is connected and available.
   *
   * @param name - Server name
   * @returns True if server is connected
   */
  isServerConnected(name: string): boolean {
    const connection = this.getConnection(name);
    return connection?.server.statusInfo.status === "connected";
  }

  // ============================================
  // Public API: Tool Operations
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
    const connection = this.getConnection(serverName);

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
      this.emitEvent("tool:called", { serverName, toolName, duration });

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

    for (const connection of this.connections) {
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
    const connection = this.getConnection(serverName);

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
  // Public API: Resource Operations
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
    const connection = this.getConnection(serverName);

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

    for (const connection of this.connections) {
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
    const connection = this.getConnection(serverName);

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
  // Public API: Prompt Operations
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
    const connection = this.getConnection(serverName);

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
    const connection = this.getConnection(serverName);

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

  // ============================================
  // Private: Event Emission
  // ============================================

  /**
   * Emit an event to the registered listener.
   */
  private emitEvent<K extends keyof McpHubEvents>(event: K, data: McpHubEvents[K]): void {
    if (this.onEvent) {
      this.onEvent(event, data);
    }
  }
}

export default McpHub;
