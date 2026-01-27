// ============================================
// T008-T015: McpHub - Central MCP Server Manager
// ============================================

import type { ToolExecutor, ToolRegistry } from "@vellum/core";
import { McpConnectionError } from "./errors.js";
import { type ConnectionProvider, McpCapabilityDiscovery } from "./McpCapabilityDiscovery.js";
import {
  type ConfigReadResult,
  type McpConfigChangeHandler,
  McpConfigManager,
} from "./McpConfigManager.js";
import { McpIncrementalUpdater } from "./McpIncrementalUpdater.js";
import { McpOAuthManager, type OAuthCredentialManager } from "./McpOAuthManager.js";
import { type ConnectionStore, McpServerLifecycle } from "./McpServerLifecycle.js";
import { McpServerRegistry } from "./McpServerRegistry.js";
// Schema validation is now handled by McpConfigManager
import type {
  McpConnection,
  McpHubEvents,
  McpPrompt,
  McpPromptResponse,
  McpResource,
  McpResourceResponse,
  McpServer,
  McpServerConfig,
  McpTool,
  McpToolCallResponse,
} from "./types.js";

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

// ConfigReadResult is imported from McpConfigManager

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
export class McpHub implements ConnectionProvider {
  // ============================================
  // T015: Server UID Registry (Instance-level)
  // ============================================

  /**
   * Registry for server name/UID bidirectional mapping.
   * Instance-level to prevent memory leaks from static state.
   */
  private readonly registry = new McpServerRegistry();

  /**
   * Shared registry instance for static method delegation.
   * Set on construction, used by static methods for backward compatibility.
   */
  private static sharedRegistry: McpServerRegistry | undefined;

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

  // Configuration manager
  private readonly configManager: McpConfigManager;

  // Capability discovery and operations
  private readonly capabilityDiscovery: McpCapabilityDiscovery;

  // Connection lifecycle management
  private readonly lifecycle: McpServerLifecycle;

  // Incremental update manager
  private readonly updater: McpIncrementalUpdater;

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

    // Set shared registry for static method backward compatibility
    McpHub.sharedRegistry = this.registry;

    // Initialize config manager
    this.configManager = new McpConfigManager({
      globalConfigPath: this.getMcpServersPath,
      projectConfigPath: this.projectConfigPath,
    });

    // Initialize OAuth manager if credential manager is provided
    if (this.credentialManager) {
      this.oauthManager = new McpOAuthManager(this.credentialManager);
    }

    // Initialize capability discovery
    this.capabilityDiscovery = new McpCapabilityDiscovery({
      connectionProvider: this,
      toolRegistry: this.toolRegistry,
      toolExecutor: this.toolExecutor,
      emitEvent: (event, data) => this.emitEvent(event, data),
    });

    // Initialize connection lifecycle manager
    this.lifecycle = new McpServerLifecycle({
      registry: this.registry,
      capabilityDiscovery: this.capabilityDiscovery,
      oauthManager: this.oauthManager,
      protocolVersion: this.clientVersion,
      emitEvent: (event, data) => this.emitEvent(event, data),
    });

    // Set connection store for lifecycle management
    this.lifecycle.setConnectionStore(this.createConnectionStore());

    // Initialize incremental updater
    this.updater = new McpIncrementalUpdater({
      lifecycle: this.lifecycle,
      registry: this.registry,
    });
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

