// ============================================
// McpIncrementalUpdater - Incremental Server Update Logic
// ============================================

import { DEFAULT_MCP_TIMEOUT_SECONDS } from "./constants.js";
import type { McpServerLifecycle } from "./McpServerLifecycle.js";
import type { McpServerRegistry } from "./McpServerRegistry.js";
import type { McpConnection, McpServerConfig, McpStdioConfig } from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Categorized server changes for incremental updates.
 */
export interface ServerChanges {
  /** Server names to remove */
  toRemove: string[];
  /** Server names to restart with new config */
  toRestart: string[];
  /** Server names to add */
  toAdd: string[];
}

/**
 * Configuration options for McpIncrementalUpdater.
 */
export interface UpdaterOptions {
  /** Lifecycle manager for connection operations */
  lifecycle: McpServerLifecycle;
  /** Registry for UID management */
  registry: McpServerRegistry;
}

/**
 * Interface for accessing connections.
 * McpHub implements this to provide connection access.
 */
export interface ConnectionProvider {
  /** Get all active connections */
  getConnections(): McpConnection[];
  /** Find a connection by server name */
  findConnection(serverName: string): McpConnection | undefined;
}

/**
 * Callbacks for connection operations.
 * These are provided by McpHub to handle connection state changes.
 */
export interface ConnectionCallbacks {
  /** Connect to a server */
  connectToServer: (name: string, config: McpServerConfig) => Promise<void>;
  /** Delete a connection */
  deleteConnection: (name: string) => Promise<void>;
}

// ============================================
// McpIncrementalUpdater Class
// ============================================

/**
 * McpIncrementalUpdater - Handles incremental server configuration updates.
 *
 * Provides:
 * - Diff calculation between current and new server configurations
 * - Categorization of changes into add/remove/restart
 * - Ordered application of changes (remove → restart → add)
 * - Deep comparison of configuration values
 *
 * @example
 * ```typescript
 * const updater = new McpIncrementalUpdater({
 *   lifecycle,
 *   registry,
 *   emitEvent: (event, data) => hub.emitEvent(event, data),
 * });
 *
 * await updater.updateConnections(
 *   connectionProvider,
 *   callbacks,
 *   newServerConfig
 * );
 * ```
 */
export class McpIncrementalUpdater {
  private readonly lifecycle: McpServerLifecycle;
  private readonly registry: McpServerRegistry;

  /**
   * Creates a new McpIncrementalUpdater instance.
   *
   * @param options - Configuration options
   */
  constructor(options: UpdaterOptions) {
    this.lifecycle = options.lifecycle;
    this.registry = options.registry;
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Update server connections incrementally based on new configuration.
   * Identifies added, removed, and modified servers.
   *
   * @param provider - Connection provider for current state
   * @param callbacks - Callbacks for connection operations
   * @param newServers - New server configuration map
   */
  async updateConnections(
    provider: ConnectionProvider,
    callbacks: ConnectionCallbacks,
    newServers: Record<string, McpServerConfig>
  ): Promise<void> {
    const currentServerNames = new Set(provider.getConnections().map((c) => c.server.name));
    const newServerNames = new Set(Object.keys(newServers));

    // Identify changes
    const changes = this.categorizeChanges(
      provider,
      currentServerNames,
      newServerNames,
      newServers
    );

    // Apply changes in order: remove → restart → add
    await this.applyRemovals(changes.toRemove, callbacks);
    await this.applyRestarts(changes.toRestart, newServers, callbacks);
    await this.applyAdditions(changes.toAdd, newServers, callbacks);
  }

  /**
   * Categorize servers into add/remove/restart based on config changes.
   *
   * @param provider - Connection provider for current state
   * @param currentNames - Set of current server names
   * @param newNames - Set of new server names
   * @param newServers - New server configuration map
   * @returns Categorized changes
   */
  categorizeChanges(
    provider: ConnectionProvider,
    currentNames: Set<string>,
    newNames: Set<string>,
    newServers: Record<string, McpServerConfig>
  ): ServerChanges {
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

      const connection = provider.findConnection(name);
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
  // Private: Apply Changes
  // ============================================

  /**
   * Remove servers and clean up their UID mappings.
   */
  private async applyRemovals(names: string[], callbacks: ConnectionCallbacks): Promise<void> {
    for (const name of names) {
      await callbacks.deleteConnection(name);
      // T036: Clean up source file watcher via lifecycle
      await this.lifecycle.cleanupSourceFileWatcher(name);
      // Clean up UID mapping via registry
      this.registry.remove(name);
    }
  }

  /**
   * Restart servers with new config.
   */
  private async applyRestarts(
    names: string[],
    servers: Record<string, McpServerConfig>,
    callbacks: ConnectionCallbacks
  ): Promise<void> {
    for (const name of names) {
      await callbacks.deleteConnection(name);
      const config = servers[name];
      if (config) {
        await callbacks.connectToServer(name, config);
      }
    }
  }

  /**
   * Add new servers.
   */
  private async applyAdditions(
    names: string[],
    servers: Record<string, McpServerConfig>,
    callbacks: ConnectionCallbacks
  ): Promise<void> {
    for (const name of names) {
      const config = servers[name];
      if (config) {
        await callbacks.connectToServer(name, config);
      }
    }
  }

  // ============================================
  // Private: Config Comparison Utilities
  // ============================================

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
}

export default McpIncrementalUpdater;
