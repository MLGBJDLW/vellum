/**
 * LSP Integration Module
 *
 * Provides LSP (Language Server Protocol) integration for the CLI.
 * Initializes the LspHub, registers LSP tools with the tool registry,
 * and provides graceful fallback when language servers are unavailable.
 *
 * @module cli/tui/lsp-integration
 */

import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  createLspTools,
  type LspHub,
  LspHub as LspHubClass,
  registerLspTools,
  type ToolRegistryLike,
  unregisterLspTools,
} from "@vellum/lsp";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for LSP integration initialization
 */
export interface LspIntegrationOptions {
  /**
   * Workspace root directory for project-local LSP configuration.
   * @default process.cwd()
   */
  workspaceRoot?: string;

  /**
   * Tool registry to register LSP tools with.
   * If provided, LSP tools will be automatically registered.
   */
  toolRegistry?: ToolRegistryLike;

  /**
   * Whether to automatically install missing language servers.
   * @default false
   */
  autoInstall?: boolean;

  /**
   * Callback for LSP events (server start/stop, errors, etc.)
   */
  onEvent?: (event: string, data: unknown) => void;

  /**
   * Logger for LSP operations
   */
  logger?: {
    debug?: (message: string, meta?: Record<string, unknown>) => void;
    info?: (message: string, meta?: Record<string, unknown>) => void;
    warn?: (message: string, meta?: Record<string, unknown>) => void;
    error?: (message: string, meta?: Record<string, unknown>) => void;
  };

  /**
   * Maximum number of concurrent language servers.
   * @default 5
   */
  maxConcurrentServers?: number;

  /**
   * Idle timeout before stopping unused servers (ms).
   * @default 300000 (5 minutes)
   */
  idleTimeoutMs?: number;
}

/**
 * Result of LSP integration initialization
 */
export interface LspIntegrationResult {
  /** The initialized LspHub instance (null if initialization failed) */
  hub: LspHub | null;

  /** Number of LSP tools registered */
  toolCount: number;

  /** Whether initialization was successful */
  success: boolean;

  /** Error message if initialization failed */
  error?: string;

  /** Available language server IDs */
  availableServers: string[];
}

/**
 * LSP integration state
 */
export interface LspIntegrationState {
  /** Whether LSP is initialized */
  initialized: boolean;

  /** Currently running server IDs */
  runningServers: string[];

  /** Tool registration status */
  toolsRegistered: boolean;
}

/**
 * Events emitted by LspIntegrationManager
 */
export interface LspManagerEvents {
  /** Emitted when LSP state changes (server start/stop/error, etc.) */
  "state:changed": [];
  /** Emitted when a server's status changes */
  "server:status": [serverId: string, status: string];
  /** Emitted when diagnostics are updated */
  "diagnostics:updated": [serverId: string, uri: string];
  /** Emitted when config is reloaded */
  "config:reloaded": [serverIds: string[]];
}

// =============================================================================
// LSP Integration Manager
// =============================================================================

/**
 * Manages LSP integration lifecycle
 *
 * Provides methods to initialize, configure, and dispose of LSP services.
 * Handles graceful degradation when language servers are unavailable.
 *
 * @example
 * ```typescript
 * const lspManager = new LspIntegrationManager();
 *
 * const result = await lspManager.initialize({
 *   workspaceRoot: process.cwd(),
 *   toolRegistry: registry,
 *   autoInstall: true,
 * });
 *
 * if (result.success) {
 *   console.log(`LSP initialized with ${result.toolCount} tools`);
 * }
 *
 * // Later: cleanup
 * await lspManager.dispose();
 * ```
 */
export class LspIntegrationManager extends EventEmitter {
  private hub: LspHub | null = null;
  private toolRegistry: ToolRegistryLike | null = null;
  private initialized = false;
  private options: LspIntegrationOptions = {};

  constructor() {
    super();
    // Set a reasonable max listeners to avoid memory leak warnings
    this.setMaxListeners(20);
  }

  /**
   * Type-safe event emission for LSP manager events
   */
  emitStateChanged(): void {
    this.emit("state:changed");
  }

  /**
   * Type-safe listener registration for state changes
   */
  onStateChanged(listener: () => void): this {
    return this.on("state:changed", listener);
  }

  /**
   * Type-safe listener removal for state changes
   */
  offStateChanged(listener: () => void): this {
    return this.off("state:changed", listener);
  }

