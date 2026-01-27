// ============================================
// McpServerLifecycle - Connection Lifecycle Management
// ============================================

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { type FSWatcher, watch } from "chokidar";
import { DEFAULT_MCP_TIMEOUT_SECONDS, MCP_CLIENT_NAME } from "./constants.js";
import { McpConnectionError } from "./errors.js";
import type { McpCapabilityDiscovery } from "./McpCapabilityDiscovery.js";
import type { McpOAuthManager } from "./McpOAuthManager.js";
import type { McpServerRegistry } from "./McpServerRegistry.js";
import type {
  McpConnection,
  McpHubEvents,
  McpServer,
  McpServerConfig,
  McpStdioConfig,
} from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Configuration options for McpServerLifecycle initialization.
 */
export interface LifecycleOptions {
  /** Server registry for UID management */
  registry: McpServerRegistry;
  /** Capability discovery for post-connect setup */
  capabilityDiscovery: McpCapabilityDiscovery;
  /** OAuth manager for authentication (optional) */
  oauthManager?: McpOAuthManager;
  /** Protocol version string for client handshake */
  protocolVersion: string;
  /** Event emitter callback */
  emitEvent?: <K extends keyof McpHubEvents>(event: K, data: McpHubEvents[K]) => void;
}

/**
 * Interface for accessing connection storage.
 * McpHub provides this to allow lifecycle to manage connections.
 */
export interface ConnectionStore {
  /** Get the connections array */
  getConnections(): McpConnection[];
  /** Add a connection */
  addConnection(connection: McpConnection): void;
  /** Remove a connection by name, returns the removed connection */
  removeConnection(serverName: string): McpConnection | undefined;
  /** Find a connection by name */
  findConnection(serverName: string): McpConnection | undefined;
}

// ============================================
// McpServerLifecycle Class
// ============================================

/**
 * McpServerLifecycle - Manages MCP server connection lifecycle.
 *
 * Provides:
 * - Connection establishment and transport creation
 * - Connection restart and cleanup
 * - Source file watching for auto-restart (stdio servers)
 * - Transport error and close handling
 *
 * @example
 * ```typescript
 * const lifecycle = new McpServerLifecycle({
 *   registry,
 *   capabilityDiscovery,
 *   protocolVersion: '1.0.0',
 *   emitEvent: (event, data) => hub.emitEvent(event, data),
 * });
 *
 * lifecycle.setConnectionStore(store);
 * await lifecycle.connectToServer('myServer', config);
 * await lifecycle.restartConnection('myServer', config);
 * await lifecycle.deleteConnection('myServer');
 * await lifecycle.dispose();
 * ```
 */
export class McpServerLifecycle {
  private readonly registry: McpServerRegistry;
  private readonly capabilityDiscovery: McpCapabilityDiscovery;
  private readonly oauthManager?: McpOAuthManager;
  private readonly protocolVersion: string;
  private readonly emitEvent?: LifecycleOptions["emitEvent"];

  /** Source file watchers for stdio servers (build/index.js pattern) */
  private readonly sourceFileWatchers = new Map<string, FSWatcher>();

  /** Connection store set by McpHub */
  private connectionStore?: ConnectionStore;

  /** Whether the lifecycle has been disposed */
  private isDisposed = false;

  constructor(options: LifecycleOptions) {
    this.registry = options.registry;
    this.capabilityDiscovery = options.capabilityDiscovery;
    this.oauthManager = options.oauthManager;
    this.protocolVersion = options.protocolVersion;
    this.emitEvent = options.emitEvent;
  }

  /**
   * Set the connection store (called by McpHub after construction).
   * This allows the lifecycle manager to access and modify the connections array.
   */
  setConnectionStore(store: ConnectionStore): void {
    this.connectionStore = store;
  }

  // ============================================
  // Connection Management
  // ============================================