  /**
   * Create a connection store for the lifecycle manager.
   * Provides access to the connections array.
   */
  private createConnectionStore(): ConnectionStore {
    return {
      getConnections: () => this.connections,
      addConnection: (connection: McpConnection) => {
        this.connections.push(connection);
      },
      removeConnection: (serverName: string) => {
        const index = this.connections.findIndex((c) => c.server.name === serverName);
        if (index === -1) return undefined;
        const [removed] = this.connections.splice(index, 1);
        return removed;
      },
      findConnection: (serverName: string) => {
        return this.connections.find((c) => c.server.name === serverName);
      },
    };
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
      // Set up config change handler
      const changeHandler: McpConfigChangeHandler = {
        onConfigReload: async (globalConfig, projectConfig) => {
          // Merge configurations (project overrides global)
          const mergedServers = {
            ...(globalConfig?.mcpServers || {}),
            ...(projectConfig?.mcpServers || {}),
          };

          // Apply incremental updates
          await this.updateServerConnections(mergedServers);

          this.emitEvent("config:reloaded", { serverCount: Object.keys(mergedServers).length });
        },
      };
      this.configManager.setChangeHandler(changeHandler);

      // Start watching config files
      await this.configManager.startWatching();

      // Read and validate global config
      const globalPath = await this.getMcpServersPath();
      const globalConfig = await this.configManager.readAndValidate(globalPath);

      // Read and validate project config if available
      let projectConfig: ConfigReadResult = { success: true, data: { mcpServers: {} } };
      if (this.projectConfigPath) {
        const projectPath = await this.projectConfigPath();
        if (projectPath) {
          projectConfig = await this.configManager.readAndValidate(projectPath);
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

    // Stop config watching (handles its own cleanup)
    await this.configManager.stopWatching();

    // Dispose OAuth manager
    this.oauthManager?.dispose();
    this.oauthManager = undefined;

    // Dispose server registry (clears UID mappings)
    this.registry.dispose();
    McpHub.sharedRegistry = undefined;

    // Dispose lifecycle manager (closes source file watchers)
    await this.lifecycle.dispose();

    // Close all connections via lifecycle
    const disconnectPromises = this.connections.map((conn) =>
      this.lifecycle.deleteConnection(conn.server.name)
    );
    await Promise.allSettled(disconnectPromises);

    this.connections = [];
  }

  // ============================================
  // T009: Config File Reading - Delegated to McpConfigManager
  // ============================================

  /**
   * Read and validate an MCP settings file.
   * Delegates to McpConfigManager for actual implementation.
   *
   * @param filePath - Absolute path to the configuration file
   * @returns Validation result with parsed data or error
   */
  async readAndValidateMcpSettingsFile(filePath: string): Promise<ConfigReadResult> {
    return this.configManager.readAndValidate(filePath);
  }

  // ============================================
  // T010: Server Connection - Delegated to McpServerLifecycle
  // ============================================

  /**
   * Connect to a single MCP server.
   * Delegates to McpServerLifecycle.
   *
   * @param name - Server name from configuration
   * @param config - Server configuration
   */
  private async connectToServer(name: string, config: McpServerConfig): Promise<void> {
    await this.lifecycle.connectToServer(name, config);
  }

  // ============================================
  // T011: Connection Cleanup - Delegated to McpServerLifecycle
  // ============================================

  /**
   * Delete a connection and clean up resources.
   * Delegates to McpServerLifecycle but also handles tool unregistration.
   *
   * @param name - Server name to disconnect
   */
  async deleteConnection(name: string): Promise<void> {
    // Unregister tools from ToolRegistry if available (before lifecycle cleanup)
    const connection = this.connections.find((c) => c.server.name === name);
    if (this.toolRegistry && connection?.server.uid) {
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

    // Delegate to lifecycle for actual cleanup
    await this.lifecycle.deleteConnection(name);
  }

  // ============================================
  // T012: Connection Restart - Delegated to McpServerLifecycle
  // ============================================

  /**
   * Restart a connection by disconnecting and reconnecting.
   * Delegates to McpServerLifecycle.
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

    // Delegate to lifecycle
    await this.lifecycle.restartConnection(serverName, config);
  }

  // ============================================
  // T013: Config File Watching - Delegated to McpConfigManager
  // ============================================

  // Config watching is now handled by McpConfigManager.
  // See initialize() for handler setup.

  // ============================================
  // T014: Incremental Server Updates
  // ============================================

  /**
   * Update server connections incrementally based on new configuration.
   * Identifies added, removed, and modified servers.
   * Delegates to McpIncrementalUpdater.
   *
   * @param newServers - New server configuration map
   */
  async updateServerConnections(newServers: Record<string, McpServerConfig>): Promise<void> {
    const provider = {
      getConnections: () => this.connections,
      findConnection: (name: string) => this.connections.find((c) => c.server.name === name),
    };

    const callbacks = {
      connectToServer: (name: string, config: McpServerConfig) =>
        this.connectToServer(name, config),
      deleteConnection: (name: string) => this.deleteConnection(name),
    };

    await this.updater.updateConnections(provider, callbacks, newServers);
  }

  /**
   * Check if config changes require a connection restart.
   * Only returns true for connection-affecting properties.
   * Delegates to McpIncrementalUpdater.
   *
   * @param oldConfig - Previous configuration
   * @param newConfig - New configuration
   * @returns True if restart is required
   */
  configsRequireRestart(oldConfig: McpServerConfig, newConfig: McpServerConfig): boolean {
    return this.updater.configsRequireRestart(oldConfig, newConfig);
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
    return this.registry.getOrCreateUid(serverName);
  }

  /**
   * Look up a server name by its UID.
   *
   * @param uid - Server UID to look up
   * @returns Server name or undefined if not found
   */
  static getMcpServerByKey(uid: string): string | undefined {
    return McpHub.sharedRegistry?.getServerName(uid);
  }

  /**
   * Get all registered server UIDs.
   *
   * @returns Map of server names to UIDs
   */
  static getAllServerKeys(): ReadonlyMap<string, string> {
    return McpHub.sharedRegistry?.getAllUids() ?? new Map();
  }

  // ============================================
  // Public API: Server Access (ConnectionProvider Implementation)
  // ============================================

  /**
   * Get all active connections.
   * Part of ConnectionProvider interface.
   *
   * @returns Array of connections
   */
  getConnections(): McpConnection[] {
    return this.connections;
  }

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
  // Public API: Tool Operations (Delegated to McpCapabilityDiscovery)
  // ============================================

  /**
   * T023: Call a tool on a specific server.
   * Delegates to McpCapabilityDiscovery.
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
    return this.capabilityDiscovery.callTool(serverName, toolName, args);
  }

  /**
   * Get all available tools across all connected servers.
   * Delegates to McpCapabilityDiscovery.
   *
   * @returns Array of tools with server name prefixed
   */
  getAllTools(): Array<McpTool & { serverName: string; serverUid: string }> {
    return this.capabilityDiscovery.getAllTools();
  }

  /**
   * T022: Fetch tools list from a specific server.
   * Delegates to McpCapabilityDiscovery.
   *
   * @param serverName - Server to fetch tools from
   * @returns Array of tools from the server
   * @throws McpToolError if server is disabled or not connected
   */
  async fetchToolsList(serverName: string): Promise<McpTool[]> {
    return this.capabilityDiscovery.fetchToolsList(serverName);
  }

  // ============================================
  // Public API: Resource Operations (Delegated to McpCapabilityDiscovery)
  // ============================================

  /**
   * T024: Read a resource from a server.
   * Delegates to McpCapabilityDiscovery.
   *
   * @param serverName - Server to read resource from
   * @param uri - Resource URI
   * @returns Resource response with content
   * @throws McpConnectionError if server is disabled, not connected, or read fails
   */
  async readResource(serverName: string, uri: string): Promise<McpResourceResponse> {
    return this.capabilityDiscovery.readResource(serverName, uri);
  }

  /**
   * Get all available resources across all connected servers.
   * Delegates to McpCapabilityDiscovery.
   *
   * @returns Array of resources with server name
   */
  getAllResources(): Array<McpResource & { serverName: string }> {
    return this.capabilityDiscovery.getAllResources();
  }

  /**
   * T024: Fetch resources list from a specific server.
   * Delegates to McpCapabilityDiscovery.
   *
   * @param serverName - Server to fetch resources from
   * @returns Array of resources from the server
   * @throws McpConnectionError if server is not found or not connected
   */
  async fetchResourcesList(serverName: string): Promise<McpResource[]> {
    return this.capabilityDiscovery.fetchResourcesList(serverName);
  }

  // ============================================
  // Public API: Prompt Operations (Delegated to McpCapabilityDiscovery)
  // ============================================

  /**
   * T025: List prompts from a server.
   * Delegates to McpCapabilityDiscovery.
   *
   * @param serverName - Server to list prompts from
   * @returns Array of prompts
   * @throws McpConnectionError if server is disabled or not connected
   */
  async listPrompts(serverName: string): Promise<McpPrompt[]> {
    return this.capabilityDiscovery.listPrompts(serverName);
  }

  /**
   * T025: Get a specific prompt from a server and execute it.
   * Delegates to McpCapabilityDiscovery.
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
    return this.capabilityDiscovery.getPrompt(serverName, promptName, args);
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