  /**
   * Initialize LSP integration
   *
   * @param options - Initialization options
   * @returns Initialization result
   */
  async initialize(options: LspIntegrationOptions = {}): Promise<LspIntegrationResult> {
    this.options = options;
    const workspaceRoot = options.workspaceRoot ?? process.cwd();

    try {
      // Create LspHub instance with event forwarding
      this.hub = LspHubClass.getInstance({
        getGlobalConfigPath: async () => join(homedir(), ".vellum", "lsp.json"),
        getProjectConfigPath: async () => join(resolve(workspaceRoot), ".vellum", "lsp.json"),
        toolRegistry: options.toolRegistry,
        onEvent: (event, data) => {
          // Emit state:changed for any LSP event to trigger UI refresh
          this.emitStateChanged();

          // Emit typed events for specific event types
          if (
            event === "server:starting" ||
            event === "server:running" ||
            event === "server:stopped" ||
            event === "server:error"
          ) {
            const serverData = data as { serverId: string };
            this.emit("server:status", serverData.serverId, event.replace("server:", ""));
          } else if (event === "diagnostics:updated") {
            const diagData = data as { serverId: string; uri: string };
            this.emit("diagnostics:updated", diagData.serverId, diagData.uri);
          } else if (event === "config:reloaded") {
            const configData = data as { serverIds: string[] };
            this.emit("config:reloaded", configData.serverIds);
          }

          // Forward to user-provided callback if present
          options.onEvent?.(event, data);
        },
        logger: options.logger,
        autoInstall: options.autoInstall ?? false,
        idleTimeoutMs: options.idleTimeoutMs ?? 300000,
        maxRestartAttempts: 3,
      });

      // Initialize the hub
      await this.hub.initialize();

      // Get available servers
      const servers = this.hub.getServers();
      const availableServers = servers.map((s) => s.id);

      // Register tools if registry provided
      let toolCount = 0;
      if (options.toolRegistry) {
        this.toolRegistry = options.toolRegistry;
        toolCount = registerLspTools(options.toolRegistry, this.hub);
      }

      this.initialized = true;

      return {
        hub: this.hub,
        toolCount,
        success: true,
        availableServers,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Log the error but don't fail - LSP is optional
      options.logger?.warn?.("LSP initialization failed (non-critical)", {
        error: errorMessage,
      });

      return {
        hub: null,
        toolCount: 0,
        success: false,
        error: errorMessage,
        availableServers: [],
      };
    }
  }

  /**
   * Get the current integration state
   */
  getState(): LspIntegrationState {
    if (!this.hub || !this.initialized) {
      return {
        initialized: false,
        runningServers: [],
        toolsRegistered: false,
      };
    }

    const servers = this.hub.getServers();
    const runningServers = servers.filter((s) => s.status.status === "running").map((s) => s.id);

    return {
      initialized: true,
      runningServers,
      toolsRegistered: this.toolRegistry !== null,
    };
  }

  /**
   * Get the LspHub instance
   *
   * @returns LspHub instance or null if not initialized
   */
  getHub(): LspHub | null {
    return this.hub;
  }

  /**
   * Get LSP tools without auto-registration
   *
   * @returns Array of LSP tool definitions, or empty array if not initialized
   */
  getTools(): unknown[] {
    if (!this.hub) {
      return [];
    }
    return createLspTools(this.hub);
  }

  /**
   * Start a specific language server
   *
   * @param serverId - Language server ID (e.g., "typescript", "python")
   * @param workspaceRoot - Optional workspace root override
   * @returns Whether the server started successfully
   */
  async startServer(serverId: string, workspaceRoot?: string): Promise<boolean> {
    if (!this.hub) {
      return false;
    }

    try {
      await this.hub.startServer(serverId, workspaceRoot);
      return true;
    } catch (error) {
      this.options.logger?.warn?.(`Failed to start LSP server: ${serverId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Stop a specific language server
   *
   * @param serverId - Language server ID
   * @returns Whether the server stopped successfully
   */
  async stopServer(serverId: string): Promise<boolean> {
    if (!this.hub) {
      return false;
    }

    try {
      await this.hub.stopServer(serverId);
      return true;
    } catch (error) {
      this.options.logger?.warn?.(`Failed to stop LSP server: ${serverId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Dispose of all LSP resources
   *
   * Stops all running servers and unregisters tools.
   */
  async dispose(): Promise<void> {
    // Unregister tools
    if (this.toolRegistry) {
      unregisterLspTools(this.toolRegistry);
      this.toolRegistry = null;
    }

    // Dispose hub
    if (this.hub) {
      try {
        await this.hub.dispose();
      } catch {
        // Ignore dispose errors
      }
      this.hub = null;
    }

    this.initialized = false;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let globalManager: LspIntegrationManager | null = null;

/**
 * Get or create the global LSP integration manager
 */
export function getLspManager(): LspIntegrationManager {
  if (!globalManager) {
    globalManager = new LspIntegrationManager();
  }
  return globalManager;
}

/**
 * Initialize LSP integration with the global manager
 *
 * @param options - Initialization options
 * @returns Initialization result
 */
export async function initializeLsp(
  options: LspIntegrationOptions = {}
): Promise<LspIntegrationResult> {
  return getLspManager().initialize(options);
}

/**
 * Dispose of the global LSP manager
 */
export async function disposeLsp(): Promise<void> {
  if (globalManager) {
    await globalManager.dispose();
    globalManager = null;
  }
}

// =============================================================================
// React Hook (for use in components)
// =============================================================================

/**
 * LSP hook state
 */
export interface UseLspState {
  /** Whether LSP is initialized */
  initialized: boolean;

  /** Whether LSP is loading */
  loading: boolean;

  /** Error message if initialization failed */
  error: string | null;

  /** Number of registered LSP tools */
  toolCount: number;

  /** Available language servers */
  availableServers: string[];

  /** Currently running servers */
  runningServers: string[];
}

/**
 * LSP hook actions
 */
export interface UseLspActions {
  /** Start a language server */
  startServer: (serverId: string) => Promise<boolean>;

  /** Stop a language server */
  stopServer: (serverId: string) => Promise<boolean>;

  /** Refresh LSP state */
  refresh: () => void;
}

/**
 * LSP hook return type
 */
export type UseLspReturn = UseLspState & UseLspActions;

// Note: The actual React hook implementation would go in a separate file
// under hooks/ to avoid importing React in this module.
// This module provides the core integration logic that can be used
// both in React components (via a hook wrapper) and in non-React code.