  /**
   * Connect to a single MCP server.
   * Creates transport, establishes connection, and discovers capabilities.
   *
   * @param name - Server name from configuration
   * @param config - Server configuration
   * @returns The created connection
   */
  async connectToServer(name: string, config: McpServerConfig): Promise<McpConnection> {
    if (!this.connectionStore) {
      throw new McpConnectionError("Connection store not initialized", name);
    }

    // Check if server is disabled
    if (config.disabled) {
      const server: McpServer = {
        name,
        config: JSON.stringify(config),
        statusInfo: { status: "disabled" },
        disabled: true,
        uid: this.registry.getOrCreateUid(name),
        toolFilter: this.capabilityDiscovery.extractToolFilter(config),
      };

      // Add as a placeholder connection (no client/transport)
      const connection: McpConnection = {
        server,
        client: null as unknown as Client,
        transport: null as unknown as McpConnection["transport"],
      };

      this.connectionStore.addConnection(connection);
      return connection;
    }

    // Create server entry with connecting status
    const server: McpServer = {
      name,
      config: JSON.stringify(config),
      statusInfo: { status: "connecting" },
      timeout: config.timeout ?? DEFAULT_MCP_TIMEOUT_SECONDS,
      uid: this.registry.getOrCreateUid(name),
      toolFilter: this.capabilityDiscovery.extractToolFilter(config),
    };

    this.emit("server:status", { serverName: name, status: server.statusInfo });

    try {
      // Create transport based on config type
      const transport = await this.createTransport(name, config);

      // Create MCP client
      const client = new Client(
        { name: MCP_CLIENT_NAME, version: this.protocolVersion },
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
      await this.capabilityDiscovery.discoverServerCapabilities(connection);

      // Update status to connected
      connection.server.statusInfo = { status: "connected" };

      // Add to connections
      this.connectionStore.addConnection(connection);

      this.emit("server:status", { serverName: name, status: { status: "connected" } });
      this.emit("server:connected", {
        serverName: name,
        tools: connection.server.tools || [],
        resources: connection.server.resources || [],
      });

      return connection;
    } catch (error) {
      // Set status to failed
      const errorMessage = error instanceof Error ? error.message : String(error);
      server.statusInfo = { status: "failed", error: errorMessage };

      // Add failed connection to track status
      const failedConnection: McpConnection = {
        server,
        client: null as unknown as Client,
        transport: null as unknown as McpConnection["transport"],
      };
      this.connectionStore.addConnection(failedConnection);

      this.emit("server:status", { serverName: name, status: server.statusInfo });
      this.emit("server:error", {
        serverName: name,
        error: error instanceof Error ? error : new Error(errorMessage),
      });

      return failedConnection;
    }
  }

  /**
   * Restart a server connection.
   *
   * @param serverName - Name of the server to restart
   * @param serverConfig - Server configuration (for reconnect)
   * @throws McpConnectionError if server not found
   */
  async restartConnection(serverName: string, serverConfig: McpServerConfig): Promise<void> {
    if (!this.connectionStore) {
      throw new McpConnectionError("Connection store not initialized", serverName);
    }

    const connection = this.connectionStore.findConnection(serverName);

    if (!connection) {
      throw new McpConnectionError(`Server "${serverName}" not found`, serverName);
    }

    // Update status to connecting
    connection.server.statusInfo = { status: "connecting" };
    this.emit("server:status", { serverName, status: { status: "connecting" } });

    // Delete the existing connection
    await this.deleteConnection(serverName);

    // Reconnect with the provided config
    await this.connectToServer(serverName, serverConfig);
  }

  /**
   * Delete a connection and clean up resources.
   * Closes transport and removes from connections.
   *
   * @param serverName - Server name to disconnect
   */
  async deleteConnection(serverName: string): Promise<void> {
    if (!this.connectionStore) {
      return;
    }

    const connection = this.connectionStore.removeConnection(serverName);

    if (!connection) {
      return;
    }

    // Close transport if it exists and has close method
    if (connection.transport && typeof connection.transport.close === "function") {
      try {
        await connection.transport.close();
      } catch (error) {
        // Log but don't throw - best effort cleanup
        console.warn(`Error closing transport for ${serverName}:`, error);
      }
    }

    // Close client if it exists
    if (connection.client && typeof connection.client.close === "function") {
      try {
        await connection.client.close();
      } catch (error) {
        console.warn(`Error closing client for ${serverName}:`, error);
      }
    }

    this.emit("server:disconnected", { serverName });
  }

  /**
   * Dispose of all lifecycle resources.
   * Closes all source file watchers.
   */
  async dispose(): Promise<void> {
    this.isDisposed = true;

    // Close all source file watchers
    for (const [, watcher] of this.sourceFileWatchers) {
      await watcher.close();
    }
    this.sourceFileWatchers.clear();
  }

  // ============================================
  // Transport Creation
  // ============================================

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

      case "sse": {
        const sseConfig = config as import("./types.js").McpSseConfig;
        const { createSSETransport } = await import("./transports/SSEAdapter.js");
        const { transport } = await createSSETransport(sseConfig, {
          serverName: name,
          authProvider: this.oauthManager?.getProvider(name, sseConfig.url),
        });
        return transport;
      }

      case "streamableHttp": {
        const httpConfig = config as import("./types.js").McpStreamableHttpConfig;
        const { createStreamableHttpTransport } = await import(
          "./transports/StreamableHttpAdapter.js"
        );
        const { transport } = await createStreamableHttpTransport(httpConfig, {
          serverName: name,
          authProvider: this.oauthManager?.getProvider(name, httpConfig.url),
        });
        return transport;
      }

      case "websocket": {
        const wsConfig = config as import("./types.js").McpWebSocketConfig;
        const { createWebSocketTransport } = await import("./transports/WebSocketAdapter.js");
        const { transport } = await createWebSocketTransport(wsConfig, {
          serverName: name,
        });
        return transport;
      }

      case "remote": {
        const remoteConfig = config as import("./types.js").McpRemoteConfig;
        const { createRemoteTransport } = await import("./transports/FallbackTransport.js");
        const { transport } = await createRemoteTransport(remoteConfig, {
          serverName: name,
          authProvider: this.oauthManager?.getProvider(name, remoteConfig.url),
        });
        return transport;
      }

      default:
        throw new McpConnectionError(`Unknown transport type: ${configType}`, name);
    }
  }

  // ============================================
  // Transport Event Handlers
  // ============================================

  /**
   * Handle transport error.
   */
  private handleTransportError(serverName: string, error: Error): void {
    const connection = this.connectionStore?.findConnection(serverName);
    if (connection) {
      connection.server.statusInfo = { status: "failed", error: error.message };
      this.emit("server:status", { serverName, status: connection.server.statusInfo });
      this.emit("server:error", { serverName, error });
    }
  }

  /**
   * Handle transport close.
   */
  private handleTransportClose(serverName: string): void {
    const connection = this.connectionStore?.findConnection(serverName);
    if (connection && connection.server.statusInfo.status !== "failed") {
      connection.server.statusInfo = { status: "disconnected" };
      this.emit("server:status", { serverName, status: { status: "disconnected" } });
      this.emit("server:disconnected", { serverName });
    }
  }

  // ============================================
  // Source File Watching (T036)
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

    this.emit("server:status", {
      serverName,
      status: { status: "connecting" },
    });

    // Get the current config from the connection
    const connection = this.connectionStore?.findConnection(serverName);
    if (!connection) {
      return;
    }

    const config = JSON.parse(connection.server.config) as McpServerConfig;

    // Restart the server
    this.restartConnection(serverName, config).catch((error) => {
      console.error(`Failed to restart server "${serverName}" after source file change:`, error);
    });
  }

  /**
   * Clean up source file watcher for a server.
   *
   * @param serverName - Name of the server
   */
  async cleanupSourceFileWatcher(serverName: string): Promise<void> {
    const watcher = this.sourceFileWatchers.get(serverName);
    if (watcher) {
      await watcher.close();
      this.sourceFileWatchers.delete(serverName);
    }
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Emit an event if emitter is configured.
   */
  private emit<K extends keyof McpHubEvents>(event: K, data: McpHubEvents[K]): void {
    if (this.emitEvent) {
      this.emitEvent(event, data);
    }
  }
}

export default McpServerLifecycle;
